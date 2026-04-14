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
  ApiTooManyRequestsExamples,
} from '../../common/openapi/swagger-errors';
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
  RecallMessageRequestDto,
  RecallMessageResultDto,
  UpdateConversationPreferencesRequestDto,
  SendDirectMessageRequestDto,
  SendMessageRequestDto,
  ForwardMessageRequestDto,
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
  @ApiOperation({
    summary: 'List inbox conversations',
    description:
      'Returns only conversations visible in the current user inbox. Stranger direct-message requests remain in `/direct-requests` until accepted and do not appear here.',
  })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'isGroup', required: false, type: Boolean })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(ConversationSummaryDto, {
    isArray: true,
    description:
      'Inbox conversation summaries for the authenticated user. Deleted inbox entries are excluded.',
  })
  @ApiBadRequestExamples('One or more list filters are invalid.', [
    {
      name: 'invalidUnreadOnly',
      summary: 'Invalid boolean query value',
      message: 'unreadOnly must be "true" or "false".',
      path: '/api/conversations?unreadOnly=yes',
    },
  ])
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
    description:
      'Lists same-scope stranger citizen message requests. Use this endpoint for the "Tin nhan cho" or "Message requests" tab instead of the normal inbox.',
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
  @ApiOkEnvelopeResponse(ConversationSummaryDto, {
    isArray: true,
    description:
      'Direct-message request summaries for the authenticated user, including request state fields.',
  })
  @ApiBadRequestExamples(
    'The request list filters contain unsupported values.',
    [
      {
        name: 'invalidDirection',
        summary: 'Unsupported request direction',
        message: 'direction is invalid.',
        path: '/api/conversations/direct-requests?direction=SIDEWAYS',
      },
      {
        name: 'invalidStatus',
        summary: 'Unsupported request status',
        message: 'status is invalid.',
        path: '/api/conversations/direct-requests?status=CLOSED',
      },
    ],
  )
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
  @ApiOperation({
    summary: 'Create or continue a direct message conversation',
    description:
      'Creates the first direct message or appends to an existing DM when the actor can already message the target. Same-scope stranger citizens must use `/direct-requests` until the request is accepted.',
  })
  @ApiBody({ type: SendDirectMessageRequestDto })
  @ApiCreatedEnvelopeResponse(MessageItemDto, {
    description:
      'Returns the created message. Retries with the same `clientMessageId` are idempotent and return the original message instead of creating a duplicate.',
  })
  @ApiBadRequestExamples('The direct-message input is invalid.', [
    {
      name: 'dmSelf',
      summary: 'Cannot open DM with yourself',
      message: 'Cannot create DM with yourself.',
      path: '/api/conversations/direct',
    },
    {
      name: 'replyToMissing',
      summary: 'Reply target missing',
      message: 'replyTo message does not exist in this conversation.',
      path: '/api/conversations/direct',
    },
  ])
  @ApiForbiddenExamples(
    'The actor is not allowed to message this target directly.',
    [
      {
        name: 'citizenMustBeFriendOrAccepted',
        summary: 'Citizen direct message not allowed yet',
        message:
          'Citizens can only send direct messages to friends or accepted direct message requests.',
        path: '/api/conversations/direct',
      },
    ],
  )
  @ApiTooManyRequestsExamples(
    'The sender exceeded the short-window chat send rate limit.',
    [
      {
        name: 'messageRateLimit',
        summary: 'Message send rate limit exceeded',
        message:
          'Too many messages sent in a short time. Retry after 12 seconds.',
        path: '/api/conversations/direct',
      },
    ],
  )
  @ApiNotFoundExamples('The target user or referenced message was not found.', [
    {
      name: 'targetMissing',
      summary: 'Target user not found',
      message: 'User not found.',
      path: '/api/conversations/direct',
    },
  ])
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
    description:
      'Creates a pending same-scope stranger citizen message request. The opening message is stored, but the conversation stays out of the main inbox until the recipient accepts it.',
  })
  @ApiBody({ type: CreateDirectMessageRequestDto })
  @ApiCreatedEnvelopeResponse(ConversationSummaryDto, {
    description:
      'Returns the request conversation summary with request state fields populated for the sender.',
  })
  @ApiBadRequestExamples(
    'The direct-message request cannot be created for the provided pair.',
    [
      {
        name: 'dmRequestCitizenOnly',
        summary: 'Only citizens can use message requests',
        message:
          'Direct message requests are only supported between citizen accounts.',
        path: '/api/conversations/direct-requests',
      },
      {
        name: 'alreadyDirect',
        summary: 'Users can already message directly',
        message: 'Users can already message directly.',
        path: '/api/conversations/direct-requests',
      },
    ],
  )
  @ApiForbiddenExamples(
    'The pair is not eligible to create a direct-message request.',
    [
      {
        name: 'sameScopeOnly',
        summary: 'Same-scope requirement failed',
        message: 'Only same-scope citizens can send direct message requests.',
        path: '/api/conversations/direct-requests',
      },
      {
        name: 'requestBlocked',
        summary: 'Message requests blocked',
        message: 'Direct message requests are blocked for this conversation.',
        path: '/api/conversations/direct-requests',
      },
    ],
  )
  @ApiConflictExamples(
    'A previous direct-message request already exists for this pair.',
    [
      {
        name: 'requestPending',
        summary: 'Request already pending',
        message: 'A direct message request is already pending.',
        path: '/api/conversations/direct-requests',
      },
      {
        name: 'requestClosed',
        summary: 'Previous request already closed',
        message: 'A previous direct message request was already closed.',
        path: '/api/conversations/direct-requests',
      },
    ],
  )
  @ApiTooManyRequestsExamples(
    'The sender exceeded the short-window chat send rate limit.',
    [
      {
        name: 'directRequestRateLimit',
        summary: 'Message send rate limit exceeded',
        message:
          'Too many messages sent in a short time. Retry after 12 seconds.',
        path: '/api/conversations/direct-requests',
      },
    ],
  )
  @ApiNotFoundExamples('The target user does not exist.', [
    {
      name: 'requestTargetMissing',
      summary: 'Target user not found',
      message: 'User not found.',
      path: '/api/conversations/direct-requests',
    },
  ])
  createDirectMessageRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateDirectMessageRequestDto,
  ) {
    return this.conversationsService.createDirectMessageRequest(user, body);
  }

  @Post('direct-requests/:conversationId/accept')
  @ApiOperation({
    summary: 'Accept an incoming direct message request',
    description:
      'Accepts a pending direct-message request and promotes the conversation into normal direct-chat access.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like dm:<userId>. Legacy ids DM#... also work when URL-encoded.',
  })
  @ApiOkEnvelopeResponse(ConversationSummaryDto, {
    description:
      'Updated conversation summary after the request was accepted. Request fields are cleared from the inbox summary.',
  })
  @ApiBadRequestExamples(
    'The provided conversation id is not a valid direct-message request conversation.',
    [
      {
        name: 'dmRequestOnly',
        summary: 'Wrong conversation type',
        message:
          'Direct message request actions are only supported for DM conversations.',
        path: '/api/conversations/direct-requests/group:01JPCY1000AREAGROUP0000000/accept',
      },
    ],
  )
  @ApiForbiddenExamples('Only the recipient can respond to the request.', [
    {
      name: 'requestRecipientOnly',
      summary: 'Actor is not the recipient',
      message: 'Only the request recipient can perform this action.',
      path: '/api/conversations/direct-requests/dm:01JPCY0000CITIZENB00000000/accept',
    },
  ])
  @ApiConflictExamples('The request is no longer pending.', [
    {
      name: 'requestNoLongerPending',
      summary: 'Already handled request',
      message: 'This direct message request is no longer pending.',
      path: '/api/conversations/direct-requests/dm:01JPCY0000CITIZENB00000000/accept',
    },
  ])
  @ApiNotFoundExamples('The direct-message request no longer exists.', [
    {
      name: 'requestMissing',
      summary: 'Direct message request not found',
      message: 'Direct message request not found.',
      path: '/api/conversations/direct-requests/dm:01JPCY0000CITIZENB00000000/accept',
    },
  ])
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
  @ApiOperation({
    summary: 'Ignore an incoming direct message request',
    description:
      'Marks a pending direct-message request as ignored without promoting it into the main inbox.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like dm:<userId>. Legacy ids DM#... also work when URL-encoded.',
  })
  @ApiOkEnvelopeResponse(ConversationSummaryDto, {
    description: 'Updated request summary after the request was ignored.',
  })
  @ApiBadRequestExamples(
    'The provided conversation id is not a valid direct-message request conversation.',
    [
      {
        name: 'ignoreWrongType',
        summary: 'Wrong conversation type',
        message:
          'Direct message request actions are only supported for DM conversations.',
        path: '/api/conversations/direct-requests/group:01JPCY1000AREAGROUP0000000/ignore',
      },
    ],
  )
  @ApiForbiddenExamples('Only the request recipient can ignore the request.', [
    {
      name: 'ignoreRecipientOnly',
      summary: 'Actor is not the recipient',
      message: 'Only the request recipient can perform this action.',
      path: '/api/conversations/direct-requests/dm:01JPCY0000CITIZENB00000000/ignore',
    },
  ])
  @ApiConflictExamples('The request is no longer pending.', [
    {
      name: 'ignoreAlreadyHandled',
      summary: 'Request already handled',
      message: 'This direct message request is no longer pending.',
      path: '/api/conversations/direct-requests/dm:01JPCY0000CITIZENB00000000/ignore',
    },
  ])
  @ApiNotFoundExamples('The direct-message request no longer exists.', [
    {
      name: 'ignoreMissing',
      summary: 'Direct message request not found',
      message: 'Direct message request not found.',
      path: '/api/conversations/direct-requests/dm:01JPCY0000CITIZENB00000000/ignore',
    },
  ])
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
  @ApiOperation({
    summary: 'Reject an incoming direct message request',
    description:
      'Rejects a pending direct-message request and keeps the conversation out of the main inbox.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like dm:<userId>. Legacy ids DM#... also work when URL-encoded.',
  })
  @ApiOkEnvelopeResponse(ConversationSummaryDto, {
    description: 'Updated request summary after the request was rejected.',
  })
  @ApiBadRequestExamples(
    'The provided conversation id is not a valid direct-message request conversation.',
    [
      {
        name: 'rejectWrongType',
        summary: 'Wrong conversation type',
        message:
          'Direct message request actions are only supported for DM conversations.',
        path: '/api/conversations/direct-requests/group:01JPCY1000AREAGROUP0000000/reject',
      },
    ],
  )
  @ApiForbiddenExamples('Only the request recipient can reject the request.', [
    {
      name: 'rejectRecipientOnly',
      summary: 'Actor is not the recipient',
      message: 'Only the request recipient can perform this action.',
      path: '/api/conversations/direct-requests/dm:01JPCY0000CITIZENB00000000/reject',
    },
  ])
  @ApiConflictExamples('The request is no longer pending.', [
    {
      name: 'rejectAlreadyHandled',
      summary: 'Request already handled',
      message: 'This direct message request is no longer pending.',
      path: '/api/conversations/direct-requests/dm:01JPCY0000CITIZENB00000000/reject',
    },
  ])
  @ApiNotFoundExamples('The direct-message request no longer exists.', [
    {
      name: 'rejectMissing',
      summary: 'Direct message request not found',
      message: 'Direct message request not found.',
      path: '/api/conversations/direct-requests/dm:01JPCY0000CITIZENB00000000/reject',
    },
  ])
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
  @ApiOperation({
    summary: 'Block a direct message request conversation',
    description:
      'Blocks further stranger direct-message requests for the pair represented by this DM conversation.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like dm:<userId>. Legacy ids DM#... also work when URL-encoded.',
  })
  @ApiOkEnvelopeResponse(ConversationSummaryDto, {
    description: 'Updated request summary after the request was blocked.',
  })
  @ApiBadRequestExamples(
    'The provided conversation id is not a valid direct-message request conversation.',
    [
      {
        name: 'blockWrongType',
        summary: 'Wrong conversation type',
        message:
          'Direct message request actions are only supported for DM conversations.',
        path: '/api/conversations/direct-requests/group:01JPCY1000AREAGROUP0000000/block',
      },
    ],
  )
  @ApiForbiddenExamples('Only the request recipient can block the request.', [
    {
      name: 'blockRecipientOnly',
      summary: 'Actor is not the recipient',
      message: 'Only the request recipient can perform this action.',
      path: '/api/conversations/direct-requests/dm:01JPCY0000CITIZENB00000000/block',
    },
  ])
  @ApiConflictExamples('The request is no longer pending.', [
    {
      name: 'blockAlreadyHandled',
      summary: 'Request already handled',
      message: 'This direct message request is no longer pending.',
      path: '/api/conversations/direct-requests/dm:01JPCY0000CITIZENB00000000/block',
    },
  ])
  @ApiNotFoundExamples('The direct-message request no longer exists.', [
    {
      name: 'blockMissing',
      summary: 'Direct message request not found',
      message: 'Direct message request not found.',
      path: '/api/conversations/direct-requests/dm:01JPCY0000CITIZENB00000000/block',
    },
  ])
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
  @ApiOperation({
    summary: 'List messages in a conversation',
    description:
      'Lists conversation messages visible to the current user. Public-group metadata is discoverable through `/groups`, but group message history is member-only at the conversation layer.',
  })
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
  @ApiOkEnvelopeResponse(MessageItemDto, {
    isArray: true,
    description:
      'Paginated message history. Recalled messages remain in the timeline with recall metadata, while sender-only recalls are hidden only for the sender.',
  })
  @ApiBadRequestExamples('One or more message list filters are invalid.', [
    {
      name: 'invalidBeforeDate',
      summary: 'Invalid ISO date filter',
      message: 'before must be a valid ISO date.',
      path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages?before=soon',
    },
  ])
  @ApiForbiddenExamples(
    'The actor is not allowed to read this conversation message history.',
    [
      {
        name: 'groupMessagesMemberOnly',
        summary: 'Non-member cannot read group messages',
        message: 'You cannot access this conversation.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages',
      },
    ],
  )
  @ApiNotFoundExamples(
    'The conversation does not exist or is not available to the actor.',
    [
      {
        name: 'conversationMissing',
        summary: 'Conversation not found',
        message: 'Conversation not found.',
        path: '/api/conversations/group:01JPCY1000UNKNOWNGROUP000000/messages',
      },
    ],
  )
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
  @ApiOperation({
    summary: 'List audit events for a conversation',
    description:
      'Lists server-side audit events for the conversation. Group conversation audit is member-only even when the group metadata itself is public.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(AuditEventItemDto, {
    isArray: true,
    description: 'Paginated conversation audit events.',
  })
  @ApiForbiddenExamples(
    'The actor is not allowed to read conversation audit history.',
    [
      {
        name: 'auditMemberOnly',
        summary: 'Group audit is member-only',
        message: 'You cannot access this conversation.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/audit',
      },
    ],
  )
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
  @ApiOperation({
    summary: 'Update per-user conversation preferences',
    description:
      'Updates inbox-only preferences for the current user. These changes do not affect other conversation participants.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiBody({ type: UpdateConversationPreferencesRequestDto })
  @ApiOkEnvelopeResponse(ConversationSummaryDto, {
    description:
      'Updated inbox summary for the current user after applying archive/pin/mute preferences.',
  })
  @ApiBadRequestExamples('The preferences payload is invalid.', [
    {
      name: 'preferencesEmpty',
      summary: 'No preference fields provided',
      message: 'archived, isPinned or mutedUntil must be provided.',
      path: '/api/conversations/dm:01JPCY0000CITIZENB00000000/preferences',
    },
    {
      name: 'mutedUntilInvalid',
      summary: 'mutedUntil is not a valid ISO date',
      message: 'mutedUntil must be null or a valid ISO date.',
      path: '/api/conversations/dm:01JPCY0000CITIZENB00000000/preferences',
    },
  ])
  @ApiNotFoundExamples(
    'The conversation is not currently present in the actor inbox.',
    [
      {
        name: 'conversationMissingFromInbox',
        summary: 'Conversation not found in inbox',
        message: 'Conversation not found in inbox.',
        path: '/api/conversations/dm:01JPCY0000CITIZENB00000000/preferences',
      },
    ],
  )
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
  @ApiOperation({
    summary: 'Send message to a conversation',
    description:
      'Sends a new message into an existing conversation. FE should always provide `clientMessageId` for retry-safe idempotency.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiBody({ type: SendMessageRequestDto })
  @ApiCreatedEnvelopeResponse(MessageItemDto, {
    description:
      'Returns the created message. Retries with the same `clientMessageId` resolve to the original message instead of creating a duplicate.',
  })
  @ApiBadRequestExamples('The message payload is invalid.', [
    {
      name: 'emptyMessageBody',
      summary: 'No content or attachment provided',
      message: 'content, attachmentKey or attachmentUrl is required.',
      path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages',
    },
    {
      name: 'replyTargetMissing',
      summary: 'Reply target missing',
      message: 'replyTo message does not exist in this conversation.',
      path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages',
    },
  ])
  @ApiForbiddenExamples(
    'The actor is not allowed to send messages to this conversation.',
    [
      {
        name: 'groupSendMemberOnly',
        summary: 'Non-member cannot send to group',
        message: 'Only active members can send messages in this group.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages',
      },
      {
        name: 'requestNotAccepted',
        summary: 'Direct request not accepted yet',
        message: 'This direct message request has not been accepted yet.',
        path: '/api/conversations/dm:01JPCY0000CITIZENB00000000/messages',
      },
    ],
  )
  @ApiTooManyRequestsExamples(
    'The sender exceeded the short-window chat send rate limit.',
    [
      {
        name: 'conversationSendRateLimit',
        summary: 'Message send rate limit exceeded',
        message:
          'Too many messages sent in a short time. Retry after 12 seconds.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages',
      },
    ],
  )
  @ApiNotFoundExamples(
    'The conversation or referenced message does not exist.',
    [
      {
        name: 'conversationMissing',
        summary: 'Conversation not found',
        message: 'Conversation not found.',
        path: '/api/conversations/group:01JPCY1000UNKNOWNGROUP000000/messages',
      },
    ],
  )
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Body() body: SendMessageRequestDto,
  ) {
    return this.conversationsService.sendMessage(user, conversationId, body);
  }

  @Patch(':conversationId/messages/:messageId')
  @ApiOperation({
    summary: 'Edit a message in a conversation',
    description:
      'Edits the message content and/or attachment. Only the sender or an administrator can edit; group edits also require active membership.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiParam({ name: 'messageId', type: String })
  @ApiBody({ type: UpdateMessageRequestDto })
  @ApiOkEnvelopeResponse(MessageItemDto, {
    description: 'Updated message after edit validation and persistence.',
  })
  @ApiBadRequestExamples(
    'The message update payload is invalid or the message cannot be edited in its current state.',
    [
      {
        name: 'updateFieldsMissing',
        summary: 'No editable fields provided',
        message: 'content, attachmentKey or attachmentUrl must be provided.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001',
      },
      {
        name: 'updateMessageDeleted',
        summary: 'Message already deleted',
        message: 'Message has already been deleted.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001',
      },
    ],
  )
  @ApiForbiddenExamples('The actor is not allowed to edit this message.', [
    {
      name: 'editPermissionDenied',
      summary: 'Only sender or admin can edit',
      message: 'You cannot edit this message.',
      path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001',
    },
    {
      name: 'editGroupMembershipRequired',
      summary: 'Only active members can edit group messages',
      message: 'Only active members can edit messages in this group.',
      path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001',
    },
  ])
  @ApiConflictExamples(
    'The message changed while the edit request was being processed.',
    [
      {
        name: 'messageChanged',
        summary: 'Optimistic concurrency conflict',
        message: 'Message changed. Please retry.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001',
      },
    ],
  )
  @ApiNotFoundExamples('The target message does not exist.', [
    {
      name: 'messageMissing',
      summary: 'Message not found',
      message: 'Message not found.',
      path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000UNKNOWNMSG0000000',
    },
  ])
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

  @Post(':conversationId/messages/:messageId/recall')
  @ApiOperation({
    summary: 'Recall a message for everyone or only the sender',
    description:
      'User-facing chat removal endpoint. Use `scope=SELF` to hide a message only from the sender view, or `scope=EVERYONE` to keep a recalled placeholder for all participants.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiParam({ name: 'messageId', type: String })
  @ApiBody({ type: RecallMessageRequestDto })
  @ApiOkEnvelopeResponse(RecallMessageResultDto, {
    description:
      'Recall result containing the final scope and timestamp. Recalling the same message again is idempotent.',
  })
  @ApiBadRequestExamples(
    'The recall request is invalid for the current message state.',
    [
      {
        name: 'recallDeletedMessage',
        summary: 'Message already deleted',
        message: 'Message has already been deleted.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001/recall',
      },
    ],
  )
  @ApiForbiddenExamples(
    'The actor is not allowed to recall this message with the requested scope.',
    [
      {
        name: 'recallSelfSenderOnly',
        summary: 'SELF recall is sender-only',
        message: 'Only the sender can recall a message for themselves.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001/recall',
      },
      {
        name: 'recallGroupMembershipRequired',
        summary: 'Only active members can recall group messages',
        message: 'Only active members can recall messages in this group.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001/recall',
      },
    ],
  )
  @ApiConflictExamples(
    'The message changed while the recall request was being processed.',
    [
      {
        name: 'recallMessageChanged',
        summary: 'Optimistic concurrency conflict',
        message: 'Message changed. Please retry.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001/recall',
      },
    ],
  )
  @ApiNotFoundExamples('The target message does not exist.', [
    {
      name: 'recallMessageMissing',
      summary: 'Message not found',
      message: 'Message not found.',
      path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000UNKNOWNMSG0000000/recall',
    },
  ])
  recallMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: RecallMessageRequestDto,
  ) {
    return this.conversationsService.recallMessage(
      user,
      conversationId,
      messageId,
      body,
    );
  }

  @Post(':conversationId/messages/:messageId/forward')
  @ApiOperation({
    summary: 'Forward a message to one or more conversations',
    description:
      'Copies a source message into one or more target conversations that the actor can currently send to. Forwarded attachments are copied into the target media namespace when S3 keys are available.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiParam({ name: 'messageId', type: String })
  @ApiBody({ type: ForwardMessageRequestDto })
  @ApiCreatedEnvelopeResponse(MessageItemDto, {
    isArray: true,
    description:
      'One created message per target conversation. The response order matches the deduplicated `conversationIds` list.',
  })
  @ApiBadRequestExamples(
    'The source message or target list cannot be forwarded as requested.',
    [
      {
        name: 'forwardConversationIdsRequired',
        summary: 'Target conversation list missing',
        message: 'conversationIds is required.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001/forward',
      },
      {
        name: 'forwardRecalledMessage',
        summary: 'Recalled messages cannot be forwarded',
        message: 'Recalled messages cannot be forwarded.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001/forward',
      },
      {
        name: 'forwardSystemMessage',
        summary: 'System messages cannot be forwarded',
        message: 'System messages cannot be forwarded.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001/forward',
      },
    ],
  )
  @ApiForbiddenExamples(
    'The actor cannot read the source or send into at least one target conversation.',
    [
      {
        name: 'forwardTargetForbidden',
        summary: 'One target conversation is not writable',
        message: 'You cannot access this conversation.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001/forward',
      },
    ],
  )
  @ApiNotFoundExamples('The source message does not exist.', [
    {
      name: 'forwardSourceMissing',
      summary: 'Source message not found',
      message: 'Message not found.',
      path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000UNKNOWNMSG0000000/forward',
    },
  ])
  forwardMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: ForwardMessageRequestDto,
  ) {
    return this.conversationsService.forwardMessage(
      user,
      conversationId,
      messageId,
      body,
    );
  }

  @Delete(':conversationId/messages/:messageId')
  @ApiOperation({
    summary: 'Permanently delete a message from a conversation (admin only)',
    description:
      'Hard-delete endpoint reserved for admin/moderation workflows. End-user chat UI should use recall instead of this endpoint.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiParam({ name: 'messageId', type: String })
  @ApiOkEnvelopeResponse(MessageItemDto, {
    description:
      'Returns the deleted message snapshot that was permanently removed from storage.',
  })
  @ApiForbiddenExamples(
    'Only administrators can permanently delete messages.',
    [
      {
        name: 'deleteAdminOnly',
        summary: 'Non-admin delete blocked',
        message: 'Only administrators can permanently delete messages.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001',
      },
    ],
  )
  @ApiBadRequestExamples(
    'The message is already deleted or the conversation id is invalid.',
    [
      {
        name: 'deleteAlreadyDeleted',
        summary: 'Message already deleted',
        message: 'Message has already been deleted.',
        path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000GROUPMSG00000001',
      },
    ],
  )
  @ApiNotFoundExamples('The target message does not exist.', [
    {
      name: 'deleteMessageMissing',
      summary: 'Message not found',
      message: 'Message not found.',
      path: '/api/conversations/group:01JPCY1000AREAGROUP0000000/messages/01JPCY3000UNKNOWNMSG0000000',
    },
  ])
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
    description:
      'Removes the conversation summary only for the current user. This does not delete the underlying conversation or other participants’ inbox state.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiOkEnvelopeResponse(ConversationDeletedResultDto, {
    description: 'Inbox-only delete result for the current user.',
  })
  @ApiBadRequestExamples('The conversation id path parameter is invalid.', [
    {
      name: 'unsupportedConversationId',
      summary: 'Conversation id format not supported',
      message: 'Unsupported conversation id.',
      path: '/api/conversations/not-a-supported-id',
    },
  ])
  @ApiNotFoundExamples(
    'The conversation is not currently present in the actor inbox.',
    [
      {
        name: 'deleteConversationMissing',
        summary: 'Conversation not found in inbox',
        message: 'Conversation not found in inbox.',
        path: '/api/conversations/dm:01JPCY0000CITIZENB00000000',
      },
    ],
  )
  deleteConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationsService.deleteConversation(user, conversationId);
  }

  @Post(':conversationId/read')
  @ApiOperation({
    summary: 'Mark conversation as read',
    description:
      'Advances the current user read position for the target conversation and returns the updated conversation summary.',
  })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
  @ApiOkEnvelopeResponse(ConversationSummaryDto, {
    description:
      'Updated conversation summary after the current user read position was advanced.',
  })
  @ApiBadRequestExamples('The conversation id path parameter is invalid.', [
    {
      name: 'readUnsupportedConversationId',
      summary: 'Conversation id format not supported',
      message: 'Unsupported conversation id.',
      path: '/api/conversations/not-a-supported-id/read',
    },
  ])
  @ApiNotFoundExamples(
    'The conversation summary is not available to mark as read.',
    [
      {
        name: 'readConversationMissing',
        summary: 'Conversation not found in inbox',
        message: 'Conversation not found in inbox.',
        path: '/api/conversations/dm:01JPCY0000CITIZENB00000000/read',
      },
    ],
  )
  markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationsService.markAsRead(user, conversationId);
  }
}
