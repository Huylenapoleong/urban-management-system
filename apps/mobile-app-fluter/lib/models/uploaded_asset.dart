class UploadedAsset {
  const UploadedAsset({
    required this.key,
    this.url,
    required this.target,
    this.entityId,
    this.fileName,
    this.originalFileName,
    this.contentType,
  });

  final String key;
  final String? url;
  final String target;
  final String? entityId;
  final String? fileName;
  final String? originalFileName;
  final String? contentType;

  factory UploadedAsset.fromJson(Map<String, dynamic> json) {
    return UploadedAsset(
      key: (json["key"] ?? "").toString(),
      url: json["url"]?.toString(),
      target: (json["target"] ?? "").toString(),
      entityId: json["entityId"]?.toString(),
      fileName: json["fileName"]?.toString(),
      originalFileName: json["originalFileName"]?.toString(),
      contentType: json["contentType"]?.toString(),
    );
  }
}
