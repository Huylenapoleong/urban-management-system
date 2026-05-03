import 'dart:typed_data';
import 'dart:ui';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart' as fp;
import 'package:geolocator/geolocator.dart';
import 'package:record/record.dart';

import '../../../core/models/chat_models.dart';
import '../../../state/auth_controller.dart';
import '../../../state/chat_detail_controller.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Palette
// ─────────────────────────────────────────────────────────────────────────────
const _kBlue      = Color(0xFF1E88E5);
const _kBlueSoft  = Color(0xFFE8F4FD);
const _kSurface   = Color(0xFFF8FAFC);
const _kBorder    = Color(0xFFE2ECF9);
const _kTextDark  = Color(0xFF0F172A);
const _kTextMuted = Color(0xFF64748B);

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
class CitizenChatDetailPage extends ConsumerStatefulWidget {
  final String conversationId;
  final String title;

  const CitizenChatDetailPage({
    super.key,
    required this.conversationId,
    required this.title,
  });

  @override
  ConsumerState<CitizenChatDetailPage> createState() => _CitizenChatDetailPageState();
}

class _CitizenChatDetailPageState extends ConsumerState<CitizenChatDetailPage>
    with WidgetsBindingObserver {
  final TextEditingController _textCtrl = TextEditingController();
  final ScrollController _scrollCtrl   = ScrollController();
  bool _showScrollButton = false;

  Future<void> _sendMediaWithFeedback({
    required String fileName,
    required String contentType,
    required Uint8List bytes,
    required String type,
    required String failMessage,
  }) async {
    final ok = await ref.read(chatDetailProvider(widget.conversationId).notifier).sendMediaMessage(
      fileName: fileName,
      contentType: contentType,
      bytes: bytes,
      type: type,
    );

    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(failMessage)));
    }
  }

  Future<void> _sendLocationWithFeedback(double lat, double lng) async {
    final ok = await ref.read(chatDetailProvider(widget.conversationId).notifier).sendLocationMessage(lat, lng);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Không thể gửi vị trí. Vui lòng thử lại.')),
      );
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _scrollCtrl.addListener(_onScroll);
  }

  void _onScroll() {
    final show = _scrollCtrl.hasClients && _scrollCtrl.offset > 300;
    if (show != _showScrollButton) setState(() => _showScrollButton = show);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _textCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _textCtrl.text.trim();
    if (text.isEmpty) return;
    ref.read(chatDetailProvider(widget.conversationId).notifier).sendMessage(text);
    _textCtrl.clear();
  }

  void _scrollToBottom() {
    if (_scrollCtrl.hasClients) {
      _scrollCtrl.animateTo(0, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state         = ref.watch(chatDetailProvider(widget.conversationId));
    final currentUser   = ref.watch(authControllerProvider).user;
    final currentUserId = currentUser?.id ?? '';
    final isDark        = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0D1117) : _kSurface,
      // ── Glassmorphism AppBar ───────────────────────────────────────────────
      extendBodyBehindAppBar: true,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(72),
        child: ClipRRect(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: isDark
                      ? [const Color(0xCC1A2340), const Color(0xCC0D1117)]
                      : [const Color(0xEEFFFFFF), const Color(0xCCE8F4FD)],
                ),
                border: Border(bottom: BorderSide(color: _kBorder.withValues(alpha: 0.6))),
              ),
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20, color: _kBlue),
                        onPressed: () => Navigator.of(context).maybePop(),
                      ),
                      // Avatar
                      CircleAvatar(
                        radius: 20,
                        backgroundColor: _kBlueSoft,
                        child: Text(
                          widget.title.isNotEmpty ? widget.title.substring(0, 1).toUpperCase() : 'B',
                          style: const TextStyle(color: _kBlue, fontWeight: FontWeight.w800, fontSize: 16),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              widget.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _kTextDark),
                            ),
                            Row(
                              children: [
                                Container(
                                  width: 7,
                                  height: 7,
                                  margin: const EdgeInsets.only(right: 5),
                                  decoration: const BoxDecoration(color: Color(0xFF22C55E), shape: BoxShape.circle),
                                ),
                                const Text('Đang hoạt động', style: TextStyle(fontSize: 11, color: Color(0xFF22C55E), fontWeight: FontWeight.w600)),
                              ],
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.more_vert_rounded, color: _kTextMuted),
                        onPressed: () {},
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      body: Stack(
        children: [
          Column(
            children: [
              // Top spacing for AppBar
              const SizedBox(height: 72 + 24),
              // ── Message list ──────────────────────────────────────────────
              Expanded(
                child: _buildMessageList(state, currentUserId, isDark),
              ),
              // ── Reply Bar ─────────────────────────────────────────────────
              if (state.replyingTo != null) _buildReplyBar(state.replyingTo!, isDark),
              // ── Composer ──────────────────────────────────────────────────
              _buildComposer(state, isDark),
            ],
          ),
          // Scroll-to-bottom FAB
          if (_showScrollButton)
            Positioned(
              bottom: 90,
              right: 20,
              child: GestureDetector(
                onTap: _scrollToBottom,
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 12)],
                  ),
                  child: const Icon(Icons.keyboard_arrow_down_rounded, color: _kBlue, size: 24),
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ── Message List ──────────────────────────────────────────────────────────
  Widget _buildMessageList(ChatDetailState state, String currentUserId, bool isDark) {
    if (state.isLoading && state.messages.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: _kBlue));
    }

    if (state.error != null && state.messages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF2F2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(Icons.wifi_off_rounded, color: Color(0xFFEF4444), size: 36),
              ),
              const SizedBox(height: 16),
              const Text('Không tải được tin nhắn', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              FilledButton.tonal(
                onPressed: () => ref.read(chatDetailProvider(widget.conversationId).notifier).fetchMessages(),
                style: FilledButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
                child: const Text('Thử lại'),
              ),
            ],
          ),
        ),
      );
    }

    if (state.messages.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: _kBlueSoft, borderRadius: BorderRadius.circular(24)),
              child: const Icon(Icons.waving_hand_rounded, size: 40, color: _kBlue),
            ),
            const SizedBox(height: 16),
            const Text('Hãy bắt đầu cuộc trò chuyện!', style: TextStyle(fontWeight: FontWeight.w700, color: _kTextDark)),
            const SizedBox(height: 6),
            const Text('Ban quản lý sẽ phản hồi sớm nhất có thể', style: TextStyle(color: _kTextMuted, fontSize: 13)),
          ],
        ),
      );
    }

    return ListView.builder(
      controller: _scrollCtrl,
      reverse: true,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      itemCount: state.messages.length,
      itemBuilder: (context, index) {
        final msg     = state.messages[index];
        final isMe    = msg.senderId == currentUserId;
        final prevMsg = index < state.messages.length - 1 ? state.messages[index + 1] : null;
        final nextMsg = index > 0 ? state.messages[index - 1] : null;

        // Show date separator
        final showDate = prevMsg == null ||
            !DateUtils.isSameDay(msg.createdAt, prevMsg.createdAt);

        // Group bubbles from same sender
        final isSameAsPrev = prevMsg != null && prevMsg.senderId == msg.senderId;
        final isSameAsNext = nextMsg != null && nextMsg.senderId == msg.senderId;

        return Column(
          children: [
            if (showDate) _DateDivider(date: msg.createdAt),
            _MessageBubble(
              msg: msg,
              isMe: isMe,
              isDark: isDark,
              isSameAsPrev: isSameAsPrev,
              isSameAsNext: isSameAsNext,
              reactions: state.reactions[msg.id] ?? const [],
              onRecall: () => ref.read(chatDetailProvider(widget.conversationId).notifier).recallMessage(msg.id),
              onReply: () => ref.read(chatDetailProvider(widget.conversationId).notifier).setReplyingTo(msg),
              onReact: (emoji) => ref.read(chatDetailProvider(widget.conversationId).notifier).reactToMessage(msg.id, emoji),
            ),
          ],
        );
      },
    );
  }

  // ── Reply Bar ─────────────────────────────────────────────────────────────
  Widget _buildReplyBar(MessageItem msg, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E2536) : _kSurface,
        border: Border(top: BorderSide(color: _kBorder.withValues(alpha: 0.6))),
      ),
      child: Row(
        children: [
          const Icon(Icons.reply_rounded, color: _kBlue, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Đang trả lời ${msg.senderName ?? 'ai đó'}',
                  style: const TextStyle(fontWeight: FontWeight.w700, color: _kBlue, fontSize: 12),
                ),
                Text(
                  msg.content,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: _kTextMuted, fontSize: 13),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close_rounded, size: 20, color: _kTextMuted),
            onPressed: () => ref.read(chatDetailProvider(widget.conversationId).notifier).setReplyingTo(null),
          ),
        ],
      ),
    );
  }

  // ── Composer ──────────────────────────────────────────────────────────────
  Widget _buildComposer(ChatDetailState state, bool isDark) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1A1A2E) : Colors.white,
          border: Border(top: BorderSide(color: _kBorder.withValues(alpha: 0.6))),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 12,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            // Attach
            GestureDetector(
              onTap: () => _showAttachmentMenu(context, isDark),
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: _kBlueSoft,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(Icons.attach_file_rounded, color: _kBlue, size: 20),
              ),
            ),
            const SizedBox(width: 10),
            // Text field
            Expanded(
              child: Container(
                constraints: const BoxConstraints(maxHeight: 120),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF2C2C3E) : _kSurface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: _kBorder),
                ),
                child: TextField(
                  controller: _textCtrl,
                  maxLines: null,
                  minLines: 1,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _sendMessage(),
                  onChanged: (_) => setState(() {}),
                  style: const TextStyle(fontSize: 15, color: _kTextDark),
                  decoration: const InputDecoration(
                    hintText: 'Nhập tin nhắn...',
                    hintStyle: TextStyle(color: _kTextMuted, fontSize: 14),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            // Send button
            GestureDetector(
              onTap: state.isSending || _textCtrl.text.trim().isEmpty ? null : _sendMessage,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _textCtrl.text.trim().isEmpty ? _kBorder : _kBlue,
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: _textCtrl.text.trim().isEmpty
                      ? []
                      : [BoxShadow(color: _kBlue.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 4))],
                ),
                child: state.isSending
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : Icon(
                        Icons.send_rounded,
                        color: _textCtrl.text.trim().isEmpty ? _kTextMuted : Colors.white,
                        size: 20,
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Attachment Menu ───────────────────────────────────────────────────────
  void _showAttachmentMenu(BuildContext context, bool isDark) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E2536) : Colors.white,
            borderRadius: BorderRadius.circular(24),
          ),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    margin: const EdgeInsets.only(top: 12, bottom: 8),
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: isDark ? Colors.grey[700] : Colors.grey[300],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                ListTile(
                  leading: const Icon(Icons.image_rounded, color: _kBlue),
                  title: Text('Ảnh từ thư viện', style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                  onTap: () async {
                    Navigator.pop(context);
                    final picker = ImagePicker();
                    final XFile? image = await picker.pickImage(source: ImageSource.gallery);
                    if (image != null) {
                      final bytes = await image.readAsBytes();
                      if (context.mounted) {
                        await _sendMediaWithFeedback(
                          fileName: image.name,
                          contentType: 'image/jpeg',
                          bytes: bytes,
                          type: 'IMAGE',
                          failMessage: 'Không thể gửi ảnh lúc này.',
                        );
                      }
                    }
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.video_library_rounded, color: _kBlue),
                  title: Text('Video từ thư viện', style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                  onTap: () async {
                    Navigator.pop(context);
                    final picker = ImagePicker();
                    final XFile? video = await picker.pickVideo(source: ImageSource.gallery);
                    if (video != null) {
                      final bytes = await video.readAsBytes();
                      if (context.mounted) {
                        await _sendMediaWithFeedback(
                          fileName: video.name,
                          contentType: 'video/mp4',
                          bytes: bytes,
                          type: 'VIDEO',
                          failMessage: 'Không thể gửi video lúc này.',
                        );
                      }
                    }
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.camera_alt_rounded, color: _kBlue),
                  title: Text('Chụp ảnh / Quay video', style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                  onTap: () async {
                    Navigator.pop(context);
                    final picker = ImagePicker();
                    final XFile? image = await picker.pickImage(source: ImageSource.camera);
                    if (image != null) {
                      final bytes = await image.readAsBytes();
                      if (context.mounted) {
                        await _sendMediaWithFeedback(
                          fileName: image.name,
                          contentType: 'image/jpeg',
                          bytes: bytes,
                          type: 'IMAGE',
                          failMessage: 'Không thể gửi ảnh chụp lúc này.',
                        );
                      }
                    }
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.attach_file_rounded, color: _kBlue),
                  title: Text('Chọn tài liệu', style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                  onTap: () async {
                    Navigator.pop(context);
                    // Using prefix to resolve potential member lookup issues
                    final result = await fp.FilePicker.platform.pickFiles(withData: true);
                    if (result != null && result.files.single.bytes != null) {
                      if (context.mounted) {
                        await _sendMediaWithFeedback(
                          fileName: result.files.single.name,
                          contentType: 'application/octet-stream',
                          bytes: result.files.single.bytes!,
                          type: 'DOC',
                          failMessage: 'Không thể gửi tài liệu lúc này.',
                        );
                      }
                    }
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.mic_rounded, color: _kBlue),
                  title: Text('Ghi âm giọng nói', style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                  onTap: () {
                    Navigator.pop(context);
                    _showVoiceRecorder(context, isDark);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.location_on_rounded, color: _kBlue),
                  title: Text('Chia sẻ vị trí', style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                  onTap: () async {
                    Navigator.pop(context);
                    try {
                      LocationPermission permission = await Geolocator.checkPermission();
                      if (permission == LocationPermission.denied) {
                        permission = await Geolocator.requestPermission();
                      }

                      if (permission == LocationPermission.deniedForever) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Bạn đã chặn quyền vị trí. Hãy bật lại trong cài đặt thiết bị.')),
                          );
                        }
                        return;
                      }
                      
                      if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
                        Position position = await Geolocator.getCurrentPosition(
                          desiredAccuracy: LocationAccuracy.high,
                        );
                        if (context.mounted) {
                          await _sendLocationWithFeedback(position.latitude, position.longitude);
                        }
                      } else if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Cần cấp quyền vị trí để gửi định vị.')),
                        );
                      }
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Không thể lấy vị trí hiện tại.')),
                        );
                      }
                    }
                  },
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
  }

  // ── Voice Recorder ────────────────────────────────────────────────────────
  void _showVoiceRecorder(BuildContext context, bool isDark) {
    showModalBottomSheet(
      context: context,
      isDismissible: false,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return _VoiceRecorderSheet(
          isDark: isDark,
          onSend: (bytes) {
            ref.read(chatDetailProvider(widget.conversationId).notifier).sendVoiceMessage(
              fileName: 'voice_${DateTime.now().millisecondsSinceEpoch}.m4a',
              bytes: bytes,
            );
          },
        );
      },
    );
  }
}

