import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { UserRole } from '@urban/shared-constants';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ResponseEnvelopeInterceptor } from '../src/common/interceptors/response-envelope.interceptor';
import { SystemHealthService } from '../src/infrastructure/health/system-health.service';
import { SystemController } from '../src/infrastructure/health/system.controller';
import { ChatReconciliationService } from '../src/infrastructure/maintenance/chat-reconciliation.service';
import { MaintenanceController } from '../src/infrastructure/maintenance/maintenance.controller';
import { RetentionMaintenanceService } from '../src/infrastructure/maintenance/retention-maintenance.service';
import { ObservabilityService } from '../src/infrastructure/observability/observability.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { ConversationsController } from '../src/modules/conversations/conversations.controller';
import { ConversationsService } from '../src/modules/conversations/conversations.service';
import { GroupsController } from '../src/modules/groups/groups.controller';
import { GroupsService } from '../src/modules/groups/groups.service';
import { ReportsController } from '../src/modules/reports/reports.controller';
import { ReportsService } from '../src/modules/reports/reports.service';
import { UploadsController } from '../src/modules/uploads/uploads.controller';
import { UploadsService } from '../src/modules/uploads/uploads.service';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';

type TestRole = 'ANON' | UserRole;
type HttpMethod = 'get' | 'post' | 'patch' | 'delete';

interface EndpointCase {
  name: string;
  method: HttpMethod;
  url: string;
  body?: Record<string, unknown>;
  expected: Record<TestRole, number>;
}

interface RequestWithUser extends Request {
  user?: {
    id: string;
    role: UserRole;
    locationCode: string;
    fullName: string;
    status: 'ACTIVE';
    createdAt: string;
    updatedAt: string;
  };
}

const ROLE_HEADER_NAME = 'x-test-role';

@Injectable()
class TestJwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return true;
  }
}

