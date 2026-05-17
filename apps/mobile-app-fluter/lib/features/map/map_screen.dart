import 'package:flutter/material.dart';

class MapScreen extends StatelessWidget {
  const MapScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bản đồ sự cố'),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF1E1B4B),
        elevation: 0,
      ),
      body: Stack(
        children: [
          Container(
            color: const Color(0xFFE2E8F0),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.map_outlined, size: 80, color: Colors.blueGrey[300]),
                  const SizedBox(height: 16),
                  Text(
                    'Đang tải dữ liệu bản đồ...',
                    style: TextStyle(color: Colors.blueGrey[600], fontSize: 16),
                  ),
                ],
              ),
            ),
          ),
          // Fake bottom sheet for nearby incidents
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                boxShadow: [
                  BoxShadow(color: Colors.black12, blurRadius: 10, offset: Offset(0, -5))
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.grey[300],
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text('Sự cố gần bạn', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                  const SizedBox(height: 16),
                  _buildIncidentItem(Icons.water_drop, 'Ngập nước', 'Đường Nguyễn Hữu Cảnh', '500m'),
                  _buildIncidentItem(Icons.construction, 'Đang thi công', 'Cầu Thị Nghè', '1.2km'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildIncidentItem(IconData icon, String title, String location, String distance) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.red[50],
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: Colors.red),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(location),
      trailing: Text(distance, style: const TextStyle(color: Colors.grey, fontWeight: FontWeight.bold)),
    );
  }
}
