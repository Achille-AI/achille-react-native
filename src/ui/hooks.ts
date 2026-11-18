// The chat's screens and the conversation on screen, as React state.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { store, type ListState, type State } from "../core/store";
import type { ProactiveMessage, ThreadMessage } from "../core/types";
import type { WidgetApi } from "../core/api";
import { parseAttachments } from "../shared/attachments";
import { backTarget, landingTarget, LATEST, type Screen } from "../shared/conversations";

export function useAchilleState(): State {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

// The unread replies across the user's conversations (a badge on the app's
// own help button, for instance).
export function useAchilleUnreadCount(): number {
  return useAchilleState().list.unread;
}

// ---------------------------------------------------------------------------
// Navigation: the website widget's (useConversations), the list coming from
// the store.

export interface Nav {
  // null until the chat lands (see landingTarget).
  screen: Screen | null;
  // The conversation on the conversation screen; null: a new one, not posted
  // yet.
  conversationId: string | null;
  cameFrom: "home" | "messages" | null;
  // Counted up each time another conversation (or a new one) takes the
  // screen: its thread and guided flow start over.
  epoch: number;
}

const NOT_LANDED: Nav = { screen: null, conversationId: null, cameFrom: null, epoch: 0 };

export function useNav(o: {
  hasHome: boolean;
  sessionToken: string | null;
  list: ListState;
  presentation: State["presentation"];
  // A new conversation asked for by the app (presentMessageComposer, or a
  // proactive message): its composer text, the message it starts on, and its
  // epoch.
  onCompose: (text: string, proactive: ProactiveMessage | null, epoch: number) => void;
}) {
  const [nav, setNav] = useState<Nav>(NOT_LANDED);
  const navRef = useRef(nav);
  const go = useCallback((next: Nav) => {
    navRef.current = next;
    setNav(next);
  }, []);

  // Where the app asked to open the chat, applied once per request.
  const [appliedSeq, setAppliedSeq] = useState(0);
  const presentation = o.presentation;
  if (presentation && presentation.seq !== appliedSeq) {
    setAppliedSeq(presentation.seq);
    const target = presentation.target;
    const current = navRef.current;
    if (target.screen === "messages") go({ ...current, screen: "messages" });
    else if (target.screen === "conversation") {
      go({ screen: "conversation", conversationId: target.id, cameFrom: null, epoch: current.epoch + 1 });
    } else if (target.screen === "composer") {
      go({ screen: "conversation", conversationId: null, cameFrom: null, epoch: current.epoch + 1 });
      o.onCompose(target.text ?? "", target.proactive ?? null, current.epoch + 1);
    } else go({ ...current, screen: null });
  }

  // As of the request just applied above, not of this render's `nav`: a
  // request for a conversation must not be landed over.
  const now = navRef.current;
  if (now.screen === null && presentation) {
    const target = landingTarget({
      hasHome: o.hasHome,
      hasToken: !!o.sessionToken,
      status: o.list.status,
      conversations: o.list.conversations,
    });
    if (target?.kind === "home") go({ ...now, screen: "home" });
    else if (target) {
      go({
        screen: "conversation",
        conversationId: target.kind === "open" ? target.id : null,
        cameFrom: null,
        epoch: now.epoch + 1,
      });
    }
  }

  const showHome = useCallback(() => go({ ...navRef.current, screen: "home" }), [go]);
  const showMessages = useCallback(() => {
    go({ ...navRef.current, screen: "messages" });
    void store.refreshList();
  }, [go]);
  const open = useCallback(
    (id: string, cameFrom: Nav["cameFrom"]) => {
      const current = navRef.current;
      if (current.conversationId === id) go({ ...current, screen: "conversation", cameFrom });
      else go({ screen: "conversation", conversationId: id, cameFrom, epoch: current.epoch + 1 });
    },
    [go]
  );
  // A new conversation on screen; returns its epoch.
  const beginNew = useCallback(
    (cameFrom: Nav["cameFrom"]): number => {
      const epoch = navRef.current.epoch + 1;
      go({ screen: "conversation", conversationId: null, cameFrom, epoch });
      return epoch;
    },
    [go]
  );
  // The server put the message sent from conversation `epoch` on `id`.
  const assign = useCallback(
    (id: string, epoch: number) => {
      const current = navRef.current;
      if (current.epoch === epoch && current.conversationId !== id) go({ ...current, conversationId: id });
    },
    [go]
  );
  // The session ended: land again.
  const reset = useCallback(() => go({ ...NOT_LANDED, epoch: navRef.current.epoch + 1 }), [go]);

  const backTo =
    nav.screen === "conversation"
      ? backTarget({ hasHome: o.hasHome, cameFrom: nav.cameFrom, conversationCount: o.list.conversations.length })
      : null;

  return {
    ...nav,
    navRef,
    backTo,
    current: o.list.conversations.find((c) => c.id === nav.conversationId) ?? null,
    showHome,
    showMessages,
    open,
    beginNew,
    assign,
    reset,
  };
}

// ---------------------------------------------------------------------------
// The conversation on screen: its thread polled every 2 s while it is shown
// (seen=1, so the server does not email what the user read), plus the
// messages on their way.

const THREAD_POLL_MS = 2_000;

export interface ThreadState {
  messages: ThreadMessage[];
  // email_known, typing, can_reply from the last poll (null until one).
  emailKnown: boolean | null;
  typing: boolean;
  canReply: boolean | null;
}

const EMPTY_THREAD: ThreadState = { messages: [], emailKnown: null, typing: false, canReply: null };

// A message posted from the device: shown at once, until the poll has the
// server's copy (`serverId`).
type Local = ThreadMessage & { serverId?: string };

function parseMessages(raw: unknown): ThreadMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const m = item as Record<string, unknown>;
    if (m.id === undefined || m.id === null) return [];
    return [{
      id: String(m.id),
      body: typeof m.body === "string" ? m.body : "",
      from_agent: m.from_agent === true,
      interim: m.interim === true,
      sender_name: typeof m.sender_name === "string" && m.sender_name ? m.sender_name : null,
      created_at: typeof m.created_at === "string" ? m.created_at : "",
      attachments: parseAttachments(m.attachments),
    }];
  });
}

