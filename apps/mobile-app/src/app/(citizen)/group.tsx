import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { GROUP_TYPES } from "@urban/shared-constants";
import type { GroupMetadata } from "@urban/shared-types";
import { useRouter } from "expo-router";
import Header from "@/components/Header";
import colors from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";
import { createGroup, joinGroup, leaveGroup, listGroups } from "@/services/api/group.api";

type GroupWithStatus = GroupMetadata & {
  joined: boolean;
};

const PRIVATE_GROUP_TYPE = GROUP_TYPES.find((type) => type === "PRIVATE") ?? "PRIVATE";

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fuzzyScore(query: string, target: string) {
  if (!query) {
    return 1;
  }

  if (target.includes(query)) {
    return 3;
  }

  const queryTokens = query.split(/\s+/).filter(Boolean);
  if (queryTokens.every((token) => target.includes(token))) {
    return 2;
  }

  let pointer = 0;
  for (const char of target) {
    if (char === query[pointer]) {
      pointer += 1;
      if (pointer === query.length) {
        return 1;
      }
    }
  }

  return 0;
}

const toSearchTarget = (group: GroupMetadata) =>
  normalizeText([group.groupName, group.description ?? "", group.groupType, group.locationCode].join(" "));

const toRankTarget = (group: GroupMetadata) => normalizeText([group.groupName, group.description ?? ""].join(" "));

