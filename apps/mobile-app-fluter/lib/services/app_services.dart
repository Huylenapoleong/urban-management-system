import "../core/network/api_client.dart";
import "../core/storage/auth_token_store.dart";
import "auth_service.dart";
import "conversation_service.dart";
import "group_service.dart";
import "local_cache_service.dart";
import "report_service.dart";
import "socket_service.dart";
import "upload_service.dart";
import "user_service.dart";
import "webrtc_service.dart";

class AppServices {
  AppServices._({
    required this.tokenStore,
    required this.apiClient,
    required this.authService,
    required this.conversationService,
    required this.reportService,
    required this.uploadService,
    required this.userService,
    required this.groupService,
    required this.socketService,
    required this.webRTCService,
  });

  factory AppServices.create() {
    final tokenStore = AuthTokenStore();
    final apiClient = ApiClient(tokenStore: tokenStore);
    final socketService = SocketService();

    final authService = AuthService(apiClient: apiClient, tokenStore: tokenStore);
    final conversationService = ConversationService(apiClient: apiClient);
    final webRTCService = WebRTCService(socketService: socketService);

    socketService.onChatReady.listen((_) async {
      final pending = await LocalCacheService.instance.getPendingMessages();
      for (final p in pending) {
        try {
          final msgId = p['id'] ?? p['messageId'];
          if (msgId == null) continue;
          
          await conversationService.sendMessage(
            p['conversationId'],
            content: p['content'],
            clientMessageId: msgId,
            type: p['type'] ?? 'TEXT',
            attachmentUrl: p['attachmentUrl'],
            attachmentKey: p['attachmentKey'],
            replyTo: p['replyTo'],
          );
          await LocalCacheService.instance.deleteMessage(msgId);
        } catch (_) {
          // If it fails again, it will stay in the outbox
        }
      }
    });

    return AppServices._(
      tokenStore: tokenStore,
      apiClient: apiClient,
      authService: authService,
      conversationService: conversationService,
      reportService: ReportService(apiClient: apiClient),
      uploadService: UploadService(apiClient: apiClient),
      userService: UserService(apiClient: apiClient),
      groupService: GroupService(apiClient: apiClient),
      socketService: socketService,
      webRTCService: webRTCService,
    );
  }

  final AuthTokenStore tokenStore;
  final ApiClient apiClient;
  final AuthService authService;
  final ConversationService conversationService;
  final ReportService reportService;
  final UploadService uploadService;
  final UserService userService;
  final GroupService groupService;
  final SocketService socketService;
  final WebRTCService webRTCService;
}
