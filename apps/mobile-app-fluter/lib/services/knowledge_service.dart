import '../core/network/api_client.dart';
import '../models/knowledge_document.dart';
import '../models/paginated_result.dart';

class KnowledgeService {
  KnowledgeService({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<PaginatedResult<KnowledgeDocument>> listDocuments({
    String? q,
    String? category,
    String? status,
    int limit = 12,
    String? cursor,
  }) async {
    final Map<String, dynamic> query = {
      'limit': limit,
      if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
      if (category != null && category.isNotEmpty) 'category': category,
      if (status != null && status.isNotEmpty) 'status': status,
      if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
    };
    
    final response = await _apiClient.getPaginated(
      '/knowledge-base',
      queryParameters: query,
    );
    
    return PaginatedResult.fromRaw(
      response,
      (x) => KnowledgeDocument.fromJson(x),
    );
  }
}
