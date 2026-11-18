// The chat on screen: a modal over the app (a sheet on iOS) with the home
// screen, the list of conversations and a conversation. What the website
// widget's WidgetChat does for the Helpdesk chat, on native views.
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { store, type State } from "../core/store";
import type { AchilleFile, ProactiveMessage, ThreadMessage, WidgetConfig } from "../core/types";
import { addFiles, fillTemplate, formatFileSize, parseAttachmentLimits, type FileProblem } from "../shared/attachments";
import { isAwaitingReply } from "../shared/awaiting-reply";
import { conversationStrings } from "../shared/conversation-strings";
import { LATEST, previewOf } from "../shared/conversations";
import { conditionFacts } from "../shared/conditions";
import { conversationOf, interleave, type FlowPayload } from "../shared/flow-engine";
import { flowStrings } from "../shared/flow-strings";
import {
  AI_START_GRACE_MS,
  awaitingStatusText,
  awaitsAi,
  needsOfflineEmail,
  presenceText,
  readAvailability,
  shouldShowEmailCard,
} from "../shared/human-mode";
import { parseNotice, privacyNoticeOf } from "../shared/privacy-notice";
import { resolveUiLanguage } from "../shared/ui-language";
import { UI_LANGUAGES, uiStringsFor, type UiStrings } from "../shared/ui-strings";
import { useConversationFlow } from "../shared/use-conversation-flow";
import { ConversationScreen, type ComposerProps } from "./ConversationScreen";
import { HomeScreen, type RecentCard } from "./HomeScreen";
import { MessagesScreen } from "./MessagesScreen";
import { Markdown } from "./Markdown";
import { AgentBubble, EmailForm, IconButton, NoticeText, SystemLine, TabBar } from "./parts";
import { useAchilleState, useNav, useThread } from "./hooks";
import { brandOf, GREY } from "./theme";

export function Messenger() {
  const state = useAchilleState();
  const shown = !!state.presentation;
  return (
    <Modal
      visible={shown}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      statusBarTranslucent
      onRequestClose={() => store.dismiss()}
    >
      <SafeAreaProvider>{shown ? <ChatRoot state={state} /> : null}</SafeAreaProvider>
    </Modal>
  );
}

function ChatRoot({ state }: { state: State }) {
  const insets = useSafeAreaInsets();
  const lang = resolveUiLanguage(state.config?.locale ?? null, store.locale, UI_LANGUAGES);
  const t = uiStringsFor(lang);
  if (state.config) return <Chat state={state} config={state.config} lang={lang} t={t} insets={insets} />;
  return (
    <View style={{ flex: 1, backgroundColor: "#fff", paddingTop: insets.top }}>
      <View style={{ alignItems: "flex-end", padding: 10 }}>
        <IconButton icon="close" label={t.close} color={GREY.text} onPress={() => store.dismiss()} />
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
        {state.configFailed ? (
          <>
            <Text style={{ fontSize: 15, color: GREY.body, textAlign: "center" }}>{t.chatUnavailable}</Text>
            <Pressable accessibilityRole="button" onPress={() => void store.loadConfig()} style={{ padding: 10 }}>
              <Text style={{ fontSize: 15, color: GREY.muted, textDecorationLine: "underline" }}>{t.retry}</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={GREY.faint} />
        )}
      </View>
    </View>
  );
}

function fileProblemText(problem: FileProblem, t: UiStrings, lang: string): string {
  const size = (bytes: number) => formatFileSize(bytes, { kb: t.sizeKb, mb: t.sizeMb }, lang);
  if (problem.kind === "too_many") return fillTemplate(t.tooManyFiles, { max: problem.max });
  if (problem.kind === "too_big") return fillTemplate(t.fileTooBig, { name: problem.name, size: size(problem.max) });
  return fillTemplate(t.totalTooBig, { size: size(problem.max) });
}

type ContactStatus = "idle" | "saving" | "saved" | "invalid" | "failed";

