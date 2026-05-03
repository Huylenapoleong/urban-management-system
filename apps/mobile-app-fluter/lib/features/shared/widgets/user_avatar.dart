import "package:flutter/material.dart";
import "package:cached_network_image/cached_network_image.dart";
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
  });

  @override
  State<UserAvatar> createState() => _UserAvatarState();
}

class _UserAvatarState extends State<UserAvatar> {
  String? _avatarUrl;
  bool _loading = false;
  static final Set<String> _failedIds = {};

  @override
  void initState() {
    super.initState();
    _avatarUrl = _normalizeUrl(widget.initialAvatarUrl);
    // Always attempt to fetch latest from DB if we have an ID
    _fetchAvatar();
  }

  @override
  void didUpdateWidget(UserAvatar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialAvatarUrl != oldWidget.initialAvatarUrl) {
      setState(() => _avatarUrl = _normalizeUrl(widget.initialAvatarUrl));
    }
    if ((_avatarUrl == null || _avatarUrl!.isEmpty) && 
        (widget.userId != oldWidget.userId || widget.groupId != oldWidget.groupId)) {
      _fetchAvatar();
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

    if (widget.userId != null && widget.userService != null) {
      setState(() => _loading = true);
      try {
        final profile = await widget.userService!.getUserById(widget.userId!);
        if (mounted) {
          setState(() {
            _avatarUrl = _normalizeUrl(profile.avatarUrl ?? profile.avatarAsset?.resolvedUrl);
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
        if (mounted) {
          setState(() {
            _avatarUrl = _normalizeUrl(group["avatarUrl"]?.toString());
            _loading = false;
          });
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

  @override
  Widget build(BuildContext context) {
    final isGroup = widget.groupId != null;
    final name = widget.initialDisplayName ?? (isGroup ? "Group" : "U");
    final initials = name.isNotEmpty ? name[0].toUpperCase() : (isGroup ? "G" : "U");
    final bgColor = isGroup ? const Color(0xFF7C3AED) : _getBackgroundColor(name);

    Widget avatarContent;

    if (_avatarUrl != null && _avatarUrl!.isNotEmpty) {
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
                border: Border.all(color: Colors.white, width: 2),
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
        shape: isGroup ? BoxShape.rectangle : BoxShape.circle,
        borderRadius: isGroup ? BorderRadius.circular(widget.radius * 0.5) : null,
      ),
      child: Center(
        child: loading
            ? SizedBox(
                width: widget.radius,
                height: widget.radius,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(bgColor),
                ),
              )
            : isGroup && (_avatarUrl == null || _avatarUrl!.isEmpty)
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
