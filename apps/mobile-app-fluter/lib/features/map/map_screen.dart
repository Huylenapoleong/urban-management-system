import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong2.dart';
import 'package:provider/provider.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';

import '../../services/app_services.dart';
import '../../services/location_service.dart';
import '../../models/report_item.dart';
import '../../state/session_controller.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final MapController _mapController = MapController();
  
  bool _loading = true;
  String? _error;
  
  List<ReportItem> _reports = [];
  ReportItem? _selectedReport;
  LatLng _center = const LatLng(10.7769, 106.7009); // TP.HCM center default
  double _zoom = 13.0;

  final Map<String, String> _resolvedLocations = {};

  Future<void> _resolveReportLocation(String locationCode) async {
    if (locationCode.isEmpty || _resolvedLocations.containsKey(locationCode)) return;
    
    try {
      final services = context.read<AppServices>();
      final locationService = LocationService(apiClient: services.apiClient);
      final resolved = await locationService.resolveLocationCode(locationCode);
      if (mounted) {
        setState(() {
          _resolvedLocations[locationCode] = resolved.displayName;
        });
      }
    } catch (e) {
      debugPrint("Failed to resolve location code $locationCode: $e");
    }
  }

  @override
  void initState() {
    super.initState();
    _initializeMapAndData();
  }

  Future<void> _initializeMapAndData() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final session = context.read<SessionController>();
      final services = context.read<AppServices>();
      final user = session.user;
      final role = user?.role ?? 'CITIZEN';
      final locationCode = user?.locationCode ?? 'VN-79';

      // 1. Get base center coordinates from user's locationCode fallback
      LatLng resolvedBase = _getCentroid(locationCode);
      _center = resolvedBase;

      // 2. Fetch real reports from API
      List<ReportItem> apiReports = [];
      try {
        if (role == 'CITIZEN') {
          apiReports = await services.reportService.listReports(mine: true);
        } else {
          apiReports = await services.reportService.listReports(limit: 100);
        }
      } catch (e) {
        debugPrint("Error loading reports for map: $e");
      }

      // 3. Try to get active device GPS positioning
      LatLng? deviceGPS;
      try {
        bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
        if (serviceEnabled) {
          LocationPermission permission = await Geolocator.checkPermission();
          if (permission == LocationPermission.denied) {
            permission = await Geolocator.requestPermission();
          }
          if (permission == LocationPermission.always || permission == LocationPermission.whileInUse) {
            final position = await Geolocator.getCurrentPosition(
              desiredAccuracy: LocationAccuracy.high,
              timeLimit: const Duration(seconds: 4),
            );
            deviceGPS = LatLng(position.latitude, position.longitude);
          }
        }
      } catch (e) {
        debugPrint("GPS location retrieval bypassed or timeout: $e");
      }

      if (mounted) {
        setState(() {
          _reports = apiReports;
          if (deviceGPS != null) {
            _center = deviceGPS;
            _zoom = 15.0;
          }
          _loading = false;
        });
        
        // Animating map center transition
        _mapController.move(_center, _zoom);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  /// Map locationCode into deterministic centroids (centers) of typical wards/cities
  LatLng _getCentroid(String locationCode) {
    // tp.hcm centers
    if (locationCode.contains('26734') || locationCode.contains('BenNghe')) {
      return const LatLng(10.7766, 106.7015); // Phường Bến Nghé
    } else if (locationCode.contains('26737') || locationCode.contains('BenThanh')) {
      return const LatLng(10.7725, 106.6980); // Phường Bến Thành
    } else if (locationCode.contains('26743') || locationCode.contains('PhamNguLao')) {
      return const LatLng(10.7686, 106.6912); // Phường Phạm Ngũ Lão
    }
    
    // Hanoi standard center
    if (locationCode.startsWith('VN-01')) {
      return const LatLng(21.0285, 105.8542);
    }
    
    // Da Nang standard center
    if (locationCode.startsWith('VN-48')) {
      return const LatLng(16.0544, 108.2022);
    }

    // Default to Ho Chi Minh City Center
    return const LatLng(10.7769, 106.7009);
  }

  /// Calculates a reproducible, deterministic offset coordinate for reports sharing the same locationCode
  LatLng _getDeterministicCoordinates(ReportItem report) {
    LatLng base = _getCentroid(report.locationCode);
    
    // Use report ID hash value to seed minor offsets
    final int hash = report.id.hashCode;
    
    // Spread markers systematically in a circle around base center (radius approx 600m max)
    final double angle = (hash % 360) * pi / 180;
    final double radius = ((hash ~/ 360) % 20 + 5) * 0.00015; // 0.00075 to 0.00375 degree offset

    final double lat = base.latitude + (radius * sin(angle));
    final double lng = base.longitude + (radius * cos(angle));
    
    return LatLng(lat, lng);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    final mainText = isDark ? Colors.white : const Color(0xFF1E1B4B);
    final cardBg = isDark ? const Color(0xFF1E293B) : Colors.white;
    final borderCol = isDark ? Colors.white.withOpacity(0.08) : Colors.black.withOpacity(0.05);

    // Dynamic marker generation list
    final List<Marker> markers = _reports.map((report) {
      final position = _getDeterministicCoordinates(report);
      
      Color priorityColor;
      switch (report.priority.toUpperCase()) {
        case 'URGENT':
        case 'HIGH':
          priorityColor = Colors.redAccent;
          break;
        case 'MEDIUM':
          priorityColor = Colors.amber;
          break;
        case 'LOW':
        default:
          priorityColor = Colors.green;
      }

      IconData markerIcon;
      switch (report.category.toUpperCase()) {
        case 'INFRASTRUCTURE':
          markerIcon = Icons.construction;
          break;
        case 'ENVIRONMENT':
          markerIcon = Icons.eco_outlined;
          break;
        case 'SECURITY':
          markerIcon = Icons.security_rounded;
          break;
        case 'ADMIN':
        default:
          markerIcon = Icons.assignment_outlined;
      }

      final isSelected = _selectedReport?.id == report.id;

      return Marker(
        point: position,
        width: isSelected ? 52.0 : 42.0,
        height: isSelected ? 52.0 : 42.0,
        child: GestureDetector(
          onTap: () {
            setState(() {
              _selectedReport = report;
            });
            _resolveReportLocation(report.locationCode);
            _mapController.move(position, _mapController.camera.zoom);
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: priorityColor,
              shape: BoxShape.circle,
              border: Border.all(
                color: isSelected ? Colors.white : cardBg,
                width: isSelected ? 3.0 : 2.0,
              ),
              boxShadow: [
                BoxShadow(
                  color: priorityColor.withOpacity(0.4),
                  blurRadius: isSelected ? 12 : 6,
                  spreadRadius: isSelected ? 3 : 1,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Icon(
              markerIcon,
              color: Colors.white,
              size: isSelected ? 24.0 : 18.0,
            ),
          ),
        ),
      );
    }).toList();

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          'Bản đồ sự cố',
          style: TextStyle(fontWeight: FontWeight.bold, color: mainText),
        ),
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        elevation: 0,
        iconTheme: IconThemeData(color: mainText),
        actions: [
          IconButton(
            icon: const Icon(Icons.gps_fixed),
            onPressed: _initializeMapAndData,
            tooltip: "Tìm vị trí của tôi",
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Stack(
        children: [
          // ─── Real Leaflet/OpenStreetMap Layer ──────────────────────────────────
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _center,
              initialZoom: _zoom,
              maxZoom: 18,
              minZoom: 5,
              onTap: (_, __) {
                if (_selectedReport != null) {
                  setState(() {
                    _selectedReport = null;
                  });
                }
              },
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.huylenapoleong.urbanmanagementsystem',
              ),
              MarkerLayer(markers: markers),
            ],
          ),

          // ─── Loading Overlay ───────────────────────────────────────────────────
          if (_loading)
            Container(
              color: Colors.black.withOpacity(0.4),
              child: const Center(
                child: Card(
                  color: Color(0xFF1E293B),
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircularProgressIndicator(color: Colors.deepPurpleAccent),
                        SizedBox(width: 16),
                        Text(
                          'Đang tải bản đồ đô thị...',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),

          // ─── Selected Report Bottom Card Details ──────────────────────────────
          if (_selectedReport != null)
            Positioned(
              bottom: 16,
              left: 16,
              right: 16,
              child: _buildDetailsCard(context, _selectedReport!, isDark, cardBg, mainText, borderCol),
            ),

          // ─── Quick Summary Float Chip ──────────────────────────────────────────
          if (!_loading && _error == null)
            Positioned(
              top: 16,
              left: 16,
              child: Card(
                color: isDark ? const Color(0xFF1E293B) : Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                elevation: 4,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.location_on, color: Colors.redAccent, size: 16),
                      const SizedBox(width: 6),
                      Text(
                        'Tổng số sự cố: ${_reports.length}',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: mainText,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildDetailsCard(
    BuildContext context,
    ReportItem report,
    bool isDark,
    Color cardBg,
    Color mainText,
    Color borderCol,
  ) {
    Color priorityColor;
    String priorityLabel;
    switch (report.priority.toUpperCase()) {
      case 'URGENT':
        priorityColor = Colors.red.shade900;
        priorityLabel = "KHẨN CẤP";
        break;
      case 'HIGH':
        priorityColor = Colors.red;
        priorityLabel = "CAO";
        break;
      case 'MEDIUM':
        priorityColor = Colors.orange;
        priorityLabel = "TRUNG BÌNH";
        break;
      case 'LOW':
      default:
        priorityColor = Colors.green;
        priorityLabel = "THẤP";
    }

    Color statusColor;
    String statusLabel;
    switch (report.status.toUpperCase()) {
      case 'NEW':
        statusColor = Colors.amber.shade700;
        statusLabel = "MỚI GỬI";
        break;
      case 'IN_PROGRESS':
        statusColor = Colors.blue.shade700;
        statusLabel = "ĐANG XỬ LÝ";
        break;
      case 'RESOLVED':
        statusColor = Colors.green.shade700;
        statusLabel = "ĐÃ GIẢI QUYẾT";
        break;
      default:
        statusColor = Colors.grey.shade700;
        statusLabel = report.status;
    }

    final formattedTime = DateFormat('dd/MM/yyyy HH:mm').format(
      DateTime.tryParse(report.createdAt)?.toLocal() ?? DateTime.now(),
    );

    return Container(
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: borderCol, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.4 : 0.08),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag Indicator/Top Border Info
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: statusColor.withOpacity(0.3), width: 1),
                  ),
                  child: Text(
                    statusLabel,
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                IconButton(
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: () {
                    setState(() {
                      _selectedReport = null;
                    });
                  },
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              report.title,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: mainText,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 6),
            Text(
              report.description ?? "Không có mô tả chi tiết.",
              style: TextStyle(
                fontSize: 13,
                color: isDark ? Colors.grey[400] : Colors.grey[700],
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 16),
            Divider(color: borderCol, height: 1),
            const SizedBox(height: 16),
            Row(
              children: [
                const Icon(Icons.location_on_outlined, size: 16, color: Colors.redAccent),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    _resolvedLocations[report.locationCode] ?? report.locationCode,
                    style: TextStyle(
                      fontSize: 13,
                      color: isDark ? Colors.grey[300] : Colors.grey[600],
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: priorityColor.withOpacity(0.08),
                    border: Border.all(color: priorityColor.withOpacity(0.3)),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    priorityLabel,
                    style: TextStyle(color: priorityColor, fontSize: 10, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Gửi ngày: $formattedTime',
              style: TextStyle(
                fontSize: 11,
                color: isDark ? Colors.grey[500] : Colors.grey[400],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
