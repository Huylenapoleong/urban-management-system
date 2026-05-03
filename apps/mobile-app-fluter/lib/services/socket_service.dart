import "dart:async";

import "package:socket_io_client/socket_io_client.dart" as io;
import "package:logger/logger.dart";

import "../core/config/app_config.dart";
import "../models/conversation_summary.dart";
import "../models/message_item.dart";

class SocketService {
  SocketService();

  final _logger = Logger();
  io.Socket? _socket;
  String? _currentToken;

  final _chatReadyController = StreamController<void>.broadcast();
  final _messageCreatedController = StreamController<MessageItem>.broadcast();
  final _messageUpdatedController = StreamController<MessageItem>.broadcast();
  final _messageDeletedController = StreamController<String>.broadcast();
  final _connectionStatusController = StreamController<bool>.broadcast();
  final _conversationUpdatedController =
      StreamController<ConversationSummary>.broadcast();
  final _presenceUpdatedController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _typingStateController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _presenceSnapshotController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _callInitController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _callInviteController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _callAcceptController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _callRejectController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _callEndController = StreamController<Map<String, dynamic>>.broadcast();
  final _webrtcOfferController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _webrtcAnswerController =
      StreamController<Map<String, dynamic>>.broadcast();
  final _webrtcCandidateController =
      StreamController<Map<String, dynamic>>.broadcast();

  Stream<void> get onChatReady => _chatReadyController.stream;
  Stream<MessageItem> get onMessageCreated => _messageCreatedController.stream;
  Stream<MessageItem> get onMessageUpdated => _messageUpdatedController.stream;
  Stream<String> get onMessageDeleted => _messageDeletedController.stream;
  Stream<bool> get onConnectionStatus => _connectionStatusController.stream;
  Stream<ConversationSummary> get onConversationUpdated =>
      _conversationUpdatedController.stream;
  Stream<Map<String, dynamic>> get onPresenceUpdated =>
      _presenceUpdatedController.stream;
  Stream<Map<String, dynamic>> get onTypingState =>
      _typingStateController.stream;
  Stream<Map<String, dynamic>> get onPresenceSnapshot =>
      _presenceSnapshotController.stream;
  Stream<Map<String, dynamic>> get onCallInit => _callInitController.stream;
  Stream<Map<String, dynamic>> get onCallInvite => _callInviteController.stream;
  Stream<Map<String, dynamic>> get onCallAccept => _callAcceptController.stream;
  Stream<Map<String, dynamic>> get onCallReject => _callRejectController.stream;
  Stream<Map<String, dynamic>> get onCallEnd => _callEndController.stream;
  Stream<Map<String, dynamic>> get onWebRTCOffer =>
      _webrtcOfferController.stream;
  Stream<Map<String, dynamic>> get onWebRTCAnswer =>
      _webrtcAnswerController.stream;
  Stream<Map<String, dynamic>> get onWebRTCCandidate =>
      _webrtcCandidateController.stream;

  bool get isConnected => _socket?.connected ?? false;

  void connect(String token) {
    if (_currentToken == token && isConnected) {
      return; // Already connected with the same token
    }

    disconnect(); // Disconnect existing if any
    _currentToken = token;

    final url = "${AppConfig.socketOrigin}/chat";

    _socket = io.io(
      url,
      io.OptionBuilder()
          .setTransports(["websocket"])
          .disableAutoConnect()
          .setAuth({"token": token})
          .build(),
    );

    _setupListeners();
    _socket?.connect();
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _currentToken = null;
  }

