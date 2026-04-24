import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ApiOkEnvelopeResponse } from '../../common/openapi/swagger-envelope';
import { ErrorResponseDto } from '../../common/openapi/swagger.models';
import {
  ListLocationWardsQueryDto,
  LocationProvinceDto,
  LocationSearchItemDto,
  LocationWardDto,
  ResolveLocationQueryDto,
  ResolvedLocationDto,
  SearchLocationsQueryDto,
} from './locations.dto';
import { LocationsService } from './locations.service';

@Public()
@ApiTags('Locations')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@ApiNotFoundResponse({ type: ErrorResponseDto })
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('provinces')
  @ApiOperation({
    summary: 'List Vietnam provinces/cities from the local snapshot',
  })
  @ApiOkEnvelopeResponse(LocationProvinceDto, { isArray: true })
  listProvinces() {
    return this.locationsService.listProvinces();
  }

  @Get('wards')
  @ApiOperation({
    summary: 'List wards/communes for a province from the local snapshot',
  })
  @ApiQuery({ name: 'provinceCode', required: true, type: String })
  @ApiOkEnvelopeResponse(LocationWardDto, { isArray: true })
  listWards(@Query() query: ListLocationWardsQueryDto) {
    return this.locationsService.listWards(query.provinceCode);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search provinces and wards/communes from the local snapshot',
  })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkEnvelopeResponse(LocationSearchItemDto, { isArray: true })
  search(@Query() query: SearchLocationsQueryDto) {
    return this.locationsService.searchLocations(
      query.q,
      query.limit ? Number(query.limit) : undefined,
    );
  }

  @Get('resolve')
  @ApiOperation({
    summary: 'Resolve a locationCode into display-friendly labels',
  })
  @ApiQuery({ name: 'locationCode', required: true, type: String })
  @ApiOkEnvelopeResponse(ResolvedLocationDto)
  resolve(@Query() query: ResolveLocationQueryDto) {
    return this.locationsService.resolveLocationCode(query.locationCode);
  }
}
