export const KNOWLEDGE_DOCUMENT_PK = 'KNOWLEDGE_DOCUMENT';
export const KNOWLEDGE_DOCUMENT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export type KnowledgeDocumentStatus =
  (typeof KNOWLEDGE_DOCUMENT_STATUSES)[number];

export interface KnowledgeDocumentMetadata {
  lawName?: string;
  chapter?: string;
  section?: string;
}

export interface StoredKnowledgeDocumentRecord {
  PK: typeof KNOWLEDGE_DOCUMENT_PK;
  SK: string;
  category: string;
  docId: string;
  title: string;
  content: string;
  source: string;
  metadata?: KnowledgeDocumentMetadata;
  status?: KnowledgeDocumentStatus;
  effectiveDate?: string | null;
  createdAt?: string;
  updatedAt: string;
}

export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  content: string;
  category: string;
  source: string;
  metadata?: KnowledgeDocumentMetadata;
  status: KnowledgeDocumentStatus;
  effectiveDate?: string | null;
  createdAt?: string;
  updatedAt: string;
}
