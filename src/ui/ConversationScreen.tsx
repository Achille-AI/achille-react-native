// One conversation: its thread (the server's messages and the guided flow's
// lines), the step's buttons, and at the bottom whatever the user can do
// now: write, give an email, or start a new conversation once it ended.
import { useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { AchilleFile, ThreadMessage } from "../core/types";
import type { Choice, ThreadEntry } from "../shared/flow-engine";
import type { FlowItem } from "../shared/use-conversation-flow";
import { showsSenderName } from "../shared/human-mode";
import { Icon } from "./icons";
import { useKeyboardOverlap } from "./keyboard";
import { Markdown } from "./Markdown";
import { AgentBubble, Choices, MessageView, PrimaryButton, RatingCard, SystemLine, TopBar, TypingDots, VisitorBubble } from "./parts";
import { GREY, type Brand } from "./theme";

export interface ComposerProps {
  value: string;
  placeholder: string;
  sending: boolean;
  files: AchilleFile[];
  error: string | null;
  sendLabel: string;
  attachLabel: string | null;
  removeLabel: string;
  onChange: (text: string) => void;
  onSend: () => void;
  onAttach: () => void;
  onRemoveFile: (index: number) => void;
}

function Composer(c: ComposerProps & { brand: Brand; bottomInset: number }) {
  const canSend = (!!c.value.trim() || c.files.length > 0) && !c.sending;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: GREY.border, backgroundColor: "#fff", paddingBottom: c.bottomInset }}>
      {c.error ? <Text style={{ color: GREY.danger, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 }}>{c.error}</Text> : null}
      {c.files.length > 0 && (
        <ScrollView horizontal contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 10 }} showsHorizontalScrollIndicator={false}>
          {c.files.map((file, index) => (
            <View key={`${file.uri}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: GREY.border, borderRadius: 10, padding: 6, maxWidth: 200 }}>
              {file.type.startsWith("image/") ? (
                <Image source={{ uri: file.uri }} style={{ width: 28, height: 28, borderRadius: 6 }} />
              ) : (
                <Icon name="file" size={18} color={GREY.muted} />
              )}
              <Text numberOfLines={1} style={{ fontSize: 12, color: GREY.body, flexShrink: 1 }}>{file.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={c.removeLabel} hitSlop={8} onPress={() => c.onRemoveFile(index)}>
                <Icon name="close" size={14} color={GREY.muted} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, paddingHorizontal: 10, paddingVertical: 8 }}>
        {c.attachLabel ? (
          <Pressable accessibilityRole="button" accessibilityLabel={c.attachLabel} onPress={c.onAttach} hitSlop={6} style={{ padding: 8 }}>
            <Icon name="attach" size={21} color={GREY.muted} />
          </Pressable>
        ) : null}
        <TextInput
          value={c.value}
          onChangeText={c.onChange}
          placeholder={c.placeholder}
          placeholderTextColor={GREY.faint}
          multiline
          style={{
            flex: 1,
            maxHeight: 120,
            minHeight: 40,
            borderWidth: 1,
            borderColor: "#d1d5db",
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: 10,
            fontSize: 15,
            color: GREY.text,
            backgroundColor: "#fff",
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={c.sendLabel}
          disabled={!canSend}
          onPress={c.onSend}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.brand.color, alignItems: "center", justifyContent: "center", opacity: canSend ? 1 : 0.45 }}
        >
          {c.sending ? <ActivityIndicator color={c.brand.onColor} size="small" /> : <Icon name="send" size={18} color={c.brand.onColor} />}
        </Pressable>
      </View>
    </View>
  );
}

export function ConversationScreen(p: {
  brand: Brand;
  title: string;
  presence: { online: boolean; text: string } | null;
  backLabel: string;
  closeLabel: string;
  onBack: (() => void) | null;
  onClose: () => void;
  // Above the thread: the privacy notice, the AI line.
  intro: ReactNode;
  entries: ThreadEntry<ThreadMessage, FlowItem>[];
  visible: ThreadMessage[];
  flowTyping: boolean;
  replyTyping: boolean;
  statusLine: string | null;
  choices: Choice[];
  layout: "chips" | "list";
  strings: { rateTitle: string; rateThanks: string; rateValue: string };
  // Under the thread: the email card.
  below: ReactNode;
  // At the bottom: the composer, else an email form or the ended notice
  // (nothing while the step's buttons are the only way on).
  bottom:
    | { kind: "composer"; composer: ComposerProps }
    | { kind: "form"; form: ReactNode }
    | { kind: "ended"; text: string; newLabel: string; onNew: () => void }
    | { kind: "none" };
  topInset: number;
  bottomInset: number;
  onChoose: (choice: Choice) => void;
  onRate: (index: number, value: number) => void;
  onLink: (url: string) => void;
}) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // The keyboard lifts the bottom of the screen; the phone's own bottom
  // inset is under the keyboard then.
  const keyboard = useKeyboardOverlap();
  const bottomInset = keyboard.overlap > 0 ? 0 : p.bottomInset;
  const size = p.entries.length + (p.flowTyping ? 1 : 0) + (p.replyTyping ? 1 : 0) + p.choices.length;
  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [size, keyboard.overlap]);

  return (
    <View ref={keyboard.ref} style={{ flex: 1, backgroundColor: "#fff", paddingBottom: keyboard.overlap }}>
      <View style={{ paddingTop: p.topInset, backgroundColor: "#fff" }}>
        <TopBar
          title={p.title}
          subtitle={p.presence?.text}
          online={p.presence?.online ?? null}
          brand={p.brand}
          backLabel={p.backLabel}
          closeLabel={p.closeLabel}
          onBack={p.onBack}
          onClose={p.onClose}
          showAvatar
        />
      </View>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      >
        {p.intro}
        {p.entries.map((entry) => {
          if (entry.kind === "server") {
            return (
              <MessageView
                key={`m-${entry.message.id}`}
                message={entry.message}
                brand={p.brand}
                showName={showsSenderName(p.visible, entry.index)}
                onLink={p.onLink}
              />
            );
          }
          const item = entry.item;
          const key = `f-${entry.index}`;
          if (item.from === "visitor") {
            return (
              <VisitorBubble key={key} brand={p.brand}>
                <Text style={{ fontSize: 15, lineHeight: 21, color: p.brand.onColor }}>{item.text}</Text>
              </VisitorBubble>
            );
          }
          if (item.from === "system") return <SystemLine key={key}>{item.text}</SystemLine>;
          if (item.from === "csat") {
            return (
              <RatingCard
                key={key}
                rating={item.rating ?? null}
                title={p.strings.rateTitle}
                thanks={p.strings.rateThanks}
                valueLabel={p.strings.rateValue}
                onRate={(value) => p.onRate(entry.index, value)}
              />
            );
          }
          return (
            <AgentBubble key={key} brand={p.brand}>
              {item.text ? <Markdown content={item.text} style={{ fontSize: 15, lineHeight: 21, color: GREY.body }} linkColor={p.brand.onWhite} onLink={p.onLink} /> : null}
              {item.image_url ? <Image source={{ uri: item.image_url }} style={{ width: 220, height: 160, borderRadius: 10, marginTop: 6 }} resizeMode="cover" /> : null}
              {item.question ? <Text style={{ fontSize: 15, lineHeight: 21, color: GREY.body, marginTop: 6 }}>{item.question}</Text> : null}
            </AgentBubble>
          );
        })}
        {(p.flowTyping || p.replyTyping) && <TypingDots brand={p.brand} />}
        {p.statusLine ? <SystemLine>{p.statusLine}</SystemLine> : null}
        {p.choices.length > 0 && (
          <Choices choices={p.choices} layout={p.layout} brand={p.brand} onChoose={p.onChoose} onLink={p.onLink} />
        )}
        {p.below}
      </ScrollView>
      {p.bottom.kind === "composer" ? (
        <Composer {...p.bottom.composer} brand={p.brand} bottomInset={bottomInset} />
      ) : p.bottom.kind === "none" ? (
        <View style={{ height: bottomInset }} />
      ) : p.bottom.kind === "form" ? (
        <View style={{ padding: 12, paddingBottom: 12 + bottomInset, borderTopWidth: 1, borderTopColor: GREY.border, backgroundColor: GREY.page }}>
          {p.bottom.form}
        </View>
      ) : (
        <View style={{ padding: 16, paddingBottom: 16 + bottomInset, gap: 10, borderTopWidth: 1, borderTopColor: GREY.border }}>
          <Text style={{ textAlign: "center", fontSize: 13, color: GREY.muted }}>{p.bottom.text}</Text>
          <PrimaryButton label={p.bottom.newLabel} brand={p.brand} onPress={p.bottom.onNew} />
        </View>
      )}
    </View>
  );
}
