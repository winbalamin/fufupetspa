import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = "iMnL$s491Dih$R";
export const DEFAULT_STAFF_PASSWORD = "password";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [prefix, salt, hash] = stored.split(":");
  if (prefix !== "scrypt" || !salt || !hash) return false;

  const derived = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
  } catch {
    return false;
  }
}

export function verifyAdminCredentials(username: string, password: string) {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}
