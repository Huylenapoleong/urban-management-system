import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../../core/network/api_client.dart';
import '../../../features/chat/models/chat_message.dart';
import '../../../state/auth_controller.dart';
import '../../../state/providers.dart';
import 'chat_providers.dart';
import 'widgets/gif_picker_sheet.dart';
import 'widgets/sticker_picker_sheet.dart';
import '../../../features/shared/widgets/app_toast.dart';

class SharedChatDetailPage extends ConsumerStatefulWidget {
  const SharedChatDetailPage({
    super.key,
    required this.conversationId,
    required this.title,
    required this.roleSegment,
  });

  final String conversationId;
  final String title;
  final String roleSegment;

  @override
  ConsumerState<SharedChatDetailPage> createState() => _SharedChatDetailPageState();
}

class _SharedChatDetailPageState extends ConsumerState<SharedChatDetailPage> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  bool _sending = false;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _pollTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      if (!mounted) return;
      ref.read(chatRefreshTickProvider.notifier).state++;
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _sendMessage() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;

    final auth = ref.read(authControllerProvider);
    final userId = auth.user?.id ?? '';

    setState(() => _sending = true);
    final previousText = text;
    _controller.clear();

    try {
      await ref.read(chatRepositoryProvider).sendTextMessage(
            conversationId: widget.conversationId,
            content: text,
            clientMessageId: '${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(9999)}',
          );
      ref.invalidate(chatMessagesProvider(widget.conversationId));
      unawaited(_scrollToBottom());
    } catch (e) {
      if (!mounted) return;
      _controller.text = previousText;
      AppToast.show(
        context,
        message: ApiClient.extractError(e),
        type: AppToastType.error,
      );
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }

    if (userId.isNotEmpty && mounted) {
      FocusScope.of(context).requestFocus(FocusNode());
    }
  }

  Future<void> _sendGif(String url) async {
    if (_sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(chatRepositoryProvider).sendTextMessage(
            conversationId: widget.conversationId,
            content: 'GIF Image',
            type: 'IMAGE',
            attachmentUrl: url,
            clientMessageId: '${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(9999)}',
          );
      ref.invalidate(chatMessagesProvider(widget.conversationId));
      unawaited(_scrollToBottom());
    } catch (e) {
      if (!mounted) return;
      AppToast.show(
        context,
        message: ApiClient.extractError(e),
        type: AppToastType.error,
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _sendSticker(String url) async {
    if (_sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(chatRepositoryProvider).sendTextMessage(
            conversationId: widget.conversationId,
            content: 'Sticker Image',
            type: 'IMAGE',
            attachmentUrl: url,
            clientMessageId: '${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(9999)}',
          );
      ref.invalidate(chatMessagesProvider(widget.conversationId));
      unawaited(_scrollToBottom());
    } catch (e) {
      if (!mounted) return;
      AppToast.show(
        context,
        message: ApiClient.extractError(e),
        type: AppToastType.error,
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _scrollToBottom() async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    if (!_scrollController.hasClients) return;
    _scrollController.animateTo(0, duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final userId = auth.user?.id ?? '';
    final messagesAsync = ref.watch(chatMessagesProvider(widget.conversationId));
    final isOfficial = widget.roleSegment == 'official';

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: Text(
                isOfficial ? 'OFFICIAL' : 'CITIZEN',
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B)),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: messagesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text(ApiClient.extractError(error))),
              data: (items) {
                if (items.isEmpty) {
                  return const Center(child: Text('Hay bat dau cuoc tro chuyen!'));
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(chatMessagesProvider(widget.conversationId)),
                  child: ListView.builder(
                    controller: _scrollController,
                    reverse: true,
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
                    itemCount: items.length,
                    itemBuilder: (context, index) {
                      final msg = items[index];
                      return _Bubble(
                        key: ValueKey(msg.id),
                        message: msg,
                        isMine: msg.senderId == userId,
                        conversationId: widget.conversationId,
                      );
                    },
                  ),
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Row(
                children: [
                  IconButton(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    constraints: const BoxConstraints(),
                    icon: const Icon(Icons.gif_box_outlined, color: Color(0xFF7C3AED), size: 24),
                    onPressed: () {
                      FocusScope.of(context).unfocus();
                      GifPickerSheet.show(
                        context,
                        onGifSelected: _sendGif,
                      );
                    },
                  ),
                  IconButton(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    constraints: const BoxConstraints(),
                    icon: const Icon(Icons.sticky_note_2_outlined, color: Color(0xFF7C3AED), size: 24),
                    onPressed: () {
                      FocusScope.of(context).unfocus();
                      StickerPickerSheet.show(
                        context,
                        onStickerSelected: _sendSticker,
                      );
                    },
                  ),

                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _sendMessage(),
                      decoration: InputDecoration(
                        hintText: isOfficial ? 'Nhap tin nhan cong vu...' : 'Nhap tin nhan...',
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _sending ? null : _sendMessage,
                    style: FilledButton.styleFrom(shape: const CircleBorder(), padding: const EdgeInsets.all(12)),
                    child: _sending
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.send_rounded, size: 20),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({super.key, required this.message, required this.isMine, required this.conversationId});

  final ChatMessage message;
  final bool isMine;
  final String conversationId;

  @override
  Widget build(BuildContext context) {


    final time = DateFormat('HH:mm').format(message.sentAt.toLocal());

    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: RepaintBoundary(
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          constraints: const BoxConstraints(maxWidth: 310),
          decoration: BoxDecoration(
            color: isMine
                ? const Color(0xFF1F3E68)
                : (Theme.of(context).brightness == Brightness.dark
                    ? const Color(0xFF1E293B)
                    : Colors.white),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
                color: isMine
                    ? const Color(0xFF1F3E68)
                    : (Theme.of(context).brightness == Brightness.dark
                        ? Colors.grey.shade800
                        : const Color(0xFFDCE4EF))),
            boxShadow: const [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!isMine)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    message.senderName,
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.grey[300]
                            : const Color(0xFF334155)),
                  ),
                ),
              if (message.type == 'IMAGE' && message.attachmentUrl != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: CachedNetworkImage(
                      imageUrl: message.attachmentUrl!,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => const SizedBox(
                        width: 40,
                        height: 40,
                        child: Center(
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Color(0xFF7C3AED)),
                        ),
                      ),
                      errorWidget: (context, url, error) => const Icon(Icons.error),
                    ),
                  ),
                )
              else
                Text(message.content,
                    style: TextStyle(
                        color: isMine
                            ? Colors.white
                            : (Theme.of(context).brightness == Brightness.dark
                                ? Colors.white
                                : const Color(0xFF0F172A)),
                        height: 1.35)),
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.centerRight,
                child: Text(
                  time,
                  style: TextStyle(
                      fontSize: 11,
                      color: isMine
                          ? const Color(0xB3FFFFFF)
                          : (Theme.of(context).brightness == Brightness.dark
                              ? Colors.grey[400]
                              : const Color(0xFF64748B))),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
