import React, { useState, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Modal, Text, TextInput, Avatar, Button } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { listMyFriends } from '../../../../services/api/friends.api';

type InviteFriendsModalProps = {
  visible: boolean;
  onDismiss: () => void;
  groupId: string;
  groupMembers: any[];
  isAddingMember: boolean;
  onAddMemberSubmit: (groupId: string, targetUserId: string) => void;
  colors: any;
};

export function InviteFriendsModal({
  visible,
  onDismiss,
  groupId,
  groupMembers,
  isAddingMember,
  onAddMemberSubmit,
  colors,
}: InviteFriendsModalProps) {
  const [friendSearch, setFriendSearch] = useState('');

  const { data: myFriends = [] } = useQuery({
    queryKey: ['friends', 'list'],
    queryFn: () => listMyFriends({ limit: 100 }),
    staleTime: 60 * 1000,
    enabled: visible,
  });

  const filteredFriends = useMemo(() => {
    if (!friendSearch.trim()) return myFriends;
    return myFriends.filter(f => 
      f.fullName?.toLowerCase().includes(friendSearch.toLowerCase()) ||
      f.userId.toLowerCase().includes(friendSearch.toLowerCase())
    );
  }, [myFriends, friendSearch]);

  const handleDismiss = () => {
    onDismiss();
    setFriendSearch('');
  };

  return (
    <Modal
      visible={visible}
      onDismiss={handleDismiss}
      contentContainerStyle={[styles.modalContainer, { backgroundColor: colors.surface, minHeight: 400 }]}
    >
      <Text variant="titleMedium" style={[styles.title, { color: colors.textOnSurface }]}>Mời bạn bè</Text>
      <TextInput
        mode="outlined"
        value={friendSearch}
        onChangeText={setFriendSearch}
        placeholder="Tìm kiếm bạn bè"
        style={styles.searchInput}
        left={<TextInput.Icon icon="magnify" />}
      />
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {filteredFriends.map(friend => {
            const alreadyInGroup = groupMembers.some(m => m.userId === friend.userId);
            return (
              <TouchableOpacity
                key={friend.userId}
                style={[styles.item, { flexDirection: 'row', alignItems: 'center', opacity: alreadyInGroup ? 0.5 : 1 }]}
                disabled={alreadyInGroup || isAddingMember}
                onPress={() => {
                  onAddMemberSubmit(groupId, friend.userId);
                }}
              >
                <Avatar.Text size={40} label={(friend.fullName || 'U').substring(0,2).toUpperCase()} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyLarge" style={{ color: colors.textOnSurface, fontWeight: '700' }}>{friend.fullName}</Text>
                  <Text variant="bodySmall" style={{ color: colors.mutedOnSurface }}>{(alreadyInGroup) ? 'Đã trong nhóm' : 'Nhấn để thêm'}</Text>
                </View>
              </TouchableOpacity>
            );
        })}
      </ScrollView>
      <View style={styles.actions}>
        <Button mode="text" onPress={handleDismiss} disabled={isAddingMember}>Đóng</Button>
      </View>
    </Modal>
  );
}

export default InviteFriendsModal;

const styles = StyleSheet.create({
  modalContainer: { margin: 20, padding: 20, borderRadius: 8 },
  title: { marginBottom: 12, fontWeight: '700' },
  searchInput: { marginBottom: 16 },
  list: { maxHeight: 400 },
  item: { paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
});
