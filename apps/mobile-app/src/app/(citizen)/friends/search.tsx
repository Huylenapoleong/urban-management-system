import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Keyboard } from 'react-native';
import { Text, Searchbar, Appbar, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useUserSearch, useUserDiscovery, useSendFriendRequest } from '@/hooks/shared/useUsers';
import { UserItem } from '@/components/social/UserItem';
import { ListSkeleton, SkeletonInline } from '@/components/skeleton/Skeleton';
import { prefetchConversationMessages } from '@/services/prefetch';

export default function UserSearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  
  const { data: searchResults, isLoading: isSearching } = useUserSearch(searchQuery);
  const { data: discoveryResults, isLoading: isDiscovering } = useUserDiscovery();
  const { mutateAsync: sendRequest } = useSendFriendRequest();
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const handleAction = async (userId: string, isFriend: boolean) => {
    if (isFriend) {
      const conversationId = `dm:${userId}`;
      void prefetchConversationMessages(queryClient, conversationId);
      router.push({
        pathname: '/(citizen)/chat/[id]',
        params: { id: conversationId },
      });
      return;
    }

    try {
      setRequestingId(userId);
      await sendRequest(userId);
    } catch (err) {
      console.error('Failed to send friend request', err);
    } finally {
      setRequestingId(null);
    }
  };

  const displayData = searchQuery.length >= 2 ? searchResults : discoveryResults;
  const isLoading = searchQuery.length >= 2 ? isSearching : isDiscovering;

  return (
    <View style={styles.container}>
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Tìm kiếm người dùng" />
      </Appbar.Header>

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Nhập tên người dùng..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          elevation={1}
        />
      </View>

      <View style={styles.content}>
        <Text variant="labelLarge" style={styles.sectionTitle}>
          {searchQuery.length >= 2 ? 'Kết quả tìm kiếm' : 'Gợi ý kết bạn'}
        </Text>

        {isSearching ? <SkeletonInline width={96} height={12} style={styles.inlineRefresh} /> : null}

        {isLoading ? (
          <ListSkeleton count={7} />
        ) : (
          <FlatList
            data={displayData}
            keyExtractor={(item) => item.userId}
            removeClippedSubviews
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={7}
            updateCellsBatchingPeriod={50}
            renderItem={({ item }) => (
              <UserItem 
                user={item} 
                actionLoading={requestingId === item.userId}
                onAction={() => handleAction(item.userId, (item as any).relationState === 'FRIEND')}
              />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text variant="bodyMedium" style={{ color: '#667085' }}>
                  {searchQuery.length >= 2 ? 'Không tìm thấy người dùng nào.' : 'Hiện tại không có gợi ý nào.'}
                </Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f5',
  },
  searchBar: {
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  content: {
    flex: 1,
  },
  sectionTitle: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    color: '#667085',
    textTransform: 'uppercase',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  inlineRefresh: {
    marginLeft: 16,
    marginBottom: 8,
  },
  listContent: {
    paddingBottom: 40,
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
});
