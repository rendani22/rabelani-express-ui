import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { OpsLoggerService } from './ops-logger.service';

const MAX_BODY_SUMMARY = 200;

/**
 * Logs failed Angular `HttpClient` responses to livecode-OPS: `warn` for 4xx,
 * `error` for 5xx and connection failures (status 0). The request to the
 * ingest endpoint itself is skipped, otherwise a failing ingest call would log
 * a new error that triggers another ingest call — an infinite loop.
 */
@Injectable()
export class OpsHttpInterceptor implements HttpInterceptor {
  private readonly ops = inject(OpsLoggerService);
  // Compare against the path portion only, so query params (e.g. sendBeacon's
  // `?api_key=`) never defeat the loop guard.
  private readonly ingestPath = this.pathOf(environment.opsIngestUrl);

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler,
  ): Observable<HttpEvent<unknown>> {
    if (this.isIngestRequest(req.url)) {
      return next.handle(req);
    }

    return next.handle(req).pipe(
      tap({
        error: (err: unknown) => {
          if (!(err instanceof HttpErrorResponse)) return;

          const level = err.status >= 400 && err.status < 500 ? 'warn' : 'error';
          const context = {
            source: 'http',
            method: req.method,
            url: req.urlWithParams,
            status: err.status,
            statusText: err.statusText,
            body: this.summarizeBody(err.error),
          };
          const message = `HTTP ${err.status} ${req.method} ${this.pathOf(req.url) ?? req.url}`;

          if (level === 'warn') {
            this.ops.warn(message, context);
          } else {
            this.ops.error(message, context);
          }
        },
      }),
    );
  }

  private isIngestRequest(url: string): boolean {
    const path = this.pathOf(url);
    return !!this.ingestPath && !!path && path === this.ingestPath;
  }

  /** Origin + pathname, tolerant of relative URLs. */
  private pathOf(url: string): string | undefined {
    try {
      const base =
        typeof window !== 'undefined' ? window.location.origin : undefined;
      const u = new URL(url, base);
      return `${u.origin}${u.pathname}`;
    } catch {
      return undefined;
    }
  }

  private summarizeBody(body: unknown): string | undefined {
    if (body == null) return undefined;
    let text: string;
    if (typeof body === 'string') {
      text = body;
    } else {
      try {
        text = JSON.stringify(body);
      } catch {
        text = String(body);
      }
    }
    return text.length > MAX_BODY_SUMMARY
      ? `${text.slice(0, MAX_BODY_SUMMARY)}…`
      : text;
  }
}
