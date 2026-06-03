import "dart:async";
import "package:flutter/material.dart";
import "package:flutter_webrtc/flutter_webrtc.dart";
import "package:permission_handler/permission_handler.dart";
import "package:flutter_dotenv/flutter_dotenv.dart";
import "call_sound_service.dart";
import "socket_service.dart";

enum CallState { idle, ringing, connecting, connected }

class WebRTCService {
  final SocketService socketService;

  MediaStream? _localStream;
  MediaStream? get localStream => _localStream;

  final Map<String, MediaStream> _remoteStreams = {};
  Map<String, MediaStream> get remoteStreams => _remoteStreams;

  final Map<String, RTCPeerConnection> _peerConnections = {};

  final _remoteStreamsController = StreamController<Map<String, MediaStream>>.broadcast();
  Stream<Map<String, MediaStream>> get onRemoteStreamsUpdated => _remoteStreamsController.stream;

  final _participantLeftController = StreamController<String>.broadcast();
  Stream<String> get onParticipantLeft => _participantLeftController.stream;

  final _callStateNotifier = ValueNotifier<CallState>(CallState.idle);
  ValueNotifier<CallState> get callState => _callStateNotifier;

  final isCallMinimized = ValueNotifier<bool>(false);

  String? _currentConversationId;
  String? get currentConversationId => _currentConversationId;

  Map<String, dynamic>? _activeConfig;
  Map<String, dynamic>? get activeConfig => _activeConfig;

  bool _isAudioOnly = false;
  bool get isAudioOnly => _isAudioOnly;

  bool _isMuted = false;
  bool get isMuted => _isMuted;

  bool _isCameraOff = false;
  bool get isCameraOff => _isCameraOff;

  bool _isSpeakerOn = false;
  bool get isSpeakerOn => _isSpeakerOn;

  String? _localUserId;
  String? get localUserId => _localUserId;

  // Speaking Detection
  final _speakingPeersController = StreamController<Set<String>>.broadcast();
  Stream<Set<String>> get onSpeakingPeersUpdated => _speakingPeersController.stream;

  Set<String> _speakingPeers = {};
  Set<String> get speakingPeers => _speakingPeers;

  Timer? _speakingTimer;
  Timer? _heartbeatTimer;
  Timer? _callingTimeoutTimer;

  // Candidate buffering & queuing
  final Map<String, List<RTCIceCandidate>> _pendingIceCandidates = {};
  final List<Map<String, dynamic>> _pendingIceSignals = [];
  Timer? _iceSignalTimer;
  final Set<String> _sentIceCandidateKeys = {};

  WebRTCService({required this.socketService}) {
    _listenToSocket();
  }

  final _sound = CallSoundService();

  int? _extractStatusCode(Object? error) {
    if (error is Map && error["statusCode"] != null) {
      final status = error["statusCode"];
      if (status is int) return status;
      if (status is String) return int.tryParse(status);
    }
    if (error is Map && error["status"] != null) {
      final status = error["status"];
      if (status is int) return status;
      if (status is String) return int.tryParse(status);
    }
    return null;
  }

  bool _isGroupConversationId(String? value) {
    if (value == null) return false;
    final normalized = value.trim().toUpperCase();
    return normalized.startsWith("GRP#") ||
        normalized.startsWith("GROUP:") ||
        normalized.startsWith("GROUP#") ||
        normalized.startsWith("GRP#");
  }

  String _normalizeConversationId(String? value) {
    if (value == null) return "";
    final trimmed = value.trim();
    if (trimmed.isEmpty) return "";
    final upper = trimmed.toUpperCase();
    if (upper.startsWith("GROUP:")) return "GRP#${trimmed.substring(6)}".toUpperCase();
    if (upper.startsWith("GROUP#")) return "GRP#${trimmed.substring(6)}".toUpperCase();
    if (upper.startsWith("GRP#")) return upper;
    return trimmed;
  }

