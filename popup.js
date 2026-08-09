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
  button.textContent = "正在整理…";
  button.setAttribute("aria-busy", "true");
  setStatus("正在读取当前 X 页面…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/(?:www\.)?(?:x|twitter)\.com\//u.test(tab.url || "")) {
      throw new Error("打开一条推文或 Article 后即可提取。");
    }
    const capture = await chrome.tabs.sendMessage(tab.id, { type: "capture-x" });
    if (capture?.error) throw new Error(capture.error);
    if (!capture?.content) throw new Error("没有读取到正文，请先等待页面加载完成。");
    await copyMarkdown(capture);
    try {
      const preview = await chrome.tabs.sendMessage(tab.id, { type: "open-native-preview" });
      if (preview?.error) throw new Error(preview.error);
      window.close();
    } catch {
      setStatus("已复制 Markdown，但原生预览未能打开。", "error");
    }
  } catch (error) {
    setStatus(error.message || "读取失败，请刷新 X 页面后重试。", "error");
  } finally {
    button.disabled = false;
    button.textContent = DEFAULT_BUTTON_LABEL;
    button.removeAttribute("aria-busy");
  }
});
