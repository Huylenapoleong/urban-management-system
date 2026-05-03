import "dart:async";
import "package:file_picker/file_picker.dart";
import "dart:convert";
import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:intl/intl.dart";
import "package:image_picker/image_picker.dart";
import "package:mime/mime.dart";
import "package:infinite_scroll_pagination/infinite_scroll_pagination.dart";
import "package:geolocator/geolocator.dart";
import "package:url_launcher/url_launcher.dart";
import "package:record/record.dart";
import "package:path_provider/path_provider.dart";
import "package:audioplayers/audioplayers.dart";

import "package:shared_preferences/shared_preferences.dart";
import "../../models/conversation_summary.dart";
import "../../models/message_item.dart";
import "../../models/paginated_result.dart";
import "../../services/conversation_service.dart";
import "../../services/socket_service.dart";
import "../../services/upload_service.dart";
import "../../services/user_service.dart";
import "../../services/group_service.dart";
import "../../services/webrtc_service.dart";
import "conversation_info_screen.dart";
import "call_screen.dart";
import "../shared/widgets/user_avatar.dart";

class ChatDetailScreen extends StatefulWidget {
  final ConversationSummary conversation;
  final ConversationService conversationService;
  final UploadService uploadService;
  final SocketService socketService;
  final UserService userService;
  final GroupService groupService;
  final WebRTCService webRTCService;
  final dynamic currentUser;

  const ChatDetailScreen({
    super.key,
    required this.conversation,
    required this.conversationService,
    required this.uploadService,
    required this.socketService,
    required this.userService,
    required this.groupService,
    required this.webRTCService,
    required this.currentUser,
  });

  @override
  State<ChatDetailScreen> createState() => _ChatDetailScreenState();
}

class _ChatDetailScreenState extends State<ChatDetailScreen> {
  final PagingController<String?, MessageItem> _pagingController =
      PagingController(firstPageKey: null);
  final ScrollController _scrollController = ScrollController();
  StreamSubscription? _msgSub;
  StreamSubscription? _presenceSub;
  StreamSubscription? _snapshotSub;
  Map<String, dynamic> _userPresence = {};
  bool _sending = false;
  MessageItem? _replyingTo;
  Map<String, List<String>> _messageReactions = {};

  @override
  void initState() {
    super.initState();
    _loadReactions();
    if (widget.conversation.unreadCount > 0) {
      widget.conversationService
          .markConversationAsRead(widget.conversation.conversationId)
          .catchError((_) {});
    }
    _pagingController.addPageRequestListener((pageKey) {
      _fetchPage(pageKey);
    });

    widget.webRTCService.callState.addListener(_handleCallStateChange);
    widget.socketService.joinConversation(widget.conversation.conversationId);

    _msgSub = widget.socketService.onMessageCreated.listen((msg) {
      if (mounted && msg.conversationId == widget.conversation.conversationId) {
        final items = _pagingController.itemList;
        if (items != null) {
          final exists = items.any((m) => m.id == msg.id);
          if (!exists) {
            final newList = List<MessageItem>.from(items);
            newList.insert(0, msg);
            _pagingController.itemList = newList;
          }
        }
      }
    });

    widget.socketService.onMessageUpdated.listen((msg) {
      if (mounted && msg.conversationId == widget.conversation.conversationId) {
        final items = _pagingController.itemList;
        if (items != null) {
          final idx = items.indexWhere((m) => m.id == msg.id);
          if (idx != -1) {
            final newList = List<MessageItem>.from(items);
            newList[idx] = msg;
            _pagingController.itemList = newList;
          }
        }
      }
    });

    _presenceSub = widget.socketService.onPresenceUpdated.listen((data) {
      final presence = data["presence"] ?? data;
      final userId = presence["userId"]?.toString();
      if (mounted && userId != null) {
        setState(() => _userPresence[userId] = presence);
      }
    });

    _snapshotSub = widget.socketService.onPresenceSnapshot.listen((data) {
      final participants = data["participants"];
      if (mounted && participants is List) {
        setState(() {
          for (var p in participants) {
            if (p is Map) {
              final userId = p["userId"]?.toString();
              if (userId != null) {
                _userPresence[userId] = p;
              }
            }
          }
        });
      }
    });

    // Fetch initial presence for DM
    final peerId = widget.conversation.getPeerId(widget.currentUser.id);
    if (peerId != null) {
      widget.userService.getUserPresence(peerId).then((presence) {
        if (mounted) setState(() => _userPresence[peerId] = presence);
      }).catchError((_) {});
    }
  }

  @override
  void dispose() {
    widget.socketService.leaveConversation(widget.conversation.conversationId);
    widget.webRTCService.callState.removeListener(_handleCallStateChange);
    _msgSub?.cancel();
    _presenceSub?.cancel();
    _snapshotSub?.cancel();
    _pagingController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _handleCallStateChange() {
    if (widget.webRTCService.callState.value != CallState.idle && mounted) {
      // Check if this screen is already showing the call screen
      // If not, we might need to show it
      // Actually, we can just push it when state becomes ringing or connecting
      // But we only do it if the conversationId matches this chat (or it's an incoming call)

      // For now, let's just push it if we are not on it.
      // In a better architecture, the CallScreen would be handled globally (Overlay)
    }
  }

  Future<void> _startCall({bool video = true}) async {
    List<String> inviteeUserIds = const [];

    if (widget.conversation.isGroup) {
      final selectedInvitees = await _pickGroupInvitees();
      if (selectedInvitees == null) {
        return;
      }
      inviteeUserIds = selectedInvitees;
    }

    await widget.webRTCService.startCall(
      widget.conversation.conversationId,
      video: video,
      inviteeUserIds: inviteeUserIds,
    );

    if (!mounted || widget.webRTCService.callState.value == CallState.idle) {
      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CallScreen(
          webRTCService: widget.webRTCService,
          conversation: widget.conversation,
          currentUser: widget.currentUser,
        ),
      ),
    );
  }

