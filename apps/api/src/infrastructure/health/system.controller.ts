import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { SkipResponseEnvelope } from '../../common/decorators/skip-response-envelope.decorator';
import {
  LiveHealthStatusDto,
  ReadinessStatusDto,
} from '../../common/openapi/swagger.models';
import { ObservabilityService } from '../observability/observability.service';
import { SystemHealthService } from './system-health.service';

const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

@ApiTags('System')
@Controller('health')
export class SystemController {
  constructor(
    private readonly systemHealthService: SystemHealthService,
    private readonly observabilityService: ObservabilityService,
  ) {}

  @Public()
  @SkipResponseEnvelope()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ type: LiveHealthStatusDto })
  getLive() {
    return this.systemHealthService.getLiveStatus();
  }

  @Public()
  @SkipResponseEnvelope()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiOkResponse({ type: ReadinessStatusDto })
  @ApiServiceUnavailableResponse({ type: ReadinessStatusDto })
  async getReady(@Res({ passthrough: true }) response: Response) {
    const readiness = await this.systemHealthService.getReadinessStatus();

    response.status(
      readiness.status === 'ok'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return readiness;
  }

  @Public()
  @SkipResponseEnvelope()
  @Get('metrics')
  @ApiOperation({
    summary:
      'Operational metrics for HTTP status codes, session revocations, outbox backlog, and circuit breakers',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        service: { type: 'string', example: 'urban-management-api' },
        timestamp: { type: 'string', example: '2026-03-18T14:00:00.000Z' },
        counters: { type: 'object', additionalProperties: true },
        timings: { type: 'object', additionalProperties: true },
        gauges: { type: 'object', additionalProperties: true },
        circuitBreakers: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
      required: [
        'service',
        'timestamp',
        'counters',
        'timings',
        'gauges',
        'circuitBreakers',
      ],
    },
  })
  getMetrics() {
    return this.observabilityService.getSnapshot();
  }

  @Public()
  @SkipResponseEnvelope()
  @Get('metrics/prometheus')
  @ApiOperation({
    summary:
      'Prometheus exposition format for request, session, retention, outbox, and circuit-breaker metrics',
  })
  @ApiProduces('text/plain')
  @ApiOkResponse({
    schema: {
      type: 'string',
      example:
        '# HELP urban_api_http_requests_total Total HTTP requests handled by the API.\n# TYPE urban_api_http_requests_total counter\nurban_api_http_requests_total 42\n',
    },
  })
  async getPrometheusMetrics(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Content-Type', PROMETHEUS_CONTENT_TYPE);
    return this.observabilityService.getPrometheusMetrics();
  }
}
