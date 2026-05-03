import "dart:async";
import "package:flutter/material.dart";

import "package:flutter_webrtc/flutter_webrtc.dart";
import "../../models/conversation_summary.dart";
import "../../services/webrtc_service.dart";
import "../shared/widgets/user_avatar.dart";

class CallScreen extends StatefulWidget {
  final WebRTCService webRTCService;
  final ConversationSummary conversation;
  final dynamic currentUser;

  const CallScreen({
    super.key,
    required this.webRTCService,
    required this.conversation,
    required this.currentUser,
  });

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  final Map<String, RTCVideoRenderer> _remoteRenderers = {};
  StreamSubscription? _remoteStreamsSub;
  Timer? _timer;
  int _seconds = 0;

  @override
  void initState() {
    super.initState();
    _initRenderers();
  }

  Future<void> _initRenderers() async {
    try {
      await _localRenderer.initialize();

      if (mounted) {
        setState(() {
          _localRenderer.srcObject = widget.webRTCService.localStream;
        });
      }

      // Restore existings streams if user re-enters the active CallScreen
      if (widget.webRTCService.remoteStreams.isNotEmpty) {
        _handleRemoteStreamsUpdate(widget.webRTCService.remoteStreams);
      }

      _remoteStreamsSub = widget.webRTCService.onRemoteStreamsUpdated.listen((streamsMap) {
        if (mounted) {
          _handleRemoteStreamsUpdate(streamsMap);
        }
      });

      widget.webRTCService.callState.addListener(_handleCallStateChange);
    } catch (e) {
      debugPrint("Error initializing renderers: $e");
    }
  }

