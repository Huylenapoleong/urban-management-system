import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';

interface VideoViewProps {
  stream: MediaStream | null;
  style?: any;
  isLocal?: boolean;
}

export const VideoView = ({ stream, style, isLocal }: VideoViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const flatStyle = StyleSheet.flatten(style);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isLocal}
      // @ts-ignore
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        ...flatStyle,
      }}
    />
  );
};
