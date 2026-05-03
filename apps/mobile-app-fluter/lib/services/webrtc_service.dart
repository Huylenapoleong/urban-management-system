import "dart:async";
import "package:flutter/material.dart";
import "package:flutter_webrtc/flutter_webrtc.dart";
import "package:logger/logger.dart";
import "package:permission_handler/permission_handler.dart";
import "socket_service.dart";

enum CallState { idle, ringing, connecting, connected }

class WebRTCService {
  final SocketService socketService;
  final _logger = Logger();

  Map<String, RTCPeerConnection> _peerConnections = {};
  MediaStream? _localStream;

  final Map<String, MediaStream> _remoteStreams = {};
  Map<String, MediaStream> get remoteStreams => _remoteStreams;

  MediaStream? get localStream => _localStream;

  final _remoteStreamsController =
      StreamController<Map<String, MediaStream>>.broadcast();
  Stream<Map<String, MediaStream>> get onRemoteStreamsUpdated =>
      _remoteStreamsController.stream;

  final _callStateNotifier = ValueNotifier<CallState>(CallState.idle);
  ValueNotifier<CallState> get callState => _callStateNotifier;

  String? _currentConversationId;
  String? get currentConversationId => _currentConversationId;
  bool _isAudioOnly = false;
  bool _isMuted = false;
  bool _isCameraOff = false;
  bool _isSpeakerOn = false;

  bool get isAudioOnly => _isAudioOnly;
  bool get isMuted => _isMuted;
  bool get isCameraOff => _isCameraOff;
  bool get isSpeakerOn => _isSpeakerOn;

  WebRTCService({required this.socketService}) {
    _listenToSocket();
  }

  void _listenToSocket() {
    socketService.onCallInit.listen(_handleCallInit);
    socketService.onCallInvite.listen(_handleCallInvite);
    socketService.onCallAccept.listen(_handleCallAccept);
    socketService.onCallReject.listen(_handleCallReject);
    socketService.onCallEnd.listen(_handleCallEnd);
    socketService.onWebRTCOffer.listen(_handleWebRTCOffer);
    socketService.onWebRTCAnswer.listen(_handleWebRTCAnswer);
    socketService.onWebRTCCandidate.listen(_handleWebRTCCandidate);
  }

  Future<bool> requestPermissions() async {
    final status = await [
      Permission.camera,
      Permission.microphone,
    ].request();

    return status[Permission.camera] == PermissionStatus.granted &&
        status[Permission.microphone] == PermissionStatus.granted;
  }

  Future<void> startCall(
    String conversationId, {
    bool video = true,
    List<String> inviteeUserIds = const [],
  }) async {
    if (_callStateNotifier.value != CallState.idle) return;

    _currentConversationId = conversationId;
    _isAudioOnly = !video;
    _callStateNotifier.value = CallState.connecting;

    final hasPermission = await requestPermissions();
    if (!hasPermission) {
      _logger.e("Permissions denied");
      stopCall();
      return;
    }

    try {
      await _initializeMedia();
      if (inviteeUserIds.isNotEmpty) {
        socketService.emitCallInvite(conversationId, inviteeUserIds, video);
      } else {
        socketService.emitCallInit(conversationId, video);
      }
    } catch (e) {
      _logger.e("Error starting call: $e");
      stopCall();
    }
  }

  Future<void> acceptCall() async {
    if (_callStateNotifier.value != CallState.ringing ||
        _currentConversationId == null) return;

    final hasPermission = await requestPermissions();
    if (!hasPermission) {
      _logger.e("Permissions denied");
      stopCall();
      return;
    }

    _callStateNotifier.value = CallState.connecting;

    try {
      await _initializeMedia();
      socketService.emitCallAccept(_currentConversationId!);
    } catch (e) {
      _logger.e("Error accepting call: $e");
      stopCall();
    }
  }

  void rejectCall() {
    if (_currentConversationId != null) {
      socketService.emitCallReject(_currentConversationId!);
    }
    stopCall();
  }

