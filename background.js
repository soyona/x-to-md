chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggle-import-panel" });
  } catch {
    // The content script is only available on the supported X host pages.
  }
});
