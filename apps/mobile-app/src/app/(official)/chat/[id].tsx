import React, { useState, useRef, useEffect } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { Text, TextInput, IconButton, useTheme, Appbar, ActivityIndicator, Avatar } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useChatConversation } from '../../../hooks/shared/useChatConversation';
import { useAuth } from '../../../providers/AuthProvider';

/** Citizen app gửi content dưới dạng JSON: {text: string, mention: []}.
 *  Official app gửi plain string. Hàm này normalize về string. */
const parseMessageContent = (raw: string): string => {
  if (!raw) return '';
  if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.text === 'string') return parsed.text;
      if (typeof parsed?.content === 'string') return parsed.content;
    } catch {}
  }
  return raw;
};

export default function OfficialChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const decodedId = React.useMemo(() => conversationId ? decodeURIComponent(conversationId) : '', [conversationId]);

  const router = useRouter();
  const theme = useTheme();
  const { user: currentUser } = useAuth();
  const [text, setText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const { messages, isLoadingHistory, isReady, sendMessage, sendTyping, typingUsers } = useChatConversation(decodedId);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(text.trim(), Date.now().toString());
    setText('');
    sendTyping(false);
  };

  const activeTypers = Object.values(typingUsers).filter(u => u.isTyping).map(u => u.fullName).join(', ');

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = currentUser?.sub === item.senderId;

    return (
      <View style={[styles.messageWrapper, isMe ? styles.messageWrapperRight : styles.messageWrapperLeft]}>
        {!isMe && (
          <Avatar.Text
            size={32}
            label={item.senderName?.substring(0, 2).toUpperCase() || 'U'}
            style={styles.avatar}
          />
        )}
        <View style={[
          styles.messageBubble,
          { backgroundColor: isMe ? theme.colors.primary : theme.colors.surfaceVariant }
        ]}>
          {!isMe && (
            <Text variant="labelSmall" style={{ color: theme.colors.primary, marginBottom: 2 }}>
              {item.senderName}
            </Text>
          )}
          <Text style={{ color: isMe ? theme.colors.onPrimary : theme.colors.onSurfaceVariant }}>
            {parseMessageContent(item.content)}
          </Text>
          <Text variant="labelSmall" style={[styles.timeText, { color: isMe ? 'rgba(255,255,255,0.7)' : theme.colors.onSurfaceDisabled }]}>
            {new Date(item.sentAt || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.push('/(official)/chat')} />
        <Appbar.Content
          title="Phòng Trao Đổi"
          subtitle={isReady ? 'Đã kết nối' : 'Đang kết nối...'}
        />
      </Appbar.Header>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Connection banner */}
        {!isReady && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" style={{ marginRight: 8 }} />
            <Text>Đang kết nối vào phòng chat...</Text>
          </View>
        )}

        {/* Message list */}
        {isLoadingHistory ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={{ marginTop: 8, color: '#888' }}>Đang tải tin nhắn...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={[styles.listContent, messages.length === 0 && styles.emptyList]}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text variant="bodyMedium" style={{ color: '#aaa', textAlign: 'center' }}>
                  Chưa có tin nhắn nào.{'\n'}Hãy bắt đầu cuộc trò chuyện!
                </Text>
              </View>
            }
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {activeTypers.length > 0 && (
          <Text style={styles.typingIndicator} variant="labelMedium">
            {activeTypers} đang soạn tin...
          </Text>
        )}

        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            mode="outlined"
            placeholder="Nhập phản hồi..."
            value={text}
            onChangeText={(val) => {
              setText(val);
              sendTyping(val.length > 0);
            }}
            multiline
            dense
          />
          <IconButton
            icon="send"
            mode="contained"
            containerColor={theme.colors.primary}
            iconColor={theme.colors.onPrimary}
            size={24}
            onPress={handleSend}
            disabled={!isReady || !text.trim()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingBanner: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff3e0',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  listContent: { padding: 16, flexGrow: 1 },
  emptyList: { flex: 1, justifyContent: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  messageWrapper: { flexDirection: 'row', marginBottom: 16, maxWidth: '85%' },
  messageWrapperLeft: { alignSelf: 'flex-start' },
  messageWrapperRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatar: { marginRight: 8, marginTop: 4 },
  messageBubble: { padding: 12, borderRadius: 16, minWidth: 80, maxWidth: '100%' },
  timeText: { alignSelf: 'flex-end', marginTop: 4, fontSize: 10 },
  typingIndicator: { paddingHorizontal: 16, fontStyle: 'italic', color: '#666', marginBottom: 4 },
  inputArea: {
    flexDirection: 'row',
    padding: 8,
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  input: { flex: 1, marginRight: 8, maxHeight: 100 },
});