class _VoiceRecorderSheet extends StatefulWidget {
  final bool isDark;
  final Function(Uint8List) onSend;

  const _VoiceRecorderSheet({required this.isDark, required this.onSend});

  @override
  _VoiceRecorderSheetState createState() => _VoiceRecorderSheetState();
}

class _VoiceRecorderSheetState extends State<_VoiceRecorderSheet> {
  final _audioRecorder = AudioRecorder();
  bool _isRecording = false;
  Duration _duration = Duration.zero;
  DateTime? _startTime;

  @override
  void dispose() {
    _audioRecorder.dispose();
    super.dispose();
  }

  Future<void> _toggleRecording() async {
    if (_isRecording) {
      final path = await _audioRecorder.stop();
      setState(() => _isRecording = false);
      if (path != null) {
        // Simple way to get bytes: use http/dio if it's a blob url or local path
        // On web it's a blob URL. We need to fetch it to get bytes.
        final response = await Dio().get(path, options: Options(responseType: ResponseType.bytes));
        widget.onSend(Uint8List.fromList(response.data));
      }
      Navigator.pop(context);
    } else {
      if (await _audioRecorder.hasPermission()) {
        await _audioRecorder.start(const RecordConfig(), path: '');
        setState(() {
          _isRecording = true;
          _startTime = DateTime.now();
        });
        _updateTimer();
      }
    }
  }

