class KnowledgeDocumentMetadata {
  const KnowledgeDocumentMetadata({
    this.lawName,
    this.chapter,
    this.section,
  });

  final String? lawName;
  final String? chapter;
  final String? section;

  factory KnowledgeDocumentMetadata.fromJson(Map<String, dynamic> json) {
    return KnowledgeDocumentMetadata(
      lawName: json['lawName'] as String?,
      chapter: json['chapter'] as String?,
      section: json['section'] as String?,
    );
  }
}

class KnowledgeDocument {
  const KnowledgeDocument({
    required this.id,
    required this.title,
    required this.content,
    required this.category,
    required this.source,
    required this.status,
    this.effectiveDate,
    required this.updatedAt,
    this.metadata,
  });

  final String id;
  final String title;
  final String content;
  final String category;
  final String source;
  final String status;
  final String? effectiveDate;
  final String updatedAt;
  final KnowledgeDocumentMetadata? metadata;

  factory KnowledgeDocument.fromJson(Map<String, dynamic> json) {
    return KnowledgeDocument(
      id: json['id'] as String? ?? json['documentId'] as String? ?? '',
      title: json['title'] as String? ?? '',
      content: json['content'] as String? ?? '',
      category: json['category'] as String? ?? '',
      source: json['source'] as String? ?? '',
      status: json['status'] as String? ?? 'ACTIVE',
      effectiveDate: json['effectiveDate'] as String?,
      updatedAt: json['updatedAt'] as String? ?? '',
      metadata: json['metadata'] != null
          ? KnowledgeDocumentMetadata.fromJson((json['metadata'] as Map).cast<String, dynamic>())
          : null,
    );
  }
}
