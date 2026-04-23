import { View, StyleSheet, Modal, SafeAreaView, Dimensions } from 'react-native';
import { Text, IconButton, useTheme, Avatar } from 'react-native-paper';
import { useWebRTCContext } from '../providers/WebRTCContext';
import { VideoView } from './VideoView';
import colors from '@/constants/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function CallScreen() {
  const theme = useTheme();
  const {
    callState,
    activeConfig,
    localStream,
    remoteStream,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    isMicOn,
  } = useWebRTCContext();

  const isVideoCall = activeConfig?.isVideo ?? false;
  const callerName = activeConfig?.callerName || 'Người lạ';

  if (callState === 'INCOMING') {
    return (
      <Modal visible animationType="slide" transparent>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
          <SafeAreaView style={styles.container}>
            <View style={styles.incomingContent}>
              <View style={styles.avatarGlow}>
                <Avatar.Text 
                  size={120} 
                  label={callerName.substring(0, 2).toUpperCase()} 
                  style={{ backgroundColor: theme.colors.primary }}
                />
              </View>
              <Text variant="headlineMedium" style={[styles.incomingTitle, { color: '#fff' }]}>{callerName}</Text>
              <Text variant="bodyLarge" style={{ color: '#ccc' }}>
                Cuộc gọi đến ({isVideoCall ? 'Video' : 'Thoại'})
              </Text>
              
              <View style={styles.actionRow}>
                <View style={styles.actionItem}>
                  <IconButton
                    icon="close"
                    mode="contained"
                    containerColor="#ff4444"
                    iconColor="#fff"
                    size={35}
                    onPress={rejectCall}
                    style={styles.actionButton}
                  />
                  <Text style={styles.actionLabel}>Từ chối</Text>
                </View>

                <View style={styles.actionItem}>
                  <IconButton
                    icon={isVideoCall ? "video" : "phone"}
                    mode="contained"
                    containerColor="#00d2ff"
                    iconColor="#fff"
                    size={35}
                    onPress={acceptCall}
                    style={styles.actionButton}
                  />
                  <Text style={styles.actionLabel}>Chấp nhận</Text>
                </View>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="fade">
      <SafeAreaView style={[styles.container, { backgroundColor: '#000' }]}>
        {/* Remote Video / Audio placeholder */}
        <View style={styles.remoteVideoContainer}>
          {remoteStream && (
            <VideoView
              stream={remoteStream}
              style={isVideoCall ? styles.fullScreenVideo : { position: 'absolute', width: 1, height: 1, opacity: 0 }}
            />
          )}
          
          {!isVideoCall && (
            <View style={styles.audioPlaceholder}>
              <View style={[styles.audioBlur, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                <Avatar.Text 
                  size={120} 
                  label={callerName.substring(0, 2).toUpperCase()} 
                  style={{ backgroundColor: theme.colors.secondaryContainer }}
                />
                <Text variant="headlineSmall" style={{ color: '#fff', marginTop: 24, fontWeight: '700' }}>
                  {callerName}
                </Text>
                <Text style={{ color: colors.primary, marginTop: 8, fontSize: 16 }}>
                  {callState === 'CALLING' ? 'Đang gọi...' : 'Đã kết nối'}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Local Video Mini (Floating) */}
        {isVideoCall && localStream && (
          <View style={styles.localVideoContainer}>
            <VideoView
              stream={localStream}
              style={styles.localVideo}
              isLocal
            />
          </View>
        )}

        {/* Top Controls (Back button etc) */}
        <View style={styles.topBar}>
          <IconButton icon="chevron-down" iconColor="#fff" size={30} onPress={endCall} />
        </View>

        {/* Bottom Controls Bar */}
        <View style={[styles.controlsBar, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <IconButton
            icon={isMicOn ? "microphone" : "microphone-off"}
            mode="contained-tonal"
            size={28}
            onPress={toggleMute}
            containerColor={isMicOn ? 'rgba(255,255,255,0.2)' : 'rgba(255,0,0,0.3)'}
            iconColor="#fff"
          />
          
          {isVideoCall && (
            <IconButton
              icon="video-flip"
              mode="contained-tonal"
              size={28}
              onPress={() => {}} // TODO: Implement camera flip
              containerColor='rgba(255,255,255,0.2)'
              iconColor="#fff"
            />
          )}

          <IconButton
            icon="phone-hangup"
            mode="contained"
            containerColor="#ff4444"
            iconColor="#fff"
            size={32}
            onPress={endCall}
          />
          
          <IconButton
            icon="volume-high"
            mode="contained-tonal"
            size={28}
            onPress={() => {}} // TODO: Implement speaker toggle
            containerColor='rgba(255,255,255,0.2)'
            iconColor="#fff"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  incomingContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  avatarGlow: {
    padding: 10,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20,
  },
  incomingTitle: {
    marginTop: 10,
    marginBottom: 8,
    fontWeight: '700',
    letterSpacing: 0,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 80,
  },
  actionItem: {
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  remoteVideoContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullScreenVideo: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  audioPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioBlur: {
    padding: 40,
    borderRadius: 30,
    alignItems: 'center',
    overflow: 'hidden',
  },
  localVideoContainer: {
    position: 'absolute',
    top: 100,
    right: 20,
    width: 120,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
  },
  localVideo: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 10,
    zIndex: 10,
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 25,
    paddingHorizontal: 20,
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    borderRadius: 40,
    gap: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
});
