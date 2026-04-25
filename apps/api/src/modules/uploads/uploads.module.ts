import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [ConversationsModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
