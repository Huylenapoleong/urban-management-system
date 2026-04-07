import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { createUlid } from '@urban/shared-utils';
import { AppModule } from './app.module';
import { AppConfigService } from './infrastructure/config/app-config.service';
import { loadEnvFiles } from './infrastructure/config/load-env';
import { setupSwagger } from './infrastructure/openapi/setup-swagger';
import { ObservabilityService } from './infrastructure/observability/observability.service';
import { AppSocketIoAdapter } from './infrastructure/realtime/app-socket-io.adapter';
import { RealtimeRedisService } from './infrastructure/realtime/realtime-redis.service';

loadEnvFiles();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);
  const realtimeRedisService = app.get(RealtimeRedisService);
  const observabilityService = app.get(ObservabilityService);

  await realtimeRedisService.connect();

  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId =
      readRequestId(request.headers['x-request-id']) ?? createUlid();
    const startedAt = process.hrtime.bigint();
    const mutableRequest = request as Request & { requestId?: string };

    mutableRequest.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    response.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      observabilityService.recordHttpRequest({
        durationMs,
        method: request.method,
        request,
        requestId,
        statusCode: response.statusCode,
      });
    });

    next();
  });

  app.enableShutdownHooks();
  app.useWebSocketAdapter(
    new AppSocketIoAdapter(app, config, realtimeRedisService),
  );
  app.setGlobalPrefix(config.apiPrefix);
  app.enableCors({
    origin: config.corsOriginSetting,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );
  setupSwagger(app, config);
  await app.listen(config.port, '0.0.0.0');
}

function readRequestId(
  value: string | string[] | undefined,
): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, 120);
}

void bootstrap();
