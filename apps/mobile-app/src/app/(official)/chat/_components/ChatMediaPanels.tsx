import React from 'react';
import { Image, Modal as NativeModal, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, IconButton, Text } from 'react-native-paper';
import { ResizeMode, Video } from 'expo-av';

type ChatMediaPanelsProps = {
  styles: any;
  colors: any;
  fullscreenMedia: { uri: string; type: 'image' | 'video' } | null;
  onCloseFullscreen: () => void;
  onSaveFullscreenMedia: () => Promise<void> | void;
  downloadingMedia: boolean;
};

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
          <Image source={{ uri: fullscreenMedia.uri }} style={styles.fullscreenMedia} resizeMode="contain" />
        ) : null}

        {fullscreenMedia?.type === 'video' ? (
          <Video
            source={{ uri: fullscreenMedia.uri }}
            style={styles.fullscreenMedia}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping={false}
          />
        ) : null}

        {fullscreenMedia?.uri ? (
          <TouchableOpacity
            style={styles.fullscreenShareButton}
            onPress={() => void onSaveFullscreenMedia()}
            disabled={downloadingMedia}
          >
            {downloadingMedia ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Text style={{ color: colors.textOnPrimary, fontWeight: '700' }}>Luu</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </NativeModal>
  );
}
