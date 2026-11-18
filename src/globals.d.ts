// React Native's URL has these getters at runtime (Libraries/Blob/URL.js)
// but its type declarations lag behind; the shared flow engine reads
// `protocol` (httpsUrl).
declare global {
  interface URL {
    readonly protocol: string;
    readonly hostname: string;
  }
}

export {};
