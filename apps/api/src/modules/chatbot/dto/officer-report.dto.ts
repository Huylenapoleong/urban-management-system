import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';

export class OfficerGenerateReportDto {
  @ApiPropertyOptional({
    description: 'Lọc theo status của Report (VD: NEW, IN_PROGRESS)',
    example: 'NEW',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo locationCode',
    example: 'VN-HCM-Q1-P01',
  })
  @IsOptional()
  @IsString()
  locationCode?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo category (INFRASTRUCTURE, ENVIRONMENT, SECURITY, ADMIN)',
    example: 'ENVIRONMENT',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'ID của Group liên quan (nếu muốn chỉ xem report của group)',
    example: '01J5ABC123DEF456',
  })
  @IsOptional()
  @IsString()
  groupId?: string;
}
