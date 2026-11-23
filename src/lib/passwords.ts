import { hash, verify } from "@node-rs/argon2";
import crypto from "node:crypto";
import { DomainError } from "./errors";

export async function hashPassword(pw: string) {
  return hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hashStr: string, pw: string) {
  try {
    return await verify(hashStr, pw);
  } catch {
    return false;
  }
}

export function checkPasswordPolicy(pw: string) {
  if (pw.length < 12) throw new DomainError("Use at least 12 characters.");
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) throw new DomainError("Use letters and at least one number.");
}

/** Temporary password shown once to the Super Admin, e.g. "Kfq7-Lm2x-Pw9r". */
export function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const pick = () => Array.from(crypto.randomBytes(4), (b) => alphabet[b % alphabet.length]).join("");
  return `${pick()}-${pick()}-${pick()}`;
}
