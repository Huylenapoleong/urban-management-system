import { ApiProperty } from '@nestjs/swagger';

export class ChatbotSourceDto {
  @ApiProperty({
    description: 'Tên điều luật',
    example: 'Điều 5. Quyền sở hữu đất',
  })
  title: string;

  @ApiProperty({
    description: 'Số hiệu hoặc tên văn bản pháp luật nguồn',
    example: 'Luật Đất đai 2024 - Điều 5',
  })
  source: string;
}

export class ChatbotAnswerDto {
  @ApiProperty({
    description: 'Câu trả lời được tổng hợp bởi AI từ các văn bản pháp luật',
  })
  answer: string;

  @ApiProperty({
    description:
      'Danh sách các điều luật được AI dùng làm nguồn tham khảo để trả lời',
    type: [ChatbotSourceDto],
  })
  sources: ChatbotSourceDto[];
}
