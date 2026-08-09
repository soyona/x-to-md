const article = document.querySelector("#article");
const status = document.querySelector("#status");
const copyButton = document.querySelector("#copy");
let capture = null;

function text(value) {
  return String(value || "");
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineHtml(block) {
  const segments = Array.isArray(block.segments) && block.segments.length
    ? block.segments
    : [{ text: block.text || "" }];
  return segments.map((segment) => {
    let value = escapeHtml(segment.text);
    if (segment.href && /^https?:\/\//u.test(segment.href)) value = `<a href="${escapeHtml(segment.href)}" target="_blank" rel="noreferrer">${value}</a>`;
    if (segment.code) value = `<code>${value}</code>`;
    if (segment.emphasis) value = `<em>${value}</em>`;
    if (segment.strike) value = `<s>${value}</s>`;
    if (segment.strong) value = `<strong>${value}</strong>`;
    return value;
  }).join("");
}

function renderBlock(block) {
  if (block.type === "image") {
    const url = text(block.url || block.previewImageUrl);
    return url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(block.altText || "X 原文图片")}">` : "";
  }
  if (block.type === "code") {
    const language = text(block.language);
    const header = language || "";
    return `<div class="preview-code"><div class="preview-code-header"><span>${escapeHtml(header)}</span><button type="button" class="preview-code-copy" data-code-copy aria-label="复制代码" title="复制代码">▣</button></div><pre><code>${escapeHtml(block.text)}</code></pre></div>`;
  }
  if (block.type === "heading") return `<h${Math.min(6, Math.max(1, Number(block.level) || 1))}>${inlineHtml(block)}</h${Math.min(6, Math.max(1, Number(block.level) || 1))}>`;
  if (block.type === "blockquote") return `<blockquote>${inlineHtml(block)}</blockquote>`;
  if (block.type === "divider") return "<hr>";
  if (block.type === "listItem") return `<p>${block.ordered ? "1." : "•"} ${inlineHtml(block)}</p>`;
  if (block.type === "link") return `<p><a href="${escapeHtml(block.url)}" target="_blank" rel="noreferrer">${escapeHtml(block.text || block.url)}</a></p>`;
  return `<p>${inlineHtml(block)}</p>`;
}

function renderCapture(value) {
  capture = value;
  const blocks = Array.isArray(value.blocks) ? value.blocks : [];
  const metadata = [value.authorName, value.authorHandle ? `@${value.authorHandle.replace(/^@/u, "")}` : "", value.publishedAt].filter(Boolean).join(" · ");
  const sourceUrl = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\//u.test(value.sourceUrl || "") ? value.sourceUrl : "";
  const sourceLink = sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">查看原文</a>` : "";
  const info = `<div class="preview-info"><span>图片不进入 Markdown</span>${metadata ? `<span>${escapeHtml(metadata)}</span>` : ""}${sourceLink}</div>`;
  article.innerHTML = `${info}${blocks.map(renderBlock).join("")}`;
  copyButton.disabled = false;
  document.title = value.title || "X 原文预览";
}

async function loadCapture() {
  try {
    const result = await chrome.storage.session.get("latest-capture");
    await chrome.storage.session.remove("latest-capture");
    if (!result["latest-capture"]) throw new Error("本次预览已过期，请返回 X 页面重新提取。");
    renderCapture(result["latest-capture"]);
  } catch (error) {
    article.innerHTML = `<p class="empty">${escapeHtml(error.message || "读取原文失败。")}</p>`;
    status.textContent = "预览不可用";
  }
}

copyButton.addEventListener("click", async () => {
  if (!capture) return;
  try {
    await navigator.clipboard.writeText(globalThis.XToXhsMarkdown.blocksToMarkdown(capture.blocks, { includeImages: false }));
    copyButton.textContent = "已复制";
    status.textContent = "已复制 Markdown（不含图片）";
  } catch {
    status.textContent = "复制失败，请检查剪贴板权限。";
  }
});
document.querySelector("#close").addEventListener("click", () => window.close());
article.addEventListener("click", async (event) => {
  const button = event.target.closest?.("[data-code-copy]");
  if (!button) return;
  const code = button.closest(".preview-code")?.querySelector("code")?.textContent || "";
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = "✓";
    status.textContent = "代码已复制";
  } catch {
    status.textContent = "复制失败，请检查剪贴板权限。";
  }
});
loadCapture();