  Future<void> _handleRemoteStreamsUpdate(Map<String, MediaStream> streamsMap) async {
    bool hasChanges = false;
    
    // Xóa các luồng đã bị ngắt
    final keysToRemove = _remoteRenderers.keys.where((k) => !streamsMap.containsKey(k)).toList();
    for (final key in keysToRemove) {
      final renderer = _remoteRenderers.remove(key);
      renderer?.dispose();
      hasChanges = true;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Một thành viên vừa rời cuộc gọi"), duration: Duration(seconds: 2)),
        );
      }
    }

    // Thêm các luồng mới
    for (final entry in streamsMap.entries) {
      if (!_remoteRenderers.containsKey(entry.key)) {
        final renderer = RTCVideoRenderer();
        await renderer.initialize();
        renderer.srcObject = entry.value;
        _remoteRenderers[entry.key] = renderer;
        hasChanges = true;
        _startTimer();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Một thành viên kết nối thành công"), duration: Duration(seconds: 2)),
          );
        }
      }
    }

    if (hasChanges && mounted) {
      setState(() {});
    }
  }

  void _handleCallStateChange() {
    if (mounted && _localRenderer.srcObject == null) {
      setState(() {
        _localRenderer.srcObject = widget.webRTCService.localStream;
      });
    }
  }

  void _startTimer() {
    if (_timer != null) return;
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) setState(() => _seconds++);
    });
  }

  String _formatDuration(int seconds) {
    final m = (seconds ~/ 60).toString().padLeft(2, "0");
    final s = (seconds % 60).toString().padLeft(2, "0");
    return "$m:$s";
  }

  @override
  void dispose() {
    _timer?.cancel();
    widget.webRTCService.callState.removeListener(_handleCallStateChange);
    _remoteStreamsSub?.cancel();
    _localRenderer.dispose();
    for (final renderer in _remoteRenderers.values) {
      renderer.dispose();
    }
    _remoteRenderers.clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<CallState>(
      valueListenable: widget.webRTCService.callState,
      builder: (context, state, child) {
        if (state == CallState.idle) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) Navigator.of(context).pop();
          });
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }

        return Scaffold(
          backgroundColor: const Color(0xFF0F172A),
          body: Stack(
            children: [
              // Background / Video
              if (state == CallState.connected && !widget.webRTCService.isAudioOnly && !widget.webRTCService.isCameraOff)
                Positioned.fill(
                  child: _buildVideoGrid(),
                )
              else
                // Audio-only or Calling/Connecting Background
                Positioned.fill(
                  child: Stack(
                    children: [
                      Center(
                        child: Opacity(
                          opacity: 0.1,
                          child: UserAvatar(
                            userId: null,
                            initialAvatarUrl: widget.conversation.isGroup ? widget.conversation.groupAvatarUrl : (widget.conversation.peerAvatarUrl ?? widget.conversation.avatarUrl),
                            initialDisplayName: widget.conversation.title,
                            radius: 200,
                          ),
                        ),
                      ),
                      Container(color: Colors.black.withOpacity(0.5)),
                    ],
                  ),
                ),

              // UI Info Overlay
              if (state != CallState.connected || widget.webRTCService.isAudioOnly || widget.webRTCService.isCameraOff)
                _buildCallingInfo(),

              // Local Video Overlay (Now handled inside _buildVideoGrid if there are multiple remote streams, but fallback kept for 1-1)
              if (state == CallState.connected && !widget.webRTCService.isAudioOnly && !widget.webRTCService.isCameraOff && _remoteRenderers.length <= 1)
                Positioned(
                  top: 50,
                  right: 20,
                  width: 120,
                  height: 180,
                  child: Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white24, width: 2),
                      boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 10)],
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: RTCVideoView(
                      _localRenderer,
                      mirror: true,
                      objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                    ),
                  ),
                ),

              // Controls
              Positioned(
                bottom: 50,
                left: 0,
                right: 0,
                child: _buildControls(state),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildVideoGrid() {
    if (_remoteRenderers.isEmpty) {
      // Show only local video occupying full screen
      return RTCVideoView(
        _localRenderer,
        mirror: true,
        objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
      );
    }
    
    if (_remoteRenderers.length == 1) {
      // 1-to-1 call: Remote video takes full screen
      return RTCVideoView(
        _remoteRenderers.values.first,
        objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
      );
    }

    // Grid View cho Group Call (> 2 người)
    // Bao gồm cả Local (Local sẽ là 1 cell trong Grid thay vì overlay góc phải)
    final renderers = [
      _localRenderer,
      ..._remoteRenderers.values,
    ];

    int columns = 1;
    if (renderers.length > 2) columns = 2; // 3-4 -> 2x2 grid

    return GridView.builder(
      physics: const ClampingScrollPhysics(), // Có thể cuộn nếu >4 người
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        childAspectRatio: columns == 1 ? 9 / 16 /*Chia đôi ngang*/ : 1, // Tuỳ số lượng cắt tỉ lệ khung ảnh
      ),
      itemCount: renderers.length,
      itemBuilder: (context, index) {
        return Container(
          margin: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            color: Colors.black26,
            borderRadius: BorderRadius.circular(12),
          ),
          clipBehavior: Clip.antiAlias,
          child: RTCVideoView(
            renderers[index],
            mirror: renderers[index] == _localRenderer,
            objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
          ),
        );
      },
    );
  }

  Widget _buildCallingInfo() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              // Pulse effect for audio call
              if (widget.webRTCService.isAudioOnly)
                _buildPulseEffect(),
              UserAvatar(
                userId: widget.conversation.isGroup ? null : widget.conversation.getPeerId(widget.currentUser?.id), // Fetch from DB!
                initialAvatarUrl: widget.conversation.isGroup ? widget.conversation.groupAvatarUrl : (widget.conversation.peerAvatarUrl ?? widget.conversation.avatarUrl),
                initialDisplayName: widget.conversation.title,
                radius: 80,
              ),
            ],
          ),
          const SizedBox(height: 32),
          Text(
            widget.conversation.title,
            style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold, letterSpacing: 0.5),
          ),
          const SizedBox(height: 12),
          ValueListenableBuilder<CallState>(
            valueListenable: widget.webRTCService.callState,
            builder: (context, state, _) {
              if (state == CallState.connected) {
                return Text(
                  _formatDuration(_seconds),
                  style: const TextStyle(color: Colors.greenAccent, fontSize: 20, fontWeight: FontWeight.w600, fontFamily: "monospace"),
                );
              }
              String status = "Đang gọi...";
              if (state == CallState.ringing) status = "Cuộc gọi đến...";
              if (state == CallState.connecting) status = "Đang kết nối...";
              return Text(status, style: const TextStyle(color: Colors.white70, fontSize: 16));
            },
          ),
        ],
      ),
    );
  }

  Widget _buildPulseEffect() {
    return TweenAnimationBuilder(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: const Duration(seconds: 2),
      curve: Curves.easeOut,
      builder: (context, double value, child) {
        return Container(
          width: 160 + (80 * value),
          height: 160 + (80 * value),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white.withOpacity(0.15 * (1 - value)),
          ),
        );
      },
      onEnd: () {
        // This is a hack to loop the animation
        setState(() {});
      },
    );
  }

  Widget _buildControls(CallState state) {
    if (state == CallState.ringing) {
      return Row(
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
      );
    }

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _buildActionButton(
              icon: Icons.chat,
              color: Colors.blueAccent.withValues(alpha: 0.3),
              onPressed: () {
                // Nhắn tin: Return to previous screen (Chat Workspace), PiP will take over
                Navigator.of(context).pop();
              },
            ),
            _buildActionButton(
              icon: widget.webRTCService.isMuted ? Icons.mic_off : Icons.mic,
              color: Colors.white24,
              onPressed: () {
                setState(() => widget.webRTCService.toggleMute());
              },
            ),
            if (!widget.webRTCService.isAudioOnly)
              _buildActionButton(
                icon: widget.webRTCService.isCameraOff ? Icons.videocam_off : Icons.videocam,
                color: Colors.white24,
                onPressed: () {
                  setState(() => widget.webRTCService.toggleCamera());
                },
              ),
            _buildActionButton(
              icon: widget.webRTCService.isSpeakerOn ? Icons.volume_up : Icons.volume_down,
              color: Colors.white24,
              onPressed: () {
                setState(() => widget.webRTCService.toggleSpeaker());
              },
            ),
            if (!widget.webRTCService.isAudioOnly)
              _buildActionButton(
                icon: Icons.flip_camera_ios,
                color: Colors.white24,
                onPressed: () => widget.webRTCService.switchCamera(),
              ),
            _buildActionButton(
              icon: Icons.fullscreen_exit,
              color: Colors.white24,
              onPressed: () {
                // PiP
                Navigator.of(context).pop();
              },
            ),
          ],
        ),
        const SizedBox(height: 30),
        _buildActionButton(
          icon: Icons.call_end,
          color: Colors.red,
          onPressed: () => widget.webRTCService.stopCall(),
          size: 70,
        ),
      ],
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required Color color,
    required VoidCallback onPressed,
    double size = 60,
  }) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
      child: IconButton(
        icon: Icon(icon, color: Colors.white),
        onPressed: onPressed,
      ),
    );
  }
}
