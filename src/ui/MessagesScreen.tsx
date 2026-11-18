// The user's conversations, newest activity first, and a way to start a new
// one (the website's ConversationList).
import { FlatList, Pressable, Text, View } from "react-native";
import { previewOf, relativeTime, rowName, type ConversationSummary } from "../shared/conversations";
import type { ConversationStrings } from "../shared/conversation-strings";
import { Icon } from "./icons";
import { Avatar, IconButton } from "./parts";
import { GREY, type Brand } from "./theme";

export function MessagesScreen({ conversations, brand, strings, lang, closeLabel, newLabel, topInset, tabBar, onOpen, onNew, onClose }: {
  conversations: ConversationSummary[];
  brand: Brand;
  strings: ConversationStrings;
  lang: string;
  closeLabel: string;
  newLabel: string;
  topInset: number;
  tabBar: React.ReactNode;
  onOpen: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const now = new Date();
  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12 + topInset, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: GREY.border }}>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600", color: GREY.text, marginLeft: 32 }}>{strings.messages}</Text>
        <IconButton icon="close" label={closeLabel} color={GREY.text} onPress={onClose} />
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={conversations.length === 0 ? { flex: 1 } : undefined}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 6 }}>
            <Icon name="messages" size={32} color={GREY.faint} />
            <Text style={{ fontSize: 15, fontWeight: "600", color: GREY.text, marginTop: 6 }}>{strings.noConversations}</Text>
            <Text style={{ fontSize: 13, color: GREY.muted, textAlign: "center" }}>{strings.noConversationsHint}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const preview = previewOf(item, strings);
          const unread = item.unread > 0;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpen(item.id)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: "#f3f4f6",
                backgroundColor: pressed ? "#f9fafb" : "#fff",
              })}
            >
              <Avatar brand={brand} size={36} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: unread ? "700" : "500", color: GREY.text }}>
                    {rowName(item, brand.name)}
                  </Text>
                  <Text style={{ fontSize: 12, color: GREY.faint }}>{relativeTime(item.updated_at, now, lang, strings)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                  {preview.files && <Icon name="attach" size={12} color={GREY.muted} />}
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: unread ? GREY.text : GREY.muted, fontWeight: unread ? "500" : "400" }}>
                    {preview.prefix}
                    {preview.text}
                  </Text>
                  {unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GREY.danger }} />}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
      <View style={{ padding: 16, alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          onPress={onNew}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: brand.color,
            borderRadius: 999,
            paddingHorizontal: 18,
            paddingVertical: 11,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: brand.onColor, fontSize: 15, fontWeight: "600" }}>{newLabel}</Text>
          <Icon name="send" size={15} color={brand.onColor} />
        </Pressable>
      </View>
      {tabBar}
    </View>
  );
}
