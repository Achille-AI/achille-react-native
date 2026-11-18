// An optional chat button floating over the app, in the chat's color, with
// the unread count. Apps that open the chat from their own help button use
// Achille.present() and useAchilleUnreadCount() instead.
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { useContext } from "react";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { store } from "../core/store";
import { badgeText } from "../shared/conversations";
import { useAchilleState } from "./hooks";
import { Icon } from "./icons";
import { brandOf } from "./theme";

export function AchilleLauncher({ label = "Chat", style }: { label?: string; style?: ViewStyle }) {
  const state = useAchilleState();
  // Without a SafeAreaProvider in the app: no inset.
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  if (!state.initialized || state.config?.visible === false) return null;
  const brand = state.config ? brandOf(state.config) : { color: "#111827", onColor: "#ffffff" };
  const badge = badgeText(state.list.unread);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} (${badge})` : label}
      onPress={() => store.present({ screen: "home" })}
      style={({ pressed }) => [
        {
          position: "absolute",
          right: 20,
          bottom: 20 + bottomInset,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: brand.color,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 5,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
        style,
      ]}
    >
      <Icon name="chat" size={26} color={brand.onColor} />
      {badge && (
        <View
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            paddingHorizontal: 5,
            backgroundColor: "#ef4444",
            borderWidth: 2,
            borderColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}
