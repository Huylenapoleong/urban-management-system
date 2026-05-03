class AppConfig {
  const AppConfig._();

  static const String _apiBaseFromEnv = String.fromEnvironment(
    "API_BASE_URL",
    defaultValue: "http://localhost:3001",
  );

  static String get apiBaseUrl {
    final raw = _apiBaseFromEnv.trim();
    final base = raw.isEmpty ? "http://localhost:3001" : raw;
    final normalized = base.replaceAll(RegExp(r"/+$"), "");
    if (normalized.endsWith("/api")) {
      return normalized;
    }
    return "$normalized/api";
  }

  static String get socketOrigin {
    return apiBaseUrl.replaceAll(RegExp(r"/api$"), "");
  }
}
