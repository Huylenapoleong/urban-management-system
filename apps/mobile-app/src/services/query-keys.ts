export const queryKeys = {
  conversations: (filters?: unknown) => ["conversations", filters ?? "all"] as const,
  messages: (conversationId: string) => ["messages", conversationId] as const,
  profile: () => ["profile", "me"] as const,
  reports: (filters?: unknown) => ["reports", filters ?? "all"] as const,
  report: (id: string) => ["reports", id] as const,
  static: (scope: string) => ["static", scope] as const,
};
