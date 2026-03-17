import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';
import { AppConfigService } from '../config/app-config.service';

export class AppSocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly config: AppConfigService,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.resolveCorsOrigin(),
        credentials: true,
      },
    }) as Server;
  }

  private resolveCorsOrigin(): true | string | string[] {
    if (this.config.corsOrigin === '*') {
      return true;
    }

    const origins = this.config.corsOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (origins.length <= 1) {
      return origins[0] ?? true;
    }

    return origins;
  }
}
