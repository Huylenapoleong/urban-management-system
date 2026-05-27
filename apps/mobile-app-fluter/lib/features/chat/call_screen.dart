import "dart:async";
import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "package:flutter_webrtc/flutter_webrtc.dart";
import "../../models/conversation_summary.dart";
import "../../models/user_profile.dart";
import "../../services/webrtc_service.dart";
import "../../services/app_services.dart";
import "../shared/widgets/user_avatar.dart";
import "chat_detail_screen.dart";

class CallScreen extends StatefulWidget {
  final WebRTCService webRTCService;
  final ConversationSummary conversation;
  final dynamic currentUser;
  final bool launchedFromChatDetail;

  const CallScreen({
    super.key,
    required this.webRTCService,
    required this.conversation,
    required this.currentUser,
    this.launchedFromChatDetail = false,
  });

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  double _localX = 20.0;
  double _localY = 100.0;
  bool _localCoordinatesInitialized = false;

  String? _loadedGroupName;
  String? _loadedGroupAvatarUrl;
  bool _loadingGroupDetails = false;
  final Map<String, UserProfile> _profileCache = {};
  final Set<String> _requestedProfileIds = {};
  StreamSubscription? _participantLeftSub;

  @override
  void initState() {
    super.initState();
    widget.webRTCService.isCallMinimized.value = false;
    if (widget.currentUser?.id != null) {
      widget.webRTCService.setLocalUserId(widget.currentUser!.id.toString());
    }
    widget.webRTCService.callState.addListener(_handleCallStateChange);
    _participantLeftSub = widget.webRTCService.onParticipantLeft.listen((userId) {
      if (mounted) {
        _showParticipantLeftToast(userId);
      }
    });
    _loadGroupDetails();
  }

  Future<void> _loadGroupDetails() async {
    final isGroup = widget.conversation.isGroup ||
        widget.webRTCService.activeConfig?['isGroup'] == true ||
        widget.webRTCService.currentConversationId?.startsWith("group:") == true ||
        widget.webRTCService.currentConversationId?.startsWith("group#") == true ||
        widget.webRTCService.currentConversationId?.startsWith("grp#") == true ||
        widget.webRTCService.currentConversationId?.startsWith("GRP#") == true;

    if (!isGroup) return;

    setState(() {
      _loadingGroupDetails = true;
    });

    try {
      var groupId = widget.conversation.groupId;
      if (groupId == null) {
        final convId = widget.conversation.conversationId.isNotEmpty
            ? widget.conversation.conversationId
            : (widget.webRTCService.currentConversationId ?? "");
        if (convId.startsWith("group:")) {
          groupId = convId.substring(6);
        } else if (convId.startsWith("group#")) {
          groupId = convId.substring(6);
        } else if (convId.startsWith("grp#")) {
          groupId = convId.substring(4);
        } else if (convId.startsWith("GRP#")) {
          groupId = convId.substring(4);
        }
      }

      if (groupId != null && groupId.isNotEmpty) {
        final services = Provider.of<AppServices>(context, listen: false);
        final group = await services.groupService.getGroup(groupId);
        if (mounted) {
          setState(() {
            _loadedGroupName = group['name']?.toString();
            _loadedGroupAvatarUrl = group['avatarUrl']?.toString();
          });
        }
      }
    } catch (e) {
      debugPrint("Failed to load group details in CallScreen: $e");
    } finally {
      if (mounted) {
        setState(() {
          _loadingGroupDetails = false;
        });
      }
    }
  }

