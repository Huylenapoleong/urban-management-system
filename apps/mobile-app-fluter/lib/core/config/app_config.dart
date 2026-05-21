import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppConfig {
  const AppConfig._();

  static const String _apiBaseFromEnv = String.fromEnvironment(
    "API_BASE_URL",
    defaultValue: "",
  );

  static String get apiBaseUrl {
    var raw = _apiBaseFromEnv.trim();
    if (raw.isEmpty) {
      raw = dotenv.env['API_BASE_URL'] ?? '';
    }

    final base = raw.trim().isEmpty ? "http://localhost:3001" : raw.trim();
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
