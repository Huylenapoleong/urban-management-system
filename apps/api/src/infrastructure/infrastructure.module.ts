import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthorizationService } from '../common/authorization.service';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ResponseEnvelopeInterceptor } from '../common/interceptors/response-envelope.interceptor';
import { AppConfigService } from './config/app-config.service';
import { DynamoDbService } from './dynamodb/dynamodb.service';
import { UrbanTableRepository } from './dynamodb/urban-table.repository';
import { SystemController } from './health/system.controller';
import { SystemHealthService } from './health/system-health.service';
import { JwtTokenService } from './security/jwt-token.service';
import { PasswordService } from './security/password.service';
import { RefreshSessionService } from './security/refresh-session.service';
import { S3StorageService } from './storage/s3-storage.service';

@Global()
@Module({
  controllers: [SystemController],
  providers: [
    AppConfigService,
    DynamoDbService,
    UrbanTableRepository,
    PasswordService,
    JwtTokenService,
    RefreshSessionService,
    S3StorageService,
    SystemHealthService,
    AuthorizationService,
    JwtAuthGuard,
    RolesGuard,
    ApiExceptionFilter,
    ResponseEnvelopeInterceptor,
    {
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useExisting: ResponseEnvelopeInterceptor,
    },
    {
      provide: APP_FILTER,
      useExisting: ApiExceptionFilter,
    },
  ],
  exports: [
    AppConfigService,
    UrbanTableRepository,
    PasswordService,
    JwtTokenService,
    RefreshSessionService,
    S3StorageService,
    SystemHealthService,
    AuthorizationService,
  ],
})
export class InfrastructureModule {}