export function useThread(o: {
  api: WidgetApi;
  sessionToken: string | null;
  conversationId: string | null;
  epoch: number;
  // The conversation is on screen (and the app in front).
  live: boolean;
  onSessionEnded: (token: string) => void;
  // The conversation is not the user's (any more).
  onGone: () => void;
}) {
  const [server, setServer] = useState<ThreadState & { epoch: number }>({ ...EMPTY_THREAD, epoch: o.epoch });
  const [local, setLocal] = useState<{ epoch: number; items: Local[] }>({ epoch: o.epoch, items: [] });
  // Another conversation took the screen: start empty.
  if (server.epoch !== o.epoch) setServer({ ...EMPTY_THREAD, epoch: o.epoch });
  if (local.epoch !== o.epoch) setLocal({ epoch: o.epoch, items: [] });

  const latest = useRef(o);
  useEffect(() => {
    latest.current = o;
  });

  const poll = useCallback(async () => {
    const { api, sessionToken: token, conversationId, epoch, live } = latest.current;
    if (!token || !conversationId) return;
    const reply = await api.messages(token, conversationId === LATEST ? null : conversationId, live);
    if (latest.current.epoch !== epoch || latest.current.sessionToken !== token) return;
    if (reply.status === 404) return latest.current.onGone();
    if (!reply.ok || !reply.data) return;
    const data = reply.data;
    if (data.session_ended === true) return latest.current.onSessionEnded(token);
    const messages = parseMessages(data.messages);
    const known = new Set(messages.map((m) => m.id));
    setServer({
      epoch,
      messages,
      emailKnown: typeof data.email_known === "boolean" ? data.email_known : null,
      typing: data.typing === true,
      canReply: typeof data.can_reply === "boolean" ? data.can_reply : null,
    });
    setLocal((s) => (s.epoch === epoch ? { epoch, items: s.items.filter((m) => !m.serverId || !known.has(m.serverId)) } : s));
  }, []);

  const polls = o.live && !!o.sessionToken && !!o.conversationId;
  useEffect(() => {
    if (!polls) return;
    void poll();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void poll();
    }, THREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [polls, poll, o.conversationId, o.epoch]);

  const addLocal = useCallback((message: ThreadMessage) => {
    setLocal((s) => ({ ...s, items: [...s.items, message] }));
  }, []);
  const settleLocal = useCallback((id: string, serverId: string) => {
    setLocal((s) => ({ ...s, items: s.items.map((m) => (m.id === id ? { ...m, serverId, pending: false } : m)) }));
  }, []);
  const dropLocal = useCallback((id: string) => {
    setLocal((s) => ({ ...s, items: s.items.filter((m) => m.id !== id) }));
  }, []);
  // A cached answer the POST returned: shown now, the next poll has it too.
  const addAnswer = useCallback((raw: unknown, epoch: number) => {
    const [answer] = parseMessages([raw]);
    if (!answer) return;
    setServer((s) => (s.epoch === epoch && !s.messages.some((m) => m.id === answer.id)
      ? { ...s, messages: [...s.messages, answer] }
      : s));
  }, []);
  const endConversation = useCallback(() => setServer((s) => ({ ...s, canReply: false })), []);

  const serverIds = new Set(server.messages.map((m) => m.id));
  const messages = [
    ...server.messages,
    ...local.items.filter((m) => !m.serverId || !serverIds.has(m.serverId)),
  ];

  return {
    ...server,
    messages,
    poll,
    pollSoon: () => setTimeout(() => void poll(), 500),
    addLocal,
    settleLocal,
    dropLocal,
    addAnswer,
    endConversation,
  };
}