  void _setupListeners() {
    final socket = _socket;
    if (socket == null) return;

    socket.onConnect((_) {
      _logger.i("Socket.IO Connected to /chat");
      _connectionStatusController.add(true);
    });

    socket.onDisconnect((_) {
      _logger.w("Socket.IO Disconnected");
      _connectionStatusController.add(false);
    });

    socket.onConnectError((err) {
      _logger.e("Socket Connect Error: $err");
      _connectionStatusController.add(false);
    });

    socket.on("chat.ready", (_) {
      _chatReadyController.add(null);
    });

    socket.on("message.created", (data) {
      _logger.d("Socket event message.created: $data");
      if (data != null) {
        try {
          // If message is nested in "message" key, use it, otherwise use root data
          final messageData = data["message"] != null ? data["message"] : data;
          final msg = MessageItem.fromJson(
              (messageData as Map).cast<String, dynamic>());
          _messageCreatedController.add(msg);
        } catch (e) {
          _logger.e("Error parsing message.created: $e");
        }
      }
    });

    socket.on("message.updated", (data) {
      if (data != null && data["message"] != null) {
        try {
          final msg = MessageItem.fromJson(
              (data["message"] as Map).cast<String, dynamic>());
          _messageUpdatedController.add(msg);
        } catch (e) {
          _logger.e("Error parsing message.updated: $e");
        }
      }
    });

    socket.on("message.deleted", (data) {
      if (data != null && data["messageId"] != null) {
        _messageDeletedController.add(data["messageId"].toString());
      }
    });

    socket.on("conversation.updated", (data) {
      if (data != null && data["conversation"] != null) {
        try {
          final conv = ConversationSummary.fromJson(
              (data["conversation"] as Map).cast<String, dynamic>());
          _conversationUpdatedController.add(conv);
        } catch (e) {
          _logger.e("Error parsing conversation.updated: $e");
        }
      }
    });

    socket.on("presence.updated", (data) {
      if (data is Map<String, dynamic>) {
        _presenceUpdatedController.add(data);
      }
    });

    socket.on("presence.snapshot", (data) {
      if (data is Map<String, dynamic>) {
        _presenceSnapshotController.add(data);
      }
    });

    socket.on("typing.state", (data) {
      if (data is Map<String, dynamic>) {
        _typingStateController.add(data);
      }
    });

    socket.on("call.init", (data) {
      if (data is Map) _callInitController.add(data.cast<String, dynamic>());
    });

    socket.on("call.invite", (data) {
      if (data is Map) _callInviteController.add(data.cast<String, dynamic>());
    });

    socket.on("call.accept", (data) {
      if (data is Map) _callAcceptController.add(data.cast<String, dynamic>());
    });

    socket.on("call.reject", (data) {
      if (data is Map) _callRejectController.add(data.cast<String, dynamic>());
    });

    socket.on("call.end", (data) {
      if (data is Map) _callEndController.add(data.cast<String, dynamic>());
    });

    socket.on("webrtc.offer", (data) {
      if (data is Map) _webrtcOfferController.add(data.cast<String, dynamic>());
    });

    socket.on("webrtc.answer", (data) {
      if (data is Map)
        _webrtcAnswerController.add(data.cast<String, dynamic>());
    });

    socket.on("webrtc.ice-candidate", (data) {
      if (data is Map)
        _webrtcCandidateController.add(data.cast<String, dynamic>());
    });
  }

  void joinConversation(String conversationId) {
    if (isConnected) {
      _socket?.emit("conversation.join", {"conversationId": conversationId});
    }
  }

  void leaveConversation(String conversationId) {
    if (isConnected) {
      _socket?.emit("conversation.leave", {"conversationId": conversationId});
    }
  }

  void markAsRead(String conversationId) {
    if (isConnected) {
      _socket?.emit("conversation.read", {"conversationId": conversationId});
    }
  }

  void startTyping(String conversationId) {
    if (isConnected) {
      _socket?.emit("typing.start", {"conversationId": conversationId});
    }
  }

  void stopTyping(String conversationId) {
    if (isConnected) {
      _socket?.emit("typing.stop", {"conversationId": conversationId});
    }
  }

  void emitCallInit(String conversationId, bool isVideo) {
    if (isConnected) {
      _socket?.emit(
          "call.init", {"conversationId": conversationId, "isVideo": isVideo});
    }
  }

  void emitCallInvite(
      String conversationId, List<String> userIds, bool isVideo) {
    if (isConnected) {
      _socket?.emit("call.invite", {
        "conversationId": conversationId,
        "userIds": userIds,
        "isVideo": isVideo
      });
    }
  }

  void emitCallAccept(String conversationId) {
    if (isConnected) {
      _socket?.emit("call.accept", {"conversationId": conversationId});
    }
  }

  void emitCallReject(String conversationId) {
    if (isConnected) {
      _socket?.emit("call.reject", {"conversationId": conversationId});
    }
  }

  void emitCallEnd(String conversationId) {
    if (isConnected) {
      _socket?.emit("call.end", {"conversationId": conversationId});
    }
  }

  void emitWebRTCOffer(String conversationId, Map<String, dynamic> offer,
      {String? targetUserId}) {
    if (isConnected) {
      _socket?.emit("webrtc.offer", {
        "conversationId": conversationId,
        "offer": offer,
        if (targetUserId != null) "targetUserId": targetUserId,
      });
    }
  }

  void emitWebRTCAnswer(String conversationId, Map<String, dynamic> answer,
      {String? targetUserId}) {
    if (isConnected) {
      _socket?.emit("webrtc.answer", {
        "conversationId": conversationId,
        "answer": answer,
        if (targetUserId != null) "targetUserId": targetUserId,
      });
    }
  }

  void emitWebRTCCandidate(
      String conversationId, Map<String, dynamic> candidate,
      {String? targetUserId}) {
    if (isConnected) {
      _socket?.emit("webrtc.ice-candidate", {
        "conversationId": conversationId,
        "candidate": candidate,
        if (targetUserId != null) "targetUserId": targetUserId,
      });
    }
  }

  void dispose() {
    disconnect();
    _chatReadyController.close();
    _messageCreatedController.close();
    _messageUpdatedController.close();
    _messageDeletedController.close();
    _conversationUpdatedController.close();
    _presenceUpdatedController.close();
    _typingStateController.close();
    _presenceSnapshotController.close();
    _callInitController.close();
    _callInviteController.close();
    _callAcceptController.close();
    _callRejectController.close();
    _callEndController.close();
    _webrtcOfferController.close();
    _webrtcAnswerController.close();
    _webrtcCandidateController.close();
    _connectionStatusController.close();
  }
}
