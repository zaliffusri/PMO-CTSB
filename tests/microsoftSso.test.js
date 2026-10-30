import { describe, it, expect, beforeEach } from 'vitest';
import {
  decodeJwtPayload,
  emailFromMicrosoftProfile,
  nameFromMicrosoftProfile,
  findOrCreateMicrosoftUser,
  saveOAuthState,
  takeOAuthState,
  isAzureAdConfigured,
  ssoErrorRedirect,
} from '../lib/microsoftSso.js';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeStore(seedUsers = []) {
  const users = seedUsers.map((u, i) => ({
    id: u.id || i + 1,
    active: true,
    role: 'user',
    ...u,
  }));
  const people = [];
  let nextId = users.length + 1;
  let nextPerson = 1;
  return {
    users,
    people,
    async listUsers() { return users; },
    async listPeople() { return people; },
    async findUserByEmail(email) {
      return users.find((u) => u.email === String(email).toLowerCase()) || null;
    },
    async findUserById(id) {
      return users.find((u) => u.id === id) || null;
    },
    async addUser(row) {
      const id = nextId++;
      users.push({ id, active: true, ...row });
      return id;
    },
    async addPerson(row) {
      const id = nextPerson++;
      people.push({ id, ...row });
      return id;
    },
    async updatePerson(id, patch) {
      const i = people.findIndex((p) => p.id === id);
      if (i >= 0) people[i] = { ...people[i], ...patch };
    },
    async appendAuditLog() {},
  };
}

describe('microsoft SSO helpers', () => {
  it('decodes a JWT payload', () => {
    const payload = { preferred_username: 'ada@contoso.com', name: 'Ada' };
    const token = `hdr.${b64url(payload)}.sig`;
    expect(decodeJwtPayload(token)).toMatchObject(payload);
  });

  it('picks email from id token or Graph', () => {
    expect(emailFromMicrosoftProfile({
      idToken: { preferred_username: 'ada@contoso.com' },
    })).toBe('ada@contoso.com');
    expect(emailFromMicrosoftProfile({
      idToken: {},
      graph: { mail: 'lee@fabrikam.com' },
    })).toBe('lee@fabrikam.com');
  });

  it('builds a display name', () => {
    expect(nameFromMicrosoftProfile({
      idToken: { given_name: 'Ada', family_name: 'Lovelace' },
      email: 'ada@contoso.com',
    })).toBe('Ada Lovelace');
  });

  it('signs in an existing user', async () => {
    const store = makeStore([{ id: 3, email: 'ada@contoso.com', name: 'Ada', role: 'pmo' }]);
    const { user, created } = await findOrCreateMicrosoftUser(store, {
      email: 'ada@contoso.com',
      name: 'Ada Lovelace',
    });
    expect(created).toBe(false);
    expect(user.id).toBe(3);
    expect(user.role).toBe('pmo');
  });

  it('creates the first Microsoft user as admin', async () => {
    const store = makeStore([]);
    const { user, created } = await findOrCreateMicrosoftUser(store, {
      email: 'first@contoso.com',
      name: 'First User',
    });
    expect(created).toBe(true);
    expect(user.role).toBe('admin');
    expect(user.email).toBe('first@contoso.com');
  });

  it('blocks unknown emails when signup is off', async () => {
    const store = makeStore([{ email: 'admin@contoso.com', role: 'admin' }]);
    await expect(findOrCreateMicrosoftUser(store, {
      email: 'guest@outlook.com',
      name: 'Guest',
      allowSignup: false,
    })).rejects.toMatchObject({ code: 'no_account' });
  });

  it('rejects inactive accounts', async () => {
    const store = makeStore([{ email: 'old@contoso.com', active: false }]);
    await expect(findOrCreateMicrosoftUser(store, {
      email: 'old@contoso.com',
    })).rejects.toMatchObject({ code: 'inactive' });
  });

  it('stores one-time OAuth state', () => {
    saveOAuthState('abc', { verifier: 'v' });
    expect(takeOAuthState('abc').verifier).toBe('v');
    expect(takeOAuthState('abc')).toBeNull();
  });

  it('treats client id as configured', () => {
    expect(isAzureAdConfigured({ clientId: 'app-id' })).toBe(true);
    expect(isAzureAdConfigured({})).toBe(false);
  });

  it('builds an error return URL', () => {
    expect(ssoErrorRedirect('http://localhost:5173', 'cancelled'))
      .toBe('http://localhost:5173/?sso_error=cancelled');
  });
});
