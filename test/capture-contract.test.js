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

function backgroundContext() {
  const source = readFileSync(new URL("../background.js", import.meta.url), "utf8");
  const event = { addListener() {} };
  const context = {
    URL,
    chrome: {
      runtime: { onInstalled: event, onStartup: event, onMessage: event },
      action: { onClicked: event },
      tabs: { query: async () => [] },
    },
    console: { error() {} },
  };
  runInNewContext(source, context);
  return context;
}

function inboxStore() {
  return backgroundContext().XToMdInboxStore;
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
  assert.match(source, /CODE_NODE_SELECTOR/u);
  assert.match(source, /seenCodeContainers/u);
  assert.match(source, /codeLanguageOf/u);
  assert.match(source, /articleMarker/u);
  assert.match(source, /lines\[articleMarker \+ 1\]/u);
  assert.doesNotMatch(source, /\[class\*="monospace"\].*type: "code"/su);
});

test("Manifest 保持独立运行所需的最小权限", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.name, "x-to-md");
  assert.equal(manifest.version, "2.3.0");
  assert.deepEqual(manifest.permissions, ["activeTab", "storage", "sidePanel", "scripting"]);
  assert.deepEqual(manifest.side_panel, { default_path: "sidepanel.html" });
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.web_accessible_resources, undefined);
  const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");
  assert.doesNotMatch(background, /importScripts/u);
  assert.match(background, /registerInboxStore/u);
  assert.match(background, /type === "save-capture-to-library"/u);
  assert.match(background, /type === "open-side-panel"/u);
  assert.doesNotMatch(background, /isExtractableXContent/u);
  assert.match(background, /function isSupportedXTab\(tab\)/u);
  assert.match(background, /if \(!isSupportedXTab\(tab\)\) return false;/u);
  assert.match(background, /then\(\(isReady\) => isReady && chrome\.tabs\.sendMessage/u);
  assert.match(background, /toggle-candidate-overlay/u);
  assert.match(background, /chrome\.sidePanel\.open/u);
  assert.match(background, /chrome\.sidePanel\.open\(\{ windowId: tab\.windowId \}\)\.catch/u);
  assert.match(background, /chrome\.sidePanel\.open\([\s\S]+?ensureContentScript\(tab\)\.catch/u);
  assert.match(background, /ensureContentScript/u);
  assert.match(background, /chrome\.scripting\.executeScript/u);
  assert.match(background, /ready\?\.ok && ready\.revision === CONTENT_SCRIPT_REVISION/u);
  assert.match(background, /CONTENT_SCRIPT_REVISION = "article-more-menu-v11"/u);
  assert.match(background, /Content script revision mismatch/u);
  assert.match(background, /Service worker initialization failed/u);
  assert.match(background, /reportContentScriptError/u);
  assert.match(background, /files: \["markdown\.js", "content\.js"\]/u);
  assert.match(background, /injectOpenXTabs/u);
  assert.match(background, /chrome\.runtime\.onInstalled/u);
  assert.match(background, /chrome\.runtime\.onStartup/u);
});

test("后台只向 X/Twitter 页面注入内容脚本", () => {
  const runtime = backgroundContext();

  assert.equal(runtime.isSupportedXTab({ url: "https://x.com/home" }), true);
  assert.equal(runtime.isSupportedXTab({ url: "https://www.twitter.com/example/status/1" }), true);
  assert.equal(runtime.isSupportedXTab({ url: "chrome://extensions/" }), false);
  assert.equal(runtime.isSupportedXTab({ url: "https://example.com/" }), false);
});

