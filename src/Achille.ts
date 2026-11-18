// The SDK's entry point:
//
//   Achille.initialize({ widgetKey: "…" });
//   await Achille.loginUser(() => myBackend.achilleIdentity());
//   Achille.present();
//
// The chat itself is drawn by <AchilleProvider>, mounted once at the root of
// the app.
import { store } from "./core/store";
import type { AchilleEvents, AchilleOptions, AchilleUserAttributes, IdentitySource, PresentOptions } from "./core/types";

export const Achille = {
  // Once, at startup. Calling it again with the same key keeps the session.
  initialize(options: AchilleOptions): void {
    store.initialize(options);
  },

  // Signs the user in (a signed identity, or a function that fetches one from
  // the app's backend: it is called again when the identity nears its 24 h
  // expiry). Their conversations come back on a new device. Throws when the
  // identity is malformed.
  loginUser(identity: IdentitySource): Promise<void> {
    return store.loginUser(identity);
  },

  // Forgets the user and their conversations on this device. Call it when the
  // user logs out of the app.
  logout(): Promise<void> {
    return store.logout();
  },

  // Opens the chat: its home screen when it has one, else the conversation
  // the user can still write in, else a new one.
  //
  // Every present* call takes `{ context }`: why the app opens the chat, for
  // this opening only ({ entry: "order_help", order_id: "A123" }). The
  // chat's cards and buttons set to show for some users only read it, along
  // with the user's attributes, and the messages written meanwhile carry it
  // to the team and Achille's AI.
  present(options?: PresentOptions): void {
    store.present({ screen: "home" }, options?.context);
  },

  // Opens the list of the user's conversations.
  presentMessages(options?: PresentOptions): void {
    store.present({ screen: "messages" }, options?.context);
  },

  // Opens one conversation (an id from a push notification, for instance).
  presentConversation(conversationId: string, options?: PresentOptions): void {
    store.present({ screen: "conversation", id: String(conversationId) }, options?.context);
  },

  // Opens a new conversation, its composer filled with `text` when given.
  presentMessageComposer(text?: string, options?: PresentOptions): void {
    store.present({ screen: "composer", text }, options?.context);
  },

  dismiss(): void {
    store.dismiss();
  },

  // Replies the user has not read yet, across their conversations. Refreshed
  // every 20 s while the app is in front, every 5 s while the chat is open.
  getUnreadConversationCount(): number {
    return store.getState().list.unread;
  },

  // unreadCountChanged(count), windowDidShow(), windowDidHide(). Returns the
  // function that removes the listener.
  addEventListener<K extends keyof AchilleEvents>(event: K, listener: AchilleEvents[K]): () => void {
    return store.addListener(event, listener);
  },

  // What the team sees about the user next to their conversations, sent
  // with each of their messages: a display name and flat custom attributes
  // (plan, last order, app version…). Merged with what was sent before;
  // null removes a key. Call it after loginUser.
  updateUser(attributes: AchilleUserAttributes): Promise<void> {
    return store.updateUser(attributes);
  },

  // Something happened in the app ("delivery_delayed", { order: "A123" }).
  // When the chat's settings have a message for this event, it appears as a
  // banner over the app or opens the chat on it.
  logEvent(name: string, metadata?: Record<string, string | number | boolean | null>): Promise<void> {
    return store.logEvent(name, metadata);
  },

  // Whether a received push is about the chat: the app's server sends it on
  // Achille's `chat.reply_unseen` webhook, with { achille: "1",
  // conversation_id } in its data.
  isAchillePush(data: Record<string, unknown> | null | undefined): boolean {
    return data?.achille === "1" && typeof data.conversation_id === "string";
  },

  // Opens the conversation a tapped push is about. false: not one of ours.
  handlePush(data: Record<string, unknown> | null | undefined): boolean {
    if (!Achille.isAchillePush(data)) return false;
    store.present({ screen: "conversation", id: String(data!.conversation_id) });
    return true;
  },
};

export type AchilleApi = typeof Achille;
