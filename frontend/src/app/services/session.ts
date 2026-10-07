/** Reads the expiry of a sign-in token (a JWT's `exp`, in seconds). Pure, so it can be tested without Angular. */

function decodeBase64Url(part: string): string {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bytes = atob(padded);
  // JWT payloads are UTF-8
  return decodeURIComponent(Array.from(bytes, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
}

/** True when the token is a JWT whose expiry has passed. Anything that is not a JWT with an `exp` (e.g. the offline sign-in token) is not treated as expired. */
export function isTokenExpired(token: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!token) return true;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    return typeof payload?.exp === 'number' && payload.exp * 1000 <= nowMs;
  } catch {
    return false;
  }
}
