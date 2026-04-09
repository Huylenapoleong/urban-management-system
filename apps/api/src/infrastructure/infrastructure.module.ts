import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthorizationService } from '../common/authorization.service';
import { ConversationStateService } from '../common/services/conversation-state.service';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ResponseEnvelopeInterceptor } from '../common/interceptors/response-envelope.interceptor';
import { ChatRealtimeService } from '../modules/conversations/chat-realtime.service';
import { AuditTrailService } from './audit/audit-trail.service';
import { AppConfigService } from './config/app-config.service';
import { DynamoDbService } from './dynamodb/dynamodb.service';
import { UrbanTableRepository } from './dynamodb/urban-table.repository';
import { SystemController } from './health/system.controller';
import { MaintenanceController } from './maintenance/maintenance.controller';
import { ChatReconciliationService } from './maintenance/chat-reconciliation.service';
import { SystemHealthService } from './health/system-health.service';
import { ChatPresenceService } from './realtime/chat-presence.service';
import { RealtimeRedisService } from './realtime/realtime-redis.service';
import { PushNotificationService } from './notifications/push-notification.service';
import { ObservabilityService } from './observability/observability.service';
import { RetentionMaintenanceService } from './maintenance/retention-maintenance.service';
import { RetentionMaintenanceSchedulerService } from './maintenance/retention-maintenance-scheduler.service';
import { ChatReconciliationSchedulerService } from './maintenance/chat-reconciliation-scheduler.service';
import { CircuitBreakerService } from './resilience/circuit-breaker.service';
import { JwtTokenService } from './security/jwt-token.service';
import { AuthOtpService } from './security/auth-otp.service';
import { PasswordPolicyService } from './security/password-policy.service';
import { PasswordService } from './security/password.service';
import { RefreshSessionService } from './security/refresh-session.service';
import { S3StorageService } from './storage/s3-storage.service';

@Global()
@Module({
  controllers: [SystemController, MaintenanceController],
  providers: [
    AppConfigService,
    AuditTrailService,
    CircuitBreakerService,
    DynamoDbService,
    UrbanTableRepository,
    PasswordPolicyService,
    PasswordService,
    AuthOtpService,
    JwtTokenService,
    RefreshSessionService,
    S3StorageService,
    RealtimeRedisService,
    PushNotificationService,
    ObservabilityService,
    RetentionMaintenanceService,
    RetentionMaintenanceSchedulerService,
    ChatReconciliationSchedulerService,
    ChatReconciliationService,
    ChatPresenceService,
    ChatRealtimeService,
    SystemHealthService,
    AuthorizationService,
    ConversationStateService,
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
    AuditTrailService,
    CircuitBreakerService,
    UrbanTableRepository,
    PasswordPolicyService,
    PasswordService,
    AuthOtpService,
    JwtTokenService,
    RefreshSessionService,
    S3StorageService,
    RealtimeRedisService,
    PushNotificationService,
    ObservabilityService,
    RetentionMaintenanceService,
    RetentionMaintenanceSchedulerService,
    ChatReconciliationSchedulerService,
    ChatReconciliationService,
    ChatPresenceService,
    ChatRealtimeService,
    SystemHealthService,
    AuthorizationService,
    ConversationStateService,
  ],
})
export class InfrastructureModule {}
