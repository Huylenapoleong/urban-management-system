import 'package:flutter/material.dart';

class EventsScreen extends StatelessWidget {
  const EventsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sự kiện địa phương'),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF1E1B4B),
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildEventCard(
            'Hội chợ Nông sản Sạch',
            'Công viên Lê Văn Tám',
            '12 Th 5, 08:00 - 20:00',
            Icons.shopping_basket,
            Colors.orange,
          ),
          const SizedBox(height: 16),
          _buildEventCard(
            'Lễ hội Âm nhạc Mùa Hè',
            'Phố đi bộ Nguyễn Huệ',
            '18 Th 5, 19:00 - 22:30',
            Icons.music_note,
            Colors.purple,
          ),
          const SizedBox(height: 16),
          _buildEventCard(
            'Ngày hội Môi trường',
            'Trung tâm triển lãm',
            '25 Th 5, 07:30 - 11:30',
            Icons.eco,
            Colors.green,
          ),
        ],
      ),
    );
  }

  Widget _buildEventCard(String title, String location, String time, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          )
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: color, size: 32),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.location_on, size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(location, style: const TextStyle(color: Colors.grey, fontSize: 13)),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.access_time, size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(time, style: const TextStyle(color: Colors.grey, fontSize: 13)),
                  ],
                ),
              ],
            ),
          )
        ],
      ),
    );
  }
}
