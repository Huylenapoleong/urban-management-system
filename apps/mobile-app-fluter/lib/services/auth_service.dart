import "../core/network/api_client.dart";
import "../core/storage/auth_token_store.dart";
import "../models/auth_session.dart";
import "../models/user_profile.dart";

class AuthService {
  const AuthService({
    required ApiClient apiClient,
    required AuthTokenStore tokenStore,
  })  : _apiClient = apiClient,
        _tokenStore = tokenStore;

  final ApiClient _apiClient;
  final AuthTokenStore _tokenStore;

  Future<AuthSession> login({
    required String login,
    required String password,
  }) async {
    final raw = await _apiClient.post(
      "/auth/login",
      data: {
        "login": login,
        "password": password,
      },
    );
    final session = AuthSession.fromJson((raw as Map).cast<String, dynamic>());
    await _tokenStore.writeTokens(
      accessToken: session.tokens.accessToken,
      refreshToken: session.tokens.refreshToken,
    );
    return session;
  }

  Future<AuthSession> register({
    required String fullName,
    required String password,
    required String locationCode,
    String? email,
    String? phone,
    String? avatarUrl,
  }) async {
    final raw = await _apiClient.post(
      "/auth/register",
      data: {
        "fullName": fullName,
        "password": password,
        "locationCode": locationCode,
        if (email != null) "email": email,
        if (phone != null) "phone": phone,
        if (avatarUrl != null) "avatarUrl": avatarUrl,
      },
    );
    final session = AuthSession.fromJson((raw as Map).cast<String, dynamic>());
    await _tokenStore.writeTokens(
      accessToken: session.tokens.accessToken,
      refreshToken: session.tokens.refreshToken,
    );
    return session;
  }

  Future<UserProfile> getMe() async {
    final raw = await _apiClient.get("/auth/me");
    return UserProfile.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<AuthSession> refresh(String refreshToken) async {
    final raw = await _apiClient.post(
      "/auth/refresh",
      data: {"refreshToken": refreshToken},
    );
    final session = AuthSession.fromJson((raw as Map).cast<String, dynamic>());
    await _tokenStore.writeTokens(
      accessToken: session.tokens.accessToken,
      refreshToken: session.tokens.refreshToken,
    );
    return session;
  }

  Future<void> logout({String? refreshToken}) async {
    if (refreshToken != null && refreshToken.trim().isNotEmpty) {
      await _apiClient.post(
        "/auth/logout",
        data: {"refreshToken": refreshToken},
      );
    }
    await _tokenStore.clearTokens();
  }

  Future<Map<String, dynamic>> requestRegisterOtp({
    required String fullName,
    required String password,
    required String locationCode,
    String? email,
    String? phone,
    String? avatarUrl,
  }) async {
    final raw = await _apiClient.post(
      "/auth/register/request-otp",
      data: {
        "fullName": fullName,
        "password": password,
        "locationCode": locationCode,
        if (email != null) "email": email,
        if (phone != null) "phone": phone,
        if (avatarUrl != null) "avatarUrl": avatarUrl,
      },
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<AuthSession> verifyRegisterOtp({
    required String login,
    required String otpCode,
  }) async {
    final raw = await _apiClient.post(
      "/auth/register/verify-otp",
      data: {
        "login": login,
        "otpCode": otpCode,
      },
    );
    final session = AuthSession.fromJson((raw as Map).cast<String, dynamic>());
    await _tokenStore.writeTokens(
      accessToken: session.tokens.accessToken,
      refreshToken: session.tokens.refreshToken,
    );
    return session;
  }

  Future<Map<String, dynamic>> requestLoginOtp({
    required String login,
    required String password,
  }) async {
    final raw = await _apiClient.post(
      "/auth/login/request-otp",
      data: {
        "login": login,
        "password": password,
      },
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<AuthSession> verifyLoginOtp({
    required String login,
    required String otpCode,
  }) async {
    final raw = await _apiClient.post(
      "/auth/login/verify-otp",
      data: {
        "login": login,
        "otpCode": otpCode,
      },
    );
    final session = AuthSession.fromJson((raw as Map).cast<String, dynamic>());
    await _tokenStore.writeTokens(
      accessToken: session.tokens.accessToken,
      refreshToken: session.tokens.refreshToken,
    );
    return session;
  }

  Future<Map<String, dynamic>> requestForgotPasswordOtp(String login) async {
    final raw = await _apiClient.post(
      "/auth/password/forgot/request",
      data: {"login": login},
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> confirmForgotPassword(
    Map<String, dynamic> payload,
  ) async {
    final raw = await _apiClient.post(
      "/auth/password/forgot/confirm",
      data: payload,
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<List<Map<String, dynamic>>> listSessions() async {
    final raw = await _apiClient.get("/auth/sessions");
    return (raw as List)
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<void> revokeSession(String sessionId) async {
    await _apiClient.delete("/auth/sessions/$sessionId");
  }

  Future<void> dismissSessionHistory(String sessionId) async {
    await _apiClient.delete("/auth/sessions/$sessionId/history");
  }

  Future<void> logoutAll() async {
    await _apiClient.post("/auth/logout-all");
    await _tokenStore.clearTokens();
  }

  Future<Map<String, dynamic>> requestChangePasswordOtp() async {
    final raw = await _apiClient.post("/auth/password/change/request-otp");
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> changePassword(
    Map<String, dynamic> payload,
  ) async {
    final raw = await _apiClient.post(
      "/auth/password/change",
      data: payload,
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> requestDeactivateAccountOtp() async {
    final raw = await _apiClient.post("/auth/account/deactivate/request-otp");
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> confirmDeactivateAccount({
    required String otpCode,
  }) async {
    final raw = await _apiClient.post(
      "/auth/account/deactivate/confirm",
      data: {"otpCode": otpCode},
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> requestReactivateAccountOtp({
    required String login,
  }) async {
    final raw = await _apiClient.post(
      "/auth/account/reactivate/request-otp",
      data: {"login": login},
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<AuthSession> confirmReactivateAccount({
    required String login,
    required String otpCode,
  }) async {
    final raw = await _apiClient.post(
      "/auth/account/reactivate/confirm",
      data: {
        "login": login,
        "otpCode": otpCode,
      },
    );
    final session = AuthSession.fromJson((raw as Map).cast<String, dynamic>());
    await _tokenStore.writeTokens(
      accessToken: session.tokens.accessToken,
      refreshToken: session.tokens.refreshToken,
    );
    return session;
  }

  Future<Map<String, dynamic>> requestDeleteAccountOtp() async {
    final raw = await _apiClient.post("/auth/account/delete/request-otp");
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> confirmDeleteAccount({
    required String currentPassword,
    required String otpCode,
  }) async {
    final raw = await _apiClient.post(
      "/auth/account/delete/confirm",
      data: {
        "currentPassword": currentPassword,
        "otpCode": otpCode,
        "acceptTerms": true,
      },
    );
    return (raw as Map).cast<String, dynamic>();
  }
}
