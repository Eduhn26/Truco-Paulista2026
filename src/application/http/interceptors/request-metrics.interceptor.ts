import { CallHandler, ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { HttpMetricsService } from '../metrics/http-metrics.service';

@Injectable()
export class RequestMetricsInterceptor implements NestInterceptor {
  constructor(private readonly httpMetricsService: HttpMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<string>() !== 'http') {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      finalize(() => {
        this.httpMetricsService.recordRequest(response.statusCode, Date.now() - startedAt);
      }),
    );
  }
}
