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
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
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
  ApiBadRequestExamples,
  ApiConflictExamples,
  ApiForbiddenExamples,
  ApiNotFoundExamples,
} from '../../common/openapi/swagger-errors';
import {
  BlockActionResultDto,
  BlockedUserItemDto,
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
  @ApiOperation({
    summary: 'List my friends',
    description:
      'Returns the current user friendship list. Use cursor pagination to build infinite scrolling or segmented friend tabs on FE.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(FriendUserItemDto, {
    isArray: true,
    description:
      'Friend list for the authenticated user. Each item already contains display-ready avatar and profile data.',
  })
  @ApiBadRequestExamples('The friend list query is invalid.', [
    {
      name: 'friendsInvalidLimit',
      summary: 'Invalid pagination limit',
      message: 'limit must be a positive integer.',
      path: '/api/users/me/friends?limit=0',
    },
    {
      name: 'friendsInvalidCursor',
      summary: 'Invalid pagination cursor',
      message: 'cursor is invalid.',
      path: '/api/users/me/friends?cursor=not-base64',
    },
  ])
  listMyFriends(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListFriendsQueryDto,
  ) {
    return this.usersService.listFriends(
      user,
      query as Record<string, unknown>,
    );
  }

  @Get('me/blocks')
  @ApiOperation({
    summary: 'List users I blocked',
    description:
      'Returns the authenticated user block list. Blocked users are hidden from normal discovery and cannot send friend requests, message requests, direct messages, or calls.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(BlockedUserItemDto, {
    isArray: true,
    description:
      'Blocked users for the authenticated user, including when the block was created.',
  })
  @ApiBadRequestExamples('The block list query is invalid.', [
    {
      name: 'blocksInvalidLimit',
      summary: 'Invalid pagination limit',
      message: 'limit must be a positive integer.',
      path: '/api/users/me/blocks?limit=0',
    },
  ])
  listMyBlockedUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListFriendsQueryDto,
  ) {
    return this.usersService.listBlockedUsers(
      user,
      query as Record<string, unknown>,
    );
  }

  @Get('me/friend-requests')
  @ApiOperation({
    summary: 'List my incoming/outgoing friend requests',
    description:
      'Lists friendship requests visible to the current user. `direction=INCOMING` is typically used for the "Requests received" tab, while `OUTGOING` is used for "Pending sent requests".',
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    enum: ['INCOMING', 'OUTGOING'],
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(FriendRequestItemDto, {
    isArray: true,
    description: 'Paginated friendship requests for the authenticated user.',
  })
  @ApiBadRequestExamples('The friend-request query is invalid.', [
    {
      name: 'friendRequestsInvalidDirection',
      summary: 'Unsupported direction filter',
      message: 'direction is invalid.',
      path: '/api/users/me/friend-requests?direction=SIDEWAYS',
    },
    {
      name: 'friendRequestsInvalidLimit',
      summary: 'Invalid pagination limit',
      message: 'limit must be a positive integer.',
      path: '/api/users/me/friend-requests?limit=0',
    },
  ])
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
  @ApiOperation({
    summary: 'Send a friend request',
    description:
      'Creates a citizen-to-citizen friendship request. Location/scope no longer blocks friendship discovery; direct messaging is still controlled separately by chat policy.',
  })
  @ApiParam({
    name: 'userId',
    type: String,
    description: 'Target citizen user id.',
  })
  @ApiCreatedEnvelopeResponse(FriendRequestItemDto, {
    description:
      'Returns the outgoing friendship request item. If the same outgoing request already exists, the existing request is returned instead of creating a duplicate.',
  })
  @ApiBadRequestExamples(
    'The friend request cannot be created because the pair or input is invalid.',
    [
      {
        name: 'selfFriendRequest',
        summary: 'Cannot friend yourself',
        message: 'Cannot send a friend request to yourself.',
        path: '/api/users/me/friends/01JPCY0000CITIZENA00000000/request',
      },
      {
        name: 'alreadyFriends',
        summary: 'Users are already friends',
        message: 'Users are already friends.',
        path: '/api/users/me/friends/01JPCY0000CITIZENB00000000/request',
      },
      {
        name: 'citizenOnly',
        summary: 'Friend flow only supports citizens',
        message: 'Friend requests are only supported between citizen accounts.',
        path: '/api/users/me/friends/01JPCY0000WARDOFFICER00000/request',
      },
    ],
  )
  @ApiConflictExamples(
    'The target relationship already requires another action instead of sending a new request.',
    [
      {
        name: 'incomingAlreadyExists',
        summary: 'Target user already sent a request',
        message:
          'This user already sent you a friend request. Accept it instead.',
        path: '/api/users/me/friends/01JPCY0000CITIZENB00000000/request',
      },
    ],
  )
  @ApiNotFoundExamples('The target user does not exist.', [
    {
      name: 'friendTargetMissing',
      summary: 'Target user not found',
      message: 'User not found.',
      path: '/api/users/me/friends/01JPCY0000UNKNOWNUSER000000/request',
    },
  ])
  sendFriendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.sendFriendRequest(user, userId);
  }

  @Post('me/friend-requests/:userId/accept')
  @ApiOperation({
    summary: 'Accept incoming friend request',
    description:
      'Accepts an incoming request and creates friendship edges for both users.',
  })
  @ApiParam({
    name: 'userId',
    type: String,
    description: 'Requester user id from the incoming friend request.',
  })
  @ApiOkEnvelopeResponse(FriendUserItemDto, {
    description:
      'Returns the new friend item after both friendship edges are created.',
  })
  @ApiBadRequestExamples(
    'The accept action is not valid for the provided user id.',
    [
      {
        name: 'acceptSelf',
        summary: 'Cannot accept your own request',
        message: 'Cannot accept your own friend request.',
        path: '/api/users/me/friend-requests/01JPCY0000CITIZENA00000000/accept',
      },
    ],
  )
  @ApiNotFoundExamples(
    'No incoming friend request exists for this requester.',
    [
      {
        name: 'acceptMissingRequest',
        summary: 'Friend request not found',
        message: 'Friend request not found.',
        path: '/api/users/me/friend-requests/01JPCY0000CITIZENB00000000/accept',
      },
    ],
  )
  acceptFriendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.acceptFriendRequest(user, userId);
  }

  @Post('me/friend-requests/:userId/reject')
  @ApiOperation({
    summary: 'Reject incoming friend request',
    description:
      'Deletes both the incoming and mirrored outgoing friend-request records.',
  })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(FriendActionResultDto, {
    description: 'Returns the rejected requester id and rejection timestamp.',
  })
  @ApiNotFoundExamples(
    'No incoming friend request exists for this requester.',
    [
      {
        name: 'rejectMissingRequest',
        summary: 'Friend request not found',
        message: 'Friend request not found.',
        path: '/api/users/me/friend-requests/01JPCY0000CITIZENB00000000/reject',
      },
    ],
  )
  rejectFriendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.rejectIncomingFriendRequest(user, userId);
  }

  @Post('me/friend-requests/:userId/cancel')
  @ApiOperation({
    summary: 'Cancel outgoing friend request',
    description:
      'Cancels a previously sent outgoing friend request and removes its mirrored incoming record for the target user.',
  })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(FriendActionResultDto, {
    description:
      'Returns the canceled target user id and cancellation timestamp.',
  })
  @ApiNotFoundExamples('No outgoing friend request exists for this target.', [
    {
      name: 'cancelMissingRequest',
      summary: 'Friend request not found',
      message: 'Friend request not found.',
      path: '/api/users/me/friend-requests/01JPCY0000CITIZENB00000000/cancel',
    },
  ])
  cancelFriendRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.cancelOutgoingFriendRequest(user, userId);
  }

  @Delete('me/friends/:userId')
  @ApiOperation({
    summary: 'Remove a friend',
    description:
      'Deletes both friendship edges and clears any stray friend-request records between the two users.',
  })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(FriendActionResultDto, {
    description: 'Returns the removed friend id and removal timestamp.',
  })
  @ApiBadRequestExamples('The remove-friend request is invalid.', [
    {
      name: 'removeSelf',
      summary: 'Cannot remove yourself',
      message: 'Cannot remove yourself from friends.',
      path: '/api/users/me/friends/01JPCY0000CITIZENA00000000',
    },
  ])
  @ApiNotFoundExamples('The requested friendship does not exist.', [
    {
      name: 'friendMissing',
      summary: 'Friend edge not found',
      message: 'Friend not found.',
      path: '/api/users/me/friends/01JPCY0000CITIZENB00000000',
    },
  ])
  removeFriend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.removeFriend(user, userId);
  }

  @Post('me/blocks/:userId')
  @ApiOperation({
    summary: 'Block a user',
    description:
      'Creates a user-level block. Blocking removes friendship and pending friend requests between the pair, keeps existing chat history, and prevents new friend requests, message requests, direct messages, and calls until unblocked.',
  })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(BlockActionResultDto, {
    description: 'Returns the blocked user id and block timestamp.',
  })
  @ApiBadRequestExamples('The block request is invalid.', [
    {
      name: 'blockSelf',
      summary: 'Cannot block yourself',
      message: 'Cannot block yourself.',
      path: '/api/users/me/blocks/01JPCY0000CITIZENA00000000',
    },
  ])
  @ApiNotFoundExamples('The target user does not exist.', [
    {
      name: 'blockMissingUser',
      summary: 'Target user not found',
      message: 'User not found.',
      path: '/api/users/me/blocks/01JPCY0000UNKNOWNUSER000000',
    },
  ])
  blockUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.blockUser(user, userId);
  }

  @Delete('me/blocks/:userId')
  @ApiOperation({
    summary: 'Unblock a user',
    description:
      'Removes a user-level block. Existing chat history stays intact; only future interactions become possible again if other policy checks also allow them.',
  })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(BlockActionResultDto, {
    description: 'Returns the unblocked user id and unblock timestamp.',
  })
  @ApiNotFoundExamples('The target user is not currently blocked.', [
    {
      name: 'unblockMissing',
      summary: 'Blocked user not found',
      message: 'Blocked user not found.',
      path: '/api/users/me/blocks/01JPCY0000CITIZENB00000000',
    },
  ])
  unblockUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.unblockUser(user, userId);
  }

  @Get('discover')
  @ApiOperation({
    summary: 'Search users for chat/friend actions',
    description:
      'Discovery endpoint for FE user pickers. `mode=all` returns discoverable users, `mode=chat` returns only users that can be messaged now, and `mode=friend` returns users relevant to friendship flows.',
  })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'mode', required: false, enum: ['all', 'chat', 'friend'] })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(UserDirectoryItemDto, {
    isArray: true,
    description:
      'Discovery results already include FE-ready capability flags: `canMessage`, `canSendFriendRequest`, and `canSendMessageRequest`.',
  })
  @ApiBadRequestExamples('The discovery query contains unsupported values.', [
    {
      name: 'discoverInvalidMode',
      summary: 'Unsupported discovery mode',
      message: 'mode is invalid.',
      path: '/api/users/discover?mode=invalid',
    },
    {
      name: 'discoverInvalidLimit',
      summary: 'Invalid pagination limit',
      message: 'limit must be a positive integer.',
      path: '/api/users/discover?limit=0',
    },
  ])
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
  @ApiBadRequestExamples('The push-device registration payload is invalid.', [
    {
      name: 'pushDeviceIdRequired',
      summary: 'Missing device id',
      message: 'deviceId is required.',
      path: '/api/users/me/push-devices',
    },
    {
      name: 'pushProviderInvalid',
      summary: 'Unsupported push provider',
      message: 'provider is invalid.',
      path: '/api/users/me/push-devices',
    },
  ])
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
  @ApiNotFoundExamples('The target push device does not exist.', [
    {
      name: 'pushDeviceMissing',
      summary: 'Push device not found',
      message: 'Push device not found.',
      path: '/api/users/me/push-devices/device-unknown',
    },
  ])
  deleteMyPushDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.usersService.deletePushDevice(user, deviceId);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update my profile',
    description:
      'Updates the authenticated user profile. Citizens cannot change their own `locationCode`. Use `avatarKey` for the private-media flow; `avatarUrl` remains for backward compatibility. If both are sent during migration, the API will prefer `avatarKey`.',
  })
  @ApiBody({ type: UpdateProfileRequestDto })
  @ApiOkEnvelopeResponse(UserProfileDto, {
    description: 'Updated user profile after validation and persistence.',
  })
  @ApiBadRequestExamples('The profile update payload is invalid.', [
    {
      name: 'avatarKeyTargetMismatch',
      summary: 'avatarKey does not belong to avatar target',
      message: 'key does not match target.',
      path: '/api/users/me',
    },
    {
      name: 'emailExists',
      summary: 'Duplicate email',
      message: 'email already exists.',
      path: '/api/users/me',
    },
  ])
  @ApiForbiddenExamples(
    'The current user is not allowed to change the requested profile fields.',
    [
      {
        name: 'citizenLocationForbidden',
        summary: 'Citizen tried to change location',
        message: 'Citizens cannot change locationCode.',
        path: '/api/users/me',
      },
      {
        name: 'locationOutsideScope',
        summary: 'Officer tried to move user outside scope',
        message: 'locationCode is outside of your scope.',
        path: '/api/users/me',
      },
    ],
  )
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProfileRequestDto,
  ) {
    return this.usersService.updateProfile(user, body);
  }

  @Delete('me/avatar')
  @ApiOperation({
    summary: 'Remove my current avatar',
    description:
      'Clears the avatar currently attached to the authenticated user profile. This does not delete previously uploaded avatar files from the user upload library.',
  })
  @ApiOkEnvelopeResponse(UserProfileDto, {
    description:
      'Updated user profile after removing the current avatar reference.',
  })
  @ApiConflictExamples('The user profile changed during this request.', [
    {
      name: 'avatarClearConflict',
      summary: 'Concurrent profile update conflict',
      message: 'User profile was changed by another request. Please retry.',
      path: '/api/users/me/avatar',
    },
  ])
  deleteMyAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.clearCurrentAvatar(user);
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
  @ApiBadRequestExamples('One or more user-list filters are invalid.', [
    {
      name: 'listUsersInvalidLocation',
      summary: 'Invalid location code filter',
      message: 'locationCode is invalid.',
      path: '/api/users?locationCode=BAD-CODE',
    },
    {
      name: 'listUsersInvalidLimit',
      summary: 'Invalid pagination limit',
      message: 'limit must be a positive integer.',
      path: '/api/users?limit=0',
    },
  ])
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
  @ApiBadRequestExamples('The create-user payload is invalid.', [
    {
      name: 'createUserMissingRole',
      summary: 'Missing role field',
      message: 'role is required.',
      path: '/api/users',
    },
    {
      name: 'createUserEmailExists',
      summary: 'Duplicate email',
      message: 'email already exists.',
      path: '/api/users',
    },
  ])
  @ApiForbiddenExamples('The actor cannot create the requested user role.', [
    {
      name: 'createUserRoleForbidden',
      summary: 'Role creation denied by scope',
      message: 'You cannot create this user role.',
      path: '/api/users',
    },
  ])
  createUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateUserRequestDto,
  ) {
    return this.usersService.createUser(user, body);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search user by exact phone or email',
    description:
      'Exact-match lookup by phone or email for the authenticated user scope. This is intended for precise search, not fuzzy discovery.',
  })
  @ApiQuery({
    name: 'q',
    type: String,
    description: 'Phone number or email address',
  })
  @ApiOkEnvelopeResponse(UserProfileDto, {
    description: 'Exact user match for the provided phone or email.',
  })
  @ApiBadRequestExamples('The exact-search query is missing.', [
    {
      name: 'exactSearchRequired',
      summary: 'Missing q parameter',
      message: 'Search query is required.',
      path: '/api/users/search',
    },
  ])
  @ApiNotFoundExamples('No active user matched the exact phone/email input.', [
    {
      name: 'exactSearchNotFound',
      summary: 'No user matched the query',
      message: 'No user matched the provided phone or email.',
      path: '/api/users/search?q=ghost%40example.com',
    },
  ])
  searchExact(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query: string,
  ) {
    return this.usersService.searchExact(user, query);
  }

  @Get(':userId/presence')
  @ApiOperation({ summary: 'Get active presence state for a user' })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(PresenceStateDto)
  @ApiForbiddenExamples('The actor cannot access this user presence.', [
    {
      name: 'presenceForbidden',
      summary: 'Profile access denied',
      message: 'You cannot access this profile.',
      path: '/api/users/01JPCY0000CITIZENB00000000/presence',
    },
  ])
  @ApiNotFoundExamples('The target user does not exist.', [
    {
      name: 'presenceUserMissing',
      summary: 'User not found',
      message: 'User not found.',
      path: '/api/users/01JPCY0000UNKNOWNUSER000000/presence',
    },
  ])
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
  @ApiForbiddenExamples('The actor cannot access this profile.', [
    {
      name: 'profileForbidden',
      summary: 'Profile access denied',
      message: 'You cannot access this profile.',
      path: '/api/users/01JPCY0000CITIZENB00000000',
    },
  ])
  @ApiNotFoundExamples('The target user does not exist.', [
    {
      name: 'profileUserMissing',
      summary: 'User not found',
      message: 'User not found.',
      path: '/api/users/01JPCY0000UNKNOWNUSER000000',
    },
  ])
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
  @ApiBadRequestExamples('The update-status payload is invalid.', [
    {
      name: 'statusRequired',
      summary: 'Missing status field',
      message: 'status is required.',
      path: '/api/users/01JPCY0000CITIZENB00000000/status',
    },
    {
      name: 'statusInvalid',
      summary: 'Unsupported status value',
      message: 'status is invalid.',
      path: '/api/users/01JPCY0000CITIZENB00000000/status',
    },
  ])
  @ApiForbiddenExamples('The actor cannot change this user status.', [
    {
      name: 'statusForbidden',
      summary: 'Status update denied',
      message: 'You cannot change this user status.',
      path: '/api/users/01JPCY0000CITIZENB00000000/status',
    },
  ])
  @ApiConflictExamples('The user changed while status update was processed.', [
    {
      name: 'statusConflict',
      summary: 'Optimistic concurrency conflict',
      message: 'User changed. Please retry.',
      path: '/api/users/01JPCY0000CITIZENB00000000/status',
    },
  ])
  @ApiNotFoundExamples('The target user does not exist.', [
    {
      name: 'statusUserMissing',
      summary: 'User not found',
      message: 'User not found.',
      path: '/api/users/01JPCY0000UNKNOWNUSER000000/status',
    },
  ])
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: UpdateUserStatusRequestDto,
  ) {
    return this.usersService.updateStatus(user, userId, body);
  }
}
