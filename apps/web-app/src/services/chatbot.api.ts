import ApiClient from "@/lib/api-client";

export type ChatbotMessageRequest = {
  question: string;
  selectedTarget?: {
    type: "GROUP" | "USER";
    id: string;
  };
  matchIds?: string[];
};

export type ChatbotSource = {
  title: string;
  source: string;
};

export type ChatbotMessageResponse = {
  answer: string;
  sources: ChatbotSource[];
  status?: "summary" | "candidates" | "not_found" | "law";
  summary?: string;
  messagesFetched?: number;
  target?: ChatbotConversationTarget;
  candidates?: ChatbotConversationTarget[];
};

type ChatbotConversationTarget = {
  id: string;
  type: "GROUP" | "USER";
  name: string;
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
    const response = (await ApiClient.post(
      "/chatbot/auth/ask",
      params,
    )) as ChatbotMessageResponse;
    return normalizeChatbotResponse(response);
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

function normalizeChatbotResponse(
  response: ChatbotMessageResponse,
): ChatbotMessageResponse {
  if (response.status !== "candidates") {
    return {
      ...response,
      answer:
        response.answer ||
        response.summary ||
        "Xin lỗi, tôi chưa có câu trả lời phù hợp.",
      sources: response.sources ?? [],
    };
  }

  const candidateLines =
    response.candidates
      ?.map((candidate) => {
        const typeLabel = candidate.type === "GROUP" ? "Nhóm" : "Người dùng";
        return `- ${typeLabel}: ${candidate.name}`;
      })
      .join("\n") ?? "";

  return {
    ...response,
    answer: [response.answer, candidateLines].filter(Boolean).join("\n\n"),
    sources: response.sources ?? [],
  };
}
