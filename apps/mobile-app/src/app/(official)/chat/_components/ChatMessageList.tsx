import React from 'react';
import { FlatList, ScrollView, TouchableOpacity, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { MessageListSkeleton, SkeletonMessageBubble } from '@/components/skeleton/Skeleton';

type ChatMessageListProps = {
  styles: any;
  colors: any;
  isLoadingHistory: boolean;
  flatListRef: React.RefObject<FlatList>;
  visibleMessages: any[];
  renderMessage: ({ item }: { item: any }) => React.ReactElement;
  keyboardHeight: number;
  hasOlderMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  loadOlderMessages?: () => Promise<void> | void;
  updateNearBottom: (nativeEvent: any) => void;
  activeTypers: string;
  pinnedMessages: any[];
  onJumpToMessage: (messageId: string) => void;
  parseMessageContent: (raw: string) => string;
  shouldRemoveClippedSubviews: boolean;
};

export function ChatMessageList({
  styles,
  colors,
  isLoadingHistory,
  flatListRef,
  visibleMessages,
  renderMessage,
  keyboardHeight,
  hasOlderMessages,
  isLoadingOlderMessages,
  loadOlderMessages,
  updateNearBottom,
  activeTypers,
  pinnedMessages,
  onJumpToMessage,
  parseMessageContent,
  shouldRemoveClippedSubviews,
}: ChatMessageListProps) {
  return (
    <>
      {pinnedMessages.length > 0 && (
        <View style={styles.pinnedBanner}>
          <IconButton icon="pin" size={16} iconColor={colors.primary} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            {pinnedMessages.map((message, index) => (
              <TouchableOpacity key={message.id} style={styles.pinnedItem} onPress={() => onJumpToMessage(message.id)}>
                <Text variant="labelSmall" numberOfLines={1} style={styles.pinnedMessageText}>
                  {parseMessageContent(message.content)}
                </Text>
                {index < pinnedMessages.length - 1 && (
                  <Text style={{ marginHorizontal: 8, color: colors.divider }}>|</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {isLoadingHistory ? (
        <MessageListSkeleton count={8} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={visibleMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
          }}
          removeClippedSubviews={shouldRemoveClippedSubviews}
          initialNumToRender={18}
          maxToRenderPerBatch={16}
          windowSize={9}
          contentContainerStyle={[
            styles.listContent,
            keyboardHeight > 0
              ? { paddingBottom: 32 + Math.max(0, keyboardHeight - 24) }
              : null,
          ]}
          onScroll={({ nativeEvent }) => {
            updateNearBottom(nativeEvent);
            if (
              nativeEvent.contentOffset.y <= 40 &&
              hasOlderMessages &&
              !isLoadingOlderMessages &&
              loadOlderMessages
            ) {
              void loadOlderMessages();
            }
          }}
          scrollEventThrottle={16}
          ListHeaderComponent={
            isLoadingOlderMessages ? (
              <View style={styles.loadOlderWrap}>
                <SkeletonMessageBubble />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text variant="bodyMedium" style={{ color: colors.mutedOnSurface, textAlign: 'center' }}>
                Chua co tin nhan nao.{"\n"}Hay bat dau cuoc tro chuyen!
              </Text>
            </View>
          }
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              const safeLength = Math.max(visibleMessages.length - 1, 0);
              flatListRef.current?.scrollToIndex({
                index: Math.max(0, Math.min(index, safeLength)),
                animated: true,
                viewPosition: 0.5,
              });
            }, 250);
          }}
        />
      )}

      {activeTypers.length > 0 && (
        <Text style={styles.typingIndicator} variant="labelMedium">
          {activeTypers} dang soan tin...
        </Text>
      )}
    </>
  );
}
