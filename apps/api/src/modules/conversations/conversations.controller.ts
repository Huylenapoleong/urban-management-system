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
  ConversationSummaryDto,
  ErrorResponseDto,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  MessageItemDto,
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

  @Get(':conversationId/messages')
  @ApiOperation({ summary: 'List messages in a conversation' })
  @ApiParam({
    name: 'conversationId',
    type: String,
    description:
      'Accepts route-safe ids like group:<groupId> or dm:<userId>. Legacy ids GRP#... and DM#... also work when URL-encoded.',
  })
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
