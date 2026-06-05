import "package:flutter/material.dart";
import "package:intl/intl.dart";
import "package:geolocator/geolocator.dart";
import "package:image_picker/image_picker.dart";
import "package:geocoding/geocoding.dart";
import "package:provider/provider.dart";
import "package:cached_network_image/cached_network_image.dart";
import "dart:io";

import "../../models/report_item.dart";
import "../../services/report_service.dart";
import "../../services/upload_service.dart";
import "../../services/location_service.dart";
import "../../services/app_services.dart";
import "../../state/session_controller.dart";
import "../shared/widgets/app_logo_button.dart";
import "../shared/widgets/app_toast.dart";

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({
    super.key,
    required this.reportService,
    this.uploadService,
    this.locationService,
  });

  final ReportService reportService;
  final UploadService? uploadService;
  final LocationService? locationService;

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  final _searchController = TextEditingController();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _locationController = TextEditingController(text: "VN-79");

  String _category = "INFRASTRUCTURE";
  String _priority = "MEDIUM";
  bool _loading = true;
  String? _error;
  List<ReportItem> _reports = const <ReportItem>[];
  String _filterStatus = "ALL";
  final List<XFile> _selectedMedia = [];
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadReports();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _titleController.dispose();
    _descriptionController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _loadReports() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final reports = await widget.reportService.listReports(
        mine: true,
        limit: 50,
        query: _searchController.text.trim().isEmpty ? null : _searchController.text.trim(),
      );
      if (!mounted) return;
      
      setState(() {
        if (_filterStatus == "ALL") {
          _reports = reports;
        } else {
          _reports = reports.where((r) => r.status.toUpperCase() == _filterStatus).toList();
        }
      });
    } catch (error) {
      if (!mounted) return;
      setState(() { _error = "$error"; });
    } finally {
      if (mounted) setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        elevation: 0,
        leading: const AppLogoButton(),
        title: Text(
          "Báo cáo sự cố",
          style: TextStyle(
            color: isDark ? Colors.white : const Color(0xFF1E1B4B),
            fontWeight: FontWeight.bold,
          ),
        ),
        centerTitle: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline, color: Color(0xFF7C3AED), size: 28),
            onPressed: _showCreateReportSheet,
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          _buildSearchBar(),
          _buildFilters(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFF7C3AED)))
                : _error != null
                    ? _buildErrorState()
                    : RefreshIndicator(
                        onRefresh: _loadReports,
                        child: _reports.isEmpty ? _buildEmptyState() : _buildReportList(),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      color: isDark ? const Color(0xFF0F172A) : Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Container(
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(16),
        ),
        child: TextField(
          controller: _searchController,
          onSubmitted: (_) => _loadReports(),
          style: TextStyle(color: isDark ? Colors.white : Colors.black87),
          decoration: InputDecoration(
            hintText: "Search your reports...",
            hintStyle: TextStyle(color: isDark ? Colors.grey.shade400 : Colors.grey),
            prefixIcon: const Icon(Icons.search, color: Colors.grey),
            border: InputBorder.none,
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
        ),
      ),
    );
  }

  Widget _buildFilters() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final statuses = ["ALL", "NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"];
    return Container(
      height: 50,
      padding: const EdgeInsets.only(bottom: 8),
      color: isDark ? const Color(0xFF0F172A) : Colors.white,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: statuses.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final status = statuses[index];
          final isSelected = _filterStatus == status;
          return ChoiceChip(
            label: Text(status.replaceAll("_", " ")),
            selected: isSelected,
            onSelected: (val) {
              setState(() { _filterStatus = status; });
              _loadReports();
            },
            selectedColor: const Color(0xFF7C3AED).withOpacity(0.15),
            labelStyle: TextStyle(
              color: isSelected 
                  ? const Color(0xFF7C3AED) 
                  : (isDark ? Colors.grey.shade400 : Colors.grey.shade600),
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              fontSize: 12,
            ),
            backgroundColor: Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: BorderSide(
                color: isSelected 
                    ? const Color(0xFF7C3AED) 
                    : (isDark ? Colors.grey.shade800 : Colors.grey.shade300),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildReportList() {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _reports.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final report = _reports[index];
        return _ReportCard(
          report: report,
          onTap: () => _showReportDetailSheet(report),
        );
      },
    );
  }

  Widget _buildEmptyState() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ListView(
      children: [
        const SizedBox(height: 120),
        Icon(Icons.description_outlined, size: 80, color: isDark ? Colors.grey.shade700 : Colors.grey.shade300),
        const SizedBox(height: 16),
        Center(
          child: Text(
            "No reports found",
            style: TextStyle(color: isDark ? Colors.grey.shade500 : Colors.grey, fontSize: 16),
          ),
        ),
      ],
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 48, color: Colors.redAccent),
          const SizedBox(height: 16),
          Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.redAccent)),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: _loadReports, child: const Text("Retry")),
        ],
      ),
    );
  }

  void _showCreateReportSheet() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final session = context.read<SessionController>();
    _locationController.text = "";

    if (widget.locationService != null &&
        session.user?.locationCode != null &&
        session.user!.locationCode.isNotEmpty) {
      widget.locationService!
          .resolveLocationCode(session.user!.locationCode)
          .then((resolved) {
        if (mounted) {
          setState(() {
            final displayName = resolved.displayName;
            _locationController.text = displayName;
          });
        }
      }).catchError((_) {});
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, scrollController) => StatefulBuilder(
          builder: (context, setModalState) => SingleChildScrollView(
            controller: scrollController,
            padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(child: Container(width: 40, height: 4, decoration: const BoxDecoration(color: Colors.grey, borderRadius: BorderRadius.all(Radius.circular(2))))),
                const SizedBox(height: 20),
                Text(
                  "Báo cáo mới",
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                  ),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _titleController,
                  style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                  decoration: InputDecoration(
                    labelText: "Chuyện gì đang xảy ra?",
                    labelStyle: TextStyle(color: isDark ? Colors.grey.shade400 : null),
                    hintText: "Tiêu đề ngắn gọn của sự cố",
                    hintStyle: TextStyle(color: isDark ? Colors.grey.shade500 : null),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: isDark ? Colors.grey.shade700 : Colors.grey.shade300),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _descriptionController,
                  maxLines: 4,
                  style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                  decoration: InputDecoration(
                    labelText: "Mô tả chi tiết",
                    labelStyle: TextStyle(color: isDark ? Colors.grey.shade400 : null),
                    hintText: "Cung cấp thêm thông tin...",
                    hintStyle: TextStyle(color: isDark ? Colors.grey.shade500 : null),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: isDark ? Colors.grey.shade700 : Colors.grey.shade300),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                _buildLocationField(),
                const SizedBox(height: 16),
                _buildDropdowns(),
                const SizedBox(height: 16),
                Text(
                  "Hình ảnh & Video đính kèm",
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.white : Colors.black,
                  ),
                ),
                const SizedBox(height: 8),
                _buildMediaPicker(setModalState),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: FilledButton(
                    onPressed: _submitting ? null : () => _submitReport(setModalState),
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF7C3AED),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: _submitting 
                      ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text("Gửi báo cáo", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMediaPicker([StateSetter? setModalState]) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return SizedBox(
      height: 100,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _selectedMedia.length + 1,
        itemBuilder: (context, index) {
          if (index == _selectedMedia.length) {
            return GestureDetector(
              onTap: () => _pickMedia(setModalState),
              child: Padding(
                padding: const EdgeInsets.only(right: 8, top: 6),
                child: Container(
                  width: 90,
                  height: 90,
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF0F172A) : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isDark ? Colors.grey.shade800 : Colors.grey.shade300,
                      style: BorderStyle.solid,
                    ),
                  ),
                  child: Icon(Icons.add_a_photo_outlined, color: isDark ? Colors.grey.shade400 : Colors.grey),
                ),
              ),
            );
          }
          final file = _selectedMedia[index];
          final isVideo = file.path.endsWith(".mp4") || file.path.endsWith(".mov");
          return Padding(
            padding: const EdgeInsets.only(right: 8, top: 6),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 90,
                  height: 90,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    image: isVideo ? null : DecorationImage(image: FileImage(File(file.path)), fit: BoxFit.cover),
                    color: isVideo ? Colors.black87 : null,
                  ),
                  child: isVideo ? const Center(child: Icon(Icons.videocam, color: Colors.white)) : null,
                ),
                Positioned(
                  top: -6,
                  right: -6,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () {
                      if (setModalState != null) {
                        setModalState(() => _selectedMedia.removeAt(index));
                      } else {
                        _selectedMedia.removeAt(index);
                      }
                      setState(() {});
                    },
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                      child: const Icon(Icons.close, size: 14, color: Colors.white),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _pickMedia([StateSetter? setModalState]) async {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final picker = ImagePicker();
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(Icons.camera_alt, color: isDark ? Colors.white : Colors.black87),
              title: Text("Chụp ảnh", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: Icon(Icons.videocam, color: isDark ? Colors.white : Colors.black87),
              title: Text("Quay video", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
              onTap: () async {
                Navigator.pop(context);
                final video = await picker.pickVideo(source: ImageSource.camera);
                if (video != null) {
                  if (setModalState != null) {
                    setModalState(() => _selectedMedia.add(video));
                  } else {
                    _selectedMedia.add(video);
                  }
                  setState(() {});
                }
              },
            ),
            ListTile(
              leading: Icon(Icons.photo_library, color: isDark ? Colors.white : Colors.black87),
              title: Text("Chọn từ thư viện", style: TextStyle(color: isDark ? Colors.white : Colors.black87)),
              onTap: () async {
                Navigator.pop(context);
                final media = await picker.pickMultipleMedia();
                if (media.isNotEmpty) {
                  if (setModalState != null) {
                    setModalState(() => _selectedMedia.addAll(media));
                  } else {
                    _selectedMedia.addAll(media);
                  }
                  setState(() {});
                }
              },
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    
    final xFile = await picker.pickImage(source: source);
    if (xFile != null) {
      if (setModalState != null) {
        setModalState(() => _selectedMedia.add(xFile));
      } else {
        _selectedMedia.add(xFile);
      }
      setState(() {});
    }
  }

  Widget _buildLocationField() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return TextField(
      controller: _locationController,
      style: TextStyle(color: isDark ? Colors.white : Colors.black87),
      decoration: InputDecoration(
        labelText: "Địa chỉ sự cố",
        labelStyle: TextStyle(color: isDark ? Colors.grey.shade400 : null),
        hintText: "Nhập địa chỉ hoặc căn hộ của bạn",
        hintStyle: TextStyle(color: isDark ? Colors.grey.shade500 : null),
        prefixIcon: Icon(Icons.location_on_outlined, color: isDark ? Colors.grey.shade400 : Colors.grey),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: isDark ? Colors.grey.shade700 : Colors.grey.shade300),
        ),
      ),
    );
  }

  Widget _buildDropdowns() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Row(
      children: [
        Expanded(
          child: DropdownButtonFormField<String>(
            value: _category,
            style: TextStyle(color: isDark ? Colors.white : Colors.black87),
            dropdownColor: isDark ? const Color(0xFF1E293B) : Colors.white,
            decoration: InputDecoration(
              labelText: "Phân loại",
              labelStyle: TextStyle(color: isDark ? Colors.grey.shade400 : null),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: isDark ? Colors.grey.shade700 : Colors.grey.shade300),
              ),
            ),
            items: const [
              DropdownMenuItem(value: "INFRASTRUCTURE", child: Text("Hạ tầng")),
              DropdownMenuItem(value: "ENVIRONMENT", child: Text("Môi trường")),
              DropdownMenuItem(value: "SECURITY", child: Text("An ninh")),
              DropdownMenuItem(value: "ADMIN", child: Text("Hành chính")),
            ],
            onChanged: (val) => setState(() => _category = val!),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: DropdownButtonFormField<String>(
            value: _priority,
            style: TextStyle(color: isDark ? Colors.white : Colors.black87),
            dropdownColor: isDark ? const Color(0xFF1E293B) : Colors.white,
            decoration: InputDecoration(
              labelText: "Ưu tiên",
              labelStyle: TextStyle(color: isDark ? Colors.grey.shade400 : null),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: isDark ? Colors.grey.shade700 : Colors.grey.shade300),
              ),
            ),
            items: const [
              DropdownMenuItem(value: "LOW", child: Text("Thấp")),
              DropdownMenuItem(value: "MEDIUM", child: Text("Trung bình")),
              DropdownMenuItem(value: "HIGH", child: Text("Cao")),
              DropdownMenuItem(value: "URGENT", child: Text("Khẩn cấp")),
            ],
            onChanged: (val) => setState(() => _priority = val!),
          ),
        ),
      ],
    );
  }

  String _normalizeLocationCode(String code) {
    // Backend V2 requires VN-XX (digits). 
    // If we have legacy VN-HCM..., map HCM to 79.
    final upper = code.trim().toUpperCase();
    if (upper.contains("HCM") || upper.contains("HCMC")) return "VN-79";
    if (upper.contains("HAN") || upper.contains("HANOI")) return "VN-01";
    
    // If it already matches V2 pattern, keep it
    if (RegExp(r'^VN-(\d{2})(?:-(\d{5}))?$').hasMatch(upper)) return upper;
    
    // Fallback to HCM if unknown but has VN prefix
    if (upper.startsWith("VN")) return "VN-79";
    
    return "VN-79";
  }

  Future<void> _submitReport([StateSetter? setModalState]) async {
    if (_titleController.text.trim().isEmpty) {
      AppToast.show(context, message: "Vui lòng nhập tiêu đề", type: AppToastType.warning);
      return;
    }

    if (setModalState != null) {
      setModalState(() => _submitting = true);
    }
    setState(() => _submitting = true);
    try {
      final List<String> mediaKeys = [];
      final List<String> mediaUrls = [];

      if (widget.uploadService != null && _selectedMedia.isNotEmpty) {
        for (final file in _selectedMedia) {
          final asset = await widget.uploadService!.uploadMedia(
            filePath: file.path,
            target: "REPORT",
          );
          mediaKeys.add(asset.key);
          if (asset.url != null) {
            mediaUrls.add(asset.url!);
          }
        }
      }

      final session = context.read<SessionController>();
      final userLocationCode = session.user?.locationCode ?? "VN-79";
      
      String inputLocation = _locationController.text.trim();
      String finalDescription = _descriptionController.text.trim();
      
      // If user typed a human address or detected one, put it in description
      if (!inputLocation.startsWith("VN-")) {
        finalDescription = "Địa chỉ: $inputLocation\n\n$finalDescription";
      }

      // We MUST send the exact location code that matches the user's scope in JWT/DB to avoid a 403.
      // Do not normalize/modify userLocationCode since the profile location code is already in database-valid format.
      final apiLocationCode = userLocationCode;

      await widget.reportService.createReport(
        title: _titleController.text.trim(),
        description: finalDescription,
        category: _category,
        priority: _priority,
        locationCode: apiLocationCode,
        mediaKeys: mediaKeys,
        mediaUrls: mediaUrls,
      );
      if (!mounted) return;
      Navigator.pop(context);
      _titleController.clear();
      _descriptionController.clear();
      _selectedMedia.clear();
      _loadReports();
      AppToast.show(context, message: "Gửi báo cáo thành công!", type: AppToastType.success);
    } catch (e) {
      if (mounted) AppToast.show(context, message: "Lỗi: $e", type: AppToastType.error);
    } finally {
      if (mounted) {
        if (setModalState != null) {
          setModalState(() => _submitting = false);
        }
        setState(() => _submitting = false);
      }
    }
  }

  Widget _buildPriorityBadge(String priority) {
    Color color;
    String label;
    switch (priority.toUpperCase()) {
      case "URGENT":
        color = Colors.red.shade900;
        label = "KHẨN CẤP";
        break;
      case "HIGH":
        color = Colors.red;
        label = "CAO";
        break;
      case "MEDIUM":
        color = Colors.orange;
        label = "TRUNG BÌNH";
        break;
      case "LOW":
      default:
        color = Colors.blue;
        label = "THẤP";
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        border: Border.all(color: color.withOpacity(0.3)),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toUpperCase()) {
      case "NEW": return Colors.amber.shade700;
      case "IN_PROGRESS": return Colors.blue.shade700;
      case "RESOLVED": return Colors.green.shade700;
      default: return Colors.grey.shade700;
    }
  }

  void _showReportDetailSheet(ReportItem report) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final session = context.read<SessionController>();
    final isOwner = session.user?.id == report.userId;
    final statusColor = _getStatusColor(report.status);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, scrollController) => SingleChildScrollView(
          controller: scrollController,
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: const BoxDecoration(
                    color: Colors.grey,
                    borderRadius: BorderRadius.all(Radius.circular(2)),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      report.status.replaceAll("_", " "),
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  _buildPriorityBadge(report.priority),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                report.title,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.location_on_outlined, size: 16, color: isDark ? Colors.grey.shade400 : Colors.grey),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Builder(
                      builder: (context) {
                        final parsedAddr = _parseReportAddress(report.description, "");
                        if (parsedAddr.isNotEmpty) {
                          return Text(
                            parsedAddr,
                            style: TextStyle(
                              fontSize: 14,
                              color: isDark ? Colors.grey.shade300 : Colors.grey.shade700,
                            ),
                          );
                        }
                        return FutureBuilder<String>(
                          future: LocationResolver.resolve(context, report.locationCode),
                          builder: (context, snapshot) {
                            return Text(
                              snapshot.data ?? report.locationCode,
                              style: TextStyle(
                                fontSize: 14,
                                color: isDark ? Colors.grey.shade300 : Colors.grey.shade700,
                              ),
                            );
                          },
                        );
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                "Phân loại: ${report.category}",
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: isDark ? Colors.grey.shade400 : Colors.grey.shade600,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.person_outline, size: 16, color: isDark ? Colors.grey.shade400 : Colors.grey),
                  const SizedBox(width: 4),
                  Text(
                    "Người báo cáo: ",
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: isDark ? Colors.grey.shade400 : Colors.grey.shade600,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      session.user?.fullName ?? report.userId,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(Icons.schedule_outlined, size: 16, color: isDark ? Colors.grey.shade400 : Colors.grey),
                  const SizedBox(width: 4),
                  Text(
                    "Ngày tạo: ",
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: isDark ? Colors.grey.shade400 : Colors.grey.shade600,
                    ),
                  ),
                  Text(
                    () {
                      final dt = DateTime.tryParse(report.createdAt);
                      if (dt == null) return report.createdAt;
                      final local = dt.toLocal();
                      return "${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/${local.year} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}";
                    }(),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                    ),
                  ),
                ],
              ),
              const Divider(height: 32),
              Text(
                "Mô tả chi tiết",
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: isDark ? Colors.white : Colors.black,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _parseReportDescriptionOnly(report.description).trim().isEmpty
                    ? "Không có mô tả"
                    : _parseReportDescriptionOnly(report.description),
                style: TextStyle(
                  fontSize: 14,
                  height: 1.5,
                  color: isDark ? Colors.grey.shade300 : Colors.grey.shade800,
                ),
              ),
              if (report.mediaUrls.isNotEmpty || report.mediaAssets.isNotEmpty) ...[
                const Divider(height: 32),
                Text(
                  "Hình ảnh đính kèm",
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.white : Colors.black,
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 120,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: report.mediaUrls.isNotEmpty 
                        ? report.mediaUrls.length 
                        : report.mediaAssets.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final url = report.mediaUrls.isNotEmpty 
                          ? report.mediaUrls[index] 
                          : report.mediaAssets[index].resolvedUrl ?? "";
                      return ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: CachedNetworkImage(
                          imageUrl: url,
                          width: 120,
                          height: 120,
                          fit: BoxFit.cover,
                          placeholder: (context, url) => Container(
                            width: 120,
                            height: 120,
                            color: isDark ? const Color(0xFF0F172A) : Colors.grey.shade100,
                            child: const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
                          ),
                          errorWidget: (context, url, error) => Container(
                            width: 120,
                            height: 120,
                            color: isDark ? const Color(0xFF0F172A) : Colors.grey.shade100,
                            child: Icon(Icons.broken_image_outlined, color: isDark ? Colors.grey.shade700 : Colors.grey.shade300),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
              if (isOwner) ...[
                const Divider(height: 32),
                if (report.status.toUpperCase() == 'NEW') ...[
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () {
                            Navigator.pop(context);
                            _showUpdateReportSheet(report);
                          },
                          icon: const Icon(Icons.edit_outlined),
                          label: const Text("Cập nhật"),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF7C3AED),
                            side: const BorderSide(color: Color(0xFF7C3AED)),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () => _deleteReport(report),
                          icon: const Icon(Icons.delete_outline, color: Colors.white),
                          label: const Text("Xóa báo cáo", style: TextStyle(color: Colors.white)),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.redAccent,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                    ],
                  ),
                ] else if (report.status.toUpperCase() == 'RESOLVED') ...[
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: FilledButton.icon(
                      onPressed: () => _closeReport(report),
                      icon: const Icon(Icons.check_circle_outline),
                      label: const Text("Đóng báo cáo", style: TextStyle(fontWeight: FontWeight.bold)),
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.green.shade700,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _showUpdateReportSheet(ReportItem report) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    // Prefill controllers
    final titleUpdateController = TextEditingController(text: report.title);
    final descUpdateController = TextEditingController(text: report.description);
    
    String updateCategory = report.category;
    String updatePriority = report.priority;
    bool updateSubmitting = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, scrollController) => StatefulBuilder(
          builder: (context, setModalState) => SingleChildScrollView(
            controller: scrollController,
            padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(child: Container(width: 40, height: 4, decoration: const BoxDecoration(color: Colors.grey, borderRadius: BorderRadius.all(Radius.circular(2))))),
                const SizedBox(height: 20),
                Text(
                  "Cập nhật báo cáo",
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                  ),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: titleUpdateController,
                  style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                  decoration: InputDecoration(
                    labelText: "Chuyện gì đang xảy ra?",
                    labelStyle: TextStyle(color: isDark ? Colors.grey.shade400 : null),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: isDark ? Colors.grey.shade700 : Colors.grey.shade300),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: descUpdateController,
                  maxLines: 4,
                  style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                  decoration: InputDecoration(
                    labelText: "Mô tả chi tiết",
                    labelStyle: TextStyle(color: isDark ? Colors.grey.shade400 : null),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: isDark ? Colors.grey.shade700 : Colors.grey.shade300),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: updateCategory,
                        style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                        dropdownColor: isDark ? const Color(0xFF1E293B) : Colors.white,
                        decoration: InputDecoration(
                          labelText: "Phân loại",
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        items: const [
                          DropdownMenuItem(value: "INFRASTRUCTURE", child: Text("Hạ tầng")),
                          DropdownMenuItem(value: "ENVIRONMENT", child: Text("Môi trường")),
                          DropdownMenuItem(value: "SECURITY", child: Text("An ninh")),
                          DropdownMenuItem(value: "ADMIN", child: Text("Hành chính")),
                        ],
                        onChanged: (val) => setModalState(() => updateCategory = val!),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: updatePriority,
                        style: TextStyle(color: isDark ? Colors.white : Colors.black87),
                        dropdownColor: isDark ? const Color(0xFF1E293B) : Colors.white,
                        decoration: InputDecoration(
                          labelText: "Ưu tiên",
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        items: const [
                          DropdownMenuItem(value: "LOW", child: Text("Thấp")),
                          DropdownMenuItem(value: "MEDIUM", child: Text("Trung bình")),
                          DropdownMenuItem(value: "HIGH", child: Text("Cao")),
                          DropdownMenuItem(value: "URGENT", child: Text("Khẩn cấp")),
                        ],
                        onChanged: (val) => setModalState(() => updatePriority = val!),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: FilledButton(
                    onPressed: updateSubmitting
                        ? null
                        : () async {
                            if (titleUpdateController.text.trim().isEmpty) {
                              AppToast.show(context, message: "Vui lòng nhập tiêu đề", type: AppToastType.warning);
                              return;
                            }
                            setModalState(() => updateSubmitting = true);
                            try {
                              await widget.reportService.updateReport(
                                report.id,
                                {
                                  "title": titleUpdateController.text.trim(),
                                  "description": descUpdateController.text.trim(),
                                  "category": updateCategory,
                                  "priority": updatePriority,
                                },
                              );
                              if (context.mounted) {
                                Navigator.pop(context);
                                _loadReports();
                                AppToast.show(context, message: "Cập nhật báo cáo thành công!", type: AppToastType.success);
                              }
                            } catch (e) {
                              if (context.mounted) {
                                AppToast.show(context, message: "Lỗi: $e", type: AppToastType.error);
                              }
                            } finally {
                              setModalState(() => updateSubmitting = false);
                            }
                          },
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF7C3AED),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: updateSubmitting
                        ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Text("Lưu thay đổi", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _deleteReport(ReportItem report) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Xóa báo cáo"),
        content: const Text("Bạn có chắc chắn muốn xóa báo cáo này không? Hành động này không thể hoàn tác."),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text("Hủy"),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text("Xóa"),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await widget.reportService.deleteReport(report.id);
        if (mounted) {
          Navigator.pop(context); // Close detail sheet
          _loadReports();
          AppToast.show(context, message: "Đã xóa báo cáo", type: AppToastType.success);
        }
      } catch (e) {
        if (mounted) AppToast.show(context, message: "Lỗi khi xóa: $e", type: AppToastType.error);
      }
    }
  }

  Future<void> _closeReport(ReportItem report) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Đóng báo cáo"),
        content: const Text("Bạn có chắc chắn muốn đóng báo cáo này? Trạng thái sẽ được chuyển sang CLOSED."),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text("Hủy"),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.green),
            child: const Text("Đồng ý"),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await widget.reportService.updateReportStatus(report.id, "CLOSED");
        if (mounted) {
          Navigator.pop(context); // Close detail sheet
          _loadReports();
          AppToast.show(context, message: "Đã đóng báo cáo thành công", type: AppToastType.success);
        }
      } catch (e) {
        if (mounted) AppToast.show(context, message: "Lỗi khi đóng: $e", type: AppToastType.error);
      }
    }
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.report, this.onTap});
  final ReportItem report;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final statusColor = _getStatusColor(report.status);
    final time = DateTime.tryParse(report.updatedAt);
    final formattedTime = time == null ? "" : DateFormat("MMM dd, HH:mm").format(time.toLocal());

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isDark ? Colors.grey.shade800 : const Color(0xFFF1F5F9),
            ),
            boxShadow: isDark 
                ? null 
                : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 10, offset: const Offset(0, 4))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: statusColor.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                    child: Text(report.status.replaceAll("_", " "), style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                  Text(formattedTime, style: TextStyle(color: isDark ? Colors.grey.shade500 : Colors.grey.shade400, fontSize: 11)),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                report.title,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                _parseReportDescriptionOnly(report.description).trim().isEmpty
                    ? "Không có mô tả"
                    : _parseReportDescriptionOnly(report.description),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: isDark ? Colors.grey.shade400 : Colors.grey.shade600, fontSize: 13),
              ),
              _buildMediaGallery(context, isDark),
              const SizedBox(height: 16),
              Row(
                children: [
                  Icon(Icons.location_on_outlined, size: 14, color: isDark ? Colors.grey.shade500 : Colors.grey.shade400),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Builder(
                      builder: (context) {
                        final parsedAddr = _parseReportAddress(report.description, "");
                        if (parsedAddr.isNotEmpty) {
                          return Text(
                            parsedAddr,
                            style: TextStyle(color: isDark ? Colors.grey.shade400 : Colors.grey.shade500, fontSize: 12),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          );
                        }
                        return FutureBuilder<String>(
                          future: LocationResolver.resolve(context, report.locationCode),
                          builder: (context, snapshot) {
                            return Text(
                              snapshot.data ?? report.locationCode,
                              style: TextStyle(color: isDark ? Colors.grey.shade400 : Colors.grey.shade500, fontSize: 12),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            );
                          },
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  _buildPriorityBadge(report.priority),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMediaGallery(BuildContext context, bool isDark) {
    final List<String> imageUrls = [];
    if (report.mediaUrls.isNotEmpty) {
      imageUrls.addAll(report.mediaUrls);
    } else if (report.mediaAssets.isNotEmpty) {
      for (final asset in report.mediaAssets) {
        if (asset.resolvedUrl != null && asset.resolvedUrl!.isNotEmpty) {
          imageUrls.add(asset.resolvedUrl!);
        }
      }
    }
    final displayUrls = imageUrls.where((url) {
      final lower = url.toLowerCase();
      return !lower.endsWith(".mp4") && !lower.endsWith(".mov");
    }).toList();

    if (displayUrls.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: SizedBox(
        height: 100,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: displayUrls.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (context, index) {
            final url = displayUrls[index];
            return ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: CachedNetworkImage(
                imageUrl: url,
                width: 100,
                height: 100,
                fit: BoxFit.cover,
                placeholder: (context, url) => Container(
                  width: 100,
                  height: 100,
                  color: isDark ? const Color(0xFF0F172A) : Colors.grey.shade100,
                  child: const Center(
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                ),
                errorWidget: (context, url, error) {
                  return Container(
                    width: 100,
                    height: 100,
                    color: isDark ? const Color(0xFF0F172A) : Colors.grey.shade100,
                    child: Icon(
                      Icons.broken_image_outlined,
                      color: isDark ? Colors.grey.shade700 : Colors.grey.shade300,
                    ),
                  );
                },
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildPriorityBadge(String priority) {
    Color color;
    String label;
    switch (priority.toUpperCase()) {
      case "URGENT":
        color = Colors.red.shade900;
        label = "KHẨN CẤP";
        break;
      case "HIGH":
        color = Colors.red;
        label = "CAO";
        break;
      case "MEDIUM":
        color = Colors.orange;
        label = "TRUNG BÌNH";
        break;
      case "LOW":
      default:
        color = Colors.blue;
        label = "THẤP";
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        border: Border.all(color: color.withOpacity(0.3)),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toUpperCase()) {
      case "NEW": return Colors.amber.shade700;
      case "IN_PROGRESS": return Colors.blue.shade700;
      case "RESOLVED": return Colors.green.shade700;
      default: return Colors.grey.shade700;
    }
  }
}

String _parseReportAddress(String? description, String fallback) {
  if (description == null) return fallback;
  const prefix = "Địa chỉ: ";
  if (description.startsWith(prefix)) {
    final endIndex = description.indexOf("\n\n");
    if (endIndex != -1) {
      return description.substring(prefix.length, endIndex);
    }
  }
  return fallback;
}

String _parseReportDescriptionOnly(String? description) {
  if (description == null) return "";
  const prefix = "Địa chỉ: ";
  if (description.startsWith(prefix)) {
    final endIndex = description.indexOf("\n\n");
    if (endIndex != -1) {
      return description.substring(endIndex + 2);
    }
  }
  return description;
}

class LocationResolver {
  static final Map<String, String> _resolvedNames = {};
  static final Map<String, Future<String>> _pendingResolutions = {};

  static Future<String> resolve(BuildContext context, String locationCode) async {
    if (locationCode.isEmpty) return "";
    if (_resolvedNames.containsKey(locationCode)) {
      return _resolvedNames[locationCode]!;
    }
    if (_pendingResolutions.containsKey(locationCode)) {
      return _pendingResolutions[locationCode]!;
    }

    final future = () async {
      try {
        final services = context.read<AppServices>();
        final locationService = LocationService(apiClient: services.apiClient);
        final resolved = await locationService.resolveLocationCode(locationCode);
        final name = resolved.displayName;
        _resolvedNames[locationCode] = name;
        return name;
      } catch (_) {
        return locationCode;
      }
    }();

    _pendingResolutions[locationCode] = future;
    try {
      final res = await future;
      return res;
    } finally {
      _pendingResolutions.remove(locationCode);
    }
  }
}
