import ApiClient from "@/lib/api-client";

export type ChatbotMessageRequest = {
  message: string;
};

export type ChatbotMessageResponse = {
  response: string;
};

export async function sendMessageToChatbot(params: ChatbotMessageRequest): Promise<ChatbotMessageResponse> {
  try {
    return await ApiClient.post("/chatbot/ask", params);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      // Backend is missing on this branch, return mock
      await new Promise((resolve) => setTimeout(resolve, 800));
      return { response: "[Mock] Backend Chatbot chưa được merge vào nhánh hiện tại (tham khảo nhánh AIChatBot). Đây là câu trả lời phụ trợ: Tôi đã nhận được tin nhắn của bạn về quá trình quản lý thông tin." };
    }
    throw error;
  }
}