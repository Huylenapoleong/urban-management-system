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
import { GROUP_TYPES } from '@urban/shared-constants';
import type { AuthenticatedUser } from '@urban/shared-types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
  CreateGroupRequestDto,
  ErrorResponseDto,
  GroupMembershipDto,
  GroupMetadataDto,
  ListGroupsQueryDto,
  ManageGroupMemberRequestDto,
  UpdateGroupRequestDto,
} from '../../common/openapi/swagger.models';
import { GroupsService } from './groups.service';

@ApiTags('Groups')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create group',
    description:
      'Creates a new group in the actor scope. Group metadata may be public-by-scope, but chat history access is controlled separately at the conversation layer.',
  })
  @ApiBody({ type: CreateGroupRequestDto })
  @ApiCreatedEnvelopeResponse(GroupMetadataDto, {
    description: 'Created group metadata.',
  })
  @ApiBadRequestExamples('The create-group payload is invalid.', [
    {
      name: 'groupLocationInvalid',
      summary: 'Invalid location code',
      message: 'locationCode is invalid.',
      path: '/api/groups',
    },
  ])
  @ApiForbiddenExamples(
    'The actor cannot create a group with the requested scope/type.',
    [
      {
        name: 'groupCreateForbidden',
        summary: 'Actor cannot create this group',
        message: 'You cannot create this group.',
        path: '/api/groups',
      },
    ],
  )
  createGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateGroupRequestDto,
  ) {
    return this.groupsService.createGroup(user, body);
  }

  @Get()
  @ApiOperation({
    summary: 'List groups',
    description:
      'Lists groups discoverable in the actor scope. This endpoint exposes group metadata only, not group chat history.',
  })
  @ApiQuery({ name: 'mine', required: false, type: Boolean })
  @ApiQuery({ name: 'groupType', required: false, enum: GROUP_TYPES })
  @ApiQuery({ name: 'locationCode', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(GroupMetadataDto, {
    isArray: true,
    description: 'Paginated group metadata list.',
  })
  @ApiBadRequestExamples('One or more group list filters are invalid.', [
    {
      name: 'groupListMineInvalid',
      summary: 'Invalid mine filter',
      message: 'mine must be "true" or "false".',
      path: '/api/groups?mine=yes',
    },
  ])
  listGroups(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListGroupsQueryDto,
  ) {
    return this.groupsService.listGroups(
      user,
      query as Record<string, unknown>,
    );
  }

  @Get(':groupId')
  @ApiOperation({
    summary: 'Get group by id',
    description:
      'Returns group metadata only. Use the conversations endpoints for group message history, which is restricted to active members/admin.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(GroupMetadataDto, {
    description: 'Requested group metadata.',
  })
  @ApiNotFoundExamples('The group does not exist.', [
    {
      name: 'groupMissing',
      summary: 'Group not found',
      message: 'Group not found.',
      path: '/api/groups/01JPCY1000UNKNOWNGROUP000000',
    },
  ])
  getGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.getGroup(user, groupId);
  }

  @Patch(':groupId')
  @ApiOperation({ summary: 'Update group' })
  @ApiParam({ name: 'groupId', type: String })
  @ApiBody({ type: UpdateGroupRequestDto })
  @ApiOkEnvelopeResponse(GroupMetadataDto)
  @ApiBadRequestExamples('The update-group payload is invalid.', [
    {
      name: 'groupLocationInvalid',
      summary: 'Invalid location code',
      message: 'locationCode is invalid.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000',
    },
    {
      name: 'groupTypeInvalid',
      summary: 'Unsupported group type',
      message: 'groupType is invalid.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000',
    },
  ])
  @ApiForbiddenExamples(
    'The actor cannot update this group or the updated scope is not allowed.',
    [
      {
        name: 'groupUpdateForbidden',
        summary: 'Group update denied',
        message: 'You cannot update this group.',
        path: '/api/groups/01JPCY1000AREAGROUP0000000',
      },
      {
        name: 'groupScopeInvalid',
        summary: 'Updated group scope not allowed',
        message: 'Updated group scope is invalid.',
        path: '/api/groups/01JPCY1000AREAGROUP0000000',
      },
    ],
  )
  @ApiConflictExamples('The group changed while update was processed.', [
    {
      name: 'groupUpdateConflict',
      summary: 'Optimistic concurrency conflict',
      message: 'Group changed. Please retry.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000',
    },
  ])
  @ApiNotFoundExamples('The target group does not exist.', [
    {
      name: 'groupUpdateMissing',
      summary: 'Group not found',
      message: 'Group not found.',
      path: '/api/groups/01JPCY1000UNKNOWNGROUP000000',
    },
  ])
  updateGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() body: UpdateGroupRequestDto,
  ) {
    return this.groupsService.updateGroup(user, groupId, body);
  }

  @Delete(':groupId')
  @ApiOperation({ summary: 'Delete group' })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(GroupMetadataDto)
  @ApiForbiddenExamples('The actor cannot delete this group.', [
    {
      name: 'groupDeleteForbidden',
      summary: 'Group delete denied',
      message: 'You cannot delete this group.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000',
    },
  ])
  @ApiConflictExamples('The group changed while delete was processed.', [
    {
      name: 'groupDeleteConflict',
      summary: 'Optimistic concurrency conflict',
      message: 'Group changed. Please retry.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000',
    },
  ])
  @ApiNotFoundExamples('The target group does not exist.', [
    {
      name: 'groupDeleteMissing',
      summary: 'Group not found',
      message: 'Group not found.',
      path: '/api/groups/01JPCY1000UNKNOWNGROUP000000',
    },
  ])
  deleteGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.deleteGroup(user, groupId);
  }
  @Post(':groupId/join')
  @ApiOperation({
    summary: 'Join group',
    description:
      'Joins a group when the actor is allowed by scope and group policy. Joining enables group chat history, realtime, and other conversation-level actions.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(GroupMembershipDto, {
    description:
      'Active group membership after a successful join. If the actor is already an active member, the existing membership is returned.',
  })
  @ApiForbiddenExamples('The actor cannot join this group.', [
    {
      name: 'joinGroupForbidden',
      summary: 'Group join denied by policy',
      message: 'You cannot join this group.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/join',
    },
  ])
  @ApiNotFoundExamples('The target group does not exist.', [
    {
      name: 'joinGroupMissing',
      summary: 'Group not found',
      message: 'Group not found.',
      path: '/api/groups/01JPCY1000UNKNOWNGROUP000000/join',
    },
  ])
  joinGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.joinGroup(user, groupId);
  }

  @Post(':groupId/leave')
  @ApiOperation({
    summary: 'Leave group',
    description:
      'Leaves a group by soft-deleting the current membership. Owners cannot leave directly and must transfer/remove ownership through management flow.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(GroupMembershipDto, {
    description: 'Soft-deleted membership record after leaving the group.',
  })
  @ApiBadRequestExamples('The leave-group action is invalid.', [
    {
      name: 'ownerCannotLeave',
      summary: 'Owner cannot leave directly',
      message: 'Owner cannot leave the group directly.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/leave',
    },
  ])
  @ApiNotFoundExamples(
    'The actor is not an active member of the target group.',
    [
      {
        name: 'membershipMissing',
        summary: 'Membership not found',
        message: 'Membership not found.',
        path: '/api/groups/01JPCY1000AREAGROUP0000000/leave',
      },
    ],
  )
  leaveGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.leaveGroup(user, groupId);
  }

  @Get(':groupId/members')
  @ApiOperation({
    summary: 'List group members',
    description:
      'Returns current active members. Membership listing is protected even for public groups when policy does not allow the actor to read the member roster.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(GroupMembershipDto, {
    isArray: true,
    description: 'Active member roster for the requested group.',
  })
  @ApiForbiddenExamples('The actor is not allowed to view the group roster.', [
    {
      name: 'membersForbidden',
      summary: 'Group roster access denied',
      message: 'You cannot access members of this group.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/members',
    },
  ])
  @ApiNotFoundExamples('The group does not exist.', [
    {
      name: 'membersGroupMissing',
      summary: 'Group not found',
      message: 'Group not found.',
      path: '/api/groups/01JPCY1000UNKNOWNGROUP000000/members',
    },
  ])
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.listMembers(user, groupId);
  }

  @Patch(':groupId/members/:userId')
  @ApiOperation({
    summary: 'Manage member in group',
    description:
      'Adds, updates, or removes group members. Citizens can only add their friends to groups. Owner role cannot be assigned or removed through this endpoint.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiParam({ name: 'userId', type: String })
  @ApiBody({ type: ManageGroupMemberRequestDto })
  @ApiOkEnvelopeResponse(GroupMembershipDto, {
    description:
      'Membership state after the requested add/update/remove action.',
  })
  @ApiBadRequestExamples(
    'The member-management action is malformed or invalid for the target member state.',
    [
      {
        name: 'unsupportedAction',
        summary: 'Unsupported manage action',
        message: 'Unsupported action.',
        path: '/api/groups/01JPCY1000AREAGROUP0000000/members/01JPCY0000CITIZENB00000000',
      },
      {
        name: 'membershipExists',
        summary: 'Member already exists',
        message: 'Membership already exists.',
        path: '/api/groups/01JPCY1000AREAGROUP0000000/members/01JPCY0000CITIZENB00000000',
      },
    ],
  )
  @ApiForbiddenExamples(
    'The actor cannot perform this member-management action.',
    [
      {
        name: 'manageMembersForbidden',
        summary: 'Actor cannot manage members',
        message: 'You cannot manage members of this group.',
        path: '/api/groups/01JPCY1000AREAGROUP0000000/members/01JPCY0000CITIZENB00000000',
      },
      {
        name: 'citizenAddFriendOnly',
        summary: 'Citizen can only add friends',
        message: 'Citizens can only add their friends to groups.',
        path: '/api/groups/01JPCY1000AREAGROUP0000000/members/01JPCY0000CITIZENB00000000',
      },
    ],
  )
  @ApiConflictExamples('The group membership changed concurrently.', [
    {
      name: 'membershipConflict',
      summary: 'Optimistic concurrency conflict',
      message: 'Group membership changed. Please retry.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/members/01JPCY0000CITIZENB00000000',
    },
  ])
  @ApiNotFoundExamples('The group or membership target does not exist.', [
    {
      name: 'memberTargetMissing',
      summary: 'Membership not found',
      message: 'Membership not found.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/members/01JPCY0000CITIZENB00000000',
    },
  ])
  manageMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Body() body: ManageGroupMemberRequestDto,
  ) {
    return this.groupsService.manageMember(user, groupId, userId, body);
  }
}