export default function GroupsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [allGroups, setAllGroups] = useState<GroupMetadata[]>([]);
  const [joinedGroups, setJoinedGroups] = useState<GroupMetadata[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [description, setDescription] = useState("");

  const normalizedSearch = useMemo(() => normalizeText(searchText), [searchText]);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const keyword = searchText.trim() || undefined;
      const [all, mine] = await Promise.all([
        listGroups({ q: keyword, limit: 100 }),
        listGroups({ mine: true, limit: 100 }),
      ]);

      setAllGroups(all);
      setJoinedGroups(mine);
    } catch (err: unknown) {
      Alert.alert("Loi", (err as Error)?.message ?? "Khong the tai danh sach nhom");
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const joinedIds = useMemo(() => new Set(joinedGroups.map((group) => group.id)), [joinedGroups]);

  const visibleGroups = useMemo<GroupWithStatus[]>(() => {
    return allGroups
      .map((group) => ({
        ...group,
        joined: joinedIds.has(group.id),
      }))
      .filter((group) => {
        if (!normalizedSearch) {
          return true;
        }

        return fuzzyScore(normalizedSearch, toSearchTarget(group)) > 0;
      })
      .sort((left, right) => {
        if (left.joined !== right.joined) {
          return left.joined ? -1 : 1;
        }

        const leftScore = fuzzyScore(normalizedSearch, toRankTarget(left));
        const rightScore = fuzzyScore(normalizedSearch, toRankTarget(right));

        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        return right.memberCount - left.memberCount;
      });
  }, [allGroups, joinedIds, normalizedSearch]);

  const handleJoinToggle = async (group: GroupWithStatus) => {
    if (group.createdBy === user?.sub) {
      Alert.alert("Khong the roi nhom", "Ban la chu nhom, hien tai khong the roi nhom do chinh minh tao.");
      return;
    }

    try {
      if (group.joined) {
        await leaveGroup(group.id);
      } else {
        await joinGroup(group.id);
      }
      await loadGroups();
    } catch (err: unknown) {
      Alert.alert("Loi", (err as Error)?.message ?? "Khong the cap nhat trang thai tham gia");
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || !user?.locationCode) {
      return;
    }

    setSaving(true);
    try {
      const createdGroup = await createGroup({
        groupName: groupName.trim(),
        groupType: PRIVATE_GROUP_TYPE,
        locationCode: user.locationCode,
        description: description.trim() || undefined,
      });
      setShowCreateModal(false);
      setGroupName("");
      setDescription("");
      await loadGroups();
      Alert.alert(
        "Thanh cong",
        "Da tao nhom PRIVATE cua ban. Chi thanh vien moi co the thay va vao phong chat nay.",
      );
      router.push({
        pathname: "/(citizen)/chat/[id]",
        params: { id: `group:${createdGroup.id}` },
      });
    } catch (err: unknown) {
      Alert.alert("Loi", (err as Error)?.message ?? "Khong the tao nhom");
    } finally {
      setSaving(false);
    }
  };

  const openGroupChat = (group: GroupWithStatus) => {
    if (!group.joined) {
      Alert.alert("Chua tham gia", "Hay tham gia nhom truoc khi vao phong chat.");
      return;
    }

    router.push({
      pathname: "/(citizen)/chat/[id]",
      params: { id: `group:${group.id}` },
    });
  };

  return (
    <View style={styles.container}>
      <Header title="Community Groups" subtitle="Mot noi duy nhat de tim, tham gia va tao nhom" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Group citizen hub</Text>
            <Text style={styles.heroSubtitle}>
              Tim nhom ban da co quyen truy cap, tham gia nhanh va tao nhom PRIVATE trong khu vuc cua ban.
            </Text>
          </View>
          <Pressable style={styles.heroButton} onPress={() => setShowCreateModal(true)}>
            <Ionicons name="add" size={18} color="white" />
            <Text style={styles.heroButtonText}>Create</Text>
          </Pressable>
        </View>

        <View style={styles.searchCard}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tim nhom gan dung theo ten, mo ta, khu vuc..."
            placeholderTextColor={colors.textSecondary}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.statusDot, styles.statusDotJoined]} />
            <Text style={styles.legendText}>Da tham gia</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.statusDot, styles.statusDotIdle]} />
            <Text style={styles.legendText}>Chua tham gia</Text>
          </View>
          <Text style={styles.legendSummary}>{`${joinedGroups.length} nhom cua ban`}</Text>
        </View>

        <View style={styles.noticeCard}>
          <Ionicons name="information-circle-outline" size={18} color="#1d4ed8" />
          <Text style={styles.noticeText}>
            Nhom do citizen tao se la PRIVATE. Can bo cung dia ban se khong tu thay nhom nay neu chua duoc them vao.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
        ) : visibleGroups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-circle-outline" size={42} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>Khong tim thay nhom phu hop</Text>
            <Text style={styles.emptyText}>Thu tim theo tu khoa gan dung hoac tao nhom rieng de bat dau.</Text>
          </View>
        ) : (
          visibleGroups.map((group) => (
            <Pressable
              key={`${group.id}-${group.joined ? "joined" : "open"}`}
              style={styles.groupCard}
              onPress={() => openGroupChat(group)}
            >
              <View style={styles.groupCardTop}>
                <View style={styles.groupMain}>
                  <View style={styles.groupTitleRow}>
                    <View
                      style={[
                        styles.statusDot,
                        group.joined ? styles.statusDotJoined : styles.statusDotIdle,
                      ]}
                    />
                    <Text style={styles.groupName}>{group.groupName}</Text>
                  </View>
                  <Text style={styles.groupMeta}>{`${group.groupType} • ${group.memberCount} thanh vien`}</Text>
                  <Text style={styles.groupLocation}>{group.locationCode}</Text>
                </View>
                <View style={styles.actionsColumn}>
                  <Pressable
                    style={[styles.chatButton, !group.joined && styles.chatButtonDisabled]}
                    onPress={() => openGroupChat(group)}
                  >
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={16}
                      color={group.joined ? "#0f172a" : "#94a3b8"}
                    />
                    <Text
                      style={[styles.chatButtonText, !group.joined && styles.chatButtonTextDisabled]}
                    >
                      Chat
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.joinButton,
                      group.joined ? styles.leaveButton : null,
                      group.createdBy === user?.sub ? styles.ownerButton : null,
                    ]}
                    onPress={() => void handleJoinToggle(group)}
                  >
                    <Text
                      style={[
                        styles.joinButtonText,
                        group.joined ? styles.leaveButtonText : null,
                        group.createdBy === user?.sub ? styles.ownerButtonText : null,
                      ]}
                    >
                      {group.createdBy === user?.sub ? "Owner" : group.joined ? "Leave" : "Join"}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.groupDescription}>
                {group.description || "Nhom chua co mo ta chi tiet."}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Modal animationType="fade" transparent visible={showCreateModal} onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create private group</Text>
            <Text style={styles.modalText}>
              Citizen chi duoc tao nhom PRIVATE trong dung dia ban cua minh. Nhom nay chi thanh vien moi co the thay va tham gia.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ten nhom"
              value={groupName}
              onChangeText={setGroupName}
            />
            <TextInput
              style={[styles.modalInput, styles.modalTextarea]}
              placeholder="Mo ta ngan gon"
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalGhostButton} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalPrimaryButton,
                  (!groupName.trim() || !user?.locationCode || saving) && styles.modalPrimaryDisabled,
                ]}
                onPress={() => void handleCreateGroup()}
                disabled={!groupName.trim() || !user?.locationCode || saving}
              >
                <Text style={styles.modalPrimaryText}>{saving ? "Creating..." : "Create group"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f8ff" },
  content: { padding: 16, paddingBottom: 120 },
  heroCard: {
    backgroundColor: "rgba(255,255,255,0.88)",
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 16,
  },
  heroText: { marginBottom: 16 },
  heroTitle: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  heroSubtitle: { marginTop: 8, color: colors.textSecondary, lineHeight: 21, fontSize: 14 },
  heroButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1d4ed8",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  heroButtonText: { color: "white", fontWeight: "700", fontSize: 14 },
  searchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 14,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: colors.text },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center" },
  legendText: { marginLeft: 6, color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  legendSummary: { color: "#0f172a", fontWeight: "700", fontSize: 12 },
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#eff6ff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    marginBottom: 14,
  },
  noticeText: {
    flex: 1,
    color: "#1e3a8a",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  statusDot: { width: 10, height: 10, borderRadius: 999 },
  statusDotJoined: { backgroundColor: "#16a34a" },
  statusDotIdle: { backgroundColor: "#cbd5e1" },
  loader: { marginTop: 24 },
  emptyCard: {
    backgroundColor: "rgba(255,255,255,0.86)",
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyTitle: { marginTop: 10, fontSize: 18, fontWeight: "700", color: "#0f172a" },
  emptyText: { marginTop: 6, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
  groupCard: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 6,
    marginBottom: 12,
  },
  groupCardTop: { flexDirection: "row", alignItems: "flex-start" },
  groupMain: { flex: 1, paddingRight: 12 },
  groupTitleRow: { flexDirection: "row", alignItems: "center" },
  groupName: { marginLeft: 8, fontSize: 18, fontWeight: "800", color: "#0f172a", flex: 1 },
  groupMeta: { marginTop: 6, color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  groupLocation: { marginTop: 4, color: "#64748b", fontSize: 12 },
  groupDescription: { marginTop: 12, color: colors.text, lineHeight: 20, fontSize: 14 },
  joinButton: {
    backgroundColor: "#dbeafe",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionsColumn: {
    alignItems: "flex-end",
    gap: 8,
  },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  chatButtonDisabled: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
  },
  chatButtonText: {
    color: "#0f172a",
    fontWeight: "800",
    fontSize: 13,
  },
  chatButtonTextDisabled: {
    color: "#94a3b8",
  },
  leaveButton: { backgroundColor: "#eef2ff" },
  ownerButton: { backgroundColor: "#e2e8f0" },
  joinButtonText: { color: "#1d4ed8", fontWeight: "800", fontSize: 13 },
  leaveButtonText: { color: "#4338ca" },
  ownerButtonText: { color: "#475569" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.3)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 28,
    padding: 20,
  },
  modalTitle: { fontSize: 22, fontWeight: "800", color: "#0f172a" },
  modalText: { marginTop: 8, color: colors.textSecondary, lineHeight: 20 },
  modalInput: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modalTextarea: { minHeight: 96, textAlignVertical: "top" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  modalGhostButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modalGhostText: { color: "#0f172a", fontWeight: "700" },
  modalPrimaryButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#1d4ed8",
  },
  modalPrimaryDisabled: { backgroundColor: "#bfd3fb" },
  modalPrimaryText: { color: "white", fontWeight: "800" },
});
