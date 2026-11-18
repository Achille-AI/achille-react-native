// What the SDK keeps on the device, per chat: the visitor's session token and
// whose user it belongs to, this install's device id, the user's attributes,
// and the email prompt the visitor closed. A storage that
// fails only costs them on the next launch.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AttributeValue } from "./types";

export interface Saved {
  sessionToken: string | null;
  // The userId the token was used with (null: anonymous).
  userId: string | null;
  // This install, for app events (generated once).
  deviceId: string | null;
  name: string | null;
  customAttributes: Record<string, AttributeValue>;
  emailPromptDismissed: boolean;
}

export const EMPTY: Saved = {
  sessionToken: null,
  userId: null,
  deviceId: null,
  name: null,
  customAttributes: {},
  emailPromptDismissed: false,
};

function key(widgetKey: string): string {
  return `@achille/chat/${widgetKey}`;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export async function load(widgetKey: string): Promise<Saved> {
  try {
    const raw = await AsyncStorage.getItem(key(widgetKey));
    if (!raw) return EMPTY;
    const data = JSON.parse(raw) as Partial<Saved>;
    const attributes = data.customAttributes;
    return {
      sessionToken: typeof data.sessionToken === "string" && /^[0-9a-f]{64}$/.test(data.sessionToken)
        ? data.sessionToken
        : null,
      userId: text(data.userId),
      deviceId: text(data.deviceId),
      name: text(data.name),
      customAttributes: attributes && typeof attributes === "object" && !Array.isArray(attributes) ? attributes : {},
      emailPromptDismissed: data.emailPromptDismissed === true,
    };
  } catch {
    return EMPTY;
  }
}

export async function save(widgetKey: string, saved: Saved): Promise<void> {
  try {
    await AsyncStorage.setItem(key(widgetKey), JSON.stringify(saved));
  } catch {
    // Kept in memory for this launch.
  }
}
