import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChatbotAskDto {
  @ApiProperty({
    description: 'Câu hỏi của người dùng gửi đến AI Chatbot',
    example: 'Thủ tục xin cấp giấy phép xây dựng cần những giấy tờ gì?',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question: string;
}
