class AuthUser {
  const AuthUser({
    required this.id,
    required this.fullName,
    required this.role,
    this.avatarUrl,
  });

  final String id;
  final String fullName;
  final String role;
  final String? avatarUrl;

  bool get isOfficial {
    const officialRoles = {
      'ADMIN',
      'PROVINCE_OFFICER',
      'WARD_OFFICER',
      'OFFICER',
    };
    return officialRoles.contains(role.toUpperCase());
  }

  String get roleLabel => isOfficial ? 'Official' : 'Citizen';

  factory AuthUser.fromMap(Map<String, dynamic> map) {
    return AuthUser(
      id: (map['id'] ?? map['sub'] ?? '').toString(),
      fullName: (map['fullName'] ?? map['name'] ?? 'User').toString(),
      role: (map['role'] ?? 'CITIZEN').toString(),
      avatarUrl: map['avatarUrl']?.toString(),
    );
  }
}
