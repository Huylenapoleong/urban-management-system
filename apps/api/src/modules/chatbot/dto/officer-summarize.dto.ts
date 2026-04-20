import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class OfficerSummarizeDto {
  @ApiProperty({
    description: 'ID của Group cần tóm tắt tin nhắn',
    example: '01J5ABC123DEF456',
  })
  @IsString()
  @IsNotEmpty()
  groupId: string;

  @ApiProperty({
    description: 'Số lượng tin nhắn gần nhất cần lấy để tóm tắt',
    example: 50,
    default: 50,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(200)
  messageCount?: number;
}
