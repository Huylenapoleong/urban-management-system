import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../core/storage/auth_token_store.dart';
import '../features/auth/data/auth_repository.dart';
import '../features/chat/data/chat_repository.dart';
import 'storage.dart';

final appStorageProvider = Provider<AppStorage>((ref) => AppStorage());

final tokenStoreProvider = Provider<AuthTokenStore>((ref) {
  return AuthTokenStore();
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final tokenStore = ref.watch(tokenStoreProvider);
  return ApiClient(tokenStore: tokenStore);
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final api = ref.watch(apiClientProvider);
  return AuthRepository(api);
});

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  final api = ref.watch(apiClientProvider);
  return ChatRepository(api);
});
