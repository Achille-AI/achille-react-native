import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The logic outside the views runs in Node: react-native and AsyncStorage are
// replaced by small stubs.
const stub = (name: string) => fileURLToPath(new URL(`./src/__tests__/stubs/${name}`, import.meta.url));

export default defineConfig({
  test: { include: ["src/**/__tests__/**/*.test.ts"] },
  resolve: {
    alias: {
      "react-native": stub("react-native.ts"),
      "@react-native-async-storage/async-storage": stub("async-storage.ts"),
    },
  },
});
