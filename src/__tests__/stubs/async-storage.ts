export const memory = new Map<string, string>();

export default {
  getItem: async (key: string) => memory.get(key) ?? null,
  setItem: async (key: string, value: string) => void memory.set(key, value),
  removeItem: async (key: string) => void memory.delete(key),
};