  Future<List<String>?> _pickGroupInvitees() async {
    final groupId = widget.conversation.groupId;
    if (groupId == null) {
      return const [];
    }

    try {
      final members = await widget.groupService.listMembers(groupId);
      final currentUserId = widget.currentUser?.id?.toString();
      final invitees = members
          .map(_InviteCandidate.fromJson)
          .where((member) =>
              member.userId.isNotEmpty && member.userId != currentUserId)
          .toList();

      if (!mounted) {
        return null;
      }

      return showModalBottomSheet<List<String>>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (sheetContext) {
          final selectedIds = <String>{};

          return SafeArea(
            child: Container(
              height: MediaQuery.of(sheetContext).size.height * 0.78,
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
              ),
              child: Column(
                children: [
                  const SizedBox(height: 12),
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        "Chọn người được mời",
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        "Bỏ chọn tất cả để gọi cả nhóm như luồng cũ.",
                        style: TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: invitees.isEmpty
                        ? const Center(
                            child: Text(
                              "Không có thành viên khác để mời",
                              style: TextStyle(color: Colors.grey),
                            ),
                          )
                        : StatefulBuilder(
                            builder: (context, setSheetState) {
                              return ListView.separated(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 12),
                                itemCount: invitees.length,
                                separatorBuilder: (_, __) =>
                                    const Divider(height: 1),
                                itemBuilder: (context, index) {
                                  final member = invitees[index];
                                  final isSelected =
                                      selectedIds.contains(member.userId);
                                  return CheckboxListTile(
                                    value: isSelected,
                                    onChanged: (checked) {
                                      setSheetState(() {
                                        if (checked == true) {
                                          selectedIds.add(member.userId);
                                        } else {
                                          selectedIds.remove(member.userId);
                                        }
                                      });
                                    },
                                    controlAffinity:
                                        ListTileControlAffinity.leading,
                                    activeColor: const Color(0xFF7C3AED),
                                    title: Text(member.displayName),
                                    subtitle: Text(member.roleLabel),
                                    secondary: UserAvatar(
                                      userId: member.userId,
                                      initialAvatarUrl: member.avatarUrl,
                                      initialDisplayName: member.displayName,
                                      radius: 18,
                                    ),
                                  );
                                },
                              );
                            },
                          ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => Navigator.pop(sheetContext),
                            child: const Text("Hủy"),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF7C3AED),
                              foregroundColor: Colors.white,
                            ),
                            onPressed: () {
                              Navigator.pop(sheetContext, selectedIds.toList());
                            },
                            child: const Text("Bắt đầu"),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Không tải được danh sách thành viên: $e")));
      }
      return null;
    }
  }

  Future<void> _loadReactions() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs
        .getString("local_reactions_${widget.conversation.conversationId}");
    if (raw != null) {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      setState(() {
        _messageReactions =
            decoded.map((k, v) => MapEntry(k, List<String>.from(v)));
      });
    }
  }

