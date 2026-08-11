const X_TAB_URL_PATTERNS = [
  "https://x.com/*",
  "https://www.x.com/*",
  "https://twitter.com/*",
  "https://www.twitter.com/*",
];

async function ensureContentScript(tab) {
  if (!tab?.id) throw new Error("No active tab.");
  try {
    const ready = await chrome.tabs.sendMessage(tab.id, { type: "x-to-md-ready" });
    if (ready?.ok) return;
  } catch {
    // A missing receiver also requires the current packaged content script.
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["markdown.js", "content.js"],
  });
}

async function injectOpenXTabs() {
  const tabs = await chrome.tabs.query({ url: X_TAB_URL_PATTERNS });
  await Promise.all(tabs.map((tab) => ensureContentScript(tab).catch(() => {})));
}

chrome.runtime.onInstalled.addListener(() => {
  injectOpenXTabs().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  injectOpenXTabs().catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  // Open the Side Panel directly from the user gesture. Content-script
  // injection is best-effort and must never block the primary entry point.
  if (chrome.sidePanel?.open && tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
      ensureContentScript(tab)
        .then(() => chrome.tabs.sendMessage(tab.id, { type: "toggle-candidate-overlay" }))
        .catch(() => {});
    });
    ensureContentScript(tab).catch(() => {});
    return;
  }
  ensureContentScript(tab)
    .then(() => chrome.tabs.sendMessage(tab.id, { type: "toggle-candidate-overlay" }))
    .catch(() => {
      // Only the user-selected supported X/Twitter tab is eligible for injection.
    });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "open-native-article-preview") {
    const sourceUrl = message.sourceUrl;
    if (!/^https:\/\/(?:www\.)?(?:x|twitter)\.com\//u.test(sourceUrl || "")) return;
    const requestNativePreview = (tabId, attempt = 0) => {
      chrome.tabs.sendMessage(tabId, { type: "open-native-preview" }).catch(() => {
        if (attempt < 4) setTimeout(() => requestNativePreview(tabId, attempt + 1), 250);
      });
    };
    chrome.tabs.create({ url: sourceUrl }, (tab) => {
      if (!tab?.id) return;
      const previewWhenReady = (tabId, changeInfo) => {
        if (tabId !== tab.id || changeInfo.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(previewWhenReady);
        requestNativePreview(tab.id);
      };
      if (tab.status === "complete") requestNativePreview(tab.id);
      else chrome.tabs.onUpdated.addListener(previewWhenReady);
    });
    return;
  }
  if (message?.type !== "capture-completed") return;
  chrome.runtime.sendMessage({ type: "capture-completed", sourceUrl: message.sourceUrl }).catch(() => {});
});
