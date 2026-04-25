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

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const response = (error as { response?: { status?: number } }).response;
  return typeof response?.status === "number" ? response.status : undefined;
}

export async function sendMessageToChatbot(
  params: ChatbotMessageRequest,
): Promise<ChatbotMessageResponse> {
  try {
    return await ApiClient.post("/chatbot/ask", params);
  } catch (error: unknown) {
    if (getErrorStatus(error) === 404) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        answer:
          "[Mock] Backend Chatbot chua duoc merge vao nhanh hien tai (tham khao nhanh AIChatBot). Day la cau tra loi phu tro.",
        sources: [],
      };
    }

    throw error;
  }
}
