import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const text = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const bytes = (path) => readFileSync(new URL(path, import.meta.url));
const OFFICIAL_X_PATH = "M21.742 21.75l-7.563-11.179 7.056-8.321h-2.456l-5.691 6.714-4.54-6.714H2.359l7.29 10.776L2.25 21.75h2.456l6.035-7.118 4.818 7.118h6.191-.008zM7.739 3.818L18.81 20.182h-2.447L5.29 3.818h2.447z";

test("品牌矢量使用用户提供的官方 X path 和 X light tokens", () => {
  const appIcon = text("../assets/icons/x-to-md-icon-source.svg");
  const entryIcon = text("../assets/icons/x-to-md-entry.svg");

  for (const source of [appIcon, entryIcon]) {
    assert.match(source, new RegExp(OFFICIAL_X_PATH.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.doesNotMatch(source, /gradient|filter|shadow/iu);
  }
  assert.match(appIcon, /fill="#0f1419"/u);
  assert.match(entryIcon, /viewBox="0 0 30 24"/u);
  assert.match(entryIcon, /currentColor/u);
  for (const source of [appIcon, entryIcon]) {
    assert.match(source, /M21\.35 11\.25h4\.2l3\.3 3\.3v5\.475a1\.05 1\.05 0 0 1-1\.05 1\.05h-6\.45z/u);
    assert.match(source, /M23\.35 16\.8h3\.55M23\.35 19\.1h3\.55[^>]*stroke-width="\.78"/u);
  }
});

test("Manifest 的四个图标尺寸由新品牌源生成", () => {
  const manifest = JSON.parse(text("../manifest.json"));
  for (const size of [16, 32, 48, 128]) {
    const path = `assets/icons/x-to-md-icon-${size}.png`;
    assert.equal(manifest.icons[String(size)], path);
    assert.equal(manifest.action.default_icon[String(size)], path);
    const png = bytes(`../${path}`);
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test("产品内入口和动作菜单共享选中方案的图标契约", () => {
  const content = text("../content.js");
  const panelHtml = text("../sidepanel.html");
  const panelScript = text("../sidepanel.js");
  const panelCss = text("../sidepanel.css");
  const previewHtml = text("../preview.html");
  const iconSpec = text("../docs/design/icon-system.md");
  const iconLibrary = text("../assets/icons/x-to-md-ui-icons.svg");
  const iconBoard = text("../docs/design/x-to-md-ui-icon-spec.svg");

  assert.match(content, new RegExp(OFFICIAL_X_PATH.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(panelHtml, /assets\/icons\/x-to-md-entry\.svg/u);
  assert.equal((panelHtml.match(/class="nav-icon-outline"/gu) || []).length, 3);
  assert.equal((panelHtml.match(/class="nav-icon-filled"/gu) || []).length, 3);
  assert.match(panelScript, /打开原文[\s\S]*编辑标签[\s\S]*标记为未使用[\s\S]*删除素材/u);
  assert.match(panelScript, /previewMarkdownIcon\(\)[\s\S]*预览 Markdown/u);
  assert.match(panelScript, /readingRemoveIcon\(\)/u);
  assert.match(content, /readingTrayIcon\(isInReadingList\)/u);
  assert.match(content, /libraryBookmarkIcon\(isInLibrary\)/u);
  assert.match(panelCss, /\.tab\.is-active \{ background: transparent; color: var\(--x-blue\); \}/u);
  assert.match(panelCss, /\.tab\.is-active \.nav-icon-filled \{ display: block; \}/u);
  assert.match(panelCss, /\.asset-menu-item-icon[^{]*\{[^}]*width: 24px;[^}]*height: 24px;[^}]*margin-right: 12px;/u);
  assert.match(panelCss, /\.asset-menu \.is-destructive[^}]*color: var\(--x-error\)/u);
  assert.match(previewHtml, /id="save"[\s\S]*M5 3\.5A2\.5 2\.5[\s\S]*M19 6v5M16\.5 8\.5h5/u);
  const requiredSymbols = [
    "nav-reading-outline", "nav-reading-filled", "nav-library-outline", "nav-library-filled",
    "nav-authors-outline", "nav-authors-filled", "reading-add", "reading-remove", "library-add",
    "library-remove", "article-preview", "markdown-copy", "author-add", "author-remove",
    "open-original", "edit-tags", "mark-used", "mark-unused", "delete", "search", "more",
    "add", "close", "copy",
  ];
  const symbolIds = [...iconLibrary.matchAll(/<symbol id="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(new Set(symbolIds).size, symbolIds.length);
  assert.deepEqual(symbolIds, requiredSymbols);
  for (const id of requiredSymbols) assert.match(iconBoard, new RegExp(`#${id}\\b`, "u"));
  assert.match(content, /M5 2\.5h9l4 4V11[\s\S]*width="8\.5" height="9\.5"/u);
  assert.match(content, /M7\.5 14s1\.7-3 4\.5-3[\s\S]*circle cx="12" cy="14" r="1\.25"/u);
  assert.match(panelScript, /M7\.5 14s1\.7-3 4\.5-3[\s\S]*circle cx="12" cy="14" r="1\.25"/u);
  assert.match(iconSpec, /项目内图标选择、实现和验收的单一权威规范/u);
  assert.match(iconSpec, /禁止临时内联自创 path、emoji 或 Unicode 图标/u);
  assert.match(iconSpec, /Active：`#1d9bf0` 填充图标，不显示持续边框或焦点环/u);
});

test("最终图标规范图由矢量规范和图标库共同交付", () => {
  const board = text("../docs/design/x-to-md-ui-icon-spec.svg");
  const png = bytes("../docs/design/x-to-md-ui-icon-spec.png");
  assert.match(board, new RegExp(OFFICIAL_X_PATH.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(board, /Final · 24×24 semantic icon source · X light/u);
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  assert.equal(png.readUInt32BE(16), 1440);
  assert.equal(png.readUInt32BE(20), 1020);
});