function Chat({ state, config, lang, t, insets }: {
  state: State;
  config: WidgetConfig;
  lang: string;
  t: UiStrings;
  insets: { top: number; bottom: number };
}) {
  const api = store.api!;
  const options = store.options!;
  const fs = flowStrings(lang);
  const cs = conversationStrings(lang);
  const brand = useMemo(() => brandOf(config), [config]);
  // The cards and buttons set to show for some users only: what the app says
  // of its user and why it opened the chat decide.
  const context = state.presentation?.context;
  const facts = useMemo(
    () => conditionFacts({ signedIn: state.signedIn, attributes: state.attributes, context }),
    [state.signedIn, state.attributes, context]
  );
  const conversation = useMemo(
    () =>
      conversationOf(
        config,
        {
          welcome: config.welcome_message,
          question: fs.resolutionQuestion,
          yes: fs.resolutionYes,
          no: fs.resolutionNo,
          back: fs.resolutionBack,
          closing: fs.resolutionClosing,
          noneMessage: fs.noneMessage,
        },
        facts
      ),
    [config, fs, facts]
  );
  const hasHome = !!conversation && conversation.home.opening !== "direct";
  const availability = readAvailability(config);
  const presence = availability ? { online: availability.online, text: presenceText(t, availability) } : null;
  const limits = parseAttachmentLimits(config.attachments);
  const offline = availability?.online === false;
  const openUrl = (url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    if (options.openUrl) options.openUrl(url);
    else Linking.openURL(url).catch(() => {});
  };

  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<AchilleFile[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // The email (and name) typed in the pre-chat or offline form.
  const [typed, setTyped] = useState<{ email: string; name: string } | null>(null);
  const [contactStatus, setContactStatus] = useState<ContactStatus>("idle");
  const [aiAwaitedAt, setAiAwaitedAt] = useState<number | null>(null);
  useEffect(() => {
    if (aiAwaitedAt === null) return;
    const timer = setTimeout(() => setAiAwaitedAt(null), AI_START_GRACE_MS);
    return () => clearTimeout(timer);
  }, [aiAwaitedAt]);

  // The proactive message a new conversation starts on (an app event's), for
  // the conversation of that epoch only.
  const [proactive, setProactive] = useState<{ message: ProactiveMessage; epoch: number } | null>(null);
  const nav = useNav({
    hasHome,
    sessionToken: state.sessionToken,
    list: state.list,
    presentation: state.presentation,
    onCompose: (text, message, epoch) => {
      setDraft(text);
      setProactive(message ? { message, epoch } : null);
    },
  });
  const thread = useThread({
    api,
    sessionToken: state.sessionToken,
    conversationId: nav.conversationId,
    epoch: nav.epoch,
    live: nav.screen === "conversation",
    onSessionEnded: (token) => {
      store.sessionEnded(token);
      nav.reset();
    },
    onGone: () => nav.showMessages(),
  });
  // Another conversation took the screen: what was picked or failed for the
  // previous one goes.
  useEffect(() => {
    setFiles([]);
    setComposerError(null);
    setContactStatus("idle");
    setAiAwaitedAt(null);
  }, [nav.epoch]);

  // The POST opening a new conversation, in flight: the next messages wait
  // for it and follow it there.
  const opening = useRef<{ epoch: number; done: Promise<string | null> } | null>(null);

  // Resolves the posted message's id ("" when the server gave none), or null
  // when nothing was sent. `flow`: the message hands the guided conversation
  // over (the flow already shows it as the user's bubble).
  async function send(rawBody: string, picked: AchilleFile[], flow?: FlowPayload): Promise<string | null> {
    const body = rawBody.trim();
    if (!body && picked.length === 0) return null;
    let token = store.getState().sessionToken;
    const inFlight = opening.current;
    if (inFlight && !nav.navRef.current.conversationId && inFlight.epoch === nav.navRef.current.epoch) {
      token = (await inFlight.done) ?? store.getState().sessionToken;
    }
    const target = nav.navRef.current;
    const onScreen = () => nav.navRef.current.epoch === target.epoch;
    const local: ThreadMessage = {
      id: `local-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      body,
      from_agent: false,
      sender_name: null,
      created_at: new Date().toISOString(),
      attachments: [],
      pending: true,
      localFiles: picked.length ? picked : undefined,
    };
    if (!flow) thread.addLocal(local);
    let opened: (token: string | null) => void = () => {};
    let openedToken: string | null = null;
    if (!target.conversationId) {
      opening.current = { epoch: target.epoch, done: new Promise((resolve) => (opened = resolve)) };
    }
    setSending(true);
    setComposerError(null);
    try {
      const identity = await store.identity.fresh();
      const attributes = store.userAttributes();
      const appContext = store.getState().presentation?.context ?? {};
      const payload: Record<string, unknown> = {
        body,
        session_token: token || undefined,
        locale: store.locale,
        sender_name: typed?.name || attributes.name || undefined,
        sender_email: flow?.collected.email || typed?.email || undefined,
        customer_identity: identity || undefined,
        customer_attributes: Object.keys(attributes.custom).length ? attributes.custom : undefined,
        app_context: Object.keys(appContext).length ? appContext : undefined,
        flow: flow || undefined,
      };
      if (target.conversationId && target.conversationId !== LATEST) payload.conversation_id = target.conversationId;
      else if (!target.conversationId && token) payload.new_conversation = true;
      // The first message of a conversation opened on a proactive message:
      // the server puts that message first in the new ticket.
      if (!target.conversationId && proactive?.epoch === target.epoch) {
        payload.proactive_display_id = proactive.message.displayId;
      }

      const reply = await api.sendMessage(payload, picked);
      const data = reply.data;
      if (reply.ok && data) {
        const newToken = typeof data.session_token === "string" ? data.session_token : null;
        if (newToken && newToken !== store.getState().sessionToken) store.adoptToken(newToken);
        openedToken = newToken;
        const landed = data.conversation_id ?? data.ticket_id;
        if (landed !== undefined && landed !== null) nav.assign(String(landed), target.epoch);
        if (!target.conversationId) void store.refreshList();
        const messageId = data.message_id !== undefined && data.message_id !== null ? String(data.message_id) : "";
        if (!flow) {
          if (messageId) thread.settleLocal(local.id, messageId);
          else thread.dropLocal(local.id);
        }
        if (data.answer && onScreen()) thread.addAnswer(data.answer, target.epoch);
        if (flow?.collected.email) setTyped((prev) => ({ email: flow.collected.email!, name: prev?.name ?? "" }));
        if (onScreen() && awaitsAi({ aiEnabled: config.ai_enabled === true, route: flow?.route ?? null, answered: !!data.answer })) {
          setAiAwaitedAt(Date.now());
        }
        thread.pollSoon();
        return messageId;
      }
      if (!flow) thread.dropLocal(local.id);
      if (!onScreen()) return null;
      const giveBack = () => {
        if (flow) return;
        setDraft((current) => current || rawBody);
        setFiles((current) => (current.length ? current : picked));
      };
      if (reply.status === 404 && target.conversationId) nav.showMessages();
      else if (reply.status === 422 && data?.code === "conversation_ended") {
        thread.endConversation();
        giveBack();
      } else if (picked.length > 0 && (reply.status === 413 || reply.status === 422)) {
        giveBack();
        setComposerError(t.attachmentsRejected);
      } else {
        giveBack();
        setComposerError(t.sendFailed);
      }
      return null;
    } finally {
      opened(openedToken);
      setSending(false);
    }
  }

  const emailKnown = thread.emailKnown === true || contactStatus === "saved" || !!typed?.email || state.signedIn;
  const last = thread.messages[thread.messages.length - 1];
  // A conversation opened on a proactive message is a reply to it: no guided
  // flow on its screen.
  const onProactive = !!proactive && proactive.epoch === nav.epoch && nav.screen === "conversation";
  const guided = useConversationFlow({
    conversation: onProactive ? null : conversation,
    aiEnabled: config.ai_enabled === true,
    emailKnown,
    offline,
    preview: false,
    epoch: nav.epoch,
    hasTicket: nav.conversationId !== null,
    lastServerMessageId: last?.id ?? null,
    lastServerFromAgent: !!last?.from_agent,
    strings: fs,
    endpoint: { apiBase: api.base, widgetKey: api.widgetKey, sessionToken: state.sessionToken },
    handoff: (body, flow) => send(body, [], flow),
  });

  async function saveContact(email: string, name: string | null) {
    const token = store.getState().sessionToken;
    if (!token || contactStatus === "saving") return;
    setContactStatus("saving");
    const conversationId = nav.conversationId;
    const reply = await api.contact({
      session_token: token,
      email,
      name,
      ...(conversationId && conversationId !== LATEST ? { conversation_id: conversationId } : {}),
    });
    setContactStatus(reply.ok ? "saved" : reply.status === 422 ? "invalid" : "failed");
    if (reply.status === 404) nav.showMessages();
  }

  async function pickFiles() {
    if (!limits || !options.pickAttachments) return;
    let picked: AchilleFile[] = [];
    try {
      picked = await options.pickAttachments({ ...limits });
    } catch {
      return;
    }
    if (!picked?.length) return;
    const sized = picked.map((file) => ({ ...file, size: file.size ?? 0 }));
    const { files: next, problem } = addFiles(files.map((f) => ({ ...f, size: f.size ?? 0 })), sized, limits);
    setFiles(next);
    setComposerError(problem ? fileProblemText(problem, t, lang) : null);
  }

  function sendComposer() {
    if ((!draft.trim() && files.length === 0) || sending) return;
    // A guided conversation reads what the user writes first (an answer, or
    // the message that hands over); a ticket in progress takes it as is.
    if (conversation && files.length === 0) {
      const result = guided.submit(draft);
      if (result === "sent") setDraft("");
      if (result !== "ignored") return;
    }
    const body = draft;
    const picked = files;
    setDraft("");
    setFiles([]);
    void send(body, picked);
  }

  function openConversation(id: string, from: "home" | "messages" | null) {
    if (nav.conversationId !== id) setDraft("");
    nav.open(id, from);
  }

  function startConversation(from: "home" | "messages" | null): number {
    setDraft("");
    return nav.beginNew(from);
  }

  const tabBar = (active: "home" | "messages") =>
    hasHome ? (
      <TabBar
        active={active}
        brand={brand}
        unread={state.list.unread}
        homeLabel={fs.home}
        messagesLabel={cs.messages}
        onHome={nav.showHome}
        onMessages={nav.showMessages}
        bottomInset={insets.bottom}
      />
    ) : (
      <View style={{ height: insets.bottom }} />
    );
  const close = () => store.dismiss();

  if (nav.screen === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator color={GREY.faint} />
      </View>
    );
  }

  if (nav.screen === "home" && conversation) {
    const latest = state.list.conversations[0] ?? null;
    const recent: RecentCard | null = latest
      ? (() => {
          const preview = previewOf(latest, cs);
          return { title: cs.recentConversation, text: `${preview.prefix}${preview.text}`, unread: latest.unread > 0 };
        })()
      : null;
    return (
      <HomeScreen
        conversation={conversation}
        brand={brand}
        strings={fs}
        presence={presence}
        choices={guided.homeChoices}
        showComposer={guided.homeComposer}
        placeholder={config.input_placeholder}
        recent={recent}
        closeLabel={t.close}
        aiNotice={config.ai_enabled ? config.ai_notice ?? null : null}
        topInset={insets.top}
        tabBar={tabBar("home")}
        onClose={close}
        onStart={() => startConversation("home")}
        onOpenRecent={() => latest && openConversation(latest.id, "home")}
        onChoose={(choice) => guided.chooseFromHome(choice, startConversation("home"))}
        onSend={(text) => {
          const epoch = startConversation("home");
          if (guided.submitFromHome(text, epoch) === "ignored") void send(text, []);
        }}
        onLink={openUrl}
      />
    );
  }

  if (nav.screen === "messages") {
    return (
      <MessagesScreen
        conversations={state.list.conversations}
        brand={brand}
        strings={cs}
        lang={lang}
        closeLabel={t.close}
        newLabel={cs.newConversation}
        topInset={insets.top}
        tabBar={tabBar("messages")}
        onOpen={(id) => openConversation(id, "messages")}
        onNew={() => startConversation("messages")}
        onClose={close}
      />
    );
  }

  // The conversation screen.
  const ended = nav.conversationId !== null && (thread.canReply ?? nav.current?.can_reply) === false;
  const { visible, entries } = interleave(thread.messages, guided.items, guided.hiddenIds);
  const awaiting = isAwaitingReply(thread.messages);
  const replyTyping = !guided.typing && (thread.typing || (aiAwaitedAt !== null && awaiting));
  const statusLine = !replyTyping && awaiting && !sending && !ended ? awaitingStatusText(t, availability, emailKnown) : null;

  const notice = privacyNoticeOf(config);
  // The proactive message stays the thread's first line until the server's
  // copy of it arrives.
  const proactiveLine = onProactive && thread.messages.every((m) => !m.from_agent) ? proactive!.message : null;
  const intro = (
    <>
      {notice && config.privacy_notice_at_start ? <NoticeText segments={parseNotice(notice)} onLink={openUrl} /> : null}
      {proactiveLine ? (
        <AgentBubble brand={brand}>
          <Markdown content={proactiveLine.body} style={{ fontSize: 15, lineHeight: 21, color: GREY.body }} linkColor={brand.onWhite} onLink={openUrl} />
        </AgentBubble>
      ) : null}
      {config.ai_enabled && config.ai_notice && !conversation ? <SystemLine>{config.ai_notice}</SystemLine> : null}
      {!conversation && !proactiveLine && config.welcome_message && thread.messages.length === 0 ? (
        <SystemLine>{config.welcome_message}</SystemLine>
      ) : null}
    </>
  );

  const showEmailCard =
    !conversation &&
    !ended &&
    !state.signedIn &&
    shouldShowEmailCard({
      emailKnown: thread.emailKnown,
      formEmail: !!typed?.email,
      dismissed: state.emailPromptDismissed,
      saved: contactStatus === "saved",
      hasVisitorMessage: thread.messages.some((m) => !m.from_agent),
      offline,
    });
  const below = showEmailCard ? (
    <EmailForm
      prompt={t.emailPrompt}
      brand={brand}
      withName={false}
      namePlaceholder={t.namePlaceholder}
      emailPlaceholder={t.emailPlaceholder}
      submitLabel={t.emailSubmit}
      dismissLabel={t.emailDismiss}
      busy={contactStatus === "saving"}
      error={contactStatus === "invalid" ? t.emailInvalid : contactStatus === "failed" ? t.emailSaveFailed : null}
      onSubmit={(email) => void saveContact(email, null)}
      onDismiss={() => store.dismissEmailPrompt()}
    />
  ) : null;

  // Before the first message: the chat asks for an email (require_email), or
  // the team is away and can only answer by email.
  const needsPrechat = !conversation && config.require_email && !typed && !state.sessionToken && !state.signedIn;
  const needsOffline =
    !conversation &&
    needsOfflineEmail({
      offline,
      hasSession: !!state.sessionToken,
      hasIdentity: state.signedIn,
      emailKnown: thread.emailKnown,
      formEmail: !!typed?.email,
      saved: contactStatus === "saved",
    });

  const placeholder =
    guided.field === "email" ? fs.emailFieldPlaceholder : guided.field === "order" ? fs.orderFieldPlaceholder : config.input_placeholder;
  const composer: ComposerProps = {
    value: draft,
    placeholder,
    sending,
    files,
    error: composerError ?? (guided.error === "invalid_email" ? t.emailInvalid : null),
    sendLabel: fs.send,
    attachLabel: limits && options.pickAttachments && guided.field === null ? t.attachFile : null,
    removeLabel: t.removeFile,
    onChange: setDraft,
    onSend: sendComposer,
    onAttach: () => void pickFiles(),
    onRemoveFile: (index) => setFiles((current) => current.filter((_, i) => i !== index)),
  };

  const bottom: Parameters<typeof ConversationScreen>[0]["bottom"] = ended
    ? { kind: "ended", text: cs.ended, newLabel: cs.newConversation, onNew: () => startConversation(nav.cameFrom) }
    : needsPrechat || needsOffline
      ? {
          kind: "form",
          form: (
            <EmailForm
              prompt={needsOffline ? `${t.offlineNotice}\n${t.offlineEmailPrompt}` : config.welcome_message}
              brand={brand}
              withName
              namePlaceholder={needsOffline ? t.nameOptionalPlaceholder : t.namePlaceholder}
              emailPlaceholder={t.emailPlaceholder}
              submitLabel={needsOffline ? t.continueLabel : t.startConversation}
              busy={contactStatus === "saving"}
              error={contactStatus === "invalid" ? t.emailInvalid : contactStatus === "failed" ? t.emailSaveFailed : null}
              onSubmit={(email, name) => {
                // An existing conversation saves the contact now; a new one
                // sends it with its first message.
                if (state.sessionToken && nav.conversationId) void saveContact(email, name || null);
                else setTyped({ email, name });
              }}
            />
          ),
        }
      : guided.composerVisible
        ? { kind: "composer", composer }
        : { kind: "none" };

  return (
    <ConversationScreen
      brand={brand}
      title={brand.name}
      presence={presence}
      backLabel={cs.back}
      closeLabel={t.close}
      onBack={nav.backTo === "home" ? nav.showHome : nav.backTo === "messages" ? nav.showMessages : null}
      onClose={close}
      intro={intro}
      entries={entries}
      visible={visible}
      flowTyping={guided.typing}
      replyTyping={replyTyping}
      statusLine={statusLine}
      choices={guided.choices}
      layout={guided.layout}
      strings={fs}
      below={below}
      bottom={bottom}
      topInset={insets.top}
      bottomInset={insets.bottom}
      onChoose={guided.choose}
      onRate={guided.rate}
      onLink={openUrl}
    />
  );
}
