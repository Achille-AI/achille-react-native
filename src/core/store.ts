// The SDK's state outside React: the chat's configuration, the visitor's
// session, their conversations (polled for the unread count, chat open or
// not), the user's attributes, the message an app event brought up, and
// whether the chat is on screen. The UI reads it
// with useSyncExternalStore; the app through the Achille object.
import { AppState, type NativeEventSubscription } from "react-native";
import { parseConversationList, type ConversationSummary, type ListStatus } from "../shared/conversations";
import { withReadableText } from "../shared/readable-color";
import { DEFAULT_API_URL, WidgetApi } from "./api";
import { IdentityHolder, type IdentityError } from "./identity";
import { EMPTY, load, save, type Saved } from "./storage";
import type {
  AchilleContext,
  AchilleEvents,
  AchilleOptions,
  AchilleUserAttributes,
  AttributeValue,
  IdentitySource,
  PresentTarget,
  ProactiveMessage,
  WidgetConfig,
} from "./types";

export interface ListState {
  status: ListStatus;
  conversations: ConversationSummary[];
  unread: number;
}

export interface State {
  initialized: boolean;
  config: WidgetConfig | null;
  configFailed: boolean;
  sessionToken: string | null;
  // A signed identity rides with the messages.
  signedIn: boolean;
  list: ListState;
  // The chat on screen, where it was asked to open (`seq` tells two requests
  // for the same place apart) and the context it was opened with.
  presentation: { target: PresentTarget; seq: number; context: AchilleContext } | null;
  // The user's custom attributes (updateUser), which the chat's conditions
  // read.
  attributes: Record<string, AttributeValue>;
  // A proactive message shown as a banner over the app.
  banner: ProactiveMessage | null;
  emailPromptDismissed: boolean;
}

// No token: nothing to wait for, no conversation yet.
const NO_LIST: ListState = { status: "ready", conversations: [], unread: 0 };
const PENDING_LIST: ListState = { status: "pending", conversations: [], unread: 0 };

// The list feeds the badges: often while the chat is open, now and then
// while the app is in front, never in the background.
const OPEN_POLL_MS = 5_000;
const CLOSED_POLL_MS = 20_000;

// The server's bounds (it drops the rest): checked here so the app's mistake
// shows in its own console.
const ATTRIBUTE_KEY = /^[A-Za-z0-9_ .-]{1,64}$/;
const MAX_ATTRIBUTES = 50;
const EVENT_NAME = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_EVENT_METADATA = 20;
const MAX_CONTEXT = 20;

type Listeners = { [K in keyof AchilleEvents]: Set<AchilleEvents[K]> };

function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "fr";
  } catch {
    return "fr";
  }
}

// Not a secret, only this install's name: Math.random is enough (Hermes has
// no crypto.getRandomValues without a polyfill).
export function newDeviceId(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function scalar(value: unknown): value is AttributeValue {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

// Flat values under well-formed keys, at most `max`; what does not fit is
// left out with a warning.
function cleanValues(values: Record<string, unknown> | undefined, max: number, what: string) {
  const kept: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (!ATTRIBUTE_KEY.test(key) || !scalar(value) || Object.keys(kept).length >= max) {
      console.warn(`Achille: ${what} "${key}" left out (flat values, keys of letters, digits, " _.-", ${max} at most).`);
      continue;
    }
    kept[key] = value;
  }
  return kept;
}

function parseProactive(raw: unknown): ProactiveMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const { display_id, body, display } = raw as Record<string, unknown>;
  if (typeof display_id !== "string" || typeof body !== "string" || !body.trim()) return null;
  return { displayId: display_id, body, display: display === "chat" ? "chat" : "banner" };
}

export class AchilleStore {
  private state: State = {
    initialized: false,
    config: null,
    configFailed: false,
    sessionToken: null,
    signedIn: false,
    list: NO_LIST,
    presentation: null,
    attributes: {},
    banner: null,
    emailPromptDismissed: false,
  };
  private subscribers = new Set<() => void>();
  private events: Listeners = { unreadCountChanged: new Set(), windowDidShow: new Set(), windowDidHide: new Set() };
  private saved: Saved = EMPTY;
  private loaded: Promise<void> = Promise.resolve();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  // null before the first change on some React Native versions: in front.
  private appState: string = AppState.currentState ?? "active";
  private appStateSub: NativeEventSubscription | null = null;
  private seq = 0;
  // Bumped when the visitor changes (login, logout, session ended): an
  // answer for the previous one is dropped.
  private generation = 0;

  readonly identity = new IdentityHolder();
  api: WidgetApi | null = null;
  options: AchilleOptions | null = null;
  locale = "fr";

  // ---------------------------------------------------------------------------
  // React

