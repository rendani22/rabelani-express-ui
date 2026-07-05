import { OpsLoggerService } from './ops-logger.service';

/**
 * Registers raw `window` listeners for errors thrown OUTSIDE Angular's zone
 * (e.g. inside a bare `setTimeout`, a non-Angular library callback, or a
 * detached promise), which never reach the `ErrorHandler`.
 *
 * Angular's `provideBrowserGlobalErrorListeners()` also forwards these to the
 * `ErrorHandler`; that overlap is harmless because `OpsLoggerService`
 * de-duplicates by error-object identity, so each error ships exactly once and
 * this remains correct even if that provider is later removed.
 *
 * Returns a teardown function (useful for tests / HMR).
 */
export function installOpsGlobalErrorListeners(
  ops: OpsLoggerService,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const onError = (event: ErrorEvent) => {
    ops.captureException(event.error ?? event.message, {
      source: 'window.error',
      ...(event.filename
        ? { filename: event.filename, line: event.lineno, column: event.colno }
        : {}),
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    ops.captureException(event.reason, { source: 'window.unhandledrejection' });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
