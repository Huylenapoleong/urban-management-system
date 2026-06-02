import "../core/network/api_client.dart";
import "../models/report_item.dart";

class ReportService {
  const ReportService({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<List<ReportItem>> listReports({
    bool? mine,
    bool? assignedToMe,
    String? status,
    String? category,
    String? priority,
    String? locationCode,
    String? query,
    int? limit,
    String? cursor,
  }) async {
    final raw = await _apiClient.get(
      "/reports",
      queryParameters: {
        if (mine != null) "mine": mine,
        if (assignedToMe != null) "assignedToMe": assignedToMe,
        if (status != null && status.trim().isNotEmpty) "status": status.trim(),
        if (category != null && category.trim().isNotEmpty)
          "category": category.trim(),
        if (priority != null && priority.trim().isNotEmpty)
          "priority": priority.trim(),
        if (locationCode != null && locationCode.trim().isNotEmpty)
          "locationCode": locationCode.trim(),
        if (query != null && query.trim().isNotEmpty) "q": query.trim(),
        if (limit != null) "limit": limit,
        if (cursor != null && cursor.trim().isNotEmpty) "cursor": cursor.trim(),
      },
    );
    return (raw as List)
        .map((item) => ReportItem.fromJson((item as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<ReportItem> createReport({
    required String title,
    required String category,
    required String priority,
    required String locationCode,
    String? description,
    List<String> mediaKeys = const <String>[],
    List<String> mediaUrls = const <String>[],
  }) async {
    final raw = await _apiClient.post(
      "/reports",
      data: {
        "title": title,
        "category": category,
        "priority": priority,
        "locationCode": locationCode,
        if (description != null && description.trim().isNotEmpty)
          "description": description.trim(),
        if (mediaKeys.isNotEmpty) "mediaKeys": mediaKeys,
        if (mediaUrls.isNotEmpty) "mediaUrls": mediaUrls,
      },
    );
    return ReportItem.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<ReportItem> getReport(String reportId) async {
    final raw = await _apiClient.get("/reports/${Uri.encodeComponent(reportId)}");
    return ReportItem.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<ReportItem> updateReport(
    String reportId,
    Map<String, dynamic> payload,
  ) async {
    final raw = await _apiClient.patch(
      "/reports/${Uri.encodeComponent(reportId)}",
      data: payload,
    );
    return ReportItem.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<ReportItem> deleteReport(String reportId) async {
    final raw = await _apiClient.delete(
      "/reports/${Uri.encodeComponent(reportId)}",
    );
    return ReportItem.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<ReportItem> assignReport(String reportId, String officerId) async {
    final raw = await _apiClient.post(
      "/reports/${Uri.encodeComponent(reportId)}/assign",
      data: {"officerId": officerId},
    );
    return ReportItem.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<ReportItem> updateReportStatus(String reportId, String status) async {
    final raw = await _apiClient.post(
      "/reports/${Uri.encodeComponent(reportId)}/status",
      data: {"status": status},
    );
    return ReportItem.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<List<Map<String, dynamic>>> listReportAuditEvents(String reportId) async {
    final raw = await _apiClient.get(
      "/reports/${Uri.encodeComponent(reportId)}/audit",
    );
    return (raw as List)
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<List<Map<String, dynamic>>> listLinkedConversations(String reportId) async {
    final raw = await _apiClient.get(
      "/reports/${Uri.encodeComponent(reportId)}/conversations",
    );
    return (raw as List)
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<Map<String, dynamic>> linkGroupConversation(
    String reportId,
    String groupId,
  ) async {
    final raw = await _apiClient.post(
      "/reports/${Uri.encodeComponent(reportId)}/conversations",
      data: {"groupId": groupId},
    );
    return (raw as Map).cast<String, dynamic>();
  }
}
