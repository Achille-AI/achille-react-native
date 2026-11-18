# Achille pour React Native

Le chat Achille dans une app React Native, sur des écrans natifs. C'est le chat du Helpdesk, avec son parcours guidé, son IA et les réponses de l'équipe, comme sur le site, mais intégré à l'app.

- **Écrans natifs**, sans WebView ni code natif à lier : Expo et React Native sans Expo.
- **Utilisateurs identifiés** par une signature de votre serveur, avec leurs conversations sur tous leurs appareils.
- **Contexte de l'app** transmis à l'équipe et à l'IA : infos sur l'utilisateur, écran d'où le chat est ouvert.
- **Messages proactifs** déclenchés par les événements de l'app.
- **Notifications push** par votre propre outil, via un webhook.
- **Réglé depuis le Helpdesk** : couleurs, textes, parcours guidé, horaires, sans nouvelle version de l'app.

## Installation

```sh
npm install github:Achille-AI/achille-react-native
```

Le SDK est écrit en JavaScript, sans code natif à lier. Il s'appuie sur des bibliothèques que la plupart des apps ont déjà :

```sh
npx expo install @react-native-async-storage/async-storage react-native-safe-area-context react-native-svg
# ou, sans Expo : npm install … puis cd ios && pod install
```

Il faut React Native 0.76 ou plus récent. Expo et React Native sans Expo sont tous deux pris en charge.

## Mise en place

### 1. Initialiser au démarrage

```tsx
import { Achille, AchilleProvider } from "@achille-ai/react-native";

Achille.initialize({ widgetKey: "VOTRE_CLE_DE_CHAT" });

export default function App() {
  return (
    <SafeAreaProvider>
      <AchilleProvider>
        <RootNavigator />
      </AchilleProvider>
    </SafeAreaProvider>
  );
}
```

La clé du chat est publique. Elle se trouve dans Helpdesk > Réglages > Chat > Application mobile.

`<AchilleProvider>` se place une seule fois, à la racine de l'app. C'est lui qui affiche le chat par-dessus l'app : en feuille sur iOS, en plein écran sur Android.

### 2. Connecter l'utilisateur

Quand l'utilisateur est connecté à l'app, ses messages arrivent dans le Helpdesk sous son e-mail vérifié. Il retrouve aussi ses conversations sur un autre téléphone ou après une réinstallation.

```tsx
await Achille.loginUser(async () => {
  // Votre backend signe l'utilisateur : voir plus bas.
  const res = await api.get("/me/achille-identity");
  return res.data; // { userId, email, name?, ts, signature }
});
```

Passez une fonction plutôt qu'un objet. Une signature reste valable 24 heures, et le SDK rappelle la fonction quand elle approche de l'expiration.

À la déconnexion de l'app :

```tsx
await Achille.logout();
```

Si `loginUser` reçoit un autre utilisateur sans `logout` entre les deux, le SDK repart de zéro : il ne montre jamais les conversations d'un autre utilisateur.

### 3. Signer l'utilisateur côté serveur

La signature est un HMAC-SHA256 en hexadécimal de `"{ts}:{userId}:{email}"`, avec le secret d'identité du chat. `ts` est l'heure Unix en secondes. Le secret se trouve dans Helpdesk > Réglages > Chat > Application mobile. Il reste sur votre serveur et ne doit jamais se trouver dans l'app.

`userId` est l'identifiant de l'utilisateur chez vous : de 1 à 64 lettres, chiffres, `_` ou `-`.

Node.js :

```js
import { createHmac } from "node:crypto";

app.get("/me/achille-identity", requireUser, (req, res) => {
  const ts = Math.floor(Date.now() / 1000);
  const { id: userId, email, firstName: name } = req.user;
  const signature = createHmac("sha256", process.env.ACHILLE_IDENTITY_SECRET)
    .update(`${ts}:${userId}:${email}`)
    .digest("hex");
  res.json({ userId, email, name, ts, signature });
});
```

Ruby :

```ruby
ts = Time.now.to_i
signature = OpenSSL::HMAC.hexdigest("SHA256", ENV.fetch("ACHILLE_IDENTITY_SECRET"), "#{ts}:#{user.id}:#{user.email}")
```

Le nom n'est pas signé : il sert seulement à l'affichage dans le Helpdesk.

### 4. Ouvrir le chat

