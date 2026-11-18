// The pieces the chat's screens share, drawn like the website widget's.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Image, Pressable, Text, TextInput, View, type ViewStyle } from "react-native";
import type { AchilleFile, ThreadMessage } from "../core/types";
import { isImageAttachment, type MessageAttachment } from "../shared/attachments";
import { badgeText } from "../shared/conversations";
import type { Choice } from "../shared/flow-engine";
import { looksLikeEmail } from "../shared/human-mode";
import type { NoticeSegment } from "../shared/privacy-notice";
import { Icon, type IconName } from "./icons";
import { Markdown } from "./Markdown";
import { GREY, tint, type Brand } from "./theme";

export function Avatar({ brand, size = 28 }: { brand: Brand; size?: number }) {
  if (brand.avatarUrl) {
    return <Image source={{ uri: brand.avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: brand.color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: brand.onColor, fontSize: size * 0.4, fontWeight: "700" }}>
        {brand.name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function IconButton({ icon, label, color, onPress, size = 20 }: {
  icon: IconName;
  label: string;
  color: string;
  onPress: () => void;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.5 : 0.85 })}
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

// A screen's top bar: back arrow, title block, close.
export function TopBar({ title, subtitle, online, brand, backLabel, closeLabel, onBack, onClose, showAvatar }: {
  title: string;
  subtitle?: string | null;
  online?: boolean | null;
  brand: Brand;
  backLabel: string;
  closeLabel: string;
  onBack?: (() => void) | null;
  onClose: () => void;
  showAvatar?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: GREY.border,
        backgroundColor: "#fff",
      }}
    >
      {onBack ? <IconButton icon="back" label={backLabel} color={GREY.text} onPress={onBack} size={22} /> : <View style={{ width: 6 }} />}
      {showAvatar && <Avatar brand={brand} size={32} />}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: GREY.text }}>{title}</Text>
        {subtitle ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 }}>
            {online !== null && online !== undefined && (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: online ? GREY.online : GREY.offline }} />
            )}
            <Text numberOfLines={1} style={{ fontSize: 12, color: GREY.muted }}>{subtitle}</Text>
          </View>
        ) : null}
      </View>
      <IconButton icon="close" label={closeLabel} color={GREY.text} onPress={onClose} />
    </View>
  );
}

