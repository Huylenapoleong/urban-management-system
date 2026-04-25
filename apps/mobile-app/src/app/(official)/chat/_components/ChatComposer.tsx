import React from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Avatar, IconButton, Text, TextInput } from 'react-native-paper';

type ChatComposerProps = {
  styles: any;
  colors: any;
  text: string;
  setText: (value: string) => void;
  sendTyping: (isTyping: boolean) => void;
  isGroup: boolean;
  mentionQuery: string | null;
  setMentionQuery: (value: string | null) => void;
  groupMembers: any[];
  knownUsers: Record<string, string>;
  currentUserId: string;
  replyToMessage: any;
  onClearReply: () => void;
  parseMessageContent: (raw: string) => string;
  isNearBottomRef: React.MutableRefObject<boolean>;
  flatListRef: React.RefObject<any>;
  showMediaMenu: boolean;
  onToggleMediaMenu: () => void;
  onTakePhoto: () => void;
  onPickImage: () => void;
  onSend: () => void;
  onQuickLike: () => void;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPickDocument: () => void;
  onSendLocation: () => void;
  onTakeVideo: () => void;
  onPickVideo: () => void;
};

export function ChatComposer({
  styles,
  colors,
  text,
  setText,
  sendTyping,
  isGroup,
  mentionQuery,
  setMentionQuery,
  groupMembers,
  knownUsers,
  currentUserId,
  replyToMessage,
  onClearReply,
  parseMessageContent,
  isNearBottomRef,
  flatListRef,
  showMediaMenu,
  onToggleMediaMenu,
  onTakePhoto,
  onPickImage,
  onSend,
  onQuickLike,
  isRecording,
  onStartRecording,
  onStopRecording,
  onPickDocument,
  onSendLocation,
  onTakeVideo,
  onPickVideo,
}: ChatComposerProps) {
  return (
    <>
      {mentionQuery !== null && isGroup && (
        <View style={styles.mentionListContainer}>
          <ScrollView keyboardShouldPersistTaps="always" horizontal showsHorizontalScrollIndicator={false}>
            {groupMembers
              .filter((member) => {
                const name = knownUsers[member.userId] || member.userId;
                return name.toLowerCase().includes(mentionQuery) || String(member.userId) === currentUserId;
              })
              .map((member) => {
                const name = knownUsers[member.userId] || `User ${member.userId.substring(0, 4)}`;
                if (String(member.userId) === currentUserId) return null;

                return (
                  <TouchableOpacity
                    key={member.userId}
                    style={styles.mentionItem}
                    onPress={() => {
                      const words = text.split(' ');
                      words.pop();
                      const newText = [...words, `@${name} `].join(' ');
                      setText(newText.trimStart());
                      setMentionQuery(null);
                    }}
                  >
                    <Avatar.Text size={24} label={name.substring(0, 2).toUpperCase()} style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 13 }}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
        </View>
      )}

      {replyToMessage && (
        <View style={styles.replyPreviewBox}>
          <View style={{ flex: 1 }}>
            <Text variant="labelSmall" style={{ color: colors.primary, fontWeight: '700' }}>
              Dang tra loi {replyToMessage.senderName || 'tin nhan'}
            </Text>
            <Text variant="bodySmall" numberOfLines={1} style={{ color: colors.mutedOnSurface }}>
              {parseMessageContent(replyToMessage.content) || 'Tin nhan dinh kem'}
            </Text>
          </View>
          <IconButton icon="close" size={18} onPress={onClearReply} />
        </View>
      )}

      <View style={styles.inputArea}>
        <IconButton icon="plus-circle" iconColor={colors.primary} size={26} onPress={onToggleMediaMenu} />
        <IconButton icon="camera" iconColor={colors.primary} size={26} onPress={onTakePhoto} />
        <IconButton icon="image" iconColor={colors.primary} size={26} onPress={onPickImage} />
        <TextInput
          style={styles.input}
          placeholder="Nhap tin nhan..."
          placeholderTextColor={colors.mutedOnSurface}
          value={text}
          onFocus={() => {
            if (!isNearBottomRef.current) {
              return;
            }

            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 70);
          }}
          onChangeText={(value) => {
            setText(value);
            sendTyping(value.length > 0);

            if (isGroup) {
              const words = value.split(' ');
              const lastWord = words[words.length - 1];
              if (lastWord.startsWith('@')) {
                setMentionQuery(lastWord.slice(1).toLowerCase());
              } else {
                setMentionQuery(null);
              }
            }
          }}
          multiline
          dense
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          mode="flat"
          contentStyle={{
            backgroundColor: colors.primarySoft,
            borderRadius: 20,
            paddingHorizontal: 12,
            color: colors.primary,
            minHeight: 42,
          }}
        />
        {text.trim() ? (
          <IconButton icon="send" iconColor={colors.primary} size={26} onPress={onSend} />
        ) : (
          <View style={styles.quickActionWrap}>
            <IconButton icon="thumb-up" iconColor={colors.primary} size={24} onPress={onQuickLike} />
            <IconButton
              icon={isRecording ? 'stop-circle' : 'microphone'}
              iconColor={colors.primary}
              size={24}
              onPressIn={onStartRecording}
              onPressOut={onStopRecording}
            />
          </View>
        )}
      </View>

      {showMediaMenu && (
        <View style={[styles.mediaMenu, { backgroundColor: colors.surface }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaMenuContent}>
            <View style={styles.menuItem}>
              <IconButton
                icon="file-document"
                mode="contained"
                containerColor={colors.primary}
                iconColor={colors.textOnPrimary}
                onPress={onPickDocument}
              />
              <Text variant="labelSmall" style={styles.mediaMenuLabel}>Tai lieu</Text>
            </View>
            <View style={styles.menuItem}>
              <IconButton
                icon="map-marker"
                mode="contained"
                containerColor={colors.primary}
                iconColor={colors.textOnPrimary}
                onPress={onSendLocation}
              />
              <Text variant="labelSmall" style={styles.mediaMenuLabel}>Vi tri</Text>
            </View>
            <View style={styles.menuItem}>
              <IconButton
                icon="video-outline"
                mode="contained"
                containerColor={colors.primary}
                iconColor={colors.textOnPrimary}
                onPress={onTakeVideo}
              />
              <Text variant="labelSmall" style={styles.mediaMenuLabel}>Quay video</Text>
            </View>
            <View style={styles.menuItem}>
              <IconButton
                icon="filmstrip"
                mode="contained"
                containerColor={colors.primary}
                iconColor={colors.textOnPrimary}
                onPress={onPickVideo}
              />
              <Text variant="labelSmall" style={styles.mediaMenuLabel}>Video thu vien</Text>
            </View>
          </ScrollView>
        </View>
      )}
    </>
  );
}

export default ChatComposer;
