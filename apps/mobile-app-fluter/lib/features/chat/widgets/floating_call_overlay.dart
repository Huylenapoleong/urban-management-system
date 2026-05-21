import "dart:async";
import "package:flutter/material.dart";
import "package:flutter_webrtc/flutter_webrtc.dart";
import "../../../services/webrtc_service.dart";

class FloatingCallOverlay extends StatefulWidget {
  final WebRTCService webRTCService;
  final VoidCallback onTap;
  final VoidCallback onClose;

  const FloatingCallOverlay({
    super.key,
    required this.webRTCService,
    required this.onTap,
    required this.onClose,
  });

  @override
  State<FloatingCallOverlay> createState() => _FloatingCallOverlayState();
}

class _FloatingCallOverlayState extends State<FloatingCallOverlay> {
  double _top = 150.0;
  double _left = 150.0;
  bool _initialized = false;
  late final Timer _timer;
  int _seconds = 0;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _seconds++;
        });
      }
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  String _formatDuration(int totalSeconds) {
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    return "${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}";
  }

  @override
  Widget build(BuildContext context) {
    if (!_initialized) {
      final size = MediaQuery.of(context).size;
      _left = size.width - 120.0 - 16.0;
      _top = size.height - 170.0 - 140.0;
      _initialized = true;
    }

    return StreamBuilder<Map<String, MediaStream>>(
      stream: widget.webRTCService.onRemoteStreamsUpdated,
      initialData: widget.webRTCService.remoteStreams,
      builder: (context, snapshot) {
        final remoteStreams = snapshot.data ?? {};
        final localStream = widget.webRTCService.localStream;

        return Positioned(
          left: _left,
          top: _top,
          child: GestureDetector(
            onPanUpdate: (details) {
              setState(() {
                _left += details.delta.dx;
                _top += details.delta.dy;
              });
            },
            onPanEnd: (details) {
              final size = MediaQuery.of(context).size;
              double targetLeft;
              if (_left < size.width / 2 - 60) {
                targetLeft = 16.0;
              } else {
                targetLeft = size.width - 120.0 - 16.0;
              }
              double targetTop = _top.clamp(80.0, size.height - 170.0 - 80.0);

              setState(() {
                _left = targetLeft;
                _top = targetTop;
              });
            },
            onTap: widget.onTap,
            child: Container(
              width: 120,
              height: 170,
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.82),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white.withOpacity(0.12), width: 1),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.4),
                    blurRadius: 16,
                    offset: const Offset(0, 8),
                  )
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(23),
                child: Stack(
                  children: [
                    // Media renderer inside PiP
                    Positioned.fill(
                      child: _buildPiPMedia(remoteStreams, localStream),
                    ),

                    // Top dark vignette
                    Positioned(
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 45,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [Colors.black.withOpacity(0.6), Colors.transparent],
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                          ),
                        ),
                      ),
                    ),

                    // Call duration display at bottom center
                    Positioned(
                      bottom: 8,
                      left: 0,
                      right: 0,
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.black54,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            _formatDuration(_seconds),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 0.2,
                            ),
                          ),
                        ),
                      ),
                    ),

                    // Close (Hangup) button at Top Right
                    Positioned(
                      top: 6,
                      right: 6,
                      child: GestureDetector(
                        onTap: () {
                          Feedback.forTap(context);
                          widget.onClose();
                        },
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Colors.red,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.close,
                            color: Colors.white,
                            size: 14,
                          ),
                        ),
                      ),
                    ),

                    // Audio Level visual indicator (mic badge)
                    Positioned(
                      top: 6,
                      left: 6,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: widget.webRTCService.isMuted ? Colors.redAccent : Colors.black45,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          widget.webRTCService.isMuted ? Icons.mic_off : Icons.mic,
                          color: Colors.white,
                          size: 11,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildPiPMedia(Map<String, MediaStream> remoteStreams, MediaStream? localStream) {
    if (remoteStreams.isNotEmpty) {
      return MiniVideoWidget(
        stream: remoteStreams.values.first,
        isCameraOff: false,
      );
    }
    if (localStream != null) {
      return MiniVideoWidget(
        stream: localStream,
        isCameraOff: widget.webRTCService.isCameraOff,
      );
    }
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.call,
            color: Color(0xFF7C3AED),
            size: 32,
          ),
          const SizedBox(height: 10),
          Text(
            widget.webRTCService.isAudioOnly ? "Voice Call" : "Video Call",
            style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}

class MiniVideoWidget extends StatefulWidget {
  final MediaStream stream;
  final bool isCameraOff;

  const MiniVideoWidget({
    super.key,
    required this.stream,
    this.isCameraOff = false,
  });

  @override
  State<MiniVideoWidget> createState() => _MiniVideoWidgetState();
}

class _MiniVideoWidgetState extends State<MiniVideoWidget> {
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
  void didUpdateWidget(MiniVideoWidget oldWidget) {
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
    final showVideo = !widget.isCameraOff && widget.stream.getVideoTracks().isNotEmpty;

    if (_initialized && showVideo) {
      return RTCVideoView(
        _renderer,
        objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
      );
    }

    return Container(
      color: const Color(0xFF0C0C14),
      child: Center(
        child: Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.04),
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white.withOpacity(0.03)),
          ),
          child: const Icon(
            Icons.person,
            color: Colors.white30,
            size: 26,
          ),
        ),
      ),
    );
  }
}
