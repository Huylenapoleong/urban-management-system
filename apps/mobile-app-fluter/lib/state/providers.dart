import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../core/storage/auth_token_store.dart';
import '../features/auth/data/auth_repository.dart';
import '../features/chat/data/chat_repository.dart';
import '../services/location_service.dart';
import '../services/upload_service.dart';
import '../services/chatbot_service.dart';
import '../services/report_service.dart';
import '../services/socket_service.dart';
import '../services/webrtc_service.dart';
import '../services/user_service.dart';
import '../services/group_service.dart';
import '../services/conversation_service.dart';
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

final locationServiceProvider = Provider<LocationService>((ref) {
  final api = ref.watch(apiClientProvider);
  return LocationService(apiClient: api);
});

final uploadServiceProvider = Provider<UploadService>((ref) {
  final api = ref.watch(apiClientProvider);
  return UploadService(apiClient: api);
});

final chatbotServiceProvider = Provider<ChatbotService>((ref) {
  final api = ref.watch(apiClientProvider);
  return ChatbotService(apiClient: api);
});

final reportServiceProvider = Provider<ReportService>((ref) {
  final api = ref.watch(apiClientProvider);
  return ReportService(apiClient: api);
});

final userServiceProvider = Provider<UserService>((ref) {
  final api = ref.watch(apiClientProvider);
  return UserService(apiClient: api);
});

final groupServiceProvider = Provider<GroupService>((ref) {
  final api = ref.watch(apiClientProvider);
  return GroupService(apiClient: api);
});

final conversationServiceProvider = Provider<ConversationService>((ref) {
  final api = ref.watch(apiClientProvider);
  return ConversationService(apiClient: api);
});

final socketServiceProvider = Provider<SocketService>((ref) {
  final socketSvc = SocketService();
  
  // Connect/Disconnect based on auth state
  ref.listen(tokenStoreProvider, (prev, next) async {
    final token = await next.readAccessToken();
    if (token != null && token.isNotEmpty) {
      socketSvc.connect(token);
    } else {
      socketSvc.disconnect();
    }
  });

  // Initial connection if token already exists
  final tokenStore = ref.read(tokenStoreProvider);
  tokenStore.readAccessToken().then((token) {
    if (token != null && token.isNotEmpty) {
      socketSvc.connect(token);
    }
  });

  ref.onDispose(() => socketSvc.dispose());
  return socketSvc;
});

final webRTCServiceProvider = Provider<WebRTCService>((ref) {
  final socketSvc = ref.watch(socketServiceProvider);
  return WebRTCService(socketService: socketSvc);
});

