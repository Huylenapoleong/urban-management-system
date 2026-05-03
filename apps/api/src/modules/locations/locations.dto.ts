import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LocationProvinceDto {
  @ApiProperty({ example: '79' })
  code!: string;

  @ApiProperty({ example: 'Hồ Chí Minh' })
  name!: string;

  @ApiProperty({ example: 'Thành phố Hồ Chí Minh' })
  fullName!: string;

  @ApiProperty({ example: 'MUNICIPALITY', enum: ['MUNICIPALITY', 'PROVINCE'] })
  unitType!: 'MUNICIPALITY' | 'PROVINCE';
}

export class LocationWardDto {
  @ApiProperty({ example: '26734' })
  code!: string;

  @ApiProperty({ example: 'Bến Nghé' })
  name!: string;

  @ApiProperty({ example: 'Phường Bến Nghé' })
  fullName!: string;

  @ApiProperty({ example: '79' })
  provinceCode!: string;

  @ApiProperty({
    example: 'WARD',
    enum: ['WARD', 'COMMUNE', 'SPECIAL_ZONE'],
  })
  unitType!: 'WARD' | 'COMMUNE' | 'SPECIAL_ZONE';
}

export class LocationSearchItemDto {
  @ApiProperty({ example: 'WARD', enum: ['PROVINCE', 'WARD'] })
  scope!: 'PROVINCE' | 'WARD';

  @ApiProperty({ example: 'VN-79-26734' })
  locationCode!: string;

  @ApiProperty({ example: '26734' })
  code!: string;

  @ApiProperty({ example: 'Bến Nghé' })
  name!: string;

  @ApiProperty({ example: 'Phường Bến Nghé' })
  fullName!: string;

  @ApiProperty({ example: 'Phường Bến Nghé, Thành phố Hồ Chí Minh' })
  displayName!: string;

  @ApiProperty({ example: '79' })
  provinceCode!: string;
}

export class ResolvedLocationDto {
  @ApiProperty({ example: 'VN-79-26734' })
  locationCode!: string;

  @ApiProperty({ example: 'WARD', enum: ['PROVINCE', 'WARD', 'LEGACY'] })
  scope!: 'PROVINCE' | 'WARD' | 'LEGACY';

  @ApiProperty({ example: false })
  isLegacy!: boolean;

  @ApiProperty({ example: 'Phường Bến Nghé, Thành phố Hồ Chí Minh' })
  displayName!: string;

  @ApiPropertyOptional({ type: () => LocationProvinceDto })
  province?: LocationProvinceDto;

  @ApiPropertyOptional({ type: () => LocationWardDto })
  ward?: LocationWardDto;
}

export class ListLocationWardsQueryDto {
  @ApiProperty({ example: '79' })
  provinceCode!: string;
}

export class SearchLocationsQueryDto {
  @ApiProperty({ example: 'bến nghé' })
  q!: string;

  @ApiPropertyOptional({ example: 20 })
  limit?: number;
}

export class ResolveLocationQueryDto {
  @ApiProperty({ example: 'VN-79-26734' })
  locationCode!: string;
}
