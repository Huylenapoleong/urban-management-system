import "../core/network/api_client.dart";
import "../models/user_profile.dart";

class UserService {
  const UserService({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<UserProfile> getProfile() async {
    final raw = await _apiClient.get("/users/me");
    return UserProfile.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<UserProfile> updateProfile(Map<String, dynamic> payload) async {
    final raw = await _apiClient.patch("/users/me", data: payload);
    return UserProfile.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<UserProfile> getUserById(String userId) async {
    final raw = await _apiClient.get("/users/${Uri.encodeComponent(userId)}");
    return UserProfile.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<List<UserProfile>> listUsers({
    String? role,
    String? status,
    String? locationCode,
    String? query,
    String? cursor,
    int? limit,
  }) async {
    final raw = await _apiClient.get(
      "/users",
      queryParameters: {
        if (role != null && role.trim().isNotEmpty) "role": role,
        if (status != null && status.trim().isNotEmpty) "status": status,
        if (locationCode != null && locationCode.trim().isNotEmpty)
          "locationCode": locationCode,
        if (query != null && query.trim().isNotEmpty) "q": query,
        if (cursor != null && cursor.trim().isNotEmpty) "cursor": cursor,
        if (limit != null) "limit": limit,
      },
    );
    final List list = (raw is Map && raw.containsKey("data")) ? raw["data"] : (raw as List);
    return list
        .map((item) => UserProfile.fromJson((item as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<List<Map<String, dynamic>>> discoverUsers({
    String? query,
    String? mode,
    String? cursor,
    int? limit,
  }) async {
    final raw = await _apiClient.get(
      "/users/discover",
      queryParameters: {
        if (query != null && query.trim().isNotEmpty) "q": query,
        if (mode != null && mode.trim().isNotEmpty) "mode": mode,
        if (cursor != null && cursor.trim().isNotEmpty) "cursor": cursor,
        if (limit != null) "limit": limit,
      },
    );
    final List list = (raw is Map && raw.containsKey("data")) ? raw["data"] : (raw as List);
    return list
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<UserProfile> searchExactUser(String query) async {
    final raw = await _apiClient.get(
      "/users/search",
      queryParameters: {"q": query},
    );
    return UserProfile.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<Map<String, dynamic>> getUserPresence(String userId) async {
    final raw = await _apiClient.get(
      "/users/${Uri.encodeComponent(userId)}/presence",
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> getMyPresence() async {
    final raw = await _apiClient.get("/users/me/presence");
    return (raw as Map).cast<String, dynamic>();
  }

  Future<UserProfile> updateUserStatus({
    required String userId,
    required String status,
  }) async {
    final raw = await _apiClient.patch(
      "/users/${Uri.encodeComponent(userId)}/status",
      data: {"status": status},
    );
    return UserProfile.fromJson((raw as Map).cast<String, dynamic>());
  }

  Future<List<Map<String, dynamic>>> listFriends({
    String? cursor,
    int? limit,
  }) async {
    final raw = await _apiClient.get(
      "/users/me/friends",
      queryParameters: {
        if (cursor != null && cursor.trim().isNotEmpty) "cursor": cursor,
        if (limit != null) "limit": limit,
      },
    );
    final List list = (raw is Map && raw.containsKey("data")) ? raw["data"] : (raw as List);
    return list
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<List<Map<String, dynamic>>> syncContacts(List<String> phones) async {
    final raw = await _apiClient.post(
      "/users/sync-contacts",
      data: {"phones": phones},
    );
    final List list = (raw is Map && raw.containsKey("data")) ? raw["data"] : (raw as List);
    return list
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<List<Map<String, dynamic>>> listFriendRequests({
    String? direction,
    String? cursor,
    int? limit,
  }) async {
    final raw = await _apiClient.get(
      "/users/me/friend-requests",
      queryParameters: {
        if (direction != null && direction.trim().isNotEmpty)
          "direction": direction,
        if (cursor != null && cursor.trim().isNotEmpty) "cursor": cursor,
        if (limit != null) "limit": limit,
      },
    );
    final List list = (raw is Map && raw.containsKey("data")) ? raw["data"] : (raw as List);
    return list
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<Map<String, dynamic>> sendFriendRequest(String userId) async {
    final raw = await _apiClient.post(
      "/users/me/friends/${Uri.encodeComponent(userId)}/request",
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> acceptFriendRequest(String userId) async {
    final raw = await _apiClient.post(
      "/users/me/friend-requests/${Uri.encodeComponent(userId)}/accept",
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> rejectFriendRequest(String userId) async {
    final raw = await _apiClient.post(
      "/users/me/friend-requests/${Uri.encodeComponent(userId)}/reject",
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> cancelFriendRequest(String userId) async {
    final raw = await _apiClient.post(
      "/users/me/friend-requests/${Uri.encodeComponent(userId)}/cancel",
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<void> removeFriend(String userId) async {
    await _apiClient.delete("/users/me/friends/${Uri.encodeComponent(userId)}");
  }

  Future<List<Map<String, dynamic>>> listPushDevices() async {
    final raw = await _apiClient.get("/users/me/push-devices");
    return (raw as List)
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<Map<String, dynamic>> registerPushDevice(
    Map<String, dynamic> payload,
  ) async {
    final raw = await _apiClient.post("/users/me/push-devices", data: payload);
    return (raw as Map).cast<String, dynamic>();
  }

  Future<void> deletePushDevice(String deviceId) async {
    await _apiClient.delete(
      "/users/me/push-devices/${Uri.encodeComponent(deviceId)}",
    );
  }
}
