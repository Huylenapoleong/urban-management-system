import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, TouchableOpacity, Image, ScrollView, Alert, Share } from 'react-native';
import { Text, TextInput, IconButton, Appbar, ActivityIndicator, Avatar, Portal, Modal, Button } from 'react-native-paper';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio, ResizeMode, Video } from 'expo-av';
import { useChatConversation } from '../../../hooks/shared/useChatConversation';
import { useAuth } from '../../../providers/AuthProvider';
import { useWebRTCContext } from '../../../providers/WebRTCContext';
import { ApiClient } from '../../../lib/api-client';
import { ENV_CONFIG } from '../../../constants/env';
import { convertToS3Url } from '../../../constants/s3';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CallEndedSummary } from '../../../hooks/shared/useWebRTC';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { ChatDetailHeader } from './_components/ChatDetailHeader';
import { ChatMediaPanels } from './_components/ChatMediaPanels';
import { GroupInfoModal } from './_components/GroupInfoModal';
import { InviteFriendsModal } from './_components/InviteFriendsModal';
import { uploadMedia } from '../../../services/api/upload.api';

const OFFICIAL_CHAT_PRIMARY = '#1f3e68';
const OFFICIAL_CHAT_TEXT = '#ffffff';

const OFFICIAL_CHAT_COLORS = {
  primary: OFFICIAL_CHAT_PRIMARY,
  messageBackground: OFFICIAL_CHAT_PRIMARY,
  selectedBackground: OFFICIAL_CHAT_PRIMARY,
  surface: OFFICIAL_CHAT_TEXT,
  textOnPrimary: OFFICIAL_CHAT_TEXT,
  messageText: OFFICIAL_CHAT_TEXT,
  mutedTextOnPrimary: `${OFFICIAL_CHAT_TEXT}b8`,
  mutedOnSurface: `${OFFICIAL_CHAT_PRIMARY}99`,
  divider: `${OFFICIAL_CHAT_PRIMARY}3a`,
  placeholderSurface: `${OFFICIAL_CHAT_PRIMARY}12`,
  shadow: '#000000',
  fullscreenBackdrop: '#000000',
  primarySoft: `${OFFICIAL_CHAT_PRIMARY}14`,
  primarySoftStrong: `${OFFICIAL_CHAT_PRIMARY}24`,
  border: `${OFFICIAL_CHAT_PRIMARY}2e`,
  overlay: `${OFFICIAL_CHAT_PRIMARY}99`,
};

type MessageWithLegacyMedia = {
  attachmentUrl?: string | null;
  attachmentKey?: string | null;
  attachmentAsset?: {
    key?: string | null;
    resolvedUrl?: string | null;
    fileName?: string | null;
    originalFileName?: string | null;
  } | null;
  attachment_url?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  fileUrl?: string | null;
  file_url?: string | null;
  mediaUrl?: string | null;
  media_url?: string | null;
  replyTo?: string | null;
  replyToMessageId?: string | null;
};

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

const resolveMediaUrl = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(?:file|content|blob):/i.test(trimmed)) return trimmed;

  const converted = convertToS3Url(trimmed);
  if (/^https?:\/\//i.test(converted)) return converted;

  const normalized = converted.replace(/^\/+/, '');
  if (normalized.startsWith('uploads/')) {
    return `${ENV_CONFIG.S3.NEW_BASE_URL}${normalized.replace(/^uploads\/+/, '')}`;
  }

  return `${ENV_CONFIG.API_BASE_URL.replace(/\/+$/, '')}/${normalized}`;
};

const getMessageAttachmentUrl = (item: MessageWithLegacyMedia): string | null => (
  resolveMediaUrl(item.attachmentAsset?.resolvedUrl) ||
  resolveMediaUrl(item.attachmentUrl) ||
  resolveMediaUrl(item.attachmentKey) ||
  resolveMediaUrl(item.attachment_url) ||
  resolveMediaUrl(item.imageUrl) ||
  resolveMediaUrl(item.image_url) ||
  resolveMediaUrl(item.fileUrl) ||
  resolveMediaUrl(item.file_url) ||
  resolveMediaUrl(item.mediaUrl) ||
  resolveMediaUrl(item.media_url) ||
  resolveMediaUrl(item.attachmentAsset?.key)
);

const getMessageAttachmentLabel = (item: any): string => (
  item.attachmentAsset?.fileName ||
  item.attachmentAsset?.originalFileName ||
  parseMessageContent(item.content) ||
  'Tệp đính kèm'
);

const getReplyTargetId = (item: MessageWithLegacyMedia): string | null => (
  item.replyTo || item.replyToMessageId || null
);

const getReplySnippet = (item?: any): string => {
  if (!item) return 'Bấm để tìm tin nhắn gốc';
  const text = parseMessageContent(item.content);
  if (text.trim()) return text.trim();
  if (item.type === 'IMAGE') return 'Ảnh';
  if (item.type === 'VIDEO') return 'Video';
  if (item.type === 'AUDIO') return 'Tin nhắn thoại';
  if (item.type === 'DOC') return getMessageAttachmentLabel(item);
  return 'Tin nhắn đính kèm';
};

const resolveAttachmentType = (
  fileName: string,
  mimeType?: string,
): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOC' => {
  const normalizedMime = mimeType?.split(';')[0]?.trim().toLowerCase() ?? '';
  const lowerName = fileName.toLowerCase();

  if (normalizedMime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/.test(lowerName)) {
    return 'IMAGE';
  }

  if (normalizedMime.startsWith('video/') || /\.(mp4|m4v|mov|qt)$/.test(lowerName)) {
    return 'VIDEO';
  }

  if (normalizedMime.startsWith('audio/') || /\.(mp3|m4a|aac)$/.test(lowerName)) {
    return 'AUDIO';
  }

  return 'DOC';
};

const MemoMessageWrapper = React.memo(
  ({ item, renderMessageBubble }: any) => {
    return renderMessageBubble(item);
  },
  (prev, next) => {
    return (
      prev.item.id === next.item.id &&
      prev.item.content === next.item.content &&
      prev.item.isOptimistic === next.item.isOptimistic &&
      prev.item.deletedAt === next.item.deletedAt &&
      prev.highlightedMessageId === next.highlightedMessageId &&
      prev.knownUsersLength === next.knownUsersLength &&
      prev.isMe === next.isMe
    );
  }
);

