import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './infrastructure/config/app-config.service';
import { loadEnvFiles } from './infrastructure/config/load-env';
import { setupSwagger } from './infrastructure/openapi/setup-swagger';
import { AppSocketIoAdapter } from './infrastructure/realtime/app-socket-io.adapter';

loadEnvFiles();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);
  app.enableShutdownHooks();
  app.useWebSocketAdapter(new AppSocketIoAdapter(app, config));
  app.setGlobalPrefix(config.apiPrefix);
  app.enableCors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
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
  await app.listen(config.port);
}

void bootstrap();
