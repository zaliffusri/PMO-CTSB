import crypto from 'crypto';
import { hashPassword } from './auth.js';
import { syncUserToTeamPerson } from './teamUserSync.js';

const SSO_SCOPES = 'openid profile email';
const STATE_TTL_MS = 10 * 60 * 1000;
const pendingByState = new Map();

function trim(v) {
  return v == null ? '' : String(v).trim();
}

export function createPkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(24).toString('hex');
  return { verifier, challenge, state };
}

export function saveOAuthState(state, data) {
  pruneOAuthState();
  pendingByState.set(state, { ...data, exp: Date.now() + STATE_TTL_MS });
}

export function takeOAuthState(state) {
  pruneOAuthState();
  const row = pendingByState.get(state);
  pendingByState.delete(state);
  if (!row || row.exp < Date.now()) return null;
  return row;
}

function pruneOAuthState() {
  const now = Date.now();
  for (const [key, row] of pendingByState) {
    if (!row || row.exp < now) pendingByState.delete(key);
  }
}

export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function emailFromMicrosoftProfile({ idToken = {}, graph = null } = {}) {
  const candidates = [
    idToken.preferred_username,
    idToken.email,
    idToken.upn,
    idToken.unique_name,
    graph?.mail,
    graph?.userPrincipalName,
  ];
  for (const value of candidates) {
    const email = trim(value).toLowerCase();
    if (email.includes('@')) return email;
  }
  return '';
}

export function nameFromMicrosoftProfile({ idToken = {}, graph = null, email = '' } = {}) {
  const given = trim(idToken.given_name || graph?.givenName);
  const family = trim(idToken.family_name || graph?.surname);
  const combined = [given, family].filter(Boolean).join(' ');
  const display = trim(idToken.name || graph?.displayName || combined);
  if (display) return display.slice(0, 120);
  const local = String(email || '').split('@')[0] || 'Microsoft user';
  return local.slice(0, 120);
}

export function requestOrigin(req) {
  const xfHost = String(req?.get?.('x-forwarded-host') || '').split(',')[0].trim();
  const host = xfHost || String(req?.get?.('host') || '').split(',')[0].trim();
  const xfProto = String(req?.get?.('x-forwarded-proto') || '').split(',')[0].trim();
  const proto = xfProto || req?.protocol || 'http';
  return host ? `${proto}://${host}` : '';
}

export function frontendOrigin(req, storedOrigin = '') {
  const appUrl = trim(process.env.APP_URL).replace(/\/$/, '');
  if (appUrl) {
    try {
      return new URL(appUrl).origin;
    } catch {
      return appUrl;
    }
  }
  if (storedOrigin) return String(storedOrigin).replace(/\/$/, '');
  const referer = req?.get?.('referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* ignore */
    }
  }
  return requestOrigin(req);
}

export function callbackRedirectUri(req, configuredRedirect = '') {
  const fromEnv = trim(configuredRedirect);
  if (fromEnv) return fromEnv;
  const origin = requestOrigin(req);
  return origin ? `${origin}/api/auth/microsoft/callback` : '';
}

export async function resolveAzureAdConfig(getSettings) {
  const env = {
    clientId: trim(process.env.AZURE_AD_CLIENT_ID),
    tenantId: trim(process.env.AZURE_AD_TENANT_ID) || 'common',
    clientSecret: trim(process.env.AZURE_AD_CLIENT_SECRET),
    redirectUri: trim(process.env.AZURE_AD_REDIRECT_URI),
    allowSignup: process.env.AZURE_AD_ALLOW_SIGNUP !== '0',
  };
  let settings = {
    clientId: '',
    tenantId: 'common',
    clientSecret: '',
    allowSignup: true,
  };
  if (typeof getSettings === 'function') {
    try {
      const s = (await getSettings()) || {};
      settings = {
        clientId: trim(s.azure_ad_client_id),
        tenantId: trim(s.azure_ad_tenant_id) || 'common',
        clientSecret: trim(s.azure_ad_client_secret),
        allowSignup: s.azure_ad_allow_signup !== false,
      };
    } catch {
      /* settings unavailable */
    }
  }
  const fromEnv = Boolean(env.clientId);
  return {
    clientId: env.clientId || settings.clientId,
    tenantId: fromEnv ? env.tenantId : (settings.tenantId || env.tenantId),
    clientSecret: env.clientSecret || settings.clientSecret,
    redirectUri: env.redirectUri,
    allowSignup: fromEnv ? env.allowSignup : settings.allowSignup,
    source: env.clientId ? 'env' : (settings.clientId ? 'settings' : null),
  };
}

