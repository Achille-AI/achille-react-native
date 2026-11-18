// A proactive message over the app (an app event's, display "banner"): the
// chat's avatar and name, the message, a close button. A tap opens the chat
// on it, where the user's reply starts a conversation.
import { useContext, useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StatusBar, Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { store } from "../core/store";
import { parseInline } from "./Markdown";
import { useAchilleState } from "./hooks";
import { Avatar, IconButton } from "./parts";
import { brandOf, GREY } from "./theme";
import { resolveUiLanguage } from "../shared/ui-language";
import { UI_LANGUAGES, uiStringsFor } from "../shared/ui-strings";

// Without a SafeAreaProvider in the app: the status bar's height.
export function useTopInset(): number {
  const insets = useContext(SafeAreaInsetsContext);
  if (insets) return insets.top;
  return Platform.OS === "android" ? StatusBar.currentHeight ?? 24 : 47;
}

export function ProactiveBanner() {
  const state = useAchilleState();
  const top = useTopInset();
  const shown = useRef(new Animated.Value(0)).current;
  const banner = state.banner;
  useEffect(() => {
    if (!banner) return;
    shown.setValue(0);
    Animated.spring(shown, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  }, [banner, shown]);
  if (!banner) return null;
  const brand = state.config
    ? brandOf(state.config)
    : { name: "Support", avatarUrl: null, color: "#111827", onColor: "#ffffff", onWhite: "#111827" };
  const t = uiStringsFor(resolveUiLanguage(state.config?.locale ?? null, store.locale, UI_LANGUAGES));
  // One readable line of text: links and emphasis as plain words.
  const text = parseInline(banner.body.replace(/\s+/g, " ")).map((part) => part.text).join("");
  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: top + 8,
        paddingHorizontal: 12,
        opacity: shown,
        transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => store.openProactive(banner)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
          backgroundColor: "#fff",
          borderRadius: 14,
          padding: 12,
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Avatar brand={brand} size={32} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: GREY.text }}>{brand.name}</Text>
          <Text numberOfLines={3} style={{ fontSize: 14, lineHeight: 19, color: GREY.body, marginTop: 2 }}>{text}</Text>
        </View>
        <IconButton icon="close" label={t.close} color={GREY.muted} size={16} onPress={() => store.dismissBanner()} />
      </Pressable>
    </Animated.View>
  );
}
