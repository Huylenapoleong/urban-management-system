import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

import '../../../models/report_item.dart';
import '../../../services/app_services.dart';
import '../../../services/location_service.dart';
import '../../../state/session_controller.dart';
import '../../../features/shared/widgets/app_toast.dart';

class OfficialReportsPage extends StatefulWidget {
  const OfficialReportsPage({super.key});

  @override
  State<OfficialReportsPage> createState() => _OfficialReportsPageState();
}

class _OfficialReportsPageState extends State<OfficialReportsPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _searchController = TextEditingController();
  
  // Controllers and state for report creation
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _locationController = TextEditingController();
  String _category = "INFRASTRUCTURE";
  String _priority = "MEDIUM";
  final List<XFile> _selectedMedia = [];
  bool _submitting = false;

  String _filterStatus = 'ALL';
  String _filterPriority = 'ALL';
  String _filterCategory = 'ALL';
  bool _loading = true;
  String? _error;
  List<ReportItem> _reports = const [];

  static const _statuses = ['ALL', 'NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  static const _priorities = ['ALL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'];


  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadReports();
  }

  @override
  void dispose() {
    _tabController.dispose();
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
      final reportService = context.read<AppServices>().reportService;
      final allReports = await reportService.listReports(
        limit: 100,
        status: _filterStatus == 'ALL' ? null : _filterStatus,
        priority: _filterPriority == 'ALL' ? null : _filterPriority,
        category: _filterCategory == 'ALL' ? null : _filterCategory,
        query: _searchController.text.trim().isEmpty
            ? null
            : _searchController.text.trim(),
      );
      if (!mounted) return;
      setState(() => _reports = allReports);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<ReportItem> get _filteredReports {
    return _reports.where((r) {
      if (_filterStatus != 'ALL' && r.status.toUpperCase() != _filterStatus) {
        return false;
      }
      if (_filterPriority != 'ALL' &&
          r.priority.toUpperCase() != _filterPriority) return false;
      if (_filterCategory != 'ALL' &&
          r.category.toUpperCase() != _filterCategory) return false;
      final q = _searchController.text.trim().toLowerCase();
      if (q.isNotEmpty &&
          !r.title.toLowerCase().contains(q) &&
          !(r.description?.toLowerCase().contains(q) ?? false)) return false;
      return true;
    }).toList();
  }

  List<String> get _dynamicCategories {
    final set = <String>{};
    for (var r in _reports) {
      if (r.category.isNotEmpty) {
        set.add(r.category.toUpperCase());
      }
    }
    const defaults = ['INFRASTRUCTURE', 'ENVIRONMENT', 'SECURITY', 'ADMIN'];
    for (var d in defaults) {
      set.add(d);
    }
    return set.toList();
  }

  String _categoryEmoji(String c) {
    const map = {
      'INFRASTRUCTURE': '🏗️',
      'ENVIRONMENT': '🌿',
      'SECURITY': '🔒',
      'ADMIN': '📋',
    };
    return map[c] ?? '📌';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primaryColor = const Color(0xFF15803D); // Premium dark green
    final activeGreen = const Color(0xFF22C55E);

    return Scaffold(
      backgroundColor:
          isDark ? const Color(0xFF0B0F19) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF0B0F19) : primaryColor,
        elevation: 0,
        title: Text(
          'Quản lý Báo cáo',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.add_circle_outline_rounded, color: isDark ? const Color(0xFF22C55E) : Colors.white, size: 26),
            onPressed: _showCreateReportSheet,
            tooltip: 'Báo cáo mới',
          ),
          IconButton(
            icon: Icon(Icons.refresh_rounded, color: isDark ? const Color(0xFF22C55E) : Colors.white),
            onPressed: _loadReports,
            tooltip: 'Làm mới',
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: _buildStatusTabBar(isDark),
        ),
      ),
      body: Column(
        children: [
          _buildSearchAndFilter(isDark),
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(
                      color: Color(0xFF22C55E),
                    ),
                  )
                : _error != null
                    ? _buildError(isDark)
                    : RefreshIndicator(
                        onRefresh: _loadReports,
                        color: activeGreen,
                        child: _filteredReports.isEmpty
                            ? _buildEmpty(isDark)
                            : _buildList(isDark),
                      ),
          ),
        ],
      ),
    );
  }

  // ─── Status tab bar ────────────────────────────────────────────────────────
  Widget _buildStatusTabBar(bool isDark) {
    final statuses = ['ALL', 'NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    final labels = {
      'ALL': 'Tất cả',
      'NEW': 'Mới',
      'IN_PROGRESS': 'Đang xử lý',
      'RESOLVED': 'Đã giải quyết',
      'CLOSED': 'Đã đóng',
    };

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: statuses.map((s) {
          final selected = _filterStatus == s;
          final activeColor = isDark ? const Color(0xFF22C55E) : const Color(0xFF15803D);
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () {
                setState(() => _filterStatus = s);
                _loadReports();
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: selected
                      ? activeColor
                      : (isDark ? const Color(0xFF1E293B) : Colors.white.withOpacity(0.15)),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: selected 
                      ? activeColor 
                      : (isDark ? Colors.white.withOpacity(0.05) : Colors.white.withOpacity(0.3)),
                    width: 1,
                  ),
                ),
                child: Text(
                  labels[s] ?? s,
                  style: TextStyle(
                    color: selected
                        ? Colors.white
                        : (isDark ? const Color(0xFF94A3B8) : Colors.white.withOpacity(0.85)),
                    fontWeight: selected ? FontWeight.bold : FontWeight.w500,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  // ─── Search + advanced filter ──────────────────────────────────────────────
  Widget _buildSearchAndFilter(bool isDark) {
    return Container(
      color: isDark ? const Color(0xFF0B0F19) : Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(
        children: [
          // Search bar
          Container(
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isDark ? Colors.white.withOpacity(0.05) : Colors.transparent,
              ),
            ),
            child: TextField(
              controller: _searchController,
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) => _loadReports(),
              style: TextStyle(
                  color: isDark ? Colors.white : const Color(0xFF0F172A)),
              decoration: InputDecoration(
                hintText: 'Tìm kiếm báo cáo nghiệp vụ...',
                hintStyle: TextStyle(
                    color: isDark ? const Color(0xFF64748B) : Colors.grey),
                prefixIcon: Icon(Icons.search_rounded,
                    color: isDark ? const Color(0xFF64748B) : Colors.grey),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear_rounded, size: 18),
                        onPressed: () {
                          _searchController.clear();
                          setState(() {});
                        },
                      )
                    : null,
                border: InputBorder.none,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
            ),
          ),
          const SizedBox(height: 10),
          // Priority + Category chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildFilterChip(
                  'Ưu tiên: ${_priorityLabel(_filterPriority)}',
                  Icons.flag_outlined,
                  isDark,
                  () => _showPriorityPicker(isDark),
                  _filterPriority != 'ALL',
                ),
                const SizedBox(width: 8),
                _buildFilterChip(
                  'Loại: ${_categoryLabel(_filterCategory)}',
                  Icons.category_outlined,
                  isDark,
                  () => _showCategoryPicker(isDark),
                  _filterCategory != 'ALL',
                ),
                if (_filterPriority != 'ALL' || _filterCategory != 'ALL') ...[
                  const SizedBox(width: 10),
                  GestureDetector(
                    onTap: () {
                      setState(() {
                        _filterPriority = 'ALL';
                        _filterCategory = 'ALL';
                      });
                      _loadReports();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.red.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.red.withOpacity(0.3)),
                      ),
                      child: const Text(
                        'Xóa bộ lọc',
                        style: TextStyle(
                            color: Colors.redAccent,
                            fontSize: 11,
                            fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, IconData icon, bool isDark,
      VoidCallback onTap, bool active) {
    final activeColor = isDark ? const Color(0xFF22C55E) : const Color(0xFF15803D);
    final color = active ? activeColor : (isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B));
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active
              ? activeColor.withOpacity(0.12)
              : (isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9)),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: active 
              ? activeColor 
              : (isDark ? Colors.white.withOpacity(0.05) : Colors.grey.withOpacity(0.2)),
            width: 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 6),
            Text(label,
                style: TextStyle(
                    color: color,
                    fontSize: 11,
                    fontWeight:
                        active ? FontWeight.bold : FontWeight.w500)),
            const SizedBox(width: 2),
            Icon(Icons.arrow_drop_down_rounded, size: 14, color: color),
          ],
        ),
      ),
    );
  }

  // ─── List ──────────────────────────────────────────────────────────────────
  Widget _buildList(bool isDark) {
    final reports = _filteredReports;
    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: reports.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, i) =>
          _OfficialReportCard(
            report: reports[i],
            isDark: isDark,
            onStatusUpdate: _loadReports,
          ),
    );
  }

  Widget _buildEmpty(bool isDark) {
    return ListView(
      children: [
        const SizedBox(height: 100),
        Icon(Icons.assignment_outlined,
            size: 80,
            color: isDark ? Colors.grey.shade700 : Colors.grey.shade300),
        const SizedBox(height: 16),
        Center(
          child: Text(
            'Không có báo cáo nào',
            style: TextStyle(
                fontSize: 16,
                color: isDark ? Colors.grey.shade500 : Colors.grey),
          ),
        ),
      ],
    );
  }

  Widget _buildError(bool isDark) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 48, color: Colors.redAccent),
          const SizedBox(height: 16),
          Text(_error!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.redAccent)),
          const SizedBox(height: 16),
          ElevatedButton(
              onPressed: _loadReports, child: const Text('Thử lại')),
        ],
      ),
    );
  }

  // ─── Pickers ───────────────────────────────────────────────────────────────
  void _showPriorityPicker(bool isDark) {
    _showPickerSheet(
      isDark: isDark,
      title: 'Lọc theo Ưu tiên',
      items: const [
        ('ALL', 'Tất cả'),
        ('URGENT', '🔴  Khẩn cấp'),
        ('HIGH', '🟠  Cao'),
        ('MEDIUM', '🟡  Trung bình'),
        ('LOW', '🔵  Thấp'),
      ],
      selected: _filterPriority,
      onSelect: (v) {
        setState(() => _filterPriority = v);
        _loadReports();
      },
    );
  }

  void _showCategoryPicker(bool isDark) {
    final items = <(String, String)>[
      ('ALL', 'Tất cả'),
    ];
    for (final c in _dynamicCategories) {
      final emoji = _categoryEmoji(c);
      final label = _categoryLabel(c);
      items.add((c, '$emoji  $label'));
    }

    _showPickerSheet(
      isDark: isDark,
      title: 'Lọc theo Phân loại',
      items: items,
      selected: _filterCategory,
      onSelect: (v) {
        setState(() => _filterCategory = v);
        _loadReports();
      },
    );
  }

  void _showPickerSheet({
    required bool isDark,
    required String title,
    required List<(String, String)> items,
    required String selected,
    required void Function(String) onSelect,
  }) {
    showModalBottomSheet(
      context: context,
      backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade400,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(title,
                  style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600, fontSize: 16)),
            ),
            const SizedBox(height: 8),
            ...items.map((item) {
              final isSelected = item.$1 == selected;
              return ListTile(
                title: Text(item.$2),
                trailing: isSelected
                    ? const Icon(Icons.check, color: Color(0xFF15803D))
                    : null,
                onTap: () {
                  Navigator.pop(context);
                  onSelect(item.$1);
                },
              );
            }),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _showCreateReportSheet() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final session = context.read<SessionController>();
    final services = context.read<AppServices>();
    final locationService = LocationService(apiClient: services.apiClient);
    
    // Clear previous input
    _titleController.clear();
    _descriptionController.clear();
    _selectedMedia.clear();
    _category = "INFRASTRUCTURE";
    _priority = "MEDIUM";
    _locationController.text = session.user?.unit ?? "";

    if (session.user?.locationCode != null && session.user!.locationCode.isNotEmpty) {
      locationService
          .resolveLocationCode(session.user!.locationCode)
          .then((resolved) {
        if (mounted) {
          setState(() {
            final displayName = resolved.displayName;
            final unit = session.user?.unit ?? "";
            if (unit.trim().isNotEmpty) {
              _locationController.text = "$displayName, $unit";
            } else {
              _locationController.text = displayName;
            }
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
        initialChildSize: 0.75,
        maxChildSize: 0.95,
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
                  "Báo cáo sự cố mới",
                  style: GoogleFonts.poppins(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.white : const Color(0xFF1E1B4B),
                  ),
                ),
                const SizedBox(height: 20),
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
                _buildCreateLocationField(isDark),
                const SizedBox(height: 16),
                _buildCreateDropdowns(isDark, setModalState),
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
                _buildCreateMediaPicker(isDark, setModalState),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton(
                    onPressed: _submitting ? null : () => _submitCreateReport(setModalState),
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF22C55E),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: _submitting 
                      ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text("Gửi báo cáo", style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCreateLocationField(bool isDark) {
    return TextField(
      controller: _locationController,
      style: TextStyle(color: isDark ? Colors.white : Colors.black87),
      decoration: InputDecoration(
        labelText: "Địa chỉ sự cố",
        labelStyle: TextStyle(color: isDark ? Colors.grey.shade400 : null),
        hintText: "Nhập địa chỉ hoặc phạm vi quản lý",
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

  Widget _buildCreateDropdowns(bool isDark, StateSetter setModalState) {
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
            items: _dynamicCategories.map((c) {
              return DropdownMenuItem<String>(
                value: c,
                child: Text(_categoryLabel(c)),
              );
            }).toList(),
            onChanged: (val) => setModalState(() => _category = val!),
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
            onChanged: (val) => setModalState(() => _priority = val!),
          ),
        ),
      ],
    );
  }

  Widget _buildCreateMediaPicker(bool isDark, StateSetter setModalState) {
    return SizedBox(
      height: 100,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _selectedMedia.length + 1,
        itemBuilder: (context, index) {
          if (index == _selectedMedia.length) {
            return GestureDetector(
              onTap: () => _pickCreateMedia(setModalState),
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
                      setModalState(() => _selectedMedia.removeAt(index));
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

  Future<void> _pickCreateMedia(StateSetter setModalState) async {
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
                  setModalState(() => _selectedMedia.add(video));
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
                  setModalState(() => _selectedMedia.addAll(media));
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
      setModalState(() => _selectedMedia.add(xFile));
      setState(() {});
    }
  }

  Future<void> _submitCreateReport(StateSetter setModalState) async {
    if (_titleController.text.trim().isEmpty) {
      AppToast.show(context, message: "Vui lòng nhập tiêu đề sự cố", type: AppToastType.warning);
      return;
    }

    setModalState(() => _submitting = true);
    setState(() => _submitting = true);
    try {
      final services = context.read<AppServices>();
      final List<String> mediaKeys = [];
      final List<String> mediaUrls = [];

      if (_selectedMedia.isNotEmpty) {
        for (final file in _selectedMedia) {
          final asset = await services.uploadService.uploadMedia(
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
      
      if (!inputLocation.startsWith("VN-")) {
        finalDescription = "Địa chỉ: $inputLocation\n\n$finalDescription";
      }

      await services.reportService.createReport(
        title: _titleController.text.trim(),
        description: finalDescription,
        category: _category,
        priority: _priority,
        locationCode: userLocationCode,
        mediaKeys: mediaKeys,
        mediaUrls: mediaUrls,
      );

      if (!mounted) return;
      Navigator.pop(context);
      
      AppToast.show(context, message: "Đã tạo báo cáo sự cố thành công", type: AppToastType.success);
      _loadReports();
    } catch (error) {
      if (!mounted) return;
      AppToast.show(context, message: "Lỗi tạo báo cáo: $error", type: AppToastType.error);
    } finally {
      if (mounted) {
        setModalState(() => _submitting = false);
        setState(() => _submitting = false);
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  String _priorityLabel(String p) {
    const map = {
      'ALL': 'Tất cả',
      'URGENT': 'Khẩn cấp',
      'HIGH': 'Cao',
      'MEDIUM': 'Trung bình',
      'LOW': 'Thấp',
    };
    return map[p] ?? p;
  }

  String _categoryLabel(String c) {
    const map = {
      'ALL': 'Tất cả',
      'INFRASTRUCTURE': 'Hạ tầng',
      'ENVIRONMENT': 'Môi trường',
      'SECURITY': 'An ninh',
      'ADMIN': 'Hành chính',
    };
    if (map.containsKey(c)) {
      return map[c]!;
    }
    if (c.isEmpty) return c;
    final clean = c.replaceAll('_', ' ');
    return clean[0].toUpperCase() + clean.substring(1).toLowerCase();
  }
}

// ─── Card component ────────────────────────────────────────────────────────────
class _OfficialReportCard extends StatelessWidget {
  const _OfficialReportCard({
    required this.report,
    required this.isDark,
    required this.onStatusUpdate,
  });

  final ReportItem report;
  final bool isDark;
  final VoidCallback onStatusUpdate;

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(report.status);
    final time = DateTime.tryParse(report.createdAt);
    final formattedTime =
        time == null ? '' : DateFormat('dd/MM/yy HH:mm').format(time.toLocal());

    return GestureDetector(
      onTap: () => _openDetail(context),
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isDark
                ? Colors.white.withOpacity(0.06)
                : const Color(0xFFE2E8F0),
            width: 1.2,
          ),
          boxShadow: isDark
              ? null
              : [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.03),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  )
                ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ─── Header ───────────────────────────────────────────────
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: statusColor.withOpacity(isDark ? 0.1 : 0.04),
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: Row(
                children: [
                  _StatusBadge(status: report.status),
                  const Spacer(),
                  _PriorityBadge(priority: report.priority),
                  const SizedBox(width: 10),
                  Text(
                    formattedTime,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: isDark
                          ? const Color(0xFF94A3B8)
                          : const Color(0xFF64748B),
                    ),
                  ),
                ],
              ),
            ),
            // ─── Body ─────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    report.title,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                  if (report.description != null &&
                      report.description!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      report.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.4,
                        color: isDark
                          ? const Color(0xFF94A3B8)
                          : const Color(0xFF475569),
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Icon(Icons.location_on_outlined,
                          size: 14,
                          color: isDark
                              ? const Color(0xFF64748B)
                              : Colors.grey),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          report.locationCode,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: isDark
                                ? const Color(0xFF94A3B8)
                                : const Color(0xFF64748B),
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Icon(Icons.category_outlined,
                          size: 14,
                          color: isDark
                              ? const Color(0xFF64748B)
                              : Colors.grey),
                      const SizedBox(width: 4),
                      Text(
                        _categoryLabel(report.category),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          color: isDark
                              ? const Color(0xFF94A3B8)
                              : const Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                  // ─── Media thumbnails ──────────────────────────────
                  if (_imageUrls.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 76,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: _imageUrls.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (_, i) => ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.network(
                            _imageUrls[i],
                            width: 76,
                            height: 76,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Container(
                              width: 76,
                              height: 76,
                              color: isDark
                                  ? const Color(0xFF0F172A)
                                  : Colors.grey.shade100,
                              child: const Icon(Icons.broken_image_outlined,
                                  size: 24, color: Colors.grey),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            // ─── Actions footer ────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  _ActionButton(
                    label: 'Chi tiết',
                    icon: Icons.visibility_outlined,
                    color: isDark ? const Color(0xFF3B82F6) : const Color(0xFF1E3A8A),
                    onTap: () => _openDetail(context),
                  ),
                  const SizedBox(width: 10),
                  _ActionButton(
                    label: 'Cập nhật',
                    icon: Icons.task_alt_rounded,
                    color: const Color(0xFF22C55E),
                    onTap: () => _openStatusUpdate(context),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<String> get _imageUrls {
    if (report.mediaUrls.isNotEmpty) {
      return report.mediaUrls.where((u) {
        final l = u.toLowerCase();
        return !l.endsWith('.mp4') && !l.endsWith('.mov');
      }).toList();
    }
    return report.mediaAssets
        .where((a) => a.resolvedUrl != null && a.resolvedUrl!.isNotEmpty)
        .map((a) => a.resolvedUrl!)
        .where((u) {
          final l = u.toLowerCase();
          return !l.endsWith('.mp4') && !l.endsWith('.mov');
        })
        .toList();
  }

  void _openDetail(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor:
          Theme.of(context).brightness == Brightness.dark
              ? const Color(0xFF1E293B)
              : Colors.white,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _ReportDetailSheet(
        report: report,
        isDark: Theme.of(context).brightness == Brightness.dark,
        onStatusUpdate: onStatusUpdate,
      ),
    );
  }

  void _openStatusUpdate(BuildContext context) {
    _ReportDetailSheet.showStatusPicker(
      context: context,
      report: report,
      isDark: Theme.of(context).brightness == Brightness.dark,
      onStatusUpdate: onStatusUpdate,
    );
  }

  Color _statusColor(String s) {
    switch (s.toUpperCase()) {
      case 'NEW':
        return Colors.amber.shade700;
      case 'IN_PROGRESS':
        return Colors.blue.shade700;
      case 'RESOLVED':
        return Colors.green.shade700;
      case 'CLOSED':
        return Colors.grey.shade600;
      case 'REJECTED':
        return Colors.red.shade700;
      default:
        return Colors.grey.shade500;
    }
  }

  String _categoryLabel(String c) {
    const map = {
      'INFRASTRUCTURE': 'Hạ tầng',
      'ENVIRONMENT': 'Môi trường',
      'SECURITY': 'An ninh',
      'ADMIN': 'Hành chính',
    };
    return map[c.toUpperCase()] ?? c;
  }
}

// ─── Detail bottom sheet ───────────────────────────────────────────────────────
class _ReportDetailSheet extends StatefulWidget {
  const _ReportDetailSheet({
    required this.report,
    required this.isDark,
    required this.onStatusUpdate,
  });

  final ReportItem report;
  final bool isDark;
  final VoidCallback onStatusUpdate;

  static void showStatusPicker({
    required BuildContext context,
    required ReportItem report,
    required bool isDark,
    required VoidCallback onStatusUpdate,
  }) {
    final nextStatuses = _nextAllowedStatuses(report.status);
    if (nextStatuses.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Báo cáo này không thể cập nhật thêm.')),
      );
      return;
    }
    showModalBottomSheet(
      context: context,
      backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => _StatusPickerSheet(
        report: report,
        isDark: isDark,
        nextStatuses: nextStatuses,
        onStatusUpdate: onStatusUpdate,
      ),
    );
  }

  static List<String> _nextAllowedStatuses(String current) {
    switch (current.toUpperCase()) {
      case 'NEW':
        return ['IN_PROGRESS', 'RESOLVED', 'REJECTED'];
      case 'IN_PROGRESS':
        return ['RESOLVED', 'REJECTED'];
      case 'RESOLVED':
        return ['IN_PROGRESS', 'CLOSED'];
      case 'REJECTED':
        return ['IN_PROGRESS'];
      default:
        return [];
    }
  }

  @override
  State<_ReportDetailSheet> createState() => _ReportDetailSheetState();
}

class _ReportDetailSheetState extends State<_ReportDetailSheet> {
  List<Map<String, dynamic>>? _auditLog;
  bool _loadingAudit = false;

  @override
  void initState() {
    super.initState();
    _fetchAudit();
  }

  Future<void> _fetchAudit() async {
    setState(() => _loadingAudit = true);
    try {
      final svc = context.read<AppServices>().reportService;
      final log = await svc.listReportAuditEvents(widget.report.id);
      if (mounted) setState(() => _auditLog = log);
    } catch (_) {
      if (mounted) setState(() => _auditLog = []);
    } finally {
      if (mounted) setState(() => _loadingAudit = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final report = widget.report;
    final isDark = widget.isDark;

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scroll) => SingleChildScrollView(
        controller: scroll,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade400,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Status + Priority row
              Row(
                children: [
                  _StatusBadge(status: report.status, large: true),
                  const SizedBox(width: 8),
                  _PriorityBadge(priority: report.priority),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () {
                      Navigator.pop(context);
                      _ReportDetailSheet.showStatusPicker(
                        context: context,
                        report: report,
                        isDark: isDark,
                        onStatusUpdate: widget.onStatusUpdate,
                      );
                    },
                    icon: const Icon(Icons.edit, size: 16),
                    label: const Text('Đổi trạng thái'),
                    style: TextButton.styleFrom(
                        foregroundColor: const Color(0xFF1F3E68)),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Title
              Text(
                report.title,
                style: GoogleFonts.poppins(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: isDark ? Colors.white : const Color(0xFF1E293B),
                ),
              ),
              const SizedBox(height: 10),

              // Meta info
              _MetaRow(
                icon: Icons.location_on_outlined,
                label: 'Địa điểm',
                value: report.locationCode,
                isDark: isDark,
              ),
              _MetaRow(
                icon: Icons.category_outlined,
                label: 'Phân loại',
                value: _categoryLabel(report.category),
                isDark: isDark,
              ),
              _MetaRow(
                icon: Icons.access_time,
                label: 'Tạo lúc',
                value: _formatDateTime(report.createdAt),
                isDark: isDark,
              ),
              if (report.assignedOfficerId != null)
                _MetaRow(
                  icon: Icons.person_outlined,
                  label: 'Phụ trách',
                  value: report.assignedOfficerId!,
                  isDark: isDark,
                ),

              // Description
              if (report.description != null && report.description!.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text('Mô tả chi tiết',
                    style: GoogleFonts.inter(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: isDark ? Colors.white70 : const Color(0xFF1F3E68))),
                const SizedBox(height: 6),
                Text(
                  report.description!,
                  style: TextStyle(
                    fontSize: 14,
                    color: isDark ? Colors.grey.shade300 : Colors.grey.shade700,
                    height: 1.5,
                  ),
                ),
              ],

              // Images
              if (_imageUrls.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text('Hình ảnh đính kèm',
                    style: GoogleFonts.inter(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: isDark ? Colors.white70 : const Color(0xFF1F3E68))),
                const SizedBox(height: 8),
                SizedBox(
                  height: 120,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _imageUrls.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (_, i) => ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.network(
                        _imageUrls[i],
                        width: 120,
                        height: 120,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          width: 120,
                          height: 120,
                          color: Colors.grey.shade200,
                          child: const Icon(Icons.broken_image_outlined),
                        ),
                      ),
                    ),
                  ),
                ),
              ],

              // Audit log
              const SizedBox(height: 20),
              Text('Lịch sử xử lý',
                  style: GoogleFonts.inter(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                      color: isDark ? Colors.white70 : const Color(0xFF1F3E68))),
              const SizedBox(height: 8),
              if (_loadingAudit)
                const Center(child: CircularProgressIndicator())
              else if (_auditLog == null || _auditLog!.isEmpty)
                Text('Chưa có lịch sử.',
                    style: TextStyle(
                        color: isDark
                            ? Colors.grey.shade500
                            : Colors.grey.shade500,
                        fontSize: 13))
              else
                ..._auditLog!.map((e) => _AuditEntry(entry: e, isDark: isDark)),
            ],
          ),
        ),
      ),
    );
  }

  List<String> get _imageUrls {
    if (widget.report.mediaUrls.isNotEmpty) {
      return widget.report.mediaUrls.where((u) {
        final l = u.toLowerCase();
        return !l.endsWith('.mp4') && !l.endsWith('.mov');
      }).toList();
    }
    return widget.report.mediaAssets
        .where((a) => a.resolvedUrl != null && a.resolvedUrl!.isNotEmpty)
        .map((a) => a.resolvedUrl!)
        .where((u) {
          final l = u.toLowerCase();
          return !l.endsWith('.mp4') && !l.endsWith('.mov');
        })
        .toList();
  }

  Color _statusColor(String s) {
    switch (s.toUpperCase()) {
      case 'NEW':
        return Colors.amber.shade700;
      case 'IN_PROGRESS':
        return Colors.blue.shade700;
      case 'RESOLVED':
        return Colors.green.shade700;
      default:
        return Colors.grey.shade600;
    }
  }

  String _categoryLabel(String c) {
    const map = {
      'INFRASTRUCTURE': 'Hạ tầng',
      'ENVIRONMENT': 'Môi trường',
      'SECURITY': 'An ninh',
      'ADMIN': 'Hành chính',
    };
    return map[c.toUpperCase()] ?? c;
  }

  String _formatDateTime(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    return DateFormat('dd/MM/yyyy HH:mm').format(dt.toLocal());
  }
}

// ─── Status picker bottom sheet ────────────────────────────────────────────────
class _StatusPickerSheet extends StatefulWidget {
  const _StatusPickerSheet({
    required this.report,
    required this.isDark,
    required this.nextStatuses,
    required this.onStatusUpdate,
  });

  final ReportItem report;
  final bool isDark;
  final List<String> nextStatuses;
  final VoidCallback onStatusUpdate;

  @override
  State<_StatusPickerSheet> createState() => _StatusPickerSheetState();
}

class _StatusPickerSheetState extends State<_StatusPickerSheet> {
  String? _selected;
  bool _updating = false;

  static const _labels = {
    'IN_PROGRESS': 'Đang xử lý',
    'RESOLVED': 'Đã giải quyết',
    'CLOSED': 'Đã đóng',
    'REJECTED': 'Từ chối',
  };

  static const _icons = {
    'IN_PROGRESS': Icons.sync,
    'RESOLVED': Icons.check_circle_outline,
    'CLOSED': Icons.cancel_outlined,
    'REJECTED': Icons.block_flipped,
  };

  static const _colors = {
    'IN_PROGRESS': Color(0xFF1D4ED8),
    'RESOLVED': Color(0xFF059669),
    'CLOSED': Color(0xFF6B7280),
    'REJECTED': Color(0xFFDC2626),
  };

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade400,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('Cập nhật trạng thái',
                style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600, fontSize: 18)),
            Text(
              'Báo cáo: "${widget.report.title}"',
              style: TextStyle(
                  fontSize: 13,
                  color: widget.isDark
                      ? Colors.grey.shade400
                      : Colors.grey.shade600),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 16),
            ...widget.nextStatuses.map((s) {
              final selected = _selected == s;
              final color = _colors[s] ?? const Color(0xFF6B7280);
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: GestureDetector(
                  onTap: () => setState(() => _selected = s),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: selected
                          ? color.withOpacity(0.1)
                          : (widget.isDark
                              ? const Color(0xFF0F172A)
                              : const Color(0xFFF8FAFC)),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: selected ? color : Colors.grey.withOpacity(0.2),
                        width: selected ? 1.5 : 1,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(_icons[s] ?? Icons.circle, color: color, size: 22),
                        const SizedBox(width: 12),
                        Text(
                          _labels[s] ?? s,
                          style: TextStyle(
                            color: color,
                            fontWeight: FontWeight.w600,
                            fontSize: 15,
                          ),
                        ),
                        const Spacer(),
                        if (selected)
                          Icon(Icons.check_circle, color: color, size: 20),
                      ],
                    ),
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                onPressed: (_selected == null || _updating)
                    ? null
                    : _confirmUpdate,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF1F3E68),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                ),
                child: _updating
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Text('Xác nhận cập nhật',
                        style: TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmUpdate() async {
    if (_selected == null) return;
    setState(() => _updating = true);
    try {
      final svc = context.read<AppServices>().reportService;
      await svc.updateReportStatus(widget.report.id, _selected!);
      if (!mounted) return;
      Navigator.pop(context);
      widget.onStatusUpdate();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Đã cập nhật trạng thái thành ${_labels[_selected!]}'),
        backgroundColor: const Color(0xFF059669),
        behavior: SnackBarBehavior.floating,
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Lỗi: $e'),
        backgroundColor: Colors.red.shade600,
        behavior: SnackBarBehavior.floating,
      ));
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }
}

// ─── Audit entry ───────────────────────────────────────────────────────────────
class _AuditEntry extends StatelessWidget {
  const _AuditEntry({required this.entry, required this.isDark});

  final Map<String, dynamic> entry;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final action = (entry['action'] ?? entry['event'] ?? 'Cập nhật').toString();
    final by = (entry['byUserId'] ?? entry['actorId'] ?? '').toString();
    final atRaw = (entry['createdAt'] ?? entry['at'] ?? '').toString();
    final at = DateTime.tryParse(atRaw);
    final atStr = at == null ? '' : DateFormat('dd/MM HH:mm').format(at.toLocal());

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 4),
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: const Color(0xFF1F3E68),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  action,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: isDark ? Colors.white : const Color(0xFF1E293B),
                  ),
                ),
                if (by.isNotEmpty || atStr.isNotEmpty)
                  Text(
                    [if (by.isNotEmpty) 'bởi $by', if (atStr.isNotEmpty) atStr]
                        .join(' · '),
                    style: TextStyle(
                        fontSize: 11,
                        color: isDark
                            ? Colors.grey.shade500
                            : Colors.grey.shade500),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Small reusable widgets ─────────────────────────────────────────────────────
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status, this.large = false});

  final String status;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final color = _color(status);
    final label = _label(status);
    return Container(
      padding: EdgeInsets.symmetric(
          horizontal: large ? 12 : 8, vertical: large ? 5 : 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(large ? 10 : 6),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(label,
          style: TextStyle(
              color: color,
              fontSize: large ? 13 : 11,
              fontWeight: FontWeight.bold)),
    );
  }

  Color _color(String s) {
    switch (s.toUpperCase()) {
      case 'NEW':
        return Colors.amber.shade700;
      case 'IN_PROGRESS':
        return Colors.blue.shade700;
      case 'RESOLVED':
        return Colors.green.shade700;
      case 'CLOSED':
        return Colors.grey.shade600;
      case 'REJECTED':
        return Colors.red.shade700;
      default:
        return Colors.grey.shade500;
    }
  }

  String _label(String s) {
    const map = {
      'NEW': 'Mới',
      'IN_PROGRESS': 'Đang xử lý',
      'RESOLVED': 'Đã giải quyết',
      'CLOSED': 'Đã đóng',
      'REJECTED': 'Từ chối',
    };
    return map[s.toUpperCase()] ?? s;
  }
}

class _PriorityBadge extends StatelessWidget {
  const _PriorityBadge({required this.priority});

  final String priority;

  @override
  Widget build(BuildContext context) {
    final color = _color(priority);
    final label = _label(priority);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(label,
          style: TextStyle(
              color: color, fontSize: 10, fontWeight: FontWeight.bold)),
    );
  }

  Color _color(String p) {
    switch (p.toUpperCase()) {
      case 'URGENT':
        return Colors.red.shade900;
      case 'HIGH':
        return Colors.red;
      case 'MEDIUM':
        return Colors.orange;
      default:
        return Colors.blue;
    }
  }

  String _label(String p) {
    const map = {
      'URGENT': 'KHẨN CẤP',
      'HIGH': 'CAO',
      'MEDIUM': 'TRUNG BÌNH',
      'LOW': 'THẤP',
    };
    return map[p.toUpperCase()] ?? p;
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.isDark,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon,
              size: 15,
              color: isDark ? Colors.grey.shade500 : Colors.grey.shade400),
          const SizedBox(width: 6),
          Text('$label: ',
              style: TextStyle(
                  fontSize: 12,
                  color: isDark ? Colors.grey.shade500 : Colors.grey.shade500)),
          Expanded(
            child: Text(value,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color:
                        isDark ? Colors.grey.shade300 : Colors.grey.shade700)),
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withOpacity(0.25)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 4),
            Text(label,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: color)),
          ],
        ),
      ),
    );
  }
}
