import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MediaAsset, ReportItem } from "@urban/shared-types";
import Header from "@/components/Header";
import CitizenReportCard from "@/components/shared/CitizenReportCard";
import { ENV_CONFIG } from "@/constants/env";
import colors from "@/constants/colors";
import { convertToS3Url } from "@/constants/s3";
import { listReports } from "@/services/api/report.api";

function resolveReportMediaUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const converted = convertToS3Url(trimmed);
  if (/^https?:\/\//i.test(converted)) {
    return converted;
  }

  const normalized = converted.replace(/^\/+/, "");
  if (normalized.startsWith("uploads/")) {
    return `${ENV_CONFIG.S3.NEW_BASE_URL}${normalized.replace(/^uploads\/+/, "")}`;
  }

  return `${ENV_CONFIG.API_BASE_URL.replace(/\/+$/, "")}/${normalized}`;
}

function normalizeReportMedia(report: ReportItem): ReportItem {
  const mediaUrls = (report.mediaUrls ?? [])
    .map((value) => resolveReportMediaUrl(value))
    .filter((value): value is string => Boolean(value));
  const fallbackUrls = (report.mediaAssets ?? [])
    .map((asset: MediaAsset) => resolveReportMediaUrl(asset.resolvedUrl || asset.key))
    .filter((value): value is string => Boolean(value));

  return {
    ...report,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : fallbackUrls,
  };
}

export default function ReportHistoryPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);

    try {
      const data = await listReports({ mine: true, limit: 100 });
      setReports(data.map((report) => normalizeReportMedia(report)));
      setError(null);
    } catch (err: unknown) {
      const message = (err as Error)?.message ?? "Khong the tai lich su phan anh";
      setError(message);
      Alert.alert("Loi", message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  return (
    <View style={styles.container}>
      <Header
        title="Lich su phan anh"
        subtitle="Tat ca phan anh ban da gui, kem anh, trang thai va thoi gian"
      />

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {reports.length > 0 ? (
            reports.map((report) => <CitizenReportCard key={report.id} report={report} />)
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Ban chua gui phan anh nao</Text>
              <Text style={styles.emptyText}>
                Khi gui phan anh moi, danh sach lich su se hien day du tai day.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loader: {
    marginTop: 24,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  error: {
    color: colors.danger,
    textAlign: "center",
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: "white",
    borderRadius: 22,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  emptyText: {
    marginTop: 8,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
