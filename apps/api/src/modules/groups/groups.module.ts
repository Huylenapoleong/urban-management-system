import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupCleanupSchedulerService } from './group-cleanup-scheduler.service';
import { GroupCleanupService } from './group-cleanup.service';
import { GroupsService } from './groups.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupCleanupService, GroupCleanupSchedulerService],
  exports: [GroupsService, GroupCleanupService],
})
export class GroupsModule {}