  void _listenToSocket() {
    socketService.onCallInit.listen((data) => _handleIncomingCall(data));
    socketService.onCallInvite.listen((data) => _handleIncomingCall(data));
    socketService.onCallAccept.listen((data) => _handleCallAccept(data));
    socketService.onCallReject.listen((data) => _handleCallReject(data));
    socketService.onCallEnd.listen((data) => _handleCallEnd(data));
    socketService.onWebRTCOffer.listen((data) => _handleWebRTCOffer(data));
    socketService.onWebRTCAnswer.listen((data) => _handleWebRTCAnswer(data));
    socketService.onWebRTCCandidate.listen((data) => _handleWebRTCCandidate(data));
    socketService.onCallHeartbeat.listen((data) => _handleCallHeartbeat(data));
  }

  Future<bool> requestPermissions() async {
    try {
      final micStatus = await Permission.microphone.request();
      final camStatus = await Permission.camera.request();
      return micStatus.isGranted && camStatus.isGranted;
    } catch (e) {
      debugPrint("Failed to request permissions: $e");
      return true;
    }
  }

  Future<void> startCall(
    String conversationId, {
    bool video = true,
    List<String> inviteeUserIds = const [],
    String? userId,
  }) async {
    _cleanup();
    _currentConversationId = conversationId;
    _isAudioOnly = !video;
    _isMuted = false;
    _isCameraOff = !video;
    _isSpeakerOn = false;
    _localUserId = userId;

    final isGroup = _isGroupConversationId(conversationId);

    _activeConfig = {
      'isVideo': video,
      'callerId': _localUserId,
      'conversationId': conversationId,
      'isGroup': isGroup,
      'callerName': 'Tôi',
    };

    final hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      debugPrint("[WebRTC] Quyền microphone hoặc camera bị từ chối.");
      return;
    }

