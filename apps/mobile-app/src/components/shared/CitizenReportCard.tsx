import { memo, useState, useEffect } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import type { ReportItem } from "@urban/shared-types";
import colors from "@/constants/colors";
import { convertToS3Url } from "@/constants/s3";
import {
  formatReportDateTime,
  getReportProcessingColor,
  getReportProcessingLabel,
  REPORT_STATUS_LABELS,
} from "@/features/reports/report-utils";

type CitizenReportCardProps = {
  report: ReportItem;
};

function CitizenReportCard({ report }: CitizenReportCardProps) {
  const primaryImage = report.mediaUrls?.[0];
  const processingColor = getReportProcessingColor(report.status);
  const [imageError, setImageError] = useState(false);

  // Convert old cdn.example.com URLs to correct S3 URLs for backward compatibility
  const correctedImageUrl = primaryImage ? convertToS3Url(primaryImage) : null;

  // Debug logging
  useEffect(() => {
    if (primaryImage) {
      console.log('Original URL:', primaryImage);
      console.log('Corrected URL:', correctedImageUrl);
    }
  }, [primaryImage, correctedImageUrl]);

  // Reset error khi URL thay đổi
  useEffect(() => {
    setImageError(false);
  }, [correctedImageUrl]);

  return (
    <View style={styles.card}>
      {correctedImageUrl && !imageError ? (
        <Image
          source={{ uri: correctedImageUrl }} 
          style={styles.image} 
          contentFit="cover"
          cachePolicy="memory-disk"
          placeholder={{ blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" }}
          transition={180}
          onError={(error) => {
            console.log('Image load error:', correctedImageUrl, error);
            setImageError(true);
          }}
          onLoad={() => console.log('Image loaded successfully:', correctedImageUrl)}
        />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="image-outline" size={24} color={colors.textSecondary} />
          <Text style={styles.placeholderText}>
            {correctedImageUrl ? "Khong the tai anh" : "Khong co anh dinh kem"}
          </Text>
          {correctedImageUrl && (
            <Pressable 
              style={styles.retryButton}
              onPress={() => setImageError(false)}
            >
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={styles.retryText}>Thu lai</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={[styles.processingPill, { backgroundColor: `${processingColor}14` }]}>
            <View style={[styles.processingDot, { backgroundColor: processingColor }]} />
            <Text style={[styles.processingText, { color: processingColor }]}>
              {getReportProcessingLabel(report.status)}
            </Text>
          </View>
          <Text style={styles.rawStatus}>{REPORT_STATUS_LABELS[report.status] || report.status}</Text>
        </View>

        <Text style={styles.title}>{report.title}</Text>
        {report.description ? (
          <Text style={styles.description}>{report.description}</Text>
        ) : null}

        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.metaText}>{formatReportDateTime(report.createdAt)}</Text>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="pricetag-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.metaText}>{`${report.category} | ${report.priority}`}</Text>
        </View>
      </View>
    </View>
  );
}

export default memo(CitizenReportCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: "white",
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 5,
    marginBottom: 14,
  },
  image: {
    width: "100%",
    height: 184,
    backgroundColor: "#e2e8f0",
  },
  placeholder: {
    width: "100%",
    height: 140,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  content: {
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  processingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  processingDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  processingText: {
    fontSize: 12,
    fontWeight: "800",
  },
  rawStatus: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
  },
  description: {
    marginTop: 8,
    color: colors.textSecondary,
    lineHeight: 21,
    fontSize: 14,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary + "20",
    borderRadius: 16,
  },
  retryText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
});
