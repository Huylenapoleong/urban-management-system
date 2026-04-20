import React from 'react';
import { View } from 'react-native';
import { Appbar, Avatar } from 'react-native-paper';

type ChatDetailHeaderProps = {
  styles: any;
  colors: any;
  isGroup: boolean;
  headerAvatarUrl: string | null;
  conversationDisplayName: string;
  subtitleText: string;
  isPeerOnline: boolean;
  onBack: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onOpenInfo: () => void;
};

export function ChatDetailHeader({
  styles,
  colors,
  isGroup,
  headerAvatarUrl,
  conversationDisplayName,
  subtitleText,
  isPeerOnline,
  onBack,
  onStartAudioCall,
  onStartVideoCall,
  onOpenInfo,
}: ChatDetailHeaderProps) {
  return (
    <Appbar.Header
      style={{
        backgroundColor: colors.surface,
        borderBottomWidth: 0.5,
        borderColor: colors.border,
        elevation: 0,
      }}
    >
      <Appbar.BackAction onPress={onBack} color={colors.primary} />
      <View style={styles.headerAvatarWrap}>
        {headerAvatarUrl ? (
          <Avatar.Image size={40} source={{ uri: headerAvatarUrl }} style={styles.headerAvatarImage} />
        ) : (
          <Avatar.Icon
            size={40}
            icon={isGroup ? 'account-group' : 'account'}
            style={{ backgroundColor: colors.primarySoft }}
          />
        )}
        {!isGroup && isPeerOnline ? <View style={styles.onlineDotSmall} /> : null}
      </View>
      <Appbar.Content
        title={conversationDisplayName}
        titleStyle={{ fontSize: 18, fontWeight: '800', color: colors.primary }}
        subtitle={subtitleText}
        subtitleStyle={{ fontSize: 12, color: colors.mutedOnSurface, fontWeight: '600' }}
      />
      <Appbar.Action
        icon="phone"
        onPress={onStartAudioCall}
        iconColor={colors.callAction}
        style={styles.callActionButton}
      />
      <Appbar.Action
        icon="video"
        onPress={onStartVideoCall}
        iconColor={colors.callAction}
        style={styles.callActionButton}
      />
      <Appbar.Action icon="information" onPress={onOpenInfo} color={colors.primary} />
    </Appbar.Header>
  );
}
