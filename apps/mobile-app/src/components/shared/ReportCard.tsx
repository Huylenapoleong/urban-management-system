import colors from "@/constants/colors";
import { convertToS3Url } from "@/constants/s3";
import {
  getResolvedLocationLabel,
  useResolvedLocations,
} from "@/hooks/shared/useResolvedLocations";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ReportItem } from "@urban/shared-types";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Chip, Text } from "react-native-paper";

interface ReportCardProps {
  report: ReportItem;
  onPress?: (id: string) => void;
}

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  NEW: { bg: "#ffcdd2", text: "#d32f2f", label: "MOI" },
  IN_PROGRESS: { bg: "#ffe0b2", text: "#f57c00", label: "XU LY" },
  RESOLVED: { bg: "#c8e6c9", text: "#388e3c", label: "XONG" },
  REJECTED: { bg: "#e0e0e0", text: "#616161", label: "TU CHOI" },
};

function ReportCardComponent({ report, onPress }: ReportCardProps) {
  const statusConfig = STATUS_CONFIG[report.status] || {
    bg: "#f5f5f5",
    text: "#666",
    label: report.status,
  };
  const coverImageUrl = report.mediaUrls?.[0]
    ? convertToS3Url(report.mediaUrls[0])
    : null;
  const { data: locationMap } = useResolvedLocations([report.locationCode]);
  const locationLabel = getResolvedLocationLabel(
    locationMap,
    report.locationCode,
    "Khu vuc chung",
  );

  return (
    <Card
      style={styles.card}
      onPress={() => onPress?.(report.id)}
      mode="elevated"
      elevation={1}
    >
      {coverImageUrl ? (
        <Image
          source={{ uri: coverImageUrl }}
          style={styles.coverImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          placeholder={{ blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" }}
          transition={160}
        />
      ) : null}
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.title} numberOfLines={1}>
            {report.title}
          </Text>
          <Chip
            textStyle={styles.statusText}
            style={[
              styles.statusChip,
              {
                backgroundColor: statusConfig.bg,
              },
            ]}
            compact
          >
            {statusConfig.label}
          </Chip>
        </View>

        <View style={styles.row}>
          <MaterialCommunityIcons
            name="map-marker-radius"
            size={16}
            color="#607d8b"
          />
          <Text variant="bodySmall" style={styles.address} numberOfLines={1}>
            {locationLabel}
          </Text>
        </View>

        <Text variant="bodyMedium" style={styles.description} numberOfLines={2}>
          {report.description}
        </Text>

        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={14}
              color="#90a4ae"
            />
            <Text variant="labelSmall" style={styles.date}>
              {new Date(report.createdAt).toLocaleDateString("vi-VN")}
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color="#b0bec5"
          />
        </View>
      </Card.Content>
    </Card>
  );
}

export const ReportCard = React.memo(ReportCardComponent);

const styles = StyleSheet.create({
  card: {
    marginVertical: 6,
    marginHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  coverImage: {
    height: 156,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    flex: 1,
    marginRight: 12,
    fontWeight: "700",
    color: colors.text,
    fontSize: 16,
  },
  statusChip: {
    height: 26,
    borderRadius: 12,
    borderWidth: 0,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  address: {
    marginLeft: 4,
    color: "#607d8b",
    fontWeight: "600",
    fontSize: 13,
  },
  description: {
    marginBottom: 16,
    color: "#546e7a",
    lineHeight: 18,
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: "#eceff1",
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  date: {
    color: "#9e9e9e",
    fontWeight: "500",
  },
});
