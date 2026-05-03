import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [LocationsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