  void _updateTimer() {
    if (!_isRecording) return;
    setState(() {
      _duration = DateTime.now().difference(_startTime!);
    });
    Future.delayed(const Duration(seconds: 1), _updateTimer);
  }

  @override
  Widget build(BuildContext context) {
     return Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: widget.isDark ? const Color(0xFF1E2536) : Colors.white,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _isRecording ? 'Đang ghi âm...' : 'Sẵn sàng ghi âm',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
              ),
              const SizedBox(height: 16),
              Text(
                '${_duration.inMinutes}:${(_duration.inSeconds % 60).toString().padLeft(2, '0')}',
                style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: _isRecording ? Colors.red : _kBlue),
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Hủy', style: TextStyle(color: Colors.grey)),
                  ),
                  GestureDetector(
                    onTap: _toggleRecording,
                    child: Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: _isRecording ? Colors.red : _kBlue,
                        shape: BoxShape.circle,
                        boxShadow: [
                           BoxShadow(color: (_isRecording ? Colors.red : _kBlue).withValues(alpha: 0.3), blurRadius: 15, spreadRadius: 5)
                        ]
                      ),
                      child: Icon(_isRecording ? Icons.stop_rounded : Icons.mic_rounded, color: Colors.white, size: 36),
                    ),
                  ),
                  const SizedBox(width: 40), // spacer
                ],
              ),
            ],
          ),
        );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Divider
