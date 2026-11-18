// The signed-in user. The server verifies the signature and its age
// (24 h, 5 min of clock skew); an identity that does
// not verify leaves the visitor anonymous without any error, so the SDK
// renews one that is about to expire instead of sending it stale.
import type { WireIdentity } from "./api";
import type { AchilleIdentity, IdentitySource } from "./types";

const MAX_AGE_S = 24 * 60 * 60;
// Renewed this long before the server would refuse it.
const RENEW_MARGIN_S = 60 * 60;

// The server's rule for a user id: no ":", so the signed
// string splits unambiguously.
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export class IdentityError extends Error {}

export function toWire(identity: AchilleIdentity): WireIdentity {
  const userId = String(identity.userId ?? "");
  const email = String(identity.email ?? "").trim();
  const ts = String(identity.ts ?? "");
  const signature = String(identity.signature ?? "").toLowerCase();
  if (!USER_ID.test(userId)) {
    throw new IdentityError("Achille: userId must be 1 to 64 letters, digits, \"_\" or \"-\".");
  }
  if (!email || email.length > 254) throw new IdentityError("Achille: email is required.");
  if (!/^\d{1,12}$/.test(ts)) throw new IdentityError("Achille: ts must be a Unix time in seconds.");
  if (!/^[0-9a-f]{64}$/.test(signature)) {
    throw new IdentityError("Achille: signature must be an HMAC-SHA256 in hex.");
  }
  const name = identity.name?.trim().slice(0, 200);
  return { id: userId, email: identity.email, ts, signature, ...(name ? { name } : {}) };
}

export function expiresSoon(identity: WireIdentity, nowMs = Date.now()): boolean {
  return Number(identity.ts) + MAX_AGE_S - RENEW_MARGIN_S <= nowMs / 1000;
}

// Holds the identity and renews it from the app's provider when it nears
// expiry. A fixed identity is used as long as it lasts.
export class IdentityHolder {
  private source: IdentitySource | null = null;
  private current: WireIdentity | null = null;
  private renewing: Promise<WireIdentity | null> | null = null;

  get userId(): string | null {
    return this.current?.id ?? null;
  }

  get email(): string | null {
    return this.current?.email ?? null;
  }

  async set(source: IdentitySource): Promise<WireIdentity> {
    this.source = source;
    this.renewing = null;
    this.current = toWire(typeof source === "function" ? await source() : source);
    return this.current;
  }

  clear() {
    this.source = null;
    this.current = null;
    this.renewing = null;
  }

  // The identity to send now: renewed first when it is about to expire and
  // the app gave a way to; null when there is none (anonymous).
  async fresh(): Promise<WireIdentity | null> {
    const current = this.current;
    if (!current) return null;
    if (!expiresSoon(current) || typeof this.source !== "function") return current;
    const source = this.source;
    this.renewing ??= source()
      .then((identity) => {
        if (this.source !== source) return this.current;
        this.current = toWire(identity);
        return this.current;
      })
      .catch(() => this.current)
      .finally(() => {
        this.renewing = null;
      });
    return this.renewing;
  }
}
