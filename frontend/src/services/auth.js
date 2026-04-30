const SESSION_KEY = "fitLedger-session";
const TOKEN_KEY = "token";

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  try {
    return window.atob(padded);
  } catch (error) {
    return "";
  }
}

function parseTokenPayload(token) {
  if (typeof token !== "string") {
    return null;
  }

  const [, payload] = token.split(".");

  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(payload));
  } catch (error) {
    return null;
  }
}

export function getTokenExpiryTime(token) {
  const payload = parseTokenPayload(token);
  return typeof payload?.exp === "number" ? payload.exp * 1000 : null;
}

export function isTokenExpired(token) {
  const expiryTime = getTokenExpiryTime(token);
  return expiryTime !== null && expiryTime <= Date.now();
}

export function getStoredToken() {
  const token = localStorage.getItem(TOKEN_KEY);

  if (!token) {
    return null;
  }

  const expiryTime = getTokenExpiryTime(token);

  if (!expiryTime || expiryTime <= Date.now()) {
    clearSession();
    return null;
  }

  return token;
}

export function getStoredSession() {
  const token = getStoredToken();
  const raw = localStorage.getItem(SESSION_KEY);

  if (!token || !raw) {
    if (!token && raw) {
      clearSession();
    }
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    clearSession();
    return null;
  }
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function getDefaultRouteForRole(role) {
  return role === "admin" ? "/admin/gym-owners" : "/dashboard";
}
