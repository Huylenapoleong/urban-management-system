import React, { useEffect, useRef } from "react";
import { Platform, View, ViewStyle } from "react-native";

interface VideoViewProps {
  stream: any;
  style?: ViewStyle | ViewStyle[];
  isLocal?: boolean;
}

export const VideoView = ({ stream, style, isLocal }: VideoViewProps) => {
  const videoRef = useRef<any>(null);

  const [isMuted, setIsMuted] = React.useState(false);

  useEffect(() => {
    if (Platform.OS === "web" && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }

    if (Platform.OS !== "web") {
      const track = stream.getVideoTracks?.()[0];
      if (track) {
        setIsMuted(track.muted);
        const handleMute = () => setIsMuted(true);
        const handleUnmute = () => setIsMuted(false);

        track.addEventListener("mute", handleMute);
        track.addEventListener("unmute", handleUnmute);

        return () => {
          track.removeEventListener("mute", handleMute);
          track.removeEventListener("unmute", handleUnmute);
        };
      }
    }
  }, [stream]);

  if (!stream) return null;

  if (Platform.OS === "web") {
    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: isLocal ? "scaleX(-1)" : "none",
          ...(style as any),
        }}
      />
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { RTCView } = require("react-native-webrtc");

  const videoTrack = stream.getVideoTracks?.()[0];
  const isVideoEnabled = videoTrack?.enabled ?? false;

  if (!isVideoEnabled || isMuted) {
    return (
      <View
        style={[
          style as any,
          {
            backgroundColor: "#111827",
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      />
    );
  }

  let streamURL = "";
  try {
    streamURL = typeof stream.toURL === "function" ? stream.toURL() : stream.id;
  } catch {
    streamURL = stream.id || "";
  }

  return (
    <RTCView
      streamURL={streamURL}
      style={style as any}
      objectFit="cover"
      mirror={isLocal}
      zOrder={isLocal ? 1 : 0}
    />
  );
};
