import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../state/providers.dart';
import '../../models/chatbot.dart';
import '../../models/conversation_summary.dart';

class AiAssistantPage extends ConsumerStatefulWidget {
  const AiAssistantPage({super.key});

  @override
  ConsumerState<AiAssistantPage> createState() => _AiAssistantPageState();
}

class _AiAssistantPageState extends ConsumerState<AiAssistantPage> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  final ScrollController _scrollController = ScrollController();
  final List<AiMessage> _messages = [];
  bool _isTyping = false;
  bool _showSlashSuggestions = false;
  bool _showAutocompleteSuggestions = false;
  List<ConversationSummary> _conversations = [];
  List<ConversationSummary> _matchingConversations = [];
  bool _loadingTargets = false;

  @override
  void dispose() {
    _controller.removeListener(_onTextChanged);
    _controller.dispose();
    _focusNode.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onTextChanged);
    _messages.add(AiMessage(
      text: "Xin chào! Tôi là **Trợ lý Đô thị AI**. Tôi có thể giúp bạn tìm hiểu về quy định pháp luật, thủ tục hành chính hoặc tóm tắt các vấn đề đô thị. Bạn muốn hỏi gì không?",
      isUser: false,
    ));
    _loadAutocompleteTargets();
  }

  Future<void> _loadAutocompleteTargets() async {
    if (!mounted) return;
    setState(() => _loadingTargets = true);
    try {
      final convSvc = ref.read(conversationServiceProvider);
      final res = await convSvc.listConversations(limit: 200);
      if (mounted) {
        setState(() {
          _conversations = res.items;
          _loadingTargets = false;
        });
      }
    } catch (e) {
      debugPrint('[CHATBOT_DEBUG] Error loading conversations for autocomplete: $e');
      if (mounted) {
        setState(() => _loadingTargets = false);
      }
    }
  }

  void _onTextChanged() {
    final text = _controller.text;
    final trimmedText = text.trim();
    final showSlash = text.startsWith('/') && !text.contains(' ');
    
    List<ConversationSummary> matching = [];
    if (text.startsWith('/summary ')) {
      final query = text.substring(9).trim().toLowerCase();
      if (query.isEmpty) {
        matching = _conversations;
      } else {
        matching = _conversations.where((c) {
          return c.title.toLowerCase().contains(query);
        }).toList();
      }
    } else if (trimmedText.isNotEmpty && !text.startsWith('/')) {
      final query = trimmedText.toLowerCase();
      matching = _conversations.where((c) {
        return c.title.toLowerCase().contains(query);
      }).toList();
    }
    
    setState(() {
      _showSlashSuggestions = showSlash;
      _matchingConversations = matching;
      _showAutocompleteSuggestions = matching.isNotEmpty;
    });
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

  void _onSelectTarget(AiMessage parentMessage, ChatbotTarget target) {
    if (parentMessage.isCandidateSelected) return;
    
    setState(() {
      parentMessage.isCandidateSelected = true;
    });

    final targetName = target.name;
    final targetTypeLabel = target.type == 'GROUP' ? 'nhóm' : 'cuộc trò chuyện với';
    
    _handleSend(
      customText: parentMessage.originalQuery ?? "Tóm tắt $targetTypeLabel $targetName",
      selectedTarget: target.toJson(),
      displaySentText: "Tóm tắt $targetTypeLabel $targetName",
    );
  }

  Future<void> _handleSend({
    String? customText,
    Map<String, dynamic>? selectedTarget,
    String? displaySentText,
  }) async {
    final text = customText ?? _controller.text.trim();
    debugPrint('[CHATBOT_DEBUG] _handleSend called. text: "$text", _isTyping: $_isTyping');
    if (text.isEmpty || _isTyping) {
      debugPrint('[CHATBOT_DEBUG] _handleSend returned early because text is empty or _isTyping is true');
      return;
    }

    if (customText == null) {
      _controller.clear();
    }
    
    final displayedText = displaySentText ?? text;
    
    setState(() {
      _messages.add(AiMessage(text: displayedText, isUser: true));
      _messages.add(AiMessage(text: "", isUser: false, isStreaming: true));
      _isTyping = true;
    });
    _scrollToBottom();

    try {
      final chatbotSvc = ref.read(chatbotServiceProvider);
      
      final res = await chatbotSvc.authenticatedAsk(text, selectedTarget: selectedTarget);
      
      final status = res.status;
      final answer = res.answer;
      final candidates = res.candidates;
      final sources = res.sources;
      final messagesFetched = res.messagesFetched;
      final targetName = res.target?.name;
      final targetType = res.target?.type;

      if (mounted) {
        setState(() {
          _messages.last = AiMessage(
            text: answer,
            isUser: false,
            status: status,
            candidates: candidates,
            sources: sources,
            messagesFetched: messagesFetched,
            targetName: targetName,
            targetType: targetType,
            originalQuery: text,
          );
          _isTyping = false;
        });
        _scrollToBottom();
      }
    } catch (e, stack) {
      debugPrint('[CHATBOT_DEBUG] Error in _handleSend: $e\n$stack');
      if (mounted) {
        setState(() {
          _messages.last = AiMessage(
            text: "Xin lỗi, đã có lỗi xảy ra khi kết nối với máy chủ AI. Vui lòng thử lại sau.",
            isUser: false,
          );
          _isTyping = false;
        });
        _scrollToBottom();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? const Color(0xFF0B0720) : const Color(0xFFF5F3FF);
    final cardBgColor = isDark ? const Color(0xFF161233) : Colors.white;
    final textMain = isDark ? Colors.white : const Color(0xFF1E1B4B);
    final textSec = isDark ? Colors.white60 : const Color(0xFF6D28D9);
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final inputHeight = 62.0 + (bottomPadding == 0 ? 16.0 : bottomPadding);

    return Container(
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
            resizeToAvoidBottomInset: true,
            appBar: PreferredSize(
              preferredSize: const Size.fromHeight(kToolbarHeight + 16),
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
                          return _MessageBubble(
                            message: msg,
                            onSelectTarget: _onSelectTarget,
                          );
                        },
                      ),
                    ),
                    _buildInputArea(isDark, bgColor, textMain, cardBgColor),
                  ],
                ),
                if (_showSlashSuggestions)
                  Positioned(
                    bottom: inputHeight + 4,
                    left: 0,
                    right: 0,
                    child: _buildSlashSuggestions(isDark, cardBgColor, textMain, textSec),
                  ),
                if (_showAutocompleteSuggestions)
                  Positioned(
                    bottom: inputHeight + 4,
                    left: 0,
                    right: 0,
                    child: _buildAutocompleteSuggestions(isDark, cardBgColor, textMain, textSec),
                  ),
              ],
            ),
          ),
        ),
      );
  }

  Widget _buildSlashSuggestions(
    bool isDark,
    Color cardBgColor,
    Color textMain,
    Color textSec,
  ) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: cardBgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? Colors.white.withOpacity(0.08) : const Color(0xFFDDD6FE),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.15),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            setState(() {
              _controller.text = "/summary ";
              _controller.selection = TextSelection.fromPosition(
                TextPosition(offset: _controller.text.length),
              );
              _showSlashSuggestions = false;
            });
            _focusNode.requestFocus();
          },
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF8B5CF6).withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.summarize_rounded,
                    color: Color(0xFF8B5CF6),
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '/summary',
                        style: GoogleFonts.outfit(
                          color: textMain,
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Tóm tắt nội dung cuộc trò chuyện (nhóm hoặc cá nhân)',
                        style: GoogleFonts.inter(
                          color: textSec.withOpacity(0.7),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  'Chọn',
                  style: GoogleFonts.inter(
                    color: const Color(0xFF8B5CF6),
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAutocompleteSuggestions(
    bool isDark,
    Color cardBgColor,
    Color textMain,
    Color textSec,
  ) {
    return Container(
      constraints: const BoxConstraints(maxHeight: 200),
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: cardBgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? Colors.white.withOpacity(0.08) : const Color(0xFFDDD6FE),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.15),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: ListView.separated(
          shrinkWrap: true,
          padding: EdgeInsets.zero,
          itemCount: _matchingConversations.length,
          separatorBuilder: (context, index) => Divider(
            height: 1,
            color: isDark ? Colors.white10 : const Color(0xFFE2E8F0),
          ),
          itemBuilder: (context, index) {
            final c = _matchingConversations[index];
            return Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () {
                  final targetName = c.title;
                  final targetTypeLabel = c.isGroup ? 'nhóm' : 'cuộc trò chuyện với';
                  
                  _handleSend(
                    customText: "/summary ${c.title}",
                    selectedTarget: {
                      'type': c.isGroup ? 'GROUP' : 'USER',
                      'id': c.conversationId,
                    },
                    displaySentText: "Tóm tắt $targetTypeLabel $targetName",
                  );
                  
                  setState(() {
                    _controller.clear();
                    _showAutocompleteSuggestions = false;
                  });
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFF8B5CF6).withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          c.isGroup ? Icons.groups_rounded : Icons.person_rounded,
                          color: const Color(0xFF8B5CF6),
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              c.title,
                              style: GoogleFonts.outfit(
                                color: textMain,
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              c.isGroup ? 'Nhóm' : 'Cuộc trò chuyện 1-1',
                              style: GoogleFonts.inter(
                                color: textSec.withOpacity(0.7),
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        'Tóm tắt',
                        style: GoogleFonts.inter(
                          color: const Color(0xFF8B5CF6),
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
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
        MediaQuery.of(context).padding.bottom == 0 ? 16 : MediaQuery.of(context).padding.bottom,
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
                    focusNode: _focusNode,
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
            onTap: _isTyping ? null : () => _handleSend(),
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
  final String? status; // 'summary' | 'candidates' | 'not_found' | 'law'
  final List<ChatbotTarget>? candidates;
  final List<Map<String, dynamic>>? sources;
  final int? messagesFetched;
  final String? targetName;
  final String? targetType;
  bool isCandidateSelected;
  String? originalQuery;

  AiMessage({
    required this.text,
    required this.isUser,
    this.isStreaming = false,
    this.status,
    this.candidates,
    this.sources,
    this.messagesFetched,
    this.targetName,
    this.targetType,
    this.isCandidateSelected = false,
    this.originalQuery,
  });
}

class _MessageBubble extends StatelessWidget {
  final AiMessage message;
  final void Function(AiMessage message, ChatbotTarget target)? onSelectTarget;

  const _MessageBubble({required this.message, this.onSelectTarget});

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
              else ...[
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
                if (!message.isUser && message.status == 'candidates' && message.candidates != null)
                  _buildCandidatesList(message.candidates!, isDark),
                if (!message.isUser && message.status == 'law' && message.sources != null && message.sources!.isNotEmpty)
                  _buildSourcesList(message.sources!, isDark),
                if (!message.isUser && message.status == 'summary' && message.targetName != null)
                  _buildSummaryBanner(message, isDark),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCandidatesList(List<ChatbotTarget> candidates, bool isDark) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: candidates.map((cand) {
          final type = cand.type;
          final name = cand.name;
          final isGroup = type == 'GROUP';
          
          final buttonColor = isDark ? Colors.white.withOpacity(0.06) : const Color(0xFFEEF2F6);
          final activeTextColor = isDark ? const Color(0xFFC084FC) : const Color(0xFF6D28D9);

          return Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: message.isCandidateSelected 
                  ? null 
                  : () => onSelectTarget?.call(message, cand),
              borderRadius: BorderRadius.circular(12),
              child: Opacity(
                opacity: message.isCandidateSelected ? 0.6 : 1.0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: buttonColor,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isDark ? Colors.white12 : const Color(0xFFCBD5E1),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isGroup ? Icons.groups_rounded : Icons.person_rounded,
                        size: 16,
                        color: activeTextColor,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        name,
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: message.isCandidateSelected 
                              ? (isDark ? Colors.white38 : Colors.black38)
                              : (isDark ? Colors.white70 : const Color(0xFF1E293B)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildSourcesList(List<dynamic> sources, bool isDark) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Divider(color: isDark ? Colors.white12 : const Color(0xFFDDD6FE), thickness: 1),
          const SizedBox(height: 4),
          Row(
            children: [
              const Icon(Icons.bookmark_added_rounded, size: 14, color: Color(0xFF8B5CF6)),
              const SizedBox(width: 6),
              Text(
                'TÀI LIỆU THAM KHẢO',
                style: GoogleFonts.inter(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: const Color(0xFF8B5CF6),
                  letterSpacing: 1.0,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: sources.map((src) {
              final srcMap = src as Map<String, dynamic>;
              final title = srcMap['title'] as String? ?? '';
              final source = srcMap['source'] as String? ?? '';
              final display = source.isNotEmpty ? '$title ($source)' : title;
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: isDark ? Colors.white.withOpacity(0.04) : const Color(0xFFF3E8FF),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: isDark ? Colors.white10 : const Color(0xFFE9D5FF),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.menu_book_rounded, size: 12, color: Color(0xFF7C3AED)),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        display,
                        style: GoogleFonts.inter(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: isDark ? Colors.white70 : const Color(0xFF6B21A8),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryBanner(AiMessage msg, bool isDark) {
    final count = msg.messagesFetched ?? 0;
    final targetName = msg.targetName ?? '';
    final isGroup = msg.targetType == 'GROUP';
    
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF8B5CF6).withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: const Color(0xFF8B5CF6).withOpacity(0.2),
        ),
      ),
      child: Row(
        children: [
          Icon(
            isGroup ? Icons.groups_rounded : Icons.person_rounded,
            color: const Color(0xFF8B5CF6),
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Đã tóm tắt $count tin nhắn từ $targetName.',
              style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: isDark ? const Color(0xFFC084FC) : const Color(0xFF6B21A8),
              ),
            ),
          ),
        ],
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
