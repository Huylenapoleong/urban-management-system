import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image as RNImage,
  Share,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type { UserRole } from "@urban/shared-constants";
import type { GroupMembership, GroupMetadata, MessageItem, UserProfile } from "@urban/shared-types";
import Avatar from "@/components/Avatar";
import colors from "@/constants/colors";
import { convertToS3Url } from "@/constants/s3";
import { useAuth } from "@/providers/AuthProvider";
import {
  fuzzyScore,
  getRenderMessage,
  normalizeSearchText,
  parseConversationId,
} from "@/features/chat/citizen/chat-utils";
import { useCitizenConversation } from "@/features/chat/citizen/useCitizenConversation";
import { emitChatAck } from "@/services/chat-socket";
import { getGroup, listMembers, updateGroup } from "@/services/api/group.api";
import { getUserById } from "@/services/api/user.api";
import { uploadMedia } from "@/services/api/upload.api";

type GroupParticipant = GroupMembership & {
  profile?: UserProfile;
};

function getAudienceMeta(role?: UserRole) {
  if (role === "CITIZEN") {
    return { label: "Nguoi dan", color: "#15803d" };
  }

  return { label: "Can bo", color: "#dc2626" };
}

function formatChatTimestamp(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const flatListRef = useRef<FlatList<MessageItem>>(null);
  const previousMessageCountRef = useRef(0);

  const conversationId = parseConversationId(params.id);
  const isGroupConversation = Boolean(conversationId?.startsWith("group:"));
  const groupId = isGroupConversation ? conversationId?.replace(/^group:/, "") : undefined;
  const [text, setText] = useState("");
  const [menuVisible, setMenuVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupMetadata | null>(null);
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [pickingImage, setPickingImage] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(null);
  const [downloadingImage, setDownloadingImage] = useState(false);

  const { messages, loading, sending, error, subtitle, sendMessage, setTyping } =
    useCitizenConversation({
      conversationId,
      currentUserId: user?.sub,
    });

  const loadGroupDetails = useCallback(async () => {
    if (!groupId) {
      setGroup(null);
      setParticipants([]);
      setGroupError(null);
      return;
    }

    setGroupLoading(true);

    try {
      const [groupData, memberData] = await Promise.all([getGroup(groupId), listMembers(groupId)]);
      const userLookups = await Promise.allSettled(memberData.map((member) => getUserById(member.userId)));

      const nextParticipants = memberData
        .map((member, index) => ({
          ...member,
          profile: userLookups[index]?.status === "fulfilled" ? userLookups[index].value : undefined,
        }))
        .sort((left, right) => {
          const leftAudience = getAudienceMeta(left.profile?.role);
          const rightAudience = getAudienceMeta(right.profile?.role);

          if (leftAudience.color !== rightAudience.color) {
            return leftAudience.color === "#dc2626" ? -1 : 1;
          }

          const leftName = left.profile?.fullName || left.userId;
          const rightName = right.profile?.fullName || right.userId;
          return leftName.localeCompare(rightName);
        });

      setGroup(groupData);
      setRenameValue(groupData.groupName);
      setParticipants(nextParticipants);
      setGroupError(null);
    } catch (err: unknown) {
      setGroupError((err as Error)?.message ?? "Khong the tai chi tiet nhom");
    } finally {
      setGroupLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void loadGroupDetails();
  }, [loadGroupDetails]);

  useEffect(() => {
    if (!highlightedMessageId) {
      return;
    }

    const timeout = setTimeout(() => setHighlightedMessageId(null), 3200);
    return () => clearTimeout(timeout);
  }, [highlightedMessageId]);

  useEffect(() => {
    if (loading || messages.length === 0) {
      return;
    }

    if (messages.length >= previousMessageCountRef.current) {
      const animated = previousMessageCountRef.current > 0;
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated });
      }, 80);
    }

    previousMessageCountRef.current = messages.length;
  }, [loading, messages.length]);

  const currentMembership = useMemo(
    () => participants.find((participant) => participant.userId === user?.sub),
    [participants, user?.sub],
  );

  const canManageGroup = useMemo(
    () =>
      currentMembership?.roleInGroup === "OWNER" || currentMembership?.roleInGroup === "OFFICER",
    [currentMembership?.roleInGroup],
  );

  const searchResults = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery);

    if (!normalizedQuery) {
      return [];
    }

    return messages
      .map((item) => {
        const rendered = getRenderMessage(item);
        const target = normalizeSearchText(
          [rendered.primaryText, rendered.secondaryText ?? "", item.senderName].join(" "),
        );

        return { item, rendered, score: fuzzyScore(normalizedQuery, target) };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }

        return new Date(right.item.sentAt).getTime() - new Date(left.item.sentAt).getTime();
      });
  }, [messages, searchQuery]);

  const topBarTitle = group?.groupName || (isGroupConversation ? "Phong chat nhom" : "Phong chat");
  const topBarSubtitle = group ? `${group.memberCount} thanh vien | ${subtitle}` : subtitle;

  const handleSend = async () => {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    const sent = await sendMessage(trimmed);

    if (sent) {
      setText("");
      setTyping(false);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handlePickImage = async () => {
    if (!conversationId || pickingImage || sendingImage) {
      return;
    }

    setPickingImage(true);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled) {
        setPickingImage(false);
        return;
      }

      const asset = result.assets[0];
      if (!asset) {
        setPickingImage(false);
        return;
      }

      setPickingImage(false);
      setSendingImage(true);

      console.log("[Chat] Starting image upload, conversationId:", conversationId);

      // Upload the image to S3
      const uploadedAsset = await uploadMedia({
        uri: asset.uri,
        fileName: asset.fileName || `image-${Date.now()}.jpg`,
        mimeType: asset.type || "image/jpeg",
        target: "MESSAGE",
        entityId: conversationId,
      });

      console.log("[Chat] Image uploaded successfully:", uploadedAsset);

      // Send the image message with proper payload format
      const response = await emitChatAck(
        CHAT_SOCKET_EVENTS.MESSAGE_SEND,
        {
          conversationId,
          content: JSON.stringify({ text: "", mention: [] }),
          type: "IMAGE",
          attachmentUrl: uploadedAsset.url,
          clientMessageId: `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        },
      );

      console.log("[Chat] Image message send response:", response);

      if (!response.success) {
        console.error("[Chat] Failed to send image message:", response.error);
        Alert.alert("Gui anh that bai", response.error?.message || "Vui long thu lai sau.");
        setSendingImage(false);
        return;
      }

      console.log("[Chat] Image message sent successfully");
      setSendingImage(false);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err: unknown) {
      Alert.alert("Loi gui anh", (err as Error)?.message || "Khong the gui anh. Vui long thu lai.");
      setSendingImage(false);
    }
  };

  const handleJumpToMessage = useCallback(
    (messageId: string) => {
      const index = messages.findIndex((message) => message.id === messageId);

      if (index < 0) {
        return;
      }

      setSearchVisible(false);
      setHighlightedMessageId(messageId);

      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5,
        });
      }, 120);
    },
    [messages],
  );

  const handleDownloadImage = async () => {
    if (!fullscreenImageUrl) return;

    setDownloadingImage(true);

    try {
      await Share.share({
        url: fullscreenImageUrl,
        message: "Anh tu chat",
        title: `image-${Date.now()}.jpg`,
      });
    } catch (err: unknown) {
      Alert.alert("Loi", (err as Error)?.message || "Khong the luu anh");
    } finally {
      setDownloadingImage(false);
    }
  };

  const handleRenameGroup = async () => {
    if (!groupId || !renameValue.trim()) {
      return;
    }

    setRenaming(true);

    try {
      const updated = await updateGroup(groupId, { groupName: renameValue.trim() });
      setGroup(updated);
      setRenameValue(updated.groupName);
      setRenameVisible(false);
      setMenuVisible(false);
      setGroupError(null);
    } catch (err: unknown) {
      Alert.alert("Khong the doi ten nhom", (err as Error)?.message ?? "Vui long thu lai sau.");
    } finally {
      setRenaming(false);
    }
  };

  const handleOpenMenu = () => {
    if (!isGroupConversation) {
      Alert.alert(
        "Chat ca nhan",
        "Menu 3 cham hien tai uu tien cho chat nhom. Chi tiet nhom va doi ten khong ap dung cho doan chat nay.",
      );
      return;
    }

    setMenuVisible(true);
  };

  const handleAddMemberByCode = () => {
    setMenuVisible(false);
    Alert.alert(
      "Chua the them thanh vien qua ma",
      "Backend hien chi co API them thanh vien theo userId va chua co endpoint hoac flow invite code/member code. Khong the hoan thien muc nay neu khong sua file ngoai Citizen app.",
    );
  };

  return (
    <>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.replace("/(citizen)/chat")} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.topBarText}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {topBarTitle}
          </Text>
          <Text style={styles.topBarSubtitle} numberOfLines={1}>
            {topBarSubtitle}
          </Text>
        </View>
        <Pressable style={styles.topActionButton} onPress={() => setSearchVisible(true)}>
          <Ionicons name="search" size={18} color={colors.text} />
        </Pressable>
        <Pressable style={styles.topActionButton} onPress={handleOpenMenu}>
          <Ionicons name="ellipsis-vertical" size={18} color={colors.text} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => `${item.id}-${item.sentAt}-${item.senderId}`}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: tabBarHeight + insets.bottom + 24,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          extraData={highlightedMessageId}
          renderItem={({ item }) => {
            const rendered = getRenderMessage(item);
            const isOwn = item.senderId === user?.sub;
            const isHighlighted = item.id === highlightedMessageId;
            const correctedAttachmentUrl = item.attachmentUrl ? convertToS3Url(item.attachmentUrl) : null;
            const isImageMessage = item.type === "IMAGE";

            return (
              <View style={[styles.messageRow, isOwn ? styles.messageRowOwn : styles.messageRowOther]}>
                {!isOwn ? (
                  <Avatar uri={item.senderAvatarUrl} name={item.senderName} size={34} />
                ) : null}
                <View style={[styles.messageStack, isOwn ? styles.messageStackOwn : styles.messageStackOther, isImageMessage && { maxWidth: "95%" }]}>
                  <Text style={[styles.senderName, isOwn ? styles.senderNameOwn : null]}>
                    {isOwn ? "Ban" : item.senderName}
                  </Text>
                  {isImageMessage && correctedAttachmentUrl ? (
                    <Pressable onPress={() => setFullscreenImageUrl(correctedAttachmentUrl)}>
                      <RNImage
                        source={{ uri: correctedAttachmentUrl }}
                        style={styles.chatImageDirect}
                        resizeMode="contain"
                      />
                    </Pressable>
                  ) : (
                    <View
                      style={[
                        styles.bubble,
                        isOwn ? styles.bubbleOwn : styles.bubbleOther,
                        isHighlighted ? styles.bubbleHighlighted : null,
                      ]}
                    >
                      {rendered.typeLabel ? (
                        <View style={[styles.typePill, isOwn ? styles.typePillOwn : styles.typePillOther]}>
                          <Text style={[styles.typePillText, isOwn ? styles.typePillTextOwn : null]}>
                            {rendered.typeLabel}
                          </Text>
                        </View>
                      ) : null}
                      {rendered.primaryText && (
                        <Text style={[styles.messageText, isOwn ? styles.messageTextOwn : null]}>
                          {rendered.primaryText}
                        </Text>
                      )}
                      {correctedAttachmentUrl && (
                        <Pressable style={styles.chatAttachmentLink}>
                          <Ionicons name="document-attach" size={14} color={isOwn ? "white" : colors.text} />
                          <Text style={[styles.chatAttachmentText, isOwn && styles.chatAttachmentTextOwn]}>
                            {rendered.secondaryText || "Tep dinh kem"}
                          </Text>
                        </Pressable>
                      )}
                      <Text style={[styles.messageTime, isOwn ? styles.messageTimeOwn : null]}>
                        {new Date(item.sentAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                  )}
                  {!isImageMessage && (
                    <Text style={[styles.messageTime, isOwn ? styles.messageTimeOwn : null]}>
                      {new Date(item.sentAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  )}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-ellipses-outline" size={42} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>Chua co tin nhan nao</Text>
              <Text style={styles.emptyText}>
                Hay gui tin nhan dau tien de bat dau cuoc tro chuyen trong nhom nay.
              </Text>
            </View>
          }
          onScrollToIndexFailed={(info) => {
            const fallbackOffset = Math.max(info.averageItemLength * info.index, 0);
            flatListRef.current?.scrollToOffset({ offset: fallbackOffset, animated: true });

            setTimeout(() => {
              flatListRef.current?.scrollToIndex({
                index: info.index,
                animated: true,
                viewPosition: 0.5,
              });
            }, 200);
          }}
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          style={({ pressed }) => [
            styles.imagePickerButton,
            (pickingImage || sendingImage) && styles.imagePickerButtonDisabled,
            pressed && !pickingImage && !sendingImage ? styles.imagePickerButtonPressed : null,
          ]}
          onPress={handlePickImage}
          disabled={pickingImage || sendingImage}
        >
          {pickingImage || sendingImage ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="image-outline" size={20} color={colors.primary} />
          )}
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Nhap noi dung van ban..."
          placeholderTextColor={colors.textSecondary}
          value={text}
          onChangeText={(value) => {
            setText(value);
            setTyping(Boolean(value.trim()));
          }}
          onBlur={() => setTyping(false)}
          multiline
          editable={!sending && !sendingImage}
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            (!text.trim() || !conversationId || sending) && styles.sendButtonDisabled,
            pressed && text.trim() && !sending ? styles.sendButtonPressed : null,
          ]}
          onPress={handleSend}
          disabled={!text.trim() || !conversationId || sending}
        >
          <Ionicons name="send" size={18} color="white" />
        </Pressable>
      </View>
      </KeyboardAvoidingView>

      <Modal animationType="fade" transparent visible={searchVisible} onRequestClose={() => setSearchVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.searchModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tim kiem tin nhan</Text>
              <Pressable onPress={() => setSearchVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.searchInputWrap}>
              <Ionicons name="search" size={18} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Tim gan dung theo noi dung, nguoi gui..."
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />
            </View>

            <ScrollView style={styles.searchResults}>
              {!searchQuery.trim() ? (
                <Text style={styles.searchHint}>Nhap tu khoa de tim trong noi dung cuoc hoi thoai.</Text>
              ) : searchResults.length === 0 ? (
                <Text style={styles.searchHint}>Khong tim thay ket qua phu hop.</Text>
              ) : (
                searchResults.map(({ item, rendered }) => (
                  <Pressable
                    key={item.id}
                    style={styles.searchResultItem}
                    onPress={() => handleJumpToMessage(item.id)}
                  >
                    <Text style={styles.searchResultSender}>{item.senderName}</Text>
                    <Text style={styles.searchResultText} numberOfLines={2}>
                      {rendered.primaryText}
                    </Text>
                    <Text style={styles.searchResultTime}>{formatChatTimestamp(item.sentAt)}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={menuVisible} onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuSheet}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setDetailsVisible(true);
              }}
            >
              <Ionicons name="people-outline" size={18} color={colors.text} />
              <Text style={styles.menuText}>Xem chi tiet nhom</Text>
            </Pressable>
            <Pressable
              style={[styles.menuItem, !canManageGroup && styles.menuItemDisabled]}
              onPress={() => {
                if (!canManageGroup) {
                  Alert.alert("Khong du quyen", "Chi owner hoac officer moi co the doi ten nhom.");
                  return;
                }

                setMenuVisible(false);
                setRenameVisible(true);
              }}
            >
              <Ionicons name="create-outline" size={18} color={colors.text} />
              <Text style={styles.menuText}>Doi ten nhom</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={handleAddMemberByCode}>
              <Ionicons name="person-add-outline" size={18} color={colors.text} />
              <Text style={styles.menuText}>Them nguoi vao nhom qua ma</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal animationType="slide" transparent visible={detailsVisible} onRequestClose={() => setDetailsVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.detailsCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chi tiet nhom</Text>
              <Pressable onPress={() => setDetailsVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>

            {groupLoading ? (
              <ActivityIndicator style={styles.loader} color={colors.primary} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {groupError ? <Text style={styles.error}>{groupError}</Text> : null}
                {group ? (
                  <>
                    <View style={styles.groupInfoCard}>
                      <Text style={styles.groupInfoTitle}>{group.groupName}</Text>
                      <Text style={styles.groupInfoSubtitle}>{`${group.memberCount} thanh vien`}</Text>
                      <Text style={styles.groupInfoMeta}>{group.description || "Nhom chua co mo ta."}</Text>
                    </View>

                    <View style={styles.legendRow}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: "#dc2626" }]} />
                        <Text style={styles.legendText}>Can bo</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: "#15803d" }]} />
                        <Text style={styles.legendText}>Nguoi dan</Text>
                      </View>
                    </View>

                    {participants.map((participant) => {
                      const audience = getAudienceMeta(participant.profile?.role);

                      return (
                        <View key={participant.userId} style={styles.memberRow}>
                          <Avatar
                            uri={participant.profile?.avatarUrl}
                            name={participant.profile?.fullName || participant.userId}
                            size={38}
                          />
                          <View style={styles.memberText}>
                            <Text style={styles.memberName}>
                              {participant.profile?.fullName || participant.userId}
                            </Text>
                            <View style={styles.memberMetaRow}>
                              <View style={[styles.memberAudienceDot, { backgroundColor: audience.color }]} />
                              <Text style={styles.memberAudienceText}>{audience.label}</Text>
                              <Text style={styles.memberRoleText}>{participant.roleInGroup}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={renameVisible} onRequestClose={() => setRenameVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.renameCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Doi ten nhom</Text>
              <Pressable onPress={() => setRenameVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>

            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Nhap ten nhom moi"
              placeholderTextColor={colors.textSecondary}
            />

            <View style={styles.renameActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setRenameVisible(false)}>
                <Text style={styles.secondaryButtonText}>Huy</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, (!renameValue.trim() || renaming) && styles.primaryButtonDisabled]}
                disabled={!renameValue.trim() || renaming}
                onPress={() => void handleRenameGroup()}
              >
                <Text style={styles.primaryButtonText}>{renaming ? "Dang luu..." : "Luu ten moi"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={Boolean(fullscreenImageUrl)} onRequestClose={() => setFullscreenImageUrl(null)}>
        <View style={styles.fullscreenOverlay}>
          <Pressable style={styles.fullscreenCloseButton} onPress={() => setFullscreenImageUrl(null)}>
            <Ionicons name="close" size={28} color="white" />
          </Pressable>

          {fullscreenImageUrl && (
            <RNImage
              source={{ uri: fullscreenImageUrl }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}

          <View style={styles.fullscreenActions}>
            <Pressable
              style={[styles.fullscreenActionButton, downloadingImage && styles.fullscreenActionButtonDisabled]}
              onPress={handleDownloadImage}
              disabled={downloadingImage}
            >
              {downloadingImage ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="download" size={20} color="white" />
                  <Text style={styles.fullscreenActionText}>Luu</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f8ff" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  topBarText: { flex: 1, marginRight: 8 },
  topBarTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  topBarSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 13 },
  topActionButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  loader: { marginTop: 20 },
  error: { color: colors.danger, textAlign: "center", marginTop: 20 },
  messageRow: {
    flexDirection: "row",
    marginVertical: 7,
    paddingHorizontal: 4,
    alignItems: "flex-end",
  },
  messageRowOwn: { justifyContent: "flex-end" },
  messageRowOther: { justifyContent: "flex-start" },
  messageStack: { maxWidth: "80%" },
  messageStackOwn: { alignItems: "flex-end" },
  messageStackOther: { marginLeft: 10 },
  senderName: {
    marginBottom: 6,
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  senderNameOwn: { color: "#1d4ed8" },
  bubble: {
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
    borderWidth: 1,
    borderColor: "transparent",
  },
  bubbleOwn: {
    backgroundColor: "#2563eb",
    borderTopRightRadius: 8,
  },
  bubbleOther: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopLeftRadius: 8,
  },
  bubbleHighlighted: {
    borderColor: "#f59e0b",
    shadowOpacity: 0.14,
  },
  typePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  typePillOwn: { backgroundColor: "rgba(255,255,255,0.18)" },
  typePillOther: { backgroundColor: "#eff6ff" },
  typePillText: { fontSize: 11, fontWeight: "800", color: colors.primary },
  typePillTextOwn: { color: "white" },
  messageText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  messageTextOwn: { color: "white" },
  messageMeta: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  messageMetaOwn: { color: "rgba(255,255,255,0.82)" },
  messageTime: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 11,
    alignSelf: "flex-end",
  },
  messageTimeOwn: { color: "rgba(255,255,255,0.76)" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  input: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginRight: 10,
    maxHeight: 120,
    color: colors.text,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  sendButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  imagePickerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  imagePickerButtonDisabled: {
    opacity: 0.5,
  },
  imagePickerButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  emptyText: {
    marginTop: 8,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.38)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  searchModal: {
    width: "100%",
    maxHeight: "80%",
    backgroundColor: "white",
    borderRadius: 26,
    padding: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    color: colors.text,
  },
  searchResults: {
    marginTop: 14,
  },
  searchHint: {
    color: colors.textSecondary,
    lineHeight: 20,
    paddingVertical: 8,
  },
  searchResultItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  searchResultSender: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
    marginBottom: 4,
  },
  searchResultText: {
    color: colors.text,
    lineHeight: 20,
  },
  searchResultTime: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 12,
  },
  menuSheet: {
    width: "100%",
    backgroundColor: "white",
    borderRadius: 22,
    padding: 10,
    alignSelf: "center",
    marginTop: "auto",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  menuItemDisabled: {
    opacity: 0.55,
  },
  menuText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  detailsCard: {
    width: "100%",
    maxHeight: "82%",
    backgroundColor: "white",
    borderRadius: 26,
    padding: 18,
  },
  groupInfoCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 14,
  },
  groupInfoTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  groupInfoSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  groupInfoMeta: {
    marginTop: 8,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  legendRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendText: {
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: 12,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginBottom: 10,
  },
  memberText: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
  },
  memberMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },
  memberAudienceDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  memberAudienceText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  memberRoleText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  renameCard: {
    width: "100%",
    backgroundColor: "white",
    borderRadius: 24,
    padding: 18,
  },
  renameInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
  },
  renameActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: "700",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  primaryButtonDisabled: {
    backgroundColor: "#a5c5f2",
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "800",
  },
  chatImageDirect: {
    width: 280,
    height: 280,
    borderRadius: 16,
    backgroundColor: "#e2e8f0",
  },
  chatAttachmentLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 8,
    marginHorizontal: 8,
  },
  chatAttachmentText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  chatAttachmentTextOwn: {
    color: "white",
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenImage: {
    width: "100%",
    height: "75%",
  },
  fullscreenCloseButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenActions: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 12,
  },
  fullscreenActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  fullscreenActionButtonDisabled: {
    opacity: 0.6,
  },
  fullscreenActionText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
});
