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
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser, JwtClaims } from '@urban/shared-types';
import { CurrentAuthClaims } from '../../common/decorators/current-auth-claims.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { extractSessionClientMetadata } from '../../common/request-session-metadata';
import {
  ApiCreatedEnvelopeResponse,
  ApiOkEnvelopeResponse,
} from '../../common/openapi/swagger-envelope';
import {
  AccountLifecycleOtpVerifyRequestDto,
  AccountLifecycleResultDto,
  AuthSessionDto,
  AuthSessionInfoDto,
  AuthOtpChallengeResultDto,
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
  RegisterOtpRequestDto,
  RegisterOtpVerifyRequestDto,
  RefreshRequestDto,
  RegisterRequestDto,
  RevokeSessionResultDto,
  UserProfileDto,
} from '../../common/openapi/swagger.models';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register citizen account' })
  @ApiBody({ type: RegisterRequestDto })
  @ApiCreatedEnvelopeResponse(AuthSessionDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  register(@Body() body: RegisterRequestDto, @Req() request: Request) {
    return this.authService.register(
      body,
      extractSessionClientMetadata(request),
    );
  }

  @Public()
  @Post('register/request-otp')
  @ApiOperation({ summary: 'Request OTP for citizen registration' })
  @ApiBody({ type: RegisterOtpRequestDto })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  requestRegisterOtp(@Body() body: RegisterOtpRequestDto) {
    return this.authService.requestRegisterOtp(body);
  }

  @Public()
  @Post('register/verify-otp')
  @ApiOperation({
    summary: 'Verify registration OTP and create citizen account',
  })
  @ApiBody({ type: RegisterOtpVerifyRequestDto })
  @ApiOkEnvelopeResponse(AuthSessionDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
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
  @ApiOperation({ summary: 'Login with email or phone' })
  @ApiBody({ type: LoginRequestDto })
  @ApiOkEnvelopeResponse(AuthSessionDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  login(@Body() body: LoginRequestDto, @Req() request: Request) {
    return this.authService.login(body, extractSessionClientMetadata(request));
  }

  @Public()
  @Post('login/request-otp')
  @ApiOperation({ summary: 'Request login OTP after password verification' })
  @ApiBody({ type: LoginOtpRequestDto })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  requestLoginOtp(@Body() body: LoginOtpRequestDto) {
    return this.authService.requestLoginOtp(body);
  }

  @Public()
  @Post('login/verify-otp')
  @ApiOperation({ summary: 'Verify login OTP and issue token pair' })
  @ApiBody({ type: LoginOtpVerifyRequestDto })
  @ApiOkEnvelopeResponse(AuthSessionDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
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
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token pair' })
  @ApiBody({ type: RefreshRequestDto })
  @ApiOkEnvelopeResponse(AuthSessionDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  refresh(@Body() body: RefreshRequestDto, @Req() request: Request) {
    return this.authService.refresh(
      body,
      extractSessionClientMetadata(request),
    );
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke a refresh token session' })
  @ApiBody({ type: LogoutRequestDto })
  @ApiOkEnvelopeResponse(LogoutResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  logout(@Body() body: LogoutRequestDto) {
    return this.authService.logout(body);
  }

  @Public()
  @Post('password/forgot/request')
  @ApiOperation({ summary: 'Request password reset OTP by login identity' })
  @ApiBody({ type: ForgotPasswordRequestDto })
  @ApiOkEnvelopeResponse(GenericAcceptedResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  requestForgotPasswordOtp(@Body() body: ForgotPasswordRequestDto) {
    return this.authService.requestForgotPasswordOtp(body);
  }

  @Public()
  @Post('password/forgot/confirm')
  @ApiOperation({ summary: 'Verify OTP and reset password' })
  @ApiBody({ type: ForgotPasswordConfirmRequestDto })
  @ApiOkEnvelopeResponse(ForgotPasswordConfirmResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  confirmForgotPassword(@Body() body: ForgotPasswordConfirmRequestDto) {
    return this.authService.confirmForgotPassword(body);
  }

  @Get('sessions')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List active and recent session history' })
  @ApiOkEnvelopeResponse(AuthSessionInfoDto, { isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  sessions(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
  ) {
    return this.authService.listSessions(user, claims);
  }

  @Delete('sessions/:sessionId')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Revoke a session by id' })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiOkEnvelopeResponse(RevokeSessionResultDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
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
  })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiOkEnvelopeResponse(DismissSessionHistoryResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  dismissSessionHistory(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
    @Param('sessionId') sessionId: string,
  ) {
    return this.authService.dismissSessionHistory(user, claims, sessionId);
  }

  @Post('logout-all')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Revoke all sessions for the current user' })
  @ApiOkEnvelopeResponse(LogoutAllResultDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
  ) {
    return this.authService.logoutAll(user, claims);
  }

  @Post('password/change/request-otp')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Request OTP for password change' })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  requestChangePasswordOtp(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
  ) {
    return this.authService.requestChangePasswordOtp(user, claims);
  }

  @Post('password/change')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Change password with current password and OTP' })
  @ApiBody({ type: ChangePasswordRequestDto })
  @ApiOkEnvelopeResponse(ChangePasswordResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
    @Body() body: ChangePasswordRequestDto,
  ) {
    return this.authService.changePassword(user, claims, body);
  }

  @Post('account/deactivate/request-otp')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Request OTP to deactivate current account' })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  requestDeactivateAccountOtp(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
  ) {
    return this.authService.requestDeactivateAccountOtp(user, claims);
  }

  @Post('account/deactivate/confirm')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Verify OTP and deactivate current account' })
  @ApiBody({ type: AccountLifecycleOtpVerifyRequestDto })
  @ApiOkEnvelopeResponse(AccountLifecycleResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  confirmDeactivateAccount(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
    @Body() body: AccountLifecycleOtpVerifyRequestDto,
  ) {
    return this.authService.confirmDeactivateAccount(user, claims, body);
  }

  @Public()
  @Post('account/reactivate/request-otp')
  @ApiOperation({ summary: 'Request OTP to reactivate a deactivated account' })
  @ApiBody({ type: ReactivateAccountOtpRequestDto })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  requestReactivateAccountOtp(@Body() body: ReactivateAccountOtpRequestDto) {
    return this.authService.requestReactivateAccountOtp(body);
  }

  @Public()
  @Post('account/reactivate/confirm')
  @ApiOperation({
    summary: 'Verify OTP and reactivate account, then issue token pair',
  })
  @ApiBody({ type: ReactivateAccountOtpVerifyRequestDto })
  @ApiOkEnvelopeResponse(AuthSessionDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
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
  })
  @ApiOkEnvelopeResponse(AuthOtpChallengeResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
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
  })
  @ApiBody({ type: DeleteAccountConfirmRequestDto })
  @ApiOkEnvelopeResponse(DeleteAccountResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  confirmDeleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthClaims() claims: JwtClaims,
    @Body() body: DeleteAccountConfirmRequestDto,
  ) {
    return this.authService.confirmDeleteAccount(user, claims, body);
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkEnvelopeResponse(UserProfileDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user);
  }
}