// ─────────────────────────────────────────────────────────────────────────────
class _DateDivider extends StatelessWidget {
  const _DateDivider({required this.date});
  final DateTime date;

  String _label() {
    final now = DateTime.now();
    if (DateUtils.isSameDay(date, now)) return 'Hôm nay';
    if (DateUtils.isSameDay(date, now.subtract(const Duration(days: 1)))) return 'Hôm qua';
    return DateFormat('dd/MM/yyyy').format(date);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        children: [
          Expanded(child: Divider(color: _kBorder, height: 1)),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: _kBlueSoft,
              borderRadius: BorderRadius.circular(99),
            ),
            child: Text(_label(), style: const TextStyle(fontSize: 11, color: _kBlue, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 12),
          Expanded(child: Divider(color: _kBorder, height: 1)),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Bubble
// ─────────────────────────────────────────────────────────────────────────────
class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.msg,
    required this.isMe,
    required this.isDark,
    required this.isSameAsPrev,
    required this.isSameAsNext,
    required this.reactions,
    required this.onRecall,
    required this.onReply,
    required this.onReact,
  });

  final MessageItem msg;
  final bool isMe;
  final bool isDark;
  final bool isSameAsPrev;
  final bool isSameAsNext;
  final List<String> reactions;
  final VoidCallback onRecall;
  final VoidCallback onReply;
  final void Function(String) onReact;

