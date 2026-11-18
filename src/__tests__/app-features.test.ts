import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memory } from "./stubs/async-storage";
import { AchilleStore } from "../core/store";
import { Achille } from "../Achille";


type Call = { method: string; path: string; body: Record<string, unknown> | null };

function mockServer(routes: Record<string, (body: Record<string, unknown> | null) => unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { method: string; body?: string }) => {
    const path = new URL(url).pathname.replace("/widget_api/v1/", "");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path, body });
    const answer = routes[`${init.method} ${path}`]?.(body) ?? {};
    return { status: 200, ok: true, text: async () => JSON.stringify(answer) };
  }));
  return calls;
}

async function ready(store: AchilleStore) {
  store.initialize({ widgetKey: "key", apiUrl: "https://api.test" });
  await vi.waitFor(() => expect(JSON.parse(memory.get("@achille/chat/key") ?? "{}").deviceId).toMatch(/^[0-9a-f-]{36}$/));
}

describe("app features", () => {
  beforeEach(() => memory.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("merges attributes, drops what the server would refuse and removes nulls", async () => {
    mockServer({});
    const store = new AchilleStore();
    await ready(store);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await store.updateUser({ name: " Ana ", customAttributes: { plan: "premium", orders: 12, "bad/key": 1 } });
    await store.updateUser({ customAttributes: { orders: null, beta: true, nested: { a: 1 } as never } });
    expect(store.userAttributes()).toEqual({ name: "Ana", custom: { plan: "premium", beta: true } });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("forgets the attributes at logout", async () => {
    mockServer({});
    const store = new AchilleStore();
    await ready(store);
    await store.updateUser({ customAttributes: { plan: "premium" } });
    await store.logout();
    expect(store.userAttributes()).toEqual({ name: null, custom: {} });
  });

  it("shows a banner for an event the chat has a message for", async () => {
    const calls = mockServer({
      "POST app_events": () => ({ message: { display_id: "d1", body: "Votre colis A123 a du retard", display: "banner" } }),
    });
    const store = new AchilleStore();
    await ready(store);
    await store.logEvent("delivery_delayed", { order: "A123" });
    const event = calls.find((c) => c.path === "app_events")!.body!;
    expect(event).toMatchObject({ name: "delivery_delayed", metadata: { order: "A123" }, locale: expect.any(String) });
    expect(event.device_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.getState().banner).toEqual({ displayId: "d1", body: "Votre colis A123 a du retard", display: "banner" });
    expect(store.getState().presentation).toBeNull();
  });

  it("opens the chat on the message when the chat asks for it", async () => {
    mockServer({ "POST app_events": () => ({ message: { display_id: "d2", body: "Besoin d'aide ?", display: "chat" } }) });
    const store = new AchilleStore();
    await ready(store);
    await store.logEvent("checkout_failed");
    expect(store.getState().presentation?.target).toEqual({
      screen: "composer",
      proactive: { displayId: "d2", body: "Besoin d'aide ?", display: "chat" },
    });
  });

  it("does nothing for an event without a message, and refuses a malformed name", async () => {
    const calls = mockServer({ "POST app_events": () => ({ message: null }) });
    const store = new AchilleStore();
    await ready(store);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await store.logEvent("app_opened");
    await store.logEvent("not valid!");
    expect(calls.filter((c) => c.path === "app_events")).toHaveLength(1);
    expect(store.getState()).toMatchObject({ banner: null, presentation: null });
  });

  it("sends the user's attributes with an event, for the proactive messages' conditions", async () => {
    const calls = mockServer({ "POST app_events": () => ({ message: null }) });
    const store = new AchilleStore();
    await ready(store);
    await store.logEvent("app_opened");
    await store.updateUser({ customAttributes: { plan: "premium" } });
    await store.logEvent("app_opened");
    const events = calls.filter((c) => c.path === "app_events").map((c) => c.body!);
    expect(events[0].customer_attributes).toBeUndefined();
    expect(events[1].customer_attributes).toEqual({ plan: "premium" });
  });

  it("keeps the user's attributes in the state the chat's conditions read", async () => {
    mockServer({});
    const store = new AchilleStore();
    await ready(store);
    await store.updateUser({ customAttributes: { plan: "premium", orders_count: 3 } });
    expect(store.getState().attributes).toEqual({ plan: "premium", orders_count: 3 });
    await store.logout();
    expect(store.getState().attributes).toEqual({});
  });

  it("opens the chat with a context, for this opening only", async () => {
    mockServer({});
    const store = new AchilleStore();
    await ready(store);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    store.present({ screen: "home" }, { entry: "order_help", order_id: "A123", gone: null, "bad/key": "x" });
    expect(store.getState().presentation?.context).toEqual({ entry: "order_help", order_id: "A123" });
    expect(warn).toHaveBeenCalledTimes(1);
    store.present({ screen: "messages" });
    expect(store.getState().presentation?.context).toEqual({});
    store.dismiss();
    expect(store.getState().presentation).toBeNull();
  });
});

describe("push payloads", () => {
  it("recognises the chat's pushes only", () => {
    expect(Achille.isAchillePush({ achille: "1", conversation_id: "c1" })).toBe(true);
    expect(Achille.isAchillePush({ achille: "1" })).toBe(false);
    expect(Achille.isAchillePush({ conversation_id: "c1" })).toBe(false);
    expect(Achille.isAchillePush(undefined)).toBe(false);
    expect(Achille.handlePush({ type: "promo" })).toBe(false);
  });
});
