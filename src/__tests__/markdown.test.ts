import { describe, expect, it } from "vitest";
import { parseBlocks, parseInline } from "../ui/Markdown";

describe("parseInline", () => {
  it("reads bold, links, bare links and italics", () => {
    expect(parseInline("**Hello**, see [the page](https://x.co/a) or https://y.co/b.")).toEqual([
      { kind: "bold", text: "Hello" },
      { kind: "text", text: ", see " },
      { kind: "link", text: "the page", href: "https://x.co/a" },
      { kind: "text", text: " or " },
      { kind: "link", text: "https://y.co/b", href: "https://y.co/b" },
      { kind: "text", text: "." },
    ]);
    expect(parseInline("it is *really* fine")).toEqual([
      { kind: "text", text: "it is" },
      { kind: "text", text: " " },
      { kind: "italic", text: "really" },
      { kind: "text", text: " fine" },
    ]);
  });

  it("leaves emails, order numbers and non-http links alone", () => {
    expect(parseInline("jean_le_bon@mail.fr #1234 [x](javascript:alert(1))")).toEqual([
      { kind: "text", text: "jean_le_bon@mail.fr #1234 [x](javascript:alert(1))" },
    ]);
  });
});

describe("parseBlocks", () => {
  it("splits paragraphs and lists", () => {
    expect(parseBlocks("Hi\nthere\n\n- one\n- two\n1. first")).toEqual([
      { kind: "paragraph", text: "Hi\nthere" },
      { kind: "list", ordered: false, items: ["one", "two"] },
      { kind: "list", ordered: true, items: ["first"] },
    ]);
  });
});
