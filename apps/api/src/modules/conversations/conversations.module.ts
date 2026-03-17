import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsGateway } from './conversations.gateway';
import { ChatRateLimitService } from './chat-rate-limit.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { ChatSocketAuthService } from './chat-socket-auth.service';
import { ConversationsService } from './conversations.service';
import { GroupsModule } from '../groups/groups.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule, GroupsModule],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    ChatRateLimitService,
    ChatRealtimeService,
    ChatSocketAuthService,
    ConversationsGateway,
  ],
})
export class ConversationsModule {}
