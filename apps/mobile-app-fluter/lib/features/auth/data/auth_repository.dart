import '../../../core/network/api_client.dart';
import '../../../state/models.dart';

class AuthRepository {
  AuthRepository(this._api);

  final ApiClient _api;

  Future<Map<String, dynamic>> login({
    required String login,
    required String password,
  }) async {
    final data = await _api.post('/auth/login', data: {
      'login': login,
      'password': password,
    });

    if (data is! Map<String, dynamic>) {
      throw Exception('Invalid login response');
    }

    return data;
  }

  Future<AuthUser> getMe() async {
    final data = await _api.get('/auth/me');
    if (data is! Map<String, dynamic>) {
      throw Exception('Invalid profile response');
    }
    return AuthUser.fromMap(data);
  }
}