export function TabBar({ active, brand, unread, homeLabel, messagesLabel, onHome, onMessages, bottomInset }: {
  active: "home" | "messages";
  brand: Brand;
  unread: number;
  homeLabel: string;
  messagesLabel: string;
  onHome: () => void;
  onMessages: () => void;
  bottomInset: number;
}) {
  const tab = (key: "home" | "messages", icon: IconName, label: string, onPress: () => void, badge: string | null) => {
    const on = active === key;
    const color = on ? brand.onWhite : GREY.muted;
    return (
      <Pressable
        key={key}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={badge ? `${label} (${badge})` : label}
        onPress={onPress}
        style={{ flex: 1, alignItems: "center", paddingTop: 10, paddingBottom: 8, gap: 4 }}
      >
        <View>
          <Icon name={icon} size={24} color={color} strokeWidth={on ? 2.25 : 1.75} fill={on ? tint(brand.color, 18) : "none"} />
          {badge && (
            <View
              style={{
                position: "absolute",
                right: -10,
                top: -6,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                paddingHorizontal: 4,
                backgroundColor: GREY.danger,
                borderWidth: 2,
                borderColor: "#fff",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 12, fontWeight: "500", color }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: GREY.border,
        backgroundColor: "#fff",
        paddingBottom: bottomInset,
      }}
    >
      {tab("home", "home", homeLabel, onHome, null)}
      {tab("messages", "messages", messagesLabel, onMessages, badgeText(unread))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The thread

export function AgentBubble({ brand, name, children, onLongPress }: {
  brand: Brand;
  name?: string | null;
  children: ReactNode;
  onLongPress?: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
      <Avatar brand={brand} size={24} />
      <View style={{ maxWidth: "80%" }}>
        {name ? <Text style={{ fontSize: 11, color: GREY.muted, marginBottom: 2, marginLeft: 4 }}>{name}</Text> : null}
        <Pressable
          onLongPress={onLongPress}
          style={{ backgroundColor: GREY.bubble, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          {children}
        </Pressable>
      </View>
    </View>
  );
}

export function VisitorBubble({ brand, children, pending }: { brand: Brand; children: ReactNode; pending?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
      <View
        style={{
          maxWidth: "80%",
          backgroundColor: brand.color,
          borderRadius: 18,
          borderBottomRightRadius: 4,
          paddingHorizontal: 12,
          paddingVertical: 8,
          opacity: pending ? 0.7 : 1,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function MessageView({ message, brand, showName, onLink }: {
  message: ThreadMessage;
  brand: Brand;
  showName: boolean;
  onLink: (url: string) => void;
}) {
  const files = <Attachments attachments={message.attachments} local={message.localFiles} fromAgent={message.from_agent} brand={brand} onLink={onLink} />;
  if (message.from_agent) {
    return (
      <AgentBubble brand={brand} name={showName ? message.sender_name : null}>
        {message.body ? <Markdown content={message.body} style={{ fontSize: 15, lineHeight: 21, color: GREY.body }} linkColor={brand.onWhite} onLink={onLink} /> : null}
        {files}
      </AgentBubble>
    );
  }
  return (
    <VisitorBubble brand={brand} pending={message.pending}>
      {message.body ? <Text style={{ fontSize: 15, lineHeight: 21, color: brand.onColor }}>{message.body}</Text> : null}
      {files}
    </VisitorBubble>
  );
}

function Attachments({ attachments, local, fromAgent, brand, onLink }: {
  attachments: MessageAttachment[];
  local?: AchilleFile[];
  fromAgent: boolean;
  brand: Brand;
  onLink: (url: string) => void;
}) {
  const color = fromAgent ? GREY.body : brand.onColor;
  const items: { key: string; name: string; image: string | null; url: string | null }[] = local?.length
    ? local.map((f, i) => ({ key: `local-${i}`, name: f.name, image: f.type.startsWith("image/") ? f.uri : null, url: null }))
    : attachments.map((a) => ({ key: a.id, name: a.filename, image: isImageAttachment(a) ? a.url : null, url: a.url }));
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 6, marginTop: 6 }}>
      {items.map((item) =>
        item.image ? (
          <Pressable key={item.key} disabled={!item.url} onPress={() => item.url && onLink(item.url)}>
            <Image source={{ uri: item.image }} style={{ width: 200, height: 150, borderRadius: 10 }} resizeMode="cover" />
          </Pressable>
        ) : (
          <Pressable
            key={item.key}
            disabled={!item.url}
            onPress={() => item.url && onLink(item.url)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Icon name="file" size={16} color={color} />
            <Text numberOfLines={1} style={{ color, fontSize: 13, textDecorationLine: item.url ? "underline" : "none", flexShrink: 1 }}>
              {item.name}
            </Text>
          </Pressable>
        )
      )}
    </View>
  );
}

export function TypingDots({ brand }: { brand: Brand }) {
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 150),
          Animated.timing(value, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - index) * 150),
        ])
      )
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [values]);
  return (
    <AgentBubble brand={brand}>
      <View style={{ flexDirection: "row", gap: 4, paddingVertical: 5 }}>
        {values.map((value, index) => (
          <Animated.View
            key={index}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: GREY.faint,
              transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
            }}
          />
        ))}
      </View>
    </AgentBubble>
  );
}

// The current step's buttons under the last message: chips side by side when
// short, a list otherwise. A link opens outside the app.
export function Choices({ choices, layout, brand, onChoose, onLink }: {
  choices: Choice[];
  layout: "chips" | "list";
  brand: Brand;
  onChoose: (choice: Choice) => void;
  onLink: (url: string) => void;
}) {
  return (
    <View
      style={{
        flexDirection: layout === "chips" ? "row" : "column",
        flexWrap: layout === "chips" ? "wrap" : "nowrap",
        justifyContent: "flex-end",
        alignItems: layout === "chips" ? "center" : "flex-end",
        gap: 6,
      }}
    >
      {choices.map((choice) => (
        <Pressable
          key={choice.key}
          accessibilityRole={choice.action === "link" ? "link" : "button"}
          onPress={() => (choice.action === "link" ? choice.url && onLink(choice.url) : onChoose(choice))}
          style={({ pressed }) => ({
            maxWidth: "88%",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderWidth: 1,
            borderColor: brand.onWhite,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 7,
            backgroundColor: pressed ? brand.color : "#fff",
          })}
        >
          {({ pressed }) => (
            <>
              <Text style={{ fontSize: 14, color: pressed ? brand.onColor : brand.onWhite }}>{choice.label}</Text>
              {choice.action === "link" && <Icon name="external" size={12} color={pressed ? brand.onColor : brand.onWhite} />}
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const FACES = ["😠", "🙁", "😐", "🙂", "🤩"];

export function RatingCard({ rating, title, thanks, valueLabel, onRate }: {
  rating: number | null;
  title: string;
  thanks: string;
  valueLabel: string;
  onRate: (value: number) => void;
}) {
  return (
    <View style={{ marginHorizontal: 8, borderWidth: 1, borderColor: GREY.border, borderRadius: 12, padding: 12, alignItems: "center", backgroundColor: "#fff" }}>
      <Text style={{ fontSize: 13, fontWeight: "500", color: GREY.body }}>{rating ? thanks : title}</Text>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
        {FACES.map((face, index) => {
          const value = index + 1;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={valueLabel.replace("{value}", String(value))}
              accessibilityState={{ selected: rating === value, disabled: !!rating }}
              disabled={!!rating}
              onPress={() => onRate(value)}
            >
              <Text style={{ fontSize: 26, opacity: rating && rating !== value ? 0.25 : 1 }}>{face}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SystemLine({ children }: { children: ReactNode }) {
  return <Text style={{ textAlign: "center", fontSize: 12, lineHeight: 16, color: GREY.faint, paddingHorizontal: 16 }}>{children}</Text>;
}

export function NoticeText({ segments, onLink }: { segments: NoticeSegment[]; onLink: (url: string) => void }) {
  return (
    <SystemLine>
      {segments.map((segment, index) =>
        segment.kind === "link" ? (
          <Text key={index} style={{ textDecorationLine: "underline" }} onPress={() => onLink(segment.href)}>
            {segment.label}
          </Text>
        ) : (
          segment.text
        )
      )}
    </SystemLine>
  );
}

// ---------------------------------------------------------------------------
// Forms

const FIELD: ViewStyle = {
  borderWidth: 1,
  borderColor: "#d1d5db",
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
  backgroundColor: "#fff",
};

export function PrimaryButton({ label, brand, disabled, onPress }: {
  label: string;
  brand: Brand;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: brand.color,
        borderRadius: 10,
        paddingVertical: 11,
        alignItems: "center",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: brand.onColor, fontWeight: "600", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

// The email the reply can go to: inline after a first message (with a
// dismiss), or in place of the composer when the team is away or the chat
// asks for it before the first message (with a name).
export function EmailForm({ prompt, brand, withName, namePlaceholder, emailPlaceholder, submitLabel, dismissLabel, error, busy, onSubmit, onDismiss }: {
  prompt: string;
  brand: Brand;
  withName: boolean;
  namePlaceholder: string;
  emailPlaceholder: string;
  submitLabel: string;
  dismissLabel?: string;
  error: string | null;
  busy?: boolean;
  onSubmit: (email: string, name: string) => void;
  onDismiss?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const valid = looksLikeEmail(email);
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: GREY.border }}>
      <Text style={{ fontSize: 13, color: GREY.body, lineHeight: 18 }}>{prompt}</Text>
      {withName && (
        <TextInput style={FIELD} value={name} onChangeText={setName} placeholder={namePlaceholder} placeholderTextColor={GREY.faint} autoComplete="name" textContentType="name" />
      )}
      <TextInput
        style={FIELD}
        value={email}
        onChangeText={setEmail}
        placeholder={emailPlaceholder}
        placeholderTextColor={GREY.faint}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="done"
        onSubmitEditing={() => valid && onSubmit(email.trim(), name.trim())}
      />
      {error ? <Text style={{ fontSize: 12, color: GREY.danger }}>{error}</Text> : null}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <PrimaryButton label={submitLabel} brand={brand} disabled={!valid || busy} onPress={() => onSubmit(email.trim(), name.trim())} />
        </View>
        {onDismiss && dismissLabel ? (
          <Pressable accessibilityRole="button" onPress={onDismiss} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text style={{ color: GREY.muted, fontSize: 14 }}>{dismissLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
