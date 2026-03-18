import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '@urban/shared-types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  ApiCreatedEnvelopeResponse,
  ApiOkEnvelopeResponse,
} from '../../common/openapi/swagger-envelope';
import {
  AuthSessionDto,
  ErrorResponseDto,
  LoginRequestDto,
  LogoutRequestDto,
  LogoutResultDto,
  RefreshRequestDto,
  RegisterRequestDto,
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
  register(@Body() body: RegisterRequestDto) {
    return this.authService.register(body);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login with email or phone' })
  @ApiBody({ type: LoginRequestDto })
  @ApiOkEnvelopeResponse(AuthSessionDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  login(@Body() body: LoginRequestDto) {
    return this.authService.login(body);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token pair' })
  @ApiBody({ type: RefreshRequestDto })
  @ApiOkEnvelopeResponse(AuthSessionDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  refresh(@Body() body: RefreshRequestDto) {
    return this.authService.refresh(body);
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

  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkEnvelopeResponse(UserProfileDto)
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user);
  }
}
