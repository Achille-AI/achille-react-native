type Listener = (state: string) => void;
const listeners = new Set<Listener>();

export const AppState = {
  currentState: "active",
  addEventListener(_event: "change", fn: Listener) {
    listeners.add(fn);
    return { remove: () => listeners.delete(fn) };
  },
};

export const Text = "Text";
export const View = "View";
export const Platform = { OS: "ios" };