export default function OfficialChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const segments = useSegments();
  const decodedId = useMemo(() => {
    if (!conversationId) return '';
    const dec = decodeURIComponent(conversationId);
    return dec.startsWith('dm-') ? `dm:${dec.slice(3)}` : dec;
  }, [conversationId]);

  const isGroup = useMemo(() => decodedId?.startsWith('GRP#') || decodedId?.startsWith('group:'), [decodedId]);
  const groupId = useMemo(() => {
    if (decodedId?.startsWith('GRP#')) return decodedId.slice(4);
    if (decodedId?.startsWith('group:')) return decodedId.slice('group:'.length);
    return '';
  }, [decodedId]);

  const router = useRouter();
  const chatListPath = segments[0] === '(citizen)' ? '/(citizen)/chat' : '/(official)/chat';
  const { user: currentUser } = useAuth();
  const { startCall } = useWebRTCContext();
  
  const [text, setText] = useState('');
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<any>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<{ uri: string; type: 'image' | 'video' } | null>(null);
  const [downloadingMedia, setDownloadingMedia] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [typingDots, setTypingDots] = useState('.');
  
  const [callSummaries, setCallSummaries] = useState<CallEndedSummary[]>([]);
  const { lastEndedCall, clearLastEndedCall } = useWebRTCContext();

  useEffect(() => {
    if (!lastEndedCall) return;

    setCallSummaries((prev) => {
      const next = [...prev];
      const nextKey = [
        lastEndedCall.conversationId,
        lastEndedCall.endedAt,
        lastEndedCall.peerUserId || '',
        lastEndedCall.direction,
        String(lastEndedCall.durationSeconds),
      ].join('|');

      const hasDuplicate = next.some(
        (item) =>
          [
            item.conversationId,
            item.endedAt,
            item.peerUserId || '',
            item.direction,
            String(item.durationSeconds),
          ].join('|') === nextKey,
      );

      if (!hasDuplicate) {
        next.push(lastEndedCall);
      }
      return next;
    });
  }, [lastEndedCall]);

  const resolveCallSummary = useCallback(
    (msg: any, expectedDirection: 'INCOMING' | 'OUTGOING', expectedIsVideo: boolean) => {
      const candidates = callSummaries.filter((item) => item.conversationId === decodedId);
      if (candidates.length === 0) return null;

      const byDirectionAndType = candidates.filter(
        (item) => item.direction.toUpperCase() === expectedDirection && item.isVideo === expectedIsVideo,
      );
      const byDirection = candidates.filter((item) => item.direction.toUpperCase() === expectedDirection);
      const scopedCandidates = byDirectionAndType.length > 0 ? byDirectionAndType : (byDirection.length > 0 ? byDirection : candidates);

      const messageTime = new Date(msg.sentAt).getTime();
      const nearest = scopedCandidates
        .map((item) => ({
          item,
          diff: Math.abs(new Date(item.endedAt).getTime() - messageTime),
        }))
        .sort((left, right) => left.diff - right.diff)[0];

      if (!nearest || nearest.diff > 10 * 60 * 1000) return null;
      return nearest.item;
    },
    [callSummaries, decodedId],
  );

  const formatCallDuration = (totalSeconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const flatListRef = useRef<FlatList>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [forwardDialogVisible, setForwardDialogVisible] = useState(false);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwardTargetIds, setForwardTargetIds] = useState<string[]>([]);
  const [isForwarding, setIsForwarding] = useState(false);
  const [convInfo, setConvInfo] = useState<any>(null);
  const [allConversations, setAllConversations] = useState<any[]>([]);
  const [accessDeniedDialogVisible, setAccessDeniedDialogVisible] = useState(false);
  const [isDeletingDeniedConversation, setIsDeletingDeniedConversation] = useState(false);

  // States for @mention functionality
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);

  // Group Info Dialog states
  const [groupInfoDialogVisible, setGroupInfoDialogVisible] = useState(false);
  const [addMemberDialogVisible, setAddMemberDialogVisible] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);

  const handleConversationAccessDenied = useCallback(() => {
    setAccessDeniedDialogVisible(true);
  }, []);

  const handleDeniedKeepConversation = useCallback(() => {
    if (isDeletingDeniedConversation) {
      return;
    }

    setAccessDeniedDialogVisible(false);
    router.replace(chatListPath as any);
  }, [chatListPath, isDeletingDeniedConversation, router]);

  const handleDeniedDeleteConversation = useCallback(() => {
    if (isDeletingDeniedConversation) {
      return;
    }

    setIsDeletingDeniedConversation(true);
    void (async () => {
      try {
        await ApiClient.delete(`/conversations/${encodeURIComponent(decodedId)}`);
      } catch (error: any) {
        Alert.alert('Lỗi', error?.message || 'Không thể xóa cuộc trò chuyện lúc này.');
      } finally {
        setIsDeletingDeniedConversation(false);
        setAccessDeniedDialogVisible(false);
        router.replace(chatListPath as any);
      }
    })();
  }, [chatListPath, decodedId, isDeletingDeniedConversation, router]);

  const chatOptions = useMemo(() => ({
    onConversationAccessDenied: handleConversationAccessDenied,
  }), [handleConversationAccessDenied]);

  const {
    messages,
    isLoadingHistory,
    isReady,
    presenceByUser,
    sendMessage,
    sendMedia,
    sendTyping,
    typingUsers,
    markRead,
    deleteMessage,
    updateMessage,
    forwardMessage,
  } = useChatConversation(decodedId, currentUser, chatOptions);

  const getPresenceSubtitle = useCallback(() => {
    if (decodedId?.startsWith('GRP#') || decodedId?.startsWith('group:')) {
      if (!groupMembers || groupMembers.length === 0) return 'Đang cập nhật...';
      return `${groupMembers.length} thành viên`;
    }
    
    if (!isReady) return 'Đang kết nối...';
    
    const peerId = decodedId?.startsWith('dm:') ? decodedId.replace('dm:', '') : decodedId;
    const presence = presenceByUser[String(peerId)];
    
    if (!presence) return 'Ngoại tuyến';
    if (presence.isActive) return 'Vừa mới truy cập';
    
    if (presence.lastSeenAt) {
        const diffMs = Date.now() - new Date(presence.lastSeenAt).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Vừa mới truy cập';
        if (diffMins < 60) return `Hoạt động ${diffMins} phút trước`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Hoạt động ${diffHours} giờ trước`;
        return `Hoạt động ${Math.floor(diffHours / 24)} ngày trước`;
    }
    
    return 'Ngoại tuyến';
  }, [groupMembers.length, isReady, decodedId, presenceByUser]);

  const handleLeaveGroup = useCallback(async (currentGroupId: string) => {
    if (!currentGroupId) return;
    try {
      await ApiClient.post(`/groups/${currentGroupId}/leave`);
      setGroupInfoDialogVisible(false);
      router.replace(chatListPath as any);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể rời nhóm. (Chủ nhóm không thể tự rời)');
    }
  }, [router, chatListPath]);

  const handleRemoveMember = useCallback(async (currentGroupId: string, userId: string) => {
    if (!currentGroupId) return;
    try {
      await ApiClient.patch(`/groups/${currentGroupId}/members/${userId}`, { action: 'remove' });
      setGroupMembers(prev => prev.filter(m => m.userId !== userId));
      Alert.alert('Thành công', 'Đã xóa thành viên khỏi nhóm.');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể xóa thành viên.');
    }
  }, []);

  const handleUpdateMemberRole = useCallback(async (currentGroupId: string, targetUserId: string, currentRole: string) => {
    const newRole = currentRole === 'OFFICER' ? 'MEMBER' : 'OFFICER';
    try {
      const res = await ApiClient.patch(`/groups/${currentGroupId}/members/${targetUserId}`, { action: 'update', roleInGroup: newRole });
      setGroupMembers(prev => prev.map(m => m.userId === targetUserId ? res : m));
      Alert.alert('Thành công', `Đã đổi quyền thành ${newRole === 'OFFICER' ? 'Phó nhóm' : 'Thành viên'}.`);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể đổi quyền.');
    }
  }, []);

  const handleUpdateGroupAvatar = useCallback(async () => {
    if (!groupId) return;
    
    // Check permission
    const isOwner = convInfo?.ownerId === currentUser?.sub;
    if (!isOwner) {
      Alert.alert('Chỉ Quản trị viên mới được đổi ảnh nhóm.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      setIsUpdatingAvatar(true);
      try {
        const uploaded = await uploadMedia({
          uri: result.assets[0].uri,
          fileName: `group-${groupId}-avatar.jpg`,
          mimeType: 'image/jpeg',
          target: 'AVATAR',
        });
        
        await ApiClient.patch(`/groups/${groupId}`, { avatarUrl: uploaded.url });
        
        setConvInfo((prev: any) => ({ ...prev, avatarUrl: uploaded.url }));
        Alert.alert('Thành công', 'Đã cập nhật ảnh đại diện nhóm.');
      } catch (error: any) {
        Alert.alert('Lỗi', error?.message || 'Không thể cập nhật ảnh đại diện.');
      } finally {
        setIsUpdatingAvatar(false);
      }
    }
  }, [groupId, convInfo?.ownerId, currentUser?.sub]);

  const handleAddMemberSubmit = useCallback(async (currentGroupId: string, targetUserId: string) => {
    if (!currentGroupId || !targetUserId.trim()) return;
    try {
      setIsAddingMember(true);
      const res = await ApiClient.patch(`/groups/${currentGroupId}/members/${targetUserId.trim()}`, { action: 'add' });
      setGroupMembers(prev => [...prev, res]);
      setAddMemberDialogVisible(false);
      Alert.alert('Thành công', 'Đã thêm thành viên.');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể thêm thành viên. (Bạn không có quyền hoặc người dùng đã có trong nhóm)');
    } finally {
      setIsAddingMember(false);
    }
  }, []);




  const messagesById = useMemo(() => new Map(messages.map((item: any) => [item.id, item])), [messages]);
  const dedupedMessages = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of messages) {
      if (!item?.id) continue;
      map.set(String(item.id), item);
    }
    return Array.from(map.values()).reverse();
  }, [messages]);

  const filteredForwardConversations = useMemo(() => {
    const normalized = forwardSearch.trim().toLowerCase();

    return allConversations
      .filter((conversation) => conversation?.conversationId && conversation.conversationId !== decodedId)
      .filter((conversation) => {
        if (!normalized) return true;

        const haystack = [
          conversation.groupName,
          conversation.lastMessagePreview,
          conversation.lastSenderName,
          conversation.conversationId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(normalized);
      });
  }, [allConversations, decodedId, forwardSearch]);

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
        setAllConversations(convs || []);
        const found = convs.find((c: any) => c.conversationId === decodedId);
        if (found) setConvInfo(found);
      })
      .catch(console.error);

    if (isGroup && groupId) {
      ApiClient.get(`/groups/${groupId}/members`)
        .then(res => setGroupMembers(res))
        .catch(console.error);
    }
  }, [decodedId, groupId, isGroup]);

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

  useEffect(() => {
    if (!highlightedMessageId) return;
    const timeout = setTimeout(() => setHighlightedMessageId(null), 1800);
    return () => clearTimeout(timeout);
  }, [highlightedMessageId]);

  useEffect(() => {
    if (!Object.values(typingUsers).some((item) => item.isTyping)) {
      setTypingDots('.');
      return;
    }

    const interval = setInterval(() => {
      setTypingDots((current) => (current.length >= 3 ? '.' : `${current}.`));
    }, 420);

    return () => clearInterval(interval);
  }, [typingUsers]);

  const createClientMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleSend = () => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    if (editingMessage) {
      let nextContent = trimmedText;
      try {
        const parsed = JSON.parse(editingMessage.content);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          nextContent = JSON.stringify({
            ...parsed,
            text: trimmedText,
            content: trimmedText,
          });
        }
      } catch {
        nextContent = trimmedText;
      }

      updateMessage(editingMessage.id, nextContent);
      setEditingMessage(null);
      setText('');
      sendTyping(false);
      return;
    }

    sendMessage(trimmedText, createClientMessageId(), 'TEXT', undefined, replyToMessage?.id);
    setText('');
    setReplyToMessage(null);
    sendTyping(false);
  };

  const handleQuickLike = () => {
    sendMessage('👍', createClientMessageId(), 'TEXT', undefined, replyToMessage?.id);
    setReplyToMessage(null);
    sendTyping(false);
  };

  const handleToggleForwardTarget = (conversationId: string) => {
    setForwardTargetIds((prev) =>
      prev.includes(conversationId) ? prev.filter((id) => id !== conversationId) : [...prev, conversationId],
    );
  };

  const openForwardDialog = () => {
    if (!selectedMessage?.id) {
      return;
    }

    setMenuVisible(false);
    setForwardTargetIds([]);
    setForwardSearch('');
    setForwardDialogVisible(true);
  };

  const submitForward = async () => {
    if (!selectedMessage?.id || !forwardTargetIds.length) {
      Alert.alert('Thông báo', 'Vui lòng chọn ít nhất một cuộc trò chuyện.');
      return;
    }

    try {
      setIsForwarding(true);
      await forwardMessage(selectedMessage.id, forwardTargetIds);
      setForwardDialogVisible(false);
      setForwardTargetIds([]);
      setForwardSearch('');
      Alert.alert('Thành công', 'Đã chuyển tiếp tin nhắn.');
    } catch (error: any) {
      Alert.alert('Lỗi', error?.message || 'Không thể chuyển tiếp tin nhắn lúc này.');
    } finally {
      setIsForwarding(false);
    }
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
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.length) {
      try {
        for (const [index, asset] of result.assets.entries()) {
          await sendMedia(
            asset.uri,
            asset.fileName || `image-${Date.now()}-${index + 1}.jpg`,
            asset.mimeType || 'image/jpeg',
            'IMAGE',
            index === 0 ? replyToMessage?.id : undefined,
          );
        }
        setReplyToMessage(null);
      } catch (e) {
        Alert.alert('Lỗi', 'Không thể gửi tệp. Vui lòng thử lại.');
      }
    }
    setShowMediaMenu(false);
  };

  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
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
      mediaTypes: ['videos'],
      allowsEditing: false,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.length) {
      try {
        for (const [index, asset] of result.assets.entries()) {
          await sendMedia(
            asset.uri,
            asset.fileName || `video-${Date.now()}-${index + 1}.mp4`,
            asset.mimeType || 'video/mp4',
            'VIDEO',
            index === 0 ? replyToMessage?.id : undefined,
          );
        }
        setReplyToMessage(null);
      } catch (e) {
        Alert.alert('Lỗi', 'Không thể gửi video. Vui lòng thử lại.');
      }
    }
    setShowMediaMenu(false);
  };

  const takeVideo = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
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
        multiple: true,
      });
      if (!result.canceled && result.assets?.length) {
        for (const [index, asset] of result.assets.entries()) {
          await sendMedia(
            asset.uri,
            asset.name || `file-${Date.now()}-${index + 1}`,
            asset.mimeType || 'application/octet-stream',
            resolveAttachmentType(asset.name || '', asset.mimeType),
            index === 0 ? replyToMessage?.id : undefined,
          );
        }
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
          createClientMessageId(),
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

  const handleOpenAttachment = useCallback(async (item: any) => {
    const url = getMessageAttachmentUrl(item);
    const label = getMessageAttachmentLabel(item);

    if (!url) {
      Alert.alert('Thông báo', 'Không tìm thấy đường dẫn tệp đính kèm.');
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    await Share.share({ url, title: label, message: label });
  }, []);

  const handleSaveFullscreenMedia = useCallback(async () => {
    if (!fullscreenMedia?.uri) return;
    setDownloadingMedia(true);

    try {
      const extension = fullscreenMedia.type === 'video' ? 'mp4' : 'jpg';
      const fileName = `official-chat-${Date.now()}.${extension}`;

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        let downloadHref = fullscreenMedia.uri;
        let objectUrl: string | null = null;

        try {
          const response = await fetch(fullscreenMedia.uri);
          if (response.ok) {
            objectUrl = URL.createObjectURL(await response.blob());
            downloadHref = objectUrl;
          }
        } catch {
          downloadHref = fullscreenMedia.uri;
        }

        const anchor = document.createElement('a');
        anchor.href = downloadHref;
        anchor.download = fileName;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);

        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return;
      }

      await Share.share({
        url: fullscreenMedia.uri,
        title: fileName,
        message: fileName,
      });
    } catch (error: any) {
      Alert.alert('Không thể lưu', error?.message || 'Không thể lưu media lúc này.');
    } finally {
      setDownloadingMedia(false);
    }
  }, [fullscreenMedia]);

  const handleJumpToMessage = useCallback((messageId: string) => {
    const index = messages.findIndex((item: any) => item.id === messageId);

    if (index < 0) {
      Alert.alert('Thông báo', 'Không tìm thấy tin nhắn gốc trong hội thoại hiện tại.');
      return;
    }

    flatListRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.5,
    });
    setHighlightedMessageId(messageId);
  }, [messages]);

  const renderReplyQuote = useCallback((item: any, isMe: boolean) => {
    const replyTargetId = getReplyTargetId(item);
    if (!replyTargetId) return null;

    const originalMessage = messagesById.get(replyTargetId);
    const senderName = originalMessage?.senderName || 'Tin nhắn gốc';

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={[
          styles.replyQuote,
          { backgroundColor: OFFICIAL_CHAT_COLORS.primarySoftStrong },
        ]}
        onPress={() => handleJumpToMessage(replyTargetId)}
      >
        <View style={styles.replyQuoteBar} />
        <View style={styles.replyQuoteContent}>
          <Text
            variant="labelSmall"
            numberOfLines={1}
            style={{ color: OFFICIAL_CHAT_COLORS.messageText, fontWeight: '800' }}
          >
            {senderName}
          </Text>
          <Text
            variant="bodySmall"
            numberOfLines={1}
            style={{ color: OFFICIAL_CHAT_COLORS.mutedTextOnPrimary }}
          >
            {getReplySnippet(originalMessage)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [handleJumpToMessage, messagesById]);

  const sendDroppedFiles = useCallback(async (files: File[]) => {
    if (!files.length || !isReady) return;

    try {
      for (const [index, file] of files.entries()) {
        const uri = URL.createObjectURL(file);
        await sendMedia(
          uri,
          file.name || `drop-${Date.now()}-${index + 1}`,
          file.type || 'application/octet-stream',
          resolveAttachmentType(file.name || '', file.type),
          index === 0 ? replyToMessage?.id : undefined,
        );
        URL.revokeObjectURL(uri);
      }
      setReplyToMessage(null);
    } catch (error: any) {
      Alert.alert('Không thể gửi tệp', error?.message || 'Kéo thả tệp thất bại.');
    }
  }, [isReady, replyToMessage?.id, sendMedia]);

  const dropZoneProps = useMemo(() => {
    if (Platform.OS !== 'web') return {};

    return {
      onDragOver: (event: any) => {
        event.preventDefault();
      },
      onDrop: (event: any) => {
        event.preventDefault();
        const files = Array.from(event.dataTransfer?.files ?? []) as File[];
        void sendDroppedFiles(files);
      },
    };
  }, [sendDroppedFiles]);

  const activeTypers = Object.values(typingUsers).filter(u => u.isTyping).map(u => u.fullName).join(', ');
  const keyboardBehavior: 'padding' | 'height' | undefined = Platform.OS === 'ios' ? 'padding' : 'height';
  const keyboardVerticalOffset = Platform.select({ ios: 8, android: 20, default: 0 });

  const renderMessageContent = (item: any) => {
    const isMe = currentUser?.sub === item.senderId;
    const attachmentUrl = getMessageAttachmentUrl(item);
    const attachmentLabel = getMessageAttachmentLabel(item);
    
    if (item.deletedAt) {
      return (
        <Text style={{ color: isMe ? OFFICIAL_CHAT_COLORS.mutedTextOnPrimary : OFFICIAL_CHAT_COLORS.mutedOnSurface, fontStyle: 'italic' }}>
          Tin nhắn đã bị thu hồi
        </Text>
      );
    }

    if (item.type === 'IMAGE') {
      if (!attachmentUrl) {
        return (
          <View style={styles.mediaFallback}>
            <IconButton icon="image-off" iconColor={OFFICIAL_CHAT_COLORS.messageText} size={24} />
            <Text style={{ color: OFFICIAL_CHAT_COLORS.messageText }}>Không tìm thấy ảnh</Text>
          </View>
        );
      }

      return (
        <TouchableOpacity activeOpacity={0.9} onPress={() => setFullscreenMedia({ uri: attachmentUrl, type: 'image' })}>
          <Image source={{ uri: attachmentUrl }} style={styles.mediaImage} resizeMode="cover" />
        </TouchableOpacity>
      );
    }

    if (item.type === 'VIDEO') {
      if (!attachmentUrl) {
        return (
          <View style={styles.mediaFallback}>
            <IconButton icon="video-off" iconColor={OFFICIAL_CHAT_COLORS.messageText} size={24} />
            <Text style={{ color: OFFICIAL_CHAT_COLORS.messageText }}>Không tìm thấy video</Text>
          </View>
        );
      }

      return (
        <TouchableOpacity style={styles.mediaVideo} activeOpacity={0.85} onPress={() => setFullscreenMedia({ uri: attachmentUrl, type: 'video' })}>
          <Video
            source={{ uri: attachmentUrl }}
            style={styles.mediaVideoPlayer}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isMuted
            isLooping
          />
          <View pointerEvents="none" style={styles.mediaVideoOverlay}>
            <IconButton icon="arrow-expand" iconColor={OFFICIAL_CHAT_COLORS.textOnPrimary} size={24} />
          </View>
        </TouchableOpacity>
      );
    }

    if (item.type === 'AUDIO') {
      return (
        <TouchableOpacity style={styles.audioMessage} onPress={() => handleOpenAttachment(item)}>
          <IconButton icon="play" iconColor={OFFICIAL_CHAT_COLORS.messageText} size={24} />
          <Text style={{ color: OFFICIAL_CHAT_COLORS.messageText }}>Tin nhắn thoại</Text>
        </TouchableOpacity>
      );
    }

    if (item.type === 'DOC') {
      return (
        <TouchableOpacity style={styles.docMessage} onPress={() => handleOpenAttachment(item)}>
          <IconButton icon="file-document" iconColor={OFFICIAL_CHAT_COLORS.messageText} size={24} />
          <Text style={{ color: OFFICIAL_CHAT_COLORS.messageText }} numberOfLines={1}>
            {attachmentLabel}
          </Text>
        </TouchableOpacity>
      );
    }

    if (item.type === 'SYSTEM') {
      const content = typeof item.content === 'string' ? item.content : String(item.content || '');
      if (content.startsWith('CALL_ENDED|')) {
        const parts = content.split('|');
        const direction = parts[1] as 'INCOMING' | 'OUTGOING';
        const isVideo = parts[2] === 'true';
        const summary = resolveCallSummary(item, direction, isVideo);
        const isMissed = summary ? summary.durationSeconds === 0 : true;

        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isMe ? OFFICIAL_CHAT_COLORS.primarySoftStrong : '#f0f0f0', padding: 8, borderRadius: 8, marginVertical: 4 }}>
             <MaterialCommunityIcons name={isVideo ? 'video' : 'phone'} size={20} color={isMissed ? '#d32f2f' : '#388e3c'} style={{ marginRight: 8 }} />
             <View>
               <Text style={{ fontWeight: 'bold', color: isMissed ? '#d32f2f' : (isMe ? OFFICIAL_CHAT_COLORS.textOnPrimary : '#333') }}>
                 {direction === 'INCOMING' 
                    ? (isMissed ? 'Cuộc gọi nhỡ' : 'Cuộc gọi đến') 
                    : (isMissed ? 'Cuộc gọi đi chưa được trả lời' : 'Cuộc gọi đi')}
               </Text>
               {!isMissed && summary && (
                 <Text style={{ fontSize: 12, color: isMe ? OFFICIAL_CHAT_COLORS.mutedTextOnPrimary : '#666' }}>{formatCallDuration(summary.durationSeconds)}</Text>
               )}
             </View>
          </View>
        );
      }
      return (
        <Text style={{ color: OFFICIAL_CHAT_COLORS.mutedOnSurface, fontStyle: 'italic', textAlign: 'center', marginVertical: 4 }}>
          {parseMessageContent(item.content)}
        </Text>
      );
    }

    return (
      <Text style={{ color: OFFICIAL_CHAT_COLORS.messageText, fontSize: 16 }}>
        {parseMessageContent(item.content)}
      </Text>
    );
  };

  const renderMessageBubble = (item: any) => {
    const isMe = currentUser?.sub === item.senderId;

    let reactions = {};
    try {
      const parsed = JSON.parse(item.content);
      reactions = parsed.reactions || {};
    } catch {
      // ignore
    }

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
              { backgroundColor: OFFICIAL_CHAT_COLORS.messageBackground },
              isMe ? styles.bubbleRight : styles.bubbleLeft,
              item.id === highlightedMessageId && styles.messageBubbleHighlighted,
              item.isOptimistic && { opacity: 0.6 }
            ]}>
            {!isMe && item.isGroup && (
              <Text variant="labelSmall" style={{ color: OFFICIAL_CHAT_COLORS.messageText, marginBottom: 2, fontWeight: 'bold' }}>
                {item.senderName}
              </Text>
            )}
            
            {renderReplyQuote(item, isMe)}
            {renderMessageContent(item)}
            
            <View style={styles.bubbleFooter}>
              <Text variant="labelSmall" style={[styles.timeText, { color: OFFICIAL_CHAT_COLORS.mutedTextOnPrimary }]}>
                {item.isOptimistic ? 'Đang gửi...' : new Date(item.sentAt || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </TouchableOpacity>
          
          {Object.keys(reactions).length > 0 && (
            <View style={[styles.reactionContainer, { alignSelf: isMe ? 'flex-end' : 'flex-start' }]}>
              {Object.entries(reactions).map(([emoji, users]: [string, any]) => (
                users.length > 0 && (
                  <View key={emoji} style={styles.reactionPill}>
                    <Text style={styles.reactionText}>{emoji} {users.length}</Text>
                  </View>
                )
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

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

  const handleEdit = () => {
    if (!selectedMessage) {
      return;
    }

    if (currentUser?.sub !== selectedMessage.senderId) {
      setMenuVisible(false);
      return;
    }

    setEditingMessage(selectedMessage);
    setReplyToMessage(null);
    setText(parseMessageContent(selectedMessage.content));
    setMenuVisible(false);
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
      const attachmentUrl = getMessageAttachmentUrl(item);
      await Share.share({
        message: textToShare || getMessageAttachmentLabel(item),
        url: attachmentUrl || undefined
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

    const knownUsersLength = Object.keys(knownUsers).length;
    const isMeFunc = (item: any) => currentUser?.sub === item?.senderId;
  
    const renderMessage = ({ item }: { item: any }) => (
      <MemoMessageWrapper
        item={item}
        renderMessageBubble={renderMessageBubble}
        highlightedMessageId={highlightedMessageId}
        knownUsersLength={knownUsersLength}
        isMe={isMeFunc(item)}
      />
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: OFFICIAL_CHAT_COLORS.surface }]}>
      <ChatDetailHeader
        styles={styles}
        colors={OFFICIAL_CHAT_COLORS}
        isGroup={isGroup}
        headerAvatarUrl={convInfo?.avatarUrl || null}
        conversationDisplayName={convInfo?.groupName || (isGroup ? 'Nhóm Trò Chuyện' : (knownUsers[decodedId?.replace('dm:', '') || ''] || 'Tin nhắn'))}
        subtitleText={getPresenceSubtitle()}
        isPeerOnline={!isGroup && presenceByUser[String(decodedId?.replace('dm:', ''))]?.isActive}
        onBack={() => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.location.replace('/chat');
            return;
          }

          router.replace(chatListPath as any);
        }}
        onStartAudioCall={handleStartAudioCall}
        onStartVideoCall={handleStartVideoCall}
        onOpenInfo={() => setGroupInfoDialogVisible(true)}
        onUpdateAvatar={isGroup && convInfo?.ownerId === currentUser?.sub ? handleUpdateGroupAvatar : undefined}
        isUpdatingAvatar={isUpdatingAvatar}
      />

      {pinnedMessages.length > 0 && (
        <View style={styles.pinnedBanner}>
          <IconButton icon="pin" size={16} iconColor={OFFICIAL_CHAT_COLORS.primary} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            {pinnedMessages.map((m, idx) => (
              <TouchableOpacity key={m.id} style={styles.pinnedItem}>
                <Text variant="labelSmall" numberOfLines={1} style={{ maxWidth: 150 }}>
                  {parseMessageContent(m.content)}
                </Text>
                {idx < pinnedMessages.length - 1 && <Text style={{ marginHorizontal: 8, color: OFFICIAL_CHAT_COLORS.divider }}>|</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <KeyboardAvoidingView
        {...dropZoneProps}
        style={styles.container}
        behavior={keyboardBehavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {isLoadingHistory ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={{ marginTop: 8, color: OFFICIAL_CHAT_COLORS.mutedOnSurface }}>Đang tải tin nhắn...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={dedupedMessages}
            inverted={true}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderMessage}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={[styles.emptyContainer, { transform: [{ scaleY: -1 }] }]}>
                <Text variant="bodyMedium" style={{ color: OFFICIAL_CHAT_COLORS.mutedOnSurface, textAlign: 'center' }}>
                  Chưa có tin nhắn nào.{'\n'}Hãy bắt đầu cuộc trò chuyện!
                </Text>
              </View>
            }
          />
        )}

        {activeTypers.length > 0 && (
          <Text style={styles.typingIndicator} variant="labelMedium">
            {activeTypers} đang soạn tin{typingDots}
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
              <Text variant="labelSmall" style={{ color: OFFICIAL_CHAT_COLORS.primary, fontWeight: '700' }}>
                Đang trả lời {replyToMessage.senderName || 'tin nhắn'}
              </Text>
              <Text variant="bodySmall" numberOfLines={1} style={{ color: OFFICIAL_CHAT_COLORS.mutedOnSurface }}>
                {parseMessageContent(replyToMessage.content) || 'Tin nhắn đính kèm'}
              </Text>
            </View>
            <IconButton icon="close" size={18} onPress={() => setReplyToMessage(null)} />
          </View>
        )}

        {editingMessage && (
          <View style={styles.replyPreviewBox}>
            <View style={{ flex: 1 }}>
              <Text variant="labelSmall" style={{ color: OFFICIAL_CHAT_COLORS.primary, fontWeight: '700' }}>
                Đang sửa tin nhắn
              </Text>
              <Text variant="bodySmall" numberOfLines={1} style={{ color: OFFICIAL_CHAT_COLORS.mutedOnSurface }}>
                {parseMessageContent(editingMessage.content) || 'Tin nhắn đính kèm'}
              </Text>
            </View>
            <IconButton icon="close" size={18} onPress={() => { setEditingMessage(null); setText(''); }} />
          </View>
        )}

        <View style={styles.inputArea}>
          <IconButton
            icon="plus-circle"
            iconColor={OFFICIAL_CHAT_COLORS.primary}
            size={26}
            onPress={() => setShowMediaMenu(!showMediaMenu)}
          />
          <TextInput
            style={styles.input}
            placeholder="Nhập tin nhắn..."
            value={text}
            onFocus={() => {
              // With inverted we don't need scrollToEnd, it handles layout naturally.
            }}
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
            contentStyle={{ backgroundColor: OFFICIAL_CHAT_COLORS.primarySoft, borderRadius: 20, paddingHorizontal: 12 }}
          />
          <View style={styles.rightComposerActions}>
            {!text.trim() && !editingMessage && (
              <View style={styles.emptyComposerActions}>
                <IconButton
                  icon="thumb-up"
                  iconColor={OFFICIAL_CHAT_COLORS.primary}
                  size={24}
                  onPress={handleQuickLike}
                />
                <IconButton
                  icon={isRecording ? "stop-circle" : "microphone"}
                  iconColor={OFFICIAL_CHAT_COLORS.primary}
                  size={24}
                  onPressIn={startRecording}
                  onPressOut={stopRecording}
                />
              </View>
            )}
            <IconButton
              icon="send"
              iconColor={OFFICIAL_CHAT_COLORS.primary}
              size={26}
              onPress={handleSend}
              disabled={!text.trim()}
            />
          </View>
        </View>

        {showMediaMenu && (
          <View style={[styles.mediaMenu, { backgroundColor: OFFICIAL_CHAT_COLORS.surface }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaMenuContent}>
              <View style={styles.menuItem}>
                <IconButton icon="file-document" mode="contained" containerColor={OFFICIAL_CHAT_COLORS.primary} iconColor={OFFICIAL_CHAT_COLORS.textOnPrimary} onPress={pickDocument} />
                <Text variant="labelSmall" style={styles.mediaMenuLabel}>Tài liệu</Text>
              </View>
              <View style={styles.menuItem}>
                <IconButton icon="map-marker" mode="contained" containerColor={OFFICIAL_CHAT_COLORS.primary} iconColor={OFFICIAL_CHAT_COLORS.textOnPrimary} onPress={sendLocation} />
                <Text variant="labelSmall" style={styles.mediaMenuLabel}>Vị trí</Text>
              </View>
              <View style={styles.menuItem}>
                <IconButton icon="video-outline" mode="contained" containerColor={OFFICIAL_CHAT_COLORS.primary} iconColor={OFFICIAL_CHAT_COLORS.textOnPrimary} onPress={takeVideo} />
                <Text variant="labelSmall" style={styles.mediaMenuLabel}>Quay video</Text>
              </View>
              <View style={styles.menuItem}>
                <IconButton icon="filmstrip" mode="contained" containerColor={OFFICIAL_CHAT_COLORS.primary} iconColor={OFFICIAL_CHAT_COLORS.textOnPrimary} onPress={pickVideo} />
                <Text variant="labelSmall" style={styles.mediaMenuLabel}>Video thư viện</Text>
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
                <View style={styles.actionGridIcon}><IconButton icon="reply" size={24} iconColor={OFFICIAL_CHAT_COLORS.primary} /></View>
                <Text variant="labelSmall" style={styles.actionGridText}>Trả lời</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionGridItem} onPress={handleCopy}>
                <View style={styles.actionGridIcon}><IconButton icon="content-copy" size={24} iconColor={OFFICIAL_CHAT_COLORS.primary} /></View>
                <Text variant="labelSmall" style={styles.actionGridText}>Sao chép</Text>
              </TouchableOpacity>

              {currentUser?.sub === selectedMessage?.senderId && (
                <TouchableOpacity style={styles.actionGridItem} onPress={handleEdit}>
                  <View style={styles.actionGridIcon}><IconButton icon="pencil" size={24} iconColor={OFFICIAL_CHAT_COLORS.primary} /></View>
                  <Text variant="labelSmall" style={styles.actionGridText}>Sửa</Text>
                </TouchableOpacity>
              )}
              
              {currentUser?.sub === selectedMessage?.senderId ? (
                <TouchableOpacity style={styles.actionGridItem} onPress={handleRecall}>
                  <View style={styles.actionGridIcon}><IconButton icon="delete-sweep" size={24} iconColor={OFFICIAL_CHAT_COLORS.primary} /></View>
                  <Text variant="labelSmall" style={styles.actionGridText}>Thu hồi</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.actionGridItem} onPress={() => { setMenuVisible(false); Alert.alert('Thông báo', 'Tính năng xóa đang được cập nhật.'); }}>
                  <View style={styles.actionGridIcon}><IconButton icon="delete" size={24} iconColor={OFFICIAL_CHAT_COLORS.primary} /></View>
                  <Text variant="labelSmall" style={styles.actionGridText}>Xóa</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.actionGridItem} onPress={() => setShowMoreMenu(!showMoreMenu)}>
                <View style={[styles.actionGridIcon, showMoreMenu && styles.actionGridIconActive]}>
                  <IconButton icon="dots-horizontal" size={24} iconColor={showMoreMenu ? OFFICIAL_CHAT_COLORS.textOnPrimary : OFFICIAL_CHAT_COLORS.primary} />
                </View>
                <Text variant="labelSmall" style={showMoreMenu ? styles.actionGridTextActive : styles.actionGridText}>Khác...</Text>
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
                  onPress={openForwardDialog}
                  style={styles.modalButton}
                  contentStyle={styles.modalButtonContent}
                >
                  Chuyển tiếp
                </Button>

                <Button 
                  icon="export-variant" 
                  mode="text" 
                  onPress={() => { handleShare(selectedMessage); setMenuVisible(false); }}
                  style={styles.modalButton}
                  contentStyle={styles.modalButtonContent}
                >
                  Chia sẻ ngoài
                </Button>
              </View>
            )}
          </View>
        </Modal>

        <Modal
          visible={forwardDialogVisible}
          onDismiss={() => setForwardDialogVisible(false)}
          contentContainerStyle={styles.forwardModalContainer}
        >
          <Text variant="titleMedium" style={styles.forwardTitle}>Chuyển tiếp tin nhắn</Text>
          <TextInput
            mode="outlined"
            value={forwardSearch}
            onChangeText={setForwardSearch}
            placeholder="Tìm cuộc trò chuyện"
            style={styles.forwardSearchInput}
          />
          <ScrollView style={styles.forwardList} keyboardShouldPersistTaps="handled">
            {filteredForwardConversations.map((conversation) => {
              const conversationId = String(conversation.conversationId);
              const selected = forwardTargetIds.includes(conversationId);

              return (
                <TouchableOpacity
                  key={conversationId}
                  style={[styles.forwardItem, selected && styles.forwardItemSelected]}
                  onPress={() => handleToggleForwardTarget(conversationId)}
                  activeOpacity={0.8}
                >
                  <Text variant="bodyMedium" style={styles.forwardItemTitle} numberOfLines={1}>
                    {conversation.groupName || conversation.lastSenderName || conversationId}
                  </Text>
                  <Text variant="labelSmall" style={styles.forwardItemMeta} numberOfLines={1}>
                    {conversation.lastMessagePreview || conversationId}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.forwardActions}>
            <Button mode="text" onPress={() => setForwardDialogVisible(false)} disabled={isForwarding}>Hủy</Button>
            <Button mode="contained" onPress={submitForward} loading={isForwarding} disabled={isForwarding || !forwardTargetIds.length}>
              Gửi
            </Button>
          </View>
        </Modal>
      </Portal>

      <ConfirmDialog
        visible={accessDeniedDialogVisible}
        title="Không thể nhắn tin"
        message={`${convInfo?.groupName || 'Người dùng này'} đã hủy kết bạn với bạn. Bạn có muốn xóa cuộc trò chuyện này khỏi danh sách?`}
        confirmText="Có, xóa"
        confirmLoading={isDeletingDeniedConversation}
        disableClose={isDeletingDeniedConversation}
        onCancel={handleDeniedKeepConversation}
        onConfirm={handleDeniedDeleteConversation}
      />

      <ChatMediaPanels
        styles={styles}
        colors={OFFICIAL_CHAT_COLORS}
        fullscreenMedia={fullscreenMedia}
        onCloseFullscreen={() => setFullscreenMedia(null)}
        onSaveFullscreenMedia={handleSaveFullscreenMedia}
        downloadingMedia={downloadingMedia}
      />

      <Portal>
        <GroupInfoModal
          visible={groupInfoDialogVisible}
          onDismiss={() => setGroupInfoDialogVisible(false)}
          isGroup={isGroup}
          groupMembers={groupMembers}
          currentUser={currentUser}
          convInfo={convInfo}
          knownUsers={knownUsers}
          decodedId={decodedId}
          presenceSubtitle={getPresenceSubtitle()}
          groupId={groupId}
          onAddMemberClick={() => setAddMemberDialogVisible(true)}
          onLeaveGroup={handleLeaveGroup}
          onUpdateMemberRole={handleUpdateMemberRole}
          onRemoveMember={handleRemoveMember}
          colors={OFFICIAL_CHAT_COLORS}
        />

        <InviteFriendsModal
          visible={addMemberDialogVisible}
          onDismiss={() => setAddMemberDialogVisible(false)}
          groupId={groupId}
          groupMembers={groupMembers}
          isAddingMember={isAddingMember}
          onAddMemberSubmit={handleAddMemberSubmit}
          colors={OFFICIAL_CHAT_COLORS}
        />
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  messageWrapper: { flexDirection: 'row', marginBottom: 12, maxWidth: '94%' },
  messageWrapperLeft: { alignSelf: 'flex-start' },
  messageWrapperRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatar: { marginRight: 8, marginTop: 4 },
  messageBubble: { padding: 10, borderRadius: 18, minWidth: 50 },
  messageBubbleHighlighted: {
    borderWidth: 2,
    borderColor: OFFICIAL_CHAT_COLORS.textOnPrimary,
  },
  bubbleLeft: { borderBottomLeftRadius: 4 },
  bubbleRight: { borderBottomRightRadius: 4 },
  timeText: { alignSelf: 'flex-end', marginTop: 4, fontSize: 10 },
  typingIndicator: { paddingHorizontal: 20, fontStyle: 'italic', color: OFFICIAL_CHAT_COLORS.primary, marginBottom: 4, height: 20 },
  mentionListContainer: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: OFFICIAL_CHAT_COLORS.primarySoft,
    borderTopWidth: 1,
    borderColor: OFFICIAL_CHAT_COLORS.border,
    maxHeight: 60,
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: OFFICIAL_CHAT_COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: OFFICIAL_CHAT_COLORS.border,
    elevation: 1,
    shadowColor: OFFICIAL_CHAT_COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  replyPreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: OFFICIAL_CHAT_COLORS.primarySoft,
    borderTopWidth: 1,
    borderColor: OFFICIAL_CHAT_COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  replyQuote: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
    maxWidth: 240,
  },
  replyQuoteBar: {
    width: 4,
    backgroundColor: OFFICIAL_CHAT_COLORS.textOnPrimary,
  },
  replyQuoteContent: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  inputArea: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: OFFICIAL_CHAT_COLORS.border,
    backgroundColor: OFFICIAL_CHAT_COLORS.surface,
  },
  input: { flex: 1, minWidth: 0, marginHorizontal: 4, maxHeight: 120, backgroundColor: 'transparent' },
  mediaImage: { width: 220, height: 200, borderRadius: 12, marginBottom: 4 },
  mediaFallback: { width: 190, minHeight: 90, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  mediaVideo: { width: 220, height: 180, borderRadius: 12, overflow: 'hidden', marginBottom: 4, backgroundColor: OFFICIAL_CHAT_COLORS.primary },
  mediaVideoPlayer: { width: '100%', height: '100%' },
  mediaVideoOverlay: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: OFFICIAL_CHAT_COLORS.overlay,
  },
  mediaPlaceholder: { width: 180, height: 100, backgroundColor: OFFICIAL_CHAT_COLORS.placeholderSurface, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  audioMessage: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  docMessage: { flexDirection: 'row', alignItems: 'center', maxWidth: 180 },
  mediaMenu: { position: 'absolute', bottom: 65, left: 0, right: 0, height: 110, borderTopWidth: 0.5, borderColor: OFFICIAL_CHAT_COLORS.border, overflow: 'hidden' },
  mediaMenuContent: { paddingHorizontal: 20, alignItems: 'center', gap: 20 },
  menuItem: { alignItems: 'center' },
  mediaMenuLabel: { color: OFFICIAL_CHAT_COLORS.primary, fontWeight: '600' },
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: OFFICIAL_CHAT_COLORS.surface,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderColor: OFFICIAL_CHAT_COLORS.border,
  },
  pinnedItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  modalContainer: {
    backgroundColor: OFFICIAL_CHAT_COLORS.surface,
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
  emptyComposerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 2,
  },
  rightComposerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  reactionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: -8,
    zIndex: 10,
  },
  reactionPill: {
    backgroundColor: OFFICIAL_CHAT_COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: OFFICIAL_CHAT_COLORS.border,
    marginRight: 4,
    elevation: 2,
    shadowColor: OFFICIAL_CHAT_COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  reactionText: {
    color: OFFICIAL_CHAT_COLORS.textOnPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  bottomSheetContainer: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  menuSheet: {
    backgroundColor: OFFICIAL_CHAT_COLORS.primarySoft,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  emojiList: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: OFFICIAL_CHAT_COLORS.surface,
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
    elevation: 2,
    shadowColor: OFFICIAL_CHAT_COLORS.shadow,
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
    backgroundColor: OFFICIAL_CHAT_COLORS.surface,
    borderRadius: 16,
    paddingVertical: 12,
  },
  actionGridItem: {
    alignItems: 'center',
    flex: 1,
  },
  actionGridIcon: {
    backgroundColor: OFFICIAL_CHAT_COLORS.primarySoft,
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionGridIconActive: {
    backgroundColor: OFFICIAL_CHAT_COLORS.selectedBackground,
  },
  actionGridText: {
    color: OFFICIAL_CHAT_COLORS.primary,
    fontWeight: '600',
  },
  actionGridTextActive: {
    color: OFFICIAL_CHAT_COLORS.primary,
    fontWeight: '800',
  },
  moreMenuContainer: {
    marginTop: 12,
    backgroundColor: OFFICIAL_CHAT_COLORS.surface,
    borderRadius: 16,
    padding: 8,
  },
  forwardModalContainer: {
    backgroundColor: OFFICIAL_CHAT_COLORS.surface,
    margin: 16,
    borderRadius: 16,
    padding: 16,
    maxHeight: '78%',
  },
  forwardTitle: {
    color: OFFICIAL_CHAT_COLORS.primary,
    fontWeight: '700',
    marginBottom: 10,
  },
  forwardSearchInput: {
    marginBottom: 10,
    backgroundColor: OFFICIAL_CHAT_COLORS.surface,
  },
  forwardList: {
    maxHeight: 320,
    marginBottom: 10,
  },
  forwardItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: OFFICIAL_CHAT_COLORS.border,
    marginBottom: 8,
    backgroundColor: OFFICIAL_CHAT_COLORS.primarySoft,
  },
  forwardItemSelected: {
    borderColor: OFFICIAL_CHAT_COLORS.primary,
    backgroundColor: OFFICIAL_CHAT_COLORS.primarySoftStrong,
  },
  forwardItemTitle: {
    color: OFFICIAL_CHAT_COLORS.primary,
    fontWeight: '600',
  },
  forwardItemMeta: {
    color: OFFICIAL_CHAT_COLORS.mutedOnSurface,
    marginTop: 2,
  },
  forwardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: OFFICIAL_CHAT_COLORS.fullscreenBackdrop,
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
    backgroundColor: OFFICIAL_CHAT_COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
});
