/**
 * Domain object — phiên bản sạch dùng trong services và controller.
 */
export interface KnowledgeDocument {
  id: string;        // = docId
  title: string;
  content: string;   // ≤ ~1000 ký tự (1 Điều luật = 1 Item)
  category: string;  // "land" | "construction" | "environment" | ...
  source: string;    // số hiệu văn bản
}

/**
 * DynamoDB record shape — tương ứng 1-1 với item trong bảng KnowledgeBase.
 *
 * Key pattern (bảng độc lập, không dùng single-table design):
 *   PK  = "KNOWLEDGE_DOCUMENT"   (constant entity type — scan / query all)
 *   SK  = <docId>                (unique per article)
 *
 * GSI "category-index":
 *   PK  = category               (field thật — "land", "construction", ...)
 *   SK  = docId
 */
export interface StoredKnowledgeDocument {
  PK: 'KNOWLEDGE_DOCUMENT';
  SK: string;          // = docId
  category: string;    // GSI partition key — field thật, dễ đọc
  docId: string;       // GSI sort key — field thật
  title: string;
  content: string;
  source: string;
  metadata?: {
    lawName?: string;
    chapter?: string;
    section?: string;
  };
  updatedAt: string;
}
