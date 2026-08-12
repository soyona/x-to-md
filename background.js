(function registerInboxStore() {
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

  function saveCapture(inbox, capture, { id, now } = {}) {
    const sourceUrl = normalizedSourceUrl(capture?.sourceUrl);
    if (!sourceUrl || !capture?.content) throw new Error("无法保存空素材。");
    const candidates = (inbox?.candidates || []).map((candidate) => ({ ...candidate }));
    const assets = (inbox?.assets || []).map((asset) => ({ ...asset }));
    const candidate = candidates.find((item) => normalizedSourceUrl(item.sourceUrl) === sourceUrl);
    const existing = assets.find((asset) => normalizedSourceUrl(asset.sourceUrl) === sourceUrl);

    if (candidate) candidate.status = "saved";
    if (!existing) {
      const savedMetadata = (key, fallback = "") => {
        const candidateValue = candidate?.[key];
        return candidateValue === undefined || candidateValue === null || candidateValue === ""
          ? (capture?.[key] ?? fallback)
          : candidateValue;
      };
      assets.unshift({
        id,
        candidateId: candidate?.id || null,
        sourceUrl,
        title: capture.title || "Untitled Article",
        authorHandle: capture.authorHandle || "",
        authorName: savedMetadata("authorName"),
        authorAvatarUrl: savedMetadata("authorAvatarUrl"),
        authorVerified: savedMetadata("authorVerified", false),
        coverImageUrl: savedMetadata("coverImageUrl"),
        publishedAt: savedMetadata("publishedAt", null),
        previewExcerpt: savedMetadata("previewExcerpt"),
        markdown: capture.content,
        tags: [],
        note: "",
        usageStatus: "unused",
        publishedLinks: [],
        createdAt: now,
        updatedAt: now,
      });
    }

    return { inbox: { ...(inbox || {}), candidates, assets }, existing: Boolean(existing) };
  }

  function removeCapture(inbox, sourceUrl) {
    const normalizedUrl = normalizedSourceUrl(sourceUrl);
    const candidates = (inbox?.candidates || []).map((candidate) => ({ ...candidate }));
    const assets = (inbox?.assets || []).filter((asset) => normalizedSourceUrl(asset.sourceUrl) !== normalizedUrl);
    const candidate = candidates.find((item) => normalizedSourceUrl(item.sourceUrl) === normalizedUrl);
    if (candidate?.status === "saved") candidate.status = "new";
    return { inbox: { ...(inbox || {}), candidates, assets }, removed: assets.length !== (inbox?.assets || []).length };
  }

  globalThis.XToMdInboxStore = { normalizedSourceUrl, saveCapture, removeCapture };
}());

const X_TAB_URL_PATTERNS = [
  "https://x.com/*",
  "https://www.x.com/*",
  "https://twitter.com/*",
  "https://www.twitter.com/*",
];
const CONTENT_INBOX_STORAGE_KEY = "x-to-md-content-inbox";
const CONTENT_SCRIPT_REVISION = "article-more-menu-v20";

function reportContentScriptError(context, error) {
  console.error(`[x-to-md] ${context}`, error);
}

