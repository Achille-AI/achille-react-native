// Replies are plain text where links are markdown links, and the chat's own
// texts a little markdown: bold,
// italics, links, lists. Nothing else is interpreted; only http(s) links
// open.
import { Text, View, type TextStyle } from "react-native";

type Inline = { kind: "text" | "bold" | "italic"; text: string } | { kind: "link"; text: string; href: string };

// No lookbehind (older Hermes): an italic's preceding character is captured
// and given back as text.
const INLINE =
  /\*\*([^*\n]+)\*\*|__([^_\n]+)__|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])|(^|[^\w_])_(?!\s)([^_\n]+?)_(?![\w_])/g;

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: "text", text: text.slice(last, start) });
    const [, bold, bold2, label, href, bare, before, italic, before2, italic2] = match;
    if (bold ?? bold2) parts.push({ kind: "bold", text: (bold ?? bold2)! });
    else if (label && href) parts.push({ kind: "link", text: label, href });
    else if (bare) parts.push({ kind: "link", text: bare, href: bare });
    else {
      const prefix = before ?? before2 ?? "";
      if (prefix) parts.push({ kind: "text", text: prefix });
      parts.push({ kind: "italic", text: (italic ?? italic2)! });
    }
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

type Block = { kind: "paragraph"; text: string } | { kind: "list"; ordered: boolean; items: string[] };

const BULLET = /^\s{0,3}([-*+•]|\d{1,3}[.)])\s+(.*)$/;

export function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      const ordered = /\d/.test(bullet[1]);
      const previous = blocks[blocks.length - 1];
      if (previous?.kind === "list" && previous.ordered === ordered) previous.items.push(bullet[2]);
      else blocks.push({ kind: "list", ordered, items: [bullet[2]] });
    } else if (!line.trim()) {
      flush();
    } else {
      paragraph.push(line.replace(/^\s{0,3}#{1,6}\s+/, ""));
    }
  }
  flush();
  return blocks;
}

function InlineText({ text, style, linkColor, onLink }: {
  text: string;
  style: TextStyle;
  linkColor: string;
  onLink: (href: string) => void;
}) {
  return (
    <Text style={style}>
      {parseInline(text).map((part, index) => {
        if (part.kind === "bold") return <Text key={index} style={{ fontWeight: "600" }}>{part.text}</Text>;
        if (part.kind === "italic") return <Text key={index} style={{ fontStyle: "italic" }}>{part.text}</Text>;
        if (part.kind === "link") {
          return (
            <Text
              key={index}
              accessibilityRole="link"
              style={{ color: linkColor, textDecorationLine: "underline" }}
              onPress={() => onLink(part.href)}
            >
              {part.text}
            </Text>
          );
        }
        return part.text;
      })}
    </Text>
  );
}

export function Markdown({ content, style, linkColor, onLink }: {
  content: string;
  style: TextStyle;
  linkColor: string;
  onLink: (href: string) => void;
}) {
  const blocks = parseBlocks(content);
  return (
    <View style={{ gap: 6 }}>
      {blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <InlineText key={index} text={block.text} style={style} linkColor={linkColor} onLink={onLink} />
        ) : (
          <View key={index} style={{ gap: 2 }}>
            {block.items.map((item, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 6 }}>
                <Text style={style}>{block.ordered ? `${i + 1}.` : "•"}</Text>
                <View style={{ flex: 1 }}>
                  <InlineText text={item} style={style} linkColor={linkColor} onLink={onLink} />
                </View>
              </View>
            ))}
          </View>
        )
      )}
    </View>
  );
}