    try {
      _localStream = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': video
            ? {
                'facingMode': 'user',
                'width': 640,
                'height': 480,
              }
            : false,
      });
    } catch (e) {
      if (video) {
        debugPrint("[WebRTC] Khởi tạo camera thất bại, fallback sang voice call: $e");
        _localStream = await navigator.mediaDevices.getUserMedia({
          'audio': true,
          'video': false,
        });
        _isAudioOnly = true;
        _isCameraOff = true;
      } else {
        rethrow;
      }
    }

    try {
      await socketService.emitCallInitWithAck(
        conversationId,
        !_isAudioOnly,
      );
    } catch (error) {
      final statusCode = _extractStatusCode(error);
      if (statusCode == 409 && isGroup) {
        try {
          await socketService.emitCallAcceptWithAck(conversationId);
          _callStateNotifier.value = CallState.connected;
          _startHeartbeat();
          _startSpeakingDetection();
          if (_localUserId != null) {
            socketService.emitCallHeartbeat(
              conversationId,
              _localUserId!.toString(),
            );
          }
          return;
        } catch (joinError) {
          debugPrint("[WebRTC] Failed to join active group call: $joinError");
          stopCall(emitSignal: false);
          return;
        }
      }
      debugPrint("[WebRTC] CALL_INIT failed: $error");
      stopCall(emitSignal: false);
      return;
    }

    // Gửi tín hiệu mời sau khi call-init thành công
    if (inviteeUserIds.isNotEmpty) {
      socketService.emitCallInvite(conversationId, inviteeUserIds, !_isAudioOnly);
    }

    if (isGroup) {
      // Cuộc gọi nhóm: chuyển trực tiếp sang connected để chờ kết nối
      _callStateNotifier.value = CallState.connected;
      _startHeartbeat();
      _startSpeakingDetection();
    } else {
      // Cuộc gọi 1-1: chờ phản hồi nhấc máy → phát nhạc chuông chờ
      _callStateNotifier.value = CallState.connecting;
      _sound.playRingtone();

      // Hủy cuộc gọi tự động sau 45s nếu không nhấc máy
      _callingTimeoutTimer?.cancel();
      _callingTimeoutTimer = Timer(const Duration(seconds: 45), () {
        if (_callStateNotifier.value == CallState.connecting) {
          socketService.emitCallEnd(conversationId);
          stopCall();
        }
      });
    }
  }

  Future<void> acceptCall() async {
    if (_callStateNotifier.value != CallState.ringing || _currentConversationId == null) return;

    await requestPermissions();

    try {
      _localStream = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': !_isAudioOnly
            ? {
                'facingMode': 'user',
                'width': 640,
                'height': 480,
              }
            : false,
      });
    } catch (e) {
      if (!_isAudioOnly) {
        debugPrint("[WebRTC] Camera bị lỗi hoặc từ chối, fallback sang voice call: $e");
        _localStream = await navigator.mediaDevices.getUserMedia({
          'audio': true,
          'video': false,
        });
        _isAudioOnly = true;
        _isCameraOff = true;
      }
    }

    socketService.emitCallAccept(_currentConversationId!);

    _sound.stopRingtone(); // Dừng nhạc khi nhấc máy
    _callStateNotifier.value = CallState.connected;
    _startHeartbeat();
    _startSpeakingDetection();

    final isGroup = _activeConfig?['isGroup'] == true;
    if (!isGroup) {
      final peerId = _activeConfig?['callerId'];
      if (peerId != null) {
        await initiateConnectionWithPeer(peerId.toString());
      }
    } else {
      final callerId = _activeConfig?['callerId'];
      if (callerId != null) {
        await initiateConnectionWithPeer(callerId.toString());
      }
    }
  }

  void rejectCall() {
    _sound.stopRingtone(); // Dừng nhạc khi từ chối
    if (_currentConversationId != null) {
      socketService.emitCallReject(_currentConversationId!);
    }
    stopCall(emitSignal: false);
  }

  void stopCall({bool emitSignal = true}) {
    if (_callStateNotifier.value == CallState.idle) return;

    _sound.stopRingtone(); // Đảm bảo dừng nhạc khi kết thúc cuộc gọi

    if (emitSignal && _currentConversationId != null) {
      socketService.emitCallEnd(_currentConversationId!);
    }

    _cleanup();
  }

  void setLocalUserId(String userId) {
    _localUserId = userId;
  }

  void toggleMute() {
    if (_localStream != null) {
      for (final track in _localStream!.getAudioTracks()) {
        track.enabled = !track.enabled;
        _isMuted = !track.enabled;
      }
    }
  }

  void toggleRemoteAudio(String peerId) {
    final stream = _remoteStreams[peerId];
    if (stream != null) {
      for (final track in stream.getAudioTracks()) {
        track.enabled = !track.enabled;
      }
    }
  }

  void toggleCamera() {
    if (_localStream != null) {
      final videoTracks = _localStream!.getVideoTracks();
      if (videoTracks.isNotEmpty) {
        final track = videoTracks.first;
        track.enabled = !track.enabled;
        _isCameraOff = !track.enabled;
      } else {
        _upgradeToVideo();
      }
    }
  }

  Future<void> _upgradeToVideo() async {
    try {
      final videoStream = await navigator.mediaDevices.getUserMedia({
        'audio': false,
        'video': {
          'facingMode': 'user',
          'width': 640,
          'height': 480,
        }
      });
      if (videoStream.getVideoTracks().isNotEmpty) {
        final videoTrack = videoStream.getVideoTracks().first;
        _localStream!.addTrack(videoTrack);
        _isCameraOff = false;
        _isAudioOnly = false;

        for (final pc in _peerConnections.values) {
          await pc.addTrack(videoTrack, _localStream!);
          // Kích hoạt thương lượng lại đối với Impolite Peer
          if (_activeConfig != null) {
            final isDm = _activeConfig!['isGroup'] != true;
            if (isDm) {
              if (_activeConfig!['callerId'] == _localUserId) {
                _renegotiate(pc, _activeConfig!['targetUserId'] ?? _activeConfig!['callerId']);
              }
            } else {
              final peerId = _getPeerIdForConnection(pc);
              if (peerId != null && _localUserId != null && _localUserId!.compareTo(peerId) > 0) {
                _renegotiate(pc, peerId);
              }
            }
          }
        }
        _remoteStreamsController.add(Map.from(_remoteStreams));
      }
    } catch (e) {
      debugPrint("Failed to upgrade to video: $e");
    }
  }

  void toggleSpeaker() {
    _isSpeakerOn = !_isSpeakerOn;
    Helper.setSpeakerphoneOn(_isSpeakerOn);
  }

  void switchCamera() {
    if (_localStream != null) {
      final videoTracks = _localStream!.getVideoTracks();
      if (videoTracks.isNotEmpty) {
        videoTracks.first.switchCamera();
      }
    }
  }

  Future<void> initiateConnectionWithPeer(String peerId) async {
    final strPeerId = peerId.toString();
    if (strPeerId == _localUserId?.toString()) return;
    if (_peerConnections.containsKey(strPeerId)) return;

    final config = _activeConfig;
    if (config == null) return;

    final isGroup = config['isGroup'] == true;

    if (!isGroup) {
      final isCaller = config['callerId']?.toString() == _localUserId?.toString();
      await _setupPeerConnection(strPeerId, isCaller);
    } else {
      final amIHigherId = _localUserId != null && _localUserId!.toString().compareTo(strPeerId) > 0;
      if (amIHigherId) {
        await _setupPeerConnection(strPeerId, true);
      } else {
        await _setupPeerConnection(strPeerId, false);
        if (_currentConversationId != null && _localUserId != null) {
          socketService.emitCallHeartbeat(_currentConversationId!.toString(), _localUserId!.toString());
        }
      }
    }
  }

  Future<RTCPeerConnection> _setupPeerConnection(String peerId, bool isOfferCreator) async {
    final turnUsername = dotenv.env['VITE_TURN_USERNAME'] ?? '';
    final turnPassword = dotenv.env['VITE_TURN_PASSWORD'] ?? '';

    final List<Map<String, dynamic>> iceServers = [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun.relay.metered.ca:80'},
    ];

    if (turnUsername.isNotEmpty && turnPassword.isNotEmpty) {
      iceServers.addAll([
        {
          'urls': 'turn:global.relay.metered.ca:80',
          'username': turnUsername,
          'credential': turnPassword,
        },
        {
          'urls': 'turn:global.relay.metered.ca:80?transport=tcp',
          'username': turnUsername,
          'credential': turnPassword,
        },
        {
          'urls': 'turn:global.relay.metered.ca:443',
          'username': turnUsername,
          'credential': turnPassword,
        },
        {
          'urls': 'turns:global.relay.metered.ca:443?transport=tcp',
          'username': turnUsername,
          'credential': turnPassword,
        },
      ]);
    }

    final pc = await createPeerConnection({
      'iceServers': iceServers,
    }, {
      'mandatory': {},
      'optional': [
        {'DtlsSrtpKeyAgreement': true},
      ],
    });

    _peerConnections[peerId] = pc;

    if (_localStream != null) {
      for (final track in _localStream!.getTracks()) {
        await pc.addTrack(track, _localStream!);
      }
    }

    pc.onIceCandidate = (RTCIceCandidate candidate) {
      if (candidate.candidate != null && _currentConversationId != null) {
        _queueIceCandidate(peerId, candidate);
      }
    };

    pc.onTrack = (RTCTrackEvent event) {
      if (event.streams.isNotEmpty) {
        _remoteStreams[peerId] = event.streams.first;
        _remoteStreamsController.add(Map.from(_remoteStreams));
      }
    };

    if (isOfferCreator) {
      await _renegotiate(pc, peerId);
    }

    return pc;
  }

  Future<void> _renegotiate(RTCPeerConnection pc, String peerId) async {
    try {
      final offer = await pc.createOffer({
        'mandatory': {
          'OfferToReceiveAudio': true,
          'OfferToReceiveVideo': !_isAudioOnly,
        },
        'optional': [],
      });
      await pc.setLocalDescription(offer);

      socketService.emitWebRTCOffer(_currentConversationId!, {
        'type': offer.type,
        'sdp': offer.sdp,
        'senderId': _localUserId,
        'targetId': peerId,
      }, targetUserId: peerId);
    } catch (e) {
      debugPrint("Renegotiation failed: $e");
    }
  }

  String? _getPeerIdForConnection(RTCPeerConnection pc) {
    for (final entry in _peerConnections.entries) {
      if (entry.value == pc) return entry.key;
    }
    return null;
  }

  void _handleIncomingCall(Map<String, dynamic> data) {
    final callerId = data['callerId']?.toString();
    debugPrint("[WebRTCService] Nhan tin hieu cuoc goi den (onCallInit/onCallInvite): $data");
    debugPrint("[WebRTCService] callerId: $callerId, localUserId: $_localUserId");
    if (callerId == _localUserId?.toString()) {
      debugPrint("[WebRTCService] Bo qua cuoc goi vi callerId trung voi localUserId (tu goi chinh minh).");
      return;
    }

    final incomingConvId = data['conversationId']?.toString();
    if (_callStateNotifier.value != CallState.idle) {
      debugPrint("[WebRTCService] Trang thai cuoc goi dang ban: ${_callStateNotifier.value}");
      if (_normalizeConversationId(_currentConversationId) !=
          _normalizeConversationId(incomingConvId)) {
        debugPrint("[WebRTCService] Bo qua cuoc goi vi conversationId khac cuoc goi hien tai.");
        return;
      }
    }

    _currentConversationId = incomingConvId;
    _isAudioOnly = !(data['isVideo'] ?? true);
    _isMuted = false;
    _isCameraOff = _isAudioOnly;
    _isSpeakerOn = false;
    _activeConfig = {
      'isVideo': data['isVideo'] ?? true,
      'callerId': callerId,
      'callerName': data['callerName'] ?? 'Người dùng',
      'callerAvatarUrl': data['callerAvatarUrl'],
      'conversationId': _currentConversationId,
      'isGroup': _isGroupConversationId(_currentConversationId),
    };

    _callStateNotifier.value = CallState.ringing;
  }

  void _handleCallAccept(Map<String, dynamic> data) {
    final calleeId = data['calleeId']?.toString();
    if (calleeId == _localUserId?.toString()) {
      if (_callStateNotifier.value == CallState.ringing) {
        stopCall(emitSignal: false);
      }
      return;
    }

    if (_callStateNotifier.value != CallState.connecting && _callStateNotifier.value != CallState.connected) {
      return;
    }

    _callStateNotifier.value = CallState.connected;
    _startHeartbeat();
    _startSpeakingDetection();

    if (calleeId != null) {
      initiateConnectionWithPeer(calleeId);
    }
  }

  void _handleCallHeartbeat(Map<String, dynamic> data) {
    final config = _activeConfig;
    if (config == null || _callStateNotifier.value != CallState.connected) return;
    if (_normalizeConversationId(config['conversationId']?.toString()) !=
        _normalizeConversationId(data['conversationId']?.toString())) {
      return;
    }

    final peerId = data['userId']?.toString();
    if (peerId == null || peerId == _localUserId?.toString()) return;

    if (!_peerConnections.containsKey(peerId)) {
      final amIHigherId = _localUserId != null && _localUserId!.toString().compareTo(peerId) > 0;
      if (amIHigherId) {
        initiateConnectionWithPeer(peerId);
      }
    }
  }

  void _handleCallReject(Map<String, dynamic> data) {
    final calleeId = data['calleeId']?.toString();
    if (calleeId == _localUserId?.toString()) {
      stopCall(emitSignal: false);
      return;
    }
    final isGroup = _activeConfig?['isGroup'] == true;
    if (!isGroup) {
      stopCall(emitSignal: false);
    }
  }

  void _handleCallEnd(Map<String, dynamic> data) {
    if (_callStateNotifier.value == CallState.idle) return;
    final endedByUserId = (data['endedByUserId'] ?? data['userId'])?.toString();
    final isGroup = _activeConfig?['isGroup'] == true;

    if (isGroup) {
      if (endedByUserId == null || endedByUserId == _localUserId?.toString()) return;
      _participantLeftController.add(endedByUserId);
      final pc = _peerConnections.remove(endedByUserId);
      pc?.close();
      _remoteStreams.remove(endedByUserId);
      _pendingIceCandidates.remove(endedByUserId);
      _remoteStreamsController.add(Map.from(_remoteStreams));

      if (_peerConnections.isEmpty) {
        stopCall(emitSignal: true);
      }
    } else {
      stopCall(emitSignal: false);
    }
  }

  Future<void> _handleWebRTCOffer(Map<String, dynamic> data) async {
    final offerMap = data['offer'];
    if (offerMap == null) return;

    final senderId = offerMap['senderId']?.toString();
    final targetId = offerMap['targetId']?.toString();

    if (targetId != _localUserId?.toString() || senderId == null) return;
    if (_activeConfig == null) return;

    var pc = _peerConnections[senderId];
    if (pc == null) {
      pc = await _setupPeerConnection(senderId, false);
    }

    final offer = RTCSessionDescription(offerMap['sdp'], offerMap['type']);
    await pc.setRemoteDescription(offer);

    await _flushPendingIceCandidates(senderId);

    final answer = await pc.createAnswer({
      'mandatory': {
        'OfferToReceiveAudio': true,
        'OfferToReceiveVideo': !_isAudioOnly,
      },
      'optional': [],
    });
    await pc.setLocalDescription(answer);

    if (_currentConversationId != null) {
      socketService.emitWebRTCAnswer(_currentConversationId!, {
        'type': answer.type,
        'sdp': answer.sdp,
        'senderId': _localUserId,
        'targetId': senderId,
      }, targetUserId: senderId);
    }
  }

  Future<void> _handleWebRTCAnswer(Map<String, dynamic> data) async {
    final answerMap = data['answer'];
    if (answerMap == null) return;

    final senderId = answerMap['senderId']?.toString();
    final targetId = answerMap['targetId']?.toString();

    if (targetId != _localUserId?.toString() || senderId == null) return;

    final pc = _peerConnections[senderId];
    if (pc == null) return;

    final answer = RTCSessionDescription(answerMap['sdp'], answerMap['type']);
    await pc.setRemoteDescription(answer);

    await _flushPendingIceCandidates(senderId);
  }

  Future<void> _handleWebRTCCandidate(Map<String, dynamic> data) async {
    final candidateMap = data['candidate'];
    if (candidateMap == null) return;

    final senderId = candidateMap['senderId']?.toString();
    final targetId = candidateMap['targetId']?.toString();

    if (targetId != _localUserId?.toString() || senderId == null) return;

    final pc = _peerConnections[senderId];
    final candidate = RTCIceCandidate(
      candidateMap['candidate'],
      candidateMap['sdpMid'],
      candidateMap['sdpMLineIndex'],
    );

    if (pc != null) {
      final remoteDesc = await pc.getRemoteDescription();
      if (remoteDesc != null) {
        await pc.addCandidate(candidate);
      } else {
        _pendingIceCandidates.putIfAbsent(senderId, () => []).add(candidate);
      }
    } else {
      _pendingIceCandidates.putIfAbsent(senderId, () => []).add(candidate);
    }
  }

  Future<void> _flushPendingIceCandidates(String peerId) async {
    final pc = _peerConnections[peerId];
    if (pc == null) return;

    final remoteDesc = await pc.getRemoteDescription();
    if (remoteDesc == null) return;

    final candidates = _pendingIceCandidates[peerId];
    if (candidates != null) {
      for (final candidate in candidates) {
        try {
          await pc.addCandidate(candidate);
        } catch (e) {
          debugPrint("Failed to apply buffered ICE candidate for $peerId: $e");
        }
      }
      _pendingIceCandidates[peerId] = [];
    }
  }

  void _queueIceCandidate(String peerId, RTCIceCandidate candidate) {
    final key = "${candidate.candidate}|${candidate.sdpMid}|${candidate.sdpMLineIndex}|$peerId";
    if (candidate.candidate == null || _sentIceCandidateKeys.contains(key)) return;

    if (_sentIceCandidateKeys.length >= 100) return;
    _sentIceCandidateKeys.add(key);

    _pendingIceSignals.add({
      'peerId': peerId,
      'candidate': {
        'candidate': candidate.candidate,
        'sdpMid': candidate.sdpMid,
        'sdpMLineIndex': candidate.sdpMLineIndex,
      }
    });

    _flushQueuedIceSignals();
  }

  void _flushQueuedIceSignals() {
    if (_iceSignalTimer != null) return;

    _iceSignalTimer = Timer.periodic(const Duration(milliseconds: 120), (timer) {
      if (_pendingIceSignals.isEmpty) {
        timer.cancel();
        _iceSignalTimer = null;
        return;
      }

      final nextSignal = _pendingIceSignals.removeAt(0);
      final peerId = nextSignal['peerId'] as String;
      final candidateData = nextSignal['candidate'] as Map<String, dynamic>;

      if (_currentConversationId != null) {
        socketService.emitWebRTCCandidate(_currentConversationId!, {
          ...candidateData,
          'targetId': peerId,
          'senderId': _localUserId,
        }, targetUserId: peerId);
      }
    });
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    if (_currentConversationId == null || _localUserId == null) return;

    _heartbeatTimer = Timer.periodic(const Duration(seconds: 5), (timer) {
      if (_currentConversationId != null && _localUserId != null) {
        socketService.emitCallHeartbeat(_currentConversationId!, _localUserId!);
      }
    });
  }

  void _startSpeakingDetection() {
    _speakingTimer?.cancel();
    _speakingTimer = Timer.periodic(const Duration(seconds: 1), (timer) async {
      if (_callStateNotifier.value != CallState.connected) {
        timer.cancel();
        return;
      }

      final Set<String> newlySpeaking = {};
      for (final entry in _peerConnections.entries) {
        final peerId = entry.key;
        final pc = entry.value;
        try {
          final stats = await pc.getStats();
          for (final report in stats) {
            if (report.type == 'media-source' || report.type == 'track') {
              final audioLevel = report.values['audioLevel'];
              if (audioLevel != null) {
                final double level = double.tryParse(audioLevel.toString()) ?? 0.0;
                if (level > 0.02) {
                  newlySpeaking.add(peerId);
                }
              }
            }
          }
        } catch (e) {
          // ignore stats report failure
        }
      }

      if (newlySpeaking.length != _speakingPeers.length || !newlySpeaking.every(_speakingPeers.contains)) {
        _speakingPeers = newlySpeaking;
        _speakingPeersController.add(newlySpeaking);
      }
    });
  }

  void _cleanup() {
    debugPrint("[WebRTC] Dọn dẹp kết nối");
    
    try {
      _heartbeatTimer?.cancel();
      _heartbeatTimer = null;
    } catch (e) {
      debugPrint("Error cancelling heartbeat timer: $e");
    }

    try {
      _callingTimeoutTimer?.cancel();
      _callingTimeoutTimer = null;
    } catch (e) {
      debugPrint("Error cancelling calling timeout timer: $e");
    }

    try {
      _speakingTimer?.cancel();
      _speakingTimer = null;
    } catch (e) {
      debugPrint("Error cancelling speaking timer: $e");
    }

    try {
      _iceSignalTimer?.cancel();
      _iceSignalTimer = null;
    } catch (e) {
      debugPrint("Error cancelling ice signal timer: $e");
    }

    try {
      _localStream?.getTracks().forEach((track) {
        try {
          track.stop();
        } catch (e) {
          debugPrint("Error stopping local track: $e");
        }
      });
      _localStream?.dispose();
    } catch (e) {
      debugPrint("Error cleaning up local stream: $e");
    }
    _localStream = null;

    _peerConnections.forEach((peerId, pc) {
      try {
        pc.close();
      } catch (e) {
        debugPrint("Error closing peer connection for $peerId: $e");
      }
      try {
        pc.dispose();
      } catch (e) {
        debugPrint("Error disposing peer connection for $peerId: $e");
      }
    });
    _peerConnections.clear();

    _remoteStreams.clear();
    try {
      _remoteStreamsController.add({});
    } catch (e) {
      debugPrint("Error updating empty remote streams: $e");
    }

    _pendingIceCandidates.clear();
    _pendingIceSignals.clear();
    _sentIceCandidateKeys.clear();

    _speakingPeers = {};
    try {
      _speakingPeersController.add({});
    } catch (e) {
      debugPrint("Error updating empty speaking peers: $e");
    }

    _callStateNotifier.value = CallState.idle;
    _currentConversationId = null;
    _activeConfig = null;
    _isAudioOnly = false;
    _isMuted = false;
    _isCameraOff = false;
    _isSpeakerOn = false;
    isCallMinimized.value = false;
  }

  void dispose() {
    _cleanup();
    _remoteStreamsController.close();
    _speakingPeersController.close();
    _participantLeftController.close();
    _callStateNotifier.dispose();
  }
}