  Future<void> _saveReactions() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        "local_reactions_${widget.conversation.conversationId}",
        jsonEncode(_messageReactions));
  }

  void _handleToggleReaction(String messageId, String emoji) {
    setState(() {
      final reactions = _messageReactions[messageId] ?? [];
      if (reactions.contains(emoji)) {
        reactions.remove(emoji);
      } else {
        reactions.add(emoji);
      }
      if (reactions.isEmpty) {
        _messageReactions.remove(messageId);
      } else {
        _messageReactions[messageId] = reactions;
      }
    });
    _saveReactions();
  }

  Future<void> _fetchPage(String? pageKey) async {
    try {
      final result = await widget.conversationService.listMessages(
        widget.conversation.conversationId,
        cursor: pageKey,
        limit: 30,
      );
      if (result.hasNextPage) {
        _pagingController.appendPage(result.items, result.cursor);
      } else {
        _pagingController.appendLastPage(result.items);
      }
    } catch (error) {
      _pagingController.error = error;
    }
  }

  Future<void> _sendLocation() async {
    bool serviceEnabled;
    LocationPermission permission;

    setState(() => _sending = true);
    try {
      serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text("Dịch vụ định vị đã bị tắt. Vui lòng bật GPS.")));
        }
        return;
      }

      permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text("Quyền truy cập vị trí bị từ chối")));
          }
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text(
                  "Quyền truy cập vị trí bị từ chối vĩnh viễn. Vui lòng bật trong cài đặt.")));
        }
        return;
      }

      // Use settings for better performance
      const locationSettings = LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      );

      Position position = await Geolocator.getCurrentPosition(
        locationSettings: locationSettings,
      );

      final text =
          "Vị trí của tôi: https://www.google.com/maps/search/?api=1&query=${position.latitude},${position.longitude}";
      await _sendMessage(text: text);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text("Lỗi lấy vị trí: $e")));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _sendMessage(
      {required String text, _PendingAttachment? attachment}) async {
    if (text.isEmpty && attachment == null) return;

    setState(() => _sending = true);

    try {
      String? attachmentUrl;
      String? attachmentKey;

      if (attachment != null) {
        final uploadResult = await widget.uploadService.uploadMedia(
          filePath: attachment.path,
          fileName: attachment.name,
          mimeType: attachment.mimeType,
          target: "MESSAGE",
        );
        attachmentUrl = uploadResult.url;
        attachmentKey = uploadResult.key;
      }

      final clientMsgId = "client_${DateTime.now().microsecondsSinceEpoch}";

      final msg = await widget.conversationService.sendMessage(
        widget.conversation.conversationId,
        content: text,
        clientMessageId: clientMsgId,
        type: attachment != null ? attachment.type : "TEXT",
        attachmentUrl: attachmentUrl,
        attachmentKey: attachmentKey,
        replyTo: _replyingTo?.id,
      );

      // Do not manually insert message here, the socket listener will handle it.
      // This prevents double messages when sending.

      setState(() => _replyingTo = null);
      _scrollToBottom();
    } catch (e) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text("Error: $e")));
    } finally {
      setState(() => _sending = false);
    }
  }

  void _showMessageActions(MessageItem message) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 16),
              _buildReactionRow(message),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.reply, color: Color(0xFF7C3AED)),
                title: const Text("Trả lời"),
                onTap: () {
                  Navigator.pop(context);
                  setState(() => _replyingTo = message);
                },
              ),
              ListTile(
                leading: const Icon(Icons.copy, color: Color(0xFF7C3AED)),
                title: const Text("Sao chép"),
                onTap: () {
                  Navigator.pop(context);
                  Clipboard.setData(ClipboardData(text: message.contentText));
                  ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text("Đã sao chép")));
                },
              ),
              ListTile(
                leading:
                    const Icon(Icons.forward_rounded, color: Color(0xFF7C3AED)),
                title: const Text("Chuyển tiếp"),
                onTap: () {
                  Navigator.pop(context);
                  _showForwardDialog(message);
                },
              ),
              if (message.senderId == widget.currentUser.id &&
                  !message.isDeleted)
                ListTile(
                  leading: const Icon(Icons.undo, color: Colors.redAccent),
                  title: const Text("Thu hồi",
                      style: TextStyle(color: Colors.redAccent)),
                  onTap: () {
                    Navigator.pop(context);
                    _recallMessage(message);
                  },
                ),
              ListTile(
                leading:
                    const Icon(Icons.delete_outline, color: Colors.redAccent),
                title: const Text("Xóa với tôi",
                    style: TextStyle(color: Colors.redAccent)),
                onTap: () {
                  Navigator.pop(context);
                  _deleteForMe(message);
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReactionRow(MessageItem message) {
    final emojis = ["❤️", "😂", "😮", "😢", "😡", "👍"];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: emojis
            .map((emoji) => GestureDetector(
                  onTap: () {
                    Navigator.pop(context);
                    _handleToggleReaction(message.id, emoji);
                  },
                  child: Text(emoji, style: const TextStyle(fontSize: 28)),
                ))
            .toList(),
      ),
    );
  }

  void _showForwardDialog(MessageItem message) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        height: MediaQuery.of(context).size.height * 0.7,
        decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2))),
            const Padding(
                padding: EdgeInsets.all(16),
                child: Text("Chuyển tiếp đến",
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
            Expanded(
              child: FutureBuilder<PaginatedResult<ConversationSummary>>(
                future: widget.conversationService.listConversations(limit: 50),
                builder: (context, snapshot) {
                  if (!snapshot.hasData)
                    return const Center(child: CircularProgressIndicator());
                  final convs = snapshot.data!.items
                      .where((c) =>
                          c.conversationId !=
                          widget.conversation.conversationId)
                      .toList();
                  return ListView.builder(
                    itemCount: convs.length,
                    itemBuilder: (context, idx) {
                      final c = convs[idx];
                      return ListTile(
                        leading: CircleAvatar(
                            backgroundImage: (c.isGroup
                                        ? c.groupAvatarUrl
                                        : (c.peerAvatarUrl ?? c.avatarUrl)) !=
                                    null
                                ? NetworkImage(c.isGroup
                                    ? c.groupAvatarUrl!
                                    : (c.peerAvatarUrl ?? c.avatarUrl)!)
                                : null),
                        title: Text(c.title),
                        onTap: () {
                          Navigator.pop(context);
                          _forwardMessage(message, c.conversationId);
                        },
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _forwardMessage(MessageItem message, String targetConvId) {
    widget.conversationService.forwardMessage(
        widget.conversation.conversationId, message.id,
        targetConversationIds: [targetConvId]).then((_) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text("Đã chuyển tiếp")));
    }).catchError((e) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text("Lỗi: $e")));
    });
  }

  void _recallMessage(MessageItem message) {
    widget.conversationService
        .recallMessage(widget.conversation.conversationId, message.id,
            scope: "EVERYONE")
        .then((_) {
      if (!mounted) return;
      final items = _pagingController.itemList;
      if (items != null) {
        final idx = items.indexWhere((m) => m.id == message.id);
        if (idx != -1) {
          final newList = List<MessageItem>.from(items);
          newList[idx] = items[idx].copyWith(
              isDeleted: true, contentText: "", resolvedAttachmentUrl: null);
          _pagingController.itemList = newList;
        }
      }
    });
  }

  void _deleteForMe(MessageItem message) {
    widget.conversationService
        .recallMessage(widget.conversation.conversationId, message.id,
            scope: "SELF")
        .then((_) {
      if (!mounted) return;
      final items = _pagingController.itemList;
      if (items != null) {
        final idx = items.indexWhere((m) => m.id == message.id);
        if (idx != -1) {
          final newList = List<MessageItem>.from(items);
          newList.removeAt(idx);
          _pagingController.itemList = newList;
        }
      }
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(0,
            duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: Column(
        children: [
          _buildHeader(),
          _buildActiveCallBanner(),
          Expanded(child: _buildMessageList()),
          if (_replyingTo != null) _buildReplyPreview(),
          ChatComposer(
            onSend: _sendMessage,
            onLocationRequest: _sendLocation,
            uploadService: widget.uploadService,
            sending: _sending,
          ),
        ],
      ),
    );
  }

  Widget _buildActiveCallBanner() {
    return ValueListenableBuilder<CallState>(
      valueListenable: widget.webRTCService.callState,
      builder: (context, state, _) {
        if (state != CallState.idle &&
            widget.webRTCService.currentConversationId ==
                widget.conversation.conversationId) {
          return Container(
            color: Colors.green.withOpacity(0.1),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                const Icon(Icons.group_add, color: Colors.green),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        state == CallState.ringing
                            ? "Cuộc gọi nhóm đang chờ"
                            : "Cuộc gọi nhóm đang diễn ra",
                        style: const TextStyle(
                            fontWeight: FontWeight.bold, color: Colors.green),
                      ),
                      const Text('Nhấn để xem hoặc tham gia',
                          style:
                              TextStyle(fontSize: 12, color: Colors.black54)),
                    ],
                  ),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20)),
                  ),
                  onPressed: () {
                    // Navigate directly to CallScreen
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => CallScreen(
                          webRTCService: widget.webRTCService,
                          conversation: widget.conversation,
                          currentUser: widget.currentUser,
                        ),
                      ),
                    );
                  },
                  child: const Text('Tham gia'),
                ),
              ],
            ),
          );
        }
        return const SizedBox.shrink();
      },
    );
  }

  Widget _buildHeader() {
    final title = widget.conversation.title;

    return Container(
      padding: EdgeInsets.only(
          top: MediaQuery.of(context).padding.top,
          left: 8,
          right: 8,
          bottom: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, 2))
        ],
      ),
      child: Row(
        children: [
          IconButton(
              icon: const Icon(Icons.arrow_back, color: Color(0xFF1E1B4B)),
              onPressed: () => Navigator.pop(context)),
          UserAvatar(
            userId: widget.conversation.isGroup ? null : widget.conversation.getPeerId(widget.currentUser?.id),
            groupId: widget.conversation.isGroup ? widget.conversation.groupId : null,
            initialAvatarUrl: widget.conversation.isGroup ? widget.conversation.groupAvatarUrl : (widget.conversation.peerAvatarUrl ?? widget.conversation.avatarUrl),
            initialDisplayName: title,
            radius: 20,
            showStatus: !widget.conversation.isGroup,
            isActive: !widget.conversation.isGroup &&
                widget.conversation.getPeerId(widget.currentUser.id) != null &&
                (_userPresence[widget.conversation
                        .getPeerId(widget.currentUser.id)!] is Map
                    ? _userPresence[widget.conversation
                            .getPeerId(widget.currentUser.id)!]["isActive"] ==
                        true
                    : _userPresence[widget.conversation
                            .getPeerId(widget.currentUser.id)!] ==
                        true),
            userService: widget.userService,
            groupService: widget.groupService,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: GestureDetector(
              onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => ConversationInfoScreen(
                          conversation: widget.conversation,
                          conversationService: widget.conversationService))),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1E1B4B)),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  _buildStatusText(),
                ],
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.videocam_outlined, color: Color(0xFF7C3AED)),
            onPressed: () => _startCall(video: true),
          ),
          IconButton(
            icon: const Icon(Icons.call_outlined, color: Color(0xFF7C3AED)),
            onPressed: () => _startCall(video: false),
          ),
          IconButton(
            icon: const Icon(Icons.more_vert, color: Color(0xFF64748B)),
            onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => ConversationInfoScreen(
                        conversation: widget.conversation,
                        conversationService: widget.conversationService))),
          ),
        ],
      ),
    );
  }

  Widget _buildReplyPreview() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: Color(0xFFF1F5F9)))),
      child: Row(
        children: [
          Container(
              width: 4,
              height: 32,
              decoration: BoxDecoration(
                  color: const Color(0xFF7C3AED),
                  borderRadius: BorderRadius.circular(2))),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text("Đang trả lời ${_replyingTo!.senderName}",
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF7C3AED))),
                Text(_replyingTo!.contentText,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, color: Colors.grey[600])),
              ],
            ),
          ),
          IconButton(
              icon: const Icon(Icons.close, size: 20),
              onPressed: () => setState(() => _replyingTo = null)),
        ],
      ),
    );
  }

  Widget _buildStatusText() {
    if (widget.conversation.isGroup) return const SizedBox.shrink();
    final peerId = widget.conversation.getPeerId(widget.currentUser.id);
    final presence = _userPresence[peerId];
    final isActive = presence is Map
        ? presence["isActive"] == true
        : (presence == true);

    String statusText = isActive ? "Đang hoạt động" : "Ngoại tuyến";
    if (!isActive && presence is Map && presence["lastSeenAt"] != null) {
      final lastSeen = DateTime.tryParse(presence["lastSeenAt"].toString());
      if (lastSeen != null) {
        statusText = "Hoạt động ${_formatLastSeen(lastSeen)} trước";
      }
    }

    return Row(
      children: [
        if (isActive)
          Container(
            width: 8,
            height: 8,
            margin: const EdgeInsets.only(right: 6),
            decoration: const BoxDecoration(
                color: Colors.green, shape: BoxShape.circle),
          ),
        Flexible(
          child: Text(
            statusText,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              color: isActive ? Colors.green : Colors.grey.shade500,
              fontWeight: isActive ? FontWeight.bold : FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }

  String _formatLastSeen(DateTime date) {
    final diff = DateTime.now().difference(date);
    if (diff.inDays > 0) return "${diff.inDays} ngày";
    if (diff.inHours > 0) return "${diff.inHours} giờ";
    if (diff.inMinutes > 0) return "${diff.inMinutes} phút";
    return "vài giây";
  }

  Widget _buildMessageList() {
    return PagedListView<String?, MessageItem>.separated(
      pagingController: _pagingController,
      scrollController: _scrollController,
      reverse: true,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      builderDelegate: PagedChildBuilderDelegate<MessageItem>(
        itemBuilder: (context, message, index) {
          final isMine = message.senderId == widget.currentUser.id;
          return ChatMessageBubble(
            message: message,
            isMine: isMine,
            reactions: _messageReactions[message.id] ?? [],
            userService: widget.userService,
            onLongPress: () => _showMessageActions(message),
          );
        },
        firstPageProgressIndicatorBuilder: (_) => const Center(
            child: CircularProgressIndicator(color: Color(0xFF7C3AED))),
        noItemsFoundIndicatorBuilder: (_) => const Center(
            child: Text("Chưa có tin nhắn nào",
                style: TextStyle(color: Colors.grey))),
      ),
    );
  }
}

class ChatComposer extends StatefulWidget {
  final Future<void> Function(
      {required String text, _PendingAttachment? attachment}) onSend;
  final VoidCallback onLocationRequest;
  final UploadService uploadService;
  final bool sending;

  const ChatComposer(
      {super.key,
      required this.onSend,
      required this.onLocationRequest,
      required this.uploadService,
      required this.sending});

  @override
  State<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends State<ChatComposer> {
  final _textController = TextEditingController();
  final _audioRecorder = AudioRecorder();
  _PendingAttachment? _attachment;
  bool _isRecording = false;
  int _recordDuration = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _textController.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    _audioRecorder.dispose();
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _startRecording() async {
    try {
      if (await _audioRecorder.hasPermission()) {
        final tempDir = await getTemporaryDirectory();
        final path = "${tempDir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a";
        
        await _audioRecorder.start(const RecordConfig(), path: path);
        
        setState(() {
          _isRecording = true;
          _recordDuration = 0;
        });
        
        _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
          setState(() => _recordDuration++);
        });
      }
    } catch (e) {
      print("Error starting recording: $e");
    }
  }

  Future<void> _stopRecording() async {
    _timer?.cancel();
    final path = await _audioRecorder.stop();
    setState(() => _isRecording = false);
    
    if (path != null) {
      final name = path.split("/").last;
      setState(() {
        _attachment = _PendingAttachment(
          path: path,
          name: name,
          type: "AUDIO",
          mimeType: "audio/mp4",
        );
      });
    }
  }

  Future<void> _cancelRecording() async {
    _timer?.cancel();
    await _audioRecorder.stop();
    setState(() {
      _isRecording = false;
      _recordDuration = 0;
    });
  }

  String _formatDuration(int seconds) {
    final mins = (seconds / 60).floor();
    final secs = seconds % 60;
    return "${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}";
  }

  Future<void> _pickImage(ImageSource source) async {
    final picker = ImagePicker();
    final selected = await picker.pickImage(source: source);
    if (selected == null) return;
    setState(() {
      _attachment = _PendingAttachment(
          path: selected.path,
          name: selected.name,
          type: "IMAGE",
          mimeType: selected.mimeType);
    });
  }

  Future<void> _pickVideo(ImageSource source) async {
    final picker = ImagePicker();
    final selected = await picker.pickVideo(source: source);
    if (selected == null) return;
    setState(() {
      _attachment = _PendingAttachment(
          path: selected.path,
          name: selected.name,
          type: "VIDEO",
          mimeType: selected.mimeType);
    });
  }

  Future<void> _pickFile() async {
    final selected = await FilePicker.platform.pickFiles();
    if (selected == null || selected.files.isEmpty) return;
    final file = selected.files.first;
    if (file.path == null) return;
    setState(() {
      _attachment = _PendingAttachment(
          path: file.path!,
          name: file.name,
          type: "DOC",
          mimeType: lookupMimeType(file.path!));
    });
  }

  void _showPicker() {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
                leading: const Icon(Icons.camera_alt, color: Colors.blue),
                title: const Text("Chụp ảnh"),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage(ImageSource.camera);
                }),
            ListTile(
                leading: const Icon(Icons.videocam, color: Colors.red),
                title: const Text("Quay Video"),
                onTap: () {
                  Navigator.pop(context);
                  _pickVideo(ImageSource.camera);
                }),
            ListTile(
                leading: const Icon(Icons.image, color: Colors.purple),
                title: const Text("Thư viện ảnh/Video"),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage(ImageSource.gallery);
                }),
            ListTile(
                leading: const Icon(Icons.attach_file, color: Colors.orange),
                title: const Text("Tệp tin"),
                onTap: () {
                  Navigator.pop(context);
                  _pickFile();
                }),
            ListTile(
                leading: const Icon(Icons.location_on, color: Colors.green),
                title: const Text("Vị trí"),
                onTap: () {
                  Navigator.pop(context);
                  widget.onLocationRequest();
                }),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
        decoration: BoxDecoration(color: Colors.white, boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, -4))
        ]),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_attachment != null)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(12)),
                child: Row(
                  children: [
                    Icon(
                        _attachment!.type == "VIDEO"
                            ? Icons.videocam
                            : Icons.attach_file,
                        color: const Color(0xFF7C3AED)),
                    const SizedBox(width: 8),
                    Expanded(
                        child: Text(_attachment!.name,
                            maxLines: 1, overflow: TextOverflow.ellipsis)),
                    IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => setState(() => _attachment = null)),
                  ],
                ),
              ),
            Row(
              children: [
                if (!_isRecording)
                  IconButton(
                      icon: const Icon(Icons.add_circle_outline,
                          color: Color(0xFF64748B), size: 28),
                      onPressed: widget.sending ? null : _showPicker),
                const SizedBox(width: 4),
                Expanded(
                  child: _isRecording
                      ? Container(
                          height: 48,
                          decoration: BoxDecoration(
                            color: Colors.red.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(24),
                          ),
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: Row(
                            children: [
                              const Icon(Icons.mic, color: Colors.red, size: 20),
                              const SizedBox(width: 8),
                              Text(_formatDuration(_recordDuration),
                                  style: const TextStyle(
                                      color: Colors.red,
                                      fontWeight: FontWeight.bold)),
                              const Spacer(),
                              const Text("Đang ghi âm...",
                                  style: TextStyle(
                                      color: Colors.red, fontSize: 12)),
                              const Spacer(),
                              TextButton(
                                onPressed: _cancelRecording,
                                child: const Text("Hủy",
                                    style: TextStyle(color: Colors.grey)),
                              ),
                            ],
                          ),
                        )
                      : Container(
                          decoration: BoxDecoration(
                            color: const Color(0xFFF1F5F9),
                            borderRadius: BorderRadius.circular(28),
                            border: Border.all(color: Colors.grey.shade200),
                          ),
                          child: TextField(
                            controller: _textController,
                            maxLines: 5,
                            minLines: 1,
                            style: const TextStyle(fontSize: 16),
                            onChanged: (_) => setState(() {}),
                            decoration: const InputDecoration(
                              hintText: "Nhắn tin...",
                              border: InputBorder.none,
                              contentPadding: EdgeInsets.symmetric(
                                  horizontal: 20, vertical: 12),
                            ),
                          ),
                        ),
                ),
                const SizedBox(width: 8),
                if (widget.sending)
                  const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2))
                else ...[
                  // Logic: If recording -> show Check
                  // If NOT recording:
                  //    If text is EMPTY -> show Mic AND Like
                  //    If text is NOT empty -> show Send
                  if (_isRecording)
                    IconButton(
                      icon: const Icon(Icons.check_circle,
                          color: Color(0xFF7C3AED), size: 28),
                      onPressed: _stopRecording,
                    )
                  else if (_textController.text.trim().isEmpty &&
                      _attachment == null) ...[
                    IconButton(
                      icon: const Icon(Icons.mic_none_outlined,
                          color: Color(0xFF7C3AED), size: 28),
                      onPressed: () {
                        print("DEBUG: Mic button pressed");
                        _startRecording();
                      },
                    ),
                    IconButton(
                      icon: const Icon(Icons.thumb_up_rounded,
                          color: Color(0xFF7C3AED), size: 28),
                      onPressed: () =>
                          widget.onSend(text: "👍", attachment: null),
                    ),
                  ] else
                    IconButton(
                      icon: const Icon(Icons.send_rounded,
                          color: Color(0xFF7C3AED), size: 28),
                      onPressed: () {
                        final text = _textController.text.trim();
                        if (text.isNotEmpty || _attachment != null) {
                          widget.onSend(text: text, attachment: _attachment);
                          _textController.clear();
                          setState(() => _attachment = null);
                        }
                      },
                    ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class ChatMessageBubble extends StatelessWidget {
  final MessageItem message;
  final bool isMine;
  final List<String> reactions;
  final UserService? userService;
  final VoidCallback? onLongPress;

  const ChatMessageBubble({
    super.key,
    required this.message,
    required this.isMine,
    this.reactions = const [],
    this.userService,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    if (message.type == "SYSTEM") {
      return Container(
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          decoration: BoxDecoration(
            color: const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            message.contentText,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: Color(0xFF64748B),
            ),
          ),
        ),
      );
    }

    return GestureDetector(
      onLongPress: onLongPress,
      child: Row(
        mainAxisAlignment:
            isMine ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isMine) ...[
            UserAvatar(
              userId: message.senderId,
              initialAvatarUrl: message.senderAvatarUrl,
              initialDisplayName: message.senderName,
              radius: 14,
              userService: userService,
            ),
            const SizedBox(width: 8),
          ],
          _buildBubble(context),
        ],
      ),
    );
  }

  Widget _buildBubble(BuildContext context) {
    return ConstrainedBox(
      constraints:
          BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isMine ? const Color(0xFF7C3AED) : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(20),
            topRight: const Radius.circular(20),
            bottomLeft: Radius.circular(isMine ? 20 : 4),
            bottomRight: Radius.circular(isMine ? 4 : 20),
          ),
          boxShadow: [
            BoxShadow(
                color: Colors.black.withOpacity(0.04),
                blurRadius: 10,
                offset: const Offset(0, 4))
          ],
        ),
        child: Column(
          crossAxisAlignment:
              isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (message.isDeleted)
              Text("Tin nhắn đã thu hồi",
                  style: TextStyle(
                      fontStyle: FontStyle.italic,
                      color: isMine ? Colors.white70 : Colors.grey))
            else ...[
              if (message.replyTo != null) _buildReplyHeader(),
              if (message.contentText.isNotEmpty) _buildContentBody(context),
              if (message.resolvedAttachmentUrl != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: _AttachmentView(message: message, isMine: isMine),
                ),
            ],
            const SizedBox(height: 4),
            Text(
              _formatTime(message.sentAtDate),
              style: TextStyle(
                  fontSize: 10,
                  color: isMine
                      ? Colors.white.withOpacity(0.7)
                      : Colors.grey[500]),
            ),
            if (reactions.isNotEmpty) _buildReactionsDisplay(isMine),
          ],
        ),
      ),
    );
  }

  Widget _buildContentBody(BuildContext context) {
    final text = message.contentText;
    final isGps = text.contains("google.com/maps");
    final hasLink = text.contains("http://") || text.contains("https://");

    if (isGps) {
      return _buildGpsCard(context, text);
    }

    if (hasLink) {
      return _buildLinkCard(context, text);
    }

    return Text(
      text,
      style: TextStyle(
        color: isMine ? Colors.white : const Color(0xFF1E1B4B),
        fontSize: 15,
        height: 1.4,
      ),
    );
  }

  Widget _buildGpsCard(BuildContext context, String text) {
    final urlMatch = RegExp(r'(https?://[^\s]+)').firstMatch(text);
    final url = urlMatch?.group(0) ?? text;

    return InkWell(
      onTap: () async {
        final uri = Uri.tryParse(url);
        if (uri != null && await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        } else {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("Không thể mở đường dẫn này")));
          }
        }
      },
      child: Container(
        margin: const EdgeInsets.only(top: 4, bottom: 4),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color:
              isMine ? Colors.white.withOpacity(0.15) : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(12),
          border:
              Border.all(color: isMine ? Colors.white24 : Colors.grey.shade200),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.location_on,
                    color: isMine ? Colors.white : const Color(0xFF7C3AED),
                    size: 20),
                const SizedBox(width: 8),
                Text(
                  "Vị trí đã chia sẻ",
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: isMine ? Colors.white : const Color(0xFF1E1B4B),
                    fontSize: 14,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              "Nhấn để xem trên bản đồ",
              style: TextStyle(
                color: isMine ? Colors.white70 : Colors.grey.shade600,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 8),
            Container(
              height: 100,
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(8),
                image: const DecorationImage(
                  image: NetworkImage(
                      "https://maps.googleapis.com/maps/api/staticmap?center=21.0285,105.8542&zoom=13&size=400x200&sensor=false"), // Placeholder static map
                  fit: BoxFit.cover,
                ),
              ),
              child: const Center(
                  child: Icon(Icons.map, size: 40, color: Colors.white70)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLinkCard(BuildContext context, String text) {
    final urlMatch = RegExp(r'(https?://[^\s]+)').firstMatch(text);
    final url = urlMatch?.group(0) ?? "";
    final cleanText = text.replaceFirst(url, "").trim();

    return Column(
      crossAxisAlignment:
          isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        if (cleanText.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              cleanText,
              style: TextStyle(
                  color: isMine ? Colors.white : const Color(0xFF1E1B4B),
                  fontSize: 15),
            ),
          ),
        InkWell(
          onTap: () async {
            final uri = Uri.tryParse(url);
            if (uri != null && await canLaunchUrl(uri)) {
              await launchUrl(uri, mode: LaunchMode.externalApplication);
            } else {
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text("Không thể mở đường dẫn này")));
              }
            }
          },
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isMine
                  ? Colors.white.withOpacity(0.15)
                  : const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: isMine ? Colors.white24 : Colors.grey.shade200),
            ),
            child: Row(
              children: [
                Icon(Icons.link,
                    color: isMine ? Colors.white : const Color(0xFF7C3AED)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Liên kết",
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color:
                              isMine ? Colors.white : const Color(0xFF1E1B4B),
                        ),
                      ),
                      Text(
                        url,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: isMine ? Colors.white70 : Colors.grey.shade600,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildReactionsDisplay(bool isMine) {
    return Container(
      margin: const EdgeInsets.only(top: 4),
      child: Wrap(
        spacing: 4,
        children: reactions
            .map((emoji) => Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: isMine
                        ? Colors.white.withOpacity(0.2)
                        : Colors.grey[100],
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(emoji, style: const TextStyle(fontSize: 12)),
                ))
            .toList(),
      ),
    );
  }

  Widget _buildReplyHeader() {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: isMine ? Colors.white12 : Colors.grey[100],
        borderRadius: BorderRadius.circular(8),
        border: Border(
            left: BorderSide(
                color: isMine ? Colors.white54 : const Color(0xFF7C3AED),
                width: 3)),
      ),
      child: const Text("Đang trả lời...",
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic)),
    );
  }

  String _formatTime(DateTime? date) {
    if (date == null) return "";
    final localDate = date.toLocal();
    return "${localDate.hour.toString().padLeft(2, '0')}:${localDate.minute.toString().padLeft(2, '0')}";
  }
}

