import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

/// Service phát âm thanh chuông cuộc gọi.
/// Dùng chung cho cả cuộc gọi đến (ringing) và cuộc gọi đi (connecting).
class CallSoundService {
  static final CallSoundService _instance = CallSoundService._internal();
  factory CallSoundService() => _instance;
  CallSoundService._internal();

  final AudioPlayer _player = AudioPlayer();
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

  bool get isPlaying => _isPlaying;

  void dispose() {
    _player.dispose();
  }
}
