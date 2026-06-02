class MediaAsset {
  const MediaAsset({
    required this.key,
    this.resolvedUrl,
    this.fileName,
    this.originalFileName,
    this.contentType,
    this.size,
  });

  final String key;
  final String? resolvedUrl;
  final String? fileName;
  final String? originalFileName;
  final String? contentType;
  final int? size;

  factory MediaAsset.fromJson(Map<String, dynamic> json) {
    return MediaAsset(
      key: (json["key"] ?? "").toString(),
      resolvedUrl: json["resolvedUrl"]?.toString(),
      fileName: json["fileName"]?.toString(),
      originalFileName: json["originalFileName"]?.toString(),
      contentType: json["contentType"]?.toString(),
      size: json["size"] is int ? json["size"] as int : int.tryParse("${json["size"]}"),
    );
  }
}
