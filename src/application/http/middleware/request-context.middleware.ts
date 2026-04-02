import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { randomUUID } from 'node:crypto';

import type { RequestWithContext } from '../request-context.types';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: RequestWithContext, res: Response, next: NextFunction): void {
    const incomingRequestId = this.readHeader(req.headers['x-request-id']);
    const requestId = incomingRequestId ?? randomUUID();

    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    next();
  }

  private readHeader(headerValue: string | string[] | undefined): string | null {
    if (typeof headerValue === 'string') {
      const normalized = headerValue.trim();

      return normalized.length > 0 ? normalized : null;
    }

    if (Array.isArray(headerValue)) {
      const firstValue = headerValue.find(
        (value) => typeof value === 'string' && value.trim().length > 0,
      );

      return firstValue?.trim() ?? null;
    }

    return null;
  }
}