test("素材只在明确保存后进入素材库并按来源去重", () => {
  const store = inboxStore();
  const capture = { sourceUrl: "https://x.com/example/status/42?foo=bar", title: "Source title", authorHandle: "@example", authorName: "Capture author", coverImageUrl: "https://pbs.twimg.com/media/capture.jpg", publishedAt: "2026-08-01T00:00:00.000Z", previewExcerpt: "Capture excerpt", content: "# Source title" };
  const inbox = { candidates: [{ id: "article_42", sourceUrl: "https://x.com/example/status/42", status: "extracted", authorName: "Candidate author", authorAvatarUrl: "https://pbs.twimg.com/profile_images/avatar.jpg", authorVerified: true, coverImageUrl: "https://pbs.twimg.com/media/candidate.jpg", publishedAt: "2026-08-02T00:00:00.000Z", previewExcerpt: "Candidate excerpt" }], assets: [] };

  const saved = store.saveCapture(inbox, capture, { id: "asset_42", now: "2026-08-11T12:00:00.000Z" });
  assert.equal(inbox.assets.length, 0);
  assert.equal(saved.existing, false);
  assert.equal(saved.inbox.assets.length, 1);
  assert.equal(saved.inbox.assets[0].candidateId, "article_42");
  assert.equal(saved.inbox.assets[0].usageStatus, "unused");
  assert.equal(saved.inbox.assets[0].authorName, "Candidate author");
  assert.equal(saved.inbox.assets[0].coverImageUrl, "https://pbs.twimg.com/media/candidate.jpg");
  assert.equal(saved.inbox.assets[0].publishedAt, "2026-08-02T00:00:00.000Z");
  assert.equal(saved.inbox.assets[0].previewExcerpt, "Candidate excerpt");
  assert.equal(saved.inbox.candidates[0].status, "saved");

  const repeated = store.saveCapture(saved.inbox, capture, { id: "asset_duplicate", now: "2026-08-11T12:01:00.000Z" });
  assert.equal(repeated.existing, true);
  assert.equal(repeated.inbox.assets.length, 1);
});

test("直接保存的 Article 使用用户主动提取的展示元数据", () => {
  const store = inboxStore();
  const capture = { sourceUrl: "https://x.com/example/article/84", title: "Direct title", authorHandle: "@example", authorName: "Direct author", authorAvatarUrl: "https://pbs.twimg.com/profile_images/direct.jpg", authorVerified: true, coverImageUrl: "https://pbs.twimg.com/media/direct.jpg", publishedAt: "2026-08-03T00:00:00.000Z", previewExcerpt: "Direct excerpt", content: "# Direct title" };
  const saved = store.saveCapture({ candidates: [], assets: [] }, capture, { id: "asset_84", now: "2026-08-11T12:00:00.000Z" });

  const asset = saved.inbox.assets[0];
  assert.equal(asset.candidateId, null);
  assert.equal(asset.authorName, "Direct author");
  assert.equal(asset.authorAvatarUrl, "https://pbs.twimg.com/profile_images/direct.jpg");
  assert.equal(asset.authorVerified, true);
  assert.equal(asset.coverImageUrl, "https://pbs.twimg.com/media/direct.jpg");
  assert.equal(asset.publishedAt, "2026-08-03T00:00:00.000Z");
  assert.equal(asset.previewExcerpt, "Direct excerpt");
  assert.equal(asset.markdown, "# Direct title");
});

test("收件箱来源 URL 以内容页为准并剥离 media 子路由", () => {
  const store = inboxStore();

  assert.equal(
    store.normalizedSourceUrl("https://x.com/AnatoliKopadze/status/2049492553133629950?ref=share"),
    "https://x.com/AnatoliKopadze/status/2049492553133629950",
  );
  assert.equal(
    store.normalizedSourceUrl("https://x.com/KKaWSB/article/2087333705853649186/media/2087333606771601408"),
    "https://x.com/KKaWSB/article/2087333705853649186",
  );
});

