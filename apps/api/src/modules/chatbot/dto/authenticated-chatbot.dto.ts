import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ChatbotSourceDto } from './chatbot-answer.dto';

export type ChatbotConversationTargetType = 'GROUP' | 'USER';

export class ChatbotSelectedTargetDto {
  @ApiProperty({
    description: 'Loại conversation target người dùng đã chọn',
    enum: ['GROUP', 'USER'],
  })
  @IsIn(['GROUP', 'USER'])
  type: ChatbotConversationTargetType;

  @ApiProperty({
    description: 'Conversation ID được trả về từ candidates',
    example: 'GRP#01J5ABC123DEF456',
  })
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class AuthenticatedChatbotAskDto {
  @ApiProperty({
    description: 'Nội dung người dùng nhập vào chatbot',
    example: 'tóm tắt nhóm Dân phố 1',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question: string;

  @ApiPropertyOptional({
    description: 'Target đã chọn khi response trước đó trả về nhiều candidates',
    type: ChatbotSelectedTargetDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChatbotSelectedTargetDto)
  selectedTarget?: ChatbotSelectedTargetDto;
}

export interface ChatbotConversationTargetDto {
  id: string;
  type: ChatbotConversationTargetType;
  name: string;
}

export interface AuthenticatedChatbotSummaryResultDto {
  status: 'summary';
  answer: string;
  summary: string;
  messagesFetched: number;
  target: ChatbotConversationTargetDto;
}

export interface AuthenticatedChatbotCandidatesResultDto {
  status: 'candidates';
  answer: string;
  candidates: ChatbotConversationTargetDto[];
}

export interface AuthenticatedChatbotNotFoundResultDto {
  status: 'not_found';
  answer: string;
}

export interface AuthenticatedChatbotLawResultDto {
  status: 'law';
  answer: string;
  sources: ChatbotSourceDto[];
}

export type AuthenticatedChatbotResultDto =
  | AuthenticatedChatbotSummaryResultDto
  | AuthenticatedChatbotCandidatesResultDto
  | AuthenticatedChatbotNotFoundResultDto
  | AuthenticatedChatbotLawResultDto;
