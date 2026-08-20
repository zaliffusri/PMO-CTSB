/**
 * Optional Sentry error tracking for serverless API.
 * No-ops when SENTRY_DSN is unset. Scrubs auth/secrets before send.
 */
import { logger, redactObject } from './logger.js';

let sentry = null;
let initAttempted = false;

const DENY_REQUEST_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-api-key',
  'x-supabase-key',
]);

function scrubEvent(event) {
  if (!event || typeof event !== 'object') return event;
  if (event.request) {
    const headers = event.request.headers;
    if (headers && typeof headers === 'object') {
      const next = { ...headers };
      for (const key of Object.keys(next)) {
        if (DENY_REQUEST_HEADERS.has(String(key).toLowerCase())) {
          next[key] = '[REDACTED]';
        }
      }
      event.request.headers = next;
    }
    if (event.request.data) {
      event.request.data = redactObject(event.request.data);
    }
    if (event.request.query_string && /token|password|secret/i.test(String(event.request.query_string))) {
      event.request.query_string = '[REDACTED]';
    }
  }
  if (event.extra) event.extra = redactObject(event.extra);
  if (event.contexts) event.contexts = redactObject(event.contexts);
  // Never attach env dumps
  if (event.contexts?.runtime?.env) delete event.contexts.runtime.env;
  return event;
}

export async function initSentry() {
  if (initAttempted) return sentry;
  initAttempted = true;
  const dsn = String(process.env.SENTRY_DSN || '').trim();
  if (!dsn) {
    logger.debug('Sentry disabled (SENTRY_DSN unset)');
    return null;
  }
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT
        || process.env.VERCEL_ENV
        || process.env.NODE_ENV
        || 'development',
      release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.05),
      beforeSend(event) {
        return scrubEvent(event);
      },
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb?.data) breadcrumb.data = redactObject(breadcrumb.data);
        if (breadcrumb?.message && /bearer|password|token/i.test(breadcrumb.message)) {
          breadcrumb.message = '[REDACTED]';
        }
        return breadcrumb;
      },
    });
    sentry = Sentry;
    logger.info('Sentry initialized');
    return sentry;
  } catch (err) {
    logger.warn('Sentry init failed', { err: err?.message || String(err) });
    return null;
  }
}

export function captureException(err, context) {
  if (!sentry) {
    logger.error('unhandled_error', { err, ...context });
    return;
  }
  sentry.withScope((scope) => {
    if (context) {
      const safe = redactObject(context);
      Object.entries(safe).forEach(([k, v]) => scope.setExtra(k, v));
    }
    sentry.captureException(err);
  });
}

export function sentryRequestHandler() {
  return (req, res, next) => next();
}
