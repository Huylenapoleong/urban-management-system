import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Header from "@/components/Header";
import Button from "@/components/Button";
import { REPORT_CATEGORIES, REPORT_PRIORITIES } from "@urban/shared-constants";
import type { ReportItem } from "@urban/shared-types";
import colors from "@/constants/colors";
import { useAuth } from "@/services/auth-context";
import { createReport, listReports } from "@/services/api/report.api";
import {parseLocationCode} from "@urban/shared-utils";


type LocationOption = {
  key: string;
  label: string;
  value: string;
};

export default function ReportPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState<(typeof REPORT_CATEGORIES)[number]>(REPORT_CATEGORIES[0]);
  const [priority, setPriority] = useState<(typeof REPORT_PRIORITIES)[number]>(REPORT_PRIORITIES[1]);
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("Khung upload anh (mock)");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const locationSegments = useMemo(() => {
    if (!user?.locationCode) {
      return null;
    }

    try {
      return parseLocationCode(user.locationCode);
    } catch {
      return null;
    }
  }, [user?.locationCode]);

  const locationOptions = useMemo<LocationOption[]>(() => {
    if (!locationSegments) {
      return [];
    }

    return [
      { key: "country", label: "Quoc gia", value: locationSegments.country },
      { key: "province", label: "Tinh/Thanh", value: locationSegments.province },
      { key: "district", label: "Quan/Huyen", value: locationSegments.district },
      { key: "ward", label: "Phuong/Xa", value: locationSegments.ward },
    ];
  }, [locationSegments]);

  useEffect(() => {
    let active = true;

    const fetch = async () => {
      setLoading(true);
      try {
        const data = await listReports();
        if (active) {
          setReports(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (active) {
          setError((err as Error)?.message ?? "Khong the tai bao cao");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void fetch();

    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    if (!user?.locationCode) {
      setError("Khong xac dinh duoc khu vuc cua ban");
      return;
    }

    setLoading(true);
    try {
      const createdReport = await createReport({
        title: description.slice(0, 30) || "Phan anh moi",
        description,
        category,
        priority,
        locationCode: user.locationCode,
        mediaUrls: [],
      });

      setIsSubmitted(true);
      setDescription("");
      setReports((prev) => [createdReport, ...prev]);
      setError(null);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Khong the gui phan anh");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header title="Gui phan anh" subtitle="Gui dung khu vuc da dang ky cua ban" />

      <View style={styles.locationCard}>
        <Text style={styles.cardTitle}>Vi tri phan anh</Text>
        <Text style={styles.cardHint}>
          Tai khoan cong dan chi duoc tao phan anh trong dung dia ban da dang ky.
        </Text>
        <View style={styles.locationGrid}>
          {locationOptions.map((item) => (
            <View key={item.key} style={styles.locationChip}>
              <Text style={styles.locationChipLabel}>{item.label}</Text>
              <Text style={styles.locationChipValue}>{item.value}</Text>
            </View>
          ))}
        </View>
        {user?.locationCode ? (
          <Text style={styles.helperText}>{`Location code: ${user.locationCode}`}</Text>
        ) : (
          <Text style={styles.error}>Khong tai duoc locationCode cua tai khoan.</Text>
        )}
      </View>

      <Text style={styles.label}>Danh muc</Text>
      <View style={styles.selectorRow}>
        {REPORT_CATEGORIES.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.tag, item === category && styles.tagActive]}
            onPress={() => setCategory(item)}
          >
            <Text style={[styles.tagText, item === category && styles.tagTextActive]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Do uu tien</Text>
      <View style={styles.selectorRow}>
        {REPORT_PRIORITIES.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.tag, item === priority && styles.tagActive]}
            onPress={() => setPriority(item)}
          >
            <Text style={[styles.tagText, item === priority && styles.tagTextActive]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Mo ta noi dung</Text>
      <TextInput
        style={styles.textarea}
        value={description}
        onChangeText={setDescription}
        placeholder="Mo ta ro su co, thoi gian, dau moc de can bo de xu ly"
        multiline
        numberOfLines={5}
      />

      <Text style={styles.label}>Hinh anh dinh kem</Text>
      <TouchableOpacity style={styles.uploadCard} onPress={() => setImage("Anh da chon")}>
        <Text style={styles.uploadText}>{image}</Text>
        <Text style={styles.uploadHint}>Tam thoi dang la giao dien mock cho citizen.</Text>
      </TouchableOpacity>

      <Button onPress={submit} disabled={!description.trim() || !user?.locationCode}>
        Gui phan anh
      </Button>

      {isSubmitted ? <Text style={styles.success}>Da gui phan anh</Text> : null}
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        reports.map((report) => (
          <View key={report.id} style={styles.reportItem}>
            <Text style={styles.reportTitle}>{report.title}</Text>
            <Text style={styles.reportMeta}>{`${report.category} • ${report.priority}`}</Text>
            <Text style={styles.reportLocation}>{report.locationCode}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 14, paddingBottom: 30 },
  locationCard: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
    marginBottom: 8,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  cardHint: { marginTop: 6, color: colors.textSecondary, lineHeight: 20, fontSize: 13 },
  locationGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  locationChip: {
    minWidth: "47%",
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  locationChipLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 4 },
  locationChipValue: { color: colors.text, fontSize: 14, fontWeight: "600" },
  label: {
    marginTop: 14,
    marginBottom: 6,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  selectorRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "white",
  },
  tagActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tagText: { color: colors.text, fontWeight: "600", fontSize: 13 },
  tagTextActive: { color: "white" },
  textarea: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    textAlignVertical: "top",
    minHeight: 132,
  },
  uploadCard: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  uploadText: { color: colors.text, fontWeight: "600" },
  uploadHint: { color: colors.textSecondary, marginTop: 4, fontSize: 12 },
  helperText: { marginTop: 12, color: colors.textSecondary, fontSize: 12 },
  success: { color: colors.success, marginTop: 10, fontWeight: "600" },
  error: { color: colors.danger, marginTop: 10, textAlign: "center" },
  loader: { marginTop: 8 },
  reportItem: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportTitle: { fontWeight: "700", color: colors.text },
  reportMeta: { marginTop: 4, color: colors.textSecondary, fontSize: 12 },
  reportLocation: { marginTop: 6, color: colors.muted, fontSize: 12 },
});
