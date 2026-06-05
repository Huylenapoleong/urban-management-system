import "package:flutter/material.dart";
import "package:cached_network_image/cached_network_image.dart";
import "package:shared_preferences/shared_preferences.dart";
import "../../../services/user_service.dart";
import "../../../services/group_service.dart";
import "../../../core/config/app_config.dart";

class UserAvatar extends StatefulWidget {
  final String? userId;
  final String? groupId;
  final String? initialAvatarUrl;
  final String? initialDisplayName;
  final double radius;
  final bool showStatus;
  final bool isActive;
  final UserService? userService;
  final GroupService? groupService;
  final List<String>? memberAvatars;

  const UserAvatar({
    super.key,
    this.userId,
    this.groupId,
    this.initialAvatarUrl,
    this.initialDisplayName,
    this.radius = 24,
    this.showStatus = false,
    this.isActive = false,
    this.userService,
    this.groupService,
    this.memberAvatars,
  });

  @override
  State<UserAvatar> createState() => _UserAvatarState();
}

class _UserAvatarState extends State<UserAvatar> {
  String? _avatarUrl;
  bool _loading = false;
  static final Set<String> _failedIds = {};
  static final Map<String, String> _resolvedAvatarUrls = {};
  static final Map<String, List<String>> _groupGridAvatars = {};

  @override
  void initState() {
    super.initState();
    final id = widget.userId ?? widget.groupId;
    _avatarUrl = _normalizeUrl(widget.initialAvatarUrl);
    
    if (_avatarUrl != null && _avatarUrl!.isNotEmpty && id != null) {
      _resolvedAvatarUrls[id] = _avatarUrl!;
    }
    
    if ((_avatarUrl == null || _avatarUrl!.isEmpty) && id != null) {
      if (_resolvedAvatarUrls.containsKey(id)) {
        _avatarUrl = _resolvedAvatarUrls[id];
      }
    }
    
    if ((_avatarUrl == null || _avatarUrl!.isEmpty) && id != null) {
      final hasGrid = widget.memberAvatars != null || (widget.groupId != null && _groupGridAvatars.containsKey(widget.groupId));
      if (!hasGrid) {
        _fetchAvatar();
      }
    }
  }

  @override
  void didUpdateWidget(UserAvatar oldWidget) {
    super.didUpdateWidget(oldWidget);
    final id = widget.userId ?? widget.groupId;
    
    if (widget.initialAvatarUrl != oldWidget.initialAvatarUrl) {
      final normalized = _normalizeUrl(widget.initialAvatarUrl);
      if (normalized != null && normalized.isNotEmpty && id != null) {
        _resolvedAvatarUrls[id] = normalized;
      }
      setState(() => _avatarUrl = normalized);
    }
    
    if ((_avatarUrl == null || _avatarUrl!.isEmpty) && 
        (widget.userId != oldWidget.userId || widget.groupId != oldWidget.groupId || widget.memberAvatars != oldWidget.memberAvatars)) {
      if (id != null && _resolvedAvatarUrls.containsKey(id)) {
        setState(() => _avatarUrl = _resolvedAvatarUrls[id]);
      } else {
        final hasGrid = widget.memberAvatars != null || (widget.groupId != null && _groupGridAvatars.containsKey(widget.groupId));
        if (!hasGrid) {
          _fetchAvatar();
        }
      }
    }
  }

  String? _normalizeUrl(String? url) {
    if (url == null || url.isEmpty) return null;
    if (url.startsWith("http")) return url;
    
    String base = AppConfig.apiBaseUrl;
    if (base.endsWith("/")) base = base.substring(0, base.length - 1);
    
    String cleanPath = url;
    if (cleanPath.startsWith("/")) cleanPath = cleanPath.substring(1);
    
    // Some backends serve at /api/uploads, some at /uploads
    // We'll try to be smart here.
    String fullUrl;
    if (cleanPath.startsWith("api/")) {
      // Path already has api/, just prepend the origin (base minus /api)
      final root = base.replaceAll(RegExp(r"/api$"), "");
      fullUrl = "$root/$cleanPath";
    } else if (base.endsWith("/api")) {
      fullUrl = "$base/$cleanPath";
    } else {
      // Base doesn't have /api, and path doesn't have api/
      // Try adding /api/ first as it's the most common for our setup
      fullUrl = "$base/api/$cleanPath";
    }
    
    debugPrint("[AVATAR_DEBUG] Original: $url -> Normalized: $fullUrl");
    return fullUrl;
  }

