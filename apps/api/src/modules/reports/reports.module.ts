import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { GroupsModule } from '../groups/groups.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule, GroupsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
