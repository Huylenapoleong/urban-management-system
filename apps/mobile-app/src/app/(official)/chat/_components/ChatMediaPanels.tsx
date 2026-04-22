import React from 'react';
import { Modal as NativeModal, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { IconButton, Text } from 'react-native-paper';
import { SkeletonInline } from '@/components/skeleton/Skeleton';

type ChatMediaPanelsProps = {
  styles: any;
  colors: any;
  fullscreenMedia: { uri: string; type: 'image' | 'video' } | null;
  onCloseFullscreen: () => void;
  onSaveFullscreenMedia: () => Promise<void> | void;
  downloadingMedia: boolean;
};

const LazyVideo = React.lazy(async () => {
  const module = await import('expo-av');
  return { default: module.Video as React.ComponentType<any> };
});

export function ChatMediaPanels({
  styles,
  colors,
  fullscreenMedia,
  onCloseFullscreen,
  onSaveFullscreenMedia,
  downloadingMedia,
}: ChatMediaPanelsProps) {
  return (
    <NativeModal
      visible={Boolean(fullscreenMedia)}
      transparent
      animationType="fade"
      onRequestClose={onCloseFullscreen}
    >
      <View style={styles.fullscreenOverlay}>
        <TouchableOpacity style={styles.fullscreenCloseButton} onPress={onCloseFullscreen}>
          <IconButton icon="close" iconColor={colors.textOnPrimary} size={26} />
        </TouchableOpacity>

        {fullscreenMedia?.type === 'image' ? (
          <Image
            source={{ uri: fullscreenMedia.uri }}
            style={styles.fullscreenMedia}
            contentFit="contain"
            cachePolicy="memory-disk"
            placeholder={{ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }}
            transition={160}
          />
        ) : null}

        {fullscreenMedia?.type === 'video' ? (
          <React.Suspense fallback={<View style={styles.fullscreenMedia} />}>
            <LazyVideo
              source={{ uri: fullscreenMedia.uri }}
              style={styles.fullscreenMedia}
              useNativeControls
              resizeMode="contain"
              shouldPlay
              isLooping={false}
            />
          </React.Suspense>
        ) : null}

        {fullscreenMedia?.uri ? (
          <TouchableOpacity
            style={styles.fullscreenShareButton}
            onPress={() => void onSaveFullscreenMedia()}
            disabled={downloadingMedia}
          >
            {downloadingMedia ? (
              <SkeletonInline width={42} height={12} />
            ) : (
              <Text style={{ color: colors.textOnPrimary, fontWeight: '700' }}>Luu</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </NativeModal>
  );
}