describe('Endpoint Role Matrix (e2e)', () => {
  let app: INestApplication<App>;

  const systemHealthService = {
    getLiveStatus: jest.fn(),
    getReadinessStatus: jest.fn(),
  };
  const observabilityService = {
    getSnapshot: jest.fn(),
    getPrometheusMetrics: jest.fn(),
  };
  const retentionMaintenanceService = {
    preview: jest.fn(),
    purge: jest.fn(),
  };
  const chatReconciliationService = {
    preview: jest.fn(),
    repair: jest.fn(),
  };
  const authService = {
    login: jest.fn(),
    refresh: jest.fn(),
    me: jest.fn(),
  };
  const usersService = {
    getUser: jest.fn(),
    listUsers: jest.fn(),
    createUser: jest.fn(),
    updateStatus: jest.fn(),
  };
  const groupsService = {
    listGroups: jest.fn(),
  };
  const reportsService = {
    listReports: jest.fn(),
  };
  const conversationsService = {
    listConversations: jest.fn(),
  };
  const uploadsService = {
    uploadMedia: jest.fn(),
  };

  const endpointCases: EndpointCase[] = [
    {
      name: 'Health Live',
      method: 'get',
      url: '/api/health/live',
      expected: {
        ANON: 200,
        CITIZEN: 200,
        WARD_OFFICER: 200,
        PROVINCE_OFFICER: 200,
        ADMIN: 200,
      },
    },
    {
      name: 'Health Ready',
      method: 'get',
      url: '/api/health/ready',
      expected: {
        ANON: 200,
        CITIZEN: 200,
        WARD_OFFICER: 200,
        PROVINCE_OFFICER: 200,
        ADMIN: 200,
      },
    },
    {
      name: 'Health Metrics',
      method: 'get',
      url: '/api/health/metrics',
      expected: {
        ANON: 401,
        CITIZEN: 403,
        WARD_OFFICER: 403,
        PROVINCE_OFFICER: 403,
        ADMIN: 200,
      },
    },
    {
      name: 'Health Metrics Prometheus',
      method: 'get',
      url: '/api/health/metrics/prometheus',
      expected: {
        ANON: 401,
        CITIZEN: 403,
        WARD_OFFICER: 403,
        PROVINCE_OFFICER: 403,
        ADMIN: 200,
      },
    },
    {
      name: 'Maintenance Retention Preview',
      method: 'get',
      url: '/api/maintenance/retention/preview',
      expected: {
        ANON: 401,
        CITIZEN: 403,
        WARD_OFFICER: 403,
        PROVINCE_OFFICER: 403,
        ADMIN: 200,
      },
    },
    {
      name: 'Maintenance Retention Purge',
      method: 'post',
      url: '/api/maintenance/retention/purge',
      expected: {
        ANON: 401,
        CITIZEN: 403,
        WARD_OFFICER: 403,
        PROVINCE_OFFICER: 403,
        ADMIN: 201,
      },
    },
    {
      name: 'Auth Login (Public)',
      method: 'post',
      url: '/api/auth/login',
      body: {
        login: 'citizen@example.com',
        password: 'Ums@2026Secure1',
      },
      expected: {
        ANON: 201,
        CITIZEN: 201,
        WARD_OFFICER: 201,
        PROVINCE_OFFICER: 201,
        ADMIN: 201,
      },
    },
    {
      name: 'Auth Refresh (Public)',
      method: 'post',
      url: '/api/auth/refresh',
      body: {
        refreshToken: 'this-is-a-sample-refresh-token-value',
      },
      expected: {
        ANON: 201,
        CITIZEN: 201,
        WARD_OFFICER: 201,
        PROVINCE_OFFICER: 201,
        ADMIN: 201,
      },
    },
    {
      name: 'Auth Me',
      method: 'get',
      url: '/api/auth/me',
      expected: {
        ANON: 401,
        CITIZEN: 200,
        WARD_OFFICER: 200,
        PROVINCE_OFFICER: 200,
        ADMIN: 200,
      },
    },
    {
      name: 'Users Me',
      method: 'get',
      url: '/api/users/me',
      expected: {
        ANON: 401,
        CITIZEN: 200,
        WARD_OFFICER: 200,
        PROVINCE_OFFICER: 200,
        ADMIN: 200,
      },
    },
    {
      name: 'Users List',
      method: 'get',
      url: '/api/users?limit=20',
      expected: {
        ANON: 401,
        CITIZEN: 403,
        WARD_OFFICER: 200,
        PROVINCE_OFFICER: 200,
        ADMIN: 200,
      },
    },
    {
      name: 'Users Create',
      method: 'post',
      url: '/api/users',
      body: {
        fullName: 'Ward Officer A',
        email: 'ward.a@smartcity.local',
        password: 'Ums@2026Secure1',
        role: 'WARD_OFFICER',
        locationCode: 'VN-79-25747',
      },
      expected: {
        ANON: 401,
        CITIZEN: 403,
        WARD_OFFICER: 403,
        PROVINCE_OFFICER: 201,
        ADMIN: 201,
      },
    },
    {
      name: 'Users Update Status',
      method: 'patch',
      url: '/api/users/01JPCY0000CITIZENB00000000/status',
      body: {
        status: 'ACTIVE',
      },
      expected: {
        ANON: 401,
        CITIZEN: 403,
        WARD_OFFICER: 200,
        PROVINCE_OFFICER: 200,
        ADMIN: 200,
      },
    },
    {
      name: 'Groups List',
      method: 'get',
      url: '/api/groups?limit=20',
      expected: {
        ANON: 401,
        CITIZEN: 200,
        WARD_OFFICER: 200,
        PROVINCE_OFFICER: 200,
        ADMIN: 200,
      },
    },
    {
      name: 'Reports List',
      method: 'get',
      url: '/api/reports?limit=20',
      expected: {
        ANON: 401,
        CITIZEN: 200,
        WARD_OFFICER: 200,
        PROVINCE_OFFICER: 200,
        ADMIN: 200,
      },
    },
    {
      name: 'Conversations List',
      method: 'get',
      url: '/api/conversations?limit=20',
      expected: {
        ANON: 401,
        CITIZEN: 200,
        WARD_OFFICER: 200,
        PROVINCE_OFFICER: 200,
        ADMIN: 200,
      },
    },
    {
      name: 'Uploads Media',
      method: 'post',
      url: '/api/uploads/media',
      body: {
        target: 'GENERAL',
      },
      expected: {
        ANON: 401,
        CITIZEN: 400,
        WARD_OFFICER: 400,
        PROVINCE_OFFICER: 400,
        ADMIN: 400,
      },
    },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    systemHealthService.getLiveStatus.mockReturnValue({
      service: 'urban-management-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
    systemHealthService.getReadinessStatus.mockResolvedValue({
      service: 'urban-management-api',
      status: 'ok',
      checks: [],
      timestamp: new Date().toISOString(),
    });
    observabilityService.getSnapshot.mockReturnValue({
      service: 'urban-management-api',
      counters: {},
      timings: {},
      gauges: {},
      circuitBreakers: [],
      timestamp: new Date().toISOString(),
    });
    observabilityService.getPrometheusMetrics.mockReturnValue(
      '# HELP urban_api_http_requests_total Total HTTP requests\n',
    );
    retentionMaintenanceService.preview.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      totalCandidates: 0,
      buckets: [],
    });
    retentionMaintenanceService.purge.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      purgedAt: new Date().toISOString(),
      totalCandidates: 0,
      totalDeleted: 0,
      buckets: [],
    });
    chatReconciliationService.preview.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      totalCandidates: 0,
      buckets: [],
      issues: [],
    });
    chatReconciliationService.repair.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      repairedAt: new Date().toISOString(),
      totalCandidates: 0,
      totalUpdated: 0,
      totalDeleted: 0,
      buckets: [],
      issues: [],
    });
    authService.login.mockResolvedValue({
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        refreshExpiresIn: 604800,
        tokenType: 'Bearer',
      },
      user: {
        id: 'user-1',
        fullName: 'Citizen One',
        role: 'CITIZEN',
        locationCode: 'VN-79-25747',
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    authService.refresh.mockResolvedValue({
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        refreshExpiresIn: 604800,
        tokenType: 'Bearer',
      },
      user: {
        id: 'user-1',
        fullName: 'Citizen One',
        role: 'CITIZEN',
        locationCode: 'VN-79-25747',
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    authService.me.mockImplementation((user: unknown) => user);
    usersService.getUser.mockImplementation((user: unknown) => user);
    usersService.listUsers.mockResolvedValue({
      success: true,
      data: [],
      meta: { count: 0 },
    });
    usersService.createUser.mockResolvedValue({
      id: 'user-created',
      fullName: 'Created User',
      role: 'WARD_OFFICER',
      locationCode: 'VN-79-25747',
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    usersService.updateStatus.mockResolvedValue({
      id: 'user-updated',
      fullName: 'Updated User',
      role: 'CITIZEN',
      locationCode: 'VN-79-25747',
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    groupsService.listGroups.mockResolvedValue({
      success: true,
      data: [],
      meta: { count: 0 },
    });
    reportsService.listReports.mockResolvedValue({
      success: true,
      data: [],
      meta: { count: 0 },
    });
    conversationsService.listConversations.mockResolvedValue({
      success: true,
      data: [],
      meta: { count: 0 },
    });
    uploadsService.uploadMedia.mockImplementation(
      (
        _user: unknown,
        _body: unknown,
        file?: {
          originalname: string;
          mimetype: string;
          size: number;
        },
      ) => {
        if (!file) {
          throw new BadRequestException('file is required.');
        }

        return Promise.resolve({
          key: 'uploads/general/user-1/file.jpg',
          url: 'https://cdn.example.com/file.jpg',
          bucket: 'test-bucket',
          target: 'GENERAL',
          fileName: 'file.jpg',
          originalFileName: 'file.jpg',
          contentType: 'image/jpeg',
          size: 128,
          uploadedBy: 'user-1',
          uploadedAt: new Date().toISOString(),
        });
      },
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        SystemController,
        MaintenanceController,
        AuthController,
        UsersController,
        GroupsController,
        ReportsController,
        ConversationsController,
        UploadsController,
      ],
      providers: [
        Reflector,
        TestJwtAuthGuard,
        RolesGuard,
        {
          provide: SystemHealthService,
          useValue: systemHealthService,
        },
        {
          provide: ObservabilityService,
          useValue: observabilityService,
        },
        {
          provide: RetentionMaintenanceService,
          useValue: retentionMaintenanceService,
        },
        {
          provide: ChatReconciliationService,
          useValue: chatReconciliationService,
        },
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: GroupsService,
          useValue: groupsService,
        },
        {
          provide: ReportsService,
          useValue: reportsService,
        },
        {
          provide: ConversationsService,
          useValue: conversationsService,
        },
        {
          provide: UploadsService,
          useValue: uploadsService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use((req: RequestWithUser, _res: Response, next: NextFunction) => {
      const roleHeaderRaw = req.headers[ROLE_HEADER_NAME];
      const roleHeader = Array.isArray(roleHeaderRaw)
        ? roleHeaderRaw[0]
        : roleHeaderRaw;
      const role = roleHeader?.trim() as UserRole | undefined;

      if (role) {
        const locationCode =
          role === 'PROVINCE_OFFICER' ? 'VN-79' : 'VN-79-25747';
        req.user = {
          id: `${role.toLowerCase()}-user`,
          role,
          locationCode,
          fullName: `${role} User`,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      next();
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalGuards(app.get(TestJwtAuthGuard), app.get(RolesGuard));
    app.useGlobalInterceptors(
      new ResponseEnvelopeInterceptor(app.get(Reflector)),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function makeRequest(role: TestRole, endpoint: EndpointCase) {
    let req = request(app.getHttpServer())[endpoint.method](endpoint.url);

    if (role !== 'ANON') {
      req = req.set(ROLE_HEADER_NAME, role);
    }

    if (endpoint.body) {
      req = req.send(endpoint.body);
    }

    return req;
  }

  const roles: TestRole[] = [
    'ANON',
    'CITIZEN',
    'WARD_OFFICER',
    'PROVINCE_OFFICER',
    'ADMIN',
  ];

  for (const endpoint of endpointCases) {
    for (const role of roles) {
      it(`[${endpoint.name}] role=${role} -> ${endpoint.expected[role]}`, async () => {
        await makeRequest(role, endpoint).expect(endpoint.expected[role]);
      });
    }
  }
});
