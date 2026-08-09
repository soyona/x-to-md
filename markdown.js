(function exposeMarkdownTools() {
  function inlineToMarkdown(block) {
    const segments = Array.isArray(block.segments) && block.segments.length
      ? block.segments
      : [{ text: block.text || "" }];
    return segments
      .map((segment) => {
        let value = segment.text || "";
        if (segment.href) value = `[${value}](${segment.href})`;
        if (segment.code) value = `\`${value}\``;
        if (segment.emphasis) value = `*${value}*`;
        if (segment.strike) value = `~~${value}~~`;
        if (segment.strong) value = `**${value}**`;
        return value;
      })
      .join("");
  }

  function blocksToMarkdown(blocks = [], { includeImages = true } = {}) {
    return blocks
      .map((block) => {
        if (block.type === "image") {
          return includeImages ? `![${block.altText || "图片"}](${block.url || ""})` : "";
        }
        if (block.type === "code") {
          return `\`\`\`${block.language || ""}\n${block.text || ""}\n\`\`\``;
        }
        if (block.type === "heading") return `${"#".repeat(block.level || 1)} ${inlineToMarkdown(block)}`;
        if (block.type === "blockquote") {
          return inlineToMarkdown(block).split("\n").map((line) => `> ${line}`).join("\n");
        }
        if (block.type === "divider") return "---";
        if (block.type === "listItem") return `${block.ordered ? "1." : "-"} ${inlineToMarkdown(block)}`;
        if (block.type === "link") return `[${block.text || block.url}](${block.url || ""})`;
        return inlineToMarkdown(block);
      })
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  globalThis.XToXhsMarkdown = { blocksToMarkdown };
})();