  void _handleCallStateChange() {
    if (widget.webRTCService.callState.value == CallState.idle && mounted) {
      if (widget.launchedFromChatDetail) {
        final targetRoute = "chat_detail/${widget.conversation.conversationId}";
        Navigator.of(context).popUntil(
          (route) => route.settings.name == targetRoute || route.isFirst,
        );
      } else {
        final services = Provider.of<AppServices>(context, listen: false);
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            settings: RouteSettings(
              name: "chat_detail/${widget.conversation.conversationId}",
            ),
            builder: (_) => ChatDetailScreen(
              conversation: widget.conversation,
              conversationService: services.conversationService,
              uploadService: services.uploadService,
              socketService: services.socketService,
              userService: services.userService,
              groupService: services.groupService,
              webRTCService: services.webRTCService,
              currentUser: widget.currentUser,
            ),
          ),
        );
      }
    }
  }

  String _resolveAvatarUrl(UserProfile profile) {
    return profile.avatarUrl ?? profile.avatarAsset?.resolvedUrl ?? "";
  }

  void _prefetchProfiles(Iterable<String> userIds) {
    final services = Provider.of<AppServices>(context, listen: false);
    for (final userId in userIds) {
      if (userId.trim().isEmpty || _requestedProfileIds.contains(userId)) {
        continue;
      }
      _requestedProfileIds.add(userId);
      services.userService.getUserById(userId).then((profile) {
        if (!mounted) return;
        setState(() {
          _profileCache[userId] = profile;
        });
      }).catchError((_) {});
    }
  }

  void _showParticipantLeftToast(String userId) {
    final profile = _profileCache[userId];
    final displayName = profile?.fullName ?? "Thành viên";
    
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          "$displayName đã rời cuộc gọi",
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
        ),
        backgroundColor: const Color(0xFF1E293B),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        duration: const Duration(seconds: 3),
        margin: const EdgeInsets.fromLTRB(24, 0, 24, 150),
      ),
    );
  }

  @override
  void dispose() {
    widget.webRTCService.callState.removeListener(_handleCallStateChange);
    _participantLeftSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_localCoordinatesInitialized) {
      final size = MediaQuery.of(context).size;
      _localX = size.width - 110 - 20;
      _localY = size.height - 340;
      _localCoordinatesInitialized = true;
    }

    return ValueListenableBuilder<CallState>(
      valueListenable: widget.webRTCService.callState,
      builder: (context, state, child) {
        if (state == CallState.idle) {
          return const Scaffold(
            backgroundColor: Color(0xFF000000),
            body: Center(
              child: CircularProgressIndicator(color: Color(0xFF7C3AED)),
            ),
          );
        }

        return PopScope(
          canPop: false,
          onPopInvokedWithResult: (didPop, result) {
            if (!didPop) {
              widget.webRTCService.isCallMinimized.value = true;
              Navigator.of(context).pop('minimize');
            }
          },
          child: Scaffold(
            backgroundColor: const Color(0xFF000000),
            body: Stack(
              children: [
                // Deep OLED Dark background with smooth gradient
                Positioned.fill(
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0xFF000000), Color(0xFF0F0F23), Color(0xFF1E1B4B)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                  ),
                ),

                // Main Calling Layouts based on state
                Positioned.fill(
                  child: _buildLayoutForState(state),
                ),

                // Minimize Button at Top Left (Renders in connecting, connected states)
                if (state != CallState.ringing)
                  Positioned(
                    top: MediaQuery.of(context).padding.top + 8,
                    left: 16,
                    child: GestureDetector(
                      onTap: () {
                        widget.webRTCService.isCallMinimized.value = true;
                        Navigator.of(context).pop('minimize');
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white.withOpacity(0.08)),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.picture_in_picture_alt, color: Colors.white, size: 16),
                            SizedBox(width: 6),
                            Text(
                              'Thu nhỏ',
                              style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                // Connected Toggles / Ringing Action Panel at bottom
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  child: _buildActionPanelForState(state),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildLayoutForState(CallState state) {
    if (state == CallState.ringing) {
      final isVideo = !widget.webRTCService.isAudioOnly;
      final isGroup = widget.conversation.isGroup ||
          widget.webRTCService.activeConfig?['isGroup'] == true ||
          widget.webRTCService.currentConversationId?.startsWith("group:") == true ||
          widget.webRTCService.currentConversationId?.startsWith("group#") == true ||
          widget.webRTCService.currentConversationId?.startsWith("grp#") == true ||
          widget.webRTCService.currentConversationId?.startsWith("GRP#") == true;

      final callerName = widget.webRTCService.activeConfig?['callerName']?.toString() ??
          widget.conversation.lastSenderName ??
          "Ai đó";

      final displayAvatarUrl = isGroup
          ? (_loadedGroupAvatarUrl ?? widget.conversation.groupAvatarUrl)
          : widget.conversation.getPeerId(widget.currentUser?.id) != null
              ? (widget.conversation.peerAvatarUrl ?? widget.conversation.avatarUrl)
              : (widget.webRTCService.activeConfig?['callerAvatarUrl']?.toString() ?? widget.conversation.avatarUrl);

      final displayTitle = isGroup
          ? (_loadedGroupName ?? widget.conversation.groupName ?? "Cuộc gọi nhóm")
          : widget.conversation.title;

      final displaySub = isGroup
          ? "$callerName đang gọi nhóm..."
          : (isVideo ? "Cuộc gọi Video đến..." : "Cuộc gọi Thoại đến...");

      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          PulseRippleAnimation(
            child: UserAvatar(
              userId: isGroup
                  ? null
                  : widget.conversation.getPeerId(widget.currentUser?.id) ??
                      widget.webRTCService.activeConfig?['callerId']?.toString(),
              initialAvatarUrl: displayAvatarUrl,
              initialDisplayName: displayTitle,
              radius: 70,
            ),
          ),
          const SizedBox(height: 32),
          Text(
            displayTitle,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.5,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.06),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  isVideo ? Icons.videocam : Icons.phone,
                  color: const Color(0xFF7C3AED),
                  size: 16,
                ),
                const SizedBox(width: 8),
                Text(
                  displaySub,
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    if (state == CallState.connecting) {
      final isGroup = widget.conversation.isGroup ||
          widget.webRTCService.activeConfig?['isGroup'] == true ||
          widget.webRTCService.currentConversationId?.startsWith("group:") == true ||
          widget.webRTCService.currentConversationId?.startsWith("group#") == true ||
          widget.webRTCService.currentConversationId?.startsWith("grp#") == true ||
          widget.webRTCService.currentConversationId?.startsWith("GRP#") == true;

      final displayAvatarUrl = isGroup
          ? (_loadedGroupAvatarUrl ?? widget.conversation.groupAvatarUrl)
          : widget.conversation.getPeerId(widget.currentUser?.id) != null
              ? (widget.conversation.peerAvatarUrl ?? widget.conversation.avatarUrl)
              : (widget.webRTCService.activeConfig?['callerAvatarUrl']?.toString() ?? widget.conversation.avatarUrl);

      final displayTitle = isGroup
          ? (_loadedGroupName ?? widget.conversation.groupName ?? "Cuộc gọi nhóm")
          : widget.conversation.title;

      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          UserAvatar(
            userId: isGroup
                ? null
                : widget.conversation.getPeerId(widget.currentUser?.id) ??
                    widget.webRTCService.activeConfig?['callerId']?.toString(),
            initialAvatarUrl: displayAvatarUrl,
            initialDisplayName: displayTitle,
            radius: 65,
          ),
          const SizedBox(height: 24),
          Text(
            displayTitle,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 26,
              fontWeight: FontWeight.bold,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          Text(
            "Đang kết nối...",
            style: TextStyle(
              color: Colors.white.withOpacity(0.6),
              fontSize: 14,
            ),
          ),
        ],
      );
    }

    // Connected state
    return StreamBuilder<Map<String, MediaStream>>(
      stream: widget.webRTCService.onRemoteStreamsUpdated,
      initialData: widget.webRTCService.remoteStreams,
      builder: (context, streamsSnapshot) {
        final remoteStreams = streamsSnapshot.data ?? {};
        final localStream = widget.webRTCService.localStream;

        return StreamBuilder<Set<String>>(
          stream: widget.webRTCService.onSpeakingPeersUpdated,
          initialData: widget.webRTCService.speakingPeers,
          builder: (context, speakingSnapshot) {
            final speakingPeers = speakingSnapshot.data ?? {};

            final isGroup = widget.conversation.isGroup || remoteStreams.length > 1;

            if (!isGroup && remoteStreams.isNotEmpty && localStream != null) {
              final remoteEntry = remoteStreams.entries.first;
              return _build11Layout(
                localStream,
                remoteEntry.key,
                remoteEntry.value,
                speakingPeers,
              );
            }

            return _buildGroupLayout(localStream, remoteStreams, speakingPeers);
          },
        );
      },
    );
  }

  Widget _build11Layout(
    MediaStream localStream,
    String remotePeerId,
    MediaStream remoteStream,
    Set<String> speakingPeers,
  ) {
    _prefetchProfiles([remotePeerId]);
    final profile = _profileCache[remotePeerId];
    final peerName = profile?.fullName ?? widget.conversation.title;
    final peerAvatarUrl = profile != null ? _resolveAvatarUrl(profile) : null;
    final isSpeaking = speakingPeers.contains(remotePeerId);

    return Stack(
      children: [
        // Full screen remote video
        Positioned.fill(
          child: PeerVideoWidget(
            stream: remoteStream,
            label: peerName,
            avatarUrl: peerAvatarUrl,
            isSpeaking: isSpeaking,
          ),
        ),

        // Draggable Local Preview
        Positioned(
          left: _localX,
          top: _localY,
          child: GestureDetector(
            onPanUpdate: (details) {
              setState(() {
                _localX += details.delta.dx;
                _localY += details.delta.dy;
              });
            },
            onPanEnd: (details) {
              final size = MediaQuery.of(context).size;
              double targetX = _localX;
              double targetY = _localY.clamp(80.0, size.height - 290.0);
              if (_localX < size.width / 2 - 55) {
                targetX = 20.0;
              } else {
                targetX = size.width - 110.0 - 20.0;
              }
              setState(() {
                _localX = targetX;
                _localY = targetY;
              });
            },
            child: Container(
              width: 110,
              height: 160,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                boxShadow: const [
                  BoxShadow(
                    color: Colors.black54,
                    blurRadius: 10,
                    offset: Offset(0, 4),
                  )
                ],
              ),
              child: PeerVideoWidget(
                stream: localStream,
                label: "Tôi",
                isLocal: true,
                isCameraOff: widget.webRTCService.isCameraOff,
                avatarUrl: null,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildGroupLayout(
    MediaStream? localStream,
    Map<String, MediaStream> remoteStreams,
    Set<String> speakingPeers,
  ) {
    final List<MapEntry<String, MediaStream>> entries = remoteStreams.entries.toList();
    _prefetchProfiles(entries.map((entry) => entry.key));
    entries.sort((a, b) {
      final aSpeaking = speakingPeers.contains(a.key) ? 1 : 0;
      final bSpeaking = speakingPeers.contains(b.key) ? 1 : 0;
      return bSpeaking.compareTo(aSpeaking);
    });

    final allParticipants = <Widget>[];
    if (localStream != null) {
      allParticipants.add(
        PeerVideoWidget(
          stream: localStream,
          label: "Tôi",
          isLocal: true,
          isCameraOff: widget.webRTCService.isCameraOff,
        ),
      );
    }

    for (final entry in entries) {
      final profile = _profileCache[entry.key];
      final displayName = profile?.fullName ??
          "Thành viên ${entry.key.substring(0, entry.key.length.clamp(0, 4))}";
      final avatarUrl = profile != null ? _resolveAvatarUrl(profile) : null;
      allParticipants.add(
        PeerVideoWidget(
          stream: entry.value,
          label: displayName,
          avatarUrl: avatarUrl,
          isSpeaking: speakingPeers.contains(entry.key),
        ),
      );
    }

    final crossAxisCount = allParticipants.length <= 2 ? 1 : 2;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 90, 16, 160),
      child: GridView.builder(
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: crossAxisCount,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: crossAxisCount == 1 ? 1.0 : 0.78,
        ),
        itemCount: allParticipants.length,
        itemBuilder: (context, index) => allParticipants[index],
      ),
    );
  }

  Widget _buildActionPanelForState(CallState state) {
    if (state == CallState.ringing) {
      return Container(
        padding: const EdgeInsets.symmetric(vertical: 40),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [Colors.transparent, Colors.black.withOpacity(0.8)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _buildActionButton(
              icon: Icons.call_end,
              color: Colors.red,
              onPressed: () => widget.webRTCService.rejectCall(),
            ),
            _buildActionButton(
              icon: Icons.call,
              color: Colors.green,
              onPressed: () => widget.webRTCService.acceptCall(),
            ),
          ],
        ),
      );
    }

    final svc = widget.webRTCService;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 30),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.55),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          // Mute toggle
          _buildControlIcon(
            icon: svc.isMuted ? Icons.mic_off : Icons.mic,
            color: svc.isMuted ? Colors.redAccent.withOpacity(0.2) : Colors.white.withOpacity(0.05),
            activeColor: svc.isMuted ? Colors.redAccent : Colors.white,
            onPressed: () {
              setState(() {
                svc.toggleMute();
              });
            },
          ),

          // Camera toggle
          _buildControlIcon(
            icon: svc.isCameraOff ? Icons.videocam_off : Icons.videocam,
            color: svc.isCameraOff ? Colors.redAccent.withOpacity(0.2) : Colors.white.withOpacity(0.05),
            activeColor: svc.isCameraOff ? Colors.redAccent : Colors.white,
            onPressed: () {
              setState(() {
                svc.toggleCamera();
              });
            },
          ),

          // Speakerphone toggle
          _buildControlIcon(
            icon: svc.isSpeakerOn ? Icons.volume_up : Icons.volume_down,
            color: svc.isSpeakerOn ? const Color(0xFF7C3AED).withOpacity(0.2) : Colors.white.withOpacity(0.05),
            activeColor: svc.isSpeakerOn ? const Color(0xFF7C3AED) : Colors.white,
            onPressed: () {
              setState(() {
                svc.toggleSpeaker();
              });
            },
          ),

          // Switch camera (front/back)
          if (!svc.isCameraOff && svc.localStream != null && svc.localStream!.getVideoTracks().isNotEmpty)
            _buildControlIcon(
              icon: Icons.flip_camera_ios,
              color: Colors.white.withOpacity(0.05),
              activeColor: Colors.white,
              onPressed: () {
                svc.switchCamera();
              },
            ),

          // Hang up
          _buildControlIcon(
            icon: Icons.call_end,
            color: Colors.red,
            activeColor: Colors.white,
            size: 56,
            onPressed: () => svc.stopCall(),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required Color color,
    required VoidCallback onPressed,
    double size = 64,
  }) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: color.withOpacity(0.35),
            blurRadius: 14,
            spreadRadius: 2,
          )
        ],
      ),
      child: IconButton(
        icon: Icon(icon, color: Colors.white, size: 28),
        onPressed: () {
          Feedback.forTap(context);
          onPressed();
        },
      ),
    );
  }

  Widget _buildControlIcon({
    required IconData icon,
    required Color color,
    required Color activeColor,
    required VoidCallback onPressed,
    double size = 48,
  }) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
      child: IconButton(
        icon: Icon(icon, color: activeColor, size: size * 0.48),
        onPressed: () {
          Feedback.forTap(context);
          onPressed();
        },
      ),
    );
  }
}

