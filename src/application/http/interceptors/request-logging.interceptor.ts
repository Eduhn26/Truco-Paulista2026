import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import type { RequestWithContext } from '../request-context.types';

type HttpRequestLogContext = {
  timestamp: string;
  layer: 'http';
  event: 'http_request_started' | 'http_request_completed' | 'http_request_failed';
  requestId: string;
  method: string;
  path: string;
  statusCode?: number;
  durationMs?: number;
  clientIp: string;
  userAgent: string;
  errorName?: string;
  errorMessage?: string;
};

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<string>() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();
    const startTime = Date.now();

    const requestId = request.requestId ?? 'unknown-request-id';
    const method = request.method;
    const path = request.originalUrl ?? request.url;
    const clientIp = request.ip ?? request.socket.remoteAddress ?? 'unknown-ip';
    const userAgent = request.get('user-agent') ?? 'unknown-user-agent';

    this.logger.log(
      this.formatLog({
        timestamp: new Date().toISOString(),
        layer: 'http',
        event: 'http_request_started',
        requestId,
        method,
        path,
        clientIp,
        userAgent,
      }),
    );

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          this.formatLog({
            timestamp: new Date().toISOString(),
            layer: 'http',
            event: 'http_request_completed',
            requestId,
            method,
            path,
            statusCode: response.statusCode,
            durationMs: Date.now() - startTime,
            clientIp,
            userAgent,
          }),
        );
      }),
      catchError((error: unknown) => {
        this.logger.error(
          this.formatLog({
            timestamp: new Date().toISOString(),
            layer: 'http',
            event: 'http_request_failed',
            requestId,
            method,
            path,
            statusCode: response.statusCode,
            durationMs: Date.now() - startTime,
            clientIp,
            userAgent,
            errorName: error instanceof Error ? error.name : 'UnknownError',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          }),
        );

        return throwError(() => error);
      }),
    );
  }

  private formatLog(context: HttpRequestLogContext): string {
    return JSON.stringify(context);
  }
}
