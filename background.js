(function registerInboxStore() {
  function normalizedSourceUrl(value) {
    return String(value || "").split(/[?#]/u)[0].replace(/\/$/u, "");
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
      assets.unshift({
        id,
        candidateId: candidate?.id || null,
        sourceUrl,
        title: capture.title || "Untitled Article",
        authorHandle: capture.authorHandle || "",
        markdown: capture.content,
        tags: [],
        note: "",
        usageStatus: "unused",
        createdAt: now,
        updatedAt: now,
      });
    }

    return { inbox: { ...(inbox || {}), candidates, assets }, existing: Boolean(existing) };
  }

  globalThis.XToMdInboxStore = { normalizedSourceUrl, saveCapture };
}());

const X_TAB_URL_PATTERNS = [
  "https://x.com/*",
  "https://www.x.com/*",
  "https://twitter.com/*",
  "https://www.twitter.com/*",
];
const CONTENT_INBOX_STORAGE_KEY = "x-to-md-content-inbox";
const CONTENT_SCRIPT_REVISION = "article-more-menu-v9";

function reportContentScriptError(context, error) {
  console.error(`[x-to-md] ${context}`, error);
}

async function ensureContentScript(tab) {
  if (!tab?.id) throw new Error("No active tab.");
  try {
    const ready = await chrome.tabs.sendMessage(tab.id, { type: "x-to-md-ready" });
    if (ready?.ok && ready.revision === CONTENT_SCRIPT_REVISION) return;
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
        .then(() => chrome.tabs.sendMessage(tab.id, { type: "toggle-candidate-overlay" }))
        .catch((error) => reportContentScriptError(`Could not initialize tab ${tab.id}.`, error));
    });
    ensureContentScript(tab).catch((error) => reportContentScriptError(`Could not initialize tab ${tab.id}.`, error));
    return;
  }
  ensureContentScript(tab)
    .then(() => chrome.tabs.sendMessage(tab.id, { type: "toggle-candidate-overlay" }))
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
  if (message?.type === "open-side-panel") {
    const windowId = sender.tab?.windowId;
    if (!windowId || !chrome.sidePanel?.open) {
      sendResponse({ error: "请点击扩展图标打开素材库。" });
      return;
    }
    chrome.sidePanel.open({ windowId })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ error: "请点击扩展图标打开素材库。" }));
    return true;
  }
});
