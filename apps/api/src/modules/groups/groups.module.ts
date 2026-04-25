import { forwardRef, Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { LocationsModule } from '../locations/locations.module';
import { UsersModule } from '../users/users.module';
import { GroupCleanupSchedulerService } from './group-cleanup-scheduler.service';
import { GroupCleanupService } from './group-cleanup.service';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [
    UsersModule,
    LocationsModule,
    forwardRef(() => ConversationsModule),
  ],
  controllers: [GroupsController],
  providers: [GroupsService, GroupCleanupService, GroupCleanupSchedulerService],
  exports: [GroupsService, GroupCleanupService],
})
export class GroupsModule {}
