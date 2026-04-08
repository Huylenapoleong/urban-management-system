import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, TouchableOpacity, Image, ScrollView, Alert, useWindowDimensions, Share, Modal as NativeModal } from 'react-native';
import { Text, TextInput, IconButton, useTheme, Appbar, ActivityIndicator, Avatar, Divider, Menu, Portal, Modal, Button } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio, ResizeMode, Video } from 'expo-av';
import { useChatConversation } from '../../../hooks/shared/useChatConversation';
import { useAuth } from '../../../providers/AuthProvider';
import { useWebRTCContext } from '../../../providers/WebRTCContext';
import { ApiClient } from '../../../lib/api-client';

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
  const decodedId = useMemo(() => {
    if (!conversationId) return '';
    const dec = decodeURIComponent(conversationId);
    return dec.startsWith('dm-') ? `dm:${dec.slice(3)}` : dec;
  }, [conversationId]);

  const router = useRouter();
  const theme = useTheme();
  const { user: currentUser } = useAuth();
  const { startCall } = useWebRTCContext();
  
  const [text, setText] = useState('');
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<any>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<{ uri: string; type: 'image' | 'video' } | null>(null);
  
  const flatListRef = useRef<FlatList>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  // States for @mention functionality
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);

  const { messages, isLoadingHistory, isReady, sendMessage, sendMedia, sendTyping, typingUsers, markRead, deleteMessage, updateMessage } = useChatConversation(decodedId, currentUser);
  const [convInfo, setConvInfo] = useState<any>(null);

  const isGroup = useMemo(() => decodedId?.startsWith('GRP#'), [decodedId]);

  // Build a dictionary of known names from messages and active typers
  const knownUsers = useMemo(() => {
    const map: Record<string, string> = {};
    messages.forEach(m => {
      if (m.senderId && m.senderName) map[m.senderId] = m.senderName;
    });
    Object.entries(typingUsers).forEach(([userId, u]) => {
      if (userId && u.fullName) map[userId] = u.fullName;
    });
    return map;
  }, [messages, typingUsers]);

  // Fetch conversation metadata and group members
  useEffect(() => {
    if (!decodedId) return;
    
    ApiClient.get('/conversations')
      .then((convs) => {
        const found = convs.find((c: any) => c.conversationId === decodedId);
        if (found) setConvInfo(found);
      })
      .catch(console.error);

    if (isGroup) {
      const groupId = decodedId.slice(4);
      ApiClient.get(`/groups/${groupId}/members`)
        .then(res => setGroupMembers(res))
        .catch(console.error);
    }
  }, [decodedId, isGroup]);

  // Auto-mark as read when ready
  useEffect(() => {
    if (isReady) {
      markRead();
    }
  }, [isReady, markRead]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(text.trim(), Date.now().toString(), 'TEXT', undefined, replyToMessage?.id);
    setText('');
    setReplyToMessage(null);
    sendTyping(false);
  };

  const handleStartAudioCall = () => {
    startCall(false, decodedId, decodedId);
  };

  const handleStartVideoCall = () => {
    startCall(true, decodedId, decodedId);
  };

  // ── Media Handlers ────────────────────────────────────────────────────────
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      try {
        await sendMedia(
          asset.uri,
          asset.fileName || 'upload',
          asset.mimeType || 'image/jpeg',
          'IMAGE',
          replyToMessage?.id,
        );
        setReplyToMessage(null);
      } catch (e) {
        Alert.alert('Lỗi', 'Không thể gửi tệp. Vui lòng thử lại.');
      }
    }
    setShowMediaMenu(false);
  };

  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await sendMedia(
        asset.uri,
        'camera-photo.jpg',
        'image/jpeg',
        'IMAGE',
        replyToMessage?.id,
      );
      setReplyToMessage(null);
    }
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      try {
        await sendMedia(
          asset.uri,
          asset.fileName || 'video.mp4',
          asset.mimeType || 'video/mp4',
          'VIDEO',
          replyToMessage?.id,
        );
        setReplyToMessage(null);
      } catch (e) {
        Alert.alert('Lỗi', 'Không thể gửi video. Vui lòng thử lại.');
      }
    }
    setShowMediaMenu(false);
  };

  const takeVideo = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
      videoMaxDuration: 60,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      try {
        await sendMedia(
          asset.uri,
          asset.fileName || 'camera-video.mp4',
          asset.mimeType || 'video/mp4',
          'VIDEO',
          replyToMessage?.id,
        );
        setReplyToMessage(null);
      } catch (e) {
        Alert.alert('Lỗi', 'Không thể quay/gửi video. Vui lòng thử lại.');
      }
    }
    setShowMediaMenu(false);
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await sendMedia(
          asset.uri,
          asset.name,
          asset.mimeType || 'application/octet-stream',
          'DOC',
          replyToMessage?.id,
        );
        setReplyToMessage(null);
      }
    } catch (e) {
      console.warn('DocumentPicker not supported or failed', e);
      Alert.alert('Thông báo', 'Tính năng chọn tệp không khả dụng trên môi trường này.');
    }
    setShowMediaMenu(false);
  };

  const sendLocation = () => {
    (async () => {
      try {
        let latitude: number | undefined;
        let longitude: number | undefined;

        try {
          const Location = await import('expo-location');
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status === 'granted') {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            latitude = location.coords.latitude;
            longitude = location.coords.longitude;
          }
        } catch {
          // Fallback below.
        }

        if (latitude === undefined || longitude === undefined) {
          const geolocation = (globalThis as any)?.navigator?.geolocation;
          if (!geolocation) {
            throw new Error('Thiết bị hiện tại chưa hỗ trợ vị trí.');
          }

          const fallback = await new Promise<any>((resolve, reject) => {
            geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 12000,
              maximumAge: 5000,
            });
          });

          latitude = fallback.coords.latitude;
          longitude = fallback.coords.longitude;
        }

        const mapUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
        sendMessage(
          `Vị trí hiện tại: ${mapUrl}`,
          Date.now().toString(),
          'TEXT',
          undefined,
          replyToMessage?.id,
        );
        setReplyToMessage(null);
        setShowMediaMenu(false);
      } catch (error: any) {
        Alert.alert('Lỗi vị trí', error?.message || 'Không thể lấy vị trí hiện tại.');
      }
    })();
  };

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      if (uri) {
        await sendMedia(uri, 'voice-message.m4a', 'audio/mp4', 'AUDIO', replyToMessage?.id);
        setReplyToMessage(null);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
    recordingRef.current = null;
  };

  const activeTypers = Object.values(typingUsers).filter(u => u.isTyping).map(u => u.fullName).join(', ');

  const renderMessageContent = (item: any) => {
    const isMe = currentUser?.sub === item.senderId;
    
    if (item.deletedAt) {
      return (
        <Text style={{ color: isMe ? 'rgba(100,100,100,0.5)' : '#888', fontStyle: 'italic' }}>
          Tin nhắn đã bị thu hồi
        </Text>
      );
    }

    if (item.type === 'IMAGE') {
      return (
        <TouchableOpacity activeOpacity={0.9} onPress={() => item.attachmentUrl && setFullscreenMedia({ uri: item.attachmentUrl, type: 'image' })}>
          <Image source={{ uri: item.attachmentUrl }} style={styles.mediaImage} resizeMode="cover" />
        </TouchableOpacity>
      );
    }

    if (item.type === 'VIDEO') {
      return (
        <TouchableOpacity style={styles.mediaPlaceholder} activeOpacity={0.85} onPress={() => item.attachmentUrl && setFullscreenMedia({ uri: item.attachmentUrl, type: 'video' })}>
          <IconButton icon="play-circle" iconColor={isMe ? '#fff' : theme.colors.primary} size={40} />
          <Text style={{ color: isMe ? '#fff' : theme.colors.onSurfaceVariant }}>Video - nhấn để xem</Text>
        </TouchableOpacity>
      );
    }

    if (item.type === 'AUDIO') {
      return (
        <View style={styles.audioMessage}>
          <IconButton icon="play" iconColor={isMe ? '#fff' : theme.colors.primary} size={24} />
          <Text style={{ color: isMe ? '#fff' : theme.colors.onSurfaceVariant }}>Tin nhắn thoại</Text>
        </View>
      );
    }

    if (item.type === 'DOC') {
      return (
        <TouchableOpacity style={styles.docMessage}>
          <IconButton icon="file-document" iconColor={isMe ? '#fff' : theme.colors.primary} size={24} />
          <Text style={{ color: isMe ? '#fff' : theme.colors.onSurfaceVariant }} numberOfLines={1}>
            {item.content || 'Tài liệu'}
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <Text style={{ color: isMe ? '#fff' : theme.colors.onSurfaceVariant, fontSize: 16 }}>
        {parseMessageContent(item.content)}
      </Text>
    );
  };

  const MessageBubble = React.memo(({ item }: { item: any }) => {
    const isMe = currentUser?.sub === item.senderId;

    const reactions = useMemo(() => {
      try {
        const parsed = JSON.parse(item.content);
        return parsed.reactions || {};
      } catch {
        return {};
      }
    }, [item.content]);

    return (
      <View style={[styles.messageWrapper, isMe ? styles.messageWrapperRight : styles.messageWrapperLeft]}>
        {!isMe && (
          <Avatar.Text
            size={32}
            label={item.senderName?.substring(0, 2).toUpperCase() || 'U'}
            style={styles.avatar}
          />
        )}
        <View style={{ flex: 1, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
          <TouchableOpacity 
            activeOpacity={0.8}
            onLongPress={() => handleLongPress(item)}
            style={[
              styles.messageBubble,
              { backgroundColor: isMe ? '#0084ff' : '#f0f0f0' },
              isMe ? styles.bubbleRight : styles.bubbleLeft,
              item.isOptimistic && { opacity: 0.6 }
            ]}>
            {!isMe && item.isGroup && (
              <Text variant="labelSmall" style={{ color: theme.colors.primary, marginBottom: 2, fontWeight: 'bold' }}>
                {item.senderName}
              </Text>
            )}
            
            {renderMessageContent(item)}
            
            <View style={styles.bubbleFooter}>
              <Text variant="labelSmall" style={[styles.timeText, { color: isMe ? 'rgba(255,255,255,0.7)' : '#888' }]}>
                {item.isOptimistic ? 'Đang gửi...' : new Date(item.sentAt || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </TouchableOpacity>
          
          {Object.keys(reactions).length > 0 && (
            <View style={[styles.reactionContainer, { alignSelf: isMe ? 'flex-end' : 'flex-start' }]}>
              {Object.entries(reactions).map(([emoji, users]: [string, any]) => (
                users.length > 0 && (
                  <View key={emoji} style={styles.reactionPill}>
                    <Text style={{ fontSize: 10 }}>{emoji} {users.length}</Text>
                  </View>
                )
              ))}
            </View>
          )}
        </View>
      </View>
    );
  });

  const pinnedMessages = useMemo(() => {
    return messages.filter(m => {
      if (m.deletedAt) return false;
      try {
        const parsed = JSON.parse(m.content);
        return parsed.isPinned === true;
      } catch {
        return false;
      }
    }).slice(0, 5);
  }, [messages]);

  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const handleLongPress = (item: any) => {
    if (item.deletedAt) return;
    setSelectedMessage(item);
    setShowMoreMenu(false);
    setMenuVisible(true);
  };

  const handleReply = () => {
    if (!selectedMessage) {
      return;
    }

    setReplyToMessage(selectedMessage);
    setMenuVisible(false);
  };

  const handleCopy = async () => {
    if (selectedMessage) {
      const textToCopy = parseMessageContent(selectedMessage.content);
      // Tạm thời hiển thị Alert thay vì Clipboard để tránh lỗi Native Module
      Alert.alert('Đã sao chép (Tạm thời)', textToCopy);
      setMenuVisible(false);
    }
  };

  const handleRecall = () => {
    if (selectedMessage) {
      deleteMessage(selectedMessage.id);
      setMenuVisible(false);
    }
  };

  const handlePin = () => {
    if (selectedMessage) {
      if (pinnedMessages.length >= 5) {
        Alert.alert('Thông báo', 'Bạn chỉ có thể ghim tối đa 5 tin nhắn.');
        setMenuVisible(false);
        return;
      }
      
      let newContent = selectedMessage.content;
      try {
        const parsed = JSON.parse(selectedMessage.content);
        newContent = JSON.stringify({ ...parsed, isPinned: true });
      } catch {
        newContent = JSON.stringify({ text: selectedMessage.content, isPinned: true });
      }
      
      updateMessage(selectedMessage.id, newContent);
      setMenuVisible(false);
    }
  };

  const handleShare = async (item: any) => {
    try {
      const textToShare = parseMessageContent(item.content);
      await Share.share({
        message: textToShare,
        url: item.attachmentUrl
      });
    } catch (error: any) {
      Alert.alert(error.message);
    }
  };

  const handleReaction = (item: any, emoji: string) => {
    let newContent = item.content;
    try {
      const parsed = JSON.parse(item.content);
      const reactions = parsed.reactions || {};
      const users = reactions[emoji] || [];
      
      if (users.includes(currentUser?.sub)) {
        reactions[emoji] = users.filter((id: string) => id !== currentUser?.sub);
      } else {
        reactions[emoji] = [...users, currentUser?.sub];
      }
      
      newContent = JSON.stringify({ ...parsed, reactions });
    } catch {
      newContent = JSON.stringify({ 
        text: item.content, 
        reactions: { [emoji]: [currentUser?.sub] } 
      });
    }
    updateMessage(item.id, newContent);
  };

  const renderMessage = ({ item }: { item: any }) => (
    <MessageBubble item={item} />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#fff' }]}>
      <Appbar.Header style={{ backgroundColor: '#fff', borderBottomWidth: 0.5, borderColor: '#eee', elevation: 0 }}>
        <Appbar.BackAction onPress={() => router.push('/(official)/chat')} color={theme.colors.primary} />
        <Avatar.Icon size={36} icon="account-group" style={{ backgroundColor: '#f5f5f5' }} />
        <Appbar.Content
          title={convInfo?.groupName || 'Phòng Trao Đổi'}
          titleStyle={{ fontSize: 17, fontWeight: 'bold' }}
          subtitle={isReady ? 'Đang hoạt động' : 'Đang kết nối...'}
          subtitleStyle={{ fontSize: 11, color: isReady ? '#4cd964' : '#888' }}
        />
        <Appbar.Action icon="phone" onPress={handleStartAudioCall} disabled={!isReady} color={theme.colors.primary} />
        <Appbar.Action icon="video" onPress={handleStartVideoCall} disabled={!isReady} color={theme.colors.primary} />
        <Appbar.Action icon="information" onPress={() => {}} color={theme.colors.primary} />
      </Appbar.Header>

      {pinnedMessages.length > 0 && (
        <View style={styles.pinnedBanner}>
          <IconButton icon="pin" size={16} iconColor={theme.colors.primary} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            {pinnedMessages.map((m, idx) => (
              <TouchableOpacity key={m.id} style={styles.pinnedItem}>
                <Text variant="labelSmall" numberOfLines={1} style={{ maxWidth: 150 }}>
                  {parseMessageContent(m.content)}
                </Text>
                {idx < pinnedMessages.length - 1 && <Text style={{ marginHorizontal: 8, color: '#ccc' }}>|</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
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
            contentContainerStyle={styles.listContent}
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

        {mentionQuery !== null && isGroup && (
          <View style={styles.mentionListContainer}>
            <ScrollView keyboardShouldPersistTaps="always" horizontal showsHorizontalScrollIndicator={false}>
              {groupMembers
                .filter(m => {
                  const name = knownUsers[m.userId] || m.userId;
                  return name.toLowerCase().includes(mentionQuery) || m.userId === currentUser?.sub; // exclude current user? Keep it simple
                })
                .map(m => {
                  const name = knownUsers[m.userId] || `User ${m.userId.substring(0, 4)}`;
                  if (m.userId === currentUser?.sub) return null; // Don't allow mentioning yourself
                  
                  return (
                    <TouchableOpacity 
                      key={m.userId} 
                      style={styles.mentionItem}
                      onPress={() => {
                        const words = text.split(' ');
                        words.pop(); // Remove the typed @query
                        const newText = [...words, `@${name} `].join(' ');
                        setText(newText.trimStart());
                        setMentionQuery(null);
                      }}
                    >
                      <Avatar.Text size={24} label={name.substring(0,2).toUpperCase()} style={{ marginRight: 6 }} />
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
              <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                Đang trả lời {replyToMessage.senderName || 'tin nhắn'}
              </Text>
              <Text variant="bodySmall" numberOfLines={1} style={{ color: '#666' }}>
                {parseMessageContent(replyToMessage.content) || 'Tin nhắn đính kèm'}
              </Text>
            </View>
            <IconButton icon="close" size={18} onPress={() => setReplyToMessage(null)} />
          </View>
        )}

        <View style={styles.inputArea}>
          <IconButton
            icon="plus-circle"
            iconColor={theme.colors.primary}
            size={26}
            onPress={() => setShowMediaMenu(!showMediaMenu)}
          />
          <IconButton
            icon="camera"
            iconColor={theme.colors.primary}
            size={26}
            onPress={takePhoto}
          />
          <IconButton
            icon="image"
            iconColor={theme.colors.primary}
            size={26}
            onPress={pickImage}
          />
          <TextInput
            style={styles.input}
            placeholder="Nhập tin nhắn..."
            value={text}
            onChangeText={(val) => {
              setText(val);
              sendTyping(val.length > 0);
              
              if (isGroup) {
                const words = val.split(' ');
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
            contentStyle={{ backgroundColor: '#f0f2f5', borderRadius: 20, paddingHorizontal: 12 }}
          />
          {text.trim() ? (
            <IconButton
              icon="send"
              iconColor={theme.colors.primary}
              size={26}
              onPress={handleSend}
              disabled={!isReady}
            />
          ) : (
            <IconButton
              icon={isRecording ? "stop-circle" : "microphone"}
              iconColor={isRecording ? "#ff4444" : theme.colors.primary}
              size={26}
              onPressIn={startRecording}
              onPressOut={stopRecording}
              disabled={!isReady}
            />
          )}
        </View>

        {showMediaMenu && (
          <View style={[styles.mediaMenu, { backgroundColor: 'rgba(255,255,255,0.95)' }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaMenuContent}>
              <View style={styles.menuItem}>
                <IconButton icon="file-document" mode="contained" containerColor="#5856d6" iconColor="#fff" onPress={pickDocument} />
                <Text variant="labelSmall">Tài liệu</Text>
              </View>
              <View style={styles.menuItem}>
                <IconButton icon="map-marker" mode="contained" containerColor="#ff9500" iconColor="#fff" onPress={sendLocation} />
                <Text variant="labelSmall">Vị trí</Text>
              </View>
              <View style={styles.menuItem}>
                <IconButton icon="video-outline" mode="contained" containerColor="#ff2d55" iconColor="#fff" onPress={takeVideo} />
                <Text variant="labelSmall">Quay video</Text>
              </View>
              <View style={styles.menuItem}>
                <IconButton icon="filmstrip" mode="contained" containerColor="#4cd964" iconColor="#fff" onPress={pickVideo} />
                <Text variant="labelSmall">Video thư viện</Text>
              </View>
            </ScrollView>
          </View>
        )}
      </KeyboardAvoidingView>

      <Portal>
        <Modal
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          contentContainerStyle={styles.bottomSheetContainer}
          style={{ justifyContent: 'flex-end', margin: 0 }}
        >
          <View style={styles.menuSheet}>
            <View style={styles.emojiList}>
              {['👍', '❤️', '😂', '😮', '😢', '😡'].map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => { handleReaction(selectedMessage, emoji); setMenuVisible(false); }} style={styles.emojiCircle}>
                  <Text style={{ fontSize: 28 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.actionGridItem} onPress={handleReply}>
                <View style={styles.actionGridIcon}><IconButton icon="reply" size={24} iconColor={theme.colors.onSurface} /></View>
                <Text variant="labelSmall">Trả lời</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionGridItem} onPress={handleCopy}>
                <View style={styles.actionGridIcon}><IconButton icon="content-copy" size={24} iconColor={theme.colors.onSurface} /></View>
                <Text variant="labelSmall">Sao chép</Text>
              </TouchableOpacity>
              
              {currentUser?.sub === selectedMessage?.senderId ? (
                <TouchableOpacity style={styles.actionGridItem} onPress={handleRecall}>
                  <View style={styles.actionGridIcon}><IconButton icon="delete-sweep" size={24} iconColor={theme.colors.error} /></View>
                  <Text variant="labelSmall" style={{ color: theme.colors.error }}>Thu hồi</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.actionGridItem} onPress={() => { setMenuVisible(false); Alert.alert('Thông báo', 'Tính năng xóa đang được cập nhật.'); }}>
                  <View style={styles.actionGridIcon}><IconButton icon="delete" size={24} iconColor={theme.colors.onSurface} /></View>
                  <Text variant="labelSmall">Xóa</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.actionGridItem} onPress={() => setShowMoreMenu(!showMoreMenu)}>
                <View style={[styles.actionGridIcon, showMoreMenu && { backgroundColor: theme.colors.primaryContainer }]}>
                  <IconButton icon="dots-horizontal" size={24} iconColor={showMoreMenu ? theme.colors.primary : theme.colors.onSurface} />
                </View>
                <Text variant="labelSmall" style={{ color: showMoreMenu ? theme.colors.primary : theme.colors.onSurface }}>Khác...</Text>
              </TouchableOpacity>
            </View>

            {showMoreMenu && (
              <View style={styles.moreMenuContainer}>
                <Button 
                  icon="pin" 
                  mode="text" 
                  onPress={handlePin}
                  style={styles.modalButton}
                  contentStyle={styles.modalButtonContent}
                >
                  Ghim tin nhắn
                </Button>

                <Button 
                  icon="share-outline" 
                  mode="text" 
                  onPress={() => { handleShare(selectedMessage); setMenuVisible(false); }}
                  style={styles.modalButton}
                  contentStyle={styles.modalButtonContent}
                >
                  Chuyển tiếp
                </Button>
              </View>
            )}
          </View>
        </Modal>
      </Portal>

      <NativeModal
        visible={Boolean(fullscreenMedia)}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenMedia(null)}
      >
        <View style={styles.fullscreenOverlay}>
          <TouchableOpacity style={styles.fullscreenCloseButton} onPress={() => setFullscreenMedia(null)}>
            <IconButton icon="close" iconColor="#fff" size={26} />
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
              onPress={() => {
                void Share.share({
                  url: fullscreenMedia.uri,
                  message: 'Nội dung media từ chat',
                });
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Chia sẻ</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </NativeModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  messageWrapper: { flexDirection: 'row', marginBottom: 12, maxWidth: '85%' },
  messageWrapperLeft: { alignSelf: 'flex-start' },
  messageWrapperRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatar: { marginRight: 8, marginTop: 4 },
  messageBubble: { padding: 10, borderRadius: 18, minWidth: 50 },
  bubbleLeft: { borderBottomLeftRadius: 4 },
  bubbleRight: { borderBottomRightRadius: 4 },
  timeText: { alignSelf: 'flex-end', marginTop: 4, fontSize: 10 },
  typingIndicator: { paddingHorizontal: 20, fontStyle: 'italic', color: '#888', marginBottom: 4, height: 20 },
  mentionListContainer: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#fafafa',
    borderTopWidth: 1,
    borderColor: '#eee',
    maxHeight: 60,
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  replyPreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef4ff',
    borderTopWidth: 1,
    borderColor: '#dbeafe',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inputArea: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingVertical: 6,
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  input: { flex: 1, marginHorizontal: 4, maxHeight: 120, backgroundColor: 'transparent' },
  mediaImage: { width: 220, height: 200, borderRadius: 12, marginBottom: 4 },
  mediaPlaceholder: { width: 180, height: 100, backgroundColor: '#f0f0f0', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  audioMessage: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  docMessage: { flexDirection: 'row', alignItems: 'center', maxWidth: 180 },
  mediaMenu: { position: 'absolute', bottom: 65, left: 0, right: 0, height: 110, borderTopWidth: 0.5, borderColor: '#eee', overflow: 'hidden' },
  mediaMenuContent: { paddingHorizontal: 20, alignItems: 'center', gap: 20 },
  menuItem: { alignItems: 'center' },
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderColor: '#eee',
  },
  pinnedItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  modalContainer: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 12,
  },
  modalButton: {
    width: '100%',
    alignItems: 'flex-start',
  },
  modalButtonContent: {
    height: 48,
    justifyContent: 'flex-start',
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  reactionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: -8,
    zIndex: 10,
  },
  reactionPill: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#eee',
    marginRight: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  bottomSheetContainer: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  menuSheet: {
    backgroundColor: '#f0f2f5',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  emojiList: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  emojiCircle: {
    padding: 4,
  },
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 12,
  },
  actionGridItem: {
    alignItems: 'center',
    flex: 1,
  },
  actionGridIcon: {
    backgroundColor: '#f0f2f5',
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  moreMenuContainer: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenMedia: {
    width: '100%',
    height: '75%',
  },
  fullscreenCloseButton: {
    position: 'absolute',
    top: 40,
    right: 12,
    zIndex: 2,
  },
  fullscreenShareButton: {
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
    backgroundColor: 'rgba(30, 136, 229, 0.9)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
});
