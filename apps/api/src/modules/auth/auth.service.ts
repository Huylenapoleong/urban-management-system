import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthSessionInfo,
  AuthenticatedUser,
  JwtClaims,
} from '@urban/shared-types';
import type { OtpPurpose } from '@urban/shared-constants';
import {
  createUlid,
  normalizeEmail,
  normalizePhone,
  nowIso,
} from '@urban/shared-utils';
import {
  ensureLocationCode,
  ensureObject,
  optionalString,
  requirePhoneOrEmail,
  requiredString,
} from '../../common/validation';
import { JwtTokenService } from '../../infrastructure/security/jwt-token.service';
import { ObservabilityService } from '../../infrastructure/observability/observability.service';
import {
  PasswordPolicyService,
  type PasswordPolicyProfile,
} from '../../infrastructure/security/password-policy.service';
import { PasswordService } from '../../infrastructure/security/password.service';
import {
  toAuthenticatedUser,
  toAuthSessionInfo,
  toUserProfile,
} from '../../common/mappers';
import type { StoredUser } from '../../common/storage-records';
import { UsersService } from '../users/users.service';
import { RefreshSessionService } from '../../infrastructure/security/refresh-session.service';
import { ChatRealtimeService } from '../conversations/chat-realtime.service';
import type { SessionClientMetadata } from '../../common/request-session-metadata';
import { AuthOtpService } from '../../infrastructure/security/auth-otp.service';
import { UrbanTableRepository } from '../../infrastructure/dynamodb/urban-table.repository';
import { AppConfigService } from '../../infrastructure/config/app-config.service';
import type { StoredAuthIdentityAttempt } from '../../common/storage-records';
import { MediaAssetService } from '../../infrastructure/storage/media-asset.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly authOtpService: AuthOtpService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly passwordService: PasswordService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly refreshSessionService: RefreshSessionService,
    private readonly chatRealtimeService: ChatRealtimeService,
    private readonly observabilityService: ObservabilityService,
    private readonly repository: UrbanTableRepository,
    private readonly mediaAssetService: MediaAssetService,
    private readonly config: AppConfigService,
  ) {}

  async register(payload: unknown, metadata?: SessionClientMetadata) {
    const body = ensureObject(payload);
    const identity = requirePhoneOrEmail(body);

    await this.assertRegisterAttemptsAllowed(identity);

    try {
      const user = await this.usersService.registerCitizen(payload);
      const storedUser = await this.usersService.getByIdOrThrow(user.id);
      const tokens = await this.issueTokenPairForUser(storedUser, metadata);
      await this.clearAuthAttempts('REGISTER', {
        identityType: identity.email ? 'EMAIL' : 'PHONE',
        identityValue: identity.email
          ? normalizeEmail(identity.email)
          : normalizePhone(identity.phone ?? ''),
      });

      return {
        tokens,
        user,
      };
    } catch (error) {
      await this.recordAuthAttemptFailure('REGISTER', {
        identityType: identity.email ? 'EMAIL' : 'PHONE',
        identityValue: identity.email
          ? normalizeEmail(identity.email)
          : normalizePhone(identity.phone ?? ''),
      });
      throw error;
    }
  }

  async requestRegisterOtp(payload: unknown) {
    const body = ensureObject(payload);
    const identity = requirePhoneOrEmail(body);
    const password = requiredString(body, 'password', {
      minLength: 10,
      maxLength: 100,
    });
    const fullName = requiredString(body, 'fullName', {
      minLength: 2,
      maxLength: 100,
    });
    const locationCode = ensureLocationCode(
      requiredString(body, 'locationCode'),
    );
    const avatarUrl = optionalString(body, 'avatarUrl', { maxLength: 500 });

    if (!identity.email) {
      throw new BadRequestException(
        'Email is required for OTP-based registration.',
      );
    }

    this.passwordPolicyService.validateOrThrow(
      password,
      {
        email: identity.email,
        phone: identity.phone,
        fullName,
      },
      'standard',
    );

    await this.assertIdentityAvailable(identity.phone, identity.email);
    await this.assertRegisterAttemptsAllowed(identity);
    const passwordHash = await this.passwordService.hashPassword(password);

    await this.authOtpService.upsertRegisterDraft({
      email: identity.email,
      phone: identity.phone,
      passwordHash,
      fullName,
      locationCode,
      avatarUrl,
    });
    const challenge = await this.authOtpService.requestOtp({
      purpose: 'REGISTER',
      email: identity.email,
    });
    await this.recordAuthAttemptFailure('REGISTER', {
      identityType: 'EMAIL',
      identityValue: normalizeEmail(identity.email),
    });

    return {
      otpRequested: true,
      purpose: challenge.purpose,
      maskedEmail: challenge.maskedEmail,
      expiresAt: challenge.expiresAt,
      resendAvailableAt: challenge.resendAvailableAt,
    };
  }

  async verifyRegisterOtp(payload: unknown, metadata?: SessionClientMetadata) {
    const body = ensureObject(payload);
    const email = normalizeEmail(
      requiredString(body, 'email', { minLength: 3, maxLength: 150 }),
    );
    const otpCode = requiredString(body, 'otpCode', {
      minLength: 4,
      maxLength: 12,
    });

    const draft = await this.authOtpService.getActiveRegisterDraft(email);

    if (!draft) {
      throw new BadRequestException(
        'Registration draft is invalid or expired. Please request OTP again.',
      );
    }

    await this.authOtpService.verifyOtp({
      purpose: 'REGISTER',
      email,
      otpCode,
    });
    const user = await this.usersService.registerCitizenWithPreparedInput({
      phone: draft.phone,
      email: draft.email,
      passwordHash: draft.passwordHash,
      fullName: draft.fullName,
      locationCode: draft.locationCode,
      avatarUrl: draft.avatarUrl,
    });
    const storedUser = await this.usersService.getByIdOrThrow(user.id);
    await this.authOtpService.consumeRegisterDraft(email);
    await this.clearAuthAttempts('REGISTER', {
      identityType: 'EMAIL',
      identityValue: email,
    });

    return {
      tokens: await this.issueTokenPairForUser(storedUser, metadata),
      user,
    };
  }

  async login(payload: unknown, metadata?: SessionClientMetadata) {
    const body = ensureObject(payload);
    const login = requiredString(body, 'login', {
      minLength: 3,
      maxLength: 150,
    });
    const password = requiredString(body, 'password', {
      minLength: 10,
      maxLength: 100,
    });
    this.passwordPolicyService.validateOrThrow(password, {}, 'standard');
    const identity = this.resolveIdentityFromLogin(login);
    await this.assertLoginAttemptsAllowed(identity);
    const user = login.includes('@')
      ? await this.usersService.findByEmail(normalizeEmail(login))
      : await this.usersService.findByPhone(normalizePhone(login));

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      await this.recordAuthAttemptFailure('LOGIN', identity);
      throw new UnauthorizedException('Invalid credentials.');
    }

    const validPassword = await this.passwordService.verifyPassword(
      password,
      user.passwordHash,
    );

    if (!validPassword) {
      await this.recordAuthAttemptFailure('LOGIN', identity);
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.clearAuthAttempts('LOGIN', identity);
    return {
      tokens: await this.issueTokenPairForUser(user, metadata),
      user: await this.serializeUserProfile(user),
    };
  }

  async requestLoginOtp(payload: unknown) {
    const body = ensureObject(payload);
    const login = requiredString(body, 'login', {
      minLength: 3,
      maxLength: 150,
    });
    const password = requiredString(body, 'password', {
      minLength: 10,
      maxLength: 100,
    });
    this.passwordPolicyService.validateOrThrow(password, {}, 'standard');
    const identity = this.resolveIdentityFromLogin(login);
    await this.assertLoginAttemptsAllowed(identity);
    const user = await this.resolveUserByLogin(login);

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      await this.recordAuthAttemptFailure('LOGIN', identity);
      throw new UnauthorizedException('Invalid credentials.');
    }

    const validPassword = await this.passwordService.verifyPassword(
      password,
      user.passwordHash,
    );

    if (!validPassword) {
      await this.recordAuthAttemptFailure('LOGIN', identity);
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.email) {
      throw new BadRequestException(
        'This account does not have an email for OTP delivery.',
      );
    }

    const challenge = await this.authOtpService.requestOtp({
      purpose: 'LOGIN',
      email: user.email,
      userId: user.userId,
    });

    await this.clearAuthAttempts('LOGIN', identity);
    return {
      otpRequested: true,
      purpose: challenge.purpose,
      maskedEmail: challenge.maskedEmail,
      expiresAt: challenge.expiresAt,
      resendAvailableAt: challenge.resendAvailableAt,
    };
  }

  async verifyLoginOtp(payload: unknown, metadata?: SessionClientMetadata) {
    const body = ensureObject(payload);
    const login = requiredString(body, 'login', {
      minLength: 3,
      maxLength: 150,
    });
    const otpCode = requiredString(body, 'otpCode', {
      minLength: 4,
      maxLength: 12,
    });
    const user = await this.resolveUserByLogin(login);

    if (!user || user.deletedAt || user.status !== 'ACTIVE' || !user.email) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.authOtpService.verifyOtp({
      purpose: 'LOGIN',
      email: user.email,
      otpCode,
      userId: user.userId,
    });

    return {
      tokens: await this.issueTokenPairForUser(user, metadata),
      user: await this.serializeUserProfile(user),
    };
  }

  async requestForgotPasswordOtp(payload: unknown) {
    const body = ensureObject(payload);
    const login = requiredString(body, 'login', {
      minLength: 3,
      maxLength: 150,
    });
    const user = await this.resolveUserByLogin(login);

    if (!user || user.deletedAt) {
      throw new NotFoundException('Tài khoản không tồn tại.');
    }

    if (user.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Tài khoản đang bị khóa hoặc chưa kích hoạt.',
      );
    }

    if (!user.email) {
      throw new BadRequestException(
        'Tài khoản chưa có email xác thực để nhận mã OTP.',
      );
    }

    await this.authOtpService.requestOtp({
      purpose: 'FORGOT_PASSWORD',
      email: user.email,
      userId: user.userId,
    });

    return {
      requested: true,
    };
  }

  async verifyForgotPasswordOtp(payload: unknown) {
    const body = ensureObject(payload);
    const login = requiredString(body, 'login', {
      minLength: 3,
      maxLength: 150,
    });
    const otpCode = requiredString(body, 'otpCode', {
      minLength: 4,
      maxLength: 12,
    });
    const user = await this.resolveUserByLogin(login);

    if (!user || user.deletedAt || user.status !== 'ACTIVE' || !user.email) {
      throw new UnauthorizedException('Thông tin không hợp lệ.');
    }

    await this.authOtpService.verifyOtp(
      {
        purpose: 'FORGOT_PASSWORD',
        email: user.email,
        otpCode,
        userId: user.userId,
      },
      { consumeOnSuccess: false },
    );

    return {
      verified: true,
    };
  }

  async confirmForgotPassword(payload: unknown) {
    const body = ensureObject(payload);
    const login = requiredString(body, 'login', {
      minLength: 3,
      maxLength: 150,
    });
    const otpCode = requiredString(body, 'otpCode', {
      minLength: 4,
      maxLength: 12,
    });
    const newPassword = requiredString(body, 'newPassword', {
      minLength: 10,
      maxLength: 100,
    });
    const user = await this.resolveUserByLogin(login);

    if (!user || user.deletedAt || user.status !== 'ACTIVE' || !user.email) {
      throw new UnauthorizedException('Invalid OTP or account.');
    }

    this.passwordPolicyService.validateOrThrow(
      newPassword,
      {
        email: user.email,
        phone: user.phone,
        fullName: user.fullName,
      },
      this.resolvePasswordPolicyProfile(user.role),
    );
    await this.assertNewPasswordDifferent(user.passwordHash, newPassword);
    await this.authOtpService.verifyOtp(
      {
        purpose: 'FORGOT_PASSWORD',
        email: user.email,
        otpCode,
        userId: user.userId,
      },
      { consumeOnSuccess: false },
    );
    const nextHash = await this.passwordService.hashPassword(newPassword);

    await this.usersService.updatePassword(user.userId, nextHash);
    const revokedSessionCount =
      await this.refreshSessionService.revokeAllSessionsForUser(user.userId);
    this.chatRealtimeService.disconnectUserSockets(user.userId);
    this.observabilityService.recordSessionRevocations(
      'password_forgot_reset',
      revokedSessionCount,
    );
    await this.consumeOtpBestEffort({
      purpose: 'FORGOT_PASSWORD',
      email: user.email,
      userId: user.userId,
    });

    return {
      passwordResetAt: nowIso(),
      revokedSessionCount,
    };
  }

  async requestChangePasswordOtp(user: AuthenticatedUser, claims: JwtClaims) {
    this.assertActorClaims(user, claims);
    const storedUser = await this.usersService.getByIdOrThrow(user.id);

    if (!storedUser.email) {
      throw new BadRequestException(
        'This account does not have an email for OTP delivery.',
      );
    }

    const challenge = await this.authOtpService.requestOtp({
      purpose: 'CHANGE_PASSWORD',
      email: storedUser.email,
      userId: storedUser.userId,
    });

    return {
      otpRequested: true,
      purpose: challenge.purpose,
      maskedEmail: challenge.maskedEmail,
      expiresAt: challenge.expiresAt,
      resendAvailableAt: challenge.resendAvailableAt,
    };
  }

  async changePassword(
    user: AuthenticatedUser,
    claims: JwtClaims,
    payload: unknown,
  ) {
    this.assertActorClaims(user, claims);
    const body = ensureObject(payload);
    const currentPassword = requiredString(body, 'currentPassword', {
      minLength: 8,
      maxLength: 100,
    });
    const newPassword = requiredString(body, 'newPassword', {
      minLength: 10,
      maxLength: 100,
    });
    const otpCode = requiredString(body, 'otpCode', {
      minLength: 4,
      maxLength: 12,
    });
    const storedUser = await this.usersService.getByIdOrThrow(user.id);

    if (!storedUser.email) {
      throw new BadRequestException(
        'This account does not have an email for OTP delivery.',
      );
    }

    const validCurrentPassword = await this.passwordService.verifyPassword(
      currentPassword,
      storedUser.passwordHash,
    );

    if (!validCurrentPassword) {
      throw new UnauthorizedException('Current password is invalid.');
    }

    this.passwordPolicyService.validateOrThrow(
      newPassword,
      {
        email: storedUser.email,
        phone: storedUser.phone,
        fullName: storedUser.fullName,
      },
      this.resolvePasswordPolicyProfile(storedUser.role),
    );
    await this.assertNewPasswordDifferent(storedUser.passwordHash, newPassword);
    await this.authOtpService.verifyOtp(
      {
        purpose: 'CHANGE_PASSWORD',
        email: storedUser.email,
        otpCode,
        userId: storedUser.userId,
      },
      { consumeOnSuccess: false },
    );

    const nextHash = await this.passwordService.hashPassword(newPassword);
    await this.usersService.updatePassword(storedUser.userId, nextHash);
    const currentSessionId = claims.sid?.trim() || undefined;
    const revocableSessions =
      await this.refreshSessionService.listSessionsForUser(storedUser.userId);
    const revokedSessionIds = revocableSessions
      .filter(
        (session) =>
          !session.revokedAt &&
          (!currentSessionId || session.sessionId !== currentSessionId),
      )
      .map((session) => session.sessionId);

    const revokedSessionCount =
      await this.refreshSessionService.revokeAllSessionsForUser(
        storedUser.userId,
        {
          exceptSessionId: currentSessionId,
        },
      );
    for (const sessionId of revokedSessionIds) {
      this.chatRealtimeService.disconnectSessionSockets(sessionId);
    }
    if (!currentSessionId) {
      this.chatRealtimeService.disconnectUserSockets(storedUser.userId);
    }
    this.observabilityService.recordSessionRevocations(
      'password_change',
      revokedSessionCount,
    );
    await this.consumeOtpBestEffort({
      purpose: 'CHANGE_PASSWORD',
      email: storedUser.email,
      userId: storedUser.userId,
    });

    return {
      passwordChangedAt: nowIso(),
      revokedSessionCount,
      currentSessionRevoked: !currentSessionId,
    };
  }

  async requestDeactivateAccountOtp(
    user: AuthenticatedUser,
    claims: JwtClaims,
  ) {
    this.assertActorClaims(user, claims);
    const storedUser = await this.usersService.getActiveByIdOrThrow(user.id);

    if (!storedUser.email) {
      throw new BadRequestException(
        'This account does not have an email for OTP delivery.',
      );
    }

    const challenge = await this.authOtpService.requestOtp({
      purpose: 'DEACTIVATE_ACCOUNT',
      email: storedUser.email,
      userId: storedUser.userId,
    });

    return this.toOtpChallengeResponse(challenge);
  }

  async confirmDeactivateAccount(
    user: AuthenticatedUser,
    claims: JwtClaims,
    payload: unknown,
  ) {
    this.assertActorClaims(user, claims);
    const body = ensureObject(payload);
    const otpCode = requiredString(body, 'otpCode', {
      minLength: 4,
      maxLength: 12,
    });
    const storedUser = await this.usersService.getActiveByIdOrThrow(user.id);

    if (!storedUser.email) {
      throw new BadRequestException(
        'This account does not have an email for OTP delivery.',
      );
    }

    await this.authOtpService.verifyOtp(
      {
        purpose: 'DEACTIVATE_ACCOUNT',
        email: storedUser.email,
        otpCode,
        userId: storedUser.userId,
      },
      { consumeOnSuccess: false },
    );

    const deactivatedUser = await this.usersService.deactivateOwnAccount(
      storedUser.userId,
    );
    const revokedSessionCount =
      await this.refreshSessionService.revokeAllSessionsForUser(
        storedUser.userId,
      );
    this.chatRealtimeService.disconnectUserSockets(storedUser.userId);
    this.observabilityService.recordSessionRevocations(
      'account_deactivate',
      revokedSessionCount,
    );
    await this.consumeOtpBestEffort({
      purpose: 'DEACTIVATE_ACCOUNT',
      email: storedUser.email,
      userId: storedUser.userId,
    });

    return {
      status: deactivatedUser.status,
      occurredAt: deactivatedUser.updatedAt,
      revokedSessionCount,
      currentSessionRevoked: Boolean(claims.sid?.trim()),
    };
  }

  async requestReactivateAccountOtp(payload: unknown) {
    const body = ensureObject(payload);
    const login = requiredString(body, 'login', {
      minLength: 3,
      maxLength: 150,
    });
    const password = requiredString(body, 'password', {
      minLength: 10,
      maxLength: 100,
    });
    this.passwordPolicyService.validateOrThrow(password, {}, 'standard');
    const user = await this.resolveUserByLogin(login);

    if (!user || user.deletedAt || user.status !== 'DEACTIVATED') {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const validPassword = await this.passwordService.verifyPassword(
      password,
      user.passwordHash,
    );

    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.email) {
      throw new BadRequestException(
        'This account does not have an email for OTP delivery.',
      );
    }

    const challenge = await this.authOtpService.requestOtp({
      purpose: 'REACTIVATE_ACCOUNT',
      email: user.email,
      userId: user.userId,
    });

    return this.toOtpChallengeResponse(challenge);
  }

  async confirmReactivateAccount(
    payload: unknown,
    metadata?: SessionClientMetadata,
  ) {
    const body = ensureObject(payload);
    const login = requiredString(body, 'login', {
      minLength: 3,
      maxLength: 150,
    });
    const password = requiredString(body, 'password', {
      minLength: 10,
      maxLength: 100,
    });
    const otpCode = requiredString(body, 'otpCode', {
      minLength: 4,
      maxLength: 12,
    });
    this.passwordPolicyService.validateOrThrow(password, {}, 'standard');
    const user = await this.resolveUserByLogin(login);

    if (!user || user.deletedAt || user.status !== 'DEACTIVATED') {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const validPassword = await this.passwordService.verifyPassword(
      password,
      user.passwordHash,
    );

    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.email) {
      throw new BadRequestException(
        'This account does not have an email for OTP delivery.',
      );
    }

    await this.authOtpService.verifyOtp(
      {
        purpose: 'REACTIVATE_ACCOUNT',
        email: user.email,
        otpCode,
        userId: user.userId,
      },
      { consumeOnSuccess: false },
    );

    const reactivatedUser = await this.usersService.reactivateOwnAccount(
      user.userId,
    );
    await this.consumeOtpBestEffort({
      purpose: 'REACTIVATE_ACCOUNT',
      email: user.email,
      userId: user.userId,
    });

    return {
      tokens: await this.issueTokenPairForUser(reactivatedUser, metadata),
      user: await this.serializeUserProfile(reactivatedUser),
    };
  }

  async requestDeleteAccountOtp(user: AuthenticatedUser, claims: JwtClaims) {
    this.assertActorClaims(user, claims);
    const storedUser = await this.usersService.getActiveByIdOrThrow(user.id);

    if (!storedUser.email) {
      throw new BadRequestException(
        'This account does not have an email for OTP delivery.',
      );
    }

    const challenge = await this.authOtpService.requestOtp({
      purpose: 'DELETE_ACCOUNT',
      email: storedUser.email,
      userId: storedUser.userId,
    });

    return this.toOtpChallengeResponse(challenge);
  }

  async confirmDeleteAccount(
    user: AuthenticatedUser,
    claims: JwtClaims,
    payload: unknown,
  ) {
    this.assertActorClaims(user, claims);
    const body = ensureObject(payload);
    const currentPassword = requiredString(body, 'currentPassword', {
      minLength: 8,
      maxLength: 100,
    });
    const otpCode = requiredString(body, 'otpCode', {
      minLength: 4,
      maxLength: 12,
    });
    const acceptTerms = body.acceptTerms;

    if (acceptTerms !== true) {
      throw new BadRequestException(
        'acceptTerms must be true for permanent account deletion.',
      );
    }

    const storedUser = await this.usersService.getActiveByIdOrThrow(user.id);

    if (!storedUser.email) {
      throw new BadRequestException(
        'This account does not have an email for OTP delivery.',
      );
    }

    const validPassword = await this.passwordService.verifyPassword(
      currentPassword,
      storedUser.passwordHash,
    );

    if (!validPassword) {
      throw new UnauthorizedException('Current password is invalid.');
    }

    await this.authOtpService.verifyOtp(
      {
        purpose: 'DELETE_ACCOUNT',
        email: storedUser.email,
        otpCode,
        userId: storedUser.userId,
      },
      { consumeOnSuccess: false },
    );

    const deletedUser = await this.usersService.deleteOwnAccountPermanently(
      storedUser.userId,
    );
    const revokedSessionCount =
      await this.refreshSessionService.revokeAllSessionsForUser(
        storedUser.userId,
      );
    this.chatRealtimeService.disconnectUserSockets(storedUser.userId);
    this.observabilityService.recordSessionRevocations(
      'account_delete',
      revokedSessionCount,
    );
    await this.consumeOtpBestEffort({
      purpose: 'DELETE_ACCOUNT',
      email: storedUser.email,
      userId: storedUser.userId,
    });

    return {
      status: deletedUser.status,
      deletedAt: deletedUser.deletedAt ?? deletedUser.updatedAt,
      revokedSessionCount,
      currentSessionRevoked: Boolean(claims.sid?.trim()),
    };
  }

  async refresh(payload: unknown, metadata?: SessionClientMetadata) {
    const body = ensureObject(payload);
    const refreshToken = requiredString(body, 'refreshToken', {
      minLength: 10,
      maxLength: 5000,
    });
    const resolution =
      await this.refreshSessionService.resolveRefreshToken(refreshToken);
    const user = await this.usersService.getByIdOrThrow(resolution.claims.sub);

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is unavailable.');
    }

    const nextSessionId = createUlid();
    const tokens = this.jwtTokenService.issueTokenPair(
      this.toAuthUser(user),
      nextSessionId,
    );

    if (resolution.legacy) {
      const persisted =
        await this.refreshSessionService.migrateLegacyRefreshToken(
          user.userId,
          refreshToken,
          tokens.refreshToken,
          metadata,
        );
      if (persisted.replacedSessionId) {
        this.chatRealtimeService.disconnectSessionSockets(
          persisted.replacedSessionId,
        );
        this.observabilityService.recordSessionRevocations(
          'session_scope_replace',
          1,
        );
      }
      this.observabilityService.recordSessionRevocations(
        'legacy_refresh_migration',
        1,
      );
    } else {
      const rotated = await this.refreshSessionService.rotateRefreshSession(
        resolution.session,
        tokens.refreshToken,
        metadata,
      );
      if (rotated.replacedSessionId) {
        this.chatRealtimeService.disconnectSessionSockets(
          rotated.replacedSessionId,
        );
      }
      this.observabilityService.recordSessionRevocations('refresh_rotation', 1);
    }

    return {
      tokens,
      user: await this.serializeUserProfile(user),
    };
  }

  async logout(payload: unknown) {
    const body = ensureObject(payload);
    const refreshToken = requiredString(body, 'refreshToken', {
      minLength: 10,
      maxLength: 5000,
    });
    const result =
      await this.refreshSessionService.revokeRefreshToken(refreshToken);

    if (result.revoked) {
      this.observabilityService.recordSessionRevocations('logout', 1);
    }

    if (result.claims.sid?.trim()) {
      this.chatRealtimeService.disconnectSessionSockets(result.claims.sid);
    } else {
      this.chatRealtimeService.disconnectUserSockets(result.claims.sub);
    }

    return {
      loggedOut: true,
    };
  }

  async listSessions(
    user: AuthenticatedUser,
    claims: JwtClaims,
  ): Promise<AuthSessionInfo[]> {
    this.assertActorClaims(user, claims);
    const currentSessionId = claims.sid?.trim() || undefined;
    const sessions = await this.refreshSessionService.listSessionsForUser(
      user.id,
    );
    const sessionInfos: AuthSessionInfo[] = sessions.map(
      (session): AuthSessionInfo =>
        toAuthSessionInfo(session, currentSessionId),
    );

    return sessionInfos.sort(
      (left: AuthSessionInfo, right: AuthSessionInfo): number => {
        if (left.isCurrent !== right.isCurrent) {
          return left.isCurrent ? -1 : 1;
        }

        if (Boolean(left.revokedAt) !== Boolean(right.revokedAt)) {
          return left.revokedAt ? 1 : -1;
        }

        const leftUsedAt = left.lastUsedAt || left.updatedAt || left.createdAt;
        const rightUsedAt =
          right.lastUsedAt || right.updatedAt || right.createdAt;
        return rightUsedAt.localeCompare(leftUsedAt);
      },
    );
  }

  async revokeSession(
    user: AuthenticatedUser,
    claims: JwtClaims,
    sessionId: string,
  ) {
    this.assertActorClaims(user, claims);
    const normalizedSessionId = sessionId.trim();

    if (!normalizedSessionId) {
      throw new BadRequestException('sessionId is required.');
    }

    const session = await this.refreshSessionService.revokeSessionById(
      user.id,
      normalizedSessionId,
    );

    if (!session) {
      throw new NotFoundException('Session not found.');
    }

    this.chatRealtimeService.disconnectSessionSockets(normalizedSessionId);
    this.observabilityService.recordSessionRevocations('session_revoke', 1);

    return {
      sessionId: normalizedSessionId,
      revokedAt: session.revokedAt ?? session.updatedAt,
      currentSessionRevoked: claims.sid === normalizedSessionId,
    };
  }

  async dismissSessionHistory(
    user: AuthenticatedUser,
    claims: JwtClaims,
    sessionId: string,
  ) {
    this.assertActorClaims(user, claims);
    const normalizedSessionId = sessionId.trim();

    if (!normalizedSessionId) {
      throw new BadRequestException('sessionId is required.');
    }

    const session = await this.refreshSessionService.dismissSessionHistoryById(
      user.id,
      normalizedSessionId,
    );

    if (!session) {
      throw new NotFoundException('Session not found.');
    }

    return {
      sessionId: normalizedSessionId,
      dismissedAt: session.dismissedAt ?? session.updatedAt,
    };
  }

  async logoutAll(user: AuthenticatedUser, claims: JwtClaims) {
    this.assertActorClaims(user, claims);
    const revokedAt = nowIso();
    const revokedSessionCount =
      await this.refreshSessionService.revokeAllSessionsForUser(user.id);

    this.chatRealtimeService.disconnectUserSockets(user.id);

    this.observabilityService.recordSessionRevocations(
      'logout_all',
      revokedSessionCount,
    );

    return {
      revokedSessionCount,
      revokedAt,
      currentSessionRevoked: Boolean(claims.sid?.trim()),
    };
  }

  async me(user: AuthenticatedUser) {
    if (!user?.id) {
      throw new BadRequestException('Authenticated user is required.');
    }

    return this.usersService.getUser(user, user.id);
  }

  private async issueTokenPairForUser(
    user: StoredUser,
    metadata?: SessionClientMetadata,
  ) {
    const sessionId = createUlid();
    const tokens = this.jwtTokenService.issueTokenPair(
      this.toAuthUser(user),
      sessionId,
    );

    const persisted =
      await this.refreshSessionService.persistIssuedRefreshToken(
        user.userId,
        tokens.refreshToken,
        metadata,
      );

    if (persisted.replacedSessionId) {
      this.chatRealtimeService.disconnectSessionSockets(
        persisted.replacedSessionId,
      );
      this.observabilityService.recordSessionRevocations(
        'session_scope_replace',
        1,
      );
    }

    return tokens;
  }

  private toAuthUser(user: StoredUser): AuthenticatedUser {
    return toAuthenticatedUser(user);
  }

  private async serializeUserProfile(user: StoredUser) {
    return this.mediaAssetService.resolveAvatarFields(toUserProfile(user));
  }

  private async resolveUserByLogin(
    login: string,
  ): Promise<StoredUser | undefined> {
    return login.includes('@')
      ? this.usersService.findByEmail(normalizeEmail(login))
      : this.usersService.findByPhone(normalizePhone(login));
  }

  private toOtpChallengeResponse(challenge: {
    purpose: OtpPurpose;
    maskedEmail: string;
    expiresAt: string;
    resendAvailableAt: string;
  }) {
    return {
      otpRequested: true,
      purpose: challenge.purpose,
      maskedEmail: challenge.maskedEmail,
      expiresAt: challenge.expiresAt,
      resendAvailableAt: challenge.resendAvailableAt,
    };
  }

  private async assertIdentityAvailable(
    phone: string | undefined,
    email: string | undefined,
  ): Promise<void> {
    if (phone && (await this.usersService.findByPhone(phone))) {
      throw new BadRequestException('phone already exists.');
    }

    if (email && (await this.usersService.findByEmail(email))) {
      throw new BadRequestException('email already exists.');
    }
  }

  private async assertNewPasswordDifferent(
    currentPasswordHash: string,
    newPassword: string,
  ): Promise<void> {
    if (
      await this.passwordService.verifyPassword(
        newPassword,
        currentPasswordHash,
      )
    ) {
      throw new BadRequestException(
        'newPassword must be different from the current password.',
      );
    }
  }

  private resolvePasswordPolicyProfile(
    role: StoredUser['role'],
  ): PasswordPolicyProfile {
    return role === 'CITIZEN' ? 'standard' : 'privileged';
  }

  private resolveIdentityFromLogin(login: string): {
    identityType: 'EMAIL' | 'PHONE';
    identityValue: string;
  } {
    if (login.includes('@')) {
      return {
        identityType: 'EMAIL',
        identityValue: normalizeEmail(login),
      };
    }

    return {
      identityType: 'PHONE',
      identityValue: normalizePhone(login),
    };
  }

  private async assertLoginAttemptsAllowed(identity: {
    identityType: 'EMAIL' | 'PHONE';
    identityValue: string;
  }): Promise<void> {
    await this.assertAuthAttemptsAllowed('LOGIN', identity);
  }

  private async assertRegisterAttemptsAllowed(identity: {
    email?: string;
    phone?: string;
  }): Promise<void> {
    const identityType = identity.email ? 'EMAIL' : 'PHONE';
    const identityValue = identity.email
      ? normalizeEmail(identity.email)
      : identity.phone
        ? normalizePhone(identity.phone)
        : '';

    if (!identityValue) {
      return;
    }

    await this.assertAuthAttemptsAllowed('REGISTER', {
      identityType,
      identityValue,
    });
  }

  private async assertAuthAttemptsAllowed(
    purpose: 'LOGIN' | 'REGISTER',
    identity: { identityType: 'EMAIL' | 'PHONE'; identityValue: string },
  ): Promise<void> {
    const attempt = await this.getAuthAttempt(purpose, identity);
    const now = nowIso();

    if (!attempt || this.isAttemptExpired(attempt, now)) {
      return;
    }

    if (attempt.lockedUntil && attempt.lockedUntil > now) {
      throw new HttpException(
        'Too many attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordAuthAttemptFailure(
    purpose: 'LOGIN' | 'REGISTER',
    identity: { identityType: 'EMAIL' | 'PHONE'; identityValue: string },
  ): Promise<void> {
    if (!identity.identityValue) {
      return;
    }

    const now = nowIso();
    const attempt = await this.getAuthAttempt(purpose, identity);
    const config = this.getAuthAttemptConfig(purpose);
    const resetWindow =
      !attempt || this.isAttemptExpired(attempt, now) || attempt.lockedUntil;
    const nextCount = resetWindow ? 1 : attempt.attemptCount + 1;
    const firstAttemptAt = resetWindow ? now : attempt.firstAttemptAt;
    const lockedUntil =
      nextCount >= config.maxAttempts
        ? this.addSeconds(now, config.lockSeconds)
        : null;

    const record: StoredAuthIdentityAttempt = {
      PK: this.makeAuthAttemptPk(purpose, identity),
      SK: 'ATTEMPT',
      entityType: 'AUTH_IDENTITY_ATTEMPT',
      purpose,
      identityType: identity.identityType,
      identityValue: identity.identityValue,
      attemptCount: nextCount,
      firstAttemptAt,
      lastAttemptAt: now,
      lockedUntil,
      expiresAt: this.addSeconds(now, config.windowSeconds),
      createdAt: attempt?.createdAt ?? now,
      updatedAt: now,
    };

    await this.repository.put(this.config.dynamodbUsersTableName, record);
  }

  private async clearAuthAttempts(
    purpose: 'LOGIN' | 'REGISTER',
    identity: { identityType: 'EMAIL' | 'PHONE'; identityValue: string },
  ): Promise<void> {
    if (!identity.identityValue) {
      return;
    }

    await this.repository.delete(
      this.config.dynamodbUsersTableName,
      this.makeAuthAttemptPk(purpose, identity),
      'ATTEMPT',
    );
  }

  private async getAuthAttempt(
    purpose: 'LOGIN' | 'REGISTER',
    identity: { identityType: 'EMAIL' | 'PHONE'; identityValue: string },
  ): Promise<StoredAuthIdentityAttempt | undefined> {
    return this.repository.get<StoredAuthIdentityAttempt>(
      this.config.dynamodbUsersTableName,
      this.makeAuthAttemptPk(purpose, identity),
      'ATTEMPT',
    );
  }

  private getAuthAttemptConfig(purpose: 'LOGIN' | 'REGISTER'): {
    maxAttempts: number;
    windowSeconds: number;
    lockSeconds: number;
  } {
    if (purpose === 'REGISTER') {
      return {
        maxAttempts: this.config.authRegisterMaxAttempts,
        windowSeconds: this.config.authRegisterWindowSeconds,
        lockSeconds: this.config.authRegisterLockSeconds,
      };
    }

    return {
      maxAttempts: this.config.authLoginMaxAttempts,
      windowSeconds: this.config.authLoginWindowSeconds,
      lockSeconds: this.config.authLoginLockSeconds,
    };
  }

  private makeAuthAttemptPk(
    purpose: 'LOGIN' | 'REGISTER',
    identity: { identityType: 'EMAIL' | 'PHONE'; identityValue: string },
  ): string {
    return [
      'AUTH',
      'ATTEMPT',
      purpose,
      identity.identityType,
      identity.identityValue,
    ].join('#');
  }

  private isAttemptExpired(
    attempt: StoredAuthIdentityAttempt,
    now: string,
  ): boolean {
    return attempt.expiresAt <= now;
  }

  private addSeconds(timestamp: string, seconds: number): string {
    return new Date(
      new Date(timestamp).getTime() + seconds * 1000,
    ).toISOString();
  }

  private async consumeOtpBestEffort(input: {
    purpose: OtpPurpose;
    email: string;
    userId: string;
  }): Promise<void> {
    try {
      await this.authOtpService.consumeOtp(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      this.logger.warn(
        `OTP consume deferred after password flow failed (purpose=${input.purpose}, userId=${input.userId}): ${message}`,
      );
    }
  }

  private assertActorClaims(user: AuthenticatedUser, claims: JwtClaims): void {
    if (!user?.id || !claims?.sub || user.id !== claims.sub) {
      throw new UnauthorizedException('Authenticated session is invalid.');
    }
  }
}
