import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [UsersModule, LocationsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
