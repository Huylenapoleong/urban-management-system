import "package:flutter/material.dart";
import "package:intl/intl.dart";
import "package:geolocator/geolocator.dart";
import "package:image_picker/image_picker.dart";
import "package:geocoding/geocoding.dart";
import "package:provider/provider.dart";
import "dart:io";

import "../../models/report_item.dart";
import "../../services/report_service.dart";
import "../../services/upload_service.dart";
import "../../state/session_controller.dart";
import "../shared/widgets/app_logo_button.dart";

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key, required this.reportService, this.uploadService});

  final ReportService reportService;
  final UploadService? uploadService;

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
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: const AppLogoButton(),
        title: const Text(
          "Báo cáo sự cố",
          style: TextStyle(color: Color(0xFF1E1B4B), fontWeight: FontWeight.bold),
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
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(16),
        ),
        child: TextField(
          controller: _searchController,
          onSubmitted: (_) => _loadReports(),
          decoration: const InputDecoration(
            hintText: "Search your reports...",
            prefixIcon: Icon(Icons.search, color: Colors.grey),
            border: InputBorder.none,
            contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
        ),
      ),
    );
  }

  Widget _buildFilters() {
    final statuses = ["ALL", "NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"];
    return Container(
      height: 50,
      padding: const EdgeInsets.only(bottom: 8),
      color: Colors.white,
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
              color: isSelected ? const Color(0xFF7C3AED) : Colors.grey.shade600,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              fontSize: 12,
            ),
            backgroundColor: Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: BorderSide(color: isSelected ? const Color(0xFF7C3AED) : Colors.grey.shade300),
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
        return _ReportCard(report: _reports[index]);
      },
    );
  }

  Widget _buildEmptyState() {
    return ListView(
      children: [
        const SizedBox(height: 120),
        Icon(Icons.description_outlined, size: 80, color: Colors.grey.shade300),
        const SizedBox(height: 16),
        const Center(child: Text("No reports found", style: TextStyle(color: Colors.grey, fontSize: 16))),
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
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, scrollController) => SingleChildScrollView(
          controller: scrollController,
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(child: Container(width: 40, height: 4, decoration: const BoxDecoration(color: Colors.grey, borderRadius: BorderRadius.all(Radius.circular(2))))),
              const SizedBox(height: 20),
              const Text("Báo cáo mới", style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF1E1B4B))),
              const SizedBox(height: 24),
              TextField(
                controller: _titleController,
                decoration: InputDecoration(
                  labelText: "Chuyện gì đang xảy ra?",
                  hintText: "Tiêu đề ngắn gọn của sự cố",
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _descriptionController,
                maxLines: 4,
                decoration: InputDecoration(
                  labelText: "Mô tả chi tiết",
                  hintText: "Cung cấp thêm thông tin...",
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 16),
              _buildLocationField(),
              const SizedBox(height: 16),
              _buildDropdowns(),
              const SizedBox(height: 16),
              const Text("Hình ảnh & Video đính kèm", style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              _buildMediaPicker(),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  onPressed: _submitting ? null : _submitReport,
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
    );
  }

  Widget _buildMediaPicker() {
    return SizedBox(
      height: 100,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _selectedMedia.length + 1,
        itemBuilder: (context, index) {
          if (index == _selectedMedia.length) {
            return GestureDetector(
              onTap: _pickMedia,
              child: Container(
                width: 100,
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey.shade300, style: BorderStyle.solid),
                ),
                child: const Icon(Icons.add_a_photo_outlined, color: Colors.grey),
              ),
            );
          }
          final file = _selectedMedia[index];
          final isVideo = file.path.endsWith(".mp4") || file.path.endsWith(".mov");
          return Stack(
            children: [
              Container(
                width: 100,
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  image: isVideo ? null : DecorationImage(image: FileImage(File(file.path)), fit: BoxFit.cover),
                  color: isVideo ? Colors.black87 : null,
                ),
                child: isVideo ? const Center(child: Icon(Icons.videocam, color: Colors.white)) : null,
              ),
              Positioned(
                top: 4,
                right: 12,
                child: GestureDetector(
                  onTap: () => setState(() => _selectedMedia.removeAt(index)),
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                    child: const Icon(Icons.close, size: 16, color: Colors.white),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _pickMedia() async {
    final picker = ImagePicker();
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(leading: const Icon(Icons.camera_alt), title: const Text("Chụp ảnh"), onTap: () => Navigator.pop(context, ImageSource.camera)),
            ListTile(leading: const Icon(Icons.videocam), title: const Text("Quay video"), onTap: () async {
              Navigator.pop(context);
              final video = await picker.pickVideo(source: ImageSource.camera);
              if (video != null) setState(() => _selectedMedia.add(video));
            }),
            ListTile(leading: const Icon(Icons.photo_library), title: const Text("Chọn từ thư viện"), onTap: () async {
              Navigator.pop(context);
              final media = await picker.pickMedia();
              if (media != null) setState(() => _selectedMedia.add(media));
            }),
          ],
        ),
      ),
    );
    if (source == null) return;
    
    final xFile = await picker.pickImage(source: source);
    if (xFile != null) {
      setState(() => _selectedMedia.add(xFile));
    }
  }

  Widget _buildLocationField() {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _locationController,
            decoration: InputDecoration(
              labelText: "Địa chỉ sự cố",
              hintText: "Nhập địa chỉ hoặc nhấn định vị bên cạnh",
              prefixIcon: const Icon(Icons.location_on_outlined),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        IconButton.filledTonal(
          onPressed: _detectLocation,
          icon: const Icon(Icons.my_location),
          tooltip: "Định vị vị trí hiện tại",
        ),
      ],
    );
  }

  Future<void> _detectLocation() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Location services are disabled.")));
      }
      return;
    }

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Location permissions are denied.")));
        }
        return;
      }
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Detecting location..."), duration: Duration(seconds: 1)));
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      
      if (mounted) {
        String address = "${position.latitude.toStringAsFixed(6)}, ${position.longitude.toStringAsFixed(6)}";
        
        try {
          List<Placemark> placemarks = await placemarkFromCoordinates(position.latitude, position.longitude);
          if (placemarks.isNotEmpty) {
            final p = placemarks.first;
            // Format: Street, Ward, District, City
            final parts = [
              if (p.street != null && p.street!.isNotEmpty) p.street,
              if (p.subLocality != null && p.subLocality!.isNotEmpty) p.subLocality,
              if (p.locality != null && p.locality!.isNotEmpty) p.locality,
              if (p.administrativeArea != null && p.administrativeArea!.isNotEmpty) p.administrativeArea,
            ];
            if (parts.isNotEmpty) {
              address = parts.join(", ");
            }
          }
        } catch (e) {
          print("Reverse geocoding failed: $e");
          // Keep coordinates as fallback
        }

        setState(() {
          _locationController.text = address;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Đã xác định vị trí thành công!"))
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Lỗi định vị: $e")));
      }
    }
  }

  Widget _buildDropdowns() {
    return Row(
      children: [
        Expanded(
          child: DropdownButtonFormField<String>(
            value: _category,
            decoration: InputDecoration(labelText: "Phân loại", border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
            items: const [
              DropdownMenuItem(value: "INFRASTRUCTURE", child: Text("Hạ tầng")),
              DropdownMenuItem(value: "ENVIRONMENT", child: Text("Môi trường")),
              DropdownMenuItem(value: "SECURITY", child: Text("An ninh")),
            ],
            onChanged: (val) => setState(() => _category = val!),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: DropdownButtonFormField<String>(
            value: _priority,
            decoration: InputDecoration(labelText: "Ưu tiên", border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
            items: const [
              DropdownMenuItem(value: "LOW", child: Text("Thấp")),
              DropdownMenuItem(value: "MEDIUM", child: Text("Trung bình")),
              DropdownMenuItem(value: "HIGH", child: Text("Cao")),
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

  Future<void> _submitReport() async {
    if (_titleController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Vui lòng nhập tiêu đề")));
      return;
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

      // We MUST send a location code that matches the user's scope to avoid 403,
      // and it MUST be in V2 format to avoid 400.
      final apiLocationCode = _normalizeLocationCode(userLocationCode);

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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Gửi báo cáo thành công!")));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Lỗi: \$e")));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.report});
  final ReportItem report;

  @override
  Widget build(BuildContext context) {
    final statusColor = _getStatusColor(report.status);
    final time = DateTime.tryParse(report.updatedAt);
    final formattedTime = time == null ? "" : DateFormat("MMM dd, HH:mm").format(time.toLocal());

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 10, offset: const Offset(0, 4))],
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
              Text(formattedTime, style: TextStyle(color: Colors.grey.shade400, fontSize: 11)),
            ],
          ),
          const SizedBox(height: 12),
          Text(report.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF1E1B4B))),
          const SizedBox(height: 6),
          Text(report.description ?? "Không có mô tả", maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          const SizedBox(height: 16),
          Row(
            children: [
              Icon(Icons.location_on_outlined, size: 14, color: Colors.grey.shade400),
              const SizedBox(width: 4),
              Expanded(child: Text(report.locationCode, style: TextStyle(color: Colors.grey.shade500, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis)),
              const SizedBox(width: 8),
              _buildPriorityBadge(report.priority),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPriorityBadge(String priority) {
    Color color;
    switch (priority.toUpperCase()) {
      case "HIGH": color = Colors.red; break;
      case "MEDIUM": color = Colors.orange; break;
      default: color = Colors.blue;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(border: Border.all(color: color.withOpacity(0.3)), borderRadius: BorderRadius.circular(6)),
      child: Text(priority, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold)),
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