export function isAzureAdConfigured(cfg) {
  return Boolean(cfg?.clientId);
}

export function authorizeUrl({ cfg, redirectUri, state, challenge }) {
  const tenant = encodeURIComponent(cfg.tenantId || 'common');
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`
    + `?client_id=${encodeURIComponent(cfg.clientId)}`
    + `&response_type=code`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&response_mode=query`
    + `&scope=${encodeURIComponent(SSO_SCOPES)}`
    + `&state=${encodeURIComponent(state)}`
    + `&code_challenge=${encodeURIComponent(challenge)}`
    + `&code_challenge_method=S256`
    + `&prompt=select_account`;
}

export async function exchangeAuthorizationCode({ cfg, code, redirectUri, verifier, fetchImpl = fetch }) {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    scope: SSO_SCOPES,
  });
  if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret);
  const tenant = cfg.tenantId || 'common';
  const res = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || 'Token exchange failed');
    err.code = 'token_failed';
    throw err;
  }
  return data;
}

export async function fetchGraphMe(accessToken, fetchImpl = fetch) {
  if (!accessToken) return null;
  try {
    const res = await fetchImpl('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,givenName,surname', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function findOrCreateMicrosoftUser(store, { email, name, allowSignup = true }) {
  const key = trim(email).toLowerCase();
  if (!key || !key.includes('@')) {
    const err = new Error('Microsoft did not return an email address');
    err.code = 'no_email';
    throw err;
  }
  const existing = await store.findUserByEmail(key);
  if (existing) {
    if (existing.active === false) {
      const err = new Error('Account is inactive');
      err.code = 'inactive';
      throw err;
    }
    return { user: existing, created: false };
  }
  const users = typeof store.listUsers === 'function' ? await store.listUsers() : [];
  const isFirstUser = !users.length;
  if (!allowSignup && !isFirstUser) {
    const err = new Error('No C360 user exists for this Microsoft email');
    err.code = 'no_account';
    throw err;
  }
  const id = await store.addUser({
    name: name || key.split('@')[0],
    email: key,
    role: isFirstUser ? 'admin' : 'user',
    password_hash: hashPassword(crypto.randomBytes(32).toString('hex')),
  });
  const created = await store.findUserById(id);
  try {
    await syncUserToTeamPerson(store, {
      userId: id,
      name: created.name,
      email: created.email,
      role: created.role,
    });
  } catch (e) {
    console.warn('microsoft SSO team sync failed:', e?.message || e);
  }
  if (typeof store.appendAuditLog === 'function') {
    try {
      await store.appendAuditLog(
        { id: created.id, email: created.email, name: created.name },
        {
          action: 'create',
          target_type: 'user',
          target_id: id,
          summary: `Signed in with Microsoft and created user "${created.name}" (${created.email})`,
        },
      );
    } catch {
      /* audit is best-effort */
    }
  }
  return { user: created, created: true };
}

export function ssoErrorRedirect(origin, code) {
  const base = String(origin || '').replace(/\/$/, '') || '/';
  const safe = encodeURIComponent(code || 'failed');
  return `${base}/?sso_error=${safe}`;
}

export function ssoSuccessRedirect(origin, token) {
  const base = String(origin || '').replace(/\/$/, '') || '/';
  return `${base}/?sso_token=${encodeURIComponent(token)}`;
}
