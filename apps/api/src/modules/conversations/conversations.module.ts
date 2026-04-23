import { forwardRef, Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsGateway } from './conversations.gateway';
import { ChatRateLimitService } from './chat-rate-limit.service';
import { ChatSocketAuthService } from './chat-socket-auth.service';
import { ConversationsService } from './conversations.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { ConversationDispatchService } from './conversation-dispatch.service';
import { ChatOutboxService } from './chat-outbox.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { ChatCallSessionService } from './chat-call-session.service';
import { GroupsModule } from '../groups/groups.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule, forwardRef(() => GroupsModule)],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    ConversationSummaryService,
    ConversationDispatchService,
    ChatOutboxService,
    ChatRealtimeService,
    ChatCallSessionService,
    ChatRateLimitService,
    ChatSocketAuthService,
    ConversationsGateway,
  ],
  exports: [ConversationsService, ChatRealtimeService],
})
export class ConversationsModule {}
