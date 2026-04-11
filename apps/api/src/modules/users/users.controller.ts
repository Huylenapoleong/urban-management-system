import {
  Body,
  Controller,
  Delete,
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
  FriendActionResultDto,
  FriendRequestItemDto,
  FriendRequestQueryDto,
  FriendUserItemDto,
  SearchUsersForChatQueryDto,
  CreateUserRequestDto,
  ErrorResponseDto,
  ListFriendsQueryDto,
  ListUsersQueryDto,
  PresenceStateDto,
  PushDeviceDto,
  PushDeviceRemovalResultDto,
  RegisterPushDeviceRequestDto,
  UserDirectoryItemDto,
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

  @Get('me/presence')
  @ApiOperation({ summary: 'Get my active presence state' })
  @ApiOkEnvelopeResponse(PresenceStateDto)
  getMyPresence(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPresence(user, user.id);
  }

  @Get('me/push-devices')
  @ApiOperation({ summary: 'List my registered push devices' })
  @ApiOkEnvelopeResponse(PushDeviceDto, { isArray: true })
  listMyPushDevices(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listPushDevices(user);
  }

  @Get('me/friends')
  @ApiOperation({ summary: 'List my friends' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(FriendUserItemDto, { isArray: true })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  listMyFriends(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListFriendsQueryDto,
  ) {
    return this.usersService.listFriends(
      user,
      query as Record<string, unknown>,
    );
  }

  @Get('me/friend-requests')
  @ApiOperation({ summary: 'List my incoming/outgoing friend requests' })
  @ApiQuery({
    name: 'direction',
    required: false,
    enum: ['INCOMING', 'OUTGOING'],
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(FriendRequestItemDto, { isArray: true })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  listMyFriendRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FriendRequestQueryDto,
  ) {
    return this.usersService.listFriendRequests(
      user,
      query as Record<string, unknown>,
    );
  }

  @Post('me/friends/:userId/request')
  @ApiOperation({ summary: 'Send a friend request' })
  @ApiParam({ name: 'userId', type: String })
  @ApiCreatedEnvelopeResponse(FriendRequestItemDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  sendFriendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.sendFriendRequest(user, userId);
  }

  @Post('me/friend-requests/:userId/accept')
  @ApiOperation({ summary: 'Accept incoming friend request' })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(FriendUserItemDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  acceptFriendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.acceptFriendRequest(user, userId);
  }

  @Post('me/friend-requests/:userId/reject')
  @ApiOperation({ summary: 'Reject incoming friend request' })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(FriendActionResultDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  rejectFriendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.rejectIncomingFriendRequest(user, userId);
  }

  @Post('me/friend-requests/:userId/cancel')
  @ApiOperation({ summary: 'Cancel outgoing friend request' })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(FriendActionResultDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  cancelFriendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.cancelOutgoingFriendRequest(user, userId);
  }

  @Delete('me/friends/:userId')
  @ApiOperation({ summary: 'Remove a friend' })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(FriendActionResultDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  removeFriend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.removeFriend(user, userId);
  }

  @Get('discover')
  @ApiOperation({ summary: 'Search users for chat/friend actions' })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'mode', required: false, enum: ['all', 'chat', 'friend'] })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(UserDirectoryItemDto, { isArray: true })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  discoverUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchUsersForChatQueryDto,
  ) {
    return this.usersService.searchUsersForChatAndFriend(
      user,
      query as Record<string, unknown>,
    );
  }

  @Post('me/push-devices')
  @ApiOperation({ summary: 'Register or update my push device token' })
  @ApiBody({ type: RegisterPushDeviceRequestDto })
  @ApiCreatedEnvelopeResponse(PushDeviceDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  registerMyPushDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RegisterPushDeviceRequestDto,
  ) {
    return this.usersService.registerPushDevice(user, body);
  }

  @Delete('me/push-devices/:deviceId')
  @ApiOperation({ summary: 'Delete one of my registered push devices' })
  @ApiParam({ name: 'deviceId', type: String })
  @ApiOkEnvelopeResponse(PushDeviceRemovalResultDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  deleteMyPushDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.usersService.deletePushDevice(user, deviceId);
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
  @ApiQuery({ name: 'cursor', required: false, type: String })
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

  @Get(':userId/presence')
  @ApiOperation({ summary: 'Get active presence state for a user' })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(PresenceStateDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  getUserPresence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.getPresence(user, userId);
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
