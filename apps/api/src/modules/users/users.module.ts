import { forwardRef, Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [LocationsModule, forwardRef(() => ConversationsModule)],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
