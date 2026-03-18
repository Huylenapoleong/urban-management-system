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
import { GROUP_TYPES } from '@urban/shared-constants';
import type { AuthenticatedUser } from '@urban/shared-types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiCreatedEnvelopeResponse,
  ApiOkEnvelopeResponse,
} from '../../common/openapi/swagger-envelope';
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
  @ApiOperation({ summary: 'Create group' })
  @ApiBody({ type: CreateGroupRequestDto })
  @ApiCreatedEnvelopeResponse(GroupMetadataDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  createGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateGroupRequestDto,
  ) {
    return this.groupsService.createGroup(user, body);
  }

  @Get()
  @ApiOperation({ summary: 'List groups' })
  @ApiQuery({ name: 'mine', required: false, type: Boolean })
  @ApiQuery({ name: 'groupType', required: false, enum: GROUP_TYPES })
  @ApiQuery({ name: 'locationCode', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(GroupMetadataDto, { isArray: true })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
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
  @ApiOperation({ summary: 'Get group by id' })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(GroupMetadataDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto })
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
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
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
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  deleteGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.deleteGroup(user, groupId);
  }
  @Post(':groupId/join')
  @ApiOperation({ summary: 'Join group' })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(GroupMembershipDto)
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  joinGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.joinGroup(user, groupId);
  }

  @Post(':groupId/leave')
  @ApiOperation({ summary: 'Leave group' })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(GroupMembershipDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  leaveGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.leaveGroup(user, groupId);
  }

  @Get(':groupId/members')
  @ApiOperation({ summary: 'List group members' })
  @ApiParam({ name: 'groupId', type: String })
  @ApiOkEnvelopeResponse(GroupMembershipDto, { isArray: true })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.listMembers(user, groupId);
  }

  @Patch(':groupId/members/:userId')
  @ApiOperation({ summary: 'Manage member in group' })
  @ApiParam({ name: 'groupId', type: String })
  @ApiParam({ name: 'userId', type: String })
  @ApiBody({ type: ManageGroupMemberRequestDto })
  @ApiOkEnvelopeResponse(GroupMembershipDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  manageMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Body() body: ManageGroupMemberRequestDto,
  ) {
    return this.groupsService.manageMember(user, groupId, userId, body);
  }
}