  void stopCall({bool emitSignal = true}) {
    if (emitSignal &&
        _currentConversationId != null &&
        _callStateNotifier.value != CallState.idle) {
      socketService.emitCallEnd(_currentConversationId!);
    }

    _cleanup();
    _callStateNotifier.value = CallState.idle;
    _currentConversationId = null;
  }

  Future<void> _initializeMedia({bool dataSaver = false}) async {
    final Map<String, dynamic> constraints = {
      "audio": true,
      "video": _isAudioOnly
          ? false
          : {
              "facingMode": "user",
              "width": dataSaver ? 320 : 640,
              "height": dataSaver ? 240 : 480,
              "frameRate": dataSaver ? 15 : 30,
            }
    };

    _localStream = await navigator.mediaDevices.getUserMedia(constraints);

    Helper.setSpeakerphoneOn(!_isAudioOnly);
    _isSpeakerOn = !_isAudioOnly;
  }

  Future<RTCPeerConnection> _createPeerConnection(String peerUserId) async {
    if (_peerConnections.containsKey(peerUserId)) {
      return _peerConnections[peerUserId]!;
    }

    final Map<String, dynamic> config = {
      "iceServers": [
        {"urls": "stun:stun.l.google.com:19302"},
        {"urls": "stun:stun1.l.google.com:19302"},
        {"urls": "stun:stun2.l.google.com:19302"},
        {"urls": "stun:stun3.l.google.com:19302"},
        {"urls": "stun:stun4.l.google.com:19302"},
      ]
    };

    final pc = await createPeerConnection(config);
    _peerConnections[peerUserId] = pc;

    pc.onIceCandidate = (candidate) {
      if (_currentConversationId != null) {
        socketService.emitWebRTCCandidate(
          _currentConversationId!,
          {
            "candidate": candidate.candidate,
            "sdpMid": candidate.sdpMid,
            "sdpMLineIndex": candidate.sdpMLineIndex,
          },
          targetUserId: peerUserId,
        );
      }
    };

    pc.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        _remoteStreams[peerUserId] = event.streams[0];
        _remoteStreamsController.add(_remoteStreams);
      }
    };

    pc.onConnectionState = (state) {
      _logger.d("Connection state for $peerUserId: $state");
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _callStateNotifier.value = CallState.connected;
      } else if (state ==
              RTCPeerConnectionState.RTCPeerConnectionStateDisconnected ||
          state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
        _removePeer(peerUserId);
      }
    };

    if (_localStream != null) {
      _localStream!.getTracks().forEach((track) {
        pc.addTrack(track, _localStream!);
      });
    }

    return pc;
  }

  void _removePeer(String peerUserId) {
    final pc = _peerConnections.remove(peerUserId);
    pc?.close();
    pc?.dispose();
    _remoteStreams.remove(peerUserId);
    _remoteStreamsController.add(_remoteStreams);
    
    if (_peerConnections.isEmpty && _callStateNotifier.value == CallState.connected) {
       // Keep alive if it's a group call or close if everyone left
       if (_currentConversationId != null && !_currentConversationId!.startsWith("dm:")) {
          // Stay in connected state for group?
       } else {
          stopCall(emitSignal: false);
       }
    }
  }

  void _handleCallInit(Map<String, dynamic> data) {
    _handleIncomingCall(data);
  }

  void _handleCallInvite(Map<String, dynamic> data) {
    _handleIncomingCall(data);
  }

  void _handleIncomingCall(Map<String, dynamic> data) {
    final conversationId = data["conversationId"]?.toString();
    if (conversationId == null || conversationId.isEmpty) return;

    if (_callStateNotifier.value != CallState.idle) {
      if (_currentConversationId == conversationId) return;
      socketService.emitCallReject(conversationId);
      return;
    }

    _currentConversationId = conversationId;
    _isAudioOnly = !(data["isVideo"] ?? true);
    _callStateNotifier.value = CallState.ringing;
  }

  void _handleCallAccept(Map<String, dynamic> data) async {
    final calleeId = data["calleeId"]?.toString();
    if (calleeId == null) return;

    _callStateNotifier.value = CallState.connecting;
    
    final pc = await _createPeerConnection(calleeId);
    RTCSessionDescription offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socketService.emitWebRTCOffer(
      _currentConversationId!,
      offer.toMap(),
      targetUserId: calleeId,
    );
  }

  void _handleCallReject(Map<String, dynamic> data) {
    final userId = data["calleeId"]?.toString();
    if (userId != null) {
      _removePeer(userId);
    }
    if (_peerConnections.isEmpty) {
      stopCall(emitSignal: false);
    }
  }

  void _handleCallEnd(Map<String, dynamic> data) {
    final userId = data["userId"]?.toString();
    if (userId != null) {
      _removePeer(userId);
    } else {
      _cleanup();
      _callStateNotifier.value = CallState.idle;
    }
  }

  void _handleWebRTCOffer(Map<String, dynamic> data) async {
    final senderId = data["senderId"]?.toString();
    if (senderId == null) return;

    final pc = await _createPeerConnection(senderId);
    final offerMap = data["offer"] as Map<String, dynamic>;
    
    await pc.setRemoteDescription(
      RTCSessionDescription(offerMap["sdp"], offerMap["type"]),
    );

    RTCSessionDescription answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socketService.emitWebRTCAnswer(
      _currentConversationId!,
      answer.toMap(),
      targetUserId: senderId,
    );
  }

  void _handleWebRTCAnswer(Map<String, dynamic> data) async {
    final senderId = data["senderId"]?.toString();
    if (senderId == null) return;

    final pc = _peerConnections[senderId];
    if (pc == null) return;

    final answerMap = data["answer"] as Map<String, dynamic>;
    await pc.setRemoteDescription(
      RTCSessionDescription(answerMap["sdp"], answerMap["type"]),
    );
  }

  void _handleWebRTCCandidate(Map<String, dynamic> data) async {
    final senderId = data["senderId"]?.toString();
    if (senderId == null) return;

    final pc = _peerConnections[senderId];
    if (pc == null) return;

    final candidateMap = data["candidate"] as Map<String, dynamic>;
    await pc.addCandidate(
      RTCIceCandidate(
        candidateMap["candidate"],
        candidateMap["sdpMid"],
        candidateMap["sdpMLineIndex"],
      ),
    );
  }

  void toggleMute() {
    if (_localStream == null) return;
    _isMuted = !_isMuted;
    _localStream!.getAudioTracks().forEach((track) => track.enabled = !_isMuted);
  }

  void toggleRemoteAudio(String peerId) {
    final stream = _remoteStreams[peerId];
    if (stream == null) return;
    for (final track in stream.getAudioTracks()) track.enabled = !track.enabled;
  }

  void toggleCamera() {
    if (_localStream == null || _isAudioOnly) return;
    _isCameraOff = !_isCameraOff;
    _localStream!.getVideoTracks().forEach((track) => track.enabled = !_isCameraOff);
  }

  void toggleSpeaker() {
    _isSpeakerOn = !_isSpeakerOn;
    Helper.setSpeakerphoneOn(_isSpeakerOn);
  }

  void switchCamera() {
    if (_localStream == null || _isAudioOnly) return;
    Helper.switchCamera(_localStream!.getVideoTracks()[0]);
  }

  void _cleanup() {
    _localStream?.getTracks().forEach((track) => track.stop());
    _localStream?.dispose();
    _localStream = null;

    for (final pc in _peerConnections.values) {
      pc.close();
      pc.dispose();
    }
    _peerConnections.clear();

    _remoteStreams.clear();
    _remoteStreamsController.add(_remoteStreams);

    _isMuted = false;
    _isCameraOff = false;
    _isSpeakerOn = false;
  }

  void dispose() {
    _cleanup();
    _remoteStreamsController.close();
    _callStateNotifier.dispose();
  }
}
