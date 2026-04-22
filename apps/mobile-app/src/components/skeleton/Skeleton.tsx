import React, { useEffect, useMemo } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type SkeletonSize = number | `${number}%`;

type SkeletonProps = {
  width?: SkeletonSize;
  height?: SkeletonSize;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

type SkeletonScreenProps = {
  loading: boolean;
  template: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

type QueryLike<TData = unknown> = {
  data?: TData;
  isLoading?: boolean;
  isFetching?: boolean;
  isRefetching?: boolean;
};

const baseColor = "#e5e7eb";
const pulseColor = "#f3f4f6";

export function Skeleton({ width = "100%", height = 16, radius = 8, style }: SkeletonProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 900,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.76 + progress.value * 0.22,
    backgroundColor: interpolateColor(progress.value, [0, 1], [baseColor, pulseColor]),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius: radius,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function SkeletonInline({ width = 72, height = 16, radius = 8, style }: SkeletonProps) {
  return <Skeleton width={width} height={height} radius={radius} style={style} />;
}

export function SkeletonListItem() {
  return (
    <View style={styles.listItem}>
      <Skeleton width={48} height={48} radius={24} />
      <View style={styles.listItemText}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="48%" height={12} />
      </View>
    </View>
  );
}

export function SkeletonCard({ withMedia = true }: { withMedia?: boolean }) {
  return (
    <View style={styles.card}>
      {withMedia ? <Skeleton height={150} radius={12} style={styles.cardMedia} /> : null}
      <Skeleton width="62%" height={18} />
      <Skeleton width="92%" height={13} style={styles.lineGap} />
      <Skeleton width="74%" height={13} style={styles.lineGap} />
    </View>
  );
}

export function SkeletonProfile() {
  return (
    <View style={styles.profile}>
      <Skeleton width={92} height={92} radius={46} />
      <Skeleton width="46%" height={20} style={styles.profileLine} />
      <Skeleton width="64%" height={14} style={styles.lineGap} />
      <View style={styles.profileStats}>
        <Skeleton width="30%" height={54} radius={14} />
        <Skeleton width="30%" height={54} radius={14} />
        <Skeleton width="30%" height={54} radius={14} />
      </View>
    </View>
  );
}

export function SkeletonMessageBubble({ own = false }: { own?: boolean }) {
  return (
    <View style={[styles.messageRow, own ? styles.messageRowOwn : null]}>
      {!own ? <Skeleton width={32} height={32} radius={16} /> : null}
      <View style={[styles.messageBubble, own ? styles.messageBubbleOwn : null]}>
        <Skeleton width={160} height={14} />
        <Skeleton width={112} height={12} style={styles.lineGap} />
      </View>
    </View>
  );
}

export function SkeletonDetail() {
  return (
    <View style={styles.detail}>
      <Skeleton width="52%" height={26} />
      <Skeleton width="34%" height={14} style={styles.detailSubline} />
      <SkeletonCard />
      <SkeletonCard withMedia={false} />
    </View>
  );
}

export function SkeletonScreen({ loading, template, children, style }: SkeletonScreenProps) {
  if (loading) {
    return <View style={style}>{template}</View>;
  }

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={style}>
      {children}
    </Animated.View>
  );
}

export function useSkeletonQuery<TData>(query: QueryLike<TData>) {
  return useMemo(() => {
    const data = query.data;
    const hasData = Array.isArray(data) ? data.length > 0 : data != null;
    const isFirstLoad = Boolean(query.isLoading && !hasData);
    const isRefreshing = Boolean((query.isRefetching || query.isFetching) && !isFirstLoad);

    return {
      isFirstLoad,
      isRefreshing,
      showSkeleton: isFirstLoad,
    };
  }, [query.data, query.isFetching, query.isLoading, query.isRefetching]);
}

export function ListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.listSkeleton}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonListItem key={index} />
      ))}
    </View>
  );
}

export function CardListSkeleton({ count = 3, withMedia = true }: { count?: number; withMedia?: boolean }) {
  return (
    <View style={styles.listSkeleton}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} withMedia={withMedia} />
      ))}
    </View>
  );
}

export function MessageListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View style={styles.messageSkeleton}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonMessageBubble key={index} own={index % 3 === 1} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    overflow: "hidden",
  },
  listSkeleton: {
    gap: 12,
    padding: 16,
  },
  listItem: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 12,
  },
  listItemText: {
    flex: 1,
    gap: 10,
    marginLeft: 12,
  },
  card: {
    gap: 10,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 14,
    borderWidth: 1,
    borderColor: "#edf2f7",
  },
  cardMedia: {
    marginBottom: 2,
  },
  lineGap: {
    marginTop: 2,
  },
  profile: {
    alignItems: "center",
    borderRadius: 22,
    backgroundColor: "#ffffff",
    padding: 20,
  },
  profileLine: {
    marginTop: 14,
  },
  profileStats: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  messageSkeleton: {
    gap: 10,
    padding: 16,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  messageRowOwn: {
    justifyContent: "flex-end",
  },
  messageBubble: {
    maxWidth: "76%",
    gap: 8,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    backgroundColor: "#ffffff",
    padding: 12,
  },
  messageBubbleOwn: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 6,
  },
  detail: {
    gap: 14,
    padding: 16,
  },
  detailSubline: {
    marginBottom: 4,
  },
});
