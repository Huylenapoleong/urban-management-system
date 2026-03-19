import { INestApplication, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/common/interceptors/response-envelope.interceptor';
import { ConversationsController } from '../src/modules/conversations/conversations.controller';
import { ConversationsService } from '../src/modules/conversations/conversations.service';

type RequestWithUser = Request & {
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: 'CITIZEN';
    locationCode: string;
    status: 'ACTIVE';
    createdAt: string;
    updatedAt: string;
  };
};

describe('ConversationsController deleteConversation (e2e)', () => {
  const actor = {
    id: 'user-1',
    email: 'citizen@example.com',
    fullName: 'Citizen One',
    role: 'CITIZEN' as const,
    locationCode: 'VN-79-760-26734',
    status: 'ACTIVE' as const,
    createdAt: '2026-03-18T10:00:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
  };
  const conversationsService = {
    deleteConversation: jest.fn(),
  };

  let app: INestApplication<App>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        {
          provide: ConversationsService,
          useValue: conversationsService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use((req: RequestWithUser, _res: Response, next: NextFunction) => {
      req.user = actor;
      next();
    });
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(
      new ResponseEnvelopeInterceptor(app.get(Reflector)),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('wraps a successful delete conversation response in the standard envelope', async () => {
    conversationsService.deleteConversation.mockResolvedValue({
      conversationId: 'dm:user-2',
      removedAt: '2026-03-18T15:40:00.000Z',
    });

    const response = await request(app.getHttpServer())
      .delete('/api/conversations/dm:user-2')
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        conversationId: 'dm:user-2',
        removedAt: '2026-03-18T15:40:00.000Z',
      },
    });
    expect(conversationsService.deleteConversation).toHaveBeenCalledWith(
      actor,
      'dm:user-2',
    );
  });

  it('normalizes a delete conversation error through the global exception filter', async () => {
    conversationsService.deleteConversation.mockRejectedValue(
      new NotFoundException('Conversation not found.'),
    );

    const response = await request(app.getHttpServer())
      .delete('/api/conversations/group:missing-group')
      .expect(404);
    const body = response.body as {
      success: boolean;
      error: {
        statusCode: number;
        message: string;
        error: string;
      };
      path: string;
      timestamp: string;
    };

    expect(body).toMatchObject({
      success: false,
      error: {
        statusCode: 404,
        message: 'Conversation not found.',
        error: 'Not Found',
      },
      path: '/api/conversations/group:missing-group',
    });
    expect(typeof body.timestamp).toBe('string');
  });
});