  Future<void> _fetchAvatar() async {
    if (_loading || (widget.userId == null && widget.groupId == null)) return;
    
    final id = widget.userId ?? widget.groupId!;
    if (_failedIds.contains(id)) return;

    if (widget.groupId != null) {
      try {
        final prefs = await SharedPreferences.getInstance();
        final localOverride = prefs.getString("group_avatar_override_$id");
        if (localOverride != null && localOverride.isNotEmpty) {
          final normalized = _normalizeUrl(localOverride);
          if (normalized != null && normalized.isNotEmpty) {
            _resolvedAvatarUrls[id] = normalized;
          }
          if (mounted) {
            setState(() {
              _avatarUrl = normalized;
            });
            return;
          }
        }
      } catch (e) {
        debugPrint("Error reading group avatar override: $e");
      }
    }

    if (widget.userId != null && widget.userService != null) {
      setState(() => _loading = true);
      try {
        final profile = await widget.userService!.getUserById(widget.userId!);
        final url = _normalizeUrl(profile.avatarUrl ?? profile.avatarAsset?.resolvedUrl);
        if (url != null && url.isNotEmpty) {
          _resolvedAvatarUrls[id] = url;
        }
        if (mounted) {
          setState(() {
            _avatarUrl = url;
            _loading = false;
          });
        }
      } catch (_) {
        if (mounted) setState(() => _loading = false);
      }
    } else if (widget.groupId != null && widget.groupService != null) {
      setState(() => _loading = true);
      try {
        final group = await widget.groupService!.getGroup(widget.groupId!);
        final url = _normalizeUrl(group["avatarUrl"]?.toString());
        if (url != null && url.isNotEmpty) {
          _resolvedAvatarUrls[id] = url;
          if (mounted) {
            setState(() {
              _avatarUrl = url;
              _loading = false;
            });
          }
        } else {
          // Fetch members to build the 2x2 grid
          final members = await widget.groupService!.listMembers(widget.groupId!);
          final firstMembers = members.take(4).toList();
          final List<String> resolvedAvatars = [];
          for (final m in firstMembers) {
            final uId = m['userId']?.toString();
            if (uId != null && widget.userService != null) {
              try {
                final profile = await widget.userService!.getUserById(uId);
                final uAvatar = profile.avatarUrl ?? profile.avatarAsset?.resolvedUrl;
                if (uAvatar != null && uAvatar.isNotEmpty) {
                  final norm = _normalizeUrl(uAvatar);
                  resolvedAvatars.add(norm ?? "");
                } else {
                  resolvedAvatars.add("");
                }
              } catch (_) {
                resolvedAvatars.add("");
              }
            } else {
              resolvedAvatars.add("");
            }
          }
          _groupGridAvatars[widget.groupId!] = resolvedAvatars;
          if (mounted) {
            setState(() {
              _avatarUrl = null;
              _loading = false;
            });
          }
        }
      } catch (e) {
        if (mounted) {
          setState(() => _loading = false);
          _failedIds.add(id);
        }
      }
    }
  }

  Color _getBackgroundColor(String name) {
    if (name.isEmpty) return const Color(0xFF7C3AED);
    final colors = [
      const Color(0xFFEF4444), // Red
      const Color(0xFFF59E0B), // Amber
      const Color(0xFF10B981), // Emerald
      const Color(0xFF3B82F6), // Blue
      const Color(0xFF6366F1), // Indigo
      const Color(0xFF8B5CF6), // Violet
      const Color(0xFFEC4899), // Pink
    ];
    final hash = name.codeUnits.fold(0, (prev, element) => prev + element);
    return colors[hash % colors.length];
  }

