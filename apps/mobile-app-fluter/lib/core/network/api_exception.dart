class ApiException implements Exception {
  const ApiException({
    required this.message,
    this.statusCode,
    this.requestId,
  });

  final String message;
  final int? statusCode;
  final String? requestId;

  @override
  String toString() {
    if (statusCode == null) {
      return message;
    }
    return "[$statusCode] $message";
  }
}
