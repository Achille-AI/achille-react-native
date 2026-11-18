// The SDK's public types, and the configuration the chat serves
// (GET /widget_api/v1/configuration).

// The app's signed-in user, signed by the app's own backend: HMAC-SHA256 in
// hex of `${ts}:${userId}:${email}`, keyed with the chat's identity secret
// (Helpdesk > Settings > Chat > Installation). Valid 24 hours from `ts`.
export interface AchilleIdentity {
  // The app's user id: letters, digits, "_" or "-", up to 64 characters.
  userId: string;
  email: string;
  // Display only, not signed.
  name?: string;
  // Unix time in seconds at which the backend signed.
  ts: number | string;
  signature: string;
}

// A signed identity, or a way to get a fresh one (called at login and
// whenever the one in hand is about to expire).
export type IdentitySource = AchilleIdentity | (() => Promise<AchilleIdentity>);

// A file the app's picker returned, as React Native's FormData takes it.
export interface AchilleFile {
  uri: string;
  name: string;
  type: string;
  // In bytes, when the picker knows it: checked against the chat's limits
  // before upload (the server checks again).
  size?: number;
}

export interface AttachmentRules {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  // MIME types the chat accepts.
  accept: string[];
}

export interface AchilleOptions {
  // The chat's public key (Helpdesk > Settings > Chat > Installation).
  widgetKey: string;
  // The chat API. Default https://support.achille.ai.
  apiUrl?: string;
  // The visitor's language ("fr", "en-GB"…). Default: the device's.
  locale?: string;
  // Opens the app's file or photo picker. Without it, no attach button.
  pickAttachments?: (rules: AttachmentRules) => Promise<AchilleFile[]>;
  // Opens a link from a message or a button. Default: Linking.openURL.
  openUrl?: (url: string) => void;
}

export type AttributeValue = string | number | boolean | null;

// What the app tells the team about its user (Achille.updateUser): shown in
// the Helpdesk next to their conversations, readable by Achille's AI. Not
// signed: never use it for anything the user must not be able to change.
export interface AchilleUserAttributes {
  name?: string | null;
  // Flat values only. null removes a key.
  customAttributes?: Record<string, AttributeValue>;
}

// Why the app opens the chat (Achille.present({ context })): the screen, the
// order… Flat values like the custom attributes, for this opening only. The
// chat's conditions read it (cards and buttons shown to some users only), and
// each message written meanwhile carries it to the team and Achille's AI. Not
// signed either.
export type AchilleContext = Record<string, AttributeValue>;

export interface PresentOptions {
  context?: AchilleContext;
}

// A message the chat's settings show for an app event (Achille.logEvent).
export interface ProactiveMessage {
  // The display, sent back with the user's reply.
  displayId: string;
  body: string;
  display: "banner" | "chat";
}

// Where `present` opens the chat.
export type PresentTarget =
  | { screen: "home" }
  | { screen: "messages" }
  | { screen: "conversation"; id: string }
  | { screen: "composer"; text?: string; proactive?: ProactiveMessage };

export interface AchilleEvents {
  unreadCountChanged: (count: number) => void;
  windowDidShow: () => void;
  windowDidHide: () => void;
}

export interface WidgetConfig {
  primary_color: string;
  secondary_color: string;
  agent_name: string;
  agent_avatar_url: string | null;
  welcome_message: string;
  input_placeholder: string;
  require_email: boolean;
  mode?: string | null;
  online?: boolean | null;
  wait_time?: string | null;
  visible?: boolean | null;
  attachments?: unknown;
  privacy_notice?: string | null;
  privacy_notice_at_start?: boolean | null;
  locale?: string | null;
  conversation?: unknown;
  ai_enabled?: boolean | null;
  ai_notice?: string | null;
}

// One message of a conversation (GET /widget_api/v1/messages).
export interface ThreadMessage {
  id: string;
  body: string;
  from_agent: boolean;
  interim?: boolean;
  sender_name: string | null;
  created_at: string;
  attachments: import("../shared/attachments").MessageAttachment[];
  // The optimistic copy of a message on its way.
  pending?: boolean;
  // Its files as picked, until the server has them.
  localFiles?: AchilleFile[];
}
