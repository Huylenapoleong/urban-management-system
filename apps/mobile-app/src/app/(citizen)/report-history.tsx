import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ReportItem } from "@urban/shared-types";
import Header from "@/components/Header";
import CitizenReportCard from "@/components/shared/CitizenReportCard";
import colors from "@/constants/colors";
import { listReports } from "@/services/api/report.api";

export default function ReportHistoryPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);

    try {
      const data = await listReports({ mine: true, limit: 100 });
      setReports(data);
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
