import { ErrorHandler, Injectable } from '@angular/core';
import * as Sentry from '@sentry/angular';

@Injectable({ providedIn: 'root' })
export class SentryErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    try {
      // If Sentry is configured, capture the exception
      if ((Sentry as any).getCurrentHub) {
        Sentry.captureException((error as any)?.originalError ?? error);
      }
    } catch (e) {
      // swallow to avoid infinite loops
      // eslint-disable-next-line no-console
      console.error('Failed to send error to Sentry', e);
    }

    // still log to console for visibility in dev
    // eslint-disable-next-line no-console
    console.error(error);
  }
}


