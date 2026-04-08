import React, { useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Text, List, Avatar, Badge, Searchbar, useTheme, ActivityIndicator, Divider, SegmentedButtons } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useConversations } from '../../../hooks/shared/useConversations';

export default function ChatListScreen() {
  const router = useRouter();
  const theme = useTheme();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('ALL');
  const { data: conversations, isLoading, refetch } = useConversations({ q: searchQuery || undefined });

  const sortedConversations = React.useMemo(() => {
    console.log('[ChatList] conversations raw:', conversations);
    console.log('[ChatList] isArray:', Array.isArray(conversations));
    if (!conversations) return [];
    if (!Array.isArray(conversations)) {
      console.error('[ChatList] conversations is NOT an array:', typeof conversations, conversations);
      return [];
    }
    let filtered = [...conversations];
    if (filterMode === 'GROUP') {
      filtered = filtered.filter(c => c.isGroup);
    } else if (filterMode === 'PRIVATE') {
      filtered = filtered.filter(c => !c.isGroup);
    }

    const sorted = filtered.sort((a, b) => {
      const aUnread = a.unreadCount > 0 ? 1 : 0;
      const bUnread = b.unreadCount > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });
    return sorted;
  }, [conversations, filterMode]);

  const handlePress = (id: string) => {
    console.log('[ChatList] handlePress called with id:', id, typeof id);
    if (!id) {
      console.error('[ChatList] handlePress: id is empty/null!');
      return;
    }
    router.push(`/(official)/chat/${id}` as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header / Search */}
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.headerTitle}>Hộp thư</Text>
        <Searchbar
          placeholder="Tìm kiếm cuộc hội thoại..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
        <View style={styles.filterRow}>
          <SegmentedButtons
            value={filterMode}
            onValueChange={setFilterMode}
            buttons={[
              { value: 'ALL', label: 'Tất cả' },
              { value: 'GROUP', label: 'Nhóm' },
              { value: 'PRIVATE', label: 'Cá nhân' },
            ]}
            density="small"
          />
        </View>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator animating size="large" />
        </View>
      ) : (
        <FlatList
          data={sortedConversations}
          keyExtractor={item => item.conversationId}
          onRefresh={refetch}
          refreshing={isLoading}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <Divider style={{ marginHorizontal: 16 }} />}
          renderItem={({ item }) => (
            <List.Item
              title={item.groupName || 'Hội thoại'}
              titleStyle={item.unreadCount > 0 ? { fontWeight: 'bold', color: theme.colors.primary } : { color: '#333' }}
              description={item.lastMessagePreview || 'Bắt đầu trò chuyện...'}
              descriptionStyle={item.unreadCount > 0 ? { fontWeight: '600', color: '#000' } : { color: '#666' }}
              descriptionNumberOfLines={1}
              onPress={() => handlePress(item.conversationId)}
              left={props => (
                <View style={styles.avatarContainer}>
                  <Avatar.Icon 
                    {...props} 
                    icon={item.isGroup ? "account-group" : "account"} 
                    size={48} 
                    style={{ backgroundColor: item.isGroup ? theme.colors.secondaryContainer : theme.colors.primaryContainer }} 
                  />
                  {item.unreadCount > 0 && <Badge style={styles.badge}>{item.unreadCount}</Badge>}
                </View>
              )}
              right={props => (
                <View style={{ justifyContent: 'center' }}>
                  <Text variant="labelSmall" style={{ color: '#aaa' }}>
                    {item.updatedAt ? new Date(item.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </Text>
                </View>
              )}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceDisabled }}>
                Không có cuộc hội thoại nào.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, backgroundColor: '#fff', borderBottomLeftRadius: 16, borderBottomRightRadius: 16, elevation: 1 },
  headerTitle: { fontWeight: 'bold', marginBottom: 16 },
  searchBar: { borderRadius: 12, backgroundColor: '#f5f5f5' },
  filterRow: { marginTop: 12 },
  listContent: { paddingVertical: 8, backgroundColor: '#fff', marginTop: 12, marginHorizontal: 16, borderRadius: 16, elevation: 1 },
  avatarContainer: { position: 'relative', justifyContent: 'center', marginLeft: 8 },
  badge: { position: 'absolute', top: -4, right: -4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { padding: 32, alignItems: 'center' },
});
