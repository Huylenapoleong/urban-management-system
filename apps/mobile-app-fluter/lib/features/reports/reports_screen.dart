import "package:flutter/material.dart";
import "package:intl/intl.dart";
import "package:geolocator/geolocator.dart";

import "../../models/report_item.dart";
import "../../services/report_service.dart";

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key, required this.reportService});

  final ReportService reportService;

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  final _searchController = TextEditingController();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _locationController = TextEditingController(text: "VN-HCM-D1-W1");

  String _category = "INFRASTRUCTURE";
  String _priority = "MEDIUM";
  bool _loading = true;
  String? _error;
  List<ReportItem> _reports = const <ReportItem>[];
  String _filterStatus = "ALL";

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
        title: const Text("My Reports", style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF1E1B4B))),
        backgroundColor: Colors.white,
        elevation: 0,
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
              const Text("New Report", style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF1E1B4B))),
              const SizedBox(height: 24),
              TextField(
                controller: _titleController,
                decoration: InputDecoration(
                  labelText: "What's happening?",
                  hintText: "Brief title of the issue",
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _descriptionController,
                maxLines: 4,
                decoration: InputDecoration(
                  labelText: "Description",
                  hintText: "Provide more details...",
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 16),
              _buildLocationField(),
              const SizedBox(height: 16),
              _buildDropdowns(),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  onPressed: _submitReport,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF7C3AED),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: const Text("Submit Report", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLocationField() {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _locationController,
            decoration: InputDecoration(
              labelText: "Location Code",
              hintText: "e.g. VN-HCM-D1-W1",
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        IconButton.filledTonal(
          onPressed: _detectLocation,
          icon: const Icon(Icons.my_location),
          tooltip: "Detect Current Location",
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
      // For now, we don't have reverse geocoding to locationCode, 
      // so we'll just show the coordinates if they want, or keep current code.
      // But let's show success.
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Location detected: ${position.latitude.toStringAsFixed(4)}, ${position.longitude.toStringAsFixed(4)}"))
        );
        // If we had a mapping service, we'd update _locationController here.
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error detecting location: $e")));
      }
    }
  }

  Widget _buildDropdowns() {
    return Row(
      children: [
        Expanded(
          child: DropdownButtonFormField<String>(
            value: _category,
            decoration: InputDecoration(labelText: "Category", border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
            items: const [
              DropdownMenuItem(value: "INFRASTRUCTURE", child: Text("Infra")),
              DropdownMenuItem(value: "ENVIRONMENT", child: Text("Env")),
              DropdownMenuItem(value: "SECURITY", child: Text("Security")),
            ],
            onChanged: (val) => setState(() => _category = val!),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: DropdownButtonFormField<String>(
            value: _priority,
            decoration: InputDecoration(labelText: "Priority", border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
            items: const [
              DropdownMenuItem(value: "LOW", child: Text("Low")),
              DropdownMenuItem(value: "MEDIUM", child: Text("Med")),
              DropdownMenuItem(value: "HIGH", child: Text("High")),
            ],
            onChanged: (val) => setState(() => _priority = val!),
          ),
        ),
      ],
    );
  }

  Future<void> _submitReport() async {
    try {
      await widget.reportService.createReport(
        title: _titleController.text.trim(),
        description: _descriptionController.text.trim(),
        category: _category,
        priority: _priority,
        locationCode: _locationController.text.trim(),
      );
      if (!mounted) return;
      Navigator.pop(context);
      _titleController.clear();
      _descriptionController.clear();
      _loadReports();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Report submitted successfully!")));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
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
          Text(report.description ?? "No description", maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          const SizedBox(height: 16),
          Row(
            children: [
              Icon(Icons.category_outlined, size: 14, color: Colors.grey.shade400),
              const SizedBox(width: 4),
              Text(report.category, style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
              const Spacer(),
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
