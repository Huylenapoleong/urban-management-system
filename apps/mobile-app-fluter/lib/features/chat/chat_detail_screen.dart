import "dart:async";
import "dart:io";
import "package:file_picker/file_picker.dart";
import "dart:convert";
import "package:provider/provider.dart";
import "../../state/session_controller.dart";

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
import "package:video_player/video_player.dart";

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
import "../shared/widgets/app_toast.dart";
import "package:background_downloader/background_downloader.dart";
import "../../app/shared/chat/widgets/gif_picker_sheet.dart";
import "../../app/shared/chat/widgets/sticker_picker_sheet.dart";
import "../groups/group_settings_screen.dart";
import "../../core/utils/translation_helper.dart";

import "../../services/local_cache_service.dart";
import "package:cached_network_image/cached_network_image.dart";
import "package:skeletonizer/skeletonizer.dart";

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
  static final Map<String, List<MessageItem>> _conversationMessagesCache = {};

  final PagingController<String?, MessageItem> _pagingController =
      PagingController(firstPageKey: null);
  final ScrollController _scrollController = ScrollController();
  StreamSubscription? _msgSub;
  StreamSubscription? _readSub;
  StreamSubscription? _presenceSub;
  StreamSubscription? _snapshotSub;
  StreamSubscription? _updateSub;
  Map<String, dynamic> _userPresence = {};
  bool _sending = false;
  MessageItem? _replyingTo;
  Map<String, List<String>> _messageReactions = {};
  Map<String, String> _typingUsers = {};
  final Map<String, Timer> _typingTimers = {};
  StreamSubscription? _typingSub;
  String? _conversationKey;
  Map<String, dynamic>? _activeCallInfo;
  StreamSubscription? _callInitSub;
  StreamSubscription? _callInviteSub;
  StreamSubscription? _callEndSub;
  Map<String, String> _aliases = {};
  bool _loadingAliases = false;
  String? _fetchedGroupName;
  bool _isPeerBlocked = false;

  List<MessageItem> _pinnedMessages = [];
  bool _loadingPinned = false;

  // Search state variables
  bool _isSearching = false;
  bool _showSearchPanel = false;
  final TextEditingController _searchQueryController = TextEditingController();
  String? _searchType;
  String? _searchFromUserId;
  DateTime? _searchAfterDate;
  DateTime? _searchBeforeDate;
  List<dynamic> _conversationMembers = [];
  bool _loadingMembers = false;

  Future<void> _loadConversationMembers() async {
    if (!mounted) return;
    setState(() => _loadingMembers = true);
    try {
      if (widget.conversation.isGroup) {
        var groupId = widget.conversation.groupId;
        if (groupId == null) {
          final convId = widget.conversation.conversationId;
          if (convId.startsWith("group:")) {
            groupId = convId.substring(6);
          } else if (convId.startsWith("group#")) {
            groupId = convId.substring(6);
          } else if (convId.startsWith("grp#")) {
            groupId = convId.substring(4);
          } else if (convId.startsWith("GRP#")) {
            groupId = convId.substring(4);
          }
        }
        if (groupId != null) {
          final membersRaw = await widget.groupService.listMembers(groupId);
          final populatedMembers = await Future.wait(membersRaw.map((m) async {
            final userId = m['userId']?.toString();
            if (userId == null) return m;
            try {
              final profile = await widget.userService.getUserById(userId);
              return {
                ...m,
                'fullName': profile.fullName,
                'displayName': profile.fullName,
                'avatarUrl': profile.avatarUrl,
              };
            } catch (_) {
              return m;
            }
          }));
          if (mounted) {
            setState(() {
              _conversationMembers = populatedMembers;
            });
          }
        }
      } else {
        // DM members: Me & Peer
        final peerId = widget.conversation.getPeerId(widget.currentUser.id);
        final List<Map<String, dynamic>> dmMembers = [
          {
            "userId": widget.currentUser.id,
            "displayName": widget.currentUser.fullName ?? "Tôi",
            "avatarUrl": widget.currentUser.avatarUrl,
            "role": "MEMBER",
          }
        ];
        if (peerId != null) {
          try {
            final peerProfile = await widget.userService.getUserById(peerId);
            dmMembers.add({
              "userId": peerId,
              "displayName": peerProfile.fullName ?? widget.conversation.title,
              "avatarUrl": peerProfile.avatarUrl ?? widget.conversation.avatarUrl,
              "role": "MEMBER",
            });
          } catch (_) {
            dmMembers.add({
              "userId": peerId,
              "displayName": widget.conversation.title,
              "avatarUrl": widget.conversation.avatarUrl,
              "role": "MEMBER",
            });
          }
        }
        if (mounted) {
          setState(() {
            _conversationMembers = dmMembers;
          });
        }
      }
    } catch (e) {
      debugPrint("Error loading members for search: $e");
    } finally {
      if (mounted) {
        setState(() => _loadingMembers = false);
      }
    }
  }

  Future<void> _loadPinnedMessages() async {
    if (!mounted) return;
    setState(() => _loadingPinned = true);
    try {
      final list = await widget.conversationService.listPinnedMessages(widget.conversation.conversationId);
      if (mounted) {
        setState(() {
          _pinnedMessages = list;
        });
      }
    } catch (e) {
      debugPrint("Error loading pinned messages: $e");
    } finally {
      if (mounted) {
        setState(() => _loadingPinned = false);
      }
    }
  }

  Future<void> _loadGroupName() async {
    try {
      final groupId = widget.conversation.groupId ?? widget.conversation.conversationId.replaceAll("group:", "");
      final group = await widget.groupService.getGroup(groupId);
      if (mounted && group.containsKey("groupName")) {
        setState(() {
          _fetchedGroupName = group["groupName"].toString();
        });
      }
    } catch (_) {}
  }

  Future<void> _loadCachedMessages() async {
    try {
      final cached = await LocalCacheService.instance.getMessages(widget.conversation.conversationId);
      if (cached.isNotEmpty && mounted) {
        final cachedMessages = cached.map((e) => MessageItem.fromJson(e)).toList();
        
        // Save to static in-memory cache
        _conversationMessagesCache[widget.conversation.conversationId] = cachedMessages;
        
        if (_pagingController.itemList == null || _pagingController.itemList!.isEmpty) {
          setState(() {
            _pagingController.value = PagingState<String?, MessageItem>(
              nextPageKey: null,
              error: null,
              itemList: cachedMessages,
            );
          });
        }
      }
    } catch (e) {
      debugPrint("Error loading cached messages: $e");
    }
  }

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        try {
          context.read<SessionController>().setActiveConversationId(
            widget.conversation.conversationId,
            unreadCount: widget.conversation.unreadCount,
          );
        } catch (_) {}
      }
    });
    
    // Check synchronous in-memory cache first
    final memCached = _conversationMessagesCache[widget.conversation.conversationId];
    final bool hasCache = memCached != null && memCached.isNotEmpty;
    if (hasCache) {
      _pagingController.value = PagingState<String?, MessageItem>(
        nextPageKey: null,
        error: null,
        itemList: memCached,
      );
    }
    
    _loadCachedMessages();
    _loadReactions();
    _loadAliases();
    _checkBlockStatus();
    if (widget.conversation.isGroup) {
      _loadGroupName();
    }
    if (widget.conversation.unreadCount > 0) {
      widget.conversationService
          .markConversationAsRead(widget.conversation.conversationId)
          .then((_) {
            if (mounted) {
              try {
                context.read<SessionController>().fetchTotalUnreadCount();
              } catch (_) {}
            }
          })
          .catchError((_) {});
    }
    _pagingController.addPageRequestListener((pageKey) {
      _fetchPage(pageKey);
    });
    if (hasCache) {
      _fetchPage(null);
    }
    _loadPinnedMessages();
    _loadConversationMembers();

    widget.webRTCService.callState.addListener(_handleCallStateChange);
    widget.socketService
        .joinConversation(widget.conversation.conversationId)
        .then((data) {
      if (mounted && data != null) {
        setState(() {
          _conversationKey = data["conversationKey"];
          if (data["activeCall"] != null) {
            _activeCallInfo = data["activeCall"];
          }
        });
      }
    });

    _callInitSub = widget.socketService.onCallInit.listen((data) {
      if (mounted && data["conversationId"] == widget.conversation.conversationId) {
        setState(() {
          _activeCallInfo = data;
        });
      }
    });

    _callInviteSub = widget.socketService.onCallInvite.listen((data) {
      if (mounted && data["conversationId"] == widget.conversation.conversationId) {
        setState(() {
          _activeCallInfo = data;
        });
      }
    });

    _callEndSub = widget.socketService.onCallEnd.listen((data) {
      if (mounted && data["conversationId"] == widget.conversation.conversationId) {
        setState(() {
          _activeCallInfo = null;
        });
      }
    });
    // Mark as read on entry
    widget.socketService.markAsRead(widget.conversation.conversationId);
    widget.conversationService.markConversationAsRead(widget.conversation.conversationId)
        .then((_) {
          if (mounted) {
            try {
              context.read<SessionController>().fetchTotalUnreadCount();
            } catch (_) {}
          }
        })
        .catchError((_) {});

    _msgSub = widget.socketService.onMessageCreated.listen((msg) {
      if (mounted && msg.conversationId == widget.conversation.conversationId) {
        if (msg.type == "SYSTEM" && msg.contentText.contains("left the call")) {
          return;
        }

        final myId = widget.currentUser.id.toString();
        if (msg.senderId != myId) {
          widget.socketService.markMessageDelivered(msg.conversationId, msg.id);
          widget.socketService.markAsRead(widget.conversation.conversationId);
          widget.conversationService.markConversationAsRead(widget.conversation.conversationId).ignore();
        }

        // Save socket message to local cache
        LocalCacheService.instance.saveMessages(
          widget.conversation.conversationId,
          [msg.toJson()],
        ).catchError((e) {
          debugPrint("Error caching socket message: $e");
        });

        final items = _pagingController.itemList;
        if (items != null) {
          final newList = List<MessageItem>.from(items);
          
          // 1. Check if the real message already exists by ID
          final existingIdx = newList.indexWhere((m) => m.id == msg.id && !m.isPending);
          
          if (existingIdx != -1) {
            // Real message already exists! Clean up any duplicate pending message that might match
            if (msg.clientMessageId != null && msg.clientMessageId!.isNotEmpty) {
              final initialLen = newList.length;
              newList.removeWhere((m) => m.isPending && (m.clientMessageId == msg.clientMessageId || m.id == msg.clientMessageId));
              if (newList.length != initialLen) {
                _pagingController.itemList = newList;
              }
            }
            return;
          }

          // 2. Find if there is a pending optimistic message that matches this message
          final pendingIdx = newList.indexWhere((m) {
            if (!m.isPending) return false;
            
            // Match by clientMessageId if available
            if (msg.clientMessageId != null && msg.clientMessageId!.isNotEmpty) {
              if (m.clientMessageId == msg.clientMessageId || m.id == msg.clientMessageId) {
                return true;
              }
            }
            
            // Fallback match by content, attachment URL and sender
            if (m.senderId == msg.senderId && m.type == msg.type) {
              if (m.resolvedAttachmentUrl != null && msg.resolvedAttachmentUrl != null) {
                if (m.resolvedAttachmentUrl == msg.resolvedAttachmentUrl) return true;
              }
              final mText = m.contentText.trim().toLowerCase();
              final msgText = msg.contentText.trim().toLowerCase();
              if (mText == msgText && mText.isNotEmpty) return true;
              
              final mTime = DateTime.tryParse(m.sentAt);
              final msgTime = DateTime.tryParse(msg.sentAt);
              if (mTime != null && msgTime != null) {
                if (msgTime.difference(mTime).inSeconds.abs() < 15) {
                  return true;
                }
              }
            }
            return false;
          });

          if (pendingIdx != -1) {
            // Replace the optimistic pending message with the real one from Socket
            newList[pendingIdx] = msg;
            _pagingController.itemList = newList;
          } else {
            // Check if it already exists by clientMessageId (even if not pending, to prevent double receipt)
            final duplicateByClientMsgId = msg.clientMessageId != null && 
                newList.any((m) => m.clientMessageId == msg.clientMessageId);
            
            if (!duplicateByClientMsgId) {
              // Insert as a new message at the top
              newList.insert(0, msg);
              _pagingController.itemList = newList;
            }
          }
        } else {
          _pagingController.itemList = [msg];
        }
        // Remove from typing if message arrived
        if (msg.senderId != myId) {
          setState(() {
            _typingUsers.remove(msg.senderId);
            _typingTimers[msg.senderId]?.cancel();
            _typingTimers.remove(msg.senderId);
          });
        }
        if (msg.type == "SYSTEM") {
          _loadAliases();
        }
      }
    });

    _typingSub = widget.socketService.onTypingState.listen((data) {
      if (mounted &&
          _conversationKey != null &&
          data["conversationKey"] == _conversationKey) {
        final userId = data["userId"]?.toString();
        final fullName = data["fullName"]?.toString() ?? "Ai đó";
        final isTyping = data["isTyping"] == true;
        
        final myId = widget.currentUser.id.toString();
        if (userId != null && userId != myId) {
          setState(() {
            if (isTyping) {
              _typingUsers[userId] = fullName;
              _typingTimers[userId]?.cancel();
              _typingTimers[userId] = Timer(const Duration(seconds: 6), () {
                if (mounted) {
                  setState(() {
                    _typingUsers.remove(userId);
                    _typingTimers.remove(userId);
                  });
                }
              });
            } else {
              _typingUsers.remove(userId);
              _typingTimers[userId]?.cancel();
              _typingTimers.remove(userId);
            }
          });
        }
      }
    });

    _updateSub = widget.socketService.onMessageUpdated.listen((msg) {
      if (mounted && msg.conversationId == widget.conversation.conversationId) {
        final items = _pagingController.itemList;
        if (items != null) {
          final idx = items.indexWhere((m) => m.id == msg.id);
          if (idx != -1) {
            final newList = List<MessageItem>.from(items);
            newList[idx] = msg;
            setState(() {
              _pagingController.itemList = newList;
            });
          }
        }
      }
    });

    _readSub = widget.socketService.onConversationRead.listen((data) {
      if (mounted &&
          (data["conversationId"] == widget.conversation.conversationId ||
           data["conversationKey"] == _conversationKey)) {
        final readByUserId = data["readByUserId"]?.toString() ?? data["userId"]?.toString();
        final readAtStr = data["readAt"]?.toString() ?? data["lastReadAt"]?.toString();
        if (readByUserId != null && readAtStr != null && readByUserId != widget.currentUser.id.toString()) {
          final readAt = DateTime.tryParse(readAtStr);
          if (readAt != null) {
            final items = _pagingController.itemList;
            if (items != null) {
              final newList = List<MessageItem>.from(items);
              bool updatedAny = false;
              for (int i = 0; i < newList.length; i++) {
                final m = newList[i];
                if (m.senderId == widget.currentUser.id.toString()) {
                  final mSentAt = DateTime.tryParse(m.sentAt);
                  if (mSentAt != null && !mSentAt.isAfter(readAt) && m.deliveryState != 'READ') {
                    newList[i] = m.copyWith(
                      deliveryState: 'READ',
                      lastReadAt: readAtStr,
                    );
                    updatedAny = true;
                  }
                }
              }
              if (updatedAny) {
                setState(() {
                  _pagingController.itemList = newList;
                });
              }
            }
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
    try {
      context.read<SessionController>().setActiveConversationId(null);
    } catch (_) {}
    widget.socketService.leaveConversation(widget.conversation.conversationId);
    widget.webRTCService.callState.removeListener(_handleCallStateChange);
    _msgSub?.cancel();
    _readSub?.cancel();
    _presenceSub?.cancel();
    _snapshotSub?.cancel();
    _typingSub?.cancel();
    _updateSub?.cancel();
    _callInitSub?.cancel();
    _callInviteSub?.cancel();
    _callEndSub?.cancel();
    for (final timer in _typingTimers.values) {
      timer.cancel();
    }
    _typingTimers.clear();
    _pagingController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadAliases() async {
    if (_loadingAliases) return;
    _loadingAliases = true;
    try {
      final aliasList = await widget.conversationService
          .listConversationAliases(widget.conversation.conversationId);
      if (mounted) {
        setState(() {
          _aliases = {
            for (var a in aliasList)
              a['userId'].toString(): a['alias'].toString()
          };
        });
      }
    } catch (e) {
      debugPrint("Error loading aliases: $e");
    } finally {
      _loadingAliases = false;
    }
  }

  Future<void> _checkBlockStatus() async {
    if (widget.conversation.isGroup) return;
    final peerId = widget.conversation.getPeerId(widget.currentUser.id);
    if (peerId == null) return;
    try {
      final blockedList = await widget.userService.listBlockedUsers();
      final isBlocked = blockedList.any((item) => item['userId']?.toString() == peerId);
      if (mounted) {
        setState(() {
          _isPeerBlocked = isBlocked;
        });
      }
    } catch (e) {
      debugPrint("Error checking block status: $e");
    }
  }

  Future<void> _unblockUserDirectly() async {
    if (widget.conversation.isGroup) return;
    final peerId = widget.conversation.getPeerId(widget.currentUser.id);
    if (peerId == null) return;

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        title: Text(
          "Bỏ chặn người dùng?",
          style: TextStyle(
            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          "Người này sẽ có thể gửi tin nhắn và gọi điện cho bạn trở lại.",
          style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              "Hủy",
              style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
            onPressed: () => Navigator.pop(context, true),
            child: const Text("Bỏ chặn"),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _sending = true);
      try {
        await widget.userService.unblockUser(peerId);
        if (mounted) {
          setState(() {
            _isPeerBlocked = false;
            _sending = false;
          });
          AppToast.show(
            context,
            message: "Đã bỏ chặn người dùng thành công",
            type: AppToastType.success,
          );
        }
      } catch (e) {
        if (mounted) setState(() => _sending = false);
        AppToast.show(
          context,
          message: translateGroupError(e, fallback: "Không thể bỏ chặn người dùng"),
          type: AppToastType.error,
        );
      }
    }
  }

  void _scrollToMessage(String messageId) {
    final items = _pagingController.itemList ?? [];
    final idx = items.indexWhere((m) => m.id == messageId);
    if (idx != -1) {
      final targetOffset = (idx * 110.0).clamp(
        0.0,
        _scrollController.position.maxScrollExtent,
      );
      _scrollController.animateTo(
        targetOffset,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutQuad,
      );
    }
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
      var groupId = widget.conversation.groupId;
      if (groupId == null) {
        final convId = widget.conversation.conversationId;
        if (convId.startsWith("group:")) {
          groupId = convId.substring(6);
        } else if (convId.startsWith("group#")) {
          groupId = convId.substring(6);
        } else if (convId.startsWith("grp#")) {
          groupId = convId.substring(4);
        } else if (convId.startsWith("GRP#")) {
          groupId = convId.substring(4);
        }
      }
      if (groupId != null) {
        try {
          final members = await widget.groupService.listMembers(groupId);
          final currentUserId = widget.currentUser?.id?.toString();
          inviteeUserIds = members
              .map(_InviteCandidate.fromJson)
              .where((member) =>
                  member.userId.isNotEmpty && member.userId != currentUserId)
              .map((member) => member.userId)
              .toList();
        } catch (e) {
          debugPrint("Failed to fetch group members for calling: $e");
        }
      }
    }

    await widget.webRTCService.startCall(
      widget.conversation.conversationId,
      video: video,
      inviteeUserIds: inviteeUserIds,
      userId: widget.currentUser.id,
    );

    if (!mounted || widget.webRTCService.callState.value == CallState.idle) {
      return;
    }

    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute(
        builder: (_) => CallScreen(
          webRTCService: widget.webRTCService,
          conversation: widget.conversation,
          currentUser: widget.currentUser,
          launchedFromChatDetail: true,
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
        AppToast.show(
          context,
          message: "Không tải được danh sách thành viên: $e",
          type: AppToastType.error,
        );
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
        q: _isSearching && _searchQueryController.text.trim().isNotEmpty
            ? _searchQueryController.text.trim()
            : null,
        type: _isSearching ? _searchType : null,
        fromUserId: _isSearching ? _searchFromUserId : null,
        after: _isSearching ? _searchAfterDate?.toUtc().toIso8601String() : null,
        before: _isSearching ? _searchBeforeDate?.toUtc().toIso8601String() : null,
      );
      final filteredItems = result.items.where((msg) {
        return !(msg.type == "SYSTEM" && msg.contentText.contains("left the call"));
      }).toList();

      final myId = widget.currentUser.id.toString();
      for (final msg in filteredItems) {
        if (msg.senderId != myId && msg.deliveryState != 'DELIVERED' && msg.deliveryState != 'READ') {
          widget.socketService.markMessageDelivered(msg.conversationId, msg.id);
        }
      }

      if (pageKey == null) {
        // Cache the first page messages locally
        final messagesJson = filteredItems.map((m) => m.toJson()).toList();
        LocalCacheService.instance.saveMessages(
          widget.conversation.conversationId,
          messagesJson,
        ).catchError((e) {
          debugPrint("Error caching messages locally: $e");
        });

        // Update in-memory static cache
        _conversationMessagesCache[widget.conversation.conversationId] = filteredItems;

        // Atomic update of the first page to replace cached/existing items without triggering recursive loops
        _pagingController.value = PagingState<String?, MessageItem>(
          nextPageKey: result.hasNextPage ? result.cursor : null,
          error: null,
          itemList: filteredItems,
        );
      } else {
        if (result.hasNextPage) {
          _pagingController.appendPage(filteredItems, result.cursor);
        } else {
          _pagingController.appendLastPage(filteredItems);
        }
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
          AppToast.show(
            context,
            message: "Dịch vụ định vị đã bị tắt. Vui lòng bật GPS.",
            type: AppToastType.warning,
          );
        }
        return;
      }

      permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          if (mounted) {
            AppToast.show(
              context,
              message: "Quyền truy cập vị trí bị từ chối",
              type: AppToastType.warning,
            );
          }
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        if (mounted) {
          AppToast.show(
            context,
            message: "Quyền truy cập vị trí bị từ chối vĩnh viễn. Vui lòng bật trong cài đặt.",
            type: AppToastType.error,
          );
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
        AppToast.show(
          context,
          message: "Lỗi lấy vị trí: $e",
          type: AppToastType.error,
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _sendMessage(
      {required String text, List<_PendingAttachment> attachments = const []}) async {
    if (text.isEmpty && attachments.isEmpty) return;

    // Reset replying state locally
    setState(() => _replyingTo = null);

    if (mounted) setState(() => _sending = true);

    try {
      // 1. Send TEXT-only messages synchronously
      if (text.isNotEmpty && attachments.isEmpty) {
        final clientMsgId = "client_${DateTime.now().microsecondsSinceEpoch}";
        final actualMsg = await widget.conversationService.sendMessage(
          widget.conversation.conversationId,
          content: text,
          clientMessageId: clientMsgId,
          type: "TEXT",
          replyTo: _replyingTo?.id,
        );

        if (mounted) {
          final currentItems = _pagingController.itemList ?? [];
          final exists = currentItems.any((m) => m.id == actualMsg.id || 
              (actualMsg.clientMessageId != null && m.clientMessageId == actualMsg.clientMessageId));
          if (!exists) {
            setState(() {
              _pagingController.itemList = [actualMsg, ...currentItems];
            });
          }
        }
      }

      // 2. Send attachments synchronously (pre-existing web URLs like stickers/gifs, or local files)
      for (final attachment in attachments) {
        final clientMsgId = "client_${DateTime.now().microsecondsSinceEpoch}";
        final isFirst = attachments.indexOf(attachment) == 0;
        final messageContent = (isFirst && text.isNotEmpty) ? text : "";
        final isUrl = attachment.path.startsWith("http://") || attachment.path.startsWith("https://");

        if (isUrl) {
          final actualMsg = await widget.conversationService.sendMessage(
            widget.conversation.conversationId,
            content: messageContent,
            clientMessageId: clientMsgId,
            type: attachment.type,
            attachmentUrl: attachment.path,
            replyTo: isFirst ? _replyingTo?.id : null,
          );

          if (mounted) {
            final currentItems = _pagingController.itemList ?? [];
            final exists = currentItems.any((m) => m.id == actualMsg.id || 
                (actualMsg.clientMessageId != null && m.clientMessageId == actualMsg.clientMessageId));
            if (!exists) {
              setState(() {
                _pagingController.itemList = [actualMsg, ...currentItems];
              });
            }
          }
        } else {
          // Local files
          final uploadResult = await widget.uploadService.uploadMedia(
            filePath: attachment.path,
            fileName: attachment.name,
            mimeType: attachment.mimeType,
            target: "MESSAGE",
            entityId: widget.conversation.conversationId,
          );

          final actualMsg = await widget.conversationService.sendMessage(
            widget.conversation.conversationId,
            content: messageContent,
            clientMessageId: clientMsgId,
            type: attachment.type,
            attachmentUrl: uploadResult.url,
            attachmentKey: uploadResult.key,
            replyTo: isFirst ? _replyingTo?.id : null,
          );

          if (mounted) {
            final items = _pagingController.itemList;
            if (items != null) {
              final newList = List<MessageItem>.from(items);
              final finalMsg = actualMsg.copyWith(clientMessageId: clientMsgId);
              final exists = newList.any((m) => m.id == finalMsg.id || 
                  (finalMsg.clientMessageId != null && m.clientMessageId == finalMsg.clientMessageId));
              if (!exists) {
                newList.insert(0, finalMsg);
                setState(() {
                  _pagingController.itemList = newList;
                });
              }
            }
          }
        }
      }
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        final errorMsg = e.toString().contains("upload") || e.toString().contains("tải lên")
            ? "Lỗi tải lên tệp: $e"
            : "Lỗi gửi tin nhắn: $e";
        AppToast.show(
          context,
          message: errorMsg,
          type: AppToastType.error,
        );
      }
      rethrow;
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _pinMessage(String messageId) async {
    try {
      await widget.conversationService.pinMessage(
        widget.conversation.conversationId,
        messageId,
      );
      _loadPinnedMessages();
      AppToast.show(
        context,
        message: "Đã ghim tin nhắn thành công!",
        type: AppToastType.success,
      );
    } catch (e) {
      AppToast.show(
        context,
        message: "Không thể ghim tin nhắn: $e",
        type: AppToastType.error,
      );
    }
  }

  Future<void> _unpinMessage(String messageId) async {
    try {
      await widget.conversationService.unpinMessage(
        widget.conversation.conversationId,
        messageId,
      );
      _loadPinnedMessages();
      AppToast.show(
        context,
        message: "Đã bỏ ghim tin nhắn!",
        type: AppToastType.success,
      );
    } catch (e) {
      AppToast.show(
        context,
        message: "Không thể bỏ ghim: $e",
        type: AppToastType.error,
      );
    }
  }

  void _showMessageActions(MessageItem message) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
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
                      color: isDark ? const Color(0xFF334155) : Colors.grey[300],
                      borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 16),
              _buildReactionRow(message),
              Divider(color: isDark ? const Color(0xFF334155) : null),
              ListTile(
                leading: const Icon(Icons.reply, color: Color(0xFF7C3AED)),
                title: Text("Trả lời", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                onTap: () {
                  Navigator.pop(context);
                  setState(() => _replyingTo = message);
                },
              ),
              ListTile(
                leading: const Icon(Icons.copy, color: Color(0xFF7C3AED)),
                title: Text("Sao chép", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                onTap: () {
                  Navigator.pop(context);
                  Clipboard.setData(ClipboardData(text: message.contentText));
                  AppToast.show(
                    context,
                    message: "Đã sao chép",
                    type: AppToastType.success,
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.info_outline, color: Color(0xFF7C3AED)),
                title: Text("Thông tin tin nhắn", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                onTap: () {
                  Navigator.pop(context);
                  _showMessageInfoDialog(message);
                },
              ),
              ListTile(
                leading:
                    const Icon(Icons.forward_rounded, color: Color(0xFF7C3AED)),
                title: Text("Chuyển tiếp", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                onTap: () {
                  Navigator.pop(context);
                  _showForwardDialog(message);
                },
              ),
              (() {
                final isPinned = _pinnedMessages.any((m) => m.id == message.id);
                return ListTile(
                  leading: Icon(
                    isPinned ? Icons.pin_drop_outlined : Icons.push_pin_outlined,
                    color: isPinned ? Colors.orange : const Color(0xFF7C3AED),
                  ),
                  title: Text(
                    isPinned ? "Bỏ ghim tin nhắn" : "Ghim tin nhắn",
                    style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    if (isPinned) {
                      _unpinMessage(message.id);
                    } else {
                      _pinMessage(message.id);
                    }
                  },
                );
              })(),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        height: MediaQuery.of(context).size.height * 0.7,
        decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24))),
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF334155) : Colors.grey[300],
                    borderRadius: BorderRadius.circular(2))),
            Padding(
                padding: const EdgeInsets.all(16),
                child: Text("Chuyển tiếp đến",
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: isDark ? Colors.white : Colors.black87))),
            Expanded(
              child: FutureBuilder<PaginatedResult<ConversationSummary>>(
                future: widget.conversationService.listConversations(limit: 50),
                builder: (context, snapshot) {
                  if (!snapshot.hasData) {
                    return Skeletonizer(
                      enabled: true,
                      child: ListView.builder(
                        itemCount: 5,
                        itemBuilder: (context, idx) => ListTile(
                          leading: const CircleAvatar(radius: 20),
                          title: Container(
                            width: 150,
                            height: 16,
                            decoration: BoxDecoration(
                              color: Colors.grey,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                        ),
                      ),
                    );
                  }
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
                        title: Text(c.title, style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
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
      AppToast.show(
        context,
        message: "Đã chuyển tiếp",
        type: AppToastType.success,
      );
    }).catchError((e) {
      AppToast.show(
        context,
        message: "Lỗi: $e",
        type: AppToastType.error,
      );
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      body: Column(
        children: [
          _buildHeader(),
          _buildActiveCallBanner(),
          _buildPinnedMessagesBar(),
          _buildSearchPanel(),
          Expanded(child: _buildMessageList()),
          _buildTypingIndicator(),
          if (_replyingTo != null) _buildReplyPreview(),
          if (_isPeerBlocked)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              color: isDark ? const Color(0xFF1E293B) : Colors.white,
              child: SafeArea(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.block, color: Colors.orange.shade400, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        "Bạn đã chặn người dùng này.",
                        style: TextStyle(
                          color: isDark ? Colors.white70 : Colors.black87,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => _unblockUserDirectly(),
                      child: const Text(
                        "Bỏ chặn",
                        style: TextStyle(
                          color: Color(0xFF7C3AED),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            )
          else
            ChatComposer(
              onSend: _sendMessage,
              onLocationRequest: _sendLocation,
              uploadService: widget.uploadService,
              socketService: widget.socketService,
              groupService: widget.groupService,
              userService: widget.userService,
              conversationId: widget.conversation.conversationId,
              sending: _sending,
              isGroup: widget.conversation.isGroup,
            ),
        ],
      ),
    );
  }

  Widget _buildActiveCallBanner() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return ValueListenableBuilder<CallState>(
      valueListenable: widget.webRTCService.callState,
      builder: (context, state, _) {
        final localCallActive = state != CallState.idle &&
            widget.webRTCService.currentConversationId ==
                widget.conversation.conversationId;
                
        final remoteCallActive = !localCallActive && _activeCallInfo != null;
        
        if (!localCallActive && !remoteCallActive) {
          return const SizedBox.shrink();
        }
        
        final isVideo = localCallActive 
            ? !widget.webRTCService.isAudioOnly
            : (_activeCallInfo?['isVideo'] ?? true);
            
        final bannerColor = localCallActive
            ? Colors.green.withOpacity(0.15)
            : const Color(0xFF7C3AED).withOpacity(0.15);
            
        final iconColor = localCallActive ? Colors.green : const Color(0xFF7C3AED);
        
        return Container(
          color: bannerColor,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Icon(
                localCallActive 
                    ? (isVideo ? Icons.videocam : Icons.phone_in_talk)
                    : (isVideo ? Icons.video_call : Icons.phone),
                color: iconColor,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      localCallActive
                          ? (state == CallState.ringing 
                              ? "Cuộc gọi đang chờ" 
                              : "Bạn đang trong cuộc gọi")
                          : "Cuộc gọi đang diễn ra",
                      style: TextStyle(
                        fontWeight: FontWeight.bold, 
                        color: iconColor,
                      ),
                    ),
                    Text(
                      localCallActive 
                          ? 'Chạm để quay lại cuộc gọi' 
                          : 'Nhấp để tham gia cuộc gọi',
                      style: TextStyle(
                        fontSize: 12, 
                        color: isDark ? Colors.grey[400] : Colors.black54,
                      ),
                    ),
                  ],
                ),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: iconColor,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
                onPressed: () {
                  if (localCallActive) {
                    widget.webRTCService.isCallMinimized.value = false;
                    Navigator.of(context, rootNavigator: true).push(
                      MaterialPageRoute(
                        builder: (_) => CallScreen(
                          webRTCService: widget.webRTCService,
                          conversation: widget.conversation,
                          currentUser: widget.currentUser,
                          launchedFromChatDetail: true,
                        ),
                      ),
                    );
                  } else {
                    _startCall(video: isVideo);
                  }
                },
                child: Text(localCallActive ? 'Quay lại' : 'Tham gia'),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildHeader() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final peerId = widget.conversation.getPeerId(widget.currentUser?.id);
    final resolvedTitle = (!widget.conversation.isGroup && peerId != null && _aliases.containsKey(peerId))
        ? _aliases[peerId]!
        : widget.conversation.isGroup
            ? (_fetchedGroupName ?? widget.conversation.title)
            : widget.conversation.title;

    return Container(
      padding: EdgeInsets.only(
          top: MediaQuery.of(context).padding.top,
          left: 8,
          right: 8,
          bottom: 8),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0F172A) : Colors.white,
        boxShadow: [
          BoxShadow(
              color: isDark ? Colors.transparent : Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, 2))
        ],
      ),
      child: Row(
        children: [
          IconButton(
              icon: Icon(Icons.arrow_back, color: isDark ? Colors.white : const Color(0xFF1E1B4B)),
              onPressed: () => Navigator.pop(context)),
          UserAvatar(
            userId: widget.conversation.isGroup ? null : widget.conversation.getPeerId(widget.currentUser?.id),
            groupId: widget.conversation.isGroup ? widget.conversation.groupId : null,
            initialAvatarUrl: widget.conversation.isGroup ? widget.conversation.groupAvatarUrl : (widget.conversation.peerAvatarUrl ?? widget.conversation.avatarUrl),
            initialDisplayName: resolvedTitle,
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
              onTap: () async {
                await Navigator.of(context, rootNavigator: true).push(
                  MaterialPageRoute(
                    builder: (_) => ConversationInfoScreen(
                      conversation: widget.conversation,
                      conversationService: widget.conversationService,
                    ),
                  ),
                );
                _loadAliases();
                _checkBlockStatus();
              },
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(resolvedTitle,
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: isDark ? Colors.white : const Color(0xFF1E1B4B)),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  _buildStatusText(),
                ],
              ),
            ),
          ),
          IconButton(
            icon: Icon(
              _showSearchPanel ? Icons.search_off : Icons.search,
              color: _showSearchPanel ? Colors.redAccent : const Color(0xFF7C3AED),
            ),
            onPressed: () {
              setState(() {
                _showSearchPanel = !_showSearchPanel;
                if (!_showSearchPanel) {
                  _isSearching = false;
                  _searchQueryController.clear();
                  _searchType = null;
                  _searchFromUserId = null;
                  _searchAfterDate = null;
                  _searchBeforeDate = null;
                  _pagingController.refresh();
                } else {
                  _loadConversationMembers();
                }
              });
            },
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
            onPressed: () {
              if (widget.conversation.isGroup) {
                final groupId = widget.conversation.groupId ?? widget.conversation.conversationId.replaceAll("group:", "");
                Navigator.of(context, rootNavigator: true).push(
                  MaterialPageRoute(
                    builder: (_) => GroupSettingsScreen(
                      groupId: groupId,
                      groupName: resolvedTitle,
                    ),
                  ),
                ).then((_) {
                  _loadGroupName();
                });
              } else {
                Navigator.of(context, rootNavigator: true).push(
                  MaterialPageRoute(
                    builder: (_) => ConversationInfoScreen(
                      conversation: widget.conversation,
                      conversationService: widget.conversationService,
                    ),
                  ),
                ).then((_) {
                  _loadAliases();
                  _checkBlockStatus();
                });
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildPinnedMessagesBar() {
    if (_pinnedMessages.isEmpty) return const SizedBox.shrink();

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final latestPin = _pinnedMessages.last;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B).withOpacity(0.8) : Colors.amber.shade50.withOpacity(0.9),
        border: Border(
          bottom: BorderSide(
            color: isDark ? const Color(0xFF334155) : Colors.amber.shade200,
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.push_pin, color: Colors.orange, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: GestureDetector(
              onTap: _showPinnedMessagesDialog,
              child: Text(
                "Tin nhắn đã ghim: ${latestPin.contentText.isNotEmpty ? latestPin.contentText : latestPin.attachmentName}",
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: isDark ? Colors.white70 : Colors.black87,
                ),
              ),
            ),
          ),
          if (_pinnedMessages.length > 1)
            GestureDetector(
              onTap: _showPinnedMessagesDialog,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.orange.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  "+${_pinnedMessages.length - 1}",
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: Colors.orange,
                  ),
                ),
              ),
            ),
          const SizedBox(width: 8),
          IconButton(
            icon: Icon(
              Icons.close,
              size: 16,
              color: isDark ? Colors.white54 : Colors.black54,
            ),
            onPressed: () => _unpinMessage(latestPin.id),
          ),
        ],
      ),
    );
  }

  void _showPinnedMessagesDialog() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        title: Row(
          children: [
            const Icon(Icons.push_pin, color: Colors.orange),
            const SizedBox(width: 8),
            Text(
              "Tin nhắn đã ghim",
              style: TextStyle(
                color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        content: Container(
          width: double.maxFinite,
          constraints: const BoxConstraints(maxHeight: 300),
          child: _pinnedMessages.isEmpty
              ? const Center(child: Text("Chưa có tin nhắn ghim nào"))
              : ListView.separated(
                  shrinkWrap: true,
                  itemCount: _pinnedMessages.length,
                  separatorBuilder: (_, __) => Divider(color: isDark ? const Color(0xFF334155) : null),
                  itemBuilder: (context, index) {
                    final msg = _pinnedMessages[index];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        msg.senderName,
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: isDark ? Colors.white70 : Colors.black87,
                          fontSize: 12,
                        ),
                      ),
                      subtitle: Text(
                        msg.contentText.isNotEmpty ? msg.contentText : msg.attachmentName,
                        style: TextStyle(
                          color: isDark ? Colors.white60 : Colors.black54,
                          fontSize: 14,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.pin_drop_outlined, color: Colors.orange, size: 20),
                            onPressed: () {
                              Navigator.pop(context);
                              _unpinMessage(msg.id);
                            },
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              "Đóng",
              style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchPanel() {
    if (!_showSearchPanel) return const SizedBox.shrink();

    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    // Member names map for sender selection
    final List<DropdownMenuItem<String>> memberItems = [
      DropdownMenuItem(
        value: null,
        child: Text("Tất cả người gửi", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
      ),
    ];
    for (final member in _conversationMembers) {
      if (member is Map) {
        final Map<String, dynamic> memberMap = Map<String, dynamic>.from(member);
        final parsed = _InviteCandidate.fromJson(memberMap);
        final String uid = parsed.userId;
        final String name = parsed.displayName;
        if (uid.isNotEmpty) {
          memberItems.add(DropdownMenuItem(
            value: uid,
            child: Text(name, style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
          ));
        }
      }
    }

    final types = {
      null: "Tất cả",
      "TEXT": "Văn bản",
      "IMAGE": "Hình ảnh",
      "VIDEO": "Video",
      "AUDIO": "Ghi âm",
      "DOC": "Tài liệu"
    };

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        border: Border(
          bottom: BorderSide(
            color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _searchQueryController,
            style: TextStyle(color: isDark ? Colors.white : Colors.black87, fontSize: 14),
            decoration: InputDecoration(
              hintText: "Tìm kiếm từ khóa...",
              hintStyle: TextStyle(color: isDark ? Colors.grey[500] : Colors.grey[600]),
              prefixIcon: Icon(Icons.search, color: const Color(0xFF7C3AED), size: 20),
              suffixIcon: _searchQueryController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 18),
                      onPressed: () {
                        _searchQueryController.clear();
                        _applySearch();
                      },
                    )
                  : null,
              contentPadding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
              filled: true,
              fillColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide.none,
              ),
            ),
            onChanged: (val) {
              setState(() {});
              _applySearch();
            },
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 32,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: types.entries.map((entry) {
                final isSelected = _searchType == entry.key;
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text(
                      entry.value,
                      style: TextStyle(
                        fontSize: 12,
                        color: isSelected
                            ? Colors.white
                            : (isDark ? Colors.white70 : Colors.black87),
                      ),
                    ),
                    selected: isSelected,
                    selectedColor: const Color(0xFF7C3AED),
                    checkmarkColor: Colors.white,
                    backgroundColor: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9),
                    onSelected: (selected) {
                      setState(() {
                        _searchType = selected ? entry.key : null;
                      });
                      _applySearch();
                    },
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 40,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      isExpanded: true,
                      value: _searchFromUserId,
                      dropdownColor: isDark ? const Color(0xFF1E293B) : Colors.white,
                      items: memberItems,
                      onChanged: (val) {
                        setState(() {
                          _searchFromUserId = val;
                        });
                        _applySearch();
                      },
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _buildDatePickerButton(
                  label: _searchAfterDate != null
                      ? DateFormat("dd/MM").format(_searchAfterDate!)
                      : "Từ ngày",
                  icon: Icons.date_range_outlined,
                  onTap: () => _pickSearchDate(isAfter: true),
                  onClear: _searchAfterDate != null
                      ? () {
                          setState(() => _searchAfterDate = null);
                          _applySearch();
                        }
                      : null,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildDatePickerButton(
                  label: _searchBeforeDate != null
                      ? DateFormat("dd/MM").format(_searchBeforeDate!)
                      : "Đến ngày",
                  icon: Icons.date_range,
                  onTap: () => _pickSearchDate(isAfter: false),
                  onClear: _searchBeforeDate != null
                      ? () {
                          setState(() => _searchBeforeDate = null);
                          _applySearch();
                        }
                      : null,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDatePickerButton({
    required String label,
    required IconData icon,
    required VoidCallback onTap,
    required VoidCallback? onClear,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      height: 40,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(8),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: [
              Icon(icon, size: 16, color: const Color(0xFF7C3AED)),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark ? Colors.white70 : Colors.black87,
                  ),
                ),
              ),
              if (onClear != null) ...[
                const SizedBox(width: 4),
                GestureDetector(
                  onTap: onClear,
                  child: Icon(Icons.close, size: 14, color: isDark ? Colors.white54 : Colors.black54),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickSearchDate({required bool isAfter}) async {
    final initialDate = DateTime.now();
    final firstDate = DateTime(2020);
    final lastDate = DateTime(2030);

    final selected = await showDatePicker(
      context: context,
      initialDate: isAfter
          ? (_searchAfterDate ?? initialDate)
          : (_searchBeforeDate ?? initialDate),
      firstDate: firstDate,
      lastDate: lastDate,
    );

    if (selected != null) {
      setState(() {
        if (isAfter) {
          _searchAfterDate = selected;
        } else {
          _searchBeforeDate = selected;
        }
      });
      _applySearch();
    }
  }

  void _applySearch() {
    final query = _searchQueryController.text.trim();
    final hasSearch = query.isNotEmpty ||
        _searchType != null ||
        _searchFromUserId != null ||
        _searchAfterDate != null ||
        _searchBeforeDate != null;

    setState(() {
      _isSearching = hasSearch;
    });

    _pagingController.refresh();
  }

  Widget _buildReplyPreview() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          border: Border(top: BorderSide(color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)))),
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
                Text("Đang trả lời ${_aliases[_replyingTo!.senderId] ?? _replyingTo!.senderName}",
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF7C3AED))),
                Text(_replyingTo!.contentText,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, color: isDark ? Colors.grey[300] : Colors.grey[600])),
              ],
            ),
          ),
          IconButton(
              icon: Icon(Icons.close, size: 20, color: isDark ? Colors.white : Colors.black),
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

  Widget _buildTypingIndicator() {
    if (_typingUsers.isEmpty) return const SizedBox.shrink();

    final names = _typingUsers.values.toList();
    String text = "";
    if (names.length == 1) {
      text = "${names[0]} đang nhập...";
    } else if (names.length == 2) {
      text = "${names[0]} và ${names[1]} đang nhập...";
    } else {
      text = "${names.length} người đang nhập...";
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      alignment: Alignment.centerLeft,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.more_horiz,
            size: 16,
            color: Color(0xFF7C3AED),
          ),
          const SizedBox(width: 8),
          Text(
            text,
            style: const TextStyle(
              fontSize: 12,
              color: Colors.grey,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ),
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
          final items = _pagingController.itemList ?? [];
          final isMine = message.senderId == widget.currentUser.id.toString();
          final senderAlias = _aliases[message.senderId];
          
          // Determine if we should show the read receipt avatar under this message
          bool showReadReceipt = false;
          String? peerId;
          String? peerAvatarUrl;
          String? peerDisplayName;
          
          if (isMine && !widget.conversation.isGroup) {
            peerId = widget.conversation.getPeerId(widget.currentUser.id.toString());
            if (peerId != null) {
              peerAvatarUrl = widget.conversation.peerAvatarUrl ?? widget.conversation.avatarUrl;
              peerDisplayName = widget.conversation.title;
              
              if (_conversationMembers.isNotEmpty) {
                try {
                  final peerMember = _conversationMembers.firstWhere(
                    (m) => m["userId"]?.toString() == peerId,
                    orElse: () => null,
                  );
                  if (peerMember != null) {
                    peerAvatarUrl = peerMember["avatarUrl"]?.toString() ?? peerAvatarUrl;
                    peerDisplayName = peerMember["displayName"]?.toString() ?? peerDisplayName;
                  }
                } catch (_) {}
              }
              
              // Find the index of the most recent read message sent by me
              int latestReadIdx = -1;
              for (int i = 0; i < items.length; i++) {
                final m = items[i];
                if (m.senderId == widget.currentUser.id.toString() && m.deliveryState?.toUpperCase() == 'READ') {
                  latestReadIdx = i;
                  break;
                }
              }
              
              showReadReceipt = latestReadIdx == index;
            }
          }
          
          return ChatMessageBubble(
            message: message,
            isMine: isMine,
            senderAlias: senderAlias,
            reactions: _messageReactions[message.id] ?? [],
            userService: widget.userService,
            onLongPress: () => _showMessageActions(message),
            currentUserName: widget.currentUser.fullName,
            showReadReceipt: showReadReceipt,
            peerId: peerId,
            peerAvatarUrl: peerAvatarUrl,
            peerDisplayName: peerDisplayName,
            onReplyTap: message.replyTo != null
                ? () => _scrollToMessage(message.replyTo!)
                : null,
          );
        },
        firstPageProgressIndicatorBuilder: (_) => Skeletonizer(
          enabled: true,
          child: ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: 6,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final isMine = index % 2 == 0;
              return Align(
                alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: isMine ? const Color(0xFF7C3AED) : Colors.grey[300],
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(20),
                      topRight: const Radius.circular(20),
                      bottomLeft: Radius.circular(isMine ? 20 : 4),
                      bottomRight: Radius.circular(isMine ? 4 : 20),
                    ),
                  ),
                  child: const Text("Đây là nội dung tin nhắn giả lập để hiển thị skeleton"),
                ),
              );
            },
          ),
        ),
        noItemsFoundIndicatorBuilder: (_) => const Center(
            child: Text("Chưa có tin nhắn nào",
                style: TextStyle(color: Colors.grey))),
      ),
    );
  }

  void _showMessageInfoDialog(MessageItem message) {
    showDialog(
      context: context,
      builder: (context) => _MessageInfoDialog(
        messageId: message.id,
        pagingController: _pagingController,
        conversation: widget.conversation,
        currentUser: widget.currentUser,
      ),
    );
  }
}

class ChatComposer extends StatefulWidget {
  final Future<void> Function(
      {required String text, List<_PendingAttachment> attachments}) onSend;
  final VoidCallback onLocationRequest;
  final UploadService uploadService;
  final SocketService socketService;
  final GroupService groupService;
  final UserService userService;
  final String conversationId;
  final bool sending;
  final bool isGroup;

  const ChatComposer(
      {super.key,
      required this.onSend,
      required this.onLocationRequest,
      required this.uploadService,
      required this.socketService,
      required this.groupService,
      required this.userService,
      required this.conversationId,
      required this.sending,
      required this.isGroup});

  @override
  State<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends State<ChatComposer> {
  final _textController = TextEditingController();
  final _audioRecorder = AudioRecorder();
  final List<_PendingAttachment> _attachments = [];
  bool _isRecording = false;
  int _recordDuration = 0;
  Timer? _timer;
  Timer? _typingTimer;
  bool _isTypingSent = false;
  String _previousText = "";
  List<_InviteCandidate> _groupMembers = [];
  bool _loadingMembers = false;

  AudioPlayer? _voiceAudioPlayer;
  bool _isConfirmingVoice = false;
  String? _voicePath;
  bool _isVoicePlaying = false;
  Duration _voicePlayDuration = Duration.zero;
  Duration _voicePlayPosition = Duration.zero;

  @override
  void initState() {
    super.initState();
    _textController.addListener(() {
      if (mounted) {
        final currentText = _textController.text;
        if (currentText != _previousText) {
          _previousText = currentText;
          setState(() {});
          _handleTyping();
        }
      }
    });
    if (widget.isGroup) {
      _loadGroupMembers();
    }
  }

  Future<void> _loadGroupMembers() async {
    setState(() => _loadingMembers = true);
    try {
      var groupId = widget.conversationId;
      if (groupId.startsWith("group:")) {
        groupId = groupId.substring(6);
      } else if (groupId.startsWith("group#")) {
        groupId = groupId.substring(6);
      } else if (groupId.startsWith("grp#")) {
        groupId = groupId.substring(4);
      } else if (groupId.startsWith("GRP#")) {
        groupId = groupId.substring(4);
      }
      final membersRaw = await widget.groupService.listMembers(groupId);
      
      // Hydrate profiles in parallel to resolve names and avatars
      final populatedMembers = await Future.wait(membersRaw.map((m) async {
        final userId = m['userId']?.toString();
        if (userId == null) return m;
        try {
          final profile = await widget.userService.getUserById(userId);
          return {
            ...m,
            'fullName': profile.fullName,
            'displayName': profile.fullName,
            'avatarUrl': profile.avatarUrl,
          };
        } catch (_) {
          return m;
        }
      }));

      if (mounted) {
        setState(() {
          _groupMembers = populatedMembers.map(_InviteCandidate.fromJson).toList();
          _loadingMembers = false;
        });
      }
    } catch (e) {
      debugPrint("Error loading members for mentions: $e");
      if (mounted) {
        setState(() => _loadingMembers = false);
      }
    }
  }

  String? _getMentionQuery() {
    final text = _textController.text;
    final selection = _textController.selection;
    if (!selection.isValid || selection.baseOffset <= 0) return null;
    
    final cursorPosition = selection.baseOffset;
    final textBeforeCursor = text.substring(0, cursorPosition);
    
    final lastAtSignIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtSignIndex == -1) return null;
    
    if (lastAtSignIndex > 0) {
      final charBeforeAt = textBeforeCursor[lastAtSignIndex - 1];
      if (charBeforeAt != ' ' && charBeforeAt != '\n') {
        return null;
      }
    }
    
    final textFromAtToCursor = textBeforeCursor.substring(lastAtSignIndex + 1);
    if (textFromAtToCursor.contains(' ') || textFromAtToCursor.contains('\n')) {
      return null;
    }
    
    return textFromAtToCursor;
  }

  void _applyMention(_InviteCandidate member) {
    final text = _textController.text;
    final selection = _textController.selection;
    if (!selection.isValid) return;

    final cursorPosition = selection.baseOffset;
    final textBeforeCursor = text.substring(0, cursorPosition);
    final textAfterCursor = text.substring(cursorPosition);

    final lastAtSignIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtSignIndex == -1) return;

    final newMention = "@${member.displayName} ";
    final newTextBeforeCursor = textBeforeCursor.replaceRange(
      lastAtSignIndex,
      cursorPosition,
      newMention,
    );

    final newText = newTextBeforeCursor + textAfterCursor;
    final newCursorPosition = lastAtSignIndex + newMention.length;

    _textController.value = TextEditingValue(
      text: newText,
      selection: TextSelection.collapsed(offset: newCursorPosition),
    );
  }

  void _applyAllMention() {
    final text = _textController.text;
    final selection = _textController.selection;
    if (!selection.isValid) return;

    final cursorPosition = selection.baseOffset;
    final textBeforeCursor = text.substring(0, cursorPosition);
    final textAfterCursor = text.substring(cursorPosition);

    final lastAtSignIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtSignIndex == -1) return;

    const newMention = "@all ";
    final newTextBeforeCursor = textBeforeCursor.replaceRange(
      lastAtSignIndex,
      cursorPosition,
      newMention,
    );

    final newText = newTextBeforeCursor + textAfterCursor;
    final newCursorPosition = lastAtSignIndex + newMention.length;

    _textController.value = TextEditingValue(
      text: newText,
      selection: TextSelection.collapsed(offset: newCursorPosition),
    );
  }

  Widget _buildMentionSuggestions() {
    final query = _getMentionQuery() ?? "";
    final filtered = _groupMembers.where((member) {
      final name = member.displayName.toLowerCase();
      return name.contains(query.toLowerCase());
    }).toList();

    final showAllOption = query.isEmpty ||
        "all".startsWith(query.toLowerCase()) ||
        "tất cả".startsWith(query.toLowerCase()) ||
        "everyone".startsWith(query.toLowerCase());

    if (filtered.isEmpty && !showAllOption) return const SizedBox.shrink();

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final totalCount = filtered.length + (showAllOption ? 1 : 0);

    return Container(
      constraints: const BoxConstraints(maxHeight: 200),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? Colors.grey.shade800 : Colors.grey.shade200,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 12,
            offset: const Offset(0, -2),
          )
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: ListView.separated(
          shrinkWrap: true,
          padding: EdgeInsets.zero,
          itemCount: totalCount,
          separatorBuilder: (_, __) => Divider(
            height: 1,
            color: isDark ? Colors.grey.shade800 : Colors.grey.shade100,
          ),
          itemBuilder: (context, index) {
            if (showAllOption && index == 0) {
              return ListTile(
                dense: true,
                leading: CircleAvatar(
                  radius: 14,
                  backgroundColor: isDark
                      ? const Color(0xFF7C3AED).withOpacity(0.2)
                      : const Color(0xFF7C3AED).withOpacity(0.1),
                  child: const Icon(
                    Icons.groups_outlined,
                    size: 16,
                    color: Color(0xFF7C3AED),
                  ),
                ),
                title: Text(
                  "Tất cả mọi người (@all)",
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.white : Colors.black87,
                  ),
                ),
                subtitle: Text(
                  "Nhắc tên cả nhóm",
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark ? Colors.grey[400] : Colors.grey[600],
                  ),
                ),
                onTap: _applyAllMention,
              );
            }

            final member = filtered[showAllOption ? index - 1 : index];
            return ListTile(
              dense: true,
              leading: UserAvatar(
                userId: member.userId,
                initialAvatarUrl: member.avatarUrl,
                initialDisplayName: member.displayName,
                radius: 14,
              ),
              title: Text(
                member.displayName,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: isDark ? Colors.white : Colors.black87,
                ),
              ),
              subtitle: Text(
                member.roleLabel,
                style: TextStyle(
                  fontSize: 11,
                  color: isDark ? Colors.grey[400] : Colors.grey[600],
                ),
              ),
              onTap: () => _applyMention(member),
            );
          },
        ),
      ),
    );
  }

  void _handleTyping() {
    if (_textController.text.trim().isEmpty) {
      if (_isTypingSent) {
        widget.socketService.stopTyping(widget.conversationId);
        _isTypingSent = false;
      }
      _typingTimer?.cancel();
      return;
    }

    if (!_isTypingSent) {
      widget.socketService.startTyping(widget.conversationId);
      _isTypingSent = true;
    }

    _typingTimer?.cancel();
    _typingTimer = Timer(const Duration(seconds: 3), () {
      if (mounted && _isTypingSent) {
        widget.socketService.stopTyping(widget.conversationId);
        _isTypingSent = false;
      }
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    _audioRecorder.dispose();
    _timer?.cancel();
    _typingTimer?.cancel();
    _voiceAudioPlayer?.dispose();
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
      setState(() {
        _isConfirmingVoice = true;
        _voicePath = path;
        _isVoicePlaying = false;
        _voicePlayDuration = Duration.zero;
        _voicePlayPosition = Duration.zero;
      });

      _voiceAudioPlayer?.dispose();
      _voiceAudioPlayer = AudioPlayer();

      _voiceAudioPlayer!.onDurationChanged.listen((d) {
        if (mounted) setState(() => _voicePlayDuration = d);
      });
      _voiceAudioPlayer!.onPositionChanged.listen((p) {
        if (mounted) setState(() => _voicePlayPosition = p);
      });
      _voiceAudioPlayer!.onPlayerComplete.listen((_) {
        if (mounted) setState(() => _isVoicePlaying = false);
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

  void _togglePreviewPlay() async {
    if (_voicePath == null || _voiceAudioPlayer == null) return;
    
    if (_isVoicePlaying) {
      await _voiceAudioPlayer!.pause();
      setState(() => _isVoicePlaying = false);
    } else {
      await _voiceAudioPlayer!.play(DeviceFileSource(_voicePath!));
      setState(() => _isVoicePlaying = true);
    }
  }

  void _discardVoicePreview() async {
    if (_voiceAudioPlayer != null) {
      await _voiceAudioPlayer!.stop();
      _voiceAudioPlayer!.dispose();
      _voiceAudioPlayer = null;
    }
    
    if (_voicePath != null) {
      final file = File(_voicePath!);
      if (await file.exists()) {
        try {
          await file.delete();
        } catch (_) {}
      }
    }
    
    setState(() {
      _isConfirmingVoice = false;
      _voicePath = null;
      _isVoicePlaying = false;
      _voicePlayDuration = Duration.zero;
      _voicePlayPosition = Duration.zero;
    });
  }

  void _sendVoicePreview() async {
    if (_voicePath == null) return;
    
    if (_voiceAudioPlayer != null) {
      await _voiceAudioPlayer!.stop();
      _voiceAudioPlayer!.dispose();
      _voiceAudioPlayer = null;
    }

    final path = _voicePath!;
    final name = path.split("/").last;
    
    final attachment = _PendingAttachment(
      path: path,
      name: name,
      type: "AUDIO",
      mimeType: "audio/mp4",
    );

    try {
      await widget.onSend(text: "", attachments: [attachment]);
    } catch (_) {}

    setState(() {
      _isConfirmingVoice = false;
      _voicePath = null;
      _isVoicePlaying = false;
      _voicePlayDuration = Duration.zero;
      _voicePlayPosition = Duration.zero;
    });
  }

  Widget _buildVoiceConfirmationRow(BuildContext context, bool isDark) {
    final remainingTime = _voicePlayDuration - _voicePlayPosition;
    final displayDuration = remainingTime > Duration.zero ? remainingTime : _voicePlayDuration;

    return Container(
      height: 56,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: isDark ? Colors.grey.shade800 : Colors.grey.shade200,
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        children: [
          IconButton(
            icon: Icon(
              _isVoicePlaying ? Icons.pause_circle_filled : Icons.play_circle_filled,
              color: const Color(0xFF7C3AED),
              size: 36,
            ),
            onPressed: _togglePreviewPlay,
          ),
          const SizedBox(width: 4),
          Expanded(
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                trackHeight: 3,
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 12),
                activeTrackColor: const Color(0xFF7C3AED),
                inactiveTrackColor: isDark ? Colors.grey.shade800 : Colors.grey.shade300,
                thumbColor: const Color(0xFF7C3AED),
              ),
              child: Slider(
                value: _voicePlayPosition.inMilliseconds.toDouble(),
                max: _voicePlayDuration.inMilliseconds.toDouble() > 0
                    ? _voicePlayDuration.inMilliseconds.toDouble()
                    : 1.0,
                onChanged: (val) {
                  _voiceAudioPlayer?.seek(Duration(milliseconds: val.toInt()));
                },
              ),
            ),
          ),
          Text(
            _formatDuration(displayDuration.inSeconds),
            style: TextStyle(
              color: isDark ? Colors.grey[400] : Colors.grey[700],
              fontSize: 12,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: _discardVoicePreview,
            child: const Text("Hủy", style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
          ),
          IconButton(
            icon: const Icon(Icons.send_rounded, color: Color(0xFF7C3AED), size: 28),
            onPressed: _sendVoicePreview,
          ),
        ],
      ),
    );
  }

  Future<void> _pickImage(ImageSource source) async {
    final picker = ImagePicker();
    if (source == ImageSource.gallery) {
      final selectedList = await picker.pickMultipleMedia();
      if (selectedList.isEmpty) return;
      setState(() {
        for (var selected in selectedList) {
          final isVideo = selected.path.toLowerCase().endsWith(".mp4") ||
              selected.path.toLowerCase().endsWith(".mov") ||
              selected.path.toLowerCase().endsWith(".avi") ||
              selected.path.toLowerCase().endsWith(".mkv");
          _attachments.add(_PendingAttachment(
            path: selected.path,
            name: selected.name,
            type: isVideo ? "VIDEO" : "IMAGE",
            mimeType: selected.mimeType,
          ));
        }
      });
    } else {
      final selected = await picker.pickImage(source: source);
      if (selected == null) return;
      setState(() {
        _attachments.add(_PendingAttachment(
            path: selected.path,
            name: selected.name,
            type: "IMAGE",
            mimeType: selected.mimeType));
      });
    }
  }

  Future<void> _pickVideo(ImageSource source) async {
    final picker = ImagePicker();
    final selected = await picker.pickVideo(source: source);
    if (selected == null) return;
    setState(() {
      _attachments.add(_PendingAttachment(
          path: selected.path,
          name: selected.name,
          type: "VIDEO",
          mimeType: selected.mimeType));
    });
  }

  Future<void> _pickFile() async {
    final selected = await FilePicker.platform.pickFiles(allowMultiple: true);
    if (selected == null || selected.files.isEmpty) return;
    setState(() {
      for (final file in selected.files) {
        if (file.path == null) continue;
        _attachments.add(_PendingAttachment(
            path: file.path!,
            name: file.name,
            type: "DOC",
            mimeType: lookupMimeType(file.path!)));
      }
    });
  }

  void _showPicker() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showModalBottomSheet(
      context: context,
      backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
                leading: const Icon(Icons.camera_alt, color: Colors.blue),
                title: Text("Chụp ảnh", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage(ImageSource.camera);
                }),
            ListTile(
                leading: const Icon(Icons.videocam, color: Colors.red),
                title: Text("Quay Video", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                onTap: () {
                  Navigator.pop(context);
                  _pickVideo(ImageSource.camera);
                }),
            ListTile(
                leading: const Icon(Icons.image, color: Colors.purple),
                title: Text("Thư viện ảnh/Video", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage(ImageSource.gallery);
                }),
            ListTile(
                leading: const Icon(Icons.attach_file, color: Colors.orange),
                title: Text("Tệp tin", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                onTap: () {
                  Navigator.pop(context);
                  _pickFile();
                }),
            ListTile(
                leading: const Icon(Icons.location_on, color: Colors.green),
                title: Text("Vị trí", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
                onTap: () {
                  Navigator.pop(context);
                  widget.onLocationRequest();
                }),
          ],
        ),
      ),
    );
  }

  void _showGifPicker() {
    GifPickerSheet.show(
      context,
      onGifSelected: (gifUrl) {
        final name = gifUrl.split("/").last;
        widget.onSend(
          text: "",
          attachments: [
            _PendingAttachment(
              path: gifUrl,
              name: name,
              type: "IMAGE",
              mimeType: "image/gif",
            ),
          ],
        );
      },
    );
  }

  void _showStickerPicker() {
    StickerPickerSheet.show(
      context,
      onStickerSelected: (stickerUrl) {
        final name = stickerUrl.split("/").last;
        widget.onSend(
          text: "",
          attachments: [
            _PendingAttachment(
              path: stickerUrl,
              name: name,
              type: "IMAGE",
              mimeType: "image/gif",
            ),
          ],
        );
      },
    );
  }

  Widget _buildComposerButton({
    required Widget icon,
    required VoidCallback? onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 8),
        child: icon,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          boxShadow: [
            BoxShadow(
                color: isDark
                    ? Colors.black.withOpacity(0.2)
                    : Colors.black.withOpacity(0.05),
                blurRadius: 10,
                offset: const Offset(0, -4))
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (widget.isGroup && _getMentionQuery() != null)
              _buildMentionSuggestions(),
            if (_isConfirmingVoice)
              _buildVoiceConfirmationRow(context, isDark)
            else ...[
              if (_attachments.isNotEmpty)
                Container(
                  height: 90,
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    itemCount: _attachments.length,
                    itemBuilder: (context, index) {
                      final att = _attachments[index];
                      final isImage = att.type == "IMAGE" && !att.path.startsWith("http");
                      
                      return Container(
                        width: 80,
                        margin: const EdgeInsets.only(right: 8),
                        child: Stack(
                          children: [
                            Positioned.fill(
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: Container(
                                  decoration: BoxDecoration(
                                    color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9),
                                    border: Border.all(
                                      color: isDark ? const Color(0xFF475569) : const Color(0xFFE2E8F0),
                                    ),
                                  ),
                                  child: isImage
                                      ? Image.file(
                                          File(att.path),
                                          fit: BoxFit.cover,
                                        )
                                      : Center(
                                          child: Icon(
                                            att.type == "VIDEO"
                                                ? Icons.videocam
                                                : att.type == "AUDIO"
                                                    ? Icons.mic
                                                    : Icons.insert_drive_file,
                                            color: const Color(0xFF7C3AED),
                                            size: 28,
                                          ),
                                        ),
                                ),
                              ),
                            ),
                            if (att.type == "VIDEO")
                              const Positioned(
                                bottom: 4,
                                right: 4,
                                child: Icon(
                                  Icons.play_circle_fill,
                                  color: Colors.white,
                                  size: 16,
                                ),
                              ),
                            Positioned(
                              top: 2,
                              right: 2,
                              child: GestureDetector(
                                onTap: () {
                                  setState(() {
                                    _attachments.removeAt(index);
                                  });
                                },
                                child: Container(
                                  padding: const EdgeInsets.all(2),
                                  decoration: const BoxDecoration(
                                    color: Colors.black54,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(
                                    Icons.close,
                                    color: Colors.white,
                                    size: 14,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              Row(
                children: [
                  if (!_isRecording) ...[
                    _buildComposerButton(
                      icon: const Icon(Icons.add_circle_outline,
                          color: Color(0xFF64748B), size: 28),
                      onTap: widget.sending ? null : _showPicker,
                    ),
                    _buildComposerButton(
                      icon: const Icon(Icons.gif_box_outlined,
                          color: Color(0xFF7C3AED), size: 28),
                      onTap: widget.sending ? null : _showGifPicker,
                    ),
                    _buildComposerButton(
                      icon: const Icon(Icons.sticky_note_2_outlined,
                          color: Color(0xFF7C3AED), size: 28),
                      onTap: widget.sending ? null : _showStickerPicker,
                    ),
                  ],
                  const SizedBox(width: 8),
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
                              color: isDark
                                  ? const Color(0xFF0F172A)
                                  : const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(28),
                              border: Border.all(
                                  color: isDark
                                      ? Colors.grey.shade800
                                      : Colors.grey.shade200),
                            ),
                            child: TextField(
                              controller: _textController,
                              maxLines: 5,
                              minLines: 1,
                              style: TextStyle(
                                  fontSize: 16,
                                  color: isDark ? Colors.white : Colors.black87),
                              onChanged: (_) => setState(() {}),
                              decoration: InputDecoration(
                                hintText: "Nhắn tin...",
                                hintStyle: TextStyle(
                                    color: isDark
                                        ? Colors.grey[500]
                                        : Colors.grey[600]),
                                border: InputBorder.none,
                                contentPadding: const EdgeInsets.symmetric(
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
                        child: Icon(Icons.access_time_rounded, size: 24, color: Color(0xFF7C3AED)))
                  else ...[
                    if (_isRecording)
                      _buildComposerButton(
                        icon: const Icon(Icons.check_circle,
                            color: Color(0xFF7C3AED), size: 28),
                        onTap: _stopRecording,
                      )
                    else if (_textController.text.trim().isEmpty &&
                        _attachments.isEmpty) ...[
                      _buildComposerButton(
                        icon: const Icon(Icons.mic_none_outlined,
                            color: Color(0xFF7C3AED), size: 28),
                        onTap: () {
                          print("DEBUG: Mic button pressed");
                          _startRecording();
                        },
                      ),
                      _buildComposerButton(
                        icon: const Icon(Icons.thumb_up_rounded,
                            color: Color(0xFF7C3AED), size: 28),
                        onTap: () =>
                            widget.onSend(text: "👍", attachments: const []),
                      ),
                    ] else
                      _buildComposerButton(
                        icon: const Icon(Icons.send_rounded,
                            color: Color(0xFF7C3AED), size: 28),
                        onTap: () async {
                          final text = _textController.text.trim();
                          if (text.isNotEmpty || _attachments.isNotEmpty) {
                            final prevText = text;
                            final prevAttachments = List<_PendingAttachment>.from(_attachments);
                            _textController.clear();
                            setState(() => _attachments.clear());
                            try {
                              await widget.onSend(text: text, attachments: prevAttachments);
                            } catch (e) {
                              if (mounted) {
                                _textController.text = prevText;
                                setState(() {
                                  _attachments.addAll(prevAttachments);
                                });
                              }
                            }
                          }
                        },
                      ),
                  ],
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class ChatMessageBubble extends StatelessWidget {
  final MessageItem message;
  final bool isMine;
  final String? senderAlias;
  final List<String> reactions;
  final UserService? userService;
  final VoidCallback? onLongPress;
  final String? currentUserName;
  final bool showReadReceipt;
  final String? peerId;
  final String? peerAvatarUrl;
  final String? peerDisplayName;

  final VoidCallback? onReplyTap;

  const ChatMessageBubble({
    super.key,
    required this.message,
    required this.isMine,
    this.senderAlias,
    this.reactions = const [],
    this.userService,
    this.onLongPress,
    this.currentUserName,
    this.showReadReceipt = false,
    this.peerId,
    this.peerAvatarUrl,
    this.peerDisplayName,
    this.onReplyTap,
  });

  @override
  Widget build(BuildContext context) {
    if (message.type == "SYSTEM") {
      final isDark = Theme.of(context).brightness == Brightness.dark;
      return Container(
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            message.contentText.translatedSystemMessage,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
            ),
          ),
        ),
      );
    }

    final hasAttachment = message.resolvedAttachmentUrl != null;
    final hasText = message.contentText.isNotEmpty;

    return Column(
      crossAxisAlignment: isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
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
                  initialDisplayName: senderAlias ?? message.senderName,
                  radius: 14,
                  userService: userService,
                ),
                const SizedBox(width: 8),
              ],
              _buildMessageContent(context, hasText, hasAttachment),
            ],
          ),
        ),
        if (isMine && showReadReceipt && peerId != null) ...[
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: UserAvatar(
              userId: peerId!,
              initialAvatarUrl: peerAvatarUrl,
              initialDisplayName: peerDisplayName ?? "User",
              radius: 8,
              userService: userService,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildMessageContent(BuildContext context, bool hasText, bool hasAttachment) {
    if (hasAttachment) {
      if (hasText) {
        return ConstrainedBox(
          constraints:
              BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
          child: Column(
            crossAxisAlignment:
                isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildBubble(context, showMeta: false),
              const SizedBox(height: 4),
              _buildAttachmentOnly(context),
            ],
          ),
        );
      } else {
        return _buildAttachmentOnly(context);
      }
    } else {
      return _buildBubble(context);
    }
  }

  Widget _buildAttachmentOnly(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ConstrainedBox(
      constraints:
          BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
      child: Column(
        crossAxisAlignment:
            isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          _AttachmentView(message: message, isMine: isMine),
          const SizedBox(height: 4),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _formatTime(message.sentAtDate),
                style: TextStyle(
                    fontSize: 10,
                    color: isDark ? Colors.grey[400] : Colors.grey[600]),
              ),
              if (isMine) ...[
                const SizedBox(width: 4),
                _buildDeliveryStatusIcon(outside: true, context: context),
              ],
            ],
          ),
          if (reactions.isNotEmpty)
            _buildReactionsDisplay(context, isMine, outside: true),
        ],
      ),
    );
  }

  Widget _buildBubble(BuildContext context, {bool showMeta = true}) {
    return ConstrainedBox(
      constraints:
          BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isMine
              ? const Color(0xFF7C3AED)
              : (Theme.of(context).brightness == Brightness.dark
                  ? const Color(0xFF1E293B)
                  : Colors.white),
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
              if (message.replyTo != null) _buildReplyHeader(context),
              if (message.contentText.isNotEmpty) _buildContentBody(context),
            ],
            if (showMeta) ...[
              const SizedBox(height: 4),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _formatTime(message.sentAtDate),
                    style: TextStyle(
                        fontSize: 10,
                        color: isMine
                            ? Colors.white.withOpacity(0.7)
                            : Colors.grey[500]),
                  ),
                  if (isMine) ...[
                    const SizedBox(width: 4),
                    _buildDeliveryStatusIcon(),
                  ],
                ],
              ),
              if (reactions.isNotEmpty) _buildReactionsDisplay(context, isMine),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildDeliveryStatusIcon({bool outside = false, BuildContext? context}) {
    Color iconColor = Colors.white70;
    if (outside && context != null) {
      final isDark = Theme.of(context).brightness == Brightness.dark;
      iconColor = isDark ? Colors.grey[400]! : Colors.grey[600]!;
    }

    if (message.isPending) {
      return Icon(
        Icons.access_time,
        size: 11,
        color: iconColor,
      );
    }

    final state = message.deliveryState?.toUpperCase();
    if (state == 'READ') {
      return const SizedBox.shrink();
    } else if (state == 'DELIVERED') {
      return Icon(
        Icons.done_all,
        size: 13,
        color: iconColor,
      );
    } else {
      return Icon(
        Icons.check,
        size: 13,
        color: iconColor,
      );
    }
  }

  List<InlineSpan> _buildTextSpans(BuildContext context, String text) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final defaultStyle = TextStyle(
      color: isMine
          ? Colors.white
          : (isDark ? Colors.white : const Color(0xFF1E1B4B)),
      fontSize: 15,
      height: 1.4,
    );

    if (text.isEmpty) return [TextSpan(text: text, style: defaultStyle)];

    final List<InlineSpan> spans = [];
    final RegExp tagRegex = RegExp(r'(@[\p{L}0-9_]+(?:\s+[\p{L}0-9_]+)*)', unicode: true);
    
    int lastIndex = 0;
    final matches = tagRegex.allMatches(text);

    for (final match in matches) {
      if (match.start > lastIndex) {
        spans.add(TextSpan(
          text: text.substring(lastIndex, match.start),
          style: defaultStyle,
        ));
      }

      final tagText = match.group(0)!;

      spans.add(TextSpan(
        text: tagText,
        style: defaultStyle.copyWith(
          fontWeight: FontWeight.bold,
        ),
      ));

      lastIndex = match.end;
    }

    if (lastIndex < text.length) {
      spans.add(TextSpan(
        text: text.substring(lastIndex),
        style: defaultStyle,
      ));
    }

    return spans;
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

    return RichText(
      text: TextSpan(
        children: _buildTextSpans(context, text),
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
            AppToast.show(
              context,
              message: "Không thể mở đường dẫn này",
              type: AppToastType.error,
            );
          }
        }
      },
      child: Container(
        margin: const EdgeInsets.only(top: 4, bottom: 4),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isMine
              ? Colors.white.withOpacity(0.15)
              : (Theme.of(context).brightness == Brightness.dark
                  ? const Color(0xFF1E293B)
                  : const Color(0xFFF1F5F9)),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: isMine
                  ? Colors.white24
                  : (Theme.of(context).brightness == Brightness.dark
                      ? Colors.grey.shade800
                      : Colors.grey.shade200)),
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
                    color: isMine
                        ? Colors.white
                        : (Theme.of(context).brightness == Brightness.dark
                            ? Colors.white
                            : const Color(0xFF1E1B4B)),
                    fontSize: 14,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              "Nhấn để xem trên bản đồ",
              style: TextStyle(
                color: isMine
                    ? Colors.white70
                    : (Theme.of(context).brightness == Brightness.dark
                        ? Colors.grey[400]
                        : Colors.grey.shade600),
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
                  color: isMine
                      ? Colors.white
                      : (Theme.of(context).brightness == Brightness.dark
                          ? Colors.white
                          : const Color(0xFF1E1B4B)),
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
                AppToast.show(
                  context,
                  message: "Không thể mở đường dẫn này",
                  type: AppToastType.error,
                );
              }
            }
          },
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isMine
                  ? Colors.white.withOpacity(0.15)
                  : (Theme.of(context).brightness == Brightness.dark
                      ? const Color(0xFF1E293B)
                      : const Color(0xFFF1F5F9)),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: isMine
                      ? Colors.white24
                      : (Theme.of(context).brightness == Brightness.dark
                          ? Colors.grey.shade800
                          : Colors.grey.shade200)),
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
                          color: isMine
                              ? Colors.white
                              : (Theme.of(context).brightness == Brightness.dark
                                  ? Colors.white
                                  : const Color(0xFF1E1B4B)),
                        ),
                      ),
                      Text(
                        url,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: isMine
                              ? Colors.white70
                              : (Theme.of(context).brightness == Brightness.dark
                                  ? Colors.grey[400]
                                  : Colors.grey.shade600),
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

  Widget _buildReactionsDisplay(BuildContext context, bool isMine, {bool outside = false}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final containerColor = (outside || !isMine)
        ? (isDark ? const Color(0xFF334155) : Colors.grey[200])
        : Colors.white.withOpacity(0.2);

    return Container(
      margin: const EdgeInsets.only(top: 4),
      child: Wrap(
        spacing: 4,
        children: reactions
            .map((emoji) => Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: containerColor,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(emoji,
                      style: TextStyle(
                          fontSize: 12,
                          color: isDark ? Colors.white : Colors.black87)),
                ))
            .toList(),
      ),
    );
  }

  Widget _buildReplyHeader(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    // Lấy nội dung tin nhắn được trả lời
    String replyText = "Xem tin nhắn đã trả lời";
    if (message.replyMessage != null) {
      final text = message.replyMessage!.contentText;
      if (text.isNotEmpty) {
        replyText = text;
      } else {
        if (message.replyMessage!.type == 'image') {
          replyText = "📷 Hình ảnh";
        } else if (message.replyMessage!.type == 'file') {
          replyText = "📁 Tệp đính kèm";
        } else if (message.replyMessage!.type == 'audio') {
          replyText = "🎵 Tin nhắn thoại";
        } else if (message.replyMessage!.type == 'video') {
          replyText = "🎥 Video";
        } else {
          replyText = "Tin nhắn";
        }
      }
    }

    return GestureDetector(
      onTap: onReplyTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: isMine
              ? Colors.white12
              : (isDark
                  ? const Color(0xFF334155)
                  : Colors.grey[100]),
          borderRadius: BorderRadius.circular(8),
          border: Border(
              left: BorderSide(
                  color: isMine ? Colors.white54 : const Color(0xFF7C3AED),
                  width: 3)),
        ),
        child: Text(
          replyText,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
              fontSize: 12,
              fontStyle: FontStyle.italic,
              color: isMine
                  ? Colors.white70
                  : (isDark
                      ? Colors.grey[300]
                      : Colors.grey[700])),
        ),
      ),
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

  Future<void> _downloadImage(BuildContext context, String url) async {
    try {
      AppToast.show(
        context,
        message: "Đã bắt đầu tải xuống ảnh...",
        type: AppToastType.info,
      );

      String extension = "jpg";
      try {
        final uri = Uri.parse(url);
        final path = uri.path;
        final lastSegment = path.split("/").last;
        if (lastSegment.contains(".")) {
          extension = lastSegment.split(".").last;
        }
      } catch (_) {}

      if (extension.length > 5 || extension.contains("/")) {
        extension = "jpg";
      }

      final fileName = "chat_img_${DateTime.now().millisecondsSinceEpoch}.$extension";

      final task = DownloadTask(
        url: url,
        filename: fileName,
        directory: 'downloads',
        baseDirectory: BaseDirectory.temporary,
        updates: Updates.statusAndProgress,
        retries: 3,
      );

      final result = await FileDownloader().download(task);
      if (result.status == TaskStatus.complete) {
        final path = await FileDownloader().moveToSharedStorage(task, SharedStorage.images);
        if (path != null && context.mounted) {
          AppToast.show(
            context,
            message: "Đã lưu ảnh vào thư viện thành công!",
            type: AppToastType.success,
          );
        } else if (context.mounted) {
          AppToast.show(
            context,
            message: "Không thể lưu ảnh vào thư viện.",
            type: AppToastType.error,
          );
        }
      } else {
        if (context.mounted) {
          AppToast.show(
            context,
            message: "Tải ảnh thất bại.",
            type: AppToastType.error,
          );
        }
      }
    } catch (e) {
      if (context.mounted) {
        AppToast.show(
          context,
          message: "Lỗi khi tải ảnh: $e",
          type: AppToastType.error,
        );
      }
    }
  }

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
                      child: CachedNetworkImage(
                        imageUrl: url,
                        fit: BoxFit.contain,
                        placeholder: (context, url) => const Center(
                          child: Icon(Icons.image_outlined, color: Colors.white30, size: 48),
                        ),
                        errorWidget: (context, url, error) => const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 64),
                      ),
                    ),
                  ),
                  Positioned(
                    top: 40,
                    right: 20,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.download, color: Colors.white, size: 30),
                          onPressed: () => _downloadImage(context, url),
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          icon: const Icon(Icons.close, color: Colors.white, size: 30),
                          onPressed: () => Navigator.pop(context),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
        child: ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: CachedNetworkImage(
            imageUrl: url,
            width: 200,
            height: 150,
            fit: BoxFit.cover,
            placeholder: (context, url) => Container(
              width: 200,
              height: 150,
              color: Colors.grey.shade200,
              child: const Center(
                child: Icon(Icons.image_outlined, color: Colors.grey, size: 36),
              ),
            ),
            errorWidget: (context, url, error) => Container(
              width: 200,
              height: 150,
              color: Colors.grey.shade200,
              child: const Icon(Icons.broken_image_outlined, color: Colors.grey),
            ),
          ),
        ),
      );
    }
    if (message.isAudio) {
      return _VoicePlayer(url: url, isMine: isMine);
    }
    if (message.isVideo) {
      return _InlineVideoPlayer(videoUrl: url);
    }
    if (message.isDocument) {
      final isDark = Theme.of(context).brightness == Brightness.dark;
      return InkWell(
        onTap: () async {
          final uri = Uri.tryParse(url);
          if (uri != null && await canLaunchUrl(uri)) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          }
        },
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: isMine
                ? (isDark ? const Color(0xFF6D28D9) : const Color(0xFFEDE9FE))
                : (isDark ? const Color(0xFF334155) : Colors.grey[200]),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.insert_drive_file,
                color: isMine
                    ? (isDark ? Colors.white : const Color(0xFF7C3AED))
                    : (isDark ? Colors.white70 : Colors.black54),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  message.attachmentName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: isMine
                          ? (isDark ? Colors.white : const Color(0xFF6D28D9))
                          : (isDark ? Colors.white70 : Colors.black87)),
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

