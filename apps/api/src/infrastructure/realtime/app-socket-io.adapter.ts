import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';
import { AppConfigService } from '../config/app-config.service';
import { RealtimeRedisService } from './realtime-redis.service';

export class AppSocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly config: AppConfigService,
    private readonly realtimeRedisService: RealtimeRedisService,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.config.corsOriginSetting,
        credentials: true,
      },
    }) as Server;

    const adapterFactory = this.realtimeRedisService.getAdapterFactory();

    if (adapterFactory) {
      server.adapter(adapterFactory);
    }

    return server;
  }
}
