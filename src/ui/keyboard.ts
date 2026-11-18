// How much of a view the keyboard covers, so a screen can lift its composer
// above it. Measured, not assumed: the chat is a modal, and on Android a modal
// drawn edge to edge (React Native's default since 0.81) is not resized for
// the keyboard whatever the app's windowSoftInputMode, while on iOS the sheet
// does not start at the top of the screen. The overlap between the view's
// bottom (in window coordinates) and the keyboard's top is right in every
// case, and is 0 where the system did resize the window, so nothing is lifted
// twice.
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Keyboard, Platform, View, type KeyboardEvent } from "react-native";

export function useKeyboardOverlap() {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (event: KeyboardEvent) => {
      const keyboardTop = event.endCoordinates.screenY;
      ref.current?.measureInWindow((_x, y, _width, height) => setOverlap(Math.max(0, Math.round(y + height - keyboardTop))));
    };
    const subscriptions = [
      Keyboard.addListener(show, onShow),
      Keyboard.addListener(hide, () => setOverlap(0)),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);
  return { ref, overlap };
}
