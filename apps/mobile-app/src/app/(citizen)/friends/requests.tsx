import React from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Platform } from 'react-native';
import { Text, Appbar, useTheme, ActivityIndicator, List, Button, Avatar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useFriendRequests, useAcceptFriendRequest, useRejectFriendRequest, useCancelFriendRequest } from '@/hooks/shared/useUsers';
import { convertToS3Url } from '@/constants/s3';

export default function FriendRequestsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: requests, isLoading, refetch } = useFriendRequests();
  const { mutateAsync: acceptRequest } = useAcceptFriendRequest();
  const { mutateAsync: rejectRequest } = useRejectFriendRequest();
  const { mutateAsync: cancelRequest } = useCancelFriendRequest();

  const [activeTab, setActiveTab] = React.useState<'INCOMING' | 'OUTGOING'>('INCOMING');
  const [actingId, setActingId] = React.useState<string | null>(null);

  const filteredRequests = (requests || []).filter(r => r.direction === activeTab);

  const handleAction = async (userId: string, action: 'ACCEPT' | 'REJECT' | 'CANCEL') => {
    try {
      setActingId(userId);
      if (action === 'ACCEPT') await acceptRequest(userId);
      else if (action === 'REJECT') await rejectRequest(userId);
      else if (action === 'CANCEL') await cancelRequest(userId);
    } catch (err) {
      console.error(`Failed to ${action} friend request`, err);
    } finally {
      setActingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Lời mời kết bạn" />
      </Appbar.Header>

      <View style={styles.tabContainer}>
        <Button 
          mode={activeTab === 'INCOMING' ? 'contained' : 'text'} 
          onPress={() => setActiveTab('INCOMING')}
          style={styles.tabBtn}
          compact
        > 
          Lời mời ({(requests || []).filter(r => r.direction === 'INCOMING').length})
        </Button>
        <Button 
          mode={activeTab === 'OUTGOING' ? 'contained' : 'text'} 
          onPress={() => setActiveTab('OUTGOING')}
          style={styles.tabBtn}
          compact
        > 
          Đã gửi ({(requests || []).filter(r => r.direction === 'OUTGOING').length})
        </Button>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => {
            const avatarUrl = item.avatarUrl || (item as any).avatarAsset?.resolvedUrl;
            const s3Url = avatarUrl ? convertToS3Url(avatarUrl) : undefined;

            return (
              <List.Item
                title={item.fullName}
                description={activeTab === 'INCOMING' ? `Đã gửi ngày ${new Date(item.requestedAt).toLocaleDateString('vi-VN')}` : `Chờ phản hồi từ ${new Date(item.requestedAt).toLocaleDateString('vi-VN')}`}
                titleStyle={styles.title}
                descriptionStyle={styles.desc}
                left={() => (
                  <View style={styles.avatarWrap}>
                    {s3Url ? (
                      <Avatar.Image size={48} source={{ uri: s3Url }} />
                    ) : (
                      <Avatar.Text size={48} label={item.fullName.substring(0, 2).toUpperCase()} />
                    )}
                  </View>
                )}
                right={() => (
                  <View style={styles.actions}>
                    {activeTab === 'INCOMING' ? (
                      <>
                        <Button 
                          mode="contained" 
                          compact 
                          onPress={() => handleAction(item.userId, 'ACCEPT')}
                          loading={actingId === item.userId}
                          disabled={actingId !== null}
                          style={styles.actionBtn}
                        >
                          Dong y
                        </Button>
                        <Button 
                          mode="outlined" 
                          compact 
                          onPress={() => handleAction(item.userId, 'REJECT')}
                          loading={actingId === item.userId}
                          disabled={actingId !== null}
                          style={[styles.actionBtn, { borderColor: theme.colors.error }]}
                          textColor={theme.colors.error}
                        >
                          Tu choi
                        </Button>
                      </>
                    ) : (
                      <Button 
                        mode="outlined" 
                        compact 
                        onPress={() => handleAction(item.userId, 'CANCEL')}
                        loading={actingId === item.userId}
                        disabled={actingId !== null}
                        style={styles.actionBtn}
                      >
                        Hủy YC
                      </Button>
                    )}
                  </View>
                )}
                style={styles.listItem}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ color: '#667085' }}>Hiện tại không có lời mời nào tại đây.</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} />
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  tabContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f5',
  },
  tabBtn: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 8,
  },
  listItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  title: {
    fontWeight: '700',
    color: '#1d2939',
  },
  desc: {
    color: '#667085',
    marginTop: 2,
  },
  avatarWrap: {
    justifyContent: 'center',
    marginLeft: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 12,
  },
  actionBtn: {
    borderRadius: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 40,
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
});
