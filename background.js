(function registerInboxStore() {
  const SCHEMA_VERSION = 1;

  function normalizedSourceUrl(value) {
    const fallback = String(value || "").split(/[?#]/u)[0].replace(/\/$/u, "");
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^(\/(?:[^/]+\/status|[^/]+\/article|i\/article)\/\d+)/u);
      return match ? `${url.origin}${match[1]}` : fallback;
    } catch {
      return fallback;
    }
  }

  function emptyInbox() {
    return { schemaVersion: SCHEMA_VERSION, readingList: [], authors: [], assets: [] };
  }

  function currentInbox(value) {
    if (value?.schemaVersion !== SCHEMA_VERSION) return emptyInbox();
    return {
      schemaVersion: SCHEMA_VERSION,
      readingList: Array.isArray(value.readingList) ? value.readingList.map((item) => ({ ...item })) : [],
      authors: Array.isArray(value.authors) ? value.authors.map((item) => ({ ...item })) : [],
      assets: Array.isArray(value.assets) ? value.assets.map((item) => ({ ...item })) : [],
    };
  }

  function articleReference(value, { requireMarkdown = false } = {}) {
    const sourceUrl = normalizedSourceUrl(value?.sourceUrl);
    let isSupportedSource = false;
    try {
      const url = new URL(sourceUrl);
      isSupportedSource = ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)
        && /^\/(?:[^/]+\/(?:status|article)|i\/article)\/\d+$/u.test(url.pathname);
    } catch {
      isSupportedSource = false;
    }
    if (!isSupportedSource || value?.contentType !== "article") throw new Error("只能保存有效的 X Article。");
    if (requireMarkdown && !String(value?.content || value?.markdown || "").trim()) throw new Error("没有采集到可用的 Markdown。");
    return { ...value, sourceUrl };
  }

  function authorVerificationType(value) {
    return value === "blue" || value === "gold" ? value : "";
  }

  function saveReadingArticle(inboxValue, reference, { id, now } = {}) {
    const inbox = currentInbox(inboxValue);
    const article = articleReference(reference);
    const existing = inbox.readingList.find((item) => normalizedSourceUrl(item.sourceUrl) === article.sourceUrl);
    const next = {
      id: existing?.id || id,
      contentType: "article",
      sourceUrl: article.sourceUrl,
      title: article.title || "Untitled Article",
      authorHandle: article.authorHandle || "",
      authorName: article.authorName || "",
      authorAvatarUrl: article.authorAvatarUrl || "",
      authorVerificationType: authorVerificationType(article.authorVerificationType),
      coverImageUrl: article.coverImageUrl || "",
      publishedAt: article.publishedAt || null,
      previewExcerpt: article.previewExcerpt || "",
      engagementSnapshot: article.engagementSnapshot || {},
      utilityIconSnapshot: article.utilityIconSnapshot || "",
      addedAt: existing?.addedAt || now,
    };
    inbox.readingList = [next, ...inbox.readingList.filter((item) => normalizedSourceUrl(item.sourceUrl) !== article.sourceUrl)];
    return { inbox, item: next, existing: Boolean(existing) };
  }

  function removeReadingArticle(inboxValue, sourceUrl) {
    const inbox = currentInbox(inboxValue);
    const normalizedUrl = normalizedSourceUrl(sourceUrl);
    const length = inbox.readingList.length;
    inbox.readingList = inbox.readingList.filter((item) => normalizedSourceUrl(item.sourceUrl) !== normalizedUrl);
    return { inbox, removed: inbox.readingList.length !== length };
  }

  function saveArticleAsset(inboxValue, captureValue, { id, now } = {}) {
    const inbox = currentInbox(inboxValue);
    const capture = articleReference(captureValue, { requireMarkdown: true });
    const existing = inbox.assets.find((item) => normalizedSourceUrl(item.sourceUrl) === capture.sourceUrl);
    const asset = {
      id: existing?.id || id,
      contentType: "article",
      sourceUrl: capture.sourceUrl,
      title: capture.title || "Untitled Article",
      authorHandle: capture.authorHandle || "",
      authorName: capture.authorName || "",
      authorAvatarUrl: capture.authorAvatarUrl || "",
      authorVerificationType: authorVerificationType(capture.authorVerificationType),
      coverImageUrl: capture.coverImageUrl || "",
      publishedAt: capture.publishedAt || null,
      previewExcerpt: capture.previewExcerpt || "",
      markdown: String(capture.content || capture.markdown).trim(),
      tags: existing?.tags || [],
      usageStatus: existing?.usageStatus === "used" ? "used" : "unused",
      savedAt: now,
      updatedAt: now,
    };
    inbox.assets = [asset, ...inbox.assets.filter((item) => normalizedSourceUrl(item.sourceUrl) !== capture.sourceUrl)];
    inbox.readingList = inbox.readingList.filter((item) => normalizedSourceUrl(item.sourceUrl) !== capture.sourceUrl);
    return { inbox, asset, existing: Boolean(existing) };
  }

  function updateArticleAsset(inboxValue, assetId, patch, { now } = {}) {
    const inbox = currentInbox(inboxValue);
    const asset = inbox.assets.find((item) => item.id === assetId);
    if (!asset) throw new Error("素材不存在或已被删除。");
    if (Array.isArray(patch?.tags)) asset.tags = [...new Set(patch.tags.map((tag) => String(tag).trim()).filter(Boolean))];
    if (["used", "unused"].includes(patch?.usageStatus)) asset.usageStatus = patch.usageStatus;
    asset.updatedAt = now;
    return { inbox, asset };
  }

  function removeArticleAsset(inboxValue, sourceUrl) {
    const inbox = currentInbox(inboxValue);
    const normalizedUrl = normalizedSourceUrl(sourceUrl);
    const length = inbox.assets.length;
    inbox.assets = inbox.assets.filter((item) => normalizedSourceUrl(item.sourceUrl) !== normalizedUrl);
    return { inbox, removed: inbox.assets.length !== length };
  }

  function saveAuthor(inboxValue, author, { id, now } = {}) {
    const inbox = currentInbox(inboxValue);
    const handle = String(author?.handle || author?.authorHandle || "").replace(/^@/u, "");
    if (!/^[A-Za-z0-9_]{1,15}$/u.test(handle)) throw new Error("无法识别 Article 作者。");
    const existing = inbox.authors.find((item) => item.handle.toLowerCase() === handle.toLowerCase());
    const item = {
      id: existing?.id || id,
      handle,
      displayName: author.displayName || author.authorName || handle,
      authorAvatarUrl: author.authorAvatarUrl || "",
      authorVerificationType: authorVerificationType(author.authorVerificationType),
      description: author.description || "",
      addedAt: existing?.addedAt || now,
    };
    inbox.authors = [item, ...inbox.authors.filter((value) => value.handle.toLowerCase() !== handle.toLowerCase())];
    return { inbox, author: item, existing: Boolean(existing) };
  }

  function removeAuthor(inboxValue, handleValue) {
    const inbox = currentInbox(inboxValue);
    const handle = String(handleValue || "").replace(/^@/u, "").toLowerCase();
    const length = inbox.authors.length;
    inbox.authors = inbox.authors.filter((item) => item.handle.toLowerCase() !== handle);
    return { inbox, removed: inbox.authors.length !== length };
  }

  globalThis.XToMdInboxStore = {
    SCHEMA_VERSION,
    normalizedSourceUrl,
    emptyInbox,
    currentInbox,
    saveReadingArticle,
    removeReadingArticle,
    saveArticleAsset,
    updateArticleAsset,
    removeArticleAsset,
    saveAuthor,
    removeAuthor,
  };
}());

