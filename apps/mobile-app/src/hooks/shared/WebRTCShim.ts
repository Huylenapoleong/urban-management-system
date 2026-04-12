import { Platform } from 'react-native';

/**
 * Thư viện react-native-webrtc chỉ chạy trên Native (iOS/Android).
 * File này đóng vai trò là shim để tự động dùng WebRTC nguyên bản của trình duyệt khi chạy trên Web.
 */

let _RTCPeerConnection: any;
let _RTCIceCandidate: any;
let _RTCSessionDescription: any;
let _mediaDevices: any;
let _MediaStream: any;

if (Platform.OS === 'web') {
  _RTCPeerConnection = window.RTCPeerConnection;
  _RTCIceCandidate = window.RTCIceCandidate;
  _RTCSessionDescription = window.RTCSessionDescription;
  _mediaDevices = window.navigator.mediaDevices;
  _MediaStream = window.MediaStream;
} else {
  const WebRTC = require('react-native-webrtc');
  _RTCPeerConnection = WebRTC.RTCPeerConnection;
  _RTCIceCandidate = WebRTC.RTCIceCandidate;
  _RTCSessionDescription = WebRTC.RTCSessionDescription;
  _mediaDevices = WebRTC.mediaDevices;
  _MediaStream = WebRTC.MediaStream;
}

export const RTCPeerConnection = _RTCPeerConnection;
export const RTCIceCandidate = _RTCIceCandidate;
export const RTCSessionDescription = _RTCSessionDescription;
export const mediaDevices = _mediaDevices;
export const MediaStream = _MediaStream;
