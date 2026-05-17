import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../services/upload_service.dart';
import '../../../services/user_service.dart';
import '../../../models/user_profile.dart';

class AvatarBottomSheet extends StatefulWidget {
  final UserProfile user;
  final UserService userService;
  final UploadService uploadService;
  final VoidCallback onAvatarChanged;

  const AvatarBottomSheet({
    super.key,
    required this.user,
    required this.userService,
    required this.uploadService,
    required this.onAvatarChanged,
  });

  @override
  State<AvatarBottomSheet> createState() => _AvatarBottomSheetState();

  static Future<void> show(
    BuildContext context, {
    required UserProfile user,
    required UserService userService,
    required UploadService uploadService,
    required VoidCallback onAvatarChanged,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AvatarBottomSheet(
        user: user,
        userService: userService,
        uploadService: uploadService,
        onAvatarChanged: onAvatarChanged,
      ),
    );
  }
}

class _AvatarBottomSheetState extends State<AvatarBottomSheet> {
  final _picker = ImagePicker();
  List<String> _history = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  String get _historyKey => "avatar_history_\${widget.user.id}";

  Future<void> _loadHistory() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _history = prefs.getStringList(_historyKey) ?? [];
    });
  }

  Future<void> _saveToHistory(String url, {String? key}) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> current = prefs.getStringList(_historyKey) ?? [];
    
    // Try to extract key from URL if missing
    final effectiveKey = key ?? _tryExtractKey(url);

    // Create a unique identifier for this history item
    final newItemJson = jsonEncode({
      "url": url,
      "key": effectiveKey,
    });

    // Remove duplicates (checking both raw URL and JSON format)
    current.removeWhere((item) {
      if (item == url) return true;
      try {
        final decoded = jsonDecode(item);
        return decoded["url"] == url || (key != null && decoded["key"] == key);
      } catch (_) {
        return false;
      }
    });

    current.insert(0, newItemJson);
    if (current.length > 10) {
      current = current.sublist(0, 10);
    }
    await prefs.setStringList(_historyKey, current);
    setState(() {
      _history = current;
    });
  }

  Future<void> _pickAndUploadImage(ImageSource source) async {
    try {
      final XFile? image = await _picker.pickImage(
        source: source,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 80,
      );
      if (image == null) return;

      setState(() => _isLoading = true);

      // Upload
      final uploaded = await widget.uploadService.uploadMedia(
        filePath: image.path,
        target: "AVATAR",
        entityId: widget.user.id,
      );

      print("[AVATAR] Uploaded successfully: \${uploaded.url} (Key: \${uploaded.key})");

      // Save old avatar to history if exists
      if (widget.user.avatarUrl != null && widget.user.avatarUrl!.isNotEmpty) {
        print("[AVATAR] Saving old avatar to history: \${widget.user.avatarUrl}");
        await _saveToHistory(
          widget.user.avatarUrl!,
          key: widget.user.avatarAsset?.key,
        );
      }

      // Update profile
      print("[AVATAR] Updating profile with avatarKey: \${uploaded.key}");
      await widget.userService.updateProfile({
        "avatarKey": uploaded.key,
      });

      print("[AVATAR] Profile updated. Calling onAvatarChanged.");
      widget.onAvatarChanged();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Cập nhật ảnh đại diện thành công!")),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Lỗi tải ảnh: \$e")),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  String? _tryExtractKey(String url) {
    // If it's already a short key (no http), return as is
    if (!url.startsWith("http")) return url;
    
    // Try to find the uploads segment which is the start of our S3 keys
    if (url.contains("/uploads/")) {
      final keyPart = url.substring(url.indexOf("uploads/")).split("?").first;
      return Uri.decodeComponent(keyPart);
    }
    return null;
  }

  Future<void> _selectFromHistory(String itemJson) async {
    try {
      String? url;
      String? key;
      
      try {
        final decoded = jsonDecode(itemJson);
        url = decoded["url"];
        key = decoded["key"];
      } catch (_) {
        url = itemJson; // Fallback for old format
      }

      // Try to extract key from URL if missing
      if (key == null && url != null) {
        key = _tryExtractKey(url);
      }

      if (url == null && key == null) return;

      setState(() => _isLoading = true);
      // Save current to history before changing
      if (widget.user.avatarUrl != null && widget.user.avatarUrl!.isNotEmpty) {
        await _saveToHistory(
          widget.user.avatarUrl!,
          key: widget.user.avatarAsset?.key,
        );
      }
      
      final payload = <String, dynamic>{};
      if (key != null && key.isNotEmpty) {
        payload["avatarKey"] = key;
      } else {
        payload["avatarUrl"] = url;
      }

      print("[AVATAR] Selecting from history. Payload: \$payload");
      await widget.userService.updateProfile(payload);

      widget.onAvatarChanged();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Đã khôi phục ảnh đại diện cũ!")),
        );
      }
    } catch (e) {
      print("Error changing to old avatar: \$e");
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Lỗi cập nhật ảnh: \$e")),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Drag handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 24),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const Text(
            "Cập nhật ảnh đại diện",
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Color(0xFF1E1B4B),
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          if (_isLoading)
            const Padding(
              padding: EdgeInsets.all(32.0),
              child: Center(child: CircularProgressIndicator()),
            )
          else ...[
            ListTile(
              leading: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.photo_library, color: Colors.blue.shade600),
              ),
              title: const Text("Chọn từ thư viện", style: TextStyle(fontWeight: FontWeight.w500)),
              onTap: () => _pickAndUploadImage(ImageSource.gallery),
            ),
            ListTile(
              leading: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.purple.shade50,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.camera_alt, color: Colors.purple.shade600),
              ),
              title: const Text("Chụp ảnh mới", style: TextStyle(fontWeight: FontWeight.w500)),
              onTap: () => _pickAndUploadImage(ImageSource.camera),
            ),
            if (_history.isNotEmpty) ...[
              const Divider(height: 32),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                child: Text(
                  "Lịch sử ảnh (Chọn để đổi lại)",
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              SizedBox(
                height: 80,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: _history.length,
                  itemBuilder: (context, index) {
                    final itemJson = _history[index];
                    String displayUrl;
                    try {
                      displayUrl = jsonDecode(itemJson)["url"];
                    } catch (_) {
                      displayUrl = itemJson;
                    }
                    
                    return GestureDetector(
                      onTap: () => _selectFromHistory(itemJson),
                      child: Container(
                        margin: const EdgeInsets.only(right: 12),
                        width: 70,
                        height: 70,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.grey.shade200, width: 2),
                          image: DecorationImage(
                            image: NetworkImage(displayUrl),
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
            const SizedBox(height: 24),
          ],
        ],
      ),
    );
  }
}
