type AiChatbotAction = "open" | "close" | "toggle";

const listeners = new Set<(action: AiChatbotAction) => void>();

function emitAiChatbotAction(action: AiChatbotAction) {
  listeners.forEach((listener) => listener(action));
}

export function openAiChatbot() {
  emitAiChatbotAction("open");
}

export function closeAiChatbot() {
  emitAiChatbotAction("close");
}

export function toggleAiChatbot() {
  emitAiChatbotAction("toggle");
}

export function subscribeAiChatbot(listener: (action: AiChatbotAction) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
