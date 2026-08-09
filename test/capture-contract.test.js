import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

function markdownTools() {
  const source = readFileSync(new URL("../markdown.js", import.meta.url), "utf8");
  const context = { globalThis: {} };
  runInNewContext(source, context);
  return context.globalThis.XToXhsMarkdown;
}

test("复制 Markdown 保留文本结构且过滤图片", () => {
  const markdown = markdownTools().blocksToMarkdown([
    { type: "heading", level: 1, text: "文章标题" },
    { type: "paragraph", text: "正文内容" },
    { type: "image", url: "https://pbs.twimg.com/media/example" },
    { type: "code", text: "const answer = 42;", language: "js" },
  ], { includeImages: false });

  assert.match(markdown, /^# 文章标题\n\n正文内容/u);
  assert.match(markdown, /```js\nconst answer = 42;/u);
  assert.doesNotMatch(markdown, /pbs\.twimg\.com/u);
});

test("采集器保留 X Article 的正文与懒加载兼容选择器", () => {
  const source = readFileSync(new URL("../content.js", import.meta.url), "utf8");

  assert.match(source, /p, h1, h2, h3, h4, h5, h6, li, blockquote/u);
  assert.match(source, /longform-unstyled \.public-DraftStyleDefault-block/u);
  assert.match(source, /show more\|显示更多/u);
  assert.match(source, /revealLazyContent/u);
});

test("Manifest 保持独立运行所需的最小权限", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.name, "x-to-md");
  assert.equal(manifest.version, "1.0.0");
  assert.deepEqual(manifest.permissions, ["activeTab", "storage"]);
  assert.equal(manifest.web_accessible_resources, undefined);
});
