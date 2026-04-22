import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, Avatar, useTheme, Surface, Button, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { UserDirectoryItem, UserFriendItem } from '@urban/shared-types';
import { convertToS3Url } from '@/constants/s3';

interface UserItemProps {
  user: UserDirectoryItem | UserFriendItem;
  onPress?: () => void;
  onAction?: () => void;
  actionLoading?: boolean;
}

function UserItemComponent({ user, onPress, onAction, actionLoading = false }: UserItemProps) {
  const theme = useTheme();
  
  // Type guards and data normalization
  const isDirectoryItem = 'relationState' in user;
  const avatarUrl = user.avatarUrl || (user as any).avatarAsset?.resolvedUrl;
  const s3AvatarUrl = avatarUrl ? convertToS3Url(avatarUrl) : undefined;
  
  const renderAction = () => {
    if (!isDirectoryItem) {
      // It's a UserFriendItem - show Message button
      return (
        <IconButton
          icon="chat-outline"
          mode="contained"
          containerColor={theme.colors.primaryContainer}
          iconColor={theme.colors.onPrimaryContainer}
          onPress={onAction}
          disabled={actionLoading}
        />
      );
    }

    const { relationState, canSendFriendRequest } = user as UserDirectoryItem;

    if (relationState === 'FRIEND') {
      return (
        <IconButton
          icon="chat-outline"
          mode="contained"
          containerColor={theme.colors.primaryContainer}
          iconColor={theme.colors.onPrimaryContainer}
          onPress={onAction}
          disabled={actionLoading}
        />
      );
    }

    if (relationState === 'OUTGOING_REQUEST') {
      return (
        <Button mode="outlined" compact disabled style={styles.actionBtn}>
          Đã gửi yc
        </Button>
      );
    }

    if (relationState === 'INCOMING_REQUEST') {
      return (
        <Button mode="contained" compact onPress={onAction} disabled={actionLoading} style={styles.actionBtn}>
          Chấp nhận
        </Button>
      );
    }

    if (canSendFriendRequest) {
      return (
        <Button 
          mode="outlined" 
          compact 
          onPress={onAction} 
          disabled={actionLoading}
          style={styles.actionBtn}
          icon="account-plus-outline"
        >
          Kết bạn
        </Button>
      );
    }

    return null;
  };

  const statusColor = user.status === 'ACTIVE' ? '#4caf50' : '#9e9e9e';

  return (
    <Pressable onPress={onPress}>
      <Surface style={styles.container} elevation={0}>
        <View style={styles.left}>
          <View>
            {s3AvatarUrl ? (
              <Avatar.Image size={52} source={{ uri: s3AvatarUrl }} />
            ) : (
              <Avatar.Text size={52} label={user.fullName.substring(0, 2).toUpperCase()} />
            )}
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          </View>
          <View style={styles.info}>
            <Text variant="titleMedium" style={styles.name} numberOfLines={1}>
              {user.fullName}
            </Text>
            <Text variant="bodySmall" style={styles.role} numberOfLines={1}>
              {user.role === 'WARD_OFFICER' ? 'Cán bộ Phường' : user.role === 'PROVINCE_OFFICER' ? 'Cán bộ Tỉnh' : 'Cư dân'} • {user.locationCode}
            </Text>
          </View>
        </View>
        <View style={styles.right}>
          {renderAction()}
        </View>
      </Surface>
    </Pressable>
  );
}

export const UserItem = React.memo(UserItemComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  info: {
    marginLeft: 14,
    flex: 1,
  },
  name: {
    fontWeight: '700',
    color: '#1d2939',
  },
  role: {
    color: '#667085',
    marginTop: 2,
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2,
    borderColor: '#fff',
  },
  right: {
    marginLeft: 12,
  },
  actionBtn: {
    borderRadius: 8,
  },
});
