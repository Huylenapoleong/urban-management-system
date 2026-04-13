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
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '@urban/shared-types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiCreatedEnvelopeResponse,
  ApiOkEnvelopeResponse,
} from '../../common/openapi/swagger-envelope';
import {
  AuditEventItemDto,
  ConversationDeletedResultDto,
  ConversationSummaryDto,
  CreateDirectMessageRequestDto,
  ErrorResponseDto,
  ListAuditQueryDto,
  ListConversationsQueryDto,
  ListDirectRequestsQueryDto,
  ListMessagesQueryDto,
  MessageItemDto,
  UpdateConversationPreferencesRequestDto,
  SendDirectMessageRequestDto,
  SendMessageRequestDto,
  UpdateMessageRequestDto,
} from '../../common/openapi/swagger.models';
import { ConversationsService } from './conversations.service';

@ApiTags('Conversations')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'List inbox conversations' })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'isGroup', required: false, type: Boolean })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(ConversationSummaryDto, { isArray: true })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  listConversations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.conversationsService.listConversations(
      user,
      query as Record<string, unknown>,
    );
  }

  @Get('direct-requests')
  @ApiOperation({
    summary: 'List direct message requests for the current user',
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    enum: ['INCOMING', 'OUTGOING'],
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'IGNORED', 'REJECTED', 'BLOCKED'],
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(ConversationSummaryDto, { isArray: true })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  listDirectRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDirectRequestsQueryDto,
  ) {
    return this.conversationsService.listDirectRequests(
      user,
      query as Record<string, unknown>,
    );
  }

  @Post('direct')
  @ApiOperation({ summary: 'Create or continue a direct message conversation' })
  @ApiBody({ type: SendDirectMessageRequestDto })
  @ApiCreatedEnvelopeResponse(MessageItemDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  sendDirectMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SendDirectMessageRequestDto,
  ) {
    return this.conversationsService.sendDirectMessage(user, body);
  }

  @Post('direct-requests')
  @ApiOperation({
    summary:
      'Create a direct message request for a same-scope stranger citizen',
  })
  @ApiBody({ type: CreateDirectMessageRequestDto })
  @ApiCreatedEnvelopeResponse(ConversationSummaryDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  createDirectMessageRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateDirectMessageRequestDto,
  ) {
    return this.conversationsService.createDirectMessageRequest(user, body);
  }

  @Post('direct-requests/:conversationId/accept')
  @ApiOperation({ summary: 'Accept an incoming direct message request' })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like dm:<userId>. Legacy ids DM#... also work when URL-encoded.',
  })
  @ApiOkEnvelopeResponse(ConversationSummaryDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  acceptDirectMessageRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationsService.acceptDirectMessageRequest(
      user,
      conversationId,
    );
  }

  @Post('direct-requests/:conversationId/ignore')
  @ApiOperation({ summary: 'Ignore an incoming direct message request' })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like dm:<userId>. Legacy ids DM#... also work when URL-encoded.',
  })
  @ApiOkEnvelopeResponse(ConversationSummaryDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  ignoreDirectMessageRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationsService.ignoreDirectMessageRequest(
      user,
      conversationId,
    );
  }

  @Post('direct-requests/:conversationId/reject')
  @ApiOperation({ summary: 'Reject an incoming direct message request' })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like dm:<userId>. Legacy ids DM#... also work when URL-encoded.',
  })
  @ApiOkEnvelopeResponse(ConversationSummaryDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  rejectDirectMessageRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationsService.rejectDirectMessageRequest(
      user,
      conversationId,
    );
  }

  @Post('direct-requests/:conversationId/block')
  @ApiOperation({ summary: 'Block a direct message request conversation' })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like dm:<userId>. Legacy ids DM#... also work when URL-encoded.',
  })
  @ApiOkEnvelopeResponse(ConversationSummaryDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  blockDirectMessageRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationsService.blockDirectMessageRequest(
      user,
      conversationId,
    );
  }

  @Get(':conversationId/messages')
  @ApiOperation({ summary: 'List messages in a conversation' })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOC', 'EMOJI', 'SYSTEM'],
  })
  @ApiQuery({ name: 'fromUserId', required: false, type: String })
  @ApiQuery({ name: 'before', required: false, type: String })
  @ApiQuery({ name: 'after', required: false, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(MessageItemDto, { isArray: true })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.conversationsService.listMessages(
      user,
      conversationId,
      query as Record<string, unknown>,
    );
  }

  @Get(':conversationId/audit')
  @ApiOperation({ summary: 'List audit events for a conversation' })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(AuditEventItemDto, { isArray: true })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  listAuditEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Query() query: ListAuditQueryDto,
  ) {
    return this.conversationsService.listAuditEvents(
      user,
      conversationId,
      query as Record<string, unknown>,
    );
  }

  @Patch(':conversationId/preferences')
  @ApiOperation({ summary: 'Update per-user conversation preferences' })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiBody({ type: UpdateConversationPreferencesRequestDto })
  @ApiOkEnvelopeResponse(ConversationSummaryDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  updateConversationPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Body() body: UpdateConversationPreferencesRequestDto,
  ) {
    return this.conversationsService.updateConversationPreferences(
      user,
      conversationId,
      body,
    );
  }

  @Post(':conversationId/messages')
  @ApiOperation({ summary: 'Send message to a conversation' })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiBody({ type: SendMessageRequestDto })
  @ApiCreatedEnvelopeResponse(MessageItemDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Body() body: SendMessageRequestDto,
  ) {
    return this.conversationsService.sendMessage(user, conversationId, body);
  }

  @Patch(':conversationId/messages/:messageId')
  @ApiOperation({ summary: 'Edit a message in a conversation' })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiParam({ name: 'messageId', type: String })
  @ApiBody({ type: UpdateMessageRequestDto })
  @ApiOkEnvelopeResponse(MessageItemDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  updateMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: UpdateMessageRequestDto,
  ) {
    return this.conversationsService.updateMessage(
      user,
      conversationId,
      messageId,
      body,
    );
  }

  @Delete(':conversationId/messages/:messageId')
  @ApiOperation({ summary: 'Delete a message from a conversation' })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiParam({ name: 'messageId', type: String })
  @ApiOkEnvelopeResponse(MessageItemDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  deleteMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.conversationsService.deleteMessage(
      user,
      conversationId,
      messageId,
    );
  }

  @Delete(':conversationId')
  @ApiOperation({
    summary: 'Delete conversation from the current user inbox only',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiOkEnvelopeResponse(ConversationDeletedResultDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  deleteConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationsService.deleteConversation(user, conversationId);
  }

  @Post(':conversationId/read')
  @ApiOperation({ summary: 'Mark conversation as read' })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiOkEnvelopeResponse(ConversationSummaryDto)
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationsService.markAsRead(user, conversationId);
  }
}
