import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from '../config/app-config.service';

export function setupSwagger(
  app: INestApplication,
  config: AppConfigService,
): void {
  if (!config.swaggerEnabled) {
    return;
  }

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Urban Management API')
      .setDescription(
        [
          'Backend API for SmartCity OTT.',
          'Includes JWT authentication, role-based authorization, and DynamoDB-backed modules for users, groups, conversations, and reports.',
        ].join(' '),
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste accessToken from /auth/login or /auth/register.',
        },
        'bearer',
      )
      .build(),
    {
      operationIdFactory: (controllerKey: string, methodKey: string) =>
        `${controllerKey}_${methodKey}`,
    },
  );

  SwaggerModule.setup(`${config.apiPrefix}/docs`, app, document, {
    useGlobalPrefix: false,
    jsonDocumentUrl: `${config.apiPrefix}/docs/json`,
    yamlDocumentUrl: `${config.apiPrefix}/docs/yaml`,
    customSiteTitle: 'Urban Management API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}
