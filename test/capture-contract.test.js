import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function markdownTools() {
  const context = { globalThis: {} };
  runInNewContext(source("../markdown.js"), context);
  return context.globalThis.XToXhsMarkdown;
}

function backgroundContext() {
  const event = { addListener() {} };
  const context = {
    URL,
    globalThis: null,
    chrome: {
      runtime: { onMessage: event, getURL: (value) => value, sendMessage: async () => ({}) },
      action: { onClicked: event },
      tabs: { sendMessage: async () => ({}), get: async (id) => ({ id }), create: async () => ({}) },
      scripting: { executeScript: async () => {} },
      storage: { local: { get: async () => ({}), set: async () => {} }, session: { set: async () => {} } },
      sidePanel: { open: async () => {} },
    },
    console: { error() {} },
  };
  context.globalThis = context;
  runInNewContext(source("../background.js"), context);
  return context;
}

function contentVerificationClassifier() {
  const content = source("../content.js");
  const start = content.indexOf("function authorVerificationTypeFromRoot");
  const end = content.indexOf("\n\nfunction authorPresentationFromElement", start);
  const context = { globalThis: {} };
  runInNewContext(`${content.slice(start, end)}\nglobalThis.classify = authorVerificationTypeFromRoot;`, context);
  return context.globalThis.classify;
}

function sidepanelBadgeRenderer() {
  const panel = source("../sidepanel.js");
  const start = panel.indexOf("let verifiedBadgeSequence");
  const end = panel.indexOf("\n\nfunction moreIcon", start);
  const context = { globalThis: {} };
  runInNewContext(`${panel.slice(start, end)}\nglobalThis.renderBadge = verifiedBadge;`, context);
  return context.globalThis.renderBadge;
}

function article(overrides = {}) {
  return {
    contentType: "article",
    sourceUrl: "https://x.com/example/article/42?ref=share",
    title: "Article title",
    authorHandle: "example",
    authorName: "Example",
    authorVerificationType: "blue",
    ...overrides,
  };
}