function isSupportedXTab(tab) {
  try {
    const url = new URL(tab?.url || tab?.pendingUrl || "");
    return url.protocol === "https:"
      && ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function ensureContentScript(tab) {
  if (!tab?.id) throw new Error("No active tab.");
  if (!isSupportedXTab(tab)) return false;
  try {
    const ready = await chrome.tabs.sendMessage(tab.id, { type: "x-to-md-ready" });
    if (ready?.ok && ready.revision === CONTENT_SCRIPT_REVISION) return true;
  } catch {
    // A missing receiver also requires the current packaged content script.
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["markdown.js", "content.js"],
  });
  const ready = await chrome.tabs.sendMessage(tab.id, { type: "x-to-md-ready" });
  if (!ready?.ok || ready.revision !== CONTENT_SCRIPT_REVISION) {
    throw new Error(`Content script revision mismatch: expected ${CONTENT_SCRIPT_REVISION}, received ${ready?.revision || "none"}.`);
  }
  return true;
}

async function injectOpenXTabs() {
  const tabs = await chrome.tabs.query({ url: X_TAB_URL_PATTERNS });
  await Promise.all(tabs.map(async (tab) => {
    try {
      await ensureContentScript(tab);
    } catch (error) {
      reportContentScriptError(`Could not initialize tab ${tab.id}.`, error);
    }
  }));
}

chrome.runtime.onInstalled.addListener(() => {
  injectOpenXTabs().catch((error) => reportContentScriptError("Installation initialization failed.", error));
});

chrome.runtime.onStartup.addListener(() => {
  injectOpenXTabs().catch((error) => reportContentScriptError("Startup initialization failed.", error));
});

injectOpenXTabs().catch((error) => reportContentScriptError("Service worker initialization failed.", error));

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  // Open the Side Panel directly from the user gesture. Content-script
  // injection is best-effort and must never block the primary entry point.
  if (chrome.sidePanel?.open && tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
      ensureContentScript(tab)
        .then((isReady) => isReady && chrome.tabs.sendMessage(tab.id, { type: "toggle-candidate-overlay" }))
        .catch((error) => reportContentScriptError(`Could not initialize tab ${tab.id}.`, error));
    });
    ensureContentScript(tab).catch((error) => reportContentScriptError(`Could not initialize tab ${tab.id}.`, error));
    return;
  }
  ensureContentScript(tab)
    .then((isReady) => isReady && chrome.tabs.sendMessage(tab.id, { type: "toggle-candidate-overlay" }))
    .catch((error) => reportContentScriptError(`Could not initialize tab ${tab.id}.`, error));
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "capture-completed") return;
  chrome.runtime.sendMessage({ type: "capture-completed", sourceUrl: message.sourceUrl }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "save-capture-to-library") {
    chrome.storage.local.get(CONTENT_INBOX_STORAGE_KEY)
      .then((stored) => {
        const result = globalThis.XToMdInboxStore.saveCapture(
          stored[CONTENT_INBOX_STORAGE_KEY],
          message.capture,
          { id: `asset_${crypto.randomUUID()}`, now: new Date().toISOString() },
        );
        return chrome.storage.local.set({ [CONTENT_INBOX_STORAGE_KEY]: result.inbox }).then(() => result);
      })
      .then((result) => sendResponse({ ok: true, existing: result.existing }))
      .catch((error) => sendResponse({ error: error.message || "无法保存素材。" }));
    return true;
  }
  if (message?.type === "remove-capture-from-library") {
    chrome.storage.local.get(CONTENT_INBOX_STORAGE_KEY)
      .then((stored) => {
        const result = globalThis.XToMdInboxStore.removeCapture(
          stored[CONTENT_INBOX_STORAGE_KEY],
          message.sourceUrl,
        );
        return chrome.storage.local.set({ [CONTENT_INBOX_STORAGE_KEY]: result.inbox }).then(() => result);
      })
      .then((result) => sendResponse({ ok: true, removed: result.removed }))
      .catch((error) => sendResponse({ error: error.message || "无法移除素材。" }));
    return true;
  }
  if (message?.type === "open-markdown-preview") {
    chrome.storage.session.set({ "library-markdown-preview": {
      title: message.capture?.title || "",
      markdown: message.capture?.content || "",
      authorName: message.capture?.authorName || "",
      authorHandle: message.capture?.authorHandle || "",
      sourceUrl: message.capture?.sourceUrl || "",
      publishedAt: message.capture?.publishedAt || null,
    } })
      .then(() => chrome.tabs.create({ url: chrome.runtime.getURL("preview.html?mode=library") }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ error: error.message || "无法打开 Markdown 预览。" }));
    return true;
  }
  if (message?.type === "open-side-panel") {
    const windowId = sender.tab?.windowId;
    const view = ["candidates", "assets", "subscriptions"].includes(message.view) ? message.view : "candidates";
    if (!windowId || !chrome.sidePanel?.open) {
      sendResponse({ error: "请点击扩展图标打开 Side Panel。" });
      return;
    }
    chrome.sidePanel.open({ windowId })
      .then(() => chrome.storage.session.set({ "x-to-md-sidepanel-target": view }))
      .then(() => chrome.runtime.sendMessage({ type: "navigate-sidepanel", view }).catch(() => {}))
      .then(() => sendResponse({ ok: true, view }))
      .catch((error) => sendResponse({ error: error.message || "无法打开 Side Panel。" }));
    return true;
  }
});
