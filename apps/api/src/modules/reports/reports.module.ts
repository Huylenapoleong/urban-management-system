import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { LocationsModule } from '../locations/locations.module';
import { UsersModule } from '../users/users.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [UsersModule, GroupsModule, LocationsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
