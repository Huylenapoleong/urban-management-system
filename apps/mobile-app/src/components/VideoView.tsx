import React, { useEffect, useRef } from 'react';
import { Platform, View, ViewStyle } from 'react-native';

interface VideoViewProps {
  stream: any;
  style?: ViewStyle | ViewStyle[];
  isLocal?: boolean;
}

export const VideoView = ({ stream, style, isLocal }: VideoViewProps) => {
  const videoRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream) return null;

  if (Platform.OS === 'web') {
    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: isLocal ? 'scaleX(-1)' : 'none',
          ...(style as any),
        }}
      />
    );
  }

  // Native (require it here to avoid web bundling issues)
  const { RTCView } = require('react-native-webrtc');
  
  return (
    <RTCView 
      streamURL={typeof stream.toURL === 'function' ? stream.toURL() : ''} 
      style={style as any} 
      objectFit="cover" 
      zOrder={isLocal ? 1 : 0} 
    />
  );
};
