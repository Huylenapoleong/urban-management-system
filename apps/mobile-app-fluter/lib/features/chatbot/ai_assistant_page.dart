import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:google_fonts/google_fonts.dart';
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
      text: "Xin chào! Tôi là **Trợ lý Đô thị AI**. Tôi có thể giúp bạn tìm hiểu về quy định pháp luật, thủ tục hành chính hoặc tóm tắt các vấn đề đô thị. Bạn muốn hỏi gì không?",
      isUser: false,
    ));
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 500),
          curve: Curves.easeOutQuart,
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
      backgroundColor: const Color(0xFF0F172A),
      extendBodyBehindAppBar: true,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(kToolbarHeight),
        child: ClipRRect(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
            child: AppBar(
              backgroundColor: Colors.white.withOpacity(0.1),
              elevation: 0,
              centerTitle: false,
              title: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        colors: [Color(0xFF10B981), Color(0xFF3B82F6)],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF10B981).withOpacity(0.5),
                          blurRadius: 8,
                          spreadRadius: 1,
                        ),
                      ],
                    ),
                    child: const CircleAvatar(
                      radius: 16,
                      backgroundColor: Color(0xFF1E293B),
                      child: Icon(Icons.auto_awesome, color: Colors.white, size: 18),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Trợ lý AI Đô thị',
                        style: GoogleFonts.outfit(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 18,
                        ),
                      ),
                      Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: Color(0xFF10B981),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Trực tuyến',
                            style: GoogleFonts.inter(
                              color: Colors.white.withOpacity(0.6),
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.delete_sweep_rounded, color: Colors.white70),
                  onPressed: () {
                    setState(() {
                      _messages.clear();
                      _messages.add(AiMessage(
                        text: "Xin chào! Tôi là **Trợ lý Đô thị AI**. Tôi có thể giúp bạn tìm hiểu về quy định pháp luật, thủ tục hành chính hoặc tóm tắt các vấn đề đô thị. Bạn muốn hỏi gì không?",
                        isUser: false,
                      ));
                    });
                  },
                ),
                const SizedBox(width: 8),
              ],
            ),
          ),
        ),
      ),
      body: Stack(
        children: [
          // Background Blobs
          Positioned(
            top: -100,
            right: -50,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF10B981).withOpacity(0.1),
              ),
            ),
          ),
          Positioned(
            bottom: 100,
            left: -100,
            child: Container(
              width: 400,
              height: 400,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF3B82F6).withOpacity(0.05),
              ),
            ),
          ),
          
          Column(
            children: [
              Expanded(
                child: ListView.builder(
                  controller: _scrollController,
                  padding: EdgeInsets.fromLTRB(
                    16, 
                    MediaQuery.of(context).padding.top + kToolbarHeight + 16, 
                    16, 
                    16
                  ),
                  itemCount: _messages.length + (_messages.length == 1 ? 1 : 0),
                  itemBuilder: (context, index) {
                    if (index == 1 && _messages.length == 1) {
                      return _buildSuggestions();
                    }
                    final msg = _messages[index];
                    return _MessageBubble(message: msg);
                  },
                ),
              ),
              _buildInputArea(),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSuggestions() {
    final suggestions = [
      "Thủ tục cấp phép xây dựng?",
      "Quy định về tiếng ồn?",
      "Cách phản ánh rác thải?",
      "Quy định vỉa hè mới?",
    ];

    return TweenAnimationBuilder<double>(
      duration: const Duration(milliseconds: 800),
      tween: Tween(begin: 0, end: 1),
      builder: (context, value, child) {
        return Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, 20 * (1 - value)),
            child: child,
          ),
        );
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 12),
              child: Text(
                "GỢI Ý KHÁM PHÁ",
                style: GoogleFonts.inter(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: Colors.white.withOpacity(0.4),
                  letterSpacing: 1.2,
                ),
              ),
            ),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: suggestions.map((s) => Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () {
                    _controller.text = s;
                    _handleSend();
                  },
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white.withOpacity(0.1)),
                    ),
                    child: Text(
                      s,
                      style: GoogleFonts.inter(
                        color: Colors.white.withOpacity(0.8),
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              )).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: EdgeInsets.fromLTRB(
        16, 8, 16, 
        MediaQuery.of(context).padding.bottom + 16
      ),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A).withOpacity(0.8),
        border: Border(top: BorderSide(color: Colors.white.withOpacity(0.05))),
      ),
      child: Row(
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(28),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: Colors.white.withOpacity(0.1)),
                  ),
                  child: TextField(
                    controller: _controller,
                    maxLines: 4,
                    minLines: 1,
                    cursorColor: const Color(0xFF10B981),
                    style: GoogleFonts.inter(color: Colors.white, fontSize: 15),
                    decoration: InputDecoration(
                      hintText: 'Hỏi AI bất cứ điều gì...',
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      filled: false,
                      fillColor: Colors.transparent,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 12),
                      hintStyle: GoogleFonts.inter(
                        color: Colors.white.withOpacity(0.3),
                        fontSize: 15,
                      ),
                    ),
                    onSubmitted: (_) => _handleSend(),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          GestureDetector(
            onTap: _isTyping ? null : _handleSend,
            child: Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(
                  colors: [Color(0xFF10B981), Color(0xFF059669)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF10B981).withOpacity(0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: _isTyping 
                ? const Center(
                    child: SizedBox(
                      width: 22, 
                      height: 22, 
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)
                    )
                  )
                : const Icon(Icons.send_rounded, color: Colors.white, size: 24),
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
    return TweenAnimationBuilder<double>(
      duration: const Duration(milliseconds: 400),
      tween: Tween(begin: 0, end: 1),
      curve: Curves.easeOutBack,
      builder: (context, value, child) {
        return Opacity(
          opacity: value,
          child: Transform.scale(
            scale: 0.8 + (0.2 * value),
            alignment: message.isUser ? Alignment.centerRight : Alignment.centerLeft,
            child: child,
          ),
        );
      },
      child: Align(
        alignment: message.isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.only(bottom: 20),
          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.82),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: message.isUser 
              ? const LinearGradient(
                  colors: [Color(0xFF10B981), Color(0xFF059669)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                )
              : null,
            color: message.isUser ? null : Colors.white.withOpacity(0.08),
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(24),
              topRight: const Radius.circular(24),
              bottomLeft: Radius.circular(message.isUser ? 24 : 4),
              bottomRight: Radius.circular(message.isUser ? 4 : 24),
            ),
            border: message.isUser ? null : Border.all(color: Colors.white.withOpacity(0.1)),
            boxShadow: [
              if (message.isUser)
                BoxShadow(
                  color: const Color(0xFF10B981).withOpacity(0.2),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!message.isUser)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.auto_awesome, size: 14, color: Color(0xFF10B981)),
                      const SizedBox(width: 6),
                      Text(
                        'AI ASSISTANT', 
                        style: GoogleFonts.inter(
                          fontSize: 10, 
                          fontWeight: FontWeight.bold, 
                          color: const Color(0xFF10B981),
                          letterSpacing: 1.0,
                        )
                      ),
                    ],
                  ),
                ),
              if (message.isStreaming && message.text.isEmpty)
                _buildThinkingIndicator()
              else
                MarkdownBody(
                  data: message.text,
                  styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
                    p: GoogleFonts.inter(
                      color: message.isUser ? Colors.white : Colors.white.withOpacity(0.9),
                      fontSize: 15,
                      height: 1.6,
                    ),
                    strong: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                    code: GoogleFonts.firaCode(
                      backgroundColor: Colors.black26,
                      color: const Color(0xFF10B981),
                      fontSize: 13,
                    ),
                    blockquote: GoogleFonts.inter(color: Colors.white70, fontStyle: FontStyle.italic),
                    blockquoteDecoration: BoxDecoration(
                      color: Colors.white12,
                      borderRadius: BorderRadius.circular(4),
                      border: const Border(left: BorderSide(color: Color(0xFF10B981), width: 3)),
                    ),
                    tableBorder: TableBorder.all(color: Colors.white24, width: 1),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildThinkingIndicator() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(3, (index) {
        return Container(
          width: 6,
          height: 6,
          margin: const EdgeInsets.only(right: 4),
          decoration: const BoxDecoration(
            color: Color(0xFF10B981),
            shape: BoxShape.circle,
          ),
        );
      }),
    );
  }
}
