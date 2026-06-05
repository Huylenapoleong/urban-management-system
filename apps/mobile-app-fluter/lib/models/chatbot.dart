class ChatbotTarget {
  final String id;
  final String type; // GROUP | USER
  final String name;

  ChatbotTarget({
    required this.id,
    required this.type,
    required this.name,
  });

  factory ChatbotTarget.fromJson(Map<String, dynamic> json) {
    return ChatbotTarget(
      id: (json['id'] ?? '').toString(),
      type: (json['type'] ?? 'GROUP').toString(),
      name: (json['name'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'type': type,
      'name': name,
    };
  }
}

class ChatbotResponse {
  final String status;
  final String answer;
  final String? summary;
  final int? messagesFetched;
  final ChatbotTarget? target;
  final List<ChatbotTarget> candidates;
  final List<Map<String, dynamic>>? sources;

  ChatbotResponse({
    required this.status,
    required this.answer,
    this.summary,
    this.messagesFetched,
    this.target,
    this.candidates = const [],
    this.sources,
  });

  factory ChatbotResponse.fromJson(Map<String, dynamic> json) {
    return ChatbotResponse(
      status: (json['status'] as String?) ?? 'law',
      answer: (json['answer'] as String?) ??
          (json['summary'] as String?) ??
          'Xin lỗi, tôi chưa có câu trả lời phù hợp.',
      summary: json['summary'] as String?,
      messagesFetched: json['messagesFetched'] == null
          ? null
          : (json['messagesFetched'] as num).toInt(),
      target: json['target'] == null
          ? null
          : ChatbotTarget.fromJson(json['target'] as Map<String, dynamic>),
      candidates: ((json['candidates'] as List<dynamic>?) ?? [])
          .map((item) => ChatbotTarget.fromJson(item as Map<String, dynamic>))
          .toList(),
      sources: (json['sources'] as List<dynamic>?)
          ?.map((item) => (item as Map).cast<String, dynamic>())
          .toList(),
    );
  }
}
