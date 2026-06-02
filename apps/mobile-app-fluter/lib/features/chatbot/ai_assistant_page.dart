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
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    
    final bgColor = isDark ? const Color(0xFF0B0720) : const Color(0xFFF5F3FF);
    final cardBgColor = isDark ? const Color(0xFF161233) : Colors.white;
    final textMain = isDark ? Colors.white : const Color(0xFF1E1B4B);
    final textSec = isDark ? Colors.white60 : const Color(0xFF6D28D9);

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Container(
        height: MediaQuery.of(context).size.height * 0.85,
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(28),
            topRight: Radius.circular(28),
          ),
          border: Border.all(
            color: isDark ? Colors.white.withOpacity(0.08) : Colors.black.withOpacity(0.05),
            width: 1.5,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.3),
              blurRadius: 30,
              offset: const Offset(0, -5),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(26),
            topRight: Radius.circular(26),
          ),
          child: Scaffold(
            backgroundColor: Colors.transparent,
            appBar: PreferredSize(
              preferredSize: const Size.fromHeight(kToolbarHeight + 10),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Top Drag Handle Indicator
                  Container(
                    margin: const EdgeInsets.only(top: 10, bottom: 2),
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white30 : Colors.black26,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  AppBar(
                    backgroundColor: Colors.transparent,
                    elevation: 0,
                    centerTitle: false,
                    automaticallyImplyLeading: false,
                    title: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(2),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: const LinearGradient(
                              colors: [Color(0xFF8B5CF6), Color(0xFFEC4899)],
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF8B5CF6).withOpacity(0.4),
                                blurRadius: 8,
                                spreadRadius: 1,
                              ),
                            ],
                          ),
                          child: const CircleAvatar(
                            radius: 16,
                            backgroundColor: Color(0xFF0B0720),
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
                                color: textMain,
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
                                    color: Color(0xFF8B5CF6),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  'Trực tuyến',
                                  style: GoogleFonts.inter(
                                    color: textSec.withOpacity(0.7),
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
                        icon: Icon(Icons.delete_sweep_rounded, color: isDark ? Colors.white70 : const Color(0xFF4C1D95)),
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
                      IconButton(
                        icon: Icon(Icons.close_rounded, color: isDark ? Colors.white70 : const Color(0xFF4C1D95)),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                      const SizedBox(width: 8),
                    ],
                  ),
                ],
              ),
            ),
            body: Stack(
              children: [
                // Beautiful Decorative Background Blobs
                Positioned(
                  top: -80,
                  right: -40,
                  child: Container(
                    width: 240,
                    height: 240,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFF8B5CF6).withOpacity(0.08),
                    ),
                  ),
                ),
                Positioned(
                  bottom: 80,
                  left: -80,
                  child: Container(
                    width: 300,
                    height: 300,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFFEC4899).withOpacity(0.04),
                    ),
                  ),
                ),
                
                Column(
                  children: [
                    Expanded(
                      child: ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                        itemCount: _messages.length + (_messages.length == 1 ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (index == 1 && _messages.length == 1) {
                            return _buildSuggestions(isDark, textSec);
                          }
                          final msg = _messages[index];
                          return _MessageBubble(message: msg);
                        },
                      ),
                    ),
                    _buildInputArea(isDark, bgColor, textMain, cardBgColor),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSuggestions(bool isDark, Color textSec) {
    final suggestions = [
      "Thủ tục cấp phép xây dựng?",
      "Quy định về tiếng ồn?",
      "Cách phản ánh rác thải?",
      "Quy định vỉa hè mới?",
    ];

    return TweenAnimationBuilder<double>(
      duration: const Duration(milliseconds: 800),
      tween: Tween<double>(begin: 0.0, end: 1.0),
      builder: (context, value, child) {
        return Opacity(
          opacity: value.clamp(0.0, 1.0),
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
                  color: textSec.withOpacity(0.6),
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
                      color: isDark ? Colors.white.withOpacity(0.04) : Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: isDark ? Colors.white.withOpacity(0.08) : const Color(0xFFDDD6FE),
                      ),
                      boxShadow: isDark ? null : [
                        BoxShadow(
                          color: const Color(0xFF7C3AED).withOpacity(0.04),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        )
                      ],
                    ),
                    child: Text(
                      s,
                      style: GoogleFonts.inter(
                        color: isDark ? Colors.white.withOpacity(0.85) : const Color(0xFF5B21B6),
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

  Widget _buildInputArea(bool isDark, Color bgColor, Color textMain, Color cardBgColor) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        16, 10, 16, 
        MediaQuery.of(context).padding.bottom + 16
      ),
      decoration: BoxDecoration(
        color: bgColor,
        border: Border(
          top: BorderSide(
            color: isDark ? Colors.white.withOpacity(0.05) : const Color(0xFFDDD6FE).withOpacity(0.5),
          ),
        ),
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
                    color: isDark ? Colors.white.withOpacity(0.04) : cardBgColor,
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(
                      color: isDark ? Colors.white.withOpacity(0.08) : const Color(0xFFDDD6FE),
                    ),
                  ),
                  child: TextField(
                    controller: _controller,
                    maxLines: 4,
                    minLines: 1,
                    cursorColor: const Color(0xFF7C3AED),
                    style: GoogleFonts.inter(color: textMain, fontSize: 15),
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
                        color: isDark ? Colors.white.withOpacity(0.3) : const Color(0xFF7C3AED).withOpacity(0.4),
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
                  colors: [Color(0xFF7C3AED), Color(0xFF6366F1)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF7C3AED).withOpacity(0.3),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return TweenAnimationBuilder<double>(
      duration: const Duration(milliseconds: 400),
      tween: Tween<double>(begin: 0.0, end: 1.0),
      curve: Curves.easeOutBack,
      builder: (context, value, child) {
        return Opacity(
          opacity: value.clamp(0.0, 1.0),
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
                  colors: [Color(0xFF7C3AED), Color(0xFF6366F1)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                )
              : null,
            color: message.isUser 
                ? null 
                : (isDark ? Colors.white.withOpacity(0.06) : Colors.white),
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(24),
              topRight: const Radius.circular(24),
              bottomLeft: Radius.circular(message.isUser ? 24 : 4),
              bottomRight: Radius.circular(message.isUser ? 4 : 24),
            ),
            border: message.isUser 
                ? null 
                : Border.all(
                    color: isDark ? Colors.white.withOpacity(0.08) : const Color(0xFFDDD6FE),
                  ),
            boxShadow: [
              if (message.isUser)
                BoxShadow(
                  color: const Color(0xFF7C3AED).withOpacity(0.2),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                )
              else if (!isDark)
                BoxShadow(
                  color: const Color(0xFF7C3AED).withOpacity(0.02),
                  blurRadius: 8,
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
                      const Icon(Icons.auto_awesome, size: 14, color: Color(0xFF8B5CF6)),
                      const SizedBox(width: 6),
                      Text(
                        'AI ASSISTANT', 
                        style: GoogleFonts.inter(
                          fontSize: 10, 
                          fontWeight: FontWeight.bold, 
                          color: const Color(0xFF8B5CF6),
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
                      color: message.isUser 
                          ? Colors.white 
                          : (isDark ? Colors.white.withOpacity(0.9) : const Color(0xFF1E1B4B)),
                      fontSize: 15,
                      height: 1.6,
                    ),
                    strong: TextStyle(
                      color: message.isUser ? Colors.white : (isDark ? Colors.white : const Color(0xFF1E1B4B)), 
                      fontWeight: FontWeight.bold
                    ),
                    code: GoogleFonts.firaCode(
                      backgroundColor: isDark ? Colors.black26 : const Color(0xFFF3F0FF),
                      color: const Color(0xFF7C3AED),
                      fontSize: 13,
                    ),
                    blockquote: GoogleFonts.inter(
                      color: isDark ? Colors.white70 : const Color(0xFF4C1D95), 
                      fontStyle: FontStyle.italic
                    ),
                    blockquoteDecoration: BoxDecoration(
                      color: isDark ? Colors.white12 : const Color(0xFFF5F3FF),
                      borderRadius: BorderRadius.circular(4),
                      border: const Border(left: BorderSide(color: Color(0xFF7C3AED), width: 3)),
                    ),
                    tableBorder: TableBorder.all(
                      color: isDark ? Colors.white24 : const Color(0xFFDDD6FE), 
                      width: 1
                    ),
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
            color: Color(0xFF8B5CF6),
            shape: BoxShape.circle,
          ),
        );
      }),
    );
  }
}
