import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface LocationsListBody<TItem> {
  success: boolean;
  data: TItem[];
  meta: {
    count: number;
  };
}

interface LocationResolveBody {
  success: boolean;
  data: {
    locationCode: string;
    scope: string;
    isLegacy: boolean;
  };
}

describe('LocationsController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists provinces from the local snapshot', async () => {
    const response = await request(app.getHttpServer())
      .get('/locations/provinces')
      .expect(200);
    const body = response.body as LocationsListBody<{ code: string }>;

    expect(body.success).toBe(true);
    expect(body.meta.count).toBe(34);
    expect(body.data.some((province) => province.code === '79')).toBe(true);
  });

  it('lists wards for a province', async () => {
    const response = await request(app.getHttpServer())
      .get('/locations/wards')
      .query({ provinceCode: '79' })
      .expect(200);
    const body = response.body as LocationsListBody<{ provinceCode: string }>;

    expect(body.success).toBe(true);
    expect(body.meta.count).toBeGreaterThan(0);
    expect(body.data.every((ward) => ward.provinceCode === '79')).toBe(true);
  });

  it('resolves a v2 location code', async () => {
    const response = await request(app.getHttpServer())
      .get('/locations/resolve')
      .query({ locationCode: 'VN-79' })
      .expect(200);
    const body = response.body as LocationResolveBody;

    expect(body.success).toBe(true);
    expect(body.data.locationCode).toBe('VN-79');
    expect(body.data.scope).toBe('PROVINCE');
    expect(body.data.isLegacy).toBe(false);
  });
});
