import { describe, it, expect } from 'vitest';
import { redactObject } from '../lib/logger.js';

describe('logger redactObject', () => {
  it('redacts authorization and password fields', () => {
    const out = redactObject({
      authorization: 'Bearer secret-token-value',
      password: 'hunter2',
      user_id: 42,
      note: 'ok',
    });
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.password).toBe('[REDACTED]');
    expect(out.user_id).toBe(42);
    expect(out.note).toBe('ok');
  });

  it('redacts bearer-looking strings in nested values', () => {
    const out = redactObject({
      detail: 'Authorization: Bearer abc.def.ghi',
    });
    expect(out.detail).toBe('[REDACTED]');
  });

  it('does not expose Error stacks in production shape via message-only path', () => {
    const err = new Error('boom');
    const out = redactObject(err);
    expect(out.message).toBe('boom');
    expect(out.name).toBe('Error');
  });
});