  Widget _buildGridAvatar(List<String> avatars, String initials, Color bgColor) {
    final double size = widget.radius * 2;
    final nonNullAvatars = avatars.where((url) => url.isNotEmpty).toList();
    if (nonNullAvatars.isEmpty) {
      return _buildInitials(initials, bgColor);
    }
    
    if (nonNullAvatars.length == 1) {
      return _buildSingleAvatar(nonNullAvatars[0], widget.radius);
    }

    if (nonNullAvatars.length == 2) {
      return SizedBox(
        width: size,
        height: size,
        child: Stack(
          children: [
            Positioned(
              left: 0,
              top: 0,
              child: _buildSingleAvatar(nonNullAvatars[0], widget.radius * 0.6),
            ),
            Positioned(
              right: 0,
              bottom: 0,
              child: _buildSingleAvatar(nonNullAvatars[1], widget.radius * 0.6),
            ),
          ],
        ),
      );
    }

    if (nonNullAvatars.length == 3) {
      return SizedBox(
        width: size,
        height: size,
        child: Stack(
          children: [
            Positioned(
              left: widget.radius * 0.4,
              top: 0,
              child: _buildSingleAvatar(nonNullAvatars[0], widget.radius * 0.55),
            ),
            Positioned(
              left: 0,
              bottom: 0,
              child: _buildSingleAvatar(nonNullAvatars[1], widget.radius * 0.55),
            ),
            Positioned(
              right: 0,
              bottom: 0,
              child: _buildSingleAvatar(nonNullAvatars[2], widget.radius * 0.55),
            ),
          ],
        ),
      );
    }

    return SizedBox(
      width: size,
      height: size,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildSingleAvatar(nonNullAvatars[0], widget.radius * 0.48),
              _buildSingleAvatar(nonNullAvatars[1], widget.radius * 0.48),
            ],
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildSingleAvatar(nonNullAvatars[2], widget.radius * 0.48),
              _buildSingleAvatar(nonNullAvatars[3], widget.radius * 0.48),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSingleAvatar(String url, double radius) {
    if (url.isEmpty) {
      return Container(
        width: radius * 2,
        height: radius * 2,
        decoration: BoxDecoration(
          color: const Color(0xFF64748B).withOpacity(0.2),
          shape: BoxShape.circle,
        ),
        child: Center(
          child: Icon(Icons.person, color: const Color(0xFF64748B), size: radius * 1.2),
        ),
      );
    }
    
    return Container(
      width: radius * 2,
      height: radius * 2,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: Theme.of(context).brightness == Brightness.dark
              ? const Color(0xFF0F172A)
              : Colors.white,
          width: 1,
        ),
      ),
      child: ClipOval(
        child: CachedNetworkImage(
          imageUrl: url,
          fit: BoxFit.cover,
          placeholder: (context, url) => Container(
            color: Colors.grey,
          ),
          errorWidget: (context, url, error) => Container(
            color: const Color(0xFF64748B).withOpacity(0.2),
            child: Center(
              child: Icon(Icons.person, color: const Color(0xFF64748B), size: radius * 1.2),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isGroup = widget.groupId != null;
    final name = widget.initialDisplayName ?? (isGroup ? "Group" : "U");
    final initials = name.isNotEmpty ? name[0].toUpperCase() : (isGroup ? "G" : "U");
    final bgColor = isGroup ? const Color(0xFF7C3AED) : _getBackgroundColor(name);

    Widget avatarContent;

    final hasCustomAvatar = _avatarUrl != null && _avatarUrl!.isNotEmpty;
    final gridAvatars = widget.memberAvatars ?? (widget.groupId != null ? _groupGridAvatars[widget.groupId] : null);

    if (hasCustomAvatar) {
      avatarContent = CachedNetworkImage(
        imageUrl: _avatarUrl!,
        imageBuilder: (context, imageProvider) => Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            image: DecorationImage(image: imageProvider, fit: BoxFit.cover),
          ),
        ),
        placeholder: (context, url) => _buildInitials(initials, bgColor, loading: true),
        errorWidget: (context, url, error) => _buildInitials(initials, bgColor),
      );
    } else if (isGroup && gridAvatars != null && gridAvatars.isNotEmpty) {
      avatarContent = _buildGridAvatar(gridAvatars, initials, bgColor);
    } else if (_loading) {
      avatarContent = _buildInitials(initials, bgColor, loading: true);
    } else {
      avatarContent = _buildInitials(initials, bgColor);
    }

    return Stack(
      children: [
        SizedBox(
          width: widget.radius * 2,
          height: widget.radius * 2,
          child: avatarContent,
        ),
        if (widget.showStatus)
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: widget.radius * 0.6,
              height: widget.radius * 0.6,
              decoration: BoxDecoration(
                color: widget.isActive ? Colors.green : Colors.grey,
                shape: BoxShape.circle,
                border: Border.all(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? (Theme.of(context).cardTheme.color ?? const Color(0xFF1E293B))
                      : Colors.white,
                  width: 2,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildInitials(String initials, Color bgColor, {bool loading = false}) {
    final isGroup = widget.groupId != null;
    return Container(
      decoration: BoxDecoration(
        color: isGroup ? bgColor.withOpacity(0.1) : bgColor.withOpacity(0.2),
        shape: BoxShape.circle,
      ),
      child: Center(
        child: isGroup && (_avatarUrl == null || _avatarUrl!.isEmpty)
            ? Icon(Icons.group, color: bgColor, size: widget.radius * 1.2)
            : Text(
                initials,
                style: TextStyle(
                  color: bgColor,
                  fontWeight: FontWeight.bold,
                  fontSize: widget.radius * 0.8,
                ),
              ),
      ),
    );
  }
}
