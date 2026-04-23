import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, TouchableOpacity, ScrollView, Alert, Share } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from '@/components/shared/SafeLinearGradient';
import { Text, TextInput, IconButton, Avatar, Portal, Modal, Button } from 'react-native-paper';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
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
import { MessageListSkeleton, SkeletonInline, SkeletonMessageBubble } from '@/components/skeleton/Skeleton';
import designColors from '@/constants/colors';

const OFFICIAL_CHAT_PRIMARY = designColors.primary;
const OFFICIAL_CHAT_TEXT = '#ffffff';

const OFFICIAL_CHAT_COLORS = {
  primary: OFFICIAL_CHAT_PRIMARY,
  secondary: designColors.secondary,
  gradient: designColors.gradient,
  header: designColors.secondary,
  headerText: OFFICIAL_CHAT_TEXT,
  mutedHeaderText: 'rgba(255,255,255,0.72)',
  headerIcon: OFFICIAL_CHAT_TEXT,
  messageBackground: designColors.secondary,
  incomingMessageBackground: designColors.surface,
  incomingText: designColors.text,
  chatBackground: designColors.background,
  selectedBackground: designColors.secondary,
  surface: OFFICIAL_CHAT_TEXT,
  textOnPrimary: OFFICIAL_CHAT_TEXT,
  messageText: OFFICIAL_CHAT_TEXT,
  mutedTextOnPrimary: `${OFFICIAL_CHAT_TEXT}b8`,
  mutedOnSurface: designColors.textSecondary,
  divider: '#cbd5e1',
  placeholderSurface: '#e0f7ff',
  shadow: designColors.shadow,
  fullscreenBackdrop: '#000000',
  primarySoft: 'rgba(10,207,254,0.12)',
  primarySoftStrong: 'rgba(73,90,255,0.16)',
  border: '#dbeafe',
  overlay: 'rgba(15,23,42,0.58)',
  callAction: OFFICIAL_CHAT_TEXT,
};

const CHAT_DETAIL_CONVERSATIONS_CACHE_STALE_MS = 60000;
let chatDetailConversationsCache: any[] = [];
let chatDetailConversationsCacheLoadedAt = 0;
const chatDetailGroupMembersCache = new Map<string, { items: any[]; loadedAt: number }>();

const getPeerIdFromConversationId = (conversationId?: string) => {
  if (!conversationId) return '';
  const normalized = String(conversationId).trim();

  if (/^dm:/i.test(normalized)) {
    return normalized.replace(/^dm:/i, '').trim();
  }

  if (/^dm#/i.test(normalized)) {
    const participantIds = normalized
      .replace(/^dm#/i, '')
      .split('#')
      .map((value) => value.trim())
      .filter(Boolean);
    return participantIds[participantIds.length - 1] || '';
  }

  return normalized;
};

const getCachedConversationInfo = (conversationId: string) => {
  if (!conversationId || !chatDetailConversationsCache.length) {
    return null;
  }

  return chatDetailConversationsCache.find((item: any) => item?.conversationId === conversationId) ?? null;
};

const resolveConversationAvatarUrl = (conversation?: any): string | null => {
  const candidates = [
    conversation?.avatarUrl,
    conversation?.groupAvatarUrl,
    conversation?.peerAvatarUrl,
    conversation?.targetAvatarUrl,
    conversation?.avatarAsset?.resolvedUrl,
    conversation?.groupAvatarAsset?.resolvedUrl,
    conversation?.peerAvatarAsset?.resolvedUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return convertToS3Url(candidate.trim());
    }
  }

  return null;
};

