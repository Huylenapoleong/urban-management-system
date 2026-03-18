import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { USER_ROLES, USER_STATUSES } from '@urban/shared-constants';
import type { AuthenticatedUser } from '@urban/shared-types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ApiCreatedEnvelopeResponse,
  ApiOkEnvelopeResponse,
} from '../../common/openapi/swagger-envelope';
import {
  CreateUserRequestDto,
  ErrorResponseDto,
  ListUsersQueryDto,
  UpdateProfileRequestDto,
  UpdateUserStatusRequestDto,
  UserProfileDto,
} from '../../common/openapi/swagger.models';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  @ApiOkEnvelopeResponse(UserProfileDto)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getUser(user, user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my profile' })
  @ApiBody({ type: UpdateProfileRequestDto })
  @ApiOkEnvelopeResponse(UserProfileDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProfileRequestDto,
  ) {
    return this.usersService.updateProfile(user, body);
  }

  @Roles('WARD_OFFICER', 'PROVINCE_OFFICER', 'ADMIN')
  @Get()
  @ApiOperation({ summary: 'List users in actor scope' })
  @ApiQuery({ name: 'role', required: false, enum: USER_ROLES })
  @ApiQuery({ name: 'status', required: false, enum: USER_STATUSES })
  @ApiQuery({ name: 'locationCode', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(UserProfileDto, { isArray: true })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  listUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListUsersQueryDto,
  ) {
    return this.usersService.listUsers(user, query as Record<string, unknown>);
  }

  @Roles('PROVINCE_OFFICER', 'ADMIN')
  @Post()
  @ApiOperation({ summary: 'Create officer or admin user' })
  @ApiBody({ type: CreateUserRequestDto })
  @ApiCreatedEnvelopeResponse(UserProfileDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  createUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateUserRequestDto,
  ) {
    return this.usersService.createUser(user, body);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get user by id' })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(UserProfileDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  getUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.getUser(user, userId);
  }

  @Roles('WARD_OFFICER', 'PROVINCE_OFFICER', 'ADMIN')
  @Patch(':userId/status')
  @ApiOperation({ summary: 'Update user status' })
  @ApiParam({ name: 'userId', type: String })
  @ApiBody({ type: UpdateUserStatusRequestDto })
  @ApiOkEnvelopeResponse(UserProfileDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: UpdateUserStatusRequestDto,
  ) {
    return this.usersService.updateStatus(user, userId, body);
  }
}
