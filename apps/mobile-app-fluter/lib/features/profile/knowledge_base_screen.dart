import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../models/knowledge_document.dart';
import '../../state/providers.dart';

class KnowledgeBaseScreen extends ConsumerStatefulWidget {
  const KnowledgeBaseScreen({super.key});

  @override
  ConsumerState<KnowledgeBaseScreen> createState() => _KnowledgeBaseScreenState();
}

class _KnowledgeBaseScreenState extends ConsumerState<KnowledgeBaseScreen> {
  final _searchController = TextEditingController();
  String _selectedCategory = 'ALL';
  String _selectedStatus = 'ALL';

  List<KnowledgeDocument> _documents = [];
  String? _nextCursor;
  bool _isLoading = false;
  bool _isLoadingMore = false;
  String? _error;

  final List<Map<String, String>> _categories = const [
    {'value': 'ALL', 'label': 'Tất cả danh mục'},
    {'value': 'land', 'label': 'Đất đai'},
    {'value': 'construction', 'label': 'Xây dựng'},
    {'value': 'environment', 'label': 'Môi trường'},
    {'value': 'administrative', 'label': 'Thủ tục hành chính'},
    {'value': 'urban', 'label': 'Quy hoạch đô thị'},
  ];

  final Set<String> _expandedIds = {};

