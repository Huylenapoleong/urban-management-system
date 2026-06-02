import "media_asset.dart";

class UserProfile {
  const UserProfile({
    required this.id,
    required this.fullName,
    required this.role,
    required this.locationCode,
    required this.status,
    this.phone,
    this.email,
    this.unit,
    this.avatarUrl,
    this.avatarAsset,
  });

  final String id;
  final String fullName;
  final String role;
  final String locationCode;
  final String status;
  final String? phone;
  final String? email;
  final String? unit;
  final String? avatarUrl;
  final MediaAsset? avatarAsset;

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    final avatarAssetRaw = json["avatarAsset"];
    return UserProfile(
      id: (json["id"] ?? json["userId"] ?? json["sub"] ?? "").toString(),
      fullName: (json["fullName"] ?? json["name"] ?? "User").toString(),
      role: (json["role"] ?? "CITIZEN").toString(),
      locationCode: (json["locationCode"] ?? "").toString(),
      status: (json["status"] ?? "ACTIVE").toString(),
      phone: json["phone"]?.toString(),
      email: json["email"]?.toString(),
      unit: json["unit"]?.toString(),
      avatarUrl: json["avatarUrl"]?.toString(),
      avatarAsset: avatarAssetRaw is Map<String, dynamic>
          ? MediaAsset.fromJson(avatarAssetRaw)
          : null,
    );
  }
}
