import { io, Socket } from 'socket.io-client';
import { CHAT_SOCKET_EVENTS, CHAT_SOCKET_NAMESPACE } from '@urban/shared-constants';
import { readAccessToken } from './api-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

class SocketClient {
  public socket: Socket | null = null;
  private connectPromise: Promise<void> | null = null;
  private authToken: string | null = null;

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        const token = readAccessToken();

        if (this.socket?.connected && this.authToken === token) {
          this.connectPromise = null;
          resolve();
          return;
        }

        if (this.socket && this.authToken === token) {
          const onConnect = () => {
            this.socket?.off('connect_error', onConnectError);
            this.connectPromise = null;
            resolve();
          };

          const onConnectError = (error: unknown) => {
            this.socket?.off('connect', onConnect);
            this.connectPromise = null;
            reject(error);
          };

          this.socket.once('connect', onConnect);
          this.socket.once('connect_error', onConnectError);
          this.socket.connect();
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
          timeout: 10000,
        });
        
        this.authToken = token;

        this.socket.on('connect', () => {
          console.log('[Web Socket] Connected');
          this.connectPromise = null;
          resolve();
        });

        this.socket.on(CHAT_SOCKET_EVENTS.READY, () => {
          console.log('[Web Socket] Chat Socket Ready');
        });

        this.socket.on('disconnect', (reason) => {
          console.log('[Web Socket] Disconnected:', reason);
          this.connectPromise = null;
        });

        this.socket.on('connect_error', (error) => {
          console.error('[Web Socket] Connect error:', error);

          this.connectPromise = null;
          reject(error);
        });
      } catch (e) {
        console.error('[Web Socket] Failed to init socket', e);
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
      if (!this.socket?.connected) {
        return reject(new Error('Socket is not connected'));
      }
      this.socket.emit(event, payload, (response: any) => {
        if (response?.error) {
          reject(response.error);
        } else {
          resolve(response as T);
        }
      });
    });
  }
  
  // Hàm này giúp khắc phục lỗi "socket not connected"
  // Sẽ tự động kết nối lại nếu chưa connected, thay vì tự lờ đi
  async safeEmitValidated(event: string, payload: any) {
    if (!this.socket?.connected) {
      console.warn(`[Web Socket] Bị ngắt kết nối. Đang thử kết nối lại để gửi ${event}...`);
      await this.connect();
    }
    
    if (!this.socket?.connected) {
        throw new Error('Mạng bị mất, không thể gửi tín hiệu gọi thoại tại thời điểm này.');
    }
    
    return this.emitWithAck(event, payload);
  }
}

export const socketClient = new SocketClient();
