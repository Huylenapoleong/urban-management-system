import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from '@/components/shared/SafeLinearGradient';
import { Appbar, Avatar } from 'react-native-paper';
import { Skeleton } from '@/components/skeleton/Skeleton';

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
  onUpdateAvatar?: () => void;
  isUpdatingAvatar?: boolean;
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
  onUpdateAvatar,
  isUpdatingAvatar,
}: ChatDetailHeaderProps) {
  return (
    <Appbar.Header
      style={{
        backgroundColor: colors.header || colors.secondary || colors.primary,
        borderBottomWidth: 0,
        elevation: 0,
        shadowOpacity: 0,
      }}
    >
      <LinearGradient
        pointerEvents="none"
        colors={colors.gradient?.primary || [colors.primary, colors.secondary || colors.primary]}
        start={colors.gradient?.start || { x: 0, y: 0 }}
        end={colors.gradient?.end || { x: 1, y: 1 }}
        style={styles.headerGradient}
      />
      <Appbar.BackAction
        onPress={onBack}
        color={colors.headerIcon || colors.textOnPrimary}
        style={styles.headerBackButton}
      />
      <View style={styles.headerAvatarWrap}>
        <TouchableOpacity onPress={onUpdateAvatar} disabled={!onUpdateAvatar || isUpdatingAvatar}>
          {headerAvatarUrl ? (
            <ExpoImage
              source={{ uri: headerAvatarUrl }}
              style={styles.headerAvatarImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
            />
          ) : (
            <Avatar.Icon
              size={40}
              icon={isGroup ? 'account-group' : 'account'}
              style={{ backgroundColor: colors.primarySoft }}
            />
          )}
          {isUpdatingAvatar && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, justifyContent: 'center', alignItems: 'center' }}>
               <Skeleton width={20} height={20} radius={10} />
            </View>
          )}
        </TouchableOpacity>
        {!isGroup && isPeerOnline ? <View style={styles.onlineDotSmall} /> : null}
      </View>
      <Appbar.Content
        title={conversationDisplayName}
        titleStyle={{
          fontSize: 16,
          fontWeight: '700',
          lineHeight: 20,
          letterSpacing: 0,
          color: colors.headerText || colors.textOnPrimary,
        }}
        subtitle={subtitleText}
        subtitleStyle={{
          fontSize: 12,
          fontWeight: '500',
          lineHeight: 16,
          letterSpacing: 0,
          color: colors.mutedHeaderText || colors.mutedTextOnPrimary,
        }}
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
      <Appbar.Action icon="information" onPress={onOpenInfo} color={colors.headerIcon || colors.textOnPrimary} />
    </Appbar.Header>
  );
}

export default ChatDetailHeader;
