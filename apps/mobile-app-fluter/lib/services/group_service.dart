import "../core/network/api_client.dart";

class GroupService {
  const GroupService({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<List<Map<String, dynamic>>> listGroups({
    bool? mine,
    String? query,
    String? groupType,
    String? locationCode,
    String? cursor,
    int? limit,
  }) async {
    final raw = await _apiClient.get(
      "/groups",
      queryParameters: {
        if (mine != null) "mine": mine,
        if (query != null && query.trim().isNotEmpty) "q": query,
        if (groupType != null && groupType.trim().isNotEmpty)
          "groupType": groupType,
        if (locationCode != null && locationCode.trim().isNotEmpty)
          "locationCode": locationCode,
        if (cursor != null && cursor.trim().isNotEmpty) "cursor": cursor,
        if (limit != null) "limit": limit,
      },
    );
    final List list = (raw is Map && raw.containsKey("data")) ? raw["data"] : (raw as List);
    return list
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<Map<String, dynamic>> createGroup({
    required String groupName,
    required String groupType,
    required String locationCode,
    String? description,
    List<String>? userIds,
  }) async {
    final raw = await _apiClient.post(
      "/groups",
      data: {
        "groupName": groupName,
        "groupType": groupType,
        "locationCode": locationCode,
        if (description != null && description.trim().isNotEmpty)
          "description": description,
        if (userIds != null && userIds.isNotEmpty) "userIds": userIds,
      },
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> getGroup(String groupId) async {
    final raw = await _apiClient.get("/groups/${Uri.encodeComponent(groupId)}");
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> updateGroup(
    String groupId,
    Map<String, dynamic> payload,
  ) async {
    final raw = await _apiClient.patch(
      "/groups/${Uri.encodeComponent(groupId)}",
      data: payload,
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> joinGroup(String groupId) async {
    final raw = await _apiClient.post("/groups/${Uri.encodeComponent(groupId)}/join");
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> leaveGroup(String groupId) async {
    final raw = await _apiClient.post("/groups/${Uri.encodeComponent(groupId)}/leave");
    return (raw as Map).cast<String, dynamic>();
  }

  Future<List<Map<String, dynamic>>> listMembers(String groupId) async {
    final raw = await _apiClient.get(
      "/groups/${Uri.encodeComponent(groupId)}/members",
    );
    return (raw as List)
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList();
  }

  Future<Map<String, dynamic>> addMember({
    required String groupId,
    required String userId,
    String roleInGroup = "MEMBER",
  }) async {
    final raw = await _apiClient.post(
      "/groups/${Uri.encodeComponent(groupId)}/members",
      data: {
        "userId": userId,
        "roleInGroup": roleInGroup,
      },
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> updateMemberRole({
    required String groupId,
    required String userId,
    required String roleInGroup,
  }) async {
    final raw = await _apiClient.patch(
      "/groups/${Uri.encodeComponent(groupId)}/members/${Uri.encodeComponent(userId)}/role",
      data: {"roleInGroup": roleInGroup},
    );
    return (raw as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> removeMember({
    required String groupId,
    required String userId,
  }) async {
    final raw = await _apiClient.delete(
      "/groups/${Uri.encodeComponent(groupId)}/members/${Uri.encodeComponent(userId)}",
    );
    return (raw as Map).cast<String, dynamic>();
  }
}
