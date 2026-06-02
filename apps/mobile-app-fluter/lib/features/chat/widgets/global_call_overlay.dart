import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../../../services/app_services.dart";
import "../../../services/webrtc_service.dart";
import "../../../state/session_controller.dart";
import "../../../models/conversation_summary.dart";
import "../call_screen.dart";
import "floating_call_overlay.dart";
import "../../../../main.dart";

class GlobalCallOverlay extends StatelessWidget {
  final AppServices services;

  const GlobalCallOverlay({super.key, required this.services});

  @override
  Widget build(BuildContext context) {
    final webRTCService = services.webRTCService;

    return ValueListenableBuilder<CallState>(
      valueListenable: webRTCService.callState,
      builder: (context, state, _) {
        if (state == CallState.idle) return const SizedBox.shrink();

        return ValueListenableBuilder<bool>(
          valueListenable: webRTCService.isCallMinimized,
          builder: (context, isMinimized, _) {
            if (!isMinimized) return const SizedBox.shrink();

            return FloatingCallOverlay(
              webRTCService: webRTCService,
              onTap: () {
                final session = Provider.of<SessionController>(context, listen: false);
                final user = session.user;
                final convId = webRTCService.currentConversationId;
                if (convId != null && user != null) {
                  final isGroup = convId.startsWith("group:") ||
                      convId.startsWith("group#") ||
                      convId.startsWith("grp#") ||
                      convId.startsWith("GRP#");

                  webRTCService.isCallMinimized.value = false;

                  UrbanManagementApp.navigatorKey.currentState!.push(
                    MaterialPageRoute(
                      builder: (_) => CallScreen(
                        webRTCService: webRTCService,
                        conversation: ConversationSummary(
                          conversationId: convId,
                          groupName: isGroup ? "Cuộc gọi nhóm" : "Đang gọi",
                          unreadCount: 0,
                          isGroup: isGroup,
                          updatedAt: DateTime.now().toIso8601String(),
                        ),
                        currentUser: user,
                      ),
                    ),
                  );
                }
              },
              onClose: () => webRTCService.stopCall(),
            );
          },
        );
      },
    );
  }
}
