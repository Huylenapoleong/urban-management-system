import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../services/conversation_service.dart';
import '../../models/message_item.dart';
import '../shared/widgets/app_toast.dart';

class GroupSharedMediaScreen extends StatefulWidget {
  final String? groupId;
  final String? conversationId;
  final String groupName;
  final ConversationService conversationService;
  final int initialTabIndex;

  const GroupSharedMediaScreen({
    super.key,
    this.groupId,
    this.conversationId,
    required this.groupName,
    required this.conversationService,
    required this.initialTabIndex,
  });

  @override
  State<GroupSharedMediaScreen> createState() => _GroupSharedMediaScreenState();
}

class _GroupSharedMediaScreenState extends State<GroupSharedMediaScreen> {
  bool _isLoading = true;
  String? _errorMessage;
  List<MessageItem> _mediaMessages = [];
  List<MessageItem> _linkMessages = [];
  List<MessageItem> _docMessages = [];

  final RegExp _urlRegex = RegExp(r'(https?:\/\/[^\s]+)');

  @override
  void initState() {
    super.initState();
    _loadResources();
  }

  Future<void> _loadResources() async {
    if (!mounted) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final conversationId = widget.conversationId ?? "group:${widget.groupId}";
      // Fetch up to 150 messages from conversation
      final result = await widget.conversationService.listMessages(
        conversationId,
        limit: 150,
      );

      final List<MessageItem> media = [];
      final List<MessageItem> links = [];
      final List<MessageItem> docs = [];

      for (var msg in result.items) {
        if (msg.isDeleted) continue;

        // 1. Filter Media (Images & Videos)
        if (msg.isImage || msg.isVideo) {
          media.add(msg);
        }

        // 2. Filter Links (text containing http/https)
        if (_urlRegex.hasMatch(msg.contentText)) {
          links.add(msg);
        }

        // 3. Filter Documents
        if (msg.isDocument) {
          docs.add(msg);
        }
      }

      if (mounted) {
        setState(() {
          _mediaMessages = media;
          _linkMessages = links;
          _docMessages = docs;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Error loading shared resources: $e");
      if (mounted) {
        setState(() {
          _errorMessage = "Không thể tải tài nguyên chia sẻ. Vui lòng thử lại.";
          _isLoading = false;
        });
      }
    }
  }

  String _formatDate(DateTime? date) {
    if (date == null) return "";
    final localDate = date.toLocal();
    return DateFormat('dd/MM/yyyy HH:mm').format(localDate);
  }

  Future<void> _launchUrlHelper(String urlString) async {
    final uri = Uri.tryParse(urlString);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      if (mounted) {
        AppToast.show(
          context,
          message: "Không thể mở liên kết này",
          type: AppToastType.error,
        );
      }
    }
  }

  void _copyToClipboard(String text) {
    Clipboard.setData(ClipboardData(text: text));
    AppToast.show(
      context,
      message: "Đã sao chép liên kết vào bộ nhớ tạm",
      type: AppToastType.success,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return DefaultTabController(
      length: 3,
      initialIndex: widget.initialTabIndex,
      child: Scaffold(
        backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                widget.groupId != null ? "Kho lưu trữ nhóm" : "Tài nguyên chia sẻ",
                style: TextStyle(
                  color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                ),
              ),
              Text(
                widget.groupName,
                style: TextStyle(
                  color: isDark ? Colors.white60 : Colors.black54,
                  fontSize: 12,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
          centerTitle: true,
          backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
          elevation: 0,
          iconTheme: IconThemeData(color: isDark ? Colors.white : const Color(0xFF1E1B4B)),
          bottom: TabBar(
            labelColor: const Color(0xFF7C3AED),
            unselectedLabelColor: isDark ? Colors.white60 : Colors.black54,
            indicatorColor: const Color(0xFF7C3AED),
            indicatorSize: TabBarIndicatorSize.tab,
            tabs: const [
              Tab(text: "Ảnh & Video"),
              Tab(text: "Liên kết"),
              Tab(text: "Tài liệu"),
            ],
          ),
        ),
        body: _isLoading
            ? const Center(child: CircularProgressIndicator(color: Color(0xFF7C3AED)))
            : _errorMessage != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.error_outline, size: 48, color: Colors.red.shade400),
                          const SizedBox(height: 12),
                          Text(
                            _errorMessage!,
                            style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF7C3AED),
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            onPressed: _loadResources,
                            icon: const Icon(Icons.refresh),
                            label: const Text("Thử lại"),
                          ),
                        ],
                      ),
                    ),
                  )
                : TabBarView(
                    children: [
                      _buildMediaTab(isDark),
                      _buildLinksTab(isDark),
                      _buildDocsTab(isDark),
                    ],
                  ),
      ),
    );
  }

  Widget _buildMediaTab(bool isDark) {
    if (_mediaMessages.isEmpty) {
      return _buildEmptyState(
        icon: Icons.photo_library_outlined,
        color: Colors.pink,
        message: "Chưa có ảnh hoặc video nào được chia sẻ trong nhóm này",
      );
    }

    return RefreshIndicator(
      onRefresh: _loadResources,
      color: const Color(0xFF7C3AED),
      child: GridView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: _mediaMessages.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
          childAspectRatio: 1.0,
        ),
        itemBuilder: (context, index) {
          final msg = _mediaMessages[index];
          final url = msg.resolvedAttachmentUrl ?? "";

          return GestureDetector(
            onTap: () {
              if (msg.isImage) {
                _showFullscreenImage(url);
              } else if (msg.isVideo) {
                _launchUrlHelper(url);
              }
            },
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                  width: 1,
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.network(
                      url,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) => Container(
                        color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                        child: const Icon(Icons.broken_image_outlined, color: Colors.grey),
                      ),
                      loadingBuilder: (context, child, loadingProgress) {
                        if (loadingProgress == null) return child;
                        return Container(
                          color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                          child: const Center(
                            child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF7C3AED)),
                            ),
                          ),
                        );
                      },
                    ),
                    if (msg.isVideo)
                      Container(
                        color: Colors.black26,
                        child: const Center(
                          child: Icon(
                            Icons.play_circle_filled_rounded,
                            color: Colors.white,
                            size: 38,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  void _showFullscreenImage(String url) {
    showDialog(
      context: context,
      builder: (context) => Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: Stack(
          children: [
            Center(
              child: InteractiveViewer(
                child: Image.network(
                  url,
                  fit: BoxFit.contain,
                  errorBuilder: (context, error, stackTrace) => const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 64),
                ),
              ),
            ),
            Positioned(
              top: 40,
              right: 20,
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.black38,
                  shape: BoxShape.circle,
                ),
                child: IconButton(
                  icon: const Icon(Icons.close, color: Colors.white, size: 28),
                  onPressed: () => Navigator.pop(context),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLinksTab(bool isDark) {
    if (_linkMessages.isEmpty) {
      return _buildEmptyState(
        icon: Icons.link_outlined,
        color: Colors.indigo,
        message: "Chưa có liên kết nào được chia sẻ trong nhóm này",
      );
    }

    // Process messages to extract all links
    final List<Map<String, dynamic>> extractedLinks = [];
    for (var msg in _linkMessages) {
      final text = msg.contentText;
      final matches = _urlRegex.allMatches(text);
      for (var match in matches) {
        final url = match.group(0);
        if (url != null) {
          extractedLinks.add({
            "url": url,
            "senderName": msg.senderName,
            "sentAt": msg.sentAtDate,
          });
        }
      }
    }

    return RefreshIndicator(
      onRefresh: _loadResources,
      color: const Color(0xFF7C3AED),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        itemCount: extractedLinks.length,
        itemBuilder: (context, index) {
          final linkItem = extractedLinks[index];
          final url = linkItem["url"] as String;
          final sender = linkItem["senderName"] as String;
          final sentAt = linkItem["sentAt"] as DateTime?;

          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E293B) : Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9),
              ),
            ),
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              leading: CircleAvatar(
                backgroundColor: isDark
                    ? const Color(0xFF7C3AED).withOpacity(0.2)
                    : const Color(0xFF7C3AED).withOpacity(0.12),
                child: const Icon(Icons.link_outlined, color: Color(0xFF7C3AED)),
              ),
              title: Text(
                url,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF7C3AED),
                  decoration: TextDecoration.underline,
                ),
              ),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 6.0),
                child: Text(
                  "Chia sẻ bởi $sender vào ${_formatDate(sentAt)}",
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                  ),
                ),
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    icon: Icon(Icons.copy_rounded, color: isDark ? Colors.white60 : Colors.black45, size: 20),
                    tooltip: "Sao chép",
                    onPressed: () => _copyToClipboard(url),
                  ),
                  Icon(Icons.chevron_right, color: isDark ? const Color(0xFF475569) : const Color(0xFF94A3B8)),
                ],
              ),
              onTap: () => _launchUrlHelper(url),
            ),
          );
        },
      ),
    );
  }

  Widget _buildDocsTab(bool isDark) {
    if (_docMessages.isEmpty) {
      return _buildEmptyState(
        icon: Icons.insert_drive_file_outlined,
        color: Colors.orange,
        message: "Chưa có tài liệu nào được chia sẻ trong nhóm này",
      );
    }

    return RefreshIndicator(
      onRefresh: _loadResources,
      color: const Color(0xFF7C3AED),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        itemCount: _docMessages.length,
        itemBuilder: (context, index) {
          final msg = _docMessages[index];
          final url = msg.resolvedAttachmentUrl ?? "";
          final fileName = msg.attachmentName;
          final sender = msg.senderName;
          final sentAt = msg.sentAtDate;

          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E293B) : Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9),
              ),
            ),
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              leading: CircleAvatar(
                backgroundColor: isDark
                    ? Colors.orange.withOpacity(0.2)
                    : Colors.orange.withOpacity(0.12),
                child: const Icon(Icons.insert_drive_file_outlined, color: Colors.orange),
              ),
              title: Text(
                fileName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: isDark ? Colors.white : Colors.black87,
                ),
              ),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 6.0),
                child: Text(
                  "Gửi bởi $sender vào ${_formatDate(sentAt)}",
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                  ),
                ),
              ),
              trailing: Icon(Icons.download_rounded, color: isDark ? const Color(0xFF7C3AED) : const Color(0xFF7C3AED)),
              onTap: () => _launchUrlHelper(url),
            ),
          );
        },
      ),
    );
  }

  Widget _buildEmptyState({
    required IconData icon,
    required Color color,
    required String message,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.all(32.0),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: isDark ? color.withOpacity(0.15) : color.withOpacity(0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                size: 48,
                color: isDark ? Color.lerp(color, Colors.white, 0.2) : color,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