class _AttachmentView extends StatelessWidget {
  final MessageItem message;
  final bool isMine;
  const _AttachmentView({required this.message, required this.isMine});

  @override
  Widget build(BuildContext context) {
    final url = message.resolvedAttachmentUrl!;
    if (message.isImage) {
      return GestureDetector(
        onTap: () {
          showDialog(
            context: context,
            builder: (context) => Dialog.fullscreen(
              backgroundColor: Colors.black,
              child: Stack(
                children: [
                  Center(
                    child: InteractiveViewer(
                      child: Image.network(url, fit: BoxFit.contain),
                    ),
                  ),
                  Positioned(
                    top: 40,
                    right: 20,
                    child: IconButton(
                      icon: const Icon(Icons.close, color: Colors.white, size: 30),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
        child: ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.network(url, width: 200, height: 150, fit: BoxFit.cover),
        ),
      );
    }
    if (message.isAudio) {
      return _VoicePlayer(url: url, isMine: isMine);
    }
    if (message.isVideo || message.isDocument) {
      return InkWell(
        onTap: () async {
          final uri = Uri.tryParse(url);
          if (uri != null && await canLaunchUrl(uri)) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          }
        },
        child: Container(
          width: message.isVideo ? 200 : null,
          height: message.isVideo ? 150 : null,
          padding: message.isVideo ? null : const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: message.isVideo ? Colors.black87 : (isMine ? Colors.white24 : Colors.grey[100]),
            borderRadius: BorderRadius.circular(10),
          ),
          child: message.isVideo
              ? const Center(
                  child: Icon(Icons.play_circle_fill, color: Colors.white, size: 50),
                )
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.insert_drive_file,
                      color: Colors.white,
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        message.attachmentName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: isMine ? Colors.white : Colors.black87),
                      ),
                    ),
                  ],
                ),
        ),
      );
    }
    return const SizedBox.shrink();
  }
}

