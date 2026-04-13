import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Keyboard } from 'react-native';
import { Text, Searchbar, Appbar, useTheme, ActivityIndicator } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useUserSearch, useUserDiscovery, useSendFriendRequest } from '@/hooks/shared/useUsers';
import { UserItem } from '@/components/social/UserItem';

export default function UserSearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  
  const { data: searchResults, isLoading: isSearching } = useUserSearch(searchQuery);
  const { data: discoveryResults, isLoading: isDiscovering } = useUserDiscovery();
  const { mutateAsync: sendRequest } = useSendFriendRequest();
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const handleAction = async (userId: string, isFriend: boolean) => {
    if (isFriend) {
      router.push(`/(citizen)/chat/${userId}`);
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
        <Appbar.Content title="Tim kiem nguoi dung" />
      </Appbar.Header>

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Nhap ten nguoi dung..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          loading={isSearching}
          style={styles.searchBar}
          elevation={1}
        />
      </View>

      <View style={styles.content}>
        <Text variant="labelLarge" style={styles.sectionTitle}>
          {searchQuery.length >= 2 ? 'Ket qua tim kiem' : 'Goi y ket ban'}
        </Text>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={displayData}
            keyExtractor={(item) => item.userId}
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
                  {searchQuery.length >= 2 ? 'Khong tim thay nguoi dung nao.' : 'Hien tai khong co goi y nao.'}
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
  listContent: {
    paddingBottom: 40,
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
});
