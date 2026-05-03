let chatPagePreloadPromise: Promise<typeof import("@/pages/ChatPage")> | null =
  null;

export function preloadChatPage() {
  if (!chatPagePreloadPromise) {
    chatPagePreloadPromise = import("@/pages/ChatPage");
  }

  return chatPagePreloadPromise;
}
