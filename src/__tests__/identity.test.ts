import { describe, expect, it, vi } from "vitest";
import { expiresSoon, IdentityError, IdentityHolder, toWire } from "../core/identity";

const SIGNATURE = "a".repeat(64);
const now = () => Math.floor(Date.now() / 1000);

describe("toWire", () => {
  it("maps the app's identity to the server's shape", () => {
    expect(toWire({ userId: "user_42-A", email: "a@b.co", name: " Ana ", ts: 1_700_000_000, signature: SIGNATURE.toUpperCase() }))
      .toEqual({ id: "user_42-A", email: "a@b.co", name: "Ana", ts: "1700000000", signature: SIGNATURE });
  });

  it("refuses ids the server would not verify", () => {
    for (const userId of ["", "a:b", "é", "x".repeat(65)]) {
      expect(() => toWire({ userId, email: "a@b.co", ts: now(), signature: SIGNATURE })).toThrow(IdentityError);
    }
  });

  it("refuses a malformed signature or timestamp", () => {
    expect(() => toWire({ userId: "1", email: "a@b.co", ts: now(), signature: "abc" })).toThrow(IdentityError);
    expect(() => toWire({ userId: "1", email: "a@b.co", ts: "soon", signature: SIGNATURE })).toThrow(IdentityError);
  });
});

describe("expiresSoon", () => {
  it("is true within the last hour of the 24 h", () => {
    const at = Date.now();
    expect(expiresSoon({ id: "1", email: "e", ts: String(Math.floor(at / 1000) - 22 * 3600), signature: SIGNATURE }, at)).toBe(false);
    expect(expiresSoon({ id: "1", email: "e", ts: String(Math.floor(at / 1000) - 23.5 * 3600), signature: SIGNATURE }, at)).toBe(true);
  });
});

describe("IdentityHolder", () => {
  it("renews an identity about to expire from the app's provider, once for concurrent sends", async () => {
    const old = { userId: "1", email: "a@b.co", ts: now() - 23.5 * 3600, signature: SIGNATURE };
    const fresh = { ...old, ts: now() };
    const provider = vi.fn().mockResolvedValueOnce(old).mockResolvedValue(fresh);
    const holder = new IdentityHolder();
    await holder.set(provider);
    const [a, b] = await Promise.all([holder.fresh(), holder.fresh()]);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(a?.ts).toBe(String(Math.floor(fresh.ts)));
    expect(b).toEqual(a);
  });

  it("keeps a fixed identity as long as it lasts, and nothing once cleared", async () => {
    const holder = new IdentityHolder();
    await holder.set({ userId: "1", email: "a@b.co", ts: now(), signature: SIGNATURE });
    expect((await holder.fresh())?.id).toBe("1");
    holder.clear();
    expect(await holder.fresh()).toBeNull();
  });
});
