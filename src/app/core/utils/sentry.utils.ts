// Utility helpers for testing Sentry integration
export function throwTestError(): never {
  // Throwing an error will bubble to Angular's ErrorHandler which forwards to Sentry
  throw new Error('Sentry test error — thrown by throwTestError');
}

// Attach to window for quick manual testing from the browser console
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).throwTestError = throwTestError;
} catch {
  // ignore if window is not available in the current environment
}