```tsx
Achille.present();                                // accueil, ou la conversation en cours
Achille.presentMessages();                        // la liste des conversations
Achille.presentConversation(conversationId);      // une conversation précise
Achille.presentMessageComposer("Ma commande…");  // nouvelle conversation, texte prérempli
Achille.dismiss();
```

Chaque appel accepte un **contexte d'ouverture** : pourquoi l'app ouvre le chat, pour cette ouverture seulement.

```tsx
Achille.present({ context: { entry: "order_help", order_id: "A123" } });
Achille.presentMessageComposer("Ma commande…", { context: { entry: "checkout" } });
```

- Les valeurs suivent les règles des infos utilisateur (section 6), avec 20 clés au plus.
- Les messages écrits pendant cette ouverture emportent ce contexte : l'équipe le voit dans le Helpdesk, et l'IA d'Achille s'en sert pour répondre.
- Les conditions du chat le lisent (section 8).
- Il n'est pas signé.

L'app peut ouvrir le chat depuis son propre bouton d'aide. Elle peut aussi afficher le bouton flottant du SDK, aux couleurs du chat :

```tsx
import { AchilleLauncher } from "@achille-ai/react-native";

<AchilleLauncher />
```

### 5. Réponses non lues

```tsx
import { useAchilleUnreadCount } from "@achille-ai/react-native";

const unread = useAchilleUnreadCount(); // pour un badge

// Hors composant :
Achille.getUnreadConversationCount();
const remove = Achille.addEventListener("unreadCountChanged", (count) => {});
```

Le compte est rafraîchi toutes les 20 secondes quand l'app est au premier plan, toutes les 5 secondes quand le chat est ouvert, et jamais en arrière-plan.

Autres événements disponibles : `windowDidShow` et `windowDidHide`.

### 6. Infos sur l'utilisateur

L'app peut transmettre des infos sur l'utilisateur : formule, nombre de commandes, version de l'app… L'équipe les voit dans le Helpdesk à côté de ses conversations, l'IA d'Achille s'en sert pour répondre, et les conditions du chat les lisent (section 8).

```tsx
await Achille.loginUser(getIdentity);
await Achille.updateUser({
  name: "Camille",
  customAttributes: { plan: "premium", last_order: "A123", app_version: "5.2.0" },
});
```

- Les valeurs doivent être simples : texte, nombre ou booléen.
- Une valeur `null` retire la clé.
- Un nouvel appel complète ce qui a été envoyé avant.
- Les infos partent avec chaque message de l'utilisateur.
- Appelez `updateUser` après `loginUser` : un changement d'utilisateur efface les infos du précédent.
- Ces infos ne sont pas signées. Elles servent à l'affichage, jamais à vérifier qui est l'utilisateur.

### 7. Événements et messages proactifs

L'app signale ce qui se passe chez l'utilisateur :

```tsx
Achille.logEvent("delivery_delayed", { order: "A123" });
```

Dans Helpdesk > Réglages > Chat > Messages proactifs, chaque événement peut déclencher un message. `{{order}}` y est remplacé par la valeur envoyée.

Le message s'affiche de deux façons :
- **en bannière** par-dessus l'app ; un toucher ouvre le chat sur ce message ;
- **en ouvrant directement le chat**.

La fréquence se règle aussi : une seule fois, une fois par jour, ou à chaque fois.

Si l'utilisateur répond, une conversation s'ouvre avec ce message en premier, pour que l'équipe ait le contexte. Un événement sans message configuré ne fait rien.

Un message peut aussi ne s'afficher qu'à certains utilisateurs (section 8). Ses conditions lisent les infos utilisateur et les données de l'événement.

### 8. Adapter le chat à l'utilisateur

Dans les réglages du chat, une condition « Afficher si… » peut s'ajouter à ces éléments :
- les cartes de lien et d'annonce de l'accueil ;
- les boutons du parcours guidé ;
- les messages proactifs.

Une condition lit ces données :
- `signed_in` : l'utilisateur est connecté (`loginUser`) ou non ;
- les infos utilisateur (`updateUser`) ;
- le contexte d'ouverture (`present({ context })`), qui l'emporte sur une info utilisateur du même nom ;
- pour un message proactif, les données de l'événement.

