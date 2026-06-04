import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

/// Service phát âm thanh chuông cuộc gọi và thông báo tin nhắn.
class CallSoundService {
  static final CallSoundService _instance = CallSoundService._internal();
  factory CallSoundService() => _instance;
  CallSoundService._internal();

  final AudioPlayer _player = AudioPlayer();
  final AudioPlayer _messagePlayer = AudioPlayer();
  bool _isPlaying = false;

  /// Phát nhạc chuông loop — dùng khi có cuộc gọi đến hoặc đang chờ kết nối.
  Future<void> playRingtone() async {
    if (_isPlaying) return;
    try {
      _isPlaying = true;
      await _player.setReleaseMode(ReleaseMode.loop);
      await _player.setVolume(1.0);
      await _player.play(AssetSource('music/call.mp3'));
    } catch (e) {
      _isPlaying = false;
      debugPrint('[CallSoundService] Không thể phát nhạc chuông: $e');
    }
  }

  /// Dừng nhạc chuông.
  Future<void> stopRingtone() async {
    if (!_isPlaying) return;
    try {
      _isPlaying = false;
      await _player.stop();
    } catch (e) {
      debugPrint('[CallSoundService] Lỗi khi dừng nhạc chuông: $e');
    }
  }

  /// Phát âm thanh tin nhắn mới (phát 1 lần).
  Future<void> playMessageSound() async {
    try {
      await _messagePlayer.stop(); // Ngắt âm thanh cũ nếu đang phát dở
      await _messagePlayer.setReleaseMode(ReleaseMode.stop);
      await _messagePlayer.setVolume(1.0);
      await _messagePlayer.play(AssetSource('music/mess.mp3'));
    } catch (e) {
      debugPrint('[CallSoundService] Không thể phát âm thanh tin nhắn: $e');
    }
  }

  bool get isPlaying => _isPlaying;

  void dispose() {
    _player.dispose();
    _messagePlayer.dispose();
  }
}
