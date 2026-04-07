import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Text, List, Avatar, Badge, Searchbar, useTheme, ActivityIndicator, Divider, SegmentedButtons, IconButton, Card } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useConversations } from '../../../hooks/shared/useConversations';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

export default function ChatListScreen() {
  const router = useRouter();
  const theme = useTheme();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('ALL');
  const { data: conversations, isLoading, refetch } = useConversations({ q: searchQuery || undefined });
  
  // Refresh list whenever screen is focused (user comes back from chat)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const sortedConversations = React.useMemo(() => {
    console.log('[ChatList] conversations raw:', conversations);
    console.log('[ChatList] isArray:', Array.isArray(conversations));
    if (!conversations) return [];
    if (!Array.isArray(conversations)) {
      console.error('[ChatList] conversations is NOT an array:', typeof conversations, conversations);
      return [];
    }
    let filtered = [...conversations];
    
    // Deduplicate by conversationId to prevent FlatList key warnings
    const uniqueMap = new Map();
    for (const conv of filtered) {
      const existing = uniqueMap.get(conv.conversationId);
      if (!existing || new Date(conv.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
        uniqueMap.set(conv.conversationId, conv);
      }
    }
    filtered = Array.from(uniqueMap.values());

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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text variant="headlineSmall" style={styles.headerTitle}>Hộp thư</Text>
          <IconButton icon="account-search-outline" size={28} onPress={() => router.push('/(official)/chat/search' as any)} />
        </View>
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
            <Card style={styles.chatCard} onPress={() => handlePress(item.conversationId)} mode="elevated" elevation={1}>
              <Card.Content style={styles.cardContent}>
                <View style={styles.avatarContainer}>
                  <Avatar.Icon 
                    icon={item.isGroup ? "account-group" : "account"} 
                    size={48} 
                    style={{ backgroundColor: item.isGroup ? theme.colors.secondaryContainer : theme.colors.primaryContainer }} 
                  />
                  {item.unreadCount > 0 && <Badge style={styles.badge}>{item.unreadCount}</Badge>}
                </View>
                <View style={styles.textContainer}>
                  <View style={styles.row}>
                    <Text variant="titleMedium" style={[styles.groupName, item.unreadCount > 0 && { fontWeight: 'bold' }]} numberOfLines={1}>
                      {item.groupName || 'Hội thoại'}
                    </Text>
                    <Text variant="labelSmall" style={styles.timeText}>
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                  <Text variant="bodySmall" style={[styles.description, item.unreadCount > 0 && { fontWeight: '600', color: '#000' }]} numberOfLines={1}>
                    {item.lastMessagePreview || 'Bắt đầu trò chuyện...'}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="message-text-outline" size={60} color="#e0e0e0" />
              <Text variant="bodyLarge" style={{ color: '#9e9e9e', fontWeight: 'bold', marginTop: 8 }}>
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
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  header: { 
    padding: 16, 
    backgroundColor: '#fff', 
    borderBottomLeftRadius: 24, 
    borderBottomRightRadius: 24, 
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    zIndex: 10,
  },
  headerTitle: { fontWeight: '900', color: '#1a1a1a' },
  searchBar: { borderRadius: 12, backgroundColor: '#f2f3f5', elevation: 0 },
  filterRow: { marginTop: 12 },
  
  listContent: { paddingVertical: 12 },
  chatCard: {
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  avatarContainer: { position: 'relative' },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E53935' },
  
  textContainer: {
    flex: 1,
    marginLeft: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  groupName: {
    flex: 1,
    color: '#212121',
  },
  timeText: {
    color: '#9e9e9e',
    fontWeight: '500',
  },
  description: {
    color: '#757575',
  },
  
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { padding: 48, alignItems: 'center' },
});
