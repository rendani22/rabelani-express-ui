import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  EnvironmentProviders,
  ErrorHandler,
  Provider,
  inject,
  provideAppInitializer,
} from '@angular/core';

import { installOpsGlobalErrorListeners } from './ops-global-error-listeners';
import {
  OPS_INNER_ERROR_HANDLER,
  OpsErrorHandler,
} from './ops-error-handler';
import { OpsHttpInterceptor } from './ops-http.interceptor';
import { OpsLoggerService } from './ops-logger.service';

export interface LivecodeOpsProviderOptions {
  /**
   * `ErrorHandler` to delegate to after logging. Pass an existing handler
   * (e.g. `Sentry.createErrorHandler()`) to keep it working; defaults to
   * Angular's built-in console handler.
   */
  errorHandlerDelegate?: ErrorHandler;
}

/**
 * Wires up automatic error/HTTP capture for livecode-OPS. Works with both
 * bootstrap styles:
 *
 *   // standalone bootstrapApplication
 *   providers: [...provideLivecodeOps({ errorHandlerDelegate })]
 *
 *   // NgModule
 *   @NgModule({ providers: [...provideLivecodeOps()] })
 *
 * Registers: the custom `ErrorHandler`, the failed-response HTTP interceptor
 * (DI-based, so `provideHttpClient(withInterceptorsFromDi())` is included), and
 * an app initializer that eagerly creates `OpsLoggerService` (starting its
 * flush timer + page-hide beacon) and installs the out-of-zone `window`
 * listeners.
 */
export function provideLivecodeOps(
  options: LivecodeOpsProviderOptions = {},
): (Provider | EnvironmentProviders)[] {
  return [
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: OPS_INNER_ERROR_HANDLER,
      useValue: options.errorHandlerDelegate ?? new ErrorHandler(),
    },
    { provide: ErrorHandler, useClass: OpsErrorHandler },
    { provide: HTTP_INTERCEPTORS, useClass: OpsHttpInterceptor, multi: true },
    provideAppInitializer(() => {
      installOpsGlobalErrorListeners(inject(OpsLoggerService));
    }),
  ];
}
