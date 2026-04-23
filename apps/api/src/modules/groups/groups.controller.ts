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
  AddGroupMemberRequestDto,
  BanGroupMemberRequestDto,
  AuditEventItemDto,
  CreateGroupRequestDto,
  CreateGroupInviteLinkRequestDto,
  ErrorResponseDto,
  GroupBanDto,
  GroupInviteLinkDto,
  GroupMembershipDto,
  GroupMetadataDto,
  GroupOwnershipTransferResultDto,
  LeaveGroupRequestDto,
  ListAuditQueryDto,
  ListGroupsQueryDto,
  ManageGroupMemberRequestDto,
  TransferGroupOwnershipRequestDto,
  UpdateGroupMemberRoleRequestDto,
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
      {
        name: 'groupRenameOwnerOnly',
        summary: 'Only owner can rename group',
        message: 'Only the owner can rename the group.',
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

  @Post(':groupId/ownership-transfer')
  @ApiOperation({
    summary: 'Transfer group ownership',
    description:
      'Transfers owner role to another active member without requiring the current owner to leave the group. The previous owner remains in the group as deputy.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiBody({ type: TransferGroupOwnershipRequestDto })
  @ApiOkEnvelopeResponse(GroupOwnershipTransferResultDto, {
    description: 'Ownership transfer result.',
  })
  @ApiBadRequestExamples('The ownership transfer request is invalid.', [
    {
      name: 'ownershipTransferSelf',
      summary: 'Owner cannot transfer to themselves',
      message: 'Choose another active member as the new owner.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/ownership-transfer',
    },
  ])
  @ApiForbiddenExamples('The actor cannot transfer group ownership.', [
    {
      name: 'ownershipTransferForbidden',
      summary: 'Only owner or admin may transfer ownership',
      message: 'You cannot transfer group ownership.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/ownership-transfer',
    },
  ])
  @ApiNotFoundExamples('The target membership does not exist.', [
    {
      name: 'ownershipTransferMemberMissing',
      summary: 'Target membership not found',
      message: 'Membership not found.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/ownership-transfer',
    },
  ])
  transferOwnership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() body: TransferGroupOwnershipRequestDto,
  ) {
    return this.groupsService.transferOwnership(user, groupId, body);
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

  @Post(':groupId/dissolve')
  @ApiOperation({
    summary: 'Dissolve group',
    description:
      'Production-friendly alias for group deletion. Marks the group deleted, schedules cleanup, and revokes chat access for members.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(GroupMetadataDto, {
    description: 'Deleted/dissolved group metadata.',
  })
  @ApiForbiddenExamples('The actor cannot dissolve this group.', [
    {
      name: 'groupDissolveForbidden',
      summary: 'Group dissolve denied',
      message: 'You cannot delete this group.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/dissolve',
    },
  ])
  @ApiConflictExamples('The group changed while dissolve was processed.', [
    {
      name: 'groupDissolveConflict',
      summary: 'Optimistic concurrency conflict',
      message: 'Group changed. Please retry.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/dissolve',
    },
  ])
  @ApiNotFoundExamples('The target group does not exist.', [
    {
      name: 'groupDissolveMissing',
      summary: 'Group not found',
      message: 'Group not found.',
      path: '/api/groups/01JPCY1000UNKNOWNGROUP000000/dissolve',
    },
  ])
  dissolveGroup(
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
      'Leaves a group by soft-deleting the current membership. When the current actor is the owner, they must provide a successor active member who will become the new owner in the same transaction.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiBody({ type: LeaveGroupRequestDto, required: false })
  @ApiOkEnvelopeResponse(GroupMembershipDto, {
    description: 'Soft-deleted membership record after leaving the group.',
  })
  @ApiBadRequestExamples('The leave-group action is invalid.', [
    {
      name: 'ownerSuccessorRequired',
      summary: 'Owner must choose successor',
      message:
        'Owner must choose another active member as the new owner before leaving.',
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
    @Body() body?: LeaveGroupRequestDto,
  ) {
    return this.groupsService.leaveGroup(user, groupId, body);
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

  @Get(':groupId/audit')
  @ApiOperation({
    summary: 'List group audit events',
    description:
      'Returns structured audit events for the group lifecycle and member management actions. This is separate from conversation audit history.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(AuditEventItemDto, {
    isArray: true,
    description: 'Structured group audit events.',
  })
  @ApiForbiddenExamples('The actor cannot view group audit events.', [
    {
      name: 'groupAuditForbidden',
      summary: 'Group audit access denied',
      message: 'You cannot manage members of this group.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/audit',
    },
  ])
  listAuditEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Query() query: ListAuditQueryDto,
  ) {
    return this.groupsService.listAuditEvents(
      user,
      groupId,
      query as Record<string, unknown>,
    );
  }

  @Get(':groupId/bans')
  @ApiOperation({
    summary: 'List active group bans',
    description:
      'Returns currently active bans for the group. Only owner, deputy, or admin may view group moderation state.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(GroupBanDto, {
    isArray: true,
    description: 'Currently active bans for the group.',
  })
  @ApiForbiddenExamples('The actor cannot view group bans.', [
    {
      name: 'listBansForbidden',
      summary: 'Ban list access denied',
      message: 'You cannot manage members of this group.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/bans',
    },
  ])
  listBans(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.listBans(user, groupId);
  }

  @Post(':groupId/bans/:userId')
  @ApiOperation({
    summary: 'Ban user from group',
    description:
      'Creates or returns an active group ban. If the target is an active member, their group membership is revoked immediately and the group conversation is removed from their inbox/realtime rooms.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiParam({ name: 'userId', type: String })
  @ApiBody({ type: BanGroupMemberRequestDto, required: false })
  @ApiOkEnvelopeResponse(GroupBanDto, {
    description: 'Active ban state for the target user.',
  })
  @ApiBadRequestExamples('The ban request is invalid.', [
    {
      name: 'banSelfForbidden',
      summary: 'Cannot ban self',
      message: 'You cannot ban yourself from the group.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/bans/01JPCY0000CITIZENA00000000',
    },
  ])
  @ApiForbiddenExamples('The actor cannot ban the target user.', [
    {
      name: 'banOwnerForbidden',
      summary: 'Owner cannot be banned',
      message: 'The group owner cannot be banned.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/bans/01JPCY0000CITIZENB00000000',
    },
    {
      name: 'banHierarchyForbidden',
      summary: 'Deputy cannot ban elevated member',
      message: 'Deputies can only ban regular members.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/bans/01JPCY0000CITIZENB00000000',
    },
  ])
  banMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Body() body?: BanGroupMemberRequestDto,
  ) {
    return this.groupsService.banMember(user, groupId, userId, body);
  }

  @Delete(':groupId/bans/:userId')
  @ApiOperation({
    summary: 'Unban user from group',
    description:
      'Removes an active group ban. Unbanning restores eligibility to join again, but does not restore the previous membership automatically.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(GroupBanDto, {
    description: 'The active ban that was removed.',
  })
  @ApiNotFoundExamples('The target user does not have an active group ban.', [
    {
      name: 'groupBanMissing',
      summary: 'Group ban not found',
      message: 'Group ban not found.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/bans/01JPCY0000CITIZENB00000000',
    },
  ])
  unbanMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    return this.groupsService.unbanMember(user, groupId, userId);
  }

  @Get(':groupId/invite-links')
  @ApiOperation({
    summary: 'List group invite links',
    description:
      'Returns invite links managed for the group. Only owner, deputy, or admin may list invite links.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(GroupInviteLinkDto, {
    isArray: true,
    description: 'Invite links currently registered for the group.',
  })
  listInviteLinks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.listInviteLinks(user, groupId);
  }

  @Post(':groupId/invite-links')
  @ApiOperation({
    summary: 'Create group invite link',
    description:
      'Creates a new invite link for onboarding into the group. Invite links are managed by owner, deputy, or admin and redeemed through the invite-code join endpoint.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiBody({ type: CreateGroupInviteLinkRequestDto, required: false })
  @ApiOkEnvelopeResponse(GroupInviteLinkDto, {
    description: 'Created invite link.',
  })
  createInviteLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() body?: CreateGroupInviteLinkRequestDto,
  ) {
    return this.groupsService.createInviteLink(user, groupId, body);
  }

  @Delete(':groupId/invite-links/:inviteId')
  @ApiOperation({
    summary: 'Revoke group invite link',
    description:
      'Disables an invite link and removes its code lookup so it can no longer be redeemed.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiParam({ name: 'inviteId', type: String })
  @ApiOkEnvelopeResponse(GroupInviteLinkDto, {
    description: 'Invite link state after revocation.',
  })
  revokeInviteLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.groupsService.revokeInviteLink(user, groupId, inviteId);
  }

  @Post('invite-links/:code/join')
  @ApiOperation({
    summary: 'Join group by invite code',
    description:
      'Redeems an invite link code and joins the actor to the target group when the code is still active and the actor is not banned.',
  })
  @ApiParam({ name: 'code', type: String })
  @ApiOkEnvelopeResponse(GroupMembershipDto, {
    description: 'Active membership after invite redemption.',
  })
  joinByInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
  ) {
    return this.groupsService.joinGroupByInvite(user, code);
  }

  @Post(':groupId/members')
  @ApiOperation({
    summary: 'Add member to group',
    description:
      'Adds a new active member to the group. The new member may be assigned MEMBER or DEPUTY. Owner cannot be assigned through this endpoint.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiBody({ type: AddGroupMemberRequestDto })
  @ApiOkEnvelopeResponse(GroupMembershipDto, {
    description: 'Membership state after the member was added.',
  })
  @ApiBadRequestExamples('The add-member payload is invalid.', [
    {
      name: 'memberExists',
      summary: 'Member already exists',
      message: 'Membership already exists.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/members',
    },
  ])
  @ApiForbiddenExamples('The actor cannot add this member to the group.', [
    {
      name: 'addMemberForbidden',
      summary: 'Add member denied',
      message: 'You cannot manage members of this group.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/members',
    },
  ])
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() body: AddGroupMemberRequestDto,
  ) {
    return this.groupsService.addMember(user, groupId, body);
  }

  @Patch(':groupId/members/:userId/role')
  @ApiOperation({
    summary: 'Update member role in group',
    description:
      'Updates an active member role between DEPUTY and MEMBER. Owner role cannot be assigned through this endpoint.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiParam({ name: 'userId', type: String })
  @ApiBody({ type: UpdateGroupMemberRoleRequestDto })
  @ApiOkEnvelopeResponse(GroupMembershipDto, {
    description: 'Membership state after the role update.',
  })
  @ApiBadRequestExamples('The role update request is invalid.', [
    {
      name: 'ownerRoleForbidden',
      summary: 'Owner role cannot be assigned',
      message: 'Owner role cannot be assigned via member management.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/members/01JPCY0000CITIZENB00000000/role',
    },
  ])
  @ApiForbiddenExamples('The actor cannot update this member role.', [
    {
      name: 'updateRoleForbidden',
      summary: 'Role update denied',
      message: 'You cannot manage members of this group.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/members/01JPCY0000CITIZENB00000000/role',
    },
  ])
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Body() body: UpdateGroupMemberRoleRequestDto,
  ) {
    return this.groupsService.updateMemberRole(user, groupId, userId, body);
  }

  @Delete(':groupId/members/:userId')
  @ApiOperation({
    summary: 'Remove member from group',
    description:
      'Removes an active member from the group. Owner cannot be removed through this endpoint.',
  })
  @ApiParam({ name: 'groupId', type: String })
  @ApiParam({ name: 'userId', type: String })
  @ApiOkEnvelopeResponse(GroupMembershipDto, {
    description: 'Soft-deleted membership state after the member was removed.',
  })
  @ApiForbiddenExamples('The actor cannot remove this member.', [
    {
      name: 'removeMemberForbidden',
      summary: 'Remove member denied',
      message: 'You cannot manage members of this group.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/members/01JPCY0000CITIZENB00000000',
    },
  ])
  @ApiNotFoundExamples('The target membership does not exist.', [
    {
      name: 'removeMemberMissing',
      summary: 'Membership not found',
      message: 'Membership not found.',
      path: '/api/groups/01JPCY1000AREAGROUP0000000/members/01JPCY0000CITIZENB00000000',
    },
  ])
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    return this.groupsService.removeMember(user, groupId, userId);
  }

  @Patch(':groupId/members/:userId')
  @ApiOperation({
    summary: 'Manage member in group',
    deprecated: true,
    description:
      'Legacy member-management endpoint. Prefer the explicit add-member, update-role, and remove-member routes for new integrations.',
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
