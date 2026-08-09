const article = document.querySelector("#article");
const status = document.querySelector("#status");
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
  if (block.type === "code") return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
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
  article.innerHTML = `${blocks.map(renderBlock).join("")}${metadata ? `<p class="preview-meta">${escapeHtml(metadata)}</p>` : ""}`;
  document.title = value.title || "X 原文预览";
}

async function loadCapture() {
  try {
    const result = await chrome.storage.session.get("latest-capture");
    await chrome.storage.session.remove("latest-capture");
    if (!result["latest-capture"]) throw new Error("原文已过期，请返回 X 页面重新读取。");
    renderCapture(result["latest-capture"]);
  } catch (error) {
    article.innerHTML = `<p class="empty">${escapeHtml(error.message || "读取原文失败。")}</p>`;
  }
}

document.querySelector("#copy").addEventListener("click", async () => {
  if (!capture) return;
  try {
    await navigator.clipboard.writeText(globalThis.XToXhsMarkdown.blocksToMarkdown(capture.blocks, { includeImages: false }));
    status.textContent = "已复制 Markdown（不含图片）";
  } catch {
    status.textContent = "复制失败，请检查剪贴板权限。";
  }
});
document.querySelector("#close").addEventListener("click", () => window.close());
loadCapture();
