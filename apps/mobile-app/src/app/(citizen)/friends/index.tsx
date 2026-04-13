import React from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, Appbar, FAB, useTheme, ActivityIndicator, List, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useFriends, useRemoveFriend } from '@/hooks/shared/useUsers';
import { UserItem } from '@/components/social/UserItem';

export default function FriendsListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: friends, isLoading, refetch } = useFriends();
  const { mutateAsync: removeFriend } = useRemoveFriend();

  const handleMessage = (userId: string) => {
    router.push(`/(citizen)/chat/dm:${userId}`);
  };

  return (
    <View style={styles.container}>
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Ban be" />
        <Appbar.Action icon="account-plus" onPress={() => router.push('/(citizen)/friends/search' as any)} />
        <Appbar.Action icon="bell-outline" onPress={() => router.push('/(citizen)/friends/requests' as any)} />
      </Appbar.Header>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => (
            <UserItem 
              user={item} 
              onAction={() => handleMessage(item.userId)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="bodyLarge" style={styles.emptyText}>Ban chua có nguoi ban nào.</Text>
              <Button mode="contained" onPress={() => router.push('/(citizen)/friends/search' as any)} style={styles.emptyBtn}>
                Tim kiem nguoi quen
              </Button>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} />
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      <FAB
        icon="magnify"
        label="Tim ban"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color="#fff"
        onPress={() => router.push('/(citizen)/friends/search' as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 100,
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#667085',
    marginBottom: 16,
  },
  emptyBtn: {
    borderRadius: 12,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    borderRadius: 16,
  },
});
