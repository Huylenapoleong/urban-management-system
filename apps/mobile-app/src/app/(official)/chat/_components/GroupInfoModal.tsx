import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Modal, Text, Avatar, Button, IconButton } from 'react-native-paper';

type GroupInfoModalProps = {
  visible: boolean;
  onDismiss: () => void;
  isGroup: boolean;
  groupMembers: any[];
  currentUser: any;
  convInfo: any;
  knownUsers: Record<string, string>;
  decodedId: string;
  presenceSubtitle: string;
  groupId: string;
  onAddMemberClick: () => void;
  onLeaveGroup: (groupId: string) => void;
  onUpdateMemberRole: (groupId: string, userId: string, currentRole: string) => void;
  onRemoveMember: (groupId: string, userId: string) => void;
  colors: any;
};

export function GroupInfoModal({
  visible,
  onDismiss,
  isGroup,
  groupMembers,
  currentUser,
  convInfo,
  knownUsers,
  decodedId,
  presenceSubtitle,
  groupId,
  onAddMemberClick,
  onLeaveGroup,
  onUpdateMemberRole,
  onRemoveMember,
  colors,
}: GroupInfoModalProps) {
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      contentContainerStyle={[styles.modalContainer, { backgroundColor: colors.surface }]}
    >
      <Text variant="titleMedium" style={[styles.title, { color: colors.textOnSurface }]}>
        {isGroup ? 'Thông tin nhóm' : 'Thông tin cuộc trò chuyện'}
      </Text>
      
      {isGroup ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 16 }}>
             <Text variant="titleSmall" style={{ color: colors.textOnSurface }}>Thành viên ({groupMembers.length})</Text>
             <Button mode="text" onPress={onAddMemberClick} textColor={colors.primary}>Thêm</Button>
          </View>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {groupMembers.map((member) => {
              const uId = String(member.userId);
              const isMe = uId === currentUser?.sub;
              const isAdmin = convInfo?.ownerId === currentUser?.sub;
              const isMemberAdmin = convInfo?.ownerId === uId;
              
              return (
                <View key={uId} style={[styles.item, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                     <Avatar.Text size={32} label={(knownUsers[uId] || uId).substring(0,2).toUpperCase()} style={{ marginRight: 12, backgroundColor: colors.primarySoft }} color={colors.primary} />
                     <View>
                       <Text variant="bodyMedium" style={{ color: colors.textOnSurface, fontWeight: '500' }}>
                         {knownUsers[uId] || uId} {isMe ? '(Bạn)' : ''}
                       </Text>
                       <Text variant="labelSmall" style={{ color: colors.mutedOnSurface }}>
                         {isMemberAdmin ? 'Quản trị viên' : (member.roleInGroup === 'OFFICER' ? 'Phó nhóm' : 'Thành viên')}
                       </Text>
                     </View>
                  </View>
                  {isAdmin && !isMe && !isMemberAdmin && (
                     <View style={{ flexDirection: 'row' }}>
                       <IconButton icon="account-star" iconColor={colors.primary} size={20} onPress={() => onUpdateMemberRole(groupId, uId, member.roleInGroup)} />
                       <IconButton icon="account-remove" iconColor={colors.primary} size={20} onPress={() => onRemoveMember(groupId, uId)} />
                     </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
          <View style={{ padding: 16 }}>
             <Button mode="contained" buttonColor="#d32f2f" onPress={() => onLeaveGroup(groupId)}>
               Rời nhóm
             </Button>
          </View>
        </>
      ) : (
         <View style={{ padding: 16, alignItems: 'center', paddingBottom: 32 }}>
            <Avatar.Icon size={64} icon="account" style={{ backgroundColor: colors.primarySoft }} color={colors.primary} />
            <Text variant="titleMedium" style={{ marginTop: 12, color: colors.textOnSurface }}>
              {knownUsers[decodedId?.replace('dm:', '') || ''] || decodedId?.replace('dm:', '')}
            </Text>
            <Text variant="bodyMedium" style={{ color: colors.mutedOnSurface, marginTop: 4 }}>
              {presenceSubtitle}
            </Text>
         </View>
      )}
      
      <Button mode="text" style={{ alignSelf: 'flex-end', margin: 8 }} onPress={onDismiss} textColor={colors.primary}>
        Đóng
      </Button>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { margin: 20, borderRadius: 8, paddingVertical: 16 },
  title: { marginHorizontal: 16, marginBottom: 16, fontWeight: 'bold' },
  list: { maxHeight: 400, paddingHorizontal: 16 },
  item: { paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#0000001a' },
});
