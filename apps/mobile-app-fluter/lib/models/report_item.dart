import "media_asset.dart";

class ReportItem {
  const ReportItem({
    required this.id,
    required this.userId,
    required this.title,
    required this.category,
    required this.locationCode,
    required this.status,
    required this.priority,
    required this.createdAt,
    required this.updatedAt,
    this.description,
    this.groupId,
    this.assignedOfficerId,
    this.mediaUrls = const <String>[],
    this.mediaAssets = const <MediaAsset>[],
  });

  final String id;
  final String userId;
  final String title;
  final String category;
  final String locationCode;
  final String status;
  final String priority;
  final String createdAt;
  final String updatedAt;
  final String? description;
  final String? groupId;
  final String? assignedOfficerId;
  final List<String> mediaUrls;
  final List<MediaAsset> mediaAssets;

  factory ReportItem.fromJson(Map<String, dynamic> json) {
    final mediaUrlRaw = json["mediaUrls"];
    final mediaAssetRaw = json["mediaAssets"];
    return ReportItem(
      id: (json["id"] ?? "").toString(),
      userId: (json["userId"] ?? "").toString(),
      title: (json["title"] ?? "Untitled report").toString(),
      category: (json["category"] ?? "INFRASTRUCTURE").toString(),
      locationCode: (json["locationCode"] ?? "").toString(),
      status: (json["status"] ?? "NEW").toString(),
      priority: (json["priority"] ?? "MEDIUM").toString(),
      createdAt: (json["createdAt"] ?? "").toString(),
      updatedAt: (json["updatedAt"] ?? "").toString(),
      description: json["description"]?.toString(),
      groupId: json["groupId"]?.toString(),
      assignedOfficerId: json["assignedOfficerId"]?.toString(),
      mediaUrls: mediaUrlRaw is List
          ? mediaUrlRaw.map((item) => "$item").toList()
          : const <String>[],
      mediaAssets: mediaAssetRaw is List
          ? mediaAssetRaw
              .whereType<Map<String, dynamic>>()
              .map(MediaAsset.fromJson)
              .toList()
          : const <MediaAsset>[],
    );
  }
}
