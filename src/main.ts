import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';
import { APP_VERSION } from './environments/version';

// Sentry: initialize early so captured errors include startup failures
// Use @sentry/angular which is present in package.json. Cast environment to any
// to avoid needing a strict environment type for the optional sentry block.
import * as Sentry from '@sentry/angular';

const _env: any = environment;
const sentryCfg = _env?.sentry;
if (sentryCfg?.dsn) {
  Sentry.init({
    dsn: sentryCfg.dsn,
    // keep sampling configurable even without tracing integration
    tracesSampleRate: sentryCfg.tracesSampleRate ?? 0,
    environment: environment.production ? 'production' : 'development',
    release: APP_VERSION?.version ?? undefined,
  });
}

bootstrapApplication(App, appConfig)
  .catch((err) => {
    // ensure Sentry receives bootstrap errors when configured
    try { Sentry.captureException(err); } catch {
      /* ignore */
    }
    // still surface to console during development
    console.error(err);
  });