const formatLastSeenSubtitle = (lastSeenAt?: string | null) => {
  const ts = Date.parse(String(lastSeenAt || ''));
  if (Number.isNaN(ts)) {
    return 'Ngoại tuyến';
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMinutes < 1) {
    return 'Vừa hoạt động';
  }

  if (diffMinutes < 60) {
    return `Hoạt động ${diffMinutes} phút trước`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Hoạt động ${diffHours} giờ trước`;
  }

  return `Hoạt động ${Math.floor(diffHours / 24)} ngày trước`;
};

const LazyVideo = React.lazy(async () => {
  const module = await import('expo-av');
  return { default: module.Video as React.ComponentType<any> };
});

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
  'Tá»‡p Ä‘Ã­nh kÃ¨m'
);

const getReplyTargetId = (item: MessageWithLegacyMedia): string | null => (
  item.replyTo || item.replyToMessageId || null
);

const getReplySnippet = (item?: any): string => {
  if (!item) return 'Báº¥m Ä‘á»ƒ tÃ¬m tin nháº¯n gá»‘c';
  const text = parseMessageContent(item.content);
  if (text.trim()) return text.trim();
  if (item.type === 'IMAGE') return 'áº¢nh';
  if (item.type === 'VIDEO') return 'Video';
  if (item.type === 'AUDIO') return 'Tin nháº¯n thoáº¡i';
  if (item.type === 'DOC') return getMessageAttachmentLabel(item);
  return 'Tin nháº¯n Ä‘Ã­nh kÃ¨m';
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
MemoMessageWrapper.displayName = 'MemoMessageWrapper';

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
  const { lastEndedCall } = useWebRTCContext();

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
  const recordingRef = useRef<any>(null);
  
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [forwardDialogVisible, setForwardDialogVisible] = useState(false);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwardTargetIds, setForwardTargetIds] = useState<string[]>([]);
  const [isForwarding, setIsForwarding] = useState(false);
  const [convInfo, setConvInfo] = useState<any>(() => getCachedConversationInfo(decodedId));
  const [allConversations, setAllConversations] = useState<any[]>(() => chatDetailConversationsCache);
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
        Alert.alert('Lá»—i', error?.message || 'KhÃ´ng thá»ƒ xÃ³a cuá»™c trÃ² chuyá»‡n lÃºc nÃ y.');
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
    hasOlderMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
    deleteMessage,
    updateMessage,
    forwardMessage,
  } = useChatConversation(decodedId, currentUser, chatOptions);

  const groupMemberCount = groupMembers.length;

  const getPresenceSubtitle = useCallback(() => {
    if (decodedId?.startsWith('GRP#') || decodedId?.startsWith('group:')) {
      if (groupMemberCount === 0) return 'Đang cập nhật...';
      return `${groupMemberCount} thành viên`;
    }

    if (!isReady) return 'Đang kết nối...';

    const peerId = getPeerIdFromConversationId(decodedId);
    const presence = presenceByUser[String(peerId)];

    if (!presence) return 'Ngoại tuyến';
    if (presence.isActive) return 'Đang hoạt động';

    return formatLastSeenSubtitle(presence.lastSeenAt);
  }, [groupMemberCount, isReady, decodedId, presenceByUser]);

  const handleLeaveGroup = useCallback(async (currentGroupId: string) => {
    if (!currentGroupId) return;
    try {
      await ApiClient.post(`/groups/${currentGroupId}/leave`);
      setGroupInfoDialogVisible(false);
      router.replace(chatListPath as any);
    } catch (e: any) {
      Alert.alert('Lá»—i', e?.message || 'KhÃ´ng thá»ƒ rá»i nhÃ³m. (Chá»§ nhÃ³m khÃ´ng thá»ƒ tá»± rá»i)');
    }
  }, [router, chatListPath]);

  const handleRemoveMember = useCallback(async (currentGroupId: string, userId: string) => {
    if (!currentGroupId) return;
    try {
      await ApiClient.patch(`/groups/${currentGroupId}/members/${userId}`, { action: 'remove' });
      setGroupMembers(prev => prev.filter(m => m.userId !== userId));
      Alert.alert('ThÃ nh cÃ´ng', 'ÄÃ£ xÃ³a thÃ nh viÃªn khá»i nhÃ³m.');
    } catch (e: any) {
      Alert.alert('Lá»—i', e?.message || 'KhÃ´ng thá»ƒ xÃ³a thÃ nh viÃªn.');
    }
  }, []);

  const handleUpdateMemberRole = useCallback(async (currentGroupId: string, targetUserId: string, currentRole: string) => {
    const newRole = currentRole === 'OFFICER' ? 'MEMBER' : 'OFFICER';
    try {
      const res = await ApiClient.patch(`/groups/${currentGroupId}/members/${targetUserId}`, { action: 'update', roleInGroup: newRole });
      setGroupMembers(prev => prev.map(m => m.userId === targetUserId ? res : m));
      Alert.alert('ThÃ nh cÃ´ng', `ÄÃ£ Ä‘á»•i quyá»n thÃ nh ${newRole === 'OFFICER' ? 'PhÃ³ nhÃ³m' : 'ThÃ nh viÃªn'}.`);
    } catch (e: any) {
      Alert.alert('Lá»—i', e?.message || 'KhÃ´ng thá»ƒ Ä‘á»•i quyá»n.');
    }
  }, []);

  const handleUpdateGroupAvatar = useCallback(async () => {
    if (!groupId) return;
    
    // Check permission
    const isOwner = convInfo?.ownerId === currentUser?.sub;
    if (!isOwner) {
      Alert.alert('Chá»‰ Quáº£n trá»‹ viÃªn má»›i Ä‘Æ°á»£c Ä‘á»•i áº£nh nhÃ³m.');
      return;
    }

    const ImagePicker = await import('expo-image-picker');
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
        Alert.alert('ThÃ nh cÃ´ng', 'ÄÃ£ cáº­p nháº­t áº£nh Ä‘áº¡i diá»‡n nhÃ³m.');
      } catch (error: any) {
        Alert.alert('Lá»—i', error?.message || 'KhÃ´ng thá»ƒ cáº­p nháº­t áº£nh Ä‘áº¡i diá»‡n.');
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
      Alert.alert('ThÃ nh cÃ´ng', 'ÄÃ£ thÃªm thÃ nh viÃªn.');
    } catch (e: any) {
      Alert.alert('Lá»—i', e?.message || 'KhÃ´ng thá»ƒ thÃªm thÃ nh viÃªn. (Báº¡n khÃ´ng cÃ³ quyá»n hoáº·c ngÆ°á»i dÃ¹ng Ä‘Ã£ cÃ³ trong nhÃ³m)');
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
  const latestMessageKey = dedupedMessages[0]?.id ? String(dedupedMessages[0].id) : '';

  const scrollToLatestMessage = useCallback((animated = false) => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated });
  }, []);

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

    const cachedConversationInfo = getCachedConversationInfo(decodedId);
    if (cachedConversationInfo) {
      setConvInfo(cachedConversationInfo);
    }

    const hasFreshConversationCache =
      chatDetailConversationsCache.length > 0 &&
      Date.now() - chatDetailConversationsCacheLoadedAt < CHAT_DETAIL_CONVERSATIONS_CACHE_STALE_MS;

    if (hasFreshConversationCache) {
      setAllConversations(chatDetailConversationsCache);
      const found = chatDetailConversationsCache.find((c: any) => c.conversationId === decodedId);
      if (found) setConvInfo(found);
    }
    
    if (!hasFreshConversationCache) {
      ApiClient.get('/conversations')
      .then((convs) => {
        const nextConversations = Array.isArray(convs) ? convs : [];
        chatDetailConversationsCache = nextConversations;
        chatDetailConversationsCacheLoadedAt = Date.now();
        setAllConversations(nextConversations);
        const found = nextConversations.find((c: any) => c.conversationId === decodedId);
        if (found) setConvInfo(found);
      })
      .catch(console.error);
    }

    if (isGroup && groupId) {
      const cachedMembers = chatDetailGroupMembersCache.get(groupId);
      const hasFreshMemberCache =
        cachedMembers &&
        Date.now() - cachedMembers.loadedAt < CHAT_DETAIL_CONVERSATIONS_CACHE_STALE_MS;

      if (hasFreshMemberCache) {
        setGroupMembers(cachedMembers.items);
        return;
      }

      ApiClient.get(`/groups/${groupId}/members`)
        .then((res) => {
          const nextMembers = Array.isArray(res) ? res : [];
          chatDetailGroupMembersCache.set(groupId, {
            items: nextMembers,
            loadedAt: Date.now(),
          });
          setGroupMembers(nextMembers);
        })
        .catch(console.error);
    }
  }, [decodedId, groupId, isGroup]);

  // Auto-mark as read when ready
  useEffect(() => {
    if (isReady) {
      markRead();
    }
  }, [isReady, markRead]);

  // Inverted FlatList keeps the newest message at offset 0.
  useEffect(() => {
    if (!latestMessageKey || isLoadingHistory) {
      return;
    }

    scrollToLatestMessage(false);
    const layoutTick = setTimeout(() => scrollToLatestMessage(false), 80);
    const mediaTick = setTimeout(() => scrollToLatestMessage(false), 240);

    return () => {
      clearTimeout(layoutTick);
      clearTimeout(mediaTick);
    };
  }, [decodedId, isLoadingHistory, latestMessageKey, scrollToLatestMessage]);

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
    sendMessage('ðŸ‘', createClientMessageId(), 'TEXT', undefined, replyToMessage?.id);
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
      Alert.alert('ThÃ´ng bÃ¡o', 'Vui lÃ²ng chá»n Ã­t nháº¥t má»™t cuá»™c trÃ² chuyá»‡n.');
      return;
    }

    try {
      setIsForwarding(true);
      await forwardMessage(selectedMessage.id, forwardTargetIds);
      setForwardDialogVisible(false);
      setForwardTargetIds([]);
      setForwardSearch('');
      Alert.alert('ThÃ nh cÃ´ng', 'ÄÃ£ chuyá»ƒn tiáº¿p tin nháº¯n.');
    } catch (error: any) {
      Alert.alert('Lá»—i', error?.message || 'KhÃ´ng thá»ƒ chuyá»ƒn tiáº¿p tin nháº¯n lÃºc nÃ y.');
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

  // â”€â”€ Media Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const pickImage = async () => {
    const ImagePicker = await import('expo-image-picker');
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
      } catch {
        Alert.alert('Lá»—i', 'KhÃ´ng thá»ƒ gá»­i tá»‡p. Vui lÃ²ng thá»­ láº¡i.');
      }
    }
    setShowMediaMenu(false);
  };

  const takePhoto = async () => {
    const ImagePicker = await import('expo-image-picker');
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
    const ImagePicker = await import('expo-image-picker');
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
      } catch {
        Alert.alert('Lá»—i', 'KhÃ´ng thá»ƒ gá»­i video. Vui lÃ²ng thá»­ láº¡i.');
      }
    }
    setShowMediaMenu(false);
  };

  const takeVideo = async () => {
    const ImagePicker = await import('expo-image-picker');
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
      } catch {
        Alert.alert('Lá»—i', 'KhÃ´ng thá»ƒ quay/gá»­i video. Vui lÃ²ng thá»­ láº¡i.');
      }
    }
    setShowMediaMenu(false);
  };

  const pickDocument = async () => {
    try {
      const DocumentPicker = await import('expo-document-picker');
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
      Alert.alert('ThÃ´ng bÃ¡o', 'TÃ­nh nÄƒng chá»n tá»‡p khÃ´ng kháº£ dá»¥ng trÃªn mÃ´i trÆ°á»ng nÃ y.');
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
            throw new Error('Thiáº¿t bá»‹ hiá»‡n táº¡i chÆ°a há»— trá»£ vá»‹ trÃ­.');
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
          `Vá»‹ trÃ­ hiá»‡n táº¡i: ${mapUrl}`,
          createClientMessageId(),
          'TEXT',
          undefined,
          replyToMessage?.id,
        );
        setReplyToMessage(null);
        setShowMediaMenu(false);
      } catch (error: any) {
        Alert.alert('Lá»—i vá»‹ trÃ­', error?.message || 'KhÃ´ng thá»ƒ láº¥y vá»‹ trÃ­ hiá»‡n táº¡i.');
      }
    })();
  };

  const startRecording = async () => {
    try {
      const { Audio } = await import('expo-av');
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
      Alert.alert('ThÃ´ng bÃ¡o', 'KhÃ´ng tÃ¬m tháº¥y Ä‘Æ°á»ng dáº«n tá»‡p Ä‘Ã­nh kÃ¨m.');
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
      Alert.alert('KhÃ´ng thá»ƒ lÆ°u', error?.message || 'KhÃ´ng thá»ƒ lÆ°u media lÃºc nÃ y.');
    } finally {
      setDownloadingMedia(false);
    }
  }, [fullscreenMedia]);

  const handleJumpToMessage = useCallback((messageId: string) => {
    const index = dedupedMessages.findIndex((item: any) => item.id === messageId);

    if (index < 0) {
      Alert.alert('ThÃ´ng bÃ¡o', 'KhÃ´ng tÃ¬m tháº¥y tin nháº¯n gá»‘c trong há»™i thoáº¡i hiá»‡n táº¡i.');
      return;
    }

    flatListRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.5,
    });
    setHighlightedMessageId(messageId);
  }, [dedupedMessages]);

  const renderReplyQuote = useCallback((item: any, isMe: boolean) => {
    const replyTargetId = getReplyTargetId(item);
    if (!replyTargetId) return null;

    const originalMessage = messagesById.get(replyTargetId);
    const quoteTextColor = isMe ? OFFICIAL_CHAT_COLORS.textOnPrimary : OFFICIAL_CHAT_COLORS.primary;
    const quoteMutedColor = isMe ? OFFICIAL_CHAT_COLORS.mutedTextOnPrimary : OFFICIAL_CHAT_COLORS.mutedOnSurface;
    const senderName = originalMessage?.senderName || 'Tin nháº¯n gá»‘c';

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={[
          styles.replyQuote,
          { backgroundColor: isMe ? 'rgba(255,255,255,0.16)' : OFFICIAL_CHAT_COLORS.primarySoft },
        ]}
        onPress={() => handleJumpToMessage(replyTargetId)}
      >
        <View style={[styles.replyQuoteBar, { backgroundColor: isMe ? OFFICIAL_CHAT_COLORS.textOnPrimary : OFFICIAL_CHAT_COLORS.primary }]} />
        <View style={styles.replyQuoteContent}>
          <Text
            variant="labelSmall"
            numberOfLines={1}
            style={{ color: quoteTextColor, fontWeight: '700' }}
          >
            {senderName}
          </Text>
          <Text
            variant="bodySmall"
            numberOfLines={1}
            style={{ color: quoteMutedColor }}
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
      Alert.alert('KhÃ´ng thá»ƒ gá»­i tá»‡p', error?.message || 'KÃ©o tháº£ tá»‡p tháº¥t báº¡i.');
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
    const contentColor = isMe ? OFFICIAL_CHAT_COLORS.textOnPrimary : OFFICIAL_CHAT_COLORS.incomingText;
    const mutedContentColor = isMe ? OFFICIAL_CHAT_COLORS.mutedTextOnPrimary : OFFICIAL_CHAT_COLORS.mutedOnSurface;
    
    if (item.deletedAt) {
      return (
        <Text style={{ color: mutedContentColor, fontStyle: 'italic' }}>
          Tin nháº¯n Ä‘Ã£ bá»‹ thu há»“i
        </Text>
      );
    }

    if (item.type === 'IMAGE') {
      if (!attachmentUrl) {
        return (
          <View style={styles.mediaFallback}>
            <IconButton icon="image-off" iconColor={contentColor} size={24} />
            <Text style={{ color: contentColor }}>KhÃ´ng tÃ¬m tháº¥y áº£nh</Text>
          </View>
        );
      }

      return (
        <TouchableOpacity activeOpacity={0.9} onPress={() => setFullscreenMedia({ uri: attachmentUrl, type: 'image' })}>
          <Image
            source={{ uri: attachmentUrl }}
            style={styles.mediaImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            placeholder={{ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }}
            transition={160}
          />
        </TouchableOpacity>
      );
    }

    if (item.type === 'VIDEO') {
      if (!attachmentUrl) {
        return (
          <View style={styles.mediaFallback}>
            <IconButton icon="video-off" iconColor={contentColor} size={24} />
            <Text style={{ color: contentColor }}>KhÃ´ng tÃ¬m tháº¥y video</Text>
          </View>
        );
      }

      return (
        <TouchableOpacity style={styles.mediaVideo} activeOpacity={0.85} onPress={() => setFullscreenMedia({ uri: attachmentUrl, type: 'video' })}>
          <React.Suspense fallback={<View style={styles.mediaVideoPlayer} />}>
            <LazyVideo
              source={{ uri: attachmentUrl }}
              style={styles.mediaVideoPlayer}
              resizeMode="cover"
              shouldPlay
              isMuted
              isLooping
            />
          </React.Suspense>
          <View pointerEvents="none" style={styles.mediaVideoOverlay}>
            <IconButton icon="arrow-expand" iconColor={OFFICIAL_CHAT_COLORS.textOnPrimary} size={24} />
          </View>
        </TouchableOpacity>
      );
    }

    if (item.type === 'AUDIO') {
      return (
        <TouchableOpacity style={styles.audioMessage} onPress={() => handleOpenAttachment(item)}>
          <IconButton icon="play" iconColor={contentColor} size={24} />
          <Text style={{ color: contentColor }}>Tin nháº¯n thoáº¡i</Text>
        </TouchableOpacity>
      );
    }

    if (item.type === 'DOC') {
      return (
        <TouchableOpacity style={styles.docMessage} onPress={() => handleOpenAttachment(item)}>
          <IconButton icon="file-document" iconColor={contentColor} size={24} />
          <Text style={{ color: contentColor }} numberOfLines={1}>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isMe ? OFFICIAL_CHAT_COLORS.primarySoftStrong : OFFICIAL_CHAT_COLORS.incomingMessageBackground, padding: 8, borderRadius: 8, marginVertical: 4 }}>
             <MaterialCommunityIcons name={isVideo ? 'video' : 'phone'} size={20} color={isMissed ? designColors.danger : designColors.success} style={{ marginRight: 8 }} />
             <View>
               <Text style={{ fontWeight: '700', color: isMissed ? designColors.danger : (isMe ? OFFICIAL_CHAT_COLORS.textOnPrimary : designColors.text) }}>
                 {direction === 'INCOMING' 
                    ? (isMissed ? 'Cuá»™c gá»i nhá»¡' : 'Cuá»™c gá»i Ä‘áº¿n') 
                    : (isMissed ? 'Cuá»™c gá»i Ä‘i chÆ°a Ä‘Æ°á»£c tráº£ lá»i' : 'Cuá»™c gá»i Ä‘i')}
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
      <Text style={{ color: contentColor, fontSize: 15, lineHeight: 20 }}>
        {parseMessageContent(item.content)}
      </Text>
    );
  };

  const renderMessageBubble = (item: any) => {
    const isMe = currentUser?.sub === item.senderId;
    const isVisualMedia = item.type === 'IMAGE' || item.type === 'VIDEO';

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
              isVisualMedia ? styles.messageBubbleMedia : isMe ? styles.messageBubbleOwn : styles.messageBubbleOther,
              isMe ? styles.bubbleRight : styles.bubbleLeft,
              !isVisualMedia && item.id === highlightedMessageId && styles.messageBubbleHighlighted,
              item.isOptimistic && { opacity: 0.6 }
            ]}>
            {isMe && !isVisualMedia ? (
              <LinearGradient
                colors={designColors.gradient.primary}
                start={designColors.gradient.start}
                end={designColors.gradient.end}
                style={StyleSheet.absoluteFillObject}
              />
            ) : null}
            {!isMe && item.isGroup && (
              <Text variant="labelSmall" style={{ color: OFFICIAL_CHAT_COLORS.primary, marginBottom: 2, fontWeight: '700' }}>
                {item.senderName}
              </Text>
            )}
            
            {renderReplyQuote(item, isMe)}
            {renderMessageContent(item)}
            
            <View style={[styles.bubbleFooter, isVisualMedia ? styles.mediaBubbleFooter : null]}>
              <Text
                variant="labelSmall"
                style={[
                  styles.timeText,
                  {
                    color: isVisualMedia
                      ? OFFICIAL_CHAT_COLORS.textOnPrimary
                      : isMe
                        ? OFFICIAL_CHAT_COLORS.mutedTextOnPrimary
                        : OFFICIAL_CHAT_COLORS.mutedOnSurface,
                  },
                ]}
              >
                {item.isOptimistic ? 'Äang gá»­i...' : new Date(item.sentAt || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              {isMe && !item.isOptimistic ? (
                <MaterialCommunityIcons
                  name="check-all"
                  size={13}
                  color={isVisualMedia ? OFFICIAL_CHAT_COLORS.textOnPrimary : OFFICIAL_CHAT_COLORS.mutedTextOnPrimary}
                  style={styles.sentCheckIcon}
                />
              ) : null}
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
      // Táº¡m thá»i hiá»ƒn thá»‹ Alert thay vÃ¬ Clipboard Ä‘á»ƒ trÃ¡nh lá»—i Native Module
      Alert.alert('ÄÃ£ sao chÃ©p (Táº¡m thá»i)', textToCopy);
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
        Alert.alert('ThÃ´ng bÃ¡o', 'Báº¡n chá»‰ cÃ³ thá»ƒ ghim tá»‘i Ä‘a 5 tin nháº¯n.');
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
    const peerId = getPeerIdFromConversationId(decodedId);
    const peerPresence = !isGroup ? presenceByUser[String(peerId)] : null;
    const headerAvatarUrl = resolveConversationAvatarUrl(convInfo);
  
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
    <SafeAreaView style={styles.screen}>
      <ChatDetailHeader
        styles={styles}
        colors={OFFICIAL_CHAT_COLORS}
        isGroup={isGroup}
        headerAvatarUrl={headerAvatarUrl}
        conversationDisplayName={convInfo?.groupName || (isGroup ? 'Nhóm trò chuyện' : (knownUsers[peerId] || 'Tin nhắn'))}
        subtitleText={getPresenceSubtitle()}
        isPeerOnline={Boolean(peerPresence?.isActive)}
        onBack={() => router.replace(chatListPath as any)}
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
        style={styles.chatArea}
        behavior={keyboardBehavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {isLoadingHistory ? (
          <View style={styles.center}>
            <MessageListSkeleton count={8} />
            <Text style={{ marginTop: 8, color: OFFICIAL_CHAT_COLORS.mutedOnSurface }}>Đang tải tin nhắn...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={dedupedMessages}
            inverted={true}
            style={styles.messageList}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            updateCellsBatchingPeriod={40}
            removeClippedSubviews={Platform.OS !== 'web'}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderMessage}
            onEndReachedThreshold={0.35}
            onEndReached={() => {
              if (hasOlderMessages && !isLoadingOlderMessages) {
                void loadOlderMessages();
              }
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={styles.listContent}
            onLayout={() => scrollToLatestMessage(false)}
            ListFooterComponent={
              isLoadingOlderMessages ? (
                <View style={styles.loadOlderSkeleton}>
                  <SkeletonMessageBubble />
                </View>
              ) : null
            }
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
              scrollToLatestMessage(false);
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
            contentStyle={{
              backgroundColor: '#f1f5f8',
              borderRadius: 20,
              paddingHorizontal: 12,
              color: OFFICIAL_CHAT_COLORS.incomingText,
              minHeight: 40,
            }}
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
                <IconButton icon="camera" mode="contained" containerColor={OFFICIAL_CHAT_COLORS.primary} iconColor={OFFICIAL_CHAT_COLORS.textOnPrimary} onPress={takePhoto} />
                <Text variant="labelSmall" style={styles.mediaMenuLabel}>Chup anh</Text>
              </View>
              <View style={styles.menuItem}>
                <IconButton icon="image" mode="contained" containerColor={OFFICIAL_CHAT_COLORS.primary} iconColor={OFFICIAL_CHAT_COLORS.textOnPrimary} onPress={pickImage} />
                <Text variant="labelSmall" style={styles.mediaMenuLabel}>Anh</Text>
              </View>
              <View style={styles.menuItem}>
                <IconButton icon="file-document" mode="contained" containerColor={OFFICIAL_CHAT_COLORS.primary} iconColor={OFFICIAL_CHAT_COLORS.textOnPrimary} onPress={pickDocument} />
                <Text variant="labelSmall" style={styles.mediaMenuLabel}>TÃ i liá»‡u</Text>
              </View>
              <View style={styles.menuItem}>
                <IconButton icon="map-marker" mode="contained" containerColor={OFFICIAL_CHAT_COLORS.primary} iconColor={OFFICIAL_CHAT_COLORS.textOnPrimary} onPress={sendLocation} />
                <Text variant="labelSmall" style={styles.mediaMenuLabel}>Vá»‹ trÃ­</Text>
              </View>
              <View style={styles.menuItem}>
                <IconButton icon="video-outline" mode="contained" containerColor={OFFICIAL_CHAT_COLORS.primary} iconColor={OFFICIAL_CHAT_COLORS.textOnPrimary} onPress={takeVideo} />
                <Text variant="labelSmall" style={styles.mediaMenuLabel}>Quay video</Text>
              </View>
              <View style={styles.menuItem}>
                <IconButton icon="filmstrip" mode="contained" containerColor={OFFICIAL_CHAT_COLORS.primary} iconColor={OFFICIAL_CHAT_COLORS.textOnPrimary} onPress={pickVideo} />
                <Text variant="labelSmall" style={styles.mediaMenuLabel}>Video thÆ° viá»‡n</Text>
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
              {['ðŸ‘', 'â¤ï¸', 'ðŸ˜‚', 'ðŸ˜®', 'ðŸ˜¢', 'ðŸ˜¡'].map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => { handleReaction(selectedMessage, emoji); setMenuVisible(false); }} style={styles.emojiCircle}>
                  <Text style={{ fontSize: 28 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.actionGridItem} onPress={handleReply}>
                <View style={styles.actionGridIcon}><IconButton icon="reply" size={24} iconColor={OFFICIAL_CHAT_COLORS.primary} /></View>
                <Text variant="labelSmall" style={styles.actionGridText}>Tráº£ lá»i</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionGridItem} onPress={handleCopy}>
                <View style={styles.actionGridIcon}><IconButton icon="content-copy" size={24} iconColor={OFFICIAL_CHAT_COLORS.primary} /></View>
                <Text variant="labelSmall" style={styles.actionGridText}>Sao chÃ©p</Text>
              </TouchableOpacity>

              {currentUser?.sub === selectedMessage?.senderId && (
                <TouchableOpacity style={styles.actionGridItem} onPress={handleEdit}>
                  <View style={styles.actionGridIcon}><IconButton icon="pencil" size={24} iconColor={OFFICIAL_CHAT_COLORS.primary} /></View>
                  <Text variant="labelSmall" style={styles.actionGridText}>Sá»­a</Text>
                </TouchableOpacity>
              )}
              
              {currentUser?.sub === selectedMessage?.senderId ? (
                <TouchableOpacity style={styles.actionGridItem} onPress={handleRecall}>
                  <View style={styles.actionGridIcon}><IconButton icon="delete-sweep" size={24} iconColor={OFFICIAL_CHAT_COLORS.primary} /></View>
                  <Text variant="labelSmall" style={styles.actionGridText}>Thu há»“i</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.actionGridItem} onPress={() => { setMenuVisible(false); Alert.alert('ThÃ´ng bÃ¡o', 'TÃ­nh nÄƒng xÃ³a Ä‘ang Ä‘Æ°á»£c cáº­p nháº­t.'); }}>
                  <View style={styles.actionGridIcon}><IconButton icon="delete" size={24} iconColor={OFFICIAL_CHAT_COLORS.primary} /></View>
                  <Text variant="labelSmall" style={styles.actionGridText}>XÃ³a</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.actionGridItem} onPress={() => setShowMoreMenu(!showMoreMenu)}>
                <View style={[styles.actionGridIcon, showMoreMenu && styles.actionGridIconActive]}>
                  <IconButton icon="dots-horizontal" size={24} iconColor={showMoreMenu ? OFFICIAL_CHAT_COLORS.textOnPrimary : OFFICIAL_CHAT_COLORS.primary} />
                </View>
                <Text variant="labelSmall" style={showMoreMenu ? styles.actionGridTextActive : styles.actionGridText}>KhÃ¡c...</Text>
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
                  Ghim tin nháº¯n
                </Button>

                <Button 
                  icon="share-outline" 
                  mode="text" 
                  onPress={openForwardDialog}
                  style={styles.modalButton}
                  contentStyle={styles.modalButtonContent}
                >
                  Chuyá»ƒn tiáº¿p
                </Button>

                <Button 
                  icon="export-variant" 
                  mode="text" 
                  onPress={() => { handleShare(selectedMessage); setMenuVisible(false); }}
                  style={styles.modalButton}
                  contentStyle={styles.modalButtonContent}
                >
                  Chia sáº» ngoÃ i
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
          <Text variant="titleMedium" style={styles.forwardTitle}>Chuyá»ƒn tiáº¿p tin nháº¯n</Text>
          <TextInput
            mode="outlined"
            value={forwardSearch}
            onChangeText={setForwardSearch}
            placeholder="TÃ¬m cuá»™c trÃ² chuyá»‡n"
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
            <Button mode="text" onPress={() => setForwardDialogVisible(false)} disabled={isForwarding}>Há»§y</Button>
            {isForwarding ? <SkeletonInline width={56} height={12} /> : null}
            <Button mode="contained" onPress={submitForward} disabled={isForwarding || !forwardTargetIds.length}>
              Gá»­i
            </Button>
          </View>
        </Modal>
      </Portal>

      <ConfirmDialog
        visible={accessDeniedDialogVisible}
        title="KhÃ´ng thá»ƒ nháº¯n tin"
        message={`${convInfo?.groupName || 'NgÆ°á»i dÃ¹ng nÃ y'} Ä‘Ã£ há»§y káº¿t báº¡n vá»›i báº¡n. Báº¡n cÃ³ muá»‘n xÃ³a cuá»™c trÃ² chuyá»‡n nÃ y khá»i danh sÃ¡ch?`}
        confirmText="CÃ³, xÃ³a"
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
  screen: { flex: 1, backgroundColor: OFFICIAL_CHAT_COLORS.header },
  chatArea: { flex: 1, backgroundColor: OFFICIAL_CHAT_COLORS.chatBackground },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: OFFICIAL_CHAT_COLORS.chatBackground },
  headerAvatarWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  headerBackButton: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    zIndex: 2,
    elevation: 2,
  },
  headerAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  onlineDotSmall: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: OFFICIAL_CHAT_COLORS.header,
  },
  callActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  messageList: { flex: 1, backgroundColor: OFFICIAL_CHAT_COLORS.chatBackground },
  listContent: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 28 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  loadOlderSkeleton: { paddingVertical: 8, transform: [{ scaleY: -1 }] },
  messageWrapper: { flexDirection: 'row', marginBottom: 10, maxWidth: '88%' },
  messageWrapperLeft: { alignSelf: 'flex-start' },
  messageWrapperRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatar: { marginRight: 8, marginTop: 2, backgroundColor: OFFICIAL_CHAT_COLORS.primary },
  messageBubble: {
    overflow: 'hidden',
    minWidth: 54,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 8,
    shadowColor: '#12324f',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 1,
  },
  messageBubbleOwn: { backgroundColor: OFFICIAL_CHAT_COLORS.messageBackground },
  messageBubbleOther: { backgroundColor: OFFICIAL_CHAT_COLORS.incomingMessageBackground },
  messageBubbleMedia: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  messageBubbleHighlighted: {
    borderWidth: 2,
    borderColor: 'rgba(73,90,255,0.35)',
  },
  bubbleLeft: { borderTopLeftRadius: 5 },
  bubbleRight: { borderTopRightRadius: 5 },
  timeText: { alignSelf: 'flex-end', fontSize: 10, fontWeight: '600' },
  sentCheckIcon: { marginLeft: 4, marginTop: 1 },
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
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(10,63,104,0.12)',
    backgroundColor: OFFICIAL_CHAT_COLORS.surface,
  },
  input: { flex: 1, minWidth: 0, marginHorizontal: 2, maxHeight: 120, backgroundColor: 'transparent' },
  mediaImage: {
    width: 220,
    height: 200,
    borderRadius: 14,
    backgroundColor: '#d8e2ea',
    shadowColor: '#12324f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
  },
  mediaFallback: { width: 190, minHeight: 90, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  mediaVideo: {
    width: 220,
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#082f49',
    shadowColor: '#12324f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
  },
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
  mediaBubbleFooter: {
    alignSelf: 'flex-end',
    borderRadius: 999,
    marginTop: -30,
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(5, 28, 48, 0.52)',
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
    fontWeight: '700',
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