test("Content Inbox 提供上下文感知收件箱、关注作者和素材库 Side Panel", () => {
  const html = readFileSync(new URL("../sidepanel.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../sidepanel.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../sidepanel.css", import.meta.url), "utf8");
  const content = readFileSync(new URL("../content.js", import.meta.url), "utf8");

  assert.match(html, /收件箱/u);
  assert.match(html, /关注作者/u);
  assert.match(html, /素材库/u);
  assert.match(html, /current-context/u);
  assert.match(script, /pageHeader\.hidden = \["candidates", "subscriptions", "assets"\]\.includes\(state\.page\)/u);
  assert.match(css, /\.page-header\[hidden\] \{ display: none; \}/u);
  assert.doesNotMatch(script, /discover-articles/u);
  assert.match(script, /Receiving end does not exist/u);
  assert.match(script, /tabs\.reload\(tab\.id\)/u);
  assert.match(script, /无法连接当前 X 页面/u);
  assert.match(script, /chrome\.storage\.local/u);
  assert.match(script, /chrome\.storage\.onChanged/u);
  assert.match(script, /loadData\(\)\.then\(\(\) => render\(\)\)/u);
  assert.match(script, /candidateSort: "addedAt"/u);
  assert.match(script, /data-candidate-sort="addedAt"/u);
  assert.match(script, /data-candidate-sort="publishedAt"/u);
  assert.match(script, /sortedCandidates/u);
  assert.match(content, /const addedAt = new Date\(\)\.toISOString\(\)/u);
  assert.match(script, /新发现/u);
  assert.match(script, /已保存素材/u);
  assert.match(script, /coverImageUrl/u);
  assert.match(script, /authorAvatarUrl/u);
  assert.match(script, /previewExcerpt/u);
  assert.match(script, /engagementSnapshot/u);
  assert.match(script, /authorVerified/u);
  assert.match(script, /class="author-cell"/u);
  assert.match(script, /class="author-profile-link"/u);
  assert.match(script, /https:\/\/x\.com\/\$\{String\(subscription\.handle/u);
  assert.match(script, /target="_blank" rel="noreferrer" aria-label="Open/u);
  assert.match(script, /class="follow-button is-following"/u);
  assert.match(script, />Following</u);
  assert.match(script, />unfollow</u);
  assert.match(script, /subscription-unfollow/u);
  assert.doesNotMatch(script, /subscription-(?:open|toggle|edit|delete)/u);
  assert.doesNotMatch(script, /addSubscription|renderSubscriptionDetail|fetchArticles/u);
  assert.doesNotMatch(content, /discover-articles/u);
  assert.match(content, /authorPresentationFromElement/u);
  assert.match(content, /normalizedIdentity/u);
  assert.match(content, /const identityLines = \[\.\.\.root\.querySelectorAll/u);
  assert.match(content, /lines\.some\(\(text\) => normalizedHandleText\(text\) === normalizedHandleText\(handle\)\)/u);
  assert.match(content, /descriptionCandidates/u);
  assert.match(content, /!node\.closest\('a\[href\]'\)/u);
  assert.match(content, /!node\.querySelector\('div\[dir="auto"\]'\)/u);
  assert.match(content, /description: author\.description/u);
  assert.match(content, /authorVerified: author\.authorVerified/u);
  assert.match(content, /existingSubscription/u);
  assert.match(script, /class="verified-badge article-verified"/u);
  assert.match(script, /aria-label="Verified account"/u);
  assert.match(css, /\.verified-badge svg \{[^}]*fill: rgb\(29, 155, 240\)/u);
  assert.doesNotMatch(script, /tokenStyle/u);
  assert.match(script, /xIcon/u);
  assert.doesNotMatch(script, /style="\$\{tokenStyle/u);
  assert.match(content, /article-cover-image/u);
  assert.match(content, /id: articleCandidateId\(sourceUrl\)/u);
  assert.match(content, /currentPageContext/u);
  assert.match(content, /pageKind: "article"/u);
  assert.match(content, /pageKind: "author-articles"/u);
  assert.match(content, /get-current-context/u);
  assert.match(content, /initializeXToMdContentScript/u);
  assert.match(content, /new CustomEvent\("x-to-md:dispose-content-script"\)/u);
  assert.match(content, /globalThis\.__xToMdContentScript\?\.dispose\?\.\(\)/u);
  assert.match(content, /extension context may already be invalidated during reload/u);
  assert.match(content, /diagnostics: articleMenuDiagnostics/u);
  assert.match(content, /contentScriptAbortController\.abort\(\)/u);
  assert.match(content, /chrome\.runtime\.onMessage\.removeListener/u);
  assert.match(content, /isWithinAnchorOrToolbar\(event\.relatedTarget, bookmarkCandidateState\?\.bookmarkButton/u);
  assert.match(content, /isWithinAnchorOrToolbar\(event\.relatedTarget, followSubscriptionState\?\.followButton/u);
  assert.match(content, /x-to-md-article-menu-group/u);
  assert.match(content, /articleMoreButtonFromTarget/u);
  assert.match(content, /articleMoreTriggerState/u);
  assert.match(content, /const nativeFollowButton = \[\.\.\.document\.querySelectorAll\("button"\)\]/u);
  assert.match(content, /authorFromFollowButton\(nativeFollowButton, handle\)/u);
  assert.match(content, /nativeAuthor \|\| authorPresentationFromElement/u);
  assert.match(content, /articleCandidateFromListRoot\(root\)/u);
  assert.match(content, /addEventListener\("pointerdown", handleArticleMoreMenuTrigger/u);
  assert.match(content, /scheduleArticleMoreMenu/u);
  assert.match(content, /requestAnimationFrame\(injectWhenReady\)/u);
  assert.match(content, /\[data-testid="Dropdown"\]/u);
  assert.match(content, /setTimeout\(injectWhenReady, 50\)/u);
  assert.match(content, /\(\?:Follow\|Unfollow\)/u);
  assert.match(content, /revision: CONTENT_SCRIPT_REVISION/u);
  assert.match(content, /CONTENT_SCRIPT_REVISION = "article-more-menu-v11"/u);
  assert.match(content, /reconcileArticleMoreMenu/u);
  assert.match(content, /articleMoreMenuObserver\.observe\(menu, \{ childList: true \}\)/u);
  assert.match(content, /button\[data-testid="caret"\]\[aria-haspopup="menu"\]/u);
  assert.match(content, /Opening the native menu must not depend on optional candidate metadata/u);
  assert.doesNotMatch(content, /#layers|articleMenuMountObserver|observeArticleMenuMounts/u);
  assert.match(content, /dropdown-timeout/u);
  assert.match(content, /missing-menu-context/u);
  assert.match(content, /group-inserted/u);
  assert.match(content, /group-removed-by-page/u);
  assert.match(content, /console\.error\("\[x-to-md\] Could not inject Article menu\.", error\)/u);
  assert.match(content, /labelSlot\.textContent = label/u);
  assert.doesNotMatch(content, /escapeHtml/u);
  assert.match(content, /Embed Article\|Report Article/u);
  assert.match(content, /关注作者/u);
  assert.match(content, /Extract and copy/u);
  assert.match(content, /添加至收件箱/u);
  assert.match(content, /template\.cloneNode\(true\)/u);
  assert.doesNotMatch(content, /color: rgb\(29, 155, 240\)/u);
  assert.doesNotMatch(content, /currentPageContext[\s\S]{0,500}content:/u);
  assert.doesNotMatch(content, /articlePresentationTokens/u);
  assert.match(script, /article-engagement/u);
  assert.match(script, /data-action="candidate-remove"/u);
  assert.match(script, /从收件箱移除/u);
  assert.match(script, /article-overflow-slot/u);
  assert.doesNotMatch(script, /candidate-(?:ignore|save)/u);
  assert.doesNotMatch(script, /忽略候选|候选已忽略/u);
  assert.doesNotMatch(script, /在 X 中原样预览/u);
  assert.doesNotMatch(script, /open-native-article-preview/u);
  assert.doesNotMatch(script, /previewCandidateOnX/u);
  assert.doesNotMatch(readFileSync(new URL("../background.js", import.meta.url), "utf8"), /open-native-preview/u);
  assert.match(script, /candidateQuery: ""/u);
  assert.match(script, /candidateDate: "today"/u);
  assert.match(script, /搜索收件箱/u);
  assert.match(script, /\["today", "yesterday", "thisWeek", "lastWeek", "thisMonth"\]/u);
  assert.match(script, /data-candidate-date="\$\{date\}"/u);
  assert.match(script, /timestamp\(candidate\.addedAt\)/u);
  assert.doesNotMatch(script, /data-candidate-date-input|type="month"/u);
  assert.match(script, /candidate-date-count/u);
  assert.match(script, /candidateCountForDate/u);
  assert.match(script, /aria-label="\$\{label\} \$\{count\} 篇"/u);
  assert.doesNotMatch(script, /收件箱总数/u);
  assert.match(script, /candidate-chart/u);
  assert.match(script, /chart-line/u);
  assert.match(script, /candidateMatchesQuery/u);
  assert.match(script, /当前筛选条件下没有匹配的 Article/u);
  assert.match(script, /candidate-menu asset-menu/u);
  assert.match(script, /candidateId\(candidate\)/u);
  assert.match(script, /data-source-url/u);
  assert.match(script, /articleId\(item\.sourceUrl\) === sourceUrl/u);
  assert.match(script, /candidate\.status !== "ignored" && candidate\.status !== "saved"/u);
  assert.match(script, /请先打开此候选的 X 原文/u);
  assert.match(script, /复制 Markdown/u);
  assert.match(script, /保存并复制 Markdown/u);
  assert.match(script, /save-capture-to-library/u);
  assert.match(script, /asset\.authorName/u);
  assert.match(script, /asset-cover-placeholder/u);
  assert.match(script, /asset\.previewExcerpt/u);
  assert.match(script, /asset\.note/u);
  assert.match(readFileSync(new URL("../sidepanel.css", import.meta.url), "utf8"), /object-fit: contain/u);
  assert.doesNotMatch(script, /state\.data\.assets\.unshift/u);
  assert.match(script, /context-save/u);
  assert.doesNotMatch(script, /context-scan/u);
  assert.match(script, /refreshContext/u);
  assert.match(script, /get-current-context/u);
  assert.doesNotMatch(script, /保存当前提取/u);
  assert.match(script, /删除素材/u);
  assert.match(css, /53px/u);
  assert.match(css, /--twitter-color-text-primary: rgb\(15, 20, 25\)/u);
  assert.match(css, /--twitter-color-text-secondary: rgb\(83, 100, 113\)/u);
  assert.match(css, /--twitter-color-brand: rgb\(29, 155, 240\)/u);
  assert.match(css, /--twitter-color-destructive: rgb\(244, 33, 46\)/u);
  assert.match(css, /--twitter-avatar-size: 40px/u);
  assert.match(css, /grid-template-columns: 40px minmax\(0, 1fr\)/u);
  assert.match(css, /gap: 12px; width: 100%; max-width: 600px/u);
  assert.match(css, /aspect-ratio: 2\.55/u);
  assert.match(css, /\.article-card strong \{[^}]*font-size: 15px;[^}]*line-height: 20px/u);
  assert.match(css, /\.article-card-excerpt \{[^}]*font-size: 15px;[^}]*line-height: 20px/u);
  assert.match(css, /width: 18\.75px; height: 18\.75px/u);
  assert.match(css, /\.article-inbox-remove:hover, \.article-inbox-remove:focus-visible/u);
  assert.match(css, /\.follow-button:hover/u);
  assert.match(css, /\.author-profile-link/u);
  assert.doesNotMatch(script, /presentation\?\.tokens/u);
  assert.doesNotMatch(script, /--article-icon-size/u);
  assert.match(css, /\.candidate-menu/u);
  assert.match(css, /\.candidate-sort/u);
  assert.match(css, /\.status \{ position: fixed; bottom: 16px; left: 50%/u);
  assert.match(css, /\.status:not\(:empty\) \{ padding: 16px 24px; color: #fff; background: var\(--x-blue\)/u);
  assert.match(css, /border-bottom: 1px solid var\(--x-border\)/u);
});

test("Popup 与预览页保留清晰的成功、边界和来源反馈", () => {
  const popup = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
  const popupScript = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
  const preview = readFileSync(new URL("../preview.html", import.meta.url), "utf8");
  const previewScript = readFileSync(new URL("../preview.js", import.meta.url), "utf8");

  assert.match(popup, /Copy the current X content as Markdown\. Nothing is uploaded\./u);
  assert.match(popup, /Extract and copy/u);
  assert.match(popup, /Nothing is uploaded/u);
  assert.match(popup, /class="description"/u);
  assert.match(popup, /class="popup-card"/u);
  assert.match(popup, /--x-color-primary/u);
  assert.match(popup, /--x-radius-panel/u);
  assert.match(popup, /--x-radius-pill/u);
  assert.match(popup, /#status:empty/u);
  assert.match(popupScript, /capture\?\.error/u);
  assert.match(popupScript, /window\.close\(\)/u);
  assert.match(popupScript, /Markdown copied\./u);
  assert.match(preview, /Extracted · Markdown copied/u);
  assert.match(preview, /class="preview-heading"/u);
  assert.match(previewScript, /View original/u);
  assert.match(previewScript, /Images are excluded from Markdown/u);
  assert.match(previewScript, /This preview has expired/u);
  assert.match(previewScript, /data-code-copy/u);
  assert.match(previewScript, /Code copied/u);
  assert.doesNotMatch(popupScript, /open-native-preview/u);
  const contentScript = readFileSync(new URL("../content.js", import.meta.url), "utf8");
  assert.match(contentScript, /Copy the current X content as Markdown\. Nothing is uploaded\./u);
  assert.doesNotMatch(contentScript, /root\.querySelectorAll\('button, \[role="button"\]\)/u);
  assert.doesNotMatch(contentScript, /message\?\.type !== "open-native-preview"/u);
  assert.match(contentScript, /toggle-import-panel/u);
  assert.match(contentScript, /data-extract-current/u);
  assert.match(contentScript, /data-open-article/u);
  assert.match(contentScript, /function openArticleForExtraction\(candidate\)/u);
  assert.match(contentScript, /location\.assign\(sourceUrl\)/u);
  assert.match(contentScript, /isArticleSourcePage\(\) \? "Extract and copy" : "打开原文后提取"/u);
  assert.match(contentScript, /isArticleSourcePage\(\)\n    \? '<button/u);
  assert.match(contentScript, /Save to library/u);
  assert.match(contentScript, /open-side-panel/u);
  assert.match(contentScript, /save-capture-to-library/u);
  assert.match(contentScript, /toggle-candidate-overlay/u);
  assert.match(contentScript, /x-to-md-ready/u);
  assert.match(contentScript, /toggleCandidateOverlay/u);
  assert.match(contentScript, /restoreCandidateOverlay/u);
  assert.match(contentScript, /articleCandidateFromListRoot\(root\)/u);
  assert.match(contentScript, /x-to-md-candidate-overlay/u);
  assert.match(contentScript, /x-to-md-import-panel/u);
  assert.match(contentScript, /x-to-md-bookmark-candidate-toolbar/u);
  assert.match(contentScript, /x-to-md-follow-subscription-toolbar/u);
  assert.match(contentScript, />Follow<\/button>/u);
  assert.match(contentScript, /添加至收件箱/u);
  assert.match(contentScript, /从收件箱移除/u);
  assert.match(contentScript, /articleCandidateFromPage/u);
  assert.match(contentScript, /articleCandidateFromListRoot/u);
  assert.match(contentScript, /articleCardRootFromTarget/u);
  assert.match(contentScript, /article-cover-image/u);
  assert.match(contentScript, /\(\?:status\|\(\?:i\\\/\)\?article\)/u);
  assert.match(contentScript, /isArticleSourcePage/u);
  assert.match(contentScript, /articleCandidateFromPage\(\)/u);
  assert.match(contentScript, /articleCandidateFromBookmarkButton/u);
  assert.match(contentScript, /if \(isArticleSourcePage\(\)\) return articleCandidateFromPage\(\);/u);
  assert.match(contentScript, /canonicalArticleSourceUrl/u);
  assert.match(contentScript, /function articleCandidateRootFromPage\(\)/u);
  assert.match(contentScript, /article\[data-testid="tweet"\]/u);
  assert.match(contentScript, /function articleCandidateAuthorFromPage\(root\)/u);
  assert.match(contentScript, /authorAvatarUrl: pageAuthor\.authorAvatarUrl \|\| author\?\.authorAvatarUrl \|\| ""/u);
  assert.match(contentScript, /const candidate = isArticleSourcePage\(\) \? articleCandidateFromPage\(\) : null;/u);
  assert.match(contentScript, /coverImageUrl: candidate\?\.coverImageUrl \|\| ""/u);
  assert.match(contentScript, /previewExcerpt: candidate\?\.previewExcerpt \|\| ""/u);
  assert.match(contentScript, /button\[data-testid="bookmark"\]/u);
  assert.match(contentScript, /button\[data-testid="removeBookmark"\]/u);
  assert.match(contentScript, /cover\?\.querySelector\("img"\)/u);
  assert.match(contentScript, /isArticlesIndexPage/u);
  assert.match(contentScript, /bookmarkButton\.getBoundingClientRect/u);
  assert.match(contentScript, /rect\.left - toolbarRect\.width - gap/u);
  assert.match(contentScript, /rect\.right \+ gap/u);
  assert.match(contentScript, /Untitled Article/u);
  assert.match(contentScript, /data-toggle-inbox-candidate/u);
  assert.match(contentScript, /isActiveInboxCandidate/u);
  assert.match(contentScript, /matchesInboxCandidate/u);
  assert.match(contentScript, /addInboxCandidate/u);
  assert.match(contentScript, /removeInboxCandidate/u);
  assert.match(contentScript, /articlePreviewMetadata/u);
  assert.match(contentScript, /previewExcerpt/u);
  assert.match(contentScript, /engagementSnapshot/u);
  assert.match(contentScript, /authorVerified/u);
  assert.match(contentScript, /previewCapturedAt/u);
  assert.match(contentScript, /utilityIconSnapshot/u);
  assert.match(contentScript, /\["ignored", "saved"\]\.includes/u);
  assert.match(contentScript, /status: "new", addedAt/u);
  assert.match(contentScript, /candidate\.status = "ignored"/u);
  assert.match(contentScript, /aria-pressed="\$\{isInInbox\}"/u);
  assert.match(contentScript, /button\.is-in-inbox:hover/u);
  assert.match(contentScript, /M4 4\.5C4 3\.12 5\.119 2 6\.5 2h11/u);
  assert.doesNotMatch(contentScript, /data-add-selection-subscription/u);
  assert.match(contentScript, /data-toggle-follow-subscription/u);
  assert.match(contentScript, /background: #1D9BF0 !important/u);
  assert.match(contentScript, /color: #FFFFFF !important/u);
  assert.match(contentScript, /data-testid="HoverCard"/u);
  assert.match(contentScript, /positionBookmarkCandidateToolbar/u);
  assert.match(contentScript, /width: 18\.75px !important/u);
  assert.doesNotMatch(contentScript, /selectionchange/u);
  assert.doesNotMatch(contentScript, /observe\(document\.(?:body|documentElement)/u);
  assert.match(contentScript, /articleMoreMenuObserver\.observe\(menu, \{ childList: true \}\)/u);
  assert.match(contentScript, /profileHandleFromHref/u);
  assert.match(contentScript, /normalizedHandleText/u);
  assert.match(contentScript, /\\u200B-\\u200F\\u2060\\uFEFF/u);
  assert.match(contentScript, /bookmarkCandidateState/u);
  assert.match(contentScript, /scheduleRemoveBookmarkCandidateToolbar/u);
  assert.match(contentScript, /closest\('a\[href\]'\)/u);
  assert.match(contentScript, /articleLinks\.length === 1 && coverCount <= 1/u);
  assert.match(contentScript, /root\.querySelectorAll\?\.\('\[data-testid="article-cover-image"\]'\)/u);
  assert.match(contentScript, /followButtonFromTarget/u);
  assert.match(contentScript, /authorFromFollowButton/u);
  assert.match(contentScript, /positionFollowSubscriptionToolbar/u);
  assert.match(contentScript, /Follow\|Following\|Unfollow/u);
  assert.match(contentScript, /button\.matches\('\[data-testid\$="-follow"\]'/u);
  assert.match(contentScript, /button\.matches\('\[data-testid\$="-unfollow"\]'/u);
  assert.match(contentScript, /removeAuthorSubscription/u);
  assert.match(contentScript, /data-toggle-follow-subscription/u);
  assert.match(contentScript, />Following</u);
  assert.match(contentScript, />unfollow</u);
  assert.match(contentScript, /rgb\(244, 33, 46\)/u);
  assert.match(contentScript, /location\.pathname/u);
  assert.match(contentScript, /CONTENT_INBOX_STORAGE_KEY/u);
  assert.doesNotMatch(contentScript, /document\.addEventListener\("mouseup"/u);
  assert.doesNotMatch(contentScript, /document\.addEventListener\("pointerup"/u);
  assert.match(contentScript, /document\.addEventListener\("pointerover"/u);
  assert.match(contentScript, /document\.addEventListener\("focusin"/u);
  assert.doesNotMatch(contentScript, /authorLink\.closest\('\[data-testid="User-Name"\]'\)/u);
  assert.match(contentScript, /--twitter-color-background/u);
  assert.match(contentScript, /width: 300px !important; padding: 20px !important/u);
  assert.match(contentScript, /height: 46px !important; min-height: 46px !important/u);
  assert.match(contentScript, /align-items: center !important; justify-content: center !important/u);
  assert.match(contentScript, /text-align: center !important; white-space: nowrap !important/u);
  assert.match(popup, /align-items: center; justify-content: center/u);
  assert.doesNotMatch(contentScript, /已复制 Markdown，并进入 X 原生预览/u);
});