  @override
  void initState() {
    super.initState();
    _loadInitial();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadInitial() async {
    setState(() {
      _isLoading = true;
      _error = null;
      _documents.clear();
      _nextCursor = null;
    });

    try {
      final service = ref.read(knowledgeServiceProvider);
      final result = await service.listDocuments(
        q: _searchController.text.trim().isEmpty ? null : _searchController.text.trim(),
        category: _selectedCategory == 'ALL' ? null : _selectedCategory,
        status: _selectedStatus == 'ALL' ? null : _selectedStatus,
        limit: 10,
      );

      if (mounted) {
        setState(() {
          _documents = result.items;
          _nextCursor = result.cursor;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    if (_nextCursor == null || _isLoadingMore) return;

    setState(() {
      _isLoadingMore = true;
    });

    try {
      final service = ref.read(knowledgeServiceProvider);
      final result = await service.listDocuments(
        q: _searchController.text.trim().isEmpty ? null : _searchController.text.trim(),
        category: _selectedCategory == 'ALL' ? null : _selectedCategory,
        status: _selectedStatus == 'ALL' ? null : _selectedStatus,
        limit: 10,
        cursor: _nextCursor,
      );

      if (mounted) {
        setState(() {
          _documents.addAll(result.items);
          _nextCursor = result.cursor;
          _isLoadingMore = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoadingMore = false;
        });
      }
    }
  }

  String _formatCategoryLabel(String cat) {
    switch (cat.toLowerCase()) {
      case 'land':
        return 'Đất đai';
      case 'construction':
        return 'Xây dựng';
      case 'environment':
        return 'Môi trường';
      case 'administrative':
        return 'Hành chính';
      case 'urban':
        return 'Quy hoạch';
      default:
        return cat;
    }
  }

  Color _getCategoryColor(String cat) {
    switch (cat.toLowerCase()) {
      case 'land':
        return const Color(0xFF10B981); // Emerald
      case 'construction':
        return const Color(0xFFF97316); // Orange
      case 'environment':
        return const Color(0xFF14B8A6); // Teal
      case 'administrative':
        return const Color(0xFF3B82F6); // Blue
      case 'urban':
        return const Color(0xFF8B5CF6); // Violet
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primaryColor = const Color(0xFF15803D); // Standard premium green

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF0F172A) : primaryColor,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          'Tra cứu Pháp luật Đô thị',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
      ),
      body: Column(
        children: [
          _buildSearchAndFilters(isDark),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFF15803D)))
                : _error != null
                    ? _buildErrorWidget()
                    : _documents.isEmpty
                        ? _buildEmptyWidget(isDark)
                        : _buildDocumentsList(isDark),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchAndFilters(bool isDark) {
    return Container(
      color: isDark ? const Color(0xFF0F172A) : Colors.white,
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Search Field
          Container(
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isDark ? Colors.white.withOpacity(0.05) : Colors.grey.shade200,
              ),
            ),
            child: TextField(
              controller: _searchController,
              onSubmitted: (_) => _loadInitial(),
              style: TextStyle(color: isDark ? Colors.white : Colors.black87),
              decoration: InputDecoration(
                hintText: 'Tìm kiếm quy định pháp luật...',
                hintStyle: TextStyle(color: isDark ? Colors.grey.shade500 : Colors.grey),
                prefixIcon: const Icon(Icons.search_rounded, color: Colors.grey),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear_rounded, size: 18),
                        onPressed: () {
                          _searchController.clear();
                          _loadInitial();
                        },
                      )
                    : null,
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
            ),
          ),
          const SizedBox(height: 12),
          // Horizontal Category List
          SizedBox(
            height: 38,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: _categories.length,
              itemBuilder: (context, index) {
                final cat = _categories[index];
                final isSelected = _selectedCategory == cat['value'];
                final activeBgColor = const Color(0xFF15803D);

                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () {
                      setState(() {
                        _selectedCategory = cat['value']!;
                      });
                      _loadInitial();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? activeBgColor
                            : (isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9)),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: isSelected
                              ? activeBgColor
                              : (isDark ? Colors.white.withOpacity(0.05) : Colors.transparent),
                        ),
                      ),
                      child: Center(
                        child: Text(
                          cat['label']!,
                          style: TextStyle(
                            color: isSelected ? Colors.white : (isDark ? Colors.grey.shade300 : Colors.black87),
                            fontSize: 12,
                            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyWidget(bool isDark) {
    return ListView(
      children: [
        const SizedBox(height: 120),
        Icon(Icons.find_in_page_outlined,
            size: 80, color: isDark ? Colors.grey.shade700 : Colors.grey.shade300),
        const SizedBox(height: 16),
        Center(
          child: Text(
            'Không tìm thấy văn bản phù hợp',
            style: TextStyle(
              fontSize: 16,
              color: isDark ? Colors.grey.shade500 : Colors.grey,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildErrorWidget() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline_rounded, color: Colors.redAccent, size: 48),
            const SizedBox(height: 16),
            Text(
              _error ?? 'Lỗi không xác định',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.redAccent),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _loadInitial,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF15803D),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Thử lại', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDocumentsList(bool isDark) {
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: _documents.length + (_nextCursor != null ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == _documents.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Center(
              child: _isLoadingMore
                  ? const CircularProgressIndicator(color: Color(0xFF15803D))
                  : OutlinedButton(
                      onPressed: _loadMore,
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Color(0xFF15803D)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                      ),
                      child: const Text(
                        'Tải thêm tài liệu',
                        style: TextStyle(color: Color(0xFF15803D), fontWeight: FontWeight.bold),
                      ),
                    ),
            ),
          );
        }

        final doc = _documents[index];
        final isExpanded = _expandedIds.contains(doc.id);
        final color = _getCategoryColor(doc.category);

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isDark ? Colors.white.withOpacity(0.06) : Colors.grey.shade200,
              width: 1.2,
            ),
            boxShadow: isDark
                ? null
                : [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.02),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    )
                  ],
          ),
          child: ExpansionTile(
            key: PageStorageKey<String>(doc.id),
            initiallyExpanded: isExpanded,
            onExpansionChanged: (expanded) {
              setState(() {
                if (expanded) {
                  _expandedIds.add(doc.id);
                } else {
                  _expandedIds.remove(doc.id);
                }
              });
            },
            title: Text(
              doc.title,
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.bold,
                fontSize: 15,
                color: isDark ? Colors.white : const Color(0xFF0F172A),
              ),
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: color.withOpacity(0.3), width: 1),
                    ),
                    child: Text(
                      _formatCategoryLabel(doc.category),
                      style: TextStyle(
                        color: color,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Nguồn: ${doc.source}',
                    style: TextStyle(
                      color: isDark ? Colors.grey.shade400 : Colors.grey.shade600,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            expandedAlignment: Alignment.topLeft,
            expandedCrossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Divider(height: 16),
              Text(
                doc.content.replaceAll(RegExp(r'\s+'), ' ').trim(),
                style: GoogleFonts.inter(
                  fontSize: 14,
                  height: 1.6,
                  color: isDark ? Colors.white.withOpacity(0.9) : Colors.black87,
                ),
              ),
              if (doc.metadata?.lawName != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF0F172A) : Colors.grey.shade50,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isDark ? Colors.white.withOpacity(0.05) : Colors.grey.shade200,
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.gavel_rounded, size: 16, color: Colors.grey),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Văn bản: ${doc.metadata!.lawName!}',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: isDark ? Colors.grey.shade400 : Colors.grey.shade700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}
