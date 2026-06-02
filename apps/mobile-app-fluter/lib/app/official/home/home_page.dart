import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';

import '../../../state/session_controller.dart';
import '../../../services/app_services.dart';
import '../../../models/report_item.dart';
import '../../../features/map/map_screen.dart';
import '../../../features/events/events_screen.dart';
import '../../../features/notifications/notifications_screen.dart';

class OfficialHomePage extends StatefulWidget {
  const OfficialHomePage({super.key});

  @override
  State<OfficialHomePage> createState() => _OfficialHomePageState();
}

class _OfficialHomePageState extends State<OfficialHomePage> {
  bool _loading = true;
  String? _error;
  List<ReportItem> _reports = const [];
  int _newCount = 0;
  int _inProgressCount = 0;
  int _resolvedCount = 0;

  @override
  void initState() {
    super.initState();
    _fetchDashboardData();
  }

  Future<void> _fetchDashboardData() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final services = context.read<AppServices>();
      final allReports = await services.reportService.listReports(limit: 100);

      int countNew = 0;
      int countInProgress = 0;
      int countResolved = 0;

      for (var r in allReports) {
        final status = r.status.toUpperCase();
        if (status == 'NEW') {
          countNew++;
        } else if (status == 'IN_PROGRESS') {
          countInProgress++;
        } else if (status == 'RESOLVED') {
          countResolved++;
        }
      }

      if (mounted) {
        setState(() {
          _reports = allReports;
          _newCount = countNew;
          _inProgressCount = countInProgress;
          _resolvedCount = countResolved;
          _loading = false;
        });
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

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final user = session.user;
    if (user == null) {
      return const Scaffold(
        backgroundColor: Color(0xFF0B0F19),
        body: Center(child: CircularProgressIndicator(color: Color(0xFF22C55E))),
      );
    }

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? const Color(0xFF0B0F19) : const Color(0xFFF8FAFC);
    final cardBgColor = isDark ? const Color(0xFF1E293B) : Colors.white;
    final primaryTextColor = isDark ? const Color(0xFFF8FAFC) : const Color(0xFF0F172A);
    final secondaryTextColor = isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569);
    final now = DateTime.now();
    final weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    final weekday = weekdays[now.weekday % 7];
    final formattedDate = '$weekday, ngày ${now.day.toString().padLeft(2, '0')}/${now.month.toString().padLeft(2, '0')}/${now.year}';

