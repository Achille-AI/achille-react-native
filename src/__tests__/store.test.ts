import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memory } from "./stubs/async-storage";
import { AchilleStore } from "../core/store";

const SIGNATURE = "b".repeat(64);
const TOKEN_A = "a".repeat(64);
const TOKEN_B = "c".repeat(64);
const identity = (userId: string) => ({ userId, email: `${userId}@x.co`, ts: Math.floor(Date.now() / 1000), signature: SIGNATURE });

type Call = { method: string; path: string; body: unknown };

function mockServer(routes: Record<string, (body: unknown) => unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { method: string; body?: string }) => {
    const path = new URL(url).pathname.replace("/widget_api/v1/", "");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path, body });
    const answer = routes[`${init.method} ${path}`]?.(body) ?? { error: "nope" };
    return { status: 200, ok: true, text: async () => JSON.stringify(answer) };
  }));
  return calls;
}

const conversations = { conversations: [], unread: 2 };

describe("AchilleStore", () => {
  beforeEach(() => memory.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("adopts the token the server hands back to a signed-in user", async () => {
    const calls = mockServer({
      "GET configuration": () => ({ primary_color: "#123456", mode: "human" }),
      "POST session": () => ({ session_token: TOKEN_A }),
      "GET conversations": () => conversations,
    });
    const store = new AchilleStore();
    const unread = vi.fn();
    store.addListener("unreadCountChanged", unread);
    store.initialize({ widgetKey: "key", apiUrl: "https://api.test" });
    await store.loginUser(identity("u1"));

    expect(calls.find((c) => c.path === "session")?.body).toEqual({
      customer_identity: { id: "u1", email: "u1@x.co", ts: expect.any(String), signature: SIGNATURE },
    });
    expect(store.getState()).toMatchObject({ sessionToken: TOKEN_A, signedIn: true });
    expect(store.getState().list.unread).toBe(2);
    expect(unread).toHaveBeenCalledWith(2);
    expect(JSON.parse(memory.get("@achille/chat/key")!)).toMatchObject({ sessionToken: TOKEN_A, userId: "u1" });
  });

  it("drops another user's conversations when a different user signs in", async () => {
    memory.set("@achille/chat/key", JSON.stringify({ sessionToken: TOKEN_A, userId: "u1" }));
    mockServer({ "POST session": () => ({ session_token: null }), "GET conversations": () => conversations });
    const store = new AchilleStore();
    store.initialize({ widgetKey: "key", apiUrl: "https://api.test" });
    await store.loginUser(identity("u2"));
    expect(store.getState().sessionToken).toBeNull();
  });

  it("keeps the device's own conversations when the server knows none for the user", async () => {
    memory.set("@achille/chat/key", JSON.stringify({ sessionToken: TOKEN_B, userId: null }));
    mockServer({ "POST session": () => ({ session_token: null }), "GET conversations": () => conversations });
    const store = new AchilleStore();
    store.initialize({ widgetKey: "key", apiUrl: "https://api.test" });
    await store.loginUser(identity("u1"));
    expect(store.getState().sessionToken).toBe(TOKEN_B);
  });

  it("forgets the user and their token on logout", async () => {
    memory.set("@achille/chat/key", JSON.stringify({ sessionToken: TOKEN_A, userId: "u1" }));
    mockServer({ "POST session": () => ({ session_token: TOKEN_A }), "GET conversations": () => conversations });
    const store = new AchilleStore();
    store.initialize({ widgetKey: "key", apiUrl: "https://api.test" });
    await store.loginUser(identity("u1"));
    await store.logout();
    expect(store.getState()).toMatchObject({ sessionToken: null, signedIn: false, list: { unread: 0 } });
    expect(JSON.parse(memory.get("@achille/chat/key")!)).toMatchObject({ sessionToken: null, userId: null });
  });

  it("starts over when the server no longer knows the token", async () => {
    memory.set("@achille/chat/key", JSON.stringify({ sessionToken: TOKEN_A }));
    mockServer({ "GET conversations": () => ({ session_ended: true }) });
    const store = new AchilleStore();
    store.initialize({ widgetKey: "key", apiUrl: "https://api.test" });
    await vi.waitFor(() => expect(store.getState().sessionToken).toBeNull());
  });
});
