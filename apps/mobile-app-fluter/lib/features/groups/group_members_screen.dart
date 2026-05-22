import 'package:flutter/material.dart';
import 'package:skeletonizer/skeletonizer.dart';
import 'package:provider/provider.dart';
import '../../services/group_service.dart';
import '../../services/user_service.dart';
import '../../services/app_services.dart';
import '../../models/user_profile.dart';
import '../shared/widgets/user_avatar.dart';
import '../shared/widgets/app_toast.dart';
import '../profile/profile_screen.dart';

class GroupMembersScreen extends StatefulWidget {
  final GroupService groupService;
  final UserService userService;
  final String groupId;
  final String groupName;
  final String? currentUserId;

  const GroupMembersScreen({
    super.key,
    required this.groupService,
    required this.userService,
    required this.groupId,
    required this.groupName,
    this.currentUserId,
  });

  @override
  State<GroupMembersScreen> createState() => _GroupMembersScreenState();
}

class _GroupMembersScreenState extends State<GroupMembersScreen> {
  List<Map<String, dynamic>> _members = [];
  bool _isLoading = true;
  String? _myRole;

  @override
  void initState() {
    super.initState();
    _loadMembers();
  }

  Future<void> _loadMembers() async {
    setState(() => _isLoading = true);
    try {
      final members = await widget.groupService.listMembers(widget.groupId);
      
      final conversationService = context.read<AppServices>().conversationService;
      Map<String, String> aliasMap = {};
      try {
        final aliasList = await conversationService.listConversationAliases("group:${widget.groupId}");
        aliasMap = {
          for (var a in aliasList) a['userId'].toString(): a['alias'].toString()
        };
      } catch (e) {
        debugPrint("Error loading group aliases: $e");
      }

      // Hydrate profiles in parallel to resolve names and avatars
      final populatedMembers = await Future.wait(members.map((m) async {
        final userId = m['userId']?.toString();
        if (userId == null) return m;
        try {
          final profile = await widget.userService.getUserById(userId);
          final alias = aliasMap[userId];
          return {
            ...m,
            'fullName': profile.fullName,
            'displayName': alias ?? profile.fullName,
            'avatarUrl': profile.avatarUrl,
            'profile': profile,
            'alias': alias,
          };
        } catch (_) {
          final alias = aliasMap[userId];
          return {
            ...m,
            'displayName': alias ?? m['displayName'] ?? m['fullName'] ?? 'Thành viên',
            'alias': alias,
          };
        }
      }));

      if (mounted) {
        final me = populatedMembers.firstWhere(
          (m) => m['userId'] == widget.currentUserId,
          orElse: () => {},
        );
        setState(() {
          _members = populatedMembers;
          _myRole = me['roleInGroup']?.toString();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _kickMember(String userId, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) {
        final isDark = Theme.of(dialogCtx).brightness == Brightness.dark;
        return AlertDialog(
          backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
          title: Text(
            'Xóa thành viên',
            style: TextStyle(color: isDark ? Colors.white : const Color(0xFF1E1B4B), fontWeight: FontWeight.bold),
          ),
          content: Text(
            'Bạn có chắc muốn xóa $name khỏi nhóm?',
            style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx, false),
              child: Text('Hủy', style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED))),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
              onPressed: () => Navigator.pop(dialogCtx, true),
              child: const Text('Xóa'),
            ),
          ],
        );
      },
    );
    if (confirmed != true) return;
    setState(() {
      _members = _members.where((m) => m['userId']?.toString() != userId).toList();
    });
    if (mounted) {
      AppToast.show(
        context,
        message: 'Đã xóa $name khỏi nhóm thành công',
        type: AppToastType.success,
      );
    }
    widget.groupService.removeMember(groupId: widget.groupId, userId: userId).catchError((e) {
      debugPrint("Error kicking member: $e");
      _loadMembers();
      return <String, dynamic>{};
    });
  }

  Future<void> _banMember(String userId, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) {
        final isDark = Theme.of(dialogCtx).brightness == Brightness.dark;
        return AlertDialog(
          backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
          title: Text(
            'Cấm thành viên',
            style: TextStyle(color: isDark ? Colors.white : const Color(0xFF1E1B4B), fontWeight: FontWeight.bold),
          ),
          content: Text(
            'Cấm $name sẽ xóa họ khỏi nhóm và ngăn tham gia lại. Tiếp tục?',
            style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx, false),
              child: Text('Hủy', style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED))),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () => Navigator.pop(dialogCtx, true),
              child: const Text('Cấm'),
            ),
          ],
        );
      },
    );
    if (confirmed != true) return;
    setState(() {
      _members = _members.where((m) => m['userId']?.toString() != userId).toList();
    });
    if (mounted) {
      AppToast.show(
        context,
        message: 'Đã cấm $name khỏi nhóm thành công',
        type: AppToastType.success,
      );
    }
    widget.groupService.banMember(groupId: widget.groupId, userId: userId).catchError((e) {
      debugPrint("Error banning member: $e");
      _loadMembers();
      return <String, dynamic>{};
    });
  }

  Future<void> _transferOwnership(String userId, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) {
        final isDark = Theme.of(dialogCtx).brightness == Brightness.dark;
        return AlertDialog(
          backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
          title: Text(
            'Chuyển quyền Trưởng nhóm',
            style: TextStyle(color: isDark ? Colors.white : const Color(0xFF1E1B4B), fontWeight: FontWeight.bold),
          ),
          content: Text(
            'Bạn sẽ chuyển quyền Trưởng nhóm cho $name. Hành động này không thể hoàn tác.',
            style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx, false),
              child: Text('Hủy', style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED))),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
              onPressed: () => Navigator.pop(dialogCtx, true),
              child: const Text('Chuyển quyền'),
            ),
          ],
        );
      },
    );
    if (confirmed != true) return;
    setState(() {
      _myRole = 'MEMBER';
      _members = _members.map((m) {
        final mId = m['userId']?.toString();
        if (mId == widget.currentUserId) {
          return {
            ...m,
            'roleInGroup': 'MEMBER',
          };
        } else if (mId == userId) {
          return {
            ...m,
            'roleInGroup': 'OWNER',
          };
        }
        return m;
      }).toList();
    });
    if (mounted) {
      AppToast.show(
        context,
        message: 'Đã chuyển quyền Trưởng nhóm cho $name',
        type: AppToastType.success,
      );
    }
    widget.groupService.transferOwnership(groupId: widget.groupId, newOwnerId: userId).catchError((e) {
      debugPrint("Error transferring ownership: $e");
      _loadMembers();
      return <String, dynamic>{};
    });
  }

  void _showMemberActions(Map<String, dynamic> member) {
    final userId = member['userId']?.toString() ?? '';
    final name = member['fullName']?.toString() ?? member['displayName']?.toString() ?? 'Thành viên';
    final role = member['roleInGroup']?.toString() ?? 'MEMBER';
    final isMe = userId == widget.currentUserId;

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      backgroundColor: Colors.transparent,
      builder: (_) {
        final services = context.read<AppServices>();
        final isDark = Theme.of(context).brightness == Brightness.dark;
        return Container(
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 40,
                    height: 5,
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF475569) : Colors.grey[300],
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    name,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white : Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ListTile(
                    leading: Icon(Icons.person_outline, color: isDark ? Colors.blue.shade300 : Colors.blue),
                    title: Text(
                      'Xem thông tin',
                      style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
                    ),
                    onTap: () {
                      Navigator.pop(context);
                      final profile = member['profile'] as UserProfile?;
                      if (profile != null) {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ProfileScreen(
                              user: profile,
                              userService: services.userService,
                              uploadService: services.uploadService,
                            ),
                          ),
                        );
                      }
                    },
                  ),
                  ListTile(
                    leading: Icon(Icons.edit_note, color: isDark ? Colors.blue.shade300 : Colors.blue),
                    title: Text(
                      'Đặt biệt danh',
                      style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
                    ),
                    onTap: () {
                      Navigator.pop(context);
                      _showSetAliasDialog(member);
                    },
                  ),
                  if (!isMe) ...[
                    if (_myRole == 'OWNER') ...[
                      ListTile(
                        leading: const Icon(Icons.swap_horiz, color: Color(0xFF7C3AED)),
                        title: Text(
                          'Chuyển quyền Trưởng nhóm',
                          style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
                        ),
                        onTap: () { Navigator.pop(context); _transferOwnership(userId, name); },
                      ),
                      ListTile(
                        leading: Icon(Icons.admin_panel_settings_outlined, color: isDark ? Colors.amber.shade300 : Colors.orange),
                        title: Text(
                          role == 'DEPUTY' ? 'Hạ xuống Thành viên' : 'Thăng làm Phó nhóm',
                          style: TextStyle(color: isDark ? Colors.white70 : Colors.black87),
                        ),
                        onTap: () {
                          Navigator.pop(context);
                          final newRole = role == 'DEPUTY' ? 'MEMBER' : 'DEPUTY';
                          setState(() {
                            _members = _members.map((m) {
                              if (m['userId']?.toString() == userId) {
                                return {
                                  ...m,
                                  'roleInGroup': newRole,
                                };
                              }
                              return m;
                            }).toList();
                          });
                          AppToast.show(
                            context,
                            message: newRole == 'DEPUTY' ? 'Đã thăng $name làm Phó nhóm' : 'Đã hạ $name xuống Thành viên',
                            type: AppToastType.success,
                          );
                          widget.groupService.updateMemberRole(groupId: widget.groupId, userId: userId, roleInGroup: newRole).catchError((e) {
                            debugPrint("Error updating role: $e");
                            _loadMembers();
                            return <String, dynamic>{};
                          });
                        },
                      ),
                    ],
                    if (_myRole == 'OWNER' || (_myRole == 'DEPUTY' && role == 'MEMBER')) ...[
                      ListTile(
                        leading: Icon(Icons.person_remove_outlined, color: isDark ? Colors.red.shade300 : Colors.red),
                        title: Text(
                          'Xóa khỏi nhóm',
                          style: TextStyle(color: isDark ? Colors.red.shade300 : Colors.red),
                        ),
                        onTap: () { Navigator.pop(context); _kickMember(userId, name); },
                      ),
                      ListTile(
                        leading: Icon(Icons.block_outlined, color: isDark ? Colors.red.shade300 : Colors.red),
                        title: Text(
                          'Cấm khỏi nhóm',
                          style: TextStyle(color: isDark ? Colors.red.shade300 : Colors.red),
                        ),
                        onTap: () { Navigator.pop(context); _banMember(userId, name); },
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  String _roleLabel(String? role) {
    switch (role) {
      case 'OWNER': return 'Trưởng nhóm';
      case 'DEPUTY': return 'Phó nhóm';
      default: return 'Thành viên';
    }
  }

  Color _roleColor(BuildContext context, String? role) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    switch (role) {
      case 'OWNER': return isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED);
      case 'DEPUTY': return isDark ? Colors.amber : Colors.orange;
      default: return isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          'Thành viên - ${widget.groupName}',
          style: TextStyle(
            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        elevation: 0,
        iconTheme: IconThemeData(color: isDark ? Colors.white : const Color(0xFF1E1B4B)),
      ),
      body: RefreshIndicator(
        onRefresh: _loadMembers,
        child: Skeletonizer(
          enabled: _isLoading,
          child: _isLoading
              ? ListView.builder(itemCount: 6, itemBuilder: (_, __) => const ListTile(leading: CircleAvatar(), title: Text('Loading...')))
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: _members.length,
                  itemBuilder: (context, index) {
                    final m = _members[index];
                    final userId = m['userId']?.toString() ?? '';
                    final name = m['displayName']?.toString() ?? m['fullName']?.toString() ?? 'Thành viên';
                    final role = m['roleInGroup']?.toString();
                    final isMe = userId == widget.currentUserId;

                    return ListTile(
                      leading: UserAvatar(userId: userId, initialDisplayName: name, radius: 22),
                      title: Row(children: [
                        Expanded(
                          child: Text(
                            name,
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: isDark ? Colors.white : Colors.black87,
                            ),
                          ),
                        ),
                        if (isMe)
                          Text(
                            ' (Bạn)',
                            style: TextStyle(
                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                              fontSize: 12,
                            ),
                          ),
                      ]),
                      subtitle: Text(
                        _roleLabel(role),
                        style: TextStyle(
                          color: _roleColor(context, role),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      onTap: () => _showMemberActions(m),
                      trailing: Icon(
                        Icons.more_vert,
                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }

  void _showSetAliasDialog(Map<String, dynamic> member) {
    final userId = member['userId']?.toString() ?? '';
    final currentAlias = member['alias']?.toString() ?? '';
    final fullName = member['fullName']?.toString() ?? 'Thành viên';
    final controller = TextEditingController(text: currentAlias);

    showDialog(
      context: context,
      builder: (dialogCtx) {
        final isDark = Theme.of(dialogCtx).brightness == Brightness.dark;
        return AlertDialog(
          backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
          title: Text(
            'Biệt danh cho $fullName',
            style: TextStyle(
              color: isDark ? Colors.white : const Color(0xFF1E1B4B),
              fontWeight: FontWeight.bold,
            ),
          ),
          content: TextField(
            controller: controller,
            style: TextStyle(color: isDark ? Colors.white : Colors.black87),
            decoration: InputDecoration(
              hintText: 'Nhập biệt danh...',
              hintStyle: TextStyle(color: isDark ? Colors.white38 : Colors.black38),
              filled: true,
              fillColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: isDark ? const Color(0xFF334155) : Colors.grey.shade300),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: isDark ? const Color(0xFF334155) : Colors.grey.shade300),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFF7C3AED), width: 1.5),
              ),
            ),
            maxLength: 100,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx),
              child: Text(
                'Hủy',
                style: TextStyle(color: isDark ? const Color(0xFFA78BFA) : const Color(0xFF7C3AED)),
              ),
            ),
            if (currentAlias.isNotEmpty)
              TextButton(
                onPressed: () {
                  Navigator.pop(dialogCtx);
                  setState(() {
                    _members = _members.map((m) {
                      if (m['userId']?.toString() == userId) {
                        return {
                          ...m,
                          'alias': null,
                          'displayName': m['fullName'] ?? 'Thành viên',
                        };
                      }
                      return m;
                    }).toList();
                  });
                  AppToast.show(
                    context,
                    message: 'Đã xóa biệt danh thành công',
                    type: AppToastType.success,
                  );
                  final conversationService = context.read<AppServices>().conversationService;
                  conversationService.deleteConversationAlias(
                    conversationId: "group:${widget.groupId}",
                    userId: userId,
                  ).catchError((e) {
                    debugPrint("Error deleting alias: $e");
                    _loadMembers();
                    return <String, dynamic>{};
                  });
                },
                child: const Text('Xóa biệt danh', style: TextStyle(color: Colors.red)),
              ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
              onPressed: () {
                final newAlias = controller.text.trim();
                Navigator.pop(dialogCtx);
                setState(() {
                  _members = _members.map((m) {
                    if (m['userId']?.toString() == userId) {
                      return {
                        ...m,
                        'alias': newAlias.isEmpty ? null : newAlias,
                        'displayName': newAlias.isEmpty ? (m['fullName'] ?? 'Thành viên') : newAlias,
                      };
                    }
                    return m;
                  }).toList();
                });
                AppToast.show(
                  context,
                  message: newAlias.isEmpty ? 'Đã xóa biệt danh thành công' : 'Đã cập nhật biệt danh thành công',
                  type: AppToastType.success,
                );
                final conversationService = context.read<AppServices>().conversationService;
                if (newAlias.isEmpty) {
                  conversationService.deleteConversationAlias(
                    conversationId: "group:${widget.groupId}",
                    userId: userId,
                  ).catchError((e) {
                    debugPrint("Error deleting alias: $e");
                    _loadMembers();
                    return <String, dynamic>{};
                  });
                } else {
                  conversationService.setConversationAlias(
                    conversationId: "group:${widget.groupId}",
                    userId: userId,
                    alias: newAlias,
                  ).catchError((e) {
                    debugPrint("Error setting alias: $e");
                    _loadMembers();
                    return <String, dynamic>{};
                  });
                }
              },
              child: const Text('Lưu'),
            ),
          ],
        );
      },
    );
  }
}
