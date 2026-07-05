import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import * as Sentry from '@sentry/angular';

import { routes } from './app.routes';
import { provideLivecodeOps } from './core/livecode-ops';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimationsAsync(),
    // livecode-OPS error monitoring. The ErrorHandler logs to livecode-OPS,
    // then delegates to Sentry's handler so Sentry reporting + console output
    // stay unchanged. Also registers the HTTP interceptor and window listeners.
    ...provideLivecodeOps({ errorHandlerDelegate: Sentry.createErrorHandler() }),
    // Sentry tracing (trace init via APP_INITIALIZER).
    { provide: Sentry.TraceService, deps: [Router] },
    {
      provide: APP_INITIALIZER,
      useFactory: () => () => {},
      deps: [Sentry.TraceService],
      multi: true,
    },
  ]
};
