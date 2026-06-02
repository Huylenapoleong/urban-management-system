import "package:isar/isar.dart";

part "report_cache.g.dart";

@collection
class ReportCache {
  Id id = Isar.autoIncrement;

  @Index(unique: true, replace: true)
  late String reportId;

  late String category;
  String? description;
  late String locationCode;
  late String priority;
  late String status;
  late String title;
  late String updatedAt;
}
