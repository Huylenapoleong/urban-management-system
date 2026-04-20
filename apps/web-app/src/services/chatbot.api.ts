import ApiClient from "@/lib/api-client";

export type ChatbotMessageRequest = {
  question: string;
};

export type ChatbotSource = {
  title: string;
  source: string;
};

export type ChatbotMessageResponse = {
  answer: string;
  sources: ChatbotSource[];
};

export async function sendMessageToChatbot(params: ChatbotMessageRequest): Promise<ChatbotMessageResponse> {
  try {
    return await ApiClient.post("/chatbot/ask", params);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      // Backend is missing on this branch, return mock
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        answer:
          "[Mock] Backend Chatbot chưa được merge vào nhánh hiện tại (tham khảo nhánh AIChatBot). Đây là câu trả lời phụ trợ: Tôi đã nhận được tin nhắn của bạn về quá trình quản lý thông tin.",
        sources: [],
      };
    }
    throw error;
  }
}