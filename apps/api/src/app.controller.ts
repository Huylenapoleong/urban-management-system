import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { ApiOkEnvelopeResponse } from './common/openapi/swagger-envelope';
import { HealthStatusDto } from './common/openapi/swagger.models';

@ApiTags('System')
@Controller()
export class AppController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiOkEnvelopeResponse(HealthStatusDto)
  getHealth(): { service: string; status: string } {
    return {
      service: 'urban-management-api',
      status: 'ok',
    };
  }
}
