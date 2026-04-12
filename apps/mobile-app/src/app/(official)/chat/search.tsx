import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button, Surface, useTheme, Avatar, ActivityIndicator, IconButton } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ApiClient } from '../../../lib/api-client';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../providers/AuthProvider';

export default function SearchUserScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setErrorMsg('');
    setResult(null);
    try {
      const res = await ApiClient.get(`/users/search?q=${encodeURIComponent(query.trim())}`);
      setResult(res);
    } catch (error: any) {
      setErrorMsg(error.response?.data?.message || 'Không tìm thấy người dùng này.');
    } finally {
      setLoading(false);
    }
  };

  const handleChat = () => {
    if (!result?.id) return;
    router.replace(`/(official)/chat/dm-${result.id}` as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Custom Header */}
      <View style={styles.header}>
        <IconButton icon="close" size={24} onPress={() => router.back()} />
        <Text variant="titleLarge" style={styles.headerTitle}>Tìm người liên hệ để Chat</Text>
        <View style={{ width: 48 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.content}>
        <Surface style={styles.searchCard} elevation={2}>
          <Text variant="bodyLarge" style={styles.label}>Nhập <Text style={{ fontWeight: 'bold' }}>Số điện thoại</Text> hoặc <Text style={{ fontWeight: 'bold' }}>Email</Text>:</Text>
          <View style={styles.searchRow}>
            <TextInput
              mode="outlined"
              placeholder="VD: 0912345678"
              value={query}
              onChangeText={setQuery}
              style={styles.input}
              outlineColor="#e0e0e0"
              activeOutlineColor={theme.colors.primary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              right={<TextInput.Icon icon="account-search-outline" />}
            />
          </View>
          <Button 
            mode="contained" 
            onPress={handleSearch} 
            loading={loading}
            disabled={loading || !query.trim()}
            style={styles.searchBtn}
          >
            TÌM KIẾM
          </Button>

          {!!errorMsg && (
            <Text style={styles.errorText}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} /> {errorMsg}
            </Text>
          )}

          {result && (
            <Surface style={styles.resultCard} elevation={1}>
              <View style={styles.resultInfo}>
                {result.avatarUrl ? (
                  <Avatar.Image size={56} source={{ uri: result.avatarUrl }} />
                ) : (
                  <Avatar.Icon size={56} icon="account" />
                )}
                <View style={styles.resultTextCol}>
                  <Text variant="titleMedium" style={styles.resultName} numberOfLines={1}>{result.fullName}</Text>
                  <Text variant="bodySmall" style={styles.resultRole}>{result.role === 'CITIZEN' ? 'Cư dân' : 'Cán bộ'}</Text>
                </View>
              </View>
              
              <Button 
                mode="contained-tonal" 
                icon="message-text-outline" 
                onPress={handleChat}
                style={styles.chatBtn}
              >
                Nhắn tin ngay
              </Button>
            </Surface>
          )}
        </Surface>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontWeight: 'bold' },
  content: { flex: 1, padding: 20 },
  searchCard: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  label: { marginBottom: 12, color: '#424242' },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#fff', fontSize: 16 },
  searchBtn: { marginTop: 16, borderRadius: 8 },
  errorText: { color: '#d32f2f', marginTop: 16, textAlign: 'center', fontSize: 14 },
  
  resultCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  resultInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  resultTextCol: { marginLeft: 16, flex: 1 },
  resultName: { fontWeight: 'bold', fontSize: 18, color: '#1a1a1a' },
  resultRole: { color: '#666', marginTop: 2 },
  chatBtn: { borderRadius: 8 },
});