const CONTENT_INBOX_STORAGE_KEY = "x-to-md-content-inbox";
const CONTENT_SCRIPT_REVISION = "article-first-v3";

function isExpectedTabLifecycleError(error) {
  const message = String(error?.message || error || "").trim();
  return /^(?:Frame with ID \d+ was removed|No tab with id: \d+|No frame with id \d+ in tab \d+|The tab was closed|The frame was removed)\.?$/iu.test(message);
}

function reportContentScriptError(context, error) {
  if (!isExpectedTabLifecycleError(error)) console.error(`[x-to-md] ${context}`, error);
}

function isSupportedXTab(tab) {
  try {
    const url = new URL(tab?.url || tab?.pendingUrl || "");
    return url.protocol === "https:" && ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function ensureContentScript(tab) {
  if (!tab?.id || !isSupportedXTab(tab)) return false;
  try {
    const ready = await chrome.tabs.sendMessage(tab.id, { type: "x-to-md-ready" });
    if (ready?.ok && ready.revision === CONTENT_SCRIPT_REVISION) return true;
  } catch {
    // A missing receiver requires the current packaged content script.
  }
  const currentTab = await chrome.tabs.get(tab.id);
  if (!isSupportedXTab(currentTab)) return false;
  await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, files: ["markdown.js", "content.js"] });
  const ready = await chrome.tabs.sendMessage(currentTab.id, { type: "x-to-md-ready" });
  if (!ready?.ok || ready.revision !== CONTENT_SCRIPT_REVISION) throw new Error("Content script revision mismatch.");
  return true;
}