test("Markdown 保留文本结构且过滤图片", () => {
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

test("Article 采集只保留一个与文档标题相同的一级标题", () => {
  const title = "Obsidian 别只装完就吃灰";
  const blocks = markdownTools().withoutRepeatedDocumentTitle([
    { type: "heading", level: 1, text: title },
    { type: "paragraph", text: "正文第一段" },
    { type: "heading", level: 1, text: `  ${title}\n` },
    { type: "heading", level: 2, text: title },
  ], title);
  assert.deepEqual(blocks.map((block) => [block.type, block.level, block.text]), [
    ["heading", 1, title],
    ["paragraph", undefined, "正文第一段"],
    ["heading", 2, title],
  ]);
});

test("Manifest 保持独立运行所需的最小权限", () => {
  const manifest = JSON.parse(source("../manifest.json"));
  assert.equal(manifest.name, "x-to-md");
  assert.deepEqual(manifest.permissions, ["activeTab", "storage", "sidePanel", "scripting"]);
  assert.deepEqual(manifest.side_panel, { default_path: "sidepanel.html" });
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.background.service_worker, "background.js");
});

test("新 schema 不迁移开发期数据", () => {
  const store = backgroundContext().XToMdInboxStore;
  assert.deepEqual(JSON.parse(JSON.stringify(store.emptyInbox())), {
    schemaVersion: 1, readingList: [], authors: [], assets: [],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(store.currentInbox({ candidates: [{}], subscriptions: [{}], assets: [{}] }))), {
    schemaVersion: 1, readingList: [], authors: [], assets: [],
  });
});

test("待读只接受 Article 并按规范化 URL 去重", () => {
  const store = backgroundContext().XToMdInboxStore;
  const first = store.saveReadingArticle(store.emptyInbox(), article(), { id: "reading_1", now: "2026-08-14T00:00:00Z" });
  const second = store.saveReadingArticle(first.inbox, article({ title: "Updated" }), { id: "reading_2", now: "2026-08-14T01:00:00Z" });
  assert.equal(second.inbox.readingList.length, 1);
  assert.equal(second.inbox.readingList[0].id, "reading_1");
  assert.equal(second.inbox.readingList[0].title, "Updated");
  assert.equal(second.inbox.readingList[0].sourceUrl, "https://x.com/example/article/42");
  assert.equal(second.inbox.readingList[0].addedAt, "2026-08-14T00:00:00Z");
  assert.equal(second.inbox.readingList[0].authorVerificationType, "blue");
  assert.equal("markdown" in second.inbox.readingList[0], false);
  assert.throws(() => store.saveReadingArticle(second.inbox, article({ contentType: "post" })), /Article/u);
  assert.throws(() => store.saveReadingArticle(second.inbox, article({ sourceUrl: "https://example.com/article/42" })), /Article/u);
});

test("素材只在 Article Markdown 有效时保存并同步移出待读", () => {
  const store = backgroundContext().XToMdInboxStore;
  const queued = store.saveReadingArticle(store.emptyInbox(), article(), { id: "reading_1", now: "2026-08-14T00:00:00Z" }).inbox;
  assert.throws(() => store.saveArticleAsset(queued, article({ content: "" })), /Markdown/u);
  assert.equal(queued.assets.length, 0);
  assert.equal(queued.readingList.length, 1);

  const saved = store.saveArticleAsset(queued, article({ content: "# Article title\n\nBody" }), { id: "asset_1", now: "2026-08-14T01:00:00Z" });
  assert.equal(saved.inbox.assets.length, 1);
  assert.equal(saved.inbox.readingList.length, 0);
  assert.equal(saved.asset.markdown, "# Article title\n\nBody");
  assert.equal(saved.asset.usageStatus, "unused");
  assert.equal(saved.asset.authorVerificationType, "blue");
  assert.deepEqual(Array.from(saved.asset.tags), []);
  assert.equal("markdownState" in saved.asset, false);
  assert.throws(() => store.saveArticleAsset(saved.inbox, article({ contentType: "post", content: "Post" })), /Article/u);
});

test("重复保存素材覆盖 Markdown 并保留标签与使用状态", () => {
  const store = backgroundContext().XToMdInboxStore;
  const first = store.saveArticleAsset(store.emptyInbox(), article({ content: "First" }), { id: "asset_1", now: "2026-08-14T00:00:00Z" });
  const updated = store.updateArticleAsset(first.inbox, "asset_1", { tags: ["idea"], usageStatus: "used" }, { now: "2026-08-14T00:30:00Z" });
  const second = store.saveArticleAsset(updated.inbox, article({ content: "Second", title: "New title" }), { id: "asset_2", now: "2026-08-14T01:00:00Z" });
  assert.equal(second.inbox.assets.length, 1);
  assert.equal(second.asset.id, "asset_1");
  assert.equal(second.asset.markdown, "Second");
  assert.equal(second.asset.title, "New title");
  assert.deepEqual(Array.from(second.asset.tags), ["idea"]);
  assert.equal(second.asset.usageStatus, "used");
});

test("作者按 handle 去重并保留认证类型", () => {
  const store = backgroundContext().XToMdInboxStore;
  const first = store.saveAuthor(store.emptyInbox(), { handle: "Example", displayName: "One", authorVerificationType: "blue" }, { id: "author_1", now: "2026-08-14T00:00:00Z" });
  const second = store.saveAuthor(first.inbox, { handle: "@example", displayName: "Two", authorVerificationType: "gold" }, { id: "author_2", now: "2026-08-14T01:00:00Z" });
  assert.equal(second.inbox.authors.length, 1);
  assert.equal(second.author.id, "author_1");
  assert.equal(second.author.displayName, "Two");
  assert.equal(second.author.authorVerificationType, "gold");
  assert.equal(store.saveAuthor(second.inbox, { handle: "example", authorVerificationType: "unknown" }).author.authorVerificationType, "");
  assert.equal(store.removeAuthor(second.inbox, "EXAMPLE").inbox.authors.length, 0);
});

test("Background 只暴露 Article-first 持久化与一次性预览协议", () => {
  const background = source("../background.js");
  for (const type of ["save-reading-article", "remove-reading-article", "save-article-asset", "remove-article-asset", "save-author", "remove-author", "open-markdown-preview"]) {
    assert.match(background, new RegExp(`message\\?\\.type === "${type}"`, "u"));
  }
  assert.match(background, /CONTENT_SCRIPT_REVISION = "article-first-v3"/u);
  assert.match(background, /files: \["markdown\.js", "content\.js"\]/u);
  assert.doesNotMatch(background, /materialize|preview-job|capture-source|publishedLinks/u);
});

test("Article 详情从当前主 Card 采集作者身份与发布时间", () => {
  const content = source("../content.js");
  assert.match(content, /function articleMetadataRootFromPage\(captureRoot = articleCandidateRootFromPage\(\)\)/u);
  assert.match(content, /const statusRoot = statusSourceCardFromPage\(\);\s*if \(statusRoot\) return statusRoot;/u);
  assert.match(content, /captureRoot\?\.closest\?\.\('article\[data-testid="tweet"\]'\)/u);
  assert.match(content, /root\?\.querySelector\?\.\('\[data-testid="User-Name"\], \[data-testid="UserName"\]'\)/u);
  assert.match(content, /metadataRoot\?\.querySelector\('time\[datetime\]'\)/u);
  assert.match(content, /function authorVerificationTypeFromRoot\(root\)/u);
  assert.match(content, /icon\.querySelector\("linearGradient"\) \? "gold" : "blue"/u);
  assert.match(content, /\.\.\.previewMetadata,\s*authorVerificationType: pageAuthor\.authorVerificationType/u);
  assert.doesNotMatch(content, /authorVerified/u);
  const classify = contentVerificationClassifier();
  assert.equal(classify({ querySelector: () => null }), "");
  assert.equal(classify({ querySelector: () => ({ querySelector: () => null }) }), "blue");
  assert.equal(classify({ querySelector: () => ({ querySelector: () => ({}) }) }), "gold");
});

test("Side Panel 使用 X 原始蓝色与金色认证徽标", () => {
  const script = source("../sidepanel.js");
  const css = source("../sidepanel.css");
  assert.match(script, /function verifiedBadge\(type\)/u);
  assert.match(script, /M20\.396 11c-\.018-\.646/u);
  assert.match(script, /linearGradient[\s\S]*#f4e72a[\s\S]*#e2b719/u);
  assert.match(script, /verifiedBadge\(item\.authorVerificationType\)/u);
  assert.match(script, /verifiedBadge\(author\.authorVerificationType\)/u);
  assert.match(script, /verifiedBadge\(asset\.authorVerificationType\)/u);
  assert.match(css, /\.verified-badge\.is-blue \{ color: var\(--x-blue\); \}/u);
  assert.match(css, /\.author-identity > \.author-handle \{ color: var\(--x-secondary\); \}/u);
  assert.doesNotMatch(css, /\.author-identity span \{/u);
  const renderBadge = sidepanelBadgeRenderer();
  assert.equal(renderBadge(""), "");
  assert.match(renderBadge("blue"), /class="verified-badge is-blue"[\s\S]*M20\.396 11c-\.018-\.646/u);
  const firstGold = renderBadge("gold");
  const secondGold = renderBadge("gold");
  assert.match(firstGold, /class="verified-badge is-gold"[\s\S]*#f4e72a[\s\S]*#d18800/u);
  assert.notEqual(firstGold.match(/id="([^"]+-a)"/u)?.[1], secondGold.match(/id="([^"]+-a)"/u)?.[1]);
});

test("Content Script 实现普通 Post 列表排除与固定菜单矩阵", () => {
  const content = source("../content.js");
  assert.match(content, /function contentCandidateForActionsRoot\(root\)/u);
  assert.match(content, /isArticleSourcePage\(\) \? contentCandidateFromPage/u);
  assert.match(content, /: articleCandidateFromListRoot\(root\)/u);
  assert.match(content, /if \(!cover && articleMarker < 0 && !isArticlesIndexPage\(\)\) return null;/u);
  assert.match(content, /if \(candidate\.contentType === "post"\) \{\s*menu\.append\(actionRow\("复制 Markdown"/su);
  assert.match(content, /else if \(!isArticleSourcePage\(\)\) \{\s*menu\.append\(actionRow\(isInReadingList \? "从待读移除" : "加入待读"/su);
  assert.match(content, /actionRow\(isInLibrary \? "从素材库移除" : "保存为素材"[\s\S]*actionRow\("预览 \/ 复制 Markdown"[\s\S]*actionRow\(isAuthorSaved \? "取消收藏作者" : "收藏作者"/u);
  assert.match(content, /window\.addEventListener\("resize", removeArticleMoreMenu/u);
  assert.match(content, /window\.addEventListener\("scroll", removeArticleMoreMenu/u);
  assert.doesNotMatch(content, /toggle-candidate-overlay|capture-current-for-sidepanel|capture-completed|toggle-import-panel|x-to-md-import-panel/u);
});

test("Side Panel 只有待读、素材库和作者三个一级页面", () => {
  const html = source("../sidepanel.html");
  const script = source("../sidepanel.js");
  const views = [...html.matchAll(/data-view="([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(views, ["readingList", "assets", "authors"]);
  assert.match(script, /data-action="asset-preview"/u);
  assert.match(script, /usageStatus/u);
  assert.match(script, /data-asset-tag-input/u);
  assert.match(script, /https:\/\/x\.com\/\$\{value\}/u);
  assert.doesNotMatch(`${html}\n${script}`, /候选集|关注作者|统计|导航设置|发布链接|publishedLinks|materialize/u);
});

test("Preview 区分当前 Article 与已保存素材", () => {
  const html = source("../preview.html");
  const script = source("../preview.js");
  assert.match(html, /id="save"[^>]*hidden/u);
  assert.match(script, /saveButton\.hidden = !value\.canSave/u);
  assert.match(script, /type: "save-article-asset"/u);
  assert.match(script, /contentType: "article"/u);
  assert.match(script, /navigator\.clipboard\.writeText\(preview\.markdown\)/u);
  assert.match(script, /打开 X 原文/u);
  assert.doesNotMatch(script, /preview-job|materialize|setInterval|tabs\.create/u);
});

test("项目文档固化 X 同源设计与禁止自动 Chrome 验收", () => {
  const design = source("../docs/development/product-design.md");
  const agents = source("../AGENTS.md");
  assert.match(design, /TwitterChirp/u);
  assert.match(design, /44px/u);
  assert.match(design, /24×24/u);
  assert.match(design, /禁止自动启动 Chrome/u);
  assert.match(design, /Chrome DevTools/u);
  assert.match(agents, /docs\/development\/product-design\.md/u);
});