class _VoicePlayer extends StatefulWidget {
  final String url;
  final bool isMine;
  const _VoicePlayer({required this.url, required this.isMine});

  @override
  State<_VoicePlayer> createState() => _VoicePlayerState();
}

class _VoicePlayerState extends State<_VoicePlayer> {
  final AudioPlayer _audioPlayer = AudioPlayer();
  bool _isPlaying = false;
  Duration _duration = Duration.zero;
  Duration _position = Duration.zero;

  @override
  void initState() {
    super.initState();
    _audioPlayer.onDurationChanged.listen((d) => setState(() => _duration = d));
    _audioPlayer.onPositionChanged.listen((p) => setState(() => _position = p));
    _audioPlayer.onPlayerComplete.listen((_) => setState(() => _isPlaying = false));
  }

  @override
  void dispose() {
    _audioPlayer.dispose();
    super.dispose();
  }

  void _togglePlay() async {
    if (_isPlaying) {
      await _audioPlayer.pause();
    } else {
      await _audioPlayer.play(UrlSource(widget.url));
    }
    setState(() => _isPlaying = !_isPlaying);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 220,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: widget.isMine ? Colors.white.withOpacity(0.2) : const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          IconButton(
            icon: Icon(
              _isPlaying ? Icons.pause_circle_filled : Icons.play_circle_filled,
              color: widget.isMine ? Colors.white : const Color(0xFF7C3AED),
              size: 32,
            ),
            onPressed: _togglePlay,
          ),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 4),
                    trackHeight: 2,
                    overlayShape: const RoundSliderOverlayShape(overlayRadius: 10),
                  ),
                  child: Slider(
                    value: _position.inMilliseconds.toDouble(),
                    max: _duration.inMilliseconds.toDouble() > 0 
                        ? _duration.inMilliseconds.toDouble() 
                        : 1.0,
                    activeColor: widget.isMine ? Colors.white : const Color(0xFF7C3AED),
                    inactiveColor: widget.isMine ? Colors.white38 : Colors.grey[300],
                    onChanged: (val) {
                      _audioPlayer.seek(Duration(milliseconds: val.toInt()));
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        _formatDuration(_position),
                        style: TextStyle(
                            fontSize: 10,
                            color: widget.isMine ? Colors.white70 : Colors.grey),
                      ),
                      Text(
                        _formatDuration(_duration),
                        style: TextStyle(
                            fontSize: 10,
                            color: widget.isMine ? Colors.white70 : Colors.grey),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatDuration(Duration d) {
    final mins = d.inMinutes.toString().padLeft(2, '0');
    final secs = (d.inSeconds % 60).toString().padLeft(2, '0');
    return "$mins:$secs";
  }
}

class _PendingAttachment {
  final String path;
  final String name;
  final String type;
  final String? mimeType;
  const _PendingAttachment(
      {required this.path,
      required this.name,
      required this.type,
      this.mimeType});
}

class _InviteCandidate {
  final String userId;
  final String displayName;
  final String? avatarUrl;
  final String roleLabel;

  const _InviteCandidate({
    required this.userId,
    required this.displayName,
    required this.avatarUrl,
    required this.roleLabel,
  });

  factory _InviteCandidate.fromJson(Map<String, dynamic> json) {
    final userId = (json["userId"] ??
                json["id"] ??
                json["memberId"] ??
                json["user"]?["id"])
            ?.toString() ??
        "";
    final displayName = (json["displayName"] ??
            json["fullName"] ??
            json["name"] ??
            json["user"]?["displayName"] ??
            json["user"]?["fullName"] ??
            json["user"]?["name"] ??
            "Người dùng")
        .toString();
    final avatarUrl = (json["avatarUrl"] ??
            json["avatar"] ??
            json["user"]?["avatarUrl"] ??
            json["user"]?["avatar"])
        ?.toString();
    final roleLabel = (json["roleInGroup"] ??
            json["role"] ??
            json["user"]?["roleInGroup"] ??
            json["user"]?["role"] ??
            "MEMBER")
        .toString();

    return _InviteCandidate(
      userId: userId,
      displayName: displayName,
      avatarUrl: avatarUrl,
      roleLabel: roleLabel,
    );
  }
}
