import "../core/network/api_client.dart";
import "../core/storage/auth_token_store.dart";
import "auth_service.dart";
import "conversation_service.dart";
import "group_service.dart";
import "local_notification_service.dart";
import "report_service.dart";
import "socket_service.dart";
import "upload_service.dart";
import "user_service.dart";
import "webrtc_service.dart";
import "push_notification_service.dart";

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
    required this.pushNotificationService,
    required this.localNotificationService,
  });

  factory AppServices.create() {
    final tokenStore = AuthTokenStore();
    final apiClient = ApiClient(tokenStore: tokenStore);
    final socketService = SocketService();

    final authService = AuthService(apiClient: apiClient, tokenStore: tokenStore);
    final conversationService = ConversationService(apiClient: apiClient);
    final webRTCService = WebRTCService(socketService: socketService);



    final userService = UserService(apiClient: apiClient);
    final localNotificationService = LocalNotificationService();

    return AppServices._(
      tokenStore: tokenStore,
      apiClient: apiClient,
      authService: authService,
      conversationService: conversationService,
      reportService: ReportService(apiClient: apiClient),
      uploadService: UploadService(apiClient: apiClient),
      userService: userService,
      groupService: GroupService(apiClient: apiClient),
      socketService: socketService,
      webRTCService: webRTCService,
      pushNotificationService: PushNotificationService(userService: userService),
      localNotificationService: localNotificationService,
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
  final PushNotificationService pushNotificationService;
  final LocalNotificationService localNotificationService;
}
