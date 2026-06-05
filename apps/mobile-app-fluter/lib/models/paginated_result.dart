class PaginatedResult<T> {
  const PaginatedResult({
    required this.items,
    this.cursor,
    this.hasNextPage = false,
  });

  final List<T> items;
  final String? cursor;
  final bool hasNextPage;

  factory PaginatedResult.fromRaw(Map<String, dynamic> raw, T Function(Map<String, dynamic>) mapper) {
    final rawData = raw['data'] as List?;
    final meta = raw['meta'] as Map<String, dynamic>?;

    final items = rawData?.map((item) => mapper((item as Map).cast<String, dynamic>())).toList() ?? [];
    
    final nextCursor = meta?['nextCursor']?.toString() ?? meta?['cursor']?.toString();
    final hasNextPage = nextCursor != null && nextCursor.isNotEmpty;

    return PaginatedResult<T>(
      items: items,
      cursor: nextCursor,
      hasNextPage: hasNextPage,
    );
  }
}
