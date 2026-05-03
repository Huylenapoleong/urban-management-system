import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../features/auth/data/auth_repository.dart';
import 'models.dart';
import 'providers.dart';

class AuthState {
  const AuthState({
    required this.isLoading,
    this.user,
    this.error,
  });

  final bool isLoading;
  final AuthUser? user;
  final String? error;

  AuthState copyWith({
    bool? isLoading,
    AuthUser? user,
    String? error,
  }) {
    return AuthState(
      isLoading: isLoading ?? this.isLoading,
      user: user ?? this.user,
      error: error,
    );
  }

  static const initial = AuthState(isLoading: true);
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(Ref ref)
      : _repo = ref.read(authRepositoryProvider),
        _storage = ref.read(appStorageProvider),
        super(AuthState.initial) {
    unawaited(bootstrap());
  }

  final AuthRepository _repo;
  final dynamic _storage;

  Future<void> bootstrap() async {
    final token = await _storage.readToken();
    if (token == null || token.isEmpty) {
      state = const AuthState(isLoading: false);
      return;
    }

    try {
      final me = await _repo.getMe();
      state = AuthState(isLoading: false, user: me);
    } catch (_) {
      await _storage.clearToken();
      state = const AuthState(isLoading: false);
    }
  }

  Future<bool> login(String login, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final result = await _repo.login(login: login, password: password);
      final tokens = result['tokens'] as Map<String, dynamic>?;
      final accessToken = (tokens?['accessToken'] ?? '').toString();
      if (accessToken.isEmpty) {
        throw Exception('No access token');
      }

      await _storage.saveToken(accessToken);

      final meRaw = result['user'];
      final me = (meRaw is Map<String, dynamic>)
          ? AuthUser.fromMap(meRaw)
          : await _repo.getMe();

      state = AuthState(isLoading: false, user: me);
      return true;
    } catch (e) {
      state = AuthState(
        isLoading: false,
        user: null,
        error: ApiClient.extractError(e),
      );
      return false;
    }
  }

  Future<void> logout() async {
    await _storage.clearToken();
    state = const AuthState(isLoading: false, user: null);
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(ref);
});
