// The guided conversation's home screen (the website's FlowHome): a header in
// the chat's color or on its banner, then the start buttons or the cards, an
// optional composer and the tabs.
import { useState, type ReactNode } from "react";
import { Image, ImageBackground, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Choice, Conversation } from "../shared/flow-engine";
import type { FlowStrings } from "../shared/flow-strings";
import { Icon } from "./icons";
import { useKeyboardOverlap } from "./keyboard";
import { IconButton } from "./parts";
import { GREY, httpsOrNull, tint, type Brand } from "./theme";

export interface RecentCard {
  title: string;
  text: string;
  unread: boolean;
}

const CARD = {
  backgroundColor: "#fff",
  borderRadius: 12,
  paddingHorizontal: 16,
  paddingVertical: 12,
  shadowColor: "#000",
  shadowOpacity: 0.06,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;

function HeaderTop({ conversation, brand }: { conversation: Conversation; brand: Brand }) {
  const header = conversation.home.header;
  const logo = httpsOrNull(header.logo_url);
  if (header.top === "none") return <View />;
  if (header.top === "logo") {
    return logo ? (
      <Image source={{ uri: logo }} accessibilityLabel={brand.name} style={{ height: 28, width: 160 }} resizeMode="contain" />
    ) : (
      <Text style={{ fontSize: 17, fontWeight: "700" }}>{brand.name}</Text>
    );
  }
  return brand.avatarUrl ? (
    <Image source={{ uri: brand.avatarUrl }} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "#fff" }} />
  ) : (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: brand.onWhite }}>{brand.name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function HomeComposer({ brand, placeholder, sendLabel, onSend }: {
  brand: Brand;
  placeholder: string;
  sendLabel: string;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    if (!value.trim()) return;
    onSend(value);
    setValue("");
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: GREY.border, backgroundColor: "#f9fafb" }}>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={GREY.faint}
        returnKeyType="send"
        onSubmitEditing={submit}
        style={{ flex: 1, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, backgroundColor: "#fff", color: GREY.text }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={sendLabel}
        disabled={!value.trim()}
        onPress={submit}
        style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: brand.color, alignItems: "center", justifyContent: "center", opacity: value.trim() ? 1 : 0.5 }}
      >
        <Icon name="send" size={17} color={brand.onColor} />
      </Pressable>
    </View>
  );
}

