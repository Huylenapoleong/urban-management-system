import "user_profile.dart";

class AuthTokens {
  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
  });

  final String accessToken;
  final String refreshToken;

  factory AuthTokens.fromJson(Map<String, dynamic> json) {
    return AuthTokens(
      accessToken: (json["accessToken"] ?? "").toString(),
      refreshToken: (json["refreshToken"] ?? "").toString(),
    );
  }
}

class AuthSession {
  const AuthSession({
    required this.tokens,
    required this.user,
  });

  final AuthTokens tokens;
  final UserProfile user;

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      tokens: AuthTokens.fromJson(
        (json["tokens"] as Map<String, dynamic>? ?? const {}),
      ),
      user: UserProfile.fromJson(
        (json["user"] as Map<String, dynamic>? ?? const {}),
      ),
    );
  }
}
