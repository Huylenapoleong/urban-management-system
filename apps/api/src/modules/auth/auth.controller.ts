import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser, JwtClaims } from '@urban/shared-types';
import type { Request } from 'express';
import { CurrentAuthClaims } from '../../common/decorators/current-auth-claims.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  ApiCreatedEnvelopeResponse,
  ApiOkEnvelopeResponse,
} from '../../common/openapi/swagger-envelope';
import {
  ApiBadRequestExamples,
  ApiNotFoundExamples,
  ApiServiceUnavailableExamples,
  ApiTooManyRequestsExamples,
  ApiUnauthorizedExamples,
} from '../../common/openapi/swagger-errors';
import {
  AccountLifecycleOtpVerifyRequestDto,
  AccountLifecycleResultDto,
  AuthOtpChallengeResultDto,
  AuthSessionDto,
  AuthSessionInfoDto,
  ChangePasswordRequestDto,
  ChangePasswordResultDto,
  DeleteAccountConfirmRequestDto,
  DeleteAccountResultDto,
  DismissSessionHistoryResultDto,
  ErrorResponseDto,
  ForgotPasswordConfirmRequestDto,
  ForgotPasswordConfirmResultDto,
  ForgotPasswordRequestDto,
  GenericAcceptedResultDto,
  LoginOtpRequestDto,
  LoginOtpVerifyRequestDto,
  LoginRequestDto,
  LogoutAllResultDto,
  LogoutRequestDto,
  LogoutResultDto,
  ReactivateAccountOtpRequestDto,
  ReactivateAccountOtpVerifyRequestDto,
  RefreshRequestDto,
  RegisterOtpRequestDto,
  RegisterOtpVerifyRequestDto,
  RegisterRequestDto,
  RevokeSessionResultDto,
  UserProfileDto,
} from '../../common/openapi/swagger.models';
import { extractSessionClientMetadata } from '../../common/request-session-metadata';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register citizen account',
    description:
      'Legacy password-based registration that immediately creates the citizen account and returns access/refresh tokens. Use the OTP flow if your client requires email verification before account creation.',
  })
  @ApiBody({
    type: RegisterRequestDto,
    description:
      'Provide at least one identity field (`email` or `phone`). Password policy is enforced before account creation.',
  })
  @ApiCreatedEnvelopeResponse(AuthSessionDto, {
    description:
      'Returns the created user profile together with a fresh access/refresh token pair.',
  })
  @ApiBadRequestExamples(
    'Registration payload is invalid or cannot be accepted.',
    [
      {
        name: 'identityRequired',
        summary: 'Missing phone and email',
        message: 'Either phone or email is required.',
        path: '/api/auth/register',
      },
      {
        name: 'emailExists',
        summary: 'Duplicate email',
        message: 'email already exists.',
        path: '/api/auth/register',
      },
      {
        name: 'weakPassword',
        summary: 'Password policy failed',
        message:
          'password must include at least 3 of: uppercase, lowercase, number, special character.',
        path: '/api/auth/register',
      },
    ],
  )
  @ApiTooManyRequestsExamples(
    'Registration attempts were throttled for this identity.',
    [
      {
        name: 'registerLocked',
        summary: 'Too many failed register attempts',
        message: 'Too many attempts. Please try again later.',
        path: '/api/auth/register',
      },
    ],
  )
  register(@Body() body: RegisterRequestDto, @Req() request: Request) {
    return this.authService.register(
      body,
      extractSessionClientMetadata(request),
    );
  }

  @Public()
  @Post('register/request-otp')
  @ApiOperation({
    summary: 'Request OTP for citizen registration',
    description:
      'Creates or refreshes a registration draft, then sends an OTP to the provided email address. This endpoint is required for OTP-based registration.',
  })
  @ApiBody({
    type: RegisterOtpRequestDto,
    description:
      'Email is mandatory for OTP-based registration. The password is validated and stored in the draft before OTP delivery.',
  })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto, {
    description:
      'OTP delivery was accepted. FE should start the OTP countdown and use `resendAvailableAt` before enabling resend.',
  })
  @ApiBadRequestExamples(
    'The registration draft could not be created from the provided payload.',
    [
      {
        name: 'emailRequired',
        summary: 'Email missing for OTP registration',
        message: 'Email is required for OTP-based registration.',
        path: '/api/auth/register/request-otp',
      },
      {
        name: 'phoneExists',
        summary: 'Duplicate phone number',
        message: 'phone already exists.',
        path: '/api/auth/register/request-otp',
      },
      {
        name: 'predictablePassword',
        summary: 'Weak password rejected',
        message: 'password is too common or predictable.',
        path: '/api/auth/register/request-otp',
      },
    ],
  )
  @ApiTooManyRequestsExamples(
    'OTP registration attempts were throttled for this identity.',
    [
      {
        name: 'registerOtpLocked',
        summary: 'Too many OTP register attempts',
        message: 'Too many attempts. Please try again later.',
        path: '/api/auth/register/request-otp',
      },
    ],
  )
  @ApiServiceUnavailableExamples(
    'OTP delivery failed after the request was validated.',
    [
      {
        name: 'otpDeliveryUnavailable',
        summary: 'SMTP or OTP dispatch temporarily unavailable',
        message: 'Unable to deliver OTP at this moment. Please retry.',
        path: '/api/auth/register/request-otp',
      },
    ],
  )
  requestRegisterOtp(@Body() body: RegisterOtpRequestDto) {
    return this.authService.requestRegisterOtp(body);
  }

  @Public()
  @Post('register/verify-otp')
  @ApiOperation({
    summary: 'Verify registration OTP and create citizen account',
    description:
      'Consumes the OTP and the stored registration draft, then creates the citizen account and returns tokens.',
  })
  @ApiBody({
    type: RegisterOtpVerifyRequestDto,
    description:
      'Use the same email address that was used in `request-otp`. OTP verification consumes the draft on success.',
  })
  @ApiOkEnvelopeResponse(AuthSessionDto, {
    description:
      'Returns the created user profile with access/refresh tokens after successful OTP verification.',
  })
  @ApiBadRequestExamples(
    'The registration draft is missing or no longer usable.',
    [
      {
        name: 'draftExpired',
        summary: 'Draft expired or missing',
        message:
          'Registration draft is invalid or expired. Please request OTP again.',
        path: '/api/auth/register/verify-otp',
      },
    ],
  )
  @ApiUnauthorizedExamples(
    'The provided OTP or the target account context is invalid.',
    [
      {
        name: 'otpExpired',
        summary: 'OTP invalid or expired',
        message: 'OTP is invalid or expired.',
        path: '/api/auth/register/verify-otp',
      },
    ],
  )
  verifyRegisterOtp(
    @Body() body: RegisterOtpVerifyRequestDto,
    @Req() request: Request,
  ) {
    return this.authService.verifyRegisterOtp(
      body,
      extractSessionClientMetadata(request),
    );
  }

  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Login with email or phone',
    description:
      'Password-based login that issues a new token pair. Login attempts are throttled per normalized email/phone identity.',
  })
  @ApiBody({
    type: LoginRequestDto,
    description:
      'Set `login` to either an email address or a phone number. Password policy is also validated on this endpoint.',
  })
  @ApiOkEnvelopeResponse(AuthSessionDto, {
    description:
      'Returns the authenticated user profile and a fresh access/refresh token pair.',
  })
  @ApiBadRequestExamples(
    'The login payload is malformed or fails local validation.',
    [
      {
        name: 'loginRequired',
        summary: 'Missing login field',
        message: 'login is required.',
        path: '/api/auth/login',
      },
      {
        name: 'passwordWhitespace',
        summary: 'Password contains whitespace',
        message: 'password must not contain whitespace.',
        path: '/api/auth/login',
      },
    ],
  )
  @ApiUnauthorizedExamples(
    'The identity/password combination could not be authenticated.',
    [
      {
        name: 'invalidCredentials',
        summary: 'Wrong email/phone or password',
        message: 'Invalid credentials.',
        path: '/api/auth/login',
      },
    ],
  )
  @ApiTooManyRequestsExamples(
    'The login identity is temporarily locked after repeated failures.',
    [
      {
        name: 'loginLocked',
        summary: 'Too many failed logins',
        message: 'Too many attempts. Please try again later.',
        path: '/api/auth/login',
      },
    ],
  )
  login(@Body() body: LoginRequestDto, @Req() request: Request) {
    return this.authService.login(body, extractSessionClientMetadata(request));
  }

  @Public()
  @Post('login/request-otp')
  @ApiOperation({
    summary: 'Request login OTP after password verification',
    description:
      'Second-step authentication entrypoint. The email/phone + password pair is verified first, then an OTP is sent to the account email.',
  })
  @ApiBody({
    type: LoginOtpRequestDto,
    description:
      'This endpoint only works for active accounts that have an email address for OTP delivery.',
  })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto, {
    description:
      'OTP delivery was accepted. Use `verify-otp` to finish the login and obtain tokens.',
  })
  @ApiBadRequestExamples(
    'Password login passed but the account cannot receive OTP.',
    [
      {
        name: 'otpEmailMissing',
        summary: 'Account has no email',
        message: 'This account does not have an email for OTP delivery.',
        path: '/api/auth/login/request-otp',
      },
    ],
  )
  @ApiUnauthorizedExamples(
    'Either the password login failed or the target account is not available.',
    [
      {
        name: 'otpLoginInvalidCredentials',
        summary: 'Wrong password or unavailable account',
        message: 'Invalid credentials.',
        path: '/api/auth/login/request-otp',
      },
    ],
  )
  @ApiTooManyRequestsExamples(
    'OTP login attempts were throttled for this identity.',
    [
      {
        name: 'otpLoginLocked',
        summary: 'Too many OTP login attempts',
        message: 'Too many attempts. Please try again later.',
        path: '/api/auth/login/request-otp',
      },
    ],
  )
  @ApiServiceUnavailableExamples(
    'OTP delivery failed after password verification succeeded.',
    [
      {
        name: 'otpLoginDeliveryUnavailable',
        summary: 'Temporary delivery failure',
        message: 'Unable to deliver OTP at this moment. Please retry.',
        path: '/api/auth/login/request-otp',
      },
    ],
  )
  requestLoginOtp(@Body() body: LoginOtpRequestDto) {
    return this.authService.requestLoginOtp(body);
  }

  @Public()
  @Post('login/verify-otp')
  @ApiOperation({
    summary: 'Verify login OTP and issue token pair',
    description:
      'Finishes the OTP login flow and creates a new session only when the OTP is still valid for the requested login identity.',
  })
  @ApiBody({ type: LoginOtpVerifyRequestDto })
  @ApiOkEnvelopeResponse(AuthSessionDto, {
    description:
      'Returns the authenticated user profile and a fresh access/refresh token pair.',
  })
  @ApiBadRequestExamples('The OTP verify payload is malformed.', [
    {
      name: 'otpCodeRequired',
      summary: 'Missing OTP code',
      message: 'otpCode is required.',
      path: '/api/auth/login/verify-otp',
    },
  ])
  @ApiUnauthorizedExamples('The login identity or OTP is invalid.', [
    {
      name: 'otpLoginInvalidCredentials',
      summary: 'Account unavailable for OTP login',
      message: 'Invalid credentials.',
      path: '/api/auth/login/verify-otp',
    },
    {
      name: 'otpExpired',
      summary: 'OTP invalid or expired',
      message: 'OTP is invalid or expired.',
      path: '/api/auth/login/verify-otp',
    },
  ])
  verifyLoginOtp(
    @Body() body: LoginOtpVerifyRequestDto,
    @Req() request: Request,
  ) {
    return this.authService.verifyLoginOtp(
      body,
      extractSessionClientMetadata(request),
    );
  }

  @Public()
  @Post('unlock/request-otp')
  @ApiOperation({
    summary: 'Request OTP to unlock account',
    description:
      'Provide login and password to verify, then sends OTP to account email to unlock a LOCKED account.',
  })
  @ApiBody({ type: LoginOtpRequestDto })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto)
  requestUnlockAccountOtp(@Body() body: LoginOtpRequestDto) {
    return this.authService.requestUnlockAccountOtp(body);
  }

  @Public()
  @Post('unlock/confirm')
  @ApiOperation({
    summary: 'Confirm OTP to unlock account and login',
    description:
      'Verify the OTP. If valid, unlocks the account and returns tokens to login.',
  })
  @ApiBody({ type: LoginOtpVerifyRequestDto })
  @ApiOkEnvelopeResponse(AuthSessionDto)
  confirmUnlockAccount(
    @Body() body: LoginOtpVerifyRequestDto,
    @Req() request: Request,
  ) {
    return this.authService.confirmUnlockAccount(
      body,
      extractSessionClientMetadata(request),
    );
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token pair',
    description:
      'Rotates the refresh session and returns a new access/refresh token pair. Older legacy refresh tokens may be migrated into the session-based model on first successful refresh.',
  })
  @ApiBody({ type: RefreshRequestDto })
  @ApiOkEnvelopeResponse(AuthSessionDto, {
    description:
      'Returns a new access/refresh token pair and the current user profile.',
  })
  @ApiBadRequestExamples('The refresh payload is malformed.', [
    {
      name: 'refreshTokenRequired',
      summary: 'Missing refresh token',
      message: 'refreshToken is required.',
      path: '/api/auth/refresh',
    },
  ])
  @ApiUnauthorizedExamples(
    'The refresh token cannot be used to create a new session pair.',
    [
      {
        name: 'refreshRevoked',
        summary: 'Refresh token session revoked',
        message: 'Refresh token session has been revoked.',
        path: '/api/auth/refresh',
      },
      {
        name: 'refreshExpired',
        summary: 'Refresh token session expired',
        message: 'Refresh token session has expired.',
        path: '/api/auth/refresh',
      },
      {
        name: 'userUnavailable',
        summary: 'User no longer active',
        message: 'User account is unavailable.',
        path: '/api/auth/refresh',
      },
    ],
  )
  refresh(@Body() body: RefreshRequestDto, @Req() request: Request) {
    return this.authService.refresh(
      body,
      extractSessionClientMetadata(request),
    );
  }

  @Public()
  @Post('logout')
  @ApiOperation({
    summary: 'Revoke a refresh token session',
    description:
      'Revokes the session identified by the provided refresh token. This endpoint is idempotent from the client perspective and always returns `loggedOut: true` when the request shape is valid.',
  })
  @ApiBody({ type: LogoutRequestDto })
  @ApiOkEnvelopeResponse(LogoutResultDto, {
    description:
      'Logout succeeded or the target session was already revoked. FE can safely clear local auth state on any 200 response.',
  })
  @ApiBadRequestExamples('The logout payload is malformed.', [
    {
      name: 'logoutRefreshTokenRequired',
      summary: 'Missing refresh token',
      message: 'refreshToken is required.',
      path: '/api/auth/logout',
    },
  ])
  logout(@Body() body: LogoutRequestDto) {
    return this.authService.logout(body);
  }

  @Public()
  @Post('password/forgot/request')
  @ApiOperation({
    summary: 'Request password reset OTP by login identity',
    description:
      'Always returns a generic success payload when the request shape is valid. This prevents account enumeration. If an active account with email exists, an OTP is sent in the background.',
  })
  @ApiBody({ type: ForgotPasswordRequestDto })
  @ApiOkEnvelopeResponse(GenericAcceptedResultDto, {
    description:
      'The request was accepted. This does not guarantee that an email was sent, only that the API accepted the request shape.',
  })
  @ApiBadRequestExamples('The forgot-password request payload is malformed.', [
    {
      name: 'forgotLoginRequired',
      summary: 'Missing login field',
      message: 'login is required.',
      path: '/api/auth/password/forgot/request',
    },
  ])
  @ApiServiceUnavailableExamples(
    'An eligible account was found but the OTP email could not be delivered.',
    [
      {
        name: 'forgotOtpDeliveryUnavailable',
        summary: 'Temporary OTP delivery failure',
        message: 'Unable to deliver OTP at this moment. Please retry.',
        path: '/api/auth/password/forgot/request',
      },
    ],
  )
  requestForgotPasswordOtp(@Body() body: ForgotPasswordRequestDto) {
    return this.authService.requestForgotPasswordOtp(body);
  }

  @Public()
  @Post('password/forgot/verify')
  @ApiOperation({ summary: 'Verify forgot password OTP without consuming it' })
  @ApiBody({ type: LoginOtpVerifyRequestDto })
  @ApiOkEnvelopeResponse(GenericAcceptedResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  verifyForgotPasswordOtp(@Body() body: LoginOtpVerifyRequestDto) {
    return this.authService.verifyForgotPasswordOtp(body);
  }

  @Public()
  @Post('password/forgot/confirm')
  @ApiOperation({
    summary: 'Verify OTP and reset password',
    description:
      'Resets the password after verifying the OTP issued by the forgot-password flow. All existing sessions are revoked after success.',
  })
  @ApiBody({ type: ForgotPasswordConfirmRequestDto })
  @ApiOkEnvelopeResponse(ForgotPasswordConfirmResultDto, {
    description:
      'Password reset succeeded. The response includes how many existing sessions were revoked.',
  })
  @ApiBadRequestExamples('The new password or reset payload is invalid.', [
    {
      name: 'newPasswordSameAsCurrent',
      summary: 'New password matches current password',
      message: 'newPassword must be different from the current password.',
      path: '/api/auth/password/forgot/confirm',
    },
    {
      name: 'newPasswordPersonalInfo',
      summary: 'Password contains personal information',
      message: 'password must not contain your personal account information.',
      path: '/api/auth/password/forgot/confirm',
    },
  ])
  @ApiUnauthorizedExamples('The login/OTP combination could not be verified.', [
    {
      name: 'invalidOtpOrAccount',
      summary: 'Account unavailable for password reset',
      message: 'Invalid OTP or account.',
      path: '/api/auth/password/forgot/confirm',
    },
    {
      name: 'otpExpired',
      summary: 'OTP invalid or expired',
      message: 'OTP is invalid or expired.',
      path: '/api/auth/password/forgot/confirm',
    },
  ])
  confirmForgotPassword(@Body() body: ForgotPasswordConfirmRequestDto) {
    return this.authService.confirmForgotPassword(body);
  }

  @Get('sessions')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'List active and recent session history',
    description:
      'Returns the current session first, followed by other active sessions, then revoked/dismissed history sorted by last usage.',
  })
  @ApiOkEnvelopeResponse(AuthSessionInfoDto, {
    isArray: true,
    description:
      'Session list for the current authenticated user. FE can use `isCurrent`, `revokedAt`, and `dismissedAt` to split active/history sections.',
  })
  @ApiUnauthorizedExamples(
    'The bearer token or its linked session is not valid.',
    [
      {
        name: 'missingBearer',
        summary: 'Authorization header missing',
        message: 'Missing bearer token.',
        path: '/api/auth/sessions',
      },
      {
        name: 'inactiveSession',
        summary: 'Access token session is no longer active',
        message: 'Authenticated session is invalid.',
        path: '/api/auth/sessions',
      },
    ],
  )
  sessions(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
  ) {
    return this.authService.listSessions(user, claims);
  }

  @Delete('sessions/:sessionId')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Revoke a session by id',
    description:
      'Revokes one session from the current user session history. If the current session is revoked, FE should force sign-out locally.',
  })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiOkEnvelopeResponse(RevokeSessionResultDto, {
    description:
      'Returns the revoked session id together with whether it was the current session.',
  })
  @ApiNotFoundExamples(
    'The requested session id does not exist for the current user.',
    [
      {
        name: 'sessionMissing',
        summary: 'Session id not found',
        message: 'Session not found.',
        path: '/api/auth/sessions/01JSESSION0000000000000001',
      },
    ],
  )
  @ApiBadRequestExamples(
    'The session id path parameter is empty or invalid after trimming.',
    [
      {
        name: 'sessionIdRequired',
        summary: 'Missing session id',
        message: 'sessionId is required.',
        path: '/api/auth/sessions/%20',
      },
    ],
  )
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
    @Param('sessionId') sessionId: string,
  ) {
    return this.authService.revokeSession(user, claims, sessionId);
  }

  @Delete('sessions/:sessionId/history')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Dismiss a revoked or expired session from history',
    description:
      'Removes a historical session entry from the security history view. Active sessions cannot be dismissed.',
  })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiOkEnvelopeResponse(DismissSessionHistoryResultDto, {
    description:
      'Returns the dismissed history entry id and dismissal timestamp.',
  })
  @ApiBadRequestExamples('The session history dismiss request is invalid.', [
    {
      name: 'dismissSessionRequired',
      summary: 'Missing session id',
      message: 'sessionId is required.',
      path: '/api/auth/sessions/%20/history',
    },
  ])
  @ApiNotFoundExamples(
    'The requested historical session entry does not exist.',
    [
      {
        name: 'dismissSessionMissing',
        summary: 'Session history not found',
        message: 'Session not found.',
        path: '/api/auth/sessions/01JSESSION0000000000000001/history',
      },
    ],
  )
  dismissSessionHistory(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
    @Param('sessionId') sessionId: string,
  ) {
    return this.authService.dismissSessionHistory(user, claims, sessionId);
  }

  @Post('logout-all')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Revoke all sessions for the current user',
    description:
      'Revokes every session belonging to the authenticated user, including the current session when present.',
  })
  @ApiOkEnvelopeResponse(LogoutAllResultDto, {
    description:
      'Returns how many sessions were revoked and whether the current session was among them.',
  })
  logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
  ) {
    return this.authService.logoutAll(user, claims);
  }

  @Post('password/change/request-otp')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Request OTP for password change',
    description:
      'Sends an OTP to the current account email. This OTP is required by the change-password confirm endpoint.',
  })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto, {
    description: 'OTP challenge metadata for the password-change flow.',
  })
  @ApiBadRequestExamples(
    'The current account cannot receive password-change OTP.',
    [
      {
        name: 'changePasswordNoEmail',
        summary: 'Account has no email',
        message: 'This account does not have an email for OTP delivery.',
        path: '/api/auth/password/change/request-otp',
      },
    ],
  )
  @ApiServiceUnavailableExamples(
    'OTP delivery failed after the request was validated.',
    [
      {
        name: 'changePasswordOtpDeliveryUnavailable',
        summary: 'Temporary OTP delivery failure',
        message: 'Unable to deliver OTP at this moment. Please retry.',
        path: '/api/auth/password/change/request-otp',
      },
    ],
  )
  requestChangePasswordOtp(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
  ) {
    return this.authService.requestChangePasswordOtp(user, claims);
  }

  @Post('password/change')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Change password with current password and OTP',
    description:
      'Changes the password after verifying the current password and OTP. Other sessions are revoked after success; the current session may stay active depending on the session scope replacement result.',
  })
  @ApiBody({ type: ChangePasswordRequestDto })
  @ApiOkEnvelopeResponse(ChangePasswordResultDto, {
    description:
      'Password change succeeded. The response tells FE whether the current session was revoked.',
  })
  @ApiBadRequestExamples('The password change request is invalid.', [
    {
      name: 'changePasswordNoEmail',
      summary: 'Account has no email',
      message: 'This account does not have an email for OTP delivery.',
      path: '/api/auth/password/change',
    },
    {
      name: 'samePassword',
      summary: 'New password matches current password',
      message: 'newPassword must be different from the current password.',
      path: '/api/auth/password/change',
    },
  ])
  @ApiUnauthorizedExamples(
    'The current password or OTP could not be verified.',
    [
      {
        name: 'currentPasswordInvalid',
        summary: 'Current password is wrong',
        message: 'Current password is invalid.',
        path: '/api/auth/password/change',
      },
      {
        name: 'changePasswordOtpExpired',
        summary: 'OTP invalid or expired',
        message: 'OTP is invalid or expired.',
        path: '/api/auth/password/change',
      },
    ],
  )
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
    @Body() body: ChangePasswordRequestDto,
  ) {
    return this.authService.changePassword(user, claims, body);
  }

  @Post('account/deactivate/request-otp')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Request OTP to deactivate current account',
    description:
      'Sends an OTP to the authenticated account email before temporary account deactivation.',
  })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto, {
    description: 'OTP challenge metadata for the account-deactivation flow.',
  })
  @ApiBadRequestExamples(
    'The current account cannot receive a deactivation OTP.',
    [
      {
        name: 'deactivateNoEmail',
        summary: 'Account has no email',
        message: 'This account does not have an email for OTP delivery.',
        path: '/api/auth/account/deactivate/request-otp',
      },
    ],
  )
  @ApiServiceUnavailableExamples(
    'OTP delivery failed after the request was validated.',
    [
      {
        name: 'deactivateOtpDeliveryUnavailable',
        summary: 'Temporary OTP delivery failure',
        message: 'Unable to deliver OTP at this moment. Please retry.',
        path: '/api/auth/account/deactivate/request-otp',
      },
    ],
  )
  requestDeactivateAccountOtp(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
  ) {
    return this.authService.requestDeactivateAccountOtp(user, claims);
  }

  @Post('account/deactivate/confirm')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Verify OTP and deactivate current account',
    description:
      'Verifies the deactivation OTP, deactivates the account, and revokes all sessions.',
  })
  @ApiBody({ type: AccountLifecycleOtpVerifyRequestDto })
  @ApiOkEnvelopeResponse(AccountLifecycleResultDto, {
    description:
      'Deactivation succeeded. The response includes the resulting account status and how many sessions were revoked.',
  })
  @ApiBadRequestExamples(
    'The deactivation request is malformed or the account cannot receive OTP.',
    [
      {
        name: 'deactivateOtpRequired',
        summary: 'Missing OTP code',
        message: 'otpCode is required.',
        path: '/api/auth/account/deactivate/confirm',
      },
      {
        name: 'deactivateNoEmail',
        summary: 'Account has no email',
        message: 'This account does not have an email for OTP delivery.',
        path: '/api/auth/account/deactivate/confirm',
      },
    ],
  )
  @ApiUnauthorizedExamples(
    'The deactivation OTP is invalid or the session is not valid.',
    [
      {
        name: 'deactivateOtpExpired',
        summary: 'OTP invalid or expired',
        message: 'OTP is invalid or expired.',
        path: '/api/auth/account/deactivate/confirm',
      },
    ],
  )
  confirmDeactivateAccount(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
    @Body() body: AccountLifecycleOtpVerifyRequestDto,
  ) {
    return this.authService.confirmDeactivateAccount(user, claims, body);
  }

  @Public()
  @Post('account/reactivate/request-otp')
  @ApiOperation({
    summary: 'Request OTP to reactivate a deactivated account',
    description:
      'Checks the provided login/password for a deactivated account, then sends an OTP to the account email.',
  })
  @ApiBody({ type: ReactivateAccountOtpRequestDto })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto, {
    description: 'OTP challenge metadata for the account-reactivation flow.',
  })
  @ApiBadRequestExamples(
    'The account is eligible for reactivation but cannot receive OTP.',
    [
      {
        name: 'reactivateNoEmail',
        summary: 'Deactivated account has no email',
        message: 'This account does not have an email for OTP delivery.',
        path: '/api/auth/account/reactivate/request-otp',
      },
    ],
  )
  @ApiUnauthorizedExamples(
    'The login/password pair does not match a deactivated account.',
    [
      {
        name: 'reactivateInvalidCredentials',
        summary: 'Wrong password or account not deactivated',
        message: 'Invalid credentials.',
        path: '/api/auth/account/reactivate/request-otp',
      },
    ],
  )
  @ApiServiceUnavailableExamples(
    'OTP delivery failed after the password check succeeded.',
    [
      {
        name: 'reactivateOtpDeliveryUnavailable',
        summary: 'Temporary OTP delivery failure',
        message: 'Unable to deliver OTP at this moment. Please retry.',
        path: '/api/auth/account/reactivate/request-otp',
      },
    ],
  )
  requestReactivateAccountOtp(@Body() body: ReactivateAccountOtpRequestDto) {
    return this.authService.requestReactivateAccountOtp(body);
  }

  @Public()
  @Post('account/reactivate/confirm')
  @ApiOperation({
    summary: 'Verify OTP and reactivate account, then issue token pair',
    description:
      'Reactivates a deactivated account and immediately signs the user in with a fresh access/refresh token pair.',
  })
  @ApiBody({ type: ReactivateAccountOtpVerifyRequestDto })
  @ApiOkEnvelopeResponse(AuthSessionDto, {
    description:
      'Reactivation succeeded and the response includes the newly authenticated session.',
  })
  @ApiBadRequestExamples(
    'The reactivation request payload is malformed or the account cannot receive OTP.',
    [
      {
        name: 'reactivateNoEmail',
        summary: 'Deactivated account has no email',
        message: 'This account does not have an email for OTP delivery.',
        path: '/api/auth/account/reactivate/confirm',
      },
    ],
  )
  @ApiUnauthorizedExamples(
    'The password or OTP could not be verified for reactivation.',
    [
      {
        name: 'reactivateInvalidCredentials',
        summary: 'Wrong password or wrong account state',
        message: 'Invalid credentials.',
        path: '/api/auth/account/reactivate/confirm',
      },
      {
        name: 'reactivateOtpExpired',
        summary: 'OTP invalid or expired',
        message: 'OTP is invalid or expired.',
        path: '/api/auth/account/reactivate/confirm',
      },
    ],
  )
  confirmReactivateAccount(
    @Body() body: ReactivateAccountOtpVerifyRequestDto,
    @Req() request: Request,
  ) {
    return this.authService.confirmReactivateAccount(
      body,
      extractSessionClientMetadata(request),
    );
  }

  @Post('account/delete/request-otp')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Request OTP to permanently delete current account',
    description:
      'Sends an OTP to the authenticated account email before permanent account deletion.',
  })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto, {
    description:
      'OTP challenge metadata for the permanent account deletion flow.',
  })
  @ApiBadRequestExamples(
    'The current account cannot receive a delete-account OTP.',
    [
      {
        name: 'deleteNoEmail',
        summary: 'Account has no email',
        message: 'This account does not have an email for OTP delivery.',
        path: '/api/auth/account/delete/request-otp',
      },
    ],
  )
  @ApiServiceUnavailableExamples(
    'OTP delivery failed after the request was validated.',
    [
      {
        name: 'deleteOtpDeliveryUnavailable',
        summary: 'Temporary OTP delivery failure',
        message: 'Unable to deliver OTP at this moment. Please retry.',
        path: '/api/auth/account/delete/request-otp',
      },
    ],
  )
  requestDeleteAccountOtp(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
  ) {
    return this.authService.requestDeleteAccountOtp(user, claims);
  }

  @Post('account/delete/confirm')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Verify OTP and permanently delete current account',
    description:
      'Permanently deletes the current account after verifying both the current password and OTP. All sessions are revoked.',
  })
  @ApiBody({ type: DeleteAccountConfirmRequestDto })
  @ApiOkEnvelopeResponse(DeleteAccountResultDto, {
    description:
      'Permanent deletion succeeded. The response includes the deletion timestamp and revoked session count.',
  })
  @ApiBadRequestExamples('The delete-account request is invalid.', [
    {
      name: 'acceptTermsRequired',
      summary: 'Terms not accepted',
      message: 'acceptTerms must be true for permanent account deletion.',
      path: '/api/auth/account/delete/confirm',
    },
    {
      name: 'deleteNoEmail',
      summary: 'Account has no email',
      message: 'This account does not have an email for OTP delivery.',
      path: '/api/auth/account/delete/confirm',
    },
  ])
  @ApiUnauthorizedExamples(
    'The current password or OTP could not be verified.',
    [
      {
        name: 'deleteCurrentPasswordInvalid',
        summary: 'Wrong current password',
        message: 'Current password is invalid.',
        path: '/api/auth/account/delete/confirm',
      },
      {
        name: 'deleteOtpExpired',
        summary: 'OTP invalid or expired',
        message: 'OTP is invalid or expired.',
        path: '/api/auth/account/delete/confirm',
      },
    ],
  )
  confirmDeleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
    @Body() body: DeleteAccountConfirmRequestDto,
  ) {
    return this.authService.confirmDeleteAccount(user, claims, body);
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get current authenticated user',
    description:
      'Returns the current authenticated user profile resolved from the access token session.',
  })
  @ApiOkEnvelopeResponse(UserProfileDto, {
    description: 'Authenticated user profile.',
  })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user);
  }
}
