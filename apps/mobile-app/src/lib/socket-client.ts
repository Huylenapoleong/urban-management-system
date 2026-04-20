import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { readWebToken } from './web-token-storage';
// Tái sử dụng constants nếu `mobile-app` có link `@urban/shared-constants`.
// Dùng mock nếu không tìm thấy, nhưng recommend setup dev env đúng.
import { CHAT_SOCKET_EVENTS, CHAT_SOCKET_NAMESPACE } from '@urban/shared-constants';

const getSocketOrigin = () => {
  const raw = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001').trim();
  return raw.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
};

let SOCKET_URL = getSocketOrigin();

const debugLog = (...args: unknown[]) => {
  if (__DEV__) {
    console.log(...args);
  }
};

const debugError = (...args: unknown[]) => {
  if (__DEV__) {
    console.error(...args);
  }
};

if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  SOCKET_URL = 'http://localhost:3001';
}

class SocketClient {
  public socket: Socket | null = null;
  private connectPromise: Promise<void> | null = null;
  private isConnecting = false;
  private authToken: string | null = null;

  private bindCoreListeners(resolve: () => void, reject: (error: unknown) => void) {
    if (!this.socket) {
      reject(new Error('Socket is not initialized'));
      return;
    }

    this.socket.off('connect');
    this.socket.off('disconnect');
    this.socket.off('connect_error');
    this.socket.off(CHAT_SOCKET_EVENTS.READY as string);

    this.socket.on('connect', () => {
      debugLog('Socket connected:', this.socket?.id);
      this.isConnecting = false;
      this.connectPromise = null;
      resolve();
    });

    this.socket.on(CHAT_SOCKET_EVENTS.READY, (payload: any) => {
      debugLog('Chat Socket Ready:', payload);
    });

    this.socket.on('disconnect', (reason) => {
      debugLog('Socket disconnected:', reason);
      this.isConnecting = false;
      this.connectPromise = null;
    });

    this.socket.on('connect_error', (error) => {
      debugError('Socket connect error:', error);
      this.isConnecting = false;
      this.connectPromise = null;
      reject(error);
    });
  }

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

        if (this.socket && this.authToken !== token) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }

        if (this.socket && this.authToken === token) {
          if (this.socket.connected) {
            this.isConnecting = false;
            this.connectPromise = null;
            resolve();
            return;
          }

          this.bindCoreListeners(resolve, reject);
          this.socket.connect();
          return;
        }

        this.socket = io(`${SOCKET_URL}${CHAT_SOCKET_NAMESPACE}`, {
          transports: ['websocket', 'polling'],
          auth: { token },
          reconnection: true,
          reconnectionAttempts: 20,
          reconnectionDelay: 800,
          timeout: 12000,
          forceNew: false,
          autoConnect: false,
        });
        this.authToken = token ?? null;

        this.bindCoreListeners(resolve, reject);
        this.socket.connect();
      } catch (e) {
        debugError('Failed to init socket', e);
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
