import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:flutter/foundation.dart';

// Const endpoint (assuming Web simulator uses 3001)
const String _socketOrigin = 'http://localhost:3001';
const String _chatNamespace = '/chat';

class SocketClient {
  static final SocketClient _instance = SocketClient._internal();
  factory SocketClient() => _instance;
  SocketClient._internal();

  io.Socket? _socket;
  String? _authToken;
  Completer<void>? _connectCompleter;

  Future<void> connect(String token) async {
    if (_connectCompleter != null && _authToken == token) {
      return _connectCompleter!.future;
    }

    _connectCompleter = Completer<void>();

    try {
      if (_socket != null && _authToken != token) {
        _socket!.clearListeners();
        _socket!.disconnect();
        _socket = null;
      }

      if (_socket != null && _authToken == token) {
        if (_socket!.connected) {
          _connectCompleter!.complete();
          return;
        }
        _bindCoreListeners();
        _socket!.connect();
        return;
      }

      _socket = io.io(
        '$_socketOrigin$_chatNamespace',
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth({'token': token})
            .enableReconnection()
            .setReconnectionAttempts(20)
            .setReconnectionDelay(800)
            .setTimeout(12000)
            .disableForceNew()
            .disableAutoConnect()
            .build(),
      );
      _authToken = token;

      _bindCoreListeners();
      _socket!.connect();
    } catch (e) {
      if (kDebugMode) {
        print('Failed to init socket: $e');
      }
      _connectCompleter!.completeError(e);
    }

    return _connectCompleter!.future;
  }

  void _bindCoreListeners() {
    if (_socket == null) return;

    _socket!.clearListeners();

    _socket!.onConnect((_) {
      if (kDebugMode) print('Socket connected: ${_socket!.id}');
      if (_connectCompleter != null && !_connectCompleter!.isCompleted) {
        _connectCompleter!.complete();
      }
    });

    _socket!.on('READY', (payload) {
      if (kDebugMode) print('Chat Socket Ready: $payload');
    });

    _socket!.onDisconnect((reason) {
      if (kDebugMode) print('Socket disconnected: $reason');
    });

    _socket!.onConnectError((error) {
      if (kDebugMode) print('Socket connect error: $error');
      if (_connectCompleter != null && !_connectCompleter!.isCompleted) {
        _connectCompleter!.completeError(error);
      }
    });
  }

  void disconnect() {
    if (_socket != null) {
      _socket!.clearListeners();
      _socket!.disconnect();
      _socket = null;
    }
    _authToken = null;
    _connectCompleter = null;
  }

  Future<T?> emitWithAck<T>(String event, dynamic payload) {
    if (_socket == null || !_socket!.connected) {
      return Future.error('Socket is not connected');
    }

    final completer = Completer<T?>();
    _socket!.emitWithAck(event, payload, ack: (dynamic response) {
      if (response != null && response is Map && response.containsKey('error')) {
        completer.completeError(response['error']);
      } else if (response != null && response is Map && response.containsKey('data')) {
        completer.complete(response['data'] as T?);
      } else {
        completer.complete(response as T?);
      }
    });

    return completer.future;
  }

  void on(String event, void Function(dynamic) handler) {
    _socket?.on(event, handler);
  }

  void off(String event, [void Function(dynamic)? handler]) {
    if (handler != null) {
      _socket?.off(event, handler);
    } else {
      _socket?.off(event);
    }
  }
}