    return Scaffold(
      backgroundColor: bgColor,
      body: RefreshIndicator(
        onRefresh: _fetchDashboardData,
        color: const Color(0xFF22C55E),
        backgroundColor: cardBgColor,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // ─── Beautiful Premium Sliver App Bar ─────────────────────────────────
            SliverAppBar(
              expandedHeight: 140,
              floating: false,
              pinned: true,
              backgroundColor: isDark ? const Color(0xFF0B0F19) : const Color(0xFF1E3A8A),
              elevation: 0,
              actions: [
                IconButton(
                  icon: const Icon(Icons.notifications_outlined, color: Colors.white),
                  onPressed: () {
                    Navigator.of(context, rootNavigator: true).push(
                      MaterialPageRoute(builder: (_) => const NotificationsScreen()),
                    );
                  },
                ),
              ],
              flexibleSpace: FlexibleSpaceBar(
                background: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: isDark 
                        ? [const Color(0xFF0B0F19), const Color(0xFF1E293B)] 
                        : [const Color(0xFF1E3A8A), const Color(0xFF3B82F6)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 50, 20, 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          formattedDate,
                          style: TextStyle(
                            color: isDark ? const Color(0xFF94A3B8) : Colors.white.withOpacity(0.8),
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    user.fullName,
                                    style: GoogleFonts.poppins(
                                      color: Colors.white,
                                      fontSize: 20,
                                      fontWeight: FontWeight.bold,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    'Chức vụ: ${user.role == "ADMIN" ? "Quản trị viên" : "Cán bộ đô thị"}',
                                    style: TextStyle(
                                      color: isDark ? const Color(0xFF22C55E) : const Color(0xFF34D399),
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            CircleAvatar(
                              radius: 24,
                              backgroundColor: const Color(0xFF22C55E).withOpacity(0.2),
                              backgroundImage: user.avatarUrl != null ? NetworkImage(user.avatarUrl!) : null,
                              child: user.avatarUrl == null 
                                ? const Icon(Icons.security, color: Color(0xFF22C55E), size: 24) 
                                : null,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            
            // ─── Dashboard content ────────────────────────────────────────────────
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 20.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // KPI Row Section
                    Text(
                      'Tình trạng nghiệp vụ',
                      style: GoogleFonts.poppins(
                        color: primaryTextColor,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _buildKPIGrid(isDark, cardBgColor, primaryTextColor),
                    const SizedBox(height: 24),

                    // Quick Actions
                    Text(
                      'Hành động nhanh',
                      style: GoogleFonts.poppins(
                        color: primaryTextColor,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _buildQuickActions(context, isDark, cardBgColor, primaryTextColor, secondaryTextColor),
                    const SizedBox(height: 24),

                    // Recent Urgencies / Assigment list
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Sự cố khẩn cấp & Mới nhận',
                          style: GoogleFonts.poppins(
                            color: primaryTextColor,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        TextButton(
                          onPressed: () {
                            context.go('/official/reports');
                          },
                          child: const Text(
                            'Xem tất cả',
                            style: TextStyle(
                              color: Color(0xFF22C55E),
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _buildRecentUrgenciesList(context, isDark, cardBgColor, primaryTextColor, secondaryTextColor),
                    const SizedBox(height: 80), // extra padding for floating tabbar
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildKPIGrid(bool isDark, Color cardBg, Color textMain) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cardWidth = (constraints.maxWidth - 24) / 3;
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _buildKPICard(
              title: 'Mới nhận',
              value: _loading ? '...' : '$_newCount',
              color: const Color(0xFFF59E0B), // Amber
              icon: Icons.new_releases_outlined,
              width: cardWidth,
              isDark: isDark,
              cardBg: cardBg,
            ),
            _buildKPICard(
              title: 'Đang xử lý',
              value: _loading ? '...' : '$_inProgressCount',
              color: const Color(0xFF3B82F6), // Blue
              icon: Icons.sync_rounded,
              width: cardWidth,
              isDark: isDark,
              cardBg: cardBg,
            ),
            _buildKPICard(
              title: 'Giải quyết',
              value: _loading ? '...' : '$_resolvedCount',
              color: const Color(0xFF22C55E), // Green
              icon: Icons.check_circle_outline_rounded,
              width: cardWidth,
              isDark: isDark,
              cardBg: cardBg,
            ),
          ],
        );
      },
    );
  }

  Widget _buildKPICard({
    required String title,
    required String value,
    required Color color,
    required IconData icon,
    required double width,
    required bool isDark,
    required Color cardBg,
  }) {
    return Container(
      width: width,
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
      decoration: BoxDecoration(
        color: isDark ? cardBg.withOpacity(0.6) : cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isDark 
            ? color.withOpacity(0.2) 
            : const Color(0xFFE2E8F0),
          width: 1.5,
        ),
        boxShadow: isDark ? null : [
          BoxShadow(
            color: color.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 4),
          )
        ],
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: GoogleFonts.poppins(
              color: isDark ? Colors.white : const Color(0xFF0F172A),
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: TextStyle(
              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActions(
    BuildContext context, 
    bool isDark, 
    Color cardBg, 
    Color primaryText, 
    Color secondaryText
  ) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        _buildActionItem(
          context,
          icon: Icons.map_outlined,
          label: 'Bản đồ sự cố',
          color: const Color(0xFF22C55E),
          isDark: isDark,
          cardBg: cardBg,
          primaryText: primaryText,
          onTap: () {
            Navigator.of(context, rootNavigator: true).push(
              MaterialPageRoute(builder: (_) => const MapScreen()),
            );
          },
        ),
        _buildActionItem(
          context,
          icon: Icons.manage_search_rounded,
          label: 'Tra cứu nhanh',
          color: const Color(0xFF3B82F6),
          isDark: isDark,
          cardBg: cardBg,
          primaryText: primaryText,
          onTap: () {
            context.go('/official/reports');
          },
        ),
        _buildActionItem(
          context,
          icon: Icons.event_note_rounded,
          label: 'Lịch sự kiện',
          color: const Color(0xFF8B5CF6),
          isDark: isDark,
          cardBg: cardBg,
          primaryText: primaryText,
          onTap: () {
            Navigator.of(context, rootNavigator: true).push(
              MaterialPageRoute(builder: (_) => const EventsScreen()),
            );
          },
        ),
      ],
    );
  }

  Widget _buildActionItem(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Color color,
    required bool isDark,
    required Color cardBg,
    required Color primaryText,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 4),
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isDark ? Colors.grey.shade800 : const Color(0xFFE2E8F0),
            ),
          ),
          child: Column(
            children: [
              Icon(icon, color: color, size: 28),
              const SizedBox(height: 8),
              Text(
                label,
                style: TextStyle(
                  color: primaryText,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRecentUrgenciesList(
    BuildContext context, 
    bool isDark, 
    Color cardBg, 
    Color primaryText, 
    Color secondaryText
  ) {
    if (_loading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 24.0),
          child: CircularProgressIndicator(color: Color(0xFF22C55E)),
        ),
      );
    }

    if (_error != null) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.red.withOpacity(0.08),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          'Không thể tải danh sách sự cố: $_error',
          style: const TextStyle(color: Colors.redAccent, fontSize: 13),
        ),
      );
    }

    final urgentReports = _reports.where((r) {
      final prio = r.priority.toUpperCase();
      final stat = r.status.toUpperCase();
      return prio == 'URGENT' || prio == 'HIGH' || stat == 'NEW';
    }).toList();

    if (urgentReports.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 16),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B).withOpacity(0.4) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isDark ? Colors.grey.shade800 : const Color(0xFFE2E8F0),
          ),
        ),
        child: Column(
          children: [
            Icon(Icons.assignment_turned_in_outlined, 
              size: 40, 
              color: isDark ? Colors.grey.shade600 : Colors.grey.shade400,
            ),
            const SizedBox(height: 12),
            Text(
              'Không có sự cố khẩn cấp mới nào cần xử lý.',
              style: TextStyle(color: secondaryText, fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
    }

    // Limit to top 3 items
    final displayReports = urgentReports.take(3).toList();

    return Column(
      children: displayReports.map((report) {
        final time = DateTime.tryParse(report.createdAt);
        final formattedTime = time == null 
            ? '' 
            : DateFormat('dd/MM/yyyy HH:mm').format(time.toLocal());
            
        Color badgeColor;
        String badgeText;
        if (report.priority.toUpperCase() == 'URGENT') {
          badgeColor = Colors.red;
          badgeText = 'Khẩn cấp';
        } else if (report.priority.toUpperCase() == 'HIGH') {
          badgeColor = Colors.orange;
          badgeText = 'Ưu tiên cao';
        } else {
          badgeColor = const Color(0xFF3B82F6);
          badgeText = 'Mới nhận';
        }

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: isDark ? Colors.grey.shade800 : const Color(0xFFE2E8F0),
            ),
            boxShadow: isDark ? null : [
              BoxShadow(
                color: Colors.black.withOpacity(0.02),
                blurRadius: 6,
                offset: const Offset(0, 3),
              )
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: badgeColor.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      badgeText,
                      style: TextStyle(
                        color: badgeColor,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  Text(
                    formattedTime,
                    style: TextStyle(color: secondaryText, fontSize: 10),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                report.title,
                style: TextStyle(
                  color: primaryText,
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 6),
              if (report.description != null && report.description!.isNotEmpty) ...[
                Text(
                  report.description!,
                  style: TextStyle(color: secondaryText, fontSize: 12),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
              ],
              Row(
                children: [
                  Icon(Icons.location_on_outlined, size: 12, color: badgeColor),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      report.locationCode,
                      style: TextStyle(color: secondaryText, fontSize: 11),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  TextButton(
                    onPressed: () {
                      context.go('/official/reports');
                    },
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text(
                      'Xử lý',
                      style: TextStyle(
                        color: Color(0xFF22C55E),
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