  getState = (): State => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  };

  private set(patch: Partial<State>) {
    const previousUnread = this.state.list.unread;
    this.state = { ...this.state, ...patch };
    this.subscribers.forEach((fn) => fn());
    if (this.state.list.unread !== previousUnread) {
      this.events.unreadCountChanged.forEach((fn) => fn(this.state.list.unread));
    }
  }

  addListener<K extends keyof AchilleEvents>(event: K, fn: AchilleEvents[K]): () => void {
    const set = this.events[event] as Set<AchilleEvents[K]>;
    set.add(fn);
    return () => set.delete(fn);
  }

  // ---------------------------------------------------------------------------
  // Setup

  initialize(options: AchilleOptions) {
    if (!options?.widgetKey) throw new Error("Achille.initialize: widgetKey is required.");
    if (this.options?.widgetKey === options.widgetKey && this.options.apiUrl === options.apiUrl) {
      this.options = options;
      return;
    }
    this.stopPolling();
    this.generation += 1;
    this.options = options;
    this.locale = options.locale || deviceLocale();
    this.api = new WidgetApi(options.apiUrl || DEFAULT_API_URL, options.widgetKey);
    this.set({ initialized: true, config: null, configFailed: false, sessionToken: null, list: NO_LIST, banner: null });
    this.loaded = load(options.widgetKey).then((saved) => {
      this.saved = saved;
      this.set({ attributes: saved.customAttributes });
      if (!saved.deviceId) this.persist({ deviceId: newDeviceId() });
      this.set({
        sessionToken: saved.sessionToken,
        list: saved.sessionToken ? PENDING_LIST : NO_LIST,
        emailPromptDismissed: saved.emailPromptDismissed,
      });
    });
    this.appStateSub ??= AppState.addEventListener("change", (next) => {
      const wasActive = this.appState === "active";
      this.appState = next;
      if (next === "active" && !wasActive) void this.refreshList();
      this.schedulePolling();
    });
    void this.loadConfig();
    void this.loaded.then(() => {
      this.schedulePolling();
      void this.refreshList();
    });
  }

  async loadConfig(): Promise<void> {
    const api = this.api;
    if (!api) return;
    const reply = await api.configuration(this.locale);
    if (api !== this.api) return;
    if (!reply.ok || !reply.data || typeof reply.data.primary_color !== "string") {
      this.set({ configFailed: true });
      return;
    }
    this.set({ config: withReadableText(reply.data), configFailed: false });
  }

  private requireApi(method: string): WidgetApi {
    if (!this.api) throw new Error(`Achille.${method}: call Achille.initialize first.`);
    return this.api;
  }

  // ---------------------------------------------------------------------------
  // The visitor

  // Signs the user in: their messages carry the signed identity (the ticket
  // gets their verified email), and their history follows them to a new
  // device (POST /session gives their token back).
  async loginUser(source: IdentitySource): Promise<void> {
    const api = this.requireApi("loginUser");
    await this.loaded;
    const identity = await this.identity.set(source).catch((error: IdentityError) => {
      this.identity.clear();
      throw error;
    });
    const generation = ++this.generation;
    // Another user's conversations and attributes are not theirs.
    if (this.saved.userId && this.saved.userId !== identity.id) {
      this.persist({ name: null, customAttributes: {} });
      this.adoptToken(null, identity.id);
    }
    this.set({ signedIn: true });
    const reply = await api.session(identity);
    if (generation !== this.generation) return;
    const token = reply.ok ? reply.data?.session_token ?? null : null;
    if (token && token !== this.state.sessionToken) this.adoptToken(token, identity.id);
    else this.persist({ userId: identity.id });
    await this.refreshList();
  }

  // Forgets the user, their attributes and their conversations on this
  // device.
  async logout(): Promise<void> {
    await this.loaded;
    this.generation += 1;
    this.identity.clear();
    this.persist({ name: null, customAttributes: {} });
    this.set({ signedIn: false, banner: null });
    this.adoptToken(null, null);
  }

  // The token the server minted (first message) or handed back (login).
  adoptToken(token: string | null, userId: string | null = this.identity.userId) {
    this.persist({ sessionToken: token, userId });
    this.set({ sessionToken: token, list: token ? PENDING_LIST : NO_LIST });
    this.schedulePolling();
  }

  // The server no longer knows the token: start over.
  sessionEnded(token: string) {
    if (this.state.sessionToken !== token) return;
    this.generation += 1;
    this.adoptToken(null);
  }

  dismissEmailPrompt() {
    this.persist({ emailPromptDismissed: true });
    this.set({ emailPromptDismissed: true });
  }

  private persist(patch: Partial<Saved>) {
    this.saved = { ...this.saved, ...patch };
    if (patch.customAttributes) this.set({ attributes: patch.customAttributes });
    if (this.options) void save(this.options.widgetKey, this.saved);
  }

  // ---------------------------------------------------------------------------
  // Attributes

  // Merged into what the app said before (null removes a key); they ride
  // with each message the user sends.
  // Call it after loginUser: signing in another user forgets the previous
  // one's attributes.
  async updateUser(attributes: AchilleUserAttributes): Promise<void> {
    this.requireApi("updateUser");
    const incoming = cleanValues(attributes.customAttributes, MAX_ATTRIBUTES, "attribute");
    await this.loaded;
    const custom = { ...this.saved.customAttributes, ...incoming };
    for (const [key, value] of Object.entries(custom)) if (value === null) delete custom[key];
    if (Object.keys(custom).length > MAX_ATTRIBUTES) {
      console.warn(`Achille: more than ${MAX_ATTRIBUTES} attributes, the last ones are left out.`);
    }
    const name = attributes.name === undefined ? this.saved.name : attributes.name?.trim().slice(0, 100) || null;
    this.persist({ name, customAttributes: Object.fromEntries(Object.entries(custom).slice(0, MAX_ATTRIBUTES)) });
  }

  // What the next message carries.
  userAttributes(): { name: string | null; custom: Record<string, AttributeValue> } {
    return { name: this.saved.name, custom: this.saved.customAttributes };
  }

  // ---------------------------------------------------------------------------
  // App events and proactive messages

  // Tells the chat something happened in the app. When the chat's settings
  // have a message for it, it shows as a banner over the app or opens the
  // chat on it. Never throws: an event that could not be sent is dropped.
  async logEvent(name: string, metadata?: Record<string, unknown>): Promise<void> {
    const api = this.requireApi("logEvent");
    if (!EVENT_NAME.test(name)) {
      console.warn(`Achille.logEvent: "${name}" is not a valid event name (letters, digits, "_.:-", 64 at most).`);
      return;
    }
    await this.loaded;
    const identity = await this.identity.fresh();
    const reply = await api.appEvent({
      device_id: this.saved.deviceId!,
      name,
      metadata: cleanValues(metadata, MAX_EVENT_METADATA, "event data"),
      // The chat's conditions on its proactive messages read them too.
      customer_attributes: Object.keys(this.saved.customAttributes).length ? this.saved.customAttributes : undefined,
      session_token: this.state.sessionToken ?? undefined,
      customer_identity: identity ?? undefined,
      locale: this.locale,
    });
    const message = reply.ok ? parseProactive(reply.data?.message) : null;
    if (!message) return;
    if (message.display === "chat") this.openProactive(message);
    else if (!this.state.presentation) this.set({ banner: message });
  }

  // A new conversation that starts on the proactive message.
  openProactive(message: ProactiveMessage) {
    this.set({ banner: null });
    this.present({ screen: "composer", proactive: message });
  }

  dismissBanner() {
    this.set({ banner: null });
  }

  // ---------------------------------------------------------------------------
  // The list of conversations

  async refreshList(): Promise<void> {
    const api = this.api;
    const token = this.state.sessionToken;
    if (!api || !token) return;
    const generation = this.generation;
    const reply = await api.conversations(token);
    if (generation !== this.generation || token !== this.state.sessionToken) return;
    if (reply.data?.session_ended === true) return this.sessionEnded(token);
    const parsed = reply.ok ? parseConversationList(reply.data) : null;
    if (!parsed) {
      if (this.state.list.status === "pending") this.set({ list: { ...this.state.list, status: "failed" } });
      return;
    }
    this.set({ list: { status: "ready", conversations: parsed.conversations, unread: parsed.unread } });
  }

  private schedulePolling() {
    this.stopPolling();
    if (!this.api || !this.state.sessionToken || this.appState !== "active") return;
    const every = this.state.presentation ? OPEN_POLL_MS : CLOSED_POLL_MS;
    this.pollTimer = setInterval(() => void this.refreshList(), every);
  }

  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  // ---------------------------------------------------------------------------
  // On screen

  // `context`: why the app opens it, for this opening only (null values are
  // left out).
  present(target: PresentTarget, context?: AchilleContext) {
    this.requireApi("present");
    const wasShown = !!this.state.presentation;
    const kept = cleanValues(context, MAX_CONTEXT, "context value");
    for (const [key, value] of Object.entries(kept)) if (value === null) delete kept[key];
    this.seq += 1;
    this.set({ presentation: { target, seq: this.seq, context: kept }, banner: null });
    if (!this.state.config) void this.loadConfig();
    void this.refreshList();
    this.schedulePolling();
    if (!wasShown) this.events.windowDidShow.forEach((fn) => fn());
  }

  dismiss() {
    if (!this.state.presentation) return;
    this.set({ presentation: null });
    void this.refreshList();
    this.schedulePolling();
    this.events.windowDidHide.forEach((fn) => fn());
  }
}

export const store = new AchilleStore();
