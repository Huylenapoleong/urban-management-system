import client from './client';

export interface ChatbotSource {
  title: string;
  source: string;
}

export interface ChatbotAnswer {
  answer: string;
  sources: ChatbotSource[];
}

export interface OfficerGroupSummaryResponse {
  summary: string;
  messagesFetched: number;
}

export interface OfficerReportAnalysisResponse {
  analysis: string;
  reportsAnalyzed: number;
}

export interface OfficerReportAnalysisPayload {
  status?: string;
  locationCode?: string;
  category?: string;
  groupId?: string;
}

export async function askChatbot(question: string): Promise<ChatbotAnswer> {
  return await client.post('/chatbot/ask', { question });
}

export async function summarizeOfficerGroup(payload: {
  groupId: string;
  messageCount?: number;
}): Promise<OfficerGroupSummaryResponse> {
  return await client.post('/chatbot/officer/summarize-group', payload);
}

export async function generateOfficerReportAnalysis(
  payload: OfficerReportAnalysisPayload,
): Promise<OfficerReportAnalysisResponse> {
  return await client.post('/chatbot/officer/generate-report', payload);
}