class PeerVideoWidget extends StatefulWidget {
  final MediaStream stream;
  final String label;
  final bool isLocal;
  final bool isSpeaking;
  final bool isCameraOff;
  final String? avatarUrl;

  const PeerVideoWidget({
    super.key,
    required this.stream,
    required this.label,
    this.isLocal = false,
    this.isSpeaking = false,
    this.isCameraOff = false,
    this.avatarUrl,
  });

  @override
  State<PeerVideoWidget> createState() => _PeerVideoWidgetState();
}

class _PeerVideoWidgetState extends State<PeerVideoWidget> {
  final _renderer = RTCVideoRenderer();
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    _initRenderer();
  }

  Future<void> _initRenderer() async {
    await _renderer.initialize();
    if (mounted) {
      setState(() {
        _renderer.srcObject = widget.stream;
        _initialized = true;
      });
    }
  }

  @override
  void didUpdateWidget(PeerVideoWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.stream != widget.stream) {
      _renderer.srcObject = widget.stream;
    }
  }

  @override
  void dispose() {
    _renderer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final showVideo =
      !widget.isCameraOff && widget.stream.getVideoTracks().isNotEmpty;

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0F0F1A),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: widget.isSpeaking ? const Color(0xFF10B981) : Colors.white.withOpacity(0.08),
          width: widget.isSpeaking ? 3.0 : 1.0,
        ),
        boxShadow: widget.isSpeaking
            ? [
                BoxShadow(
                  color: const Color(0xFF10B981).withOpacity(0.3),
                  blurRadius: 14,
                  spreadRadius: 2,
                )
              ]
            : null,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(19),
        child: Stack(
          children: [
            if (_initialized && showVideo)
              RTCVideoView(
                _renderer,
                objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
              )
            else
              Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    UserAvatar(
                      userId: null,
                      initialAvatarUrl: widget.avatarUrl,
                      initialDisplayName: widget.label,
                      radius: 42,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      widget.label,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),

            // Tag status at bottom
            Positioned(
              bottom: 12,
              left: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.65),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.white.withOpacity(0.05)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (widget.isSpeaking)
                      const Icon(Icons.mic, color: Color(0xFF10B981), size: 13)
                    else if (widget.stream.getAudioTracks().isEmpty)
                      const Icon(Icons.mic_off, color: Colors.redAccent, size: 13)
                    else
                      const Icon(Icons.mic, color: Colors.white54, size: 13),
                    const SizedBox(width: 6),
                    Text(
                      widget.label,
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class PulseRippleAnimation extends StatefulWidget {
  final Widget child;
  const PulseRippleAnimation({super.key, required this.child});

  @override
  State<PulseRippleAnimation> createState() => _PulseRippleAnimationState();
}

class _PulseRippleAnimationState extends State<PulseRippleAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Stack(
          alignment: Alignment.center,
          children: [
            for (int i = 3; i >= 1; i--)
              Container(
                width: 140 + (i * 35 * _controller.value),
                height: 140 + (i * 35 * _controller.value),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFF7C3AED).withOpacity(
                    ((1.0 - _controller.value).clamp(0.0, 1.0) / (i * 2.2)).clamp(0.0, 1.0),
                  ),
                ),
              ),
            widget.child,
          ],
        );
      },
    );
  }
}