export function HomeScreen({ conversation, brand, strings, presence, choices, showComposer, placeholder, recent, closeLabel, aiNotice, topInset, tabBar, onClose, onStart, onOpenRecent, onChoose, onSend, onLink }: {
  conversation: Conversation;
  brand: Brand;
  strings: FlowStrings;
  presence: { online: boolean; text: string } | null;
  choices: Choice[];
  showComposer: boolean;
  placeholder: string;
  recent: RecentCard | null;
  closeLabel: string;
  aiNotice: string | null;
  topInset: number;
  tabBar: ReactNode;
  onClose: () => void;
  onStart: () => void;
  onOpenRecent: () => void;
  onChoose: (choice: Choice) => void;
  onSend: (text: string) => void;
  onLink: (url: string) => void;
}) {
  const { header, title, cards } = conversation.home;
  const banner = header.background === "image" ? httpsOrNull(header.banner_url) : null;
  const onHeader = banner ? "#ffffff" : brand.onColor;
  const [noticeOpen, setNoticeOpen] = useState(false);
  // Its composer stays above the keyboard; the tabs give way meanwhile.
  const keyboard = useKeyboardOverlap();

  const headerContent = (
    <View style={{ paddingHorizontal: 20, paddingTop: 16 + topInset, paddingBottom: 48 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36 }}>
        <HeaderTop conversation={conversation} brand={brand} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {aiNotice ? <IconButton icon="info" label={aiNotice} color={onHeader} onPress={() => setNoticeOpen((v) => !v)} /> : null}
          <IconButton icon="close" label={closeLabel} color={onHeader} onPress={onClose} />
        </View>
      </View>
      {noticeOpen && aiNotice ? (
        <View style={{ marginTop: 10, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 10, padding: 10 }}>
          <Text style={{ fontSize: 12, lineHeight: 17, color: GREY.body }}>{aiNotice}</Text>
        </View>
      ) : null}
      {title ? <Text style={{ color: onHeader, fontSize: 24, fontWeight: "600", lineHeight: 29, paddingTop: 24 }}>{title}</Text> : null}
      {header.subtitle ? <Text style={{ color: onHeader, fontSize: 14, lineHeight: 19, marginTop: 8, opacity: 0.85 }}>{header.subtitle}</Text> : null}
    </View>
  );

  return (
    <View ref={keyboard.ref} style={{ flex: 1, backgroundColor: GREY.page, paddingBottom: keyboard.overlap }}>
      {banner ? (
        <ImageBackground source={{ uri: banner }} style={{ backgroundColor: brand.color }} resizeMode="cover">
          <View style={{ backgroundColor: "rgba(0,0,0,0.35)" }}>{headerContent}</View>
        </ImageBackground>
      ) : (
        <View style={{ backgroundColor: brand.color }}>{headerContent}</View>
      )}
      <ScrollView style={{ flex: 1, marginTop: -28 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
        {choices.length > 0 && (
          <View style={[CARD, { padding: 12, gap: 6, alignItems: "flex-start" }]}>
            {choices.map((choice) => (
              <Pressable
                key={choice.key}
                accessibilityRole={choice.action === "link" ? "link" : "button"}
                onPress={() => (choice.action === "link" ? choice.url && onLink(choice.url) : onChoose(choice))}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  backgroundColor: tint(brand.color),
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 14, color: brand.onWhite }}>{choice.label}</Text>
                {choice.action === "link" && <Icon name="external" size={12} color={brand.onWhite} />}
              </Pressable>
            ))}
          </View>
        )}
        {cards.map((card) => {
          if (card.type === "recent") {
            if (!recent) return null;
            return (
              <Pressable key={card.id} accessibilityRole="button" onPress={onOpenRecent} style={CARD}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: GREY.text }}>{recent.title}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: recent.unread ? GREY.text : GREY.muted, fontWeight: recent.unread ? "500" : "400" }}>
                    {recent.text}
                  </Text>
                  {recent.unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GREY.danger }} />}
                </View>
              </Pressable>
            );
          }
          if (card.type === "start") {
            return (
              <Pressable key={card.id} accessibilityRole="button" onPress={onStart} style={[CARD, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: GREY.text }}>{card.label || strings.startCard}</Text>
                  {presence && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: presence.online ? GREY.online : GREY.offline }} />
                      <Text style={{ fontSize: 12, color: GREY.muted }}>{presence.text}</Text>
                    </View>
                  )}
                </View>
                <Icon name="send" size={17} color={brand.onWhite} />
              </Pressable>
            );
          }
          if (card.type === "link") {
            const url = httpsOrNull(card.url);
            return (
              <Pressable key={card.id} accessibilityRole="link" disabled={!url} onPress={() => url && onLink(url)} style={[CARD, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: GREY.text }}>{card.label}</Text>
                <Icon name="external" size={17} color={GREY.faint} />
              </Pressable>
            );
          }
          return (
            <View key={card.id} style={CARD}>
              {card.title ? <Text style={{ fontSize: 13, fontWeight: "600", color: GREY.text }}>{card.title}</Text> : null}
              {card.text ? <Text style={{ fontSize: 14, lineHeight: 20, color: "#374151", marginTop: 4 }}>{card.text}</Text> : null}
            </View>
          );
        })}
      </ScrollView>
      {showComposer && <HomeComposer brand={brand} placeholder={placeholder} sendLabel={strings.send} onSend={onSend} />}
      {keyboard.overlap > 0 ? null : tabBar}
    </View>
  );
}
