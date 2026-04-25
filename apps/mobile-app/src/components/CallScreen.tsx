import colors from "@/constants/colors";
import { Audio } from "expo-av";
import {
  Dimensions,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Avatar, IconButton, Text, useTheme } from "react-native-paper";
import { useCallback, useState } from "react";
import { useWebRTCContext } from "../providers/WebRTCContext";
import { VideoView } from "./VideoView";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function CallScreen() {
  const theme = useTheme();
  const [
    isSpeakerOn,
    setIsSpeakerOn,
  ] = useState(false);

  const toggleSpeaker = useCallback(async () => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    try {
      await Audio.setAudioModeAsync({
        // Keep recording pipeline open so mic keeps working during call
        allowsRecordingIOS: true,
        // Force audio through loudspeaker (true) or earpiece (false)
        playsInSilentModeIOS: true,
        // Android: false = loudspeaker (hands-free), true = earpiece
        playThroughEarpieceAndroid: !next,
        shouldDuckAndroid: false,
      });
    } catch (err) {
      console.warn("[CallScreen] toggleSpeaker failed", err);
      setIsSpeakerOn(!next); // rollback
    }
  }, [isSpeakerOn]);

  const {
    callState,
    activeConfig,
    localStream,
    remoteStream,
    remoteParticipants,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    isMicOn,
    isVideoOn,
  } = useWebRTCContext();

  const isVideoCall = activeConfig?.isVideo ?? false;
  const callerName =
    activeConfig?.callerName || activeConfig?.peerName || "Người lạ";
  const fallbackParticipant = remoteStream
    ? [{ userId: "remote", stream: remoteStream, displayName: callerName }]
    : [];
  const participants = remoteParticipants.length
    ? remoteParticipants
    : fallbackParticipant;
  const participantNames = participants
    .map((item) => item.displayName)
    .filter(Boolean);
  const statusText =
    callState === "CALLING"
      ? "Đang gọi..."
      : participants.length > 1
        ? `${participants.length} người đang tham gia`
        : "Đã kết nối";

  if (callState === "INCOMING") {
    return (
      <Modal visible animationType="slide" transparent>
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(0,0,0,0.8)" },
          ]}
        >
          <SafeAreaView style={styles.container}>
            <View style={styles.incomingContent}>
              <View style={styles.avatarGlow}>
                <Avatar.Text
                  size={120}
                  label={callerName.substring(0, 2).toUpperCase()}
                  style={{ backgroundColor: theme.colors.primary }}
                />
              </View>
              <Text
                variant="headlineMedium"
                style={[styles.incomingTitle, { color: "#fff" }]}
              >
                {callerName}
              </Text>
              <Text variant="bodyLarge" style={{ color: "#ccc" }}>
                Cuộc gọi đến ({isVideoCall ? "Video" : "Thoại"})
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
      <SafeAreaView style={[styles.container, { backgroundColor: "#000" }]}>
        <View style={styles.remoteVideoContainer}>
          {isVideoCall && participants.length === 1 && (
            <VideoView
              stream={participants[0].stream}
              style={styles.fullScreenVideo}
            />
          )}

          {isVideoCall && participants.length > 1 && (
            <ScrollView
              style={styles.videoGrid}
              contentContainerStyle={styles.videoGridContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {participants.map((participant) => (
                <View key={participant.userId} style={styles.videoTile}>
                  <VideoView
                    stream={participant.stream}
                    style={styles.videoTileStream}
                  />
                  <View style={styles.participantBadge}>
                    <Text numberOfLines={1} style={styles.participantBadgeText}>
                      {participant.displayName}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {!isVideoCall &&
            participants.map((participant) => (
              <VideoView
                key={participant.userId}
                stream={participant.stream}
                style={styles.hiddenRemoteAudio}
              />
            ))}

          {!isVideoCall && (
            <View style={styles.audioPlaceholder}>
              <View
                style={[
                  styles.audioBlur,
                  { backgroundColor: "rgba(255,255,255,0.1)" },
                ]}
              >
                <Avatar.Text
                  size={120}
                  label={callerName.substring(0, 2).toUpperCase()}
                  style={{ backgroundColor: theme.colors.secondaryContainer }}
                />
                <Text variant="headlineSmall" style={styles.audioTitle}>
                  {participantNames.length
                    ? participantNames.join(", ")
                    : callerName}
                </Text>
                <Text style={styles.audioStatus}>{statusText}</Text>
              </View>
            </View>
          )}

          {isVideoCall && participants.length === 0 && (
            <View style={styles.audioPlaceholder}>
              <Text style={styles.waitingText}>{statusText}</Text>
            </View>
          )}
        </View>

        {isVideoCall && localStream && (
          <View style={styles.localVideoContainer}>
            <VideoView stream={localStream} style={styles.localVideo} isLocal />
          </View>
        )}

        <View style={styles.topBar}>
          <IconButton
            icon="chevron-down"
            iconColor="#fff"
            size={30}
            onPress={endCall}
          />
        </View>

        <View style={styles.controlsBar}>
          <IconButton
            icon={isMicOn ? "microphone" : "microphone-off"}
            mode="contained-tonal"
            size={28}
            onPress={toggleMute}
            containerColor={
              isMicOn ? "rgba(255,255,255,0.2)" : "rgba(255,0,0,0.3)"
            }
            iconColor="#fff"
          />

          {isVideoCall && (
            <IconButton
              icon={isVideoOn ? "video" : "video-off"}
              mode="contained-tonal"
              size={28}
              onPress={toggleVideo}
              containerColor={
                isVideoOn ? "rgba(255,255,255,0.2)" : "rgba(255,0,0,0.3)"
              }
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
            icon={isSpeakerOn ? "volume-high" : "volume-medium"}
            mode="contained-tonal"
            size={28}
            onPress={() => void toggleSpeaker()}
            containerColor={
              isSpeakerOn ? "rgba(0,210,255,0.25)" : "rgba(255,255,255,0.2)"
            }
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
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  avatarGlow: {
    padding: 10,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginBottom: 20,
  },
  incomingTitle: {
    marginTop: 10,
    marginBottom: 8,
    fontWeight: "700",
    letterSpacing: 0,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 80,
  },
  actionItem: {
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  actionLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  remoteVideoContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  fullScreenVideo: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  videoGrid: {
    flex: 1,
    padding: 8,
  },
  videoGridContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 8,
  },
  videoTile: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: SCREEN_HEIGHT / 3,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#111827",
  },
  videoTileStream: {
    flex: 1,
  },
  participantBadge: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  participantBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  hiddenRemoteAudio: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  audioPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  audioBlur: {
    padding: 40,
    borderRadius: 30,
    alignItems: "center",
    overflow: "hidden",
  },
  audioTitle: {
    color: "#fff",
    marginTop: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  audioStatus: {
    color: colors.primary,
    marginTop: 8,
    fontSize: 16,
  },
  waitingText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  localVideoContainer: {
    position: "absolute",
    top: 100,
    right: 20,
    width: 120,
    height: 180,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#222",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
  },
  localVideo: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    top: 50,
    left: 10,
    zIndex: 10,
  },
  controlsBar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 25,
    paddingHorizontal: 20,
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    borderRadius: 40,
    gap: 15,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
});