Par exemple :
- une carte « Vos avantages Premium » affichée si `plan` est `premium` ;
- un bouton « Un problème avec cette commande » affiché si `entry` est `order_help` ;
- un message proactif réservé aux clients dont `orders_count` est supérieur à 0.

Les comparaisons ignorent les majuscules. Une donnée absente ou vide n'est égale à rien : « `plan` n'est pas `premium` » est donc vrai pour un utilisateur sans formule.

Sur le site web, le chat ne connaît que `signed_in`. L'aperçu des réglages montre tous les éléments, avec ou sans condition.

### 9. Notifications push

Achille n'envoie pas de notification lui-même : c'est votre serveur qui les envoie, avec votre outil habituel (Customer.io, Firebase, OneSignal…).

1. **Abonnement** : dans Helpdesk > Réglages > Webhooks, abonnez votre serveur à l'événement `chat.reply_unseen`.
2. **Envoi** : Achille appelle ce webhook quand une réponse de l'équipe ou de l'IA n'a pas été vue 15 secondes après son envoi. La requête est signée dans l'en-tête `X-Achille-Signature`, comme les autres webhooks Achille. Son contenu :

```json
{
  "id": "…",
  "type": "chat.reply_unseen",
  "created_at": "2026-11-17T18:02:11Z",
  "data": {
    "ticket_id": "…",
    "conversation_id": "…",
    "message_id": "…",
    "chat_channel_id": "…",
    "sender_name": "Camille",
    "text": "Bonjour, votre colis part demain…",
    "customer": { "external_id": "user_42", "email": "a@b.co", "verified": true }
  }
}
```

   `customer.external_id` est le `userId` passé à `loginUser`. Il n'est rempli que si l'identité a été vérifiée, et sert à retrouver l'utilisateur chez vous. Votre serveur envoie alors la notification à cet utilisateur, avec `{ "achille": "1", "conversation_id": "…" }` dans ses données.
3. **Ouverture** : quand l'utilisateur touche la notification, l'app ouvre la conversation :

```tsx
// Avec le gestionnaire de notifications de l'app, quel qu'il soit
onNotificationOpened((data) => {
  if (Achille.isAchillePush(data)) Achille.handlePush(data);
});
```

Sans notification, la réponse part aussi par e-mail si l'utilisateur ne l'a pas vue.

### 10. Photos et fichiers (facultatif)

Le bouton trombone apparaît quand l'app fournit un sélecteur. Le SDK ne dépend d'aucun sélecteur en particulier.

```tsx
import * as ImagePicker from "expo-image-picker";

Achille.initialize({
  widgetKey: "…",
  pickAttachments: async (rules) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: rules.maxFiles,
    });
    if (result.canceled) return [];
    return result.assets.map((a) => ({
      uri: a.uri,
      name: a.fileName ?? "photo.jpg",
      type: a.mimeType ?? "image/jpeg",
      size: a.fileSize,
    }));
  },
});
```

`rules` donne les limites du chat : nombre de fichiers, taille par fichier, taille totale et types acceptés. Le SDK les vérifie avant l'envoi, et le serveur les vérifie à nouveau.

### Autres options d'`initialize`

| Option | Par défaut | Rôle |
| --- | --- | --- |
| `locale` | langue de l'appareil | Langue des textes du chat |
| `openUrl` | `Linking.openURL` | Ouverture des liens des messages et des boutons, par exemple dans un navigateur intégré |
| `apiUrl` | `https://support.achille.ai` | Serveur du chat |

## Ce que le chat affiche

Le SDK lit la configuration du chat dans le Helpdesk. Couleurs, textes, accueil, parcours à boutons, IA, horaires et mention de confidentialité se règlent donc au même endroit que pour le site, sans nouvelle version de l'app.

## Développement

```sh
npm install
npm test          # logique hors écrans (Vitest)
npm run typecheck
```

L'app d'exemple se trouve dans `example/` et lit le SDK depuis `../src`. Mettez la clé du chat dans `example/.env.local` (`EXPO_PUBLIC_ACHILLE_WIDGET_KEY=…`), puis lancez :

```sh
cd example && npm install && npx expo start
```

`src/shared/` est généré depuis le chat du site web, pour que l'app et le site se comportent de la même façon : formats de l'API, parcours guidé, textes. On ne le modifie pas ici.

## Licence

MIT. Voir [LICENSE](LICENSE).
