import { createHash } from "crypto";

/** Name of the httpOnly auth cookie set after a successful login. */
export const AUTH_COOKIE = "gbrain_auth";

/**
 * The cookie value for a given password: a SHA-256 hex digest, so the raw
 * password never lives in the cookie and rotating PASSWORD invalidates old
 * sessions automatically. This is a lightweight site gate, not full auth.
 */
export function authToken(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}