class _InlineVideoPlayer extends StatefulWidget {
  final String videoUrl;
  const _InlineVideoPlayer({required this.videoUrl});

  @override
  State<_InlineVideoPlayer> createState() => _InlineVideoPlayerState();
}

class _InlineVideoPlayerState extends State<_InlineVideoPlayer> {
  late VideoPlayerController _controller;
  bool _initialized = false;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.videoUrl))
      ..initialize().then((_) {
        if (mounted) {
          setState(() {
            _initialized = true;
          });
        }
      }).catchError((error) {
        debugPrint("Video initialization error: $error");
        if (mounted) {
          setState(() {
            _hasError = true;
          });
        }
      });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_hasError) {
      return Container(
        width: 200,
        height: 150,
        decoration: BoxDecoration(
          color: Colors.black87,
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, color: Colors.redAccent, size: 36),
              SizedBox(height: 8),
              Text(
                "Không thể phát video",
                style: TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ],
          ),
        ),
      );
    }

    if (!_initialized) {
      return Container(
        width: 200,
        height: 150,
        decoration: BoxDecoration(
          color: Colors.black87,
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Center(
          child: SizedBox(
            width: 30,
            height: 30,
            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
          ),
        ),
      );
    }

    return Container(
      width: 200,
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      child: AspectRatio(
        aspectRatio: _controller.value.aspectRatio,
        child: Stack(
          alignment: Alignment.bottomCenter,
          children: [
            VideoPlayer(_controller),
            _buildPlayPauseOverlay(),
            VideoProgressIndicator(
              _controller,
              allowScrubbing: true,
              colors: const VideoProgressColors(
                playedColor: Color(0xFF7C3AED),
                bufferedColor: Colors.white30,
                backgroundColor: Colors.white12,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPlayPauseOverlay() {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        setState(() {
          if (_controller.value.isPlaying) {
            _controller.pause();
          } else {
            _controller.play();
          }
        });
      },
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 150),
        child: _controller.value.isPlaying
            ? const SizedBox.shrink()
            : Container(
                color: Colors.black38,
                child: const Center(
                  child: Icon(
                    Icons.play_arrow,
                    color: Colors.white,
                    size: 50.0,
                  ),
                ),
              ),
      ),
    );
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: 220,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: widget.isMine
            ? (isDark ? const Color(0xFF6D28D9) : const Color(0xFFEDE9FE))
            : (isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          IconButton(
            icon: Icon(
              _isPlaying ? Icons.pause_circle_filled : Icons.play_circle_filled,
              color: widget.isMine
                  ? (isDark ? Colors.white : const Color(0xFF7C3AED))
                  : const Color(0xFF7C3AED),
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
                    activeColor: widget.isMine
                        ? (isDark ? Colors.white : const Color(0xFF7C3AED))
                        : const Color(0xFF7C3AED),
                    inactiveColor: widget.isMine
                        ? (isDark ? Colors.white38 : const Color(0xFFDDD6FE))
                        : (isDark ? Colors.grey[600] : Colors.grey[300]),
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
                            color: widget.isMine
                                ? (isDark ? Colors.white70 : const Color(0xFF6D28D9))
                                : (isDark ? Colors.grey[400] : Colors.grey)),
                      ),
                      Text(
                        _formatDuration(_duration),
                        style: TextStyle(
                            fontSize: 10,
                            color: widget.isMine
                                ? (isDark ? Colors.white70 : const Color(0xFF6D28D9))
                                : (isDark ? Colors.grey[400] : Colors.grey)),
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

class _MessageInfoDialog extends StatefulWidget {
  final String messageId;
  final PagingController<String?, MessageItem> pagingController;
  final ConversationSummary conversation;
  final dynamic currentUser;

  const _MessageInfoDialog({
    required this.messageId,
    required this.pagingController,
    required this.conversation,
    required this.currentUser,
  });

  @override
  State<_MessageInfoDialog> createState() => _MessageInfoDialogState();
}

class _MessageInfoDialogState extends State<_MessageInfoDialog> {
  void _onPagingControllerChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  @override
  void initState() {
    super.initState();
    widget.pagingController.addListener(_onPagingControllerChanged);
  }

  @override
  void dispose() {
    widget.pagingController.removeListener(_onPagingControllerChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final items = widget.pagingController.itemList ?? [];
    final messageIdx = items.indexWhere((m) => m.id == widget.messageId);

    if (messageIdx == -1) {
      return AlertDialog(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        content: const Text("Không tìm thấy tin nhắn"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text("Đóng", style: TextStyle(color: Color(0xFF7C3AED))),
          )
        ],
      );
    }

    final message = items[messageIdx];
    final sentDate = DateTime.tryParse(message.sentAt)?.toLocal();
    final formattedSent = sentDate != null
        ? DateFormat("dd/MM/yyyy HH:mm:ss").format(sentDate)
        : "Không rõ";

    final readDate = message.lastReadAt != null
        ? DateTime.tryParse(message.lastReadAt!)?.toLocal()
        : null;
    final formattedRead = readDate != null
        ? DateFormat("dd/MM/yyyy HH:mm:ss").format(readDate)
        : null;

    final isMine = message.senderId == widget.currentUser.id.toString();
    final isGroup = widget.conversation.isGroup;

    return AlertDialog(
      backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Row(
        children: [
          const Icon(Icons.info_outline, color: Color(0xFF7C3AED)),
          const SizedBox(width: 8),
          Text(
            "Thông tin tin nhắn",
            style: TextStyle(
              color: isDark ? Colors.white : const Color(0xFF1E1B4B),
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Nội dung:",
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.grey.shade400 : Colors.grey.shade600,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 4),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF0F172A) : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                message.isDeleted ? "Tin nhắn đã thu hồi" : message.contentText,
                style: TextStyle(
                  color: isDark ? Colors.white : Colors.black87,
                  fontStyle: message.isDeleted ? FontStyle.italic : null,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Icon(Icons.send_outlined, size: 16, color: isDark ? Colors.grey.shade400 : Colors.grey),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    "Đã gửi: $formattedSent",
                    style: TextStyle(
                      color: isDark ? Colors.white : Colors.black87,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (isMine) ...[
              if (isGroup) ...[
                Row(
                  children: [
                    Icon(Icons.remove_red_eye_outlined, size: 16, color: isDark ? Colors.grey.shade400 : Colors.grey),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        "Đã xem: ${message.readByCount ?? 0} / ${message.recipientCount ?? 0} người",
                        style: TextStyle(
                          color: isDark ? Colors.white : Colors.black87,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Icon(Icons.done_all, size: 16, color: isDark ? Colors.grey.shade400 : Colors.grey),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        "Đã nhận: ${message.deliveredCount ?? 0} / ${message.recipientCount ?? 0} người",
                        style: TextStyle(
                          color: isDark ? Colors.white : Colors.black87,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ] else ...[
                Row(
                  children: [
                    Icon(
                      message.deliveryState == 'READ'
                          ? Icons.remove_red_eye_outlined
                          : (message.deliveryState == 'DELIVERED' ? Icons.done_all : Icons.check),
                      size: 16,
                      color: message.deliveryState == 'READ' ? Colors.blue : (isDark ? Colors.grey.shade400 : Colors.grey),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        message.deliveryState == 'READ'
                            ? "Trạng thái: Đã xem"
                            : (message.deliveryState == 'DELIVERED'
                                ? "Trạng thái: Đã nhận"
                                : "Trạng thái: Đã gửi thành công"),
                        style: TextStyle(
                          color: message.deliveryState == 'READ'
                              ? Colors.blue
                              : (isDark ? Colors.white : Colors.black87),
                          fontSize: 13,
                          fontWeight: message.deliveryState == 'READ' ? FontWeight.bold : null,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              if (formattedRead != null) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Icon(Icons.access_time_outlined, size: 16, color: isDark ? Colors.grey.shade400 : Colors.grey),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        "Xem lúc: $formattedRead",
                        style: TextStyle(
                          color: isDark ? Colors.white : Colors.black87,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text("Đóng", style: TextStyle(color: Color(0xFF7C3AED))),
        ),
      ],
    );
  }
}

