import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtClaims } from '@urban/shared-types';

export const CurrentAuthClaims = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtClaims => {
    const request = context
      .switchToHttp()
      .getRequest<{ authClaims: JwtClaims }>();
    return request.authClaims;
  },
);
