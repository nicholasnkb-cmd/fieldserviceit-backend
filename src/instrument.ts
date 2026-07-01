import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN;

export function initializeSentry() {
  try {
    Sentry.init({
      dsn,
      enabled: Boolean(dsn) && process.env.SENTRY_ENABLED !== 'false',
      environment: process.env.NODE_ENV || 'development',
      release: process.env.APP_VERSION || process.env.GITHUB_SHA,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
      sendDefaultPii: false,
      beforeSend(event) {
        delete event.user;
        if (event.request) {
          delete event.request.cookies;
          delete event.request.data;
          delete event.request.headers;
        }
        return event;
      },
    });
  } catch (error) {
    console.error('Sentry initialization failed; continuing without telemetry:', error instanceof Error ? error.message : 'unknown error');
  }
}