function previewValue(capture, { canSave = false } = {}) {
  return {
    contentType: capture?.contentType || "article",
    title: capture?.title || "",
    markdown: capture?.content || capture?.markdown || "",
    authorName: capture?.authorName || "",
    authorHandle: capture?.authorHandle || "",
    authorAvatarUrl: capture?.authorAvatarUrl || "",
    authorVerificationType: authorVerificationType(capture?.authorVerificationType),
    coverImageUrl: capture?.coverImageUrl || "",
    previewExcerpt: capture?.previewExcerpt || "",
    sourceUrl: capture?.sourceUrl || "",
    publishedAt: capture?.publishedAt || null,
    canSave,
  };
}

async function readInbox() {
  const stored = await chrome.storage.local.get(CONTENT_INBOX_STORAGE_KEY);
  return globalThis.XToMdInboxStore.currentInbox(stored[CONTENT_INBOX_STORAGE_KEY]);
}

async function writeInbox(inbox) {
  await chrome.storage.local.set({ [CONTENT_INBOX_STORAGE_KEY]: inbox });
}

async function mutateStore(method, ...args) {
  const result = globalThis.XToMdInboxStore[method](await readInbox(), ...args);
  await writeInbox(result.inbox);
  return result;
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id || !tab.windowId || !chrome.sidePanel?.open) return;
  chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => reportContentScriptError("Could not open Side Panel.", error));
  ensureContentScript(tab).catch((error) => reportContentScriptError(`Could not initialize tab ${tab.id}.`, error));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const now = () => new Date().toISOString();
  const respond = (promise, fallback) => {
    promise.then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ error: error.message || fallback }));
    return true;
  };

  if (message?.type === "save-reading-article") {
    return respond(mutateStore("saveReadingArticle", message.reference, { id: `reading_${crypto.randomUUID()}`, now: now() }), "无法加入待读。");
  }
  if (message?.type === "remove-reading-article") {
    return respond(mutateStore("removeReadingArticle", message.sourceUrl), "无法从待读移除。");
  }
  if (message?.type === "save-article-asset") {
    const operation = message.assetId
      ? mutateStore("updateArticleAsset", message.assetId, message.patch, { now: now() })
      : mutateStore("saveArticleAsset", message.capture, { id: `asset_${crypto.randomUUID()}`, now: now() });
    return respond(operation, "无法保存素材。");
  }
  if (message?.type === "remove-article-asset") {
    return respond(mutateStore("removeArticleAsset", message.sourceUrl), "无法移除素材。");
  }
  if (message?.type === "save-author") {
    return respond(mutateStore("saveAuthor", message.author, { id: `author_${crypto.randomUUID()}`, now: now() }), "无法收藏作者。");
  }
  if (message?.type === "remove-author") {
    return respond(mutateStore("removeAuthor", message.handle), "无法取消收藏作者。");
  }
  if (message?.type === "open-markdown-preview") {
    const preview = previewValue(message.capture, { canSave: Boolean(message.canSave) });
    return respond(
      chrome.storage.session.set({ "library-markdown-preview": preview })
        .then(() => chrome.tabs.create({ url: chrome.runtime.getURL("preview.html?mode=library") }))
        .then(() => ({})),
      "无法打开 Markdown 预览。",
    );
  }
  if (message?.type === "open-side-panel") {
    const windowId = sender.tab?.windowId;
    const view = ["readingList", "assets", "authors"].includes(message.view) ? message.view : "readingList";
    if (!windowId || !chrome.sidePanel?.open) {
      sendResponse({ error: "请点击扩展图标打开 Side Panel。" });
      return;
    }
    return respond(
      chrome.sidePanel.open({ windowId })
        .then(() => chrome.storage.session.set({ "x-to-md-sidepanel-target": view }))
        .then(() => chrome.runtime.sendMessage({ type: "navigate-sidepanel", view }).catch(() => {}))
        .then(() => ({ view })),
      "无法打开 Side Panel。",
    );
  }
});
