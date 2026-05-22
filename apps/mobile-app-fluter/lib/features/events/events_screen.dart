import 'package:flutter/material.dart';

class EventsScreen extends StatelessWidget {
  const EventsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          'Sự kiện địa phương',
          style: TextStyle(fontWeight: FontWeight.bold, color: isDark ? Colors.white : const Color(0xFF1E1B4B))
        ),
        backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
        elevation: 0,
        iconTheme: IconThemeData(color: isDark ? Colors.white : const Color(0xFF1E1B4B)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildEventCard(
            context,
            'Hội chợ Nông sản Sạch',
            'Công viên Lê Văn Tám',
            '12 Th 5, 08:00 - 20:00',
            Icons.shopping_basket,
            Colors.orange,
          ),
          const SizedBox(height: 16),
          _buildEventCard(
            context,
            'Lễ hội Âm nhạc Mùa Hè',
            'Phố đi bộ Nguyễn Huệ',
            '18 Th 5, 19:00 - 22:30',
            Icons.music_note,
            Colors.purple,
          ),
          const SizedBox(height: 16),
          _buildEventCard(
            context,
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

  Widget _buildEventCard(BuildContext context, String title, String location, String time, IconData icon, Color color) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          if (!isDark)
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
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
              color: color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: color, size: 32),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title, 
                  style: TextStyle(
                    fontWeight: FontWeight.bold, 
                    fontSize: 16,
                    color: isDark ? Colors.white : const Color(0xFF1E1B4B)
                  )
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.location_on, size: 14, color: isDark ? Colors.grey[400] : Colors.grey),
                    const SizedBox(width: 4),
                    Text(
                      location, 
                      style: TextStyle(
                        color: isDark ? Colors.grey[400] : Colors.grey, 
                        fontSize: 13
                      )
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.access_time, size: 14, color: isDark ? Colors.grey[400] : Colors.grey),
                    const SizedBox(width: 4),
                    Text(
                      time, 
                      style: TextStyle(
                        color: isDark ? Colors.grey[400] : Colors.grey, 
                        fontSize: 13
                      )
                    ),
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
