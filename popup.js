const button = document.querySelector("#import");
const status = document.querySelector("#status");
const CAPTURE_KEY = "latest-capture";

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
  setStatus("正在读取当前页面…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/(?:www\.)?(?:x|twitter)\.com\//u.test(tab.url || "")) {
      throw new Error("请先在 X 页面打开一条推文或 Article。");
    }
    const capture = await chrome.tabs.sendMessage(tab.id, { type: "capture-x" });
    if (!capture?.content) throw new Error("没有读取到正文，请先等待 X 页面加载完成。");
    await copyMarkdown(capture);
    await chrome.storage.session.set({ [CAPTURE_KEY]: capture });
    await chrome.tabs.create({ url: chrome.runtime.getURL("preview.html") });
    setStatus("已复制 Markdown，并打开原文预览。", "success");
  } catch (error) {
    setStatus(error.message || "读取失败，请刷新 X 页面后重试。", "error");
  } finally {
    button.disabled = false;
  }
});