  @override
  Widget build(BuildContext context) {
    const r = Radius.circular(20);
    const rSmall = Radius.circular(6);

    final bubbleRadius = BorderRadius.only(
      topLeft: r,
      topRight: r,
      bottomLeft: isMe ? r : (isSameAsNext ? r : rSmall),
      bottomRight: isMe ? (isSameAsNext ? r : rSmall) : r,
    );

    final bubbleColor = isMe
        ? _kBlue
        : (isDark ? const Color(0xFF1E2536) : Colors.white);

    final textColor = isMe
        ? Colors.white
        : (isDark ? Colors.white : _kTextDark);

    return Padding(
      padding: EdgeInsets.only(
        left: isMe ? 60 : 0,
        right: isMe ? 0 : 60,
        bottom: isSameAsNext ? 3 : 10,
      ),
      child: Row(
        mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // Other sender's avatar
          if (!isMe) ...[
            if (!isSameAsNext)
              CircleAvatar(
                radius: 15,
                backgroundColor: _kBlueSoft,
                child: Text(
                  msg.senderName?.isNotEmpty == true
                      ? msg.senderName!.substring(0, 1).toUpperCase()
                      : 'B',
                  style: const TextStyle(color: _kBlue, fontSize: 12, fontWeight: FontWeight.w700),
                ),
              )
            else
              const SizedBox(width: 30),
            const SizedBox(width: 8),
          ],
          // Bubble
          Flexible(
            child: Column(
              crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                // Sender name (only once per group)
                if (!isMe && !isSameAsPrev && msg.senderName != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 4, bottom: 4),
                    child: Text(
                      msg.senderName!,
                      style: const TextStyle(fontSize: 11, color: _kBlue, fontWeight: FontWeight.w700),
                    ),
                  ),
                GestureDetector(
                  onLongPress: () => _showActions(context),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: bubbleColor,
                      borderRadius: bubbleRadius,
                      boxShadow: [
                        BoxShadow(
                          color: isMe
                              ? _kBlue.withValues(alpha: 0.2)
                              : Colors.black.withValues(alpha: 0.05),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                      border: !isMe ? Border.all(color: _kBorder) : null,
                    ),
                    child: Column(
                      crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                      children: [
                        if (msg.isRecalled)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.block_rounded, size: 14, color: isMe ? Colors.white60 : _kTextMuted),
                              const SizedBox(width: 4),
                              Text(
                                'Tin nhắn đã thu hồi',
                                style: TextStyle(
                                  fontStyle: FontStyle.italic,
                                  fontSize: 13,
                                  color: isMe ? Colors.white60 : _kTextMuted,
                                ),
                              ),
                            ],
                          )
                        else if (msg.type == 'IMAGE' && msg.attachmentUrl != null)
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.network(msg.attachmentUrl!, width: 200, height: 200, fit: BoxFit.cover),
                              ),
                              if (msg.content.isNotEmpty) ...[
                                const SizedBox(height: 8),
                                Text(
                                  msg.content,
                                  style: TextStyle(fontSize: 15, color: textColor, height: 1.4),
                                ),
                              ],
                            ],
                          )
                        else if ((msg.type == 'DOC' || msg.type == 'VIDEO' || msg.type == 'AUDIO') && msg.attachmentUrl != null)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                               Icon(
                                 msg.type == 'VIDEO' ? Icons.video_file_rounded : (msg.type == 'AUDIO' ? Icons.audiotrack_rounded : Icons.insert_drive_file_rounded), 
                                 color: isMe ? Colors.white : _kBlue,
                                 size: 32,
                               ),
                               const SizedBox(width: 8),
                               Flexible(
                                 child: Text(
                                   msg.content.isEmpty ? 'Tệp tin đính kèm' : msg.content,
                                   style: TextStyle(color: textColor, decoration: TextDecoration.underline, fontWeight: FontWeight.w500),
                                 ),
                               ),
                            ],
                          )
                        else
                          Text(
                            msg.content,
                            style: TextStyle(fontSize: 15, color: textColor, height: 1.4),
                          ),
                        const SizedBox(height: 4),
                        Text(
                          DateFormat('HH:mm').format(msg.createdAt.toLocal()),
                          style: TextStyle(
                            fontSize: 10,
                            color: isMe ? Colors.white60 : _kTextMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                
                // Show reactions if any
                if (reactions.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF1E2536) : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _kBorder),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 4, offset: const Offset(0, 2))
                        ],
                      ),
                      child: Text(
                        reactions.take(3).join(' ') + (reactions.length > 3 ? '+' : ''),
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showActions(BuildContext context) {
    if (msg.isRecalled) return; // Không cho thao tác tin đã thu hồi

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E2536) : Colors.white,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.1),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Container chứa thanh nắm vuốt (Drag handle)
                Center(
                  child: Container(
                    margin: const EdgeInsets.only(top: 12, bottom: 8),
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: isDark ? Colors.grey[700] : Colors.grey[300],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                // Reactions
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: ['❤️', '👍', '😂', '😮', '😢', '🙏']
                        .map((emoji) => GestureDetector(
                              onTap: () {
                                Navigator.pop(context);
                                onReact(emoji);
                              },
                              child: Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: isDark ? const Color(0xFF2C2C3E) : _kSurface,
                                  shape: BoxShape.circle,
                                ),
                                child: Text(emoji, style: const TextStyle(fontSize: 26)),
                              ),
                            ))
                        .toList(),
                  ),
                ),
                Divider(height: 1, color: isDark ? const Color(0xFF2C2C3E) : _kBorder),
                ListTile(
                  leading: const Icon(Icons.reply_rounded, color: _kBlue),
                  title: const Text('Trả lời', style: TextStyle(fontWeight: FontWeight.w600)),
                  onTap: () {
                    Navigator.pop(context);
                    onReply();
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.copy_rounded, color: _kTextMuted),
                  title: Text('Sao chép', style: TextStyle(color: isDark ? Colors.white : _kTextDark)),
                  onTap: () async {
                    Navigator.pop(context);
                    await Clipboard.setData(ClipboardData(text: msg.content));
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Đã sao chép tin nhắn'), duration: Duration(seconds: 1)),
                      );
                    }
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.forward_to_inbox_rounded, color: _kTextMuted),
                  title: Text('Chuyển tiếp', style: TextStyle(color: isDark ? Colors.white : _kTextDark)),
                  onTap: () => Navigator.pop(context),
                ),
                if (isMe) ...[
                  Divider(height: 1, color: isDark ? const Color(0xFF2C2C3E) : _kBorder),
                  ListTile(
                    leading: const Icon(Icons.delete_outline_rounded, color: Colors.red),
                    title: const Text('Thu hồi', style: TextStyle(color: Colors.red, fontWeight: FontWeight.w600)),
                    onTap: () {
                      Navigator.pop(context);
                      onRecall();
                    },
                  ),
                ],
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
  }
}
