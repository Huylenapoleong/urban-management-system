import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../../services/chatbot_service.dart';
import '../../state/providers.dart';

class AiAssistantPage extends ConsumerStatefulWidget {
  const AiAssistantPage({super.key});

  @override
  ConsumerState<AiAssistantPage> createState() => _AiAssistantPageState();
}

class _AiAssistantPageState extends ConsumerState<AiAssistantPage> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<AiMessage> _messages = [];
  bool _isTyping = false;

  @override
  void initState() {
    super.initState();
    _messages.add(AiMessage(
      text: "Xin chào! Tôi là Trợ lý Đô thị AI. Tôi có thể giúp bạn tìm hiểu về quy định pháp luật, thủ tục hành chính hoặc tóm tắt các vấn đề đô thị. Bạn muốn hỏi gì không?",
      isUser: false,
    ));
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _handleSend() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _isTyping) return;

    _controller.clear();
    setState(() {
      _messages.add(AiMessage(text: text, isUser: true));
      _messages.add(AiMessage(text: "", isUser: false, isStreaming: true));
      _isTyping = true;
    });
    _scrollToBottom();

    try {
      final chatbotSvc = ref.read(chatbotServiceProvider);
      String fullResponse = "";
      
      final stream = chatbotSvc.askStream(text);
      await for (final chunk in stream) {
        fullResponse += chunk;
        if (mounted) {
          setState(() {
            _messages.last = AiMessage(text: fullResponse, isUser: false, isStreaming: true);
          });
          _scrollToBottom();
        }
      }
      
      if (mounted) {
        setState(() {
          _messages.last = AiMessage(text: fullResponse, isUser: false);
          _isTyping = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _messages.last = AiMessage(
            text: "Xin lỗi, đã có lỗi xảy ra khi kết nối với máy chủ AI. Vui lòng thử lại sau.",
            isUser: false,
          );
          _isTyping = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Row(
          children: [
            CircleAvatar(
              radius: 16,
              backgroundColor: Colors.white24,
              child: Icon(Icons.auto_awesome, color: Colors.white, size: 18),
            ),
            SizedBox(width: 12),
            Text('Trợ lý AI Đô thị', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        flexibleSpace: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final msg = _messages[index];
                return _MessageBubble(message: msg);
              },
            ),
          ),
          _buildInput(),
        ],
      ),
    );
  }

  Widget _buildInput() {
    return Container(
      padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.of(context).padding.bottom + 8),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10, offset: const Offset(0, -2)),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(24),
              ),
              child: TextField(
                controller: _controller,
                maxLines: 4,
                minLines: 1,
                decoration: const InputDecoration(
                  hintText: 'Nhập câu hỏi cho AI...',
                  border: InputBorder.none,
                  hintStyle: TextStyle(fontSize: 14),
                ),
                onSubmitted: (_) => _handleSend(),
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: _isTyping ? null : _handleSend,
            icon: _isTyping 
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.send_rounded),
            style: IconButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              minimumSize: const Size(48, 48),
            ),
          ),
        ],
      ),
    );
  }
}

class AiMessage {
  final String text;
  final bool isUser;
  final bool isStreaming;

  AiMessage({required this.text, required this.isUser, this.isStreaming = false});
}

class _MessageBubble extends StatelessWidget {
  final AiMessage message;

  const _MessageBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: message.isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.85),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: message.isUser ? const Color(0xFF2563EB) : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(20),
            topRight: const Radius.circular(20),
            bottomLeft: Radius.circular(message.isUser ? 20 : 4),
            bottomRight: Radius.circular(message.isUser ? 4 : 20),
          ),
          boxShadow: [
            if (!message.isUser)
              BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10, offset: const Offset(0, 4)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!message.isUser)
              const Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Icon(Icons.auto_awesome, size: 14, color: Color(0xFF2563EB)),
                    SizedBox(width: 4),
                    Text('AI Assistant', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF2563EB))),
                  ],
                ),
              ),
            MarkdownBody(
              data: message.text.isEmpty && message.isStreaming ? "..." : message.text,
              styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
                p: TextStyle(
                  color: message.isUser ? Colors.white : const Color(0xFF1E293B),
                  fontSize: 14,
                  height: 1.5,
                ),
                strong: TextStyle(color: message.isUser ? Colors.white : const Color(0xFF0F172A), fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
