import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:skeletonizer/skeletonizer.dart';
import '../../../../../services/giphy_service.dart';

class GifPickerSheet extends StatefulWidget {
  final Function(String gifUrl) onGifSelected;

  const GifPickerSheet({super.key, required this.onGifSelected});

  static Future<void> show(BuildContext context, {required Function(String) onGifSelected}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => GifPickerSheet(onGifSelected: onGifSelected),
    );
  }

  @override
  State<GifPickerSheet> createState() => _GifPickerSheetState();
}

class _GifPickerSheetState extends State<GifPickerSheet> {
  final GiphyService _giphyService = GiphyService();
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  
  List<Map<String, dynamic>> _gifs = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  int _offset = 0;
  final int _limit = 20;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _loadGifs();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200 && !_isLoadingMore) {
      _loadMoreGifs();
    }
  }

  Future<void> _loadGifs({bool isSearch = false}) async {
    setState(() {
      _isLoading = true;
      _offset = 0;
      if (!isSearch) _gifs.clear();
    });

    final query = _searchController.text.trim();
    List<Map<String, dynamic>> results;
    
    if (query.isEmpty) {
      results = await _giphyService.fetchTrending(limit: _limit, offset: _offset);
    } else {
      results = await _giphyService.searchGifs(query, limit: _limit, offset: _offset);
    }

    if (mounted) {
      setState(() {
        _gifs = results;
        _isLoading = false;
      });
    }
  }

  Future<void> _loadMoreGifs() async {
    setState(() {
      _isLoadingMore = true;
      _offset += _limit;
    });

    final query = _searchController.text.trim();
    List<Map<String, dynamic>> results;

    if (query.isEmpty) {
      results = await _giphyService.fetchTrending(limit: _limit, offset: _offset);
    } else {
      results = await _giphyService.searchGifs(query, limit: _limit, offset: _offset);
    }

    if (mounted) {
      setState(() {
        _gifs.addAll(results);
        _isLoadingMore = false;
      });
    }
  }

  void _onSearchChanged(String query) {
    if (_debounce?.isActive ?? false) _debounce!.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () {
      _loadGifs(isSearch: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primaryColor = Theme.of(context).primaryColor;
    
    return Container(
      height: MediaQuery.of(context).size.height * 0.7,
      padding: const EdgeInsets.only(top: 12, left: 16, right: 16),
      child: Column(
        children: [
          // Drag handle
          Center(
            child: Container(
              width: 40,
              height: 5,
              decoration: BoxDecoration(
                color: isDark ? Colors.grey[800] : Colors.grey[300],
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
          const SizedBox(height: 16),
          // Search bar
          TextField(
            controller: _searchController,
            onChanged: _onSearchChanged,
            style: TextStyle(color: isDark ? Colors.white : Colors.black87),
            decoration: InputDecoration(
              hintText: 'Tìm kiếm GIF...',
              hintStyle: TextStyle(color: isDark ? Colors.grey[500] : Colors.grey[600]),
              prefixIcon: Icon(Icons.search, color: primaryColor),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: Icon(Icons.clear, color: isDark ? Colors.grey[400] : Colors.grey[600]),
                      onPressed: () {
                        _searchController.clear();
                        _loadGifs();
                      },
                    )
                  : null,
              filled: true,
              fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
          const SizedBox(height: 8),
          // Powered by GIPHY attribution
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                "Powered by ",
                style: TextStyle(
                  fontSize: 10,
                  color: isDark ? Colors.grey[500] : Colors.grey[600],
                ),
              ),
              Text(
                "GIPHY",
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.2,
                  color: isDark ? Colors.white70 : Colors.black54,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Grid
          Expanded(
            child: _isLoading
                ? _buildShimmerGrid()
                : _gifs.isEmpty
                    ? const Center(child: Text("Không tìm thấy kết quả nào", style: TextStyle(color: Colors.grey)))
                    : GridView.builder(
                        controller: _scrollController,
                        physics: const BouncingScrollPhysics(),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          crossAxisSpacing: 8,
                          mainAxisSpacing: 8,
                        ),
                        itemCount: _gifs.length + (_isLoadingMore ? 2 : 0),
                        itemBuilder: (context, index) {
                          if (index >= _gifs.length) {
                            return const Skeletonizer(
                              enabled: true,
                              child: Card(child: SizedBox(height: 150)),
                            );
                          }
                          final gifData = _gifs[index];
                          // Lấy URL GIF dung lượng nhẹ để hiển thị nhanh
                          final String url = gifData['images']['fixed_height']['url'] ?? '';
                          return GestureDetector(
                            onTap: () {
                              Navigator.pop(context); // Đóng bottom sheet
                              widget.onGifSelected(url); // Trả về URL
                            },
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: CachedNetworkImage(
                                imageUrl: url,
                                fit: BoxFit.cover,
                                placeholder: (context, url) => const Skeletonizer(
                                  enabled: true,
                                  child: Card(),
                                ),
                                errorWidget: (context, url, error) => const Icon(Icons.error),
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

  Widget _buildShimmerGrid() {
    return Skeletonizer(
      enabled: true,
      child: GridView.builder(
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
        ),
        itemCount: 8,
        itemBuilder: (context, index) {
          return const Card(
            child: SizedBox(height: 150),
          );
        },
      ),
    );
  }
}
