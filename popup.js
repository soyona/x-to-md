const button = document.querySelector("#import");
const status = document.querySelector("#status");
const DEFAULT_BUTTON_LABEL = button.textContent;

function setStatus(message, kind = "") {
  status.textContent = message;
  status.className = kind;
}

async function copyMarkdown(capture) {
  await navigator.clipboard.writeText(
    globalThis.XToXhsMarkdown.blocksToMarkdown(capture.blocks, { includeImages: false }),
  );
}

button.addEventListener("click", async () => {
  button.disabled = true;
  button.textContent = "Preparing…";
  button.setAttribute("aria-busy", "true");
  setStatus("Reading the current X page…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/(?:www\.)?(?:x|twitter)\.com\//u.test(tab.url || "")) {
      throw new Error("Open a post or Article to extract content.");
    }
    const capture = await chrome.tabs.sendMessage(tab.id, { type: "capture-x" });
    if (capture?.error) throw new Error(capture.error);
    if (!capture?.content) throw new Error("No content found. Please wait for the page to finish loading.");
    await copyMarkdown(capture);
    try {
      const preview = await chrome.tabs.sendMessage(tab.id, { type: "open-native-preview" });
      if (preview?.error) throw new Error(preview.error);
      window.close();
    } catch {
      setStatus("Markdown copied, but the native preview could not be opened.", "error");
    }
  } catch (error) {
    setStatus(error.message || "Failed to read the page. Please refresh X and try again.", "error");
  } finally {
    button.disabled = false;
    button.textContent = DEFAULT_BUTTON_LABEL;
    button.removeAttribute("aria-busy");
  }
});
