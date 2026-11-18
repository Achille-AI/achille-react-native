// Mounted once at the root of the app, around everything else: it draws the
// chat over the app when Achille.present… asks for it, and the banners of
// proactive messages.
//
//   <AchilleProvider>
//     <App />
//   </AchilleProvider>
import type { ReactNode } from "react";
import { ProactiveBanner } from "./ui/Banner";
import { Messenger } from "./ui/Messenger";

export function AchilleProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <ProactiveBanner />
      <Messenger />
    </>
  );
}
