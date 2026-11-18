// The chat's API, `widget_api/v1` on the Helpdesk: the same endpoints the
// website widget calls. The widget key is public; the session token names the
// visitor (minted by the first message, kept on the device).
//
// A native app sends no Origin header, which the chat's origin restriction
// lets through: it is about browsers.
import type { AchilleFile, WidgetConfig } from "./types";

export const DEFAULT_API_URL = "https://support.achille.ai";

export interface Reply<T = Record<string, unknown>> {
  status: number;
  ok: boolean;
  data: T | null;
}

// The identity as the server reads it.
export interface WireIdentity {
  id: string;
  email: string;
  name?: string;
  ts: string;
  signature: string;
}

export class WidgetApi {
  readonly base: string;
  readonly widgetKey: string;

  constructor(apiUrl: string, widgetKey: string) {
    this.base = apiUrl.replace(/\/+$/, "");
    this.widgetKey = widgetKey;
  }

  configuration(locale: string): Promise<Reply<WidgetConfig>> {
    return this.request("GET", "configuration", { query: { locale } });
  }

  conversations(sessionToken: string): Promise<Reply> {
    return this.request("GET", "conversations", { query: { session_token: sessionToken } });
  }

  // `seen`: the conversation is on screen (the server then does not email
  // its replies).
  messages(sessionToken: string, conversationId: string | null, seen: boolean): Promise<Reply> {
    return this.request("GET", "messages", {
      query: {
        session_token: sessionToken,
        ...(conversationId ? { conversation_id: conversationId } : {}),
        ...(seen ? { seen: "1" } : {}),
      },
    });
  }

  // JSON, or multipart with the same fields (nested ones in bracket form)
  // when there are files.
  sendMessage(payload: Record<string, unknown>, files: readonly AchilleFile[]): Promise<Reply> {
    if (files.length === 0) return this.request("POST", "messages", { json: payload });
    const form = new FormData();
    for (const [key, value] of Object.entries(payload)) appendField(form, key, value);
    for (const file of files) {
      // React Native's FormData takes a { uri, name, type } object for a file.
      form.append("files[]", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    }
    return this.request("POST", "messages", { form });
  }

  contact(body: { session_token: string; email: string; name?: string | null; conversation_id?: string }) {
    return this.request("POST", "contact", { json: body });
  }

  // A signed-in user's token on this chat: their history on a new device.
  session(identity: WireIdentity): Promise<Reply<{ session_token: string | null }>> {
    return this.request("POST", "session", { json: { customer_identity: identity } });
  }

  // Something happened in the app; the answer is the message the chat shows
  // for it, if any.
  appEvent(body: {
    device_id: string;
    name: string;
    metadata?: Record<string, unknown>;
    customer_attributes?: Record<string, unknown>;
    session_token?: string;
    customer_identity?: WireIdentity;
    locale: string;
  }): Promise<Reply<{ message: { display_id?: unknown; body?: unknown; display?: unknown } | null }>> {
    return this.request("POST", "app_events", { json: body });
  }

  // Unreachable, or an answer that is not JSON: status 0 / data null.
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    o: { query?: Record<string, string>; json?: unknown; form?: FormData }
  ): Promise<Reply<T>> {
    const query = new URLSearchParams({ widget_key: this.widgetKey, ...(o.query ?? {}) }).toString();
    const headers: Record<string, string> = { Accept: "application/json", "X-Widget-Key": this.widgetKey };
    if (o.json !== undefined) headers["Content-Type"] = "application/json";
    try {
      const res = await fetch(`${this.base}/widget_api/v1/${path}?${query}`, {
        method,
        headers,
        body: o.form ?? (o.json !== undefined ? JSON.stringify(o.json) : undefined),
      });
      const text = await res.text();
      let data: T | null = null;
      try {
        data = text ? (JSON.parse(text) as T) : null;
      } catch {
        data = null;
      }
      return { status: res.status, ok: res.ok, data };
    } catch {
      return { status: 0, ok: false, data: null };
    }
  }
}

function appendField(form: FormData, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (typeof value === "object") {
    for (const [sub, subValue] of Object.entries(value as Record<string, unknown>)) {
      appendField(form, `${key}[${sub}]`, subValue);
    }
    return;
  }
  form.append(key, String(value));
}
