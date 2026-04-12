import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { readWebToken } from './web-token-storage';
// Tái sử dụng constants nếu `mobile-app` có link `@urban/shared-constants`.
// Dùng mock nếu không tìm thấy, nhưng recommend setup dev env đúng.
import { CHAT_SOCKET_EVENTS, CHAT_SOCKET_NAMESPACE } from '@urban/shared-constants';

let SOCKET_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  SOCKET_URL = 'http://localhost:3001';
}

class SocketClient {
  public socket: Socket | null = null;
  private connectPromise: Promise<void> | null = null;
  private isConnecting = false;
  private authToken: string | null = null;

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise(async (resolve, reject) => {
      this.isConnecting = true;

      try {
        let token;
        if (Platform.OS === 'web') {
          token = readWebToken();
        } else {
          token = await SecureStore.getItemAsync('auth_token');
        }

        if (this.socket?.connected && this.authToken === token) {
          this.isConnecting = false;
          this.connectPromise = null;
          resolve();
          return;
        }

        if (this.socket && this.authToken !== token) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }

        this.socket = io(`${SOCKET_URL}${CHAT_SOCKET_NAMESPACE}`, {
          transports: ['websocket'],
          auth: { token },
          reconnectionAttempts: 5,
        });
        this.authToken = token ?? null;

        this.socket.on('connect', () => {
          console.log('Socket connected:', this.socket?.id);
          this.isConnecting = false;
          this.connectPromise = null;
          resolve();
        });

        this.socket.on(CHAT_SOCKET_EVENTS.READY, (payload: any) => {
          console.log('Chat Socket Ready:', payload);
        });

        this.socket.on('disconnect', (reason) => {
          console.log('Socket disconnected:', reason);
          this.isConnecting = false;
          this.connectPromise = null; // Reset promise on disconnect
        });

        this.socket.on('connect_error', (error) => {
          console.error('Socket connect error:', error);
          this.isConnecting = false;
          this.connectPromise = null;
          reject(error);
        });
      } catch (e) {
        console.error('Failed to init socket', e);
        this.isConnecting = false;
        this.connectPromise = null;
        reject(e);
      }
    });

    return this.connectPromise;
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.authToken = null;
    this.connectPromise = null;
  }

  emitWithAck<T = any>(event: string, payload: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error('Socket is not connected'));
      }
      this.socket.emit(event, payload, (response: any) => {
        if (response?.error) {
          reject(response.error);
        } else {
          resolve(response?.data);
        }
      });
    });
  }

  on(event: string, handler: (data: any) => void) {
    this.socket?.on(event, handler);
  }

  off(event: string, handler?: (data: any) => void) {
    if (handler) {
      this.socket?.off(event, handler);
    } else {
      this.socket?.off(event);
    }
  }
}

export const socketClient = new SocketClient();
