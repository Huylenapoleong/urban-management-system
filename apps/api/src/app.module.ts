import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatbotModule } from './modules/chatbot/chatbot.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { GroupsModule } from './modules/groups/groups.module';
import { ReportsModule } from './modules/reports/reports.module';
import { UsersModule } from './modules/users/users.module';
import { UploadsModule } from './modules/uploads/uploads.module';

@Module({
  imports: [
    InfrastructureModule,
    UsersModule,
    AuthModule,
    GroupsModule,
    ConversationsModule,
    ReportsModule,
    UploadsModule,
    ChatbotModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
