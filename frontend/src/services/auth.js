const SESSION_KEY = "fitLedger-session";
const TOKEN_KEY = "token";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredSession() {
  const raw = localStorage.getItem(SESSION_KEY);

  if (!raw) {
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
