// The chat's look on native screens: the website widget's greys, radii and
// sizes, in the chat's own color.
import { readableOnWhite, readableTextOn } from "../shared/readable-color";
import type { WidgetConfig } from "../core/types";

export const GREY = {
  page: "#f6f7f9",
  bubble: "#f3f4f6",
  border: "#e5e7eb",
  muted: "#6b7280",
  faint: "#9ca3af",
  text: "#111827",
  body: "#1f2937",
  danger: "#ef4444",
  online: "#34d399",
  offline: "#d1d5db",
};

export interface Brand {
  name: string;
  avatarUrl: string | null;
  // The chat's color, the text on it, and the color as read on white.
  color: string;
  onColor: string;
  onWhite: string;
}

export function brandOf(config: WidgetConfig): Brand {
  const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(config.primary_color) ? config.primary_color : "#4f46e5";
  return {
    name: config.agent_name || "Support",
    avatarUrl: httpsOrNull(config.agent_avatar_url),
    color,
    onColor: config.secondary_color || readableTextOn(color),
    onWhite: readableOnWhite(color),
  };
}

// The website's color-mix(in srgb, color N%, white).
export function tint(color: string, percent = 12): string {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!match) return GREY.bubble;
  const hex = match[1].length === 3 ? match[1].replace(/./g, "$&$&") : match[1];
  const mixed = [0, 2, 4].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(channel * (percent / 100) + 255 * (1 - percent / 100));
  });
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function httpsOrNull(value: unknown): string | null {
  return typeof value === "string" && /^https:\/\//i.test(value) ? value : null;
}
