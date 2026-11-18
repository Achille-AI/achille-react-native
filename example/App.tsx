// A bare app embedding the Achille chat: what an app does to integrate it.
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Achille, AchilleLauncher, AchilleProvider, useAchilleUnreadCount } from "@achille-ai/react-native";

Achille.initialize({
  widgetKey: process.env.EXPO_PUBLIC_ACHILLE_WIDGET_KEY ?? "",
  apiUrl: process.env.EXPO_PUBLIC_ACHILLE_API_URL,
  // Photos from the library; an app can offer documents or the camera too.
  pickAttachments: async (rules) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: rules.maxFiles,
    });
    if (result.canceled) return [];
    return result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.fileName ?? "photo.jpg",
      type: asset.mimeType ?? "image/jpeg",
      size: asset.fileSize,
    }));
  },
});

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

// What the app tells the team about its user.
void Achille.updateUser({ customAttributes: { plan: "premium", orders_count: 3, app_version: "1.0.0" } });

function Home() {
  const unread = useAchilleUnreadCount();
  return (
    <SafeAreaView style={styles.page}>
      <Text style={styles.title}>Exemple d'intégration</Text>
      <Text style={styles.subtitle}>Réponses non lues : {unread}</Text>
      <Button label="Ouvrir le chat" onPress={() => Achille.present()} />
      <Button
        label="Ouvrir depuis une commande"
        onPress={() => Achille.present({ context: { entry: "order_help", order_id: "A123" } })}
      />
      <Button label="Mes conversations" onPress={() => Achille.presentMessages()} />
      <Button label="Nouveau message prérempli" onPress={() => Achille.presentMessageComposer("Ma commande n'est pas arrivée")} />
      <Button label="Événement : retard de livraison" onPress={() => Achille.logEvent("delivery_delayed", { order: "A123" })} />
      <AchilleLauncher />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AchilleProvider>
        <Home />
      </AchilleProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#fff", padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", marginTop: 24 },
  subtitle: { fontSize: 15, color: "#6b7280", marginBottom: 12 },
  button: { backgroundColor: "#111827", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
