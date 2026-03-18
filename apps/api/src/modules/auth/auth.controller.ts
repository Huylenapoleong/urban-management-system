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
  AuthSessionDto,
  AuthSessionInfoDto,
  ErrorResponseDto,
  LoginRequestDto,
  LogoutAllResultDto,
  LogoutRequestDto,
  LogoutResultDto,
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

  @Get('sessions')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List active and recently revoked sessions' })
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

  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkEnvelopeResponse(UserProfileDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user);
  }
}
