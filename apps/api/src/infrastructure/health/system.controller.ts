import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
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
import { SystemHealthService } from './system-health.service';

@ApiTags('System')
@Controller('health')
export class SystemController {
  constructor(private readonly systemHealthService: SystemHealthService) {}

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
}
