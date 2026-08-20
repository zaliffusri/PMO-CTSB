/**
 * Structured JSON logging with secret redaction.
 * Never log Authorization headers, bearer tokens, passwords, or sessions_app fields.
 */

const SENSITIVE_KEY = /^(authorization|cookie|password|passwd|secret|token|api[_-]?key|service[_-]?role|smtp_pass|private[_-]?key|bearer)$/i;
const SENSITIVE_VALUE = /\b(bearer\s+[a-z0-9._\-+=\/]+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/i;

function redactValue(key, value) {
  if (value == null) return value;
  if (typeof key === 'string' && SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    if (SENSITIVE_VALUE.test(value)) return '[REDACTED]';
    if (value.length > 2000) return `${value.slice(0, 2000)}…[truncated]`;
    return value;
  }
  if (Array.isArray(value)) return value.map((v, i) => redactValue(String(i), v));
  if (typeof value === 'object') return redactObject(value);
  return value;
}

export function redactObject(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: redactValue('message', obj.message),
      stack: process.env.NODE_ENV === 'production' ? undefined : obj.stack,
    };
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

function write(level, msg, meta) {
  const line = {
    level,
    msg: String(msg || ''),
    time: new Date().toISOString(),
    service: 'pmo-ctsb-api',
    ...(meta && typeof meta === 'object' ? redactObject(meta) : {}),
  };
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const logger = {
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
  debug: (msg, meta) => {
    if (process.env.LOG_LEVEL === 'debug') write('debug', msg, meta);
  },
};
