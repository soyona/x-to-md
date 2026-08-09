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
  assert.equal(manifest.version, "1.0.1");
  assert.deepEqual(manifest.permissions, ["activeTab", "storage"]);
  assert.equal(manifest.web_accessible_resources, undefined);
});

test("Popup 与预览页保留清晰的成功、边界和来源反馈", () => {
  const popup = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
  const popupScript = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../preview.html", import.meta.url), "utf8");
  const previewScript = readFileSync(new URL("../preview.js", import.meta.url), "utf8");

  assert.match(popup, /提取并复制 Markdown/u);
  assert.match(popup, /不上传内容/u);
  assert.match(popupScript, /capture\?\.error/u);
  assert.match(popupScript, /已复制 Markdown，但预览未能打开/u);
  assert.match(preview, /已提取 · Markdown 已复制/u);
  assert.match(previewScript, /查看原文/u);
  assert.match(previewScript, /图片不进入 Markdown/u);
  assert.match(previewScript, /本次预览已过期/u);
});
