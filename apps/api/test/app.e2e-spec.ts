import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({
        success: true,
        data: {
          service: 'urban-management-api',
          status: 'ok',
        },
      });
  });

  it('/health/live (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);
    const body = response.body as {
      service?: unknown;
      status?: unknown;
      timestamp?: unknown;
    };

    expect(body).toMatchObject({
      service: 'urban-management-api',
      status: 'ok',
    });
    expect(typeof body.timestamp).toBe('string');
  });
});
