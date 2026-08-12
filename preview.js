const article = document.querySelector("#article");
const status = document.querySelector("#status");
const copyButton = document.querySelector("#copy");
const previewTitle = document.querySelector("#preview-title");
const previewSubtitle = document.querySelector("#preview-subtitle");
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
    return url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(block.altText || "Image from X")}">` : "";
  }
  if (block.type === "code") {
    const language = text(block.language);
    const header = language || "";
    return `<div class="preview-code"><div class="preview-code-header"><span>${escapeHtml(header)}</span><button type="button" class="preview-code-copy" data-code-copy aria-label="Copy code" title="Copy code">▣</button></div><pre><code>${escapeHtml(block.text)}</code></pre></div>`;
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
  previewTitle.textContent = "提取的 Markdown";
  previewSubtitle.textContent = "已复制 · 原文语义预览";
  const blocks = Array.isArray(value.blocks) ? value.blocks : [];
  const metadata = [value.authorName, value.authorHandle ? `@${value.authorHandle.replace(/^@/u, "")}` : "", value.publishedAt].filter(Boolean).join(" · ");
  const sourceUrl = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\//u.test(value.sourceUrl || "") ? value.sourceUrl : "";
  const sourceLink = sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">View original</a>` : "";
  const info = `<div class="preview-info"><span>Images are excluded from Markdown</span>${metadata ? `<span>${escapeHtml(metadata)}</span>` : ""}${sourceLink}</div>`;
  article.innerHTML = `${info}${blocks.map(renderBlock).join("")}`;
  copyButton.disabled = false;
  document.title = value.title || "X Article Preview";
}

function formatPreviewDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? text(value) : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function authorProfileUrl(handle) {
  const normalizedHandle = text(handle).replace(/^@/u, "");
  return /^[A-Za-z0-9_]{1,15}$/u.test(normalizedHandle) ? `https://x.com/${normalizedHandle}` : "";
}

function libraryMetadata(value) {
  const profileUrl = authorProfileUrl(value.authorHandle);
  const authorName = text(value.authorName);
  const handle = text(value.authorHandle).replace(/^@/u, "");
  const author = profileUrl
    ? `<a href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(authorName || `@${handle}`)} 的 X 主页">${escapeHtml(authorName || `@${handle}`)}${handle ? ` @${escapeHtml(handle)}` : ""}</a>`
    : escapeHtml([authorName, handle ? `@${handle}` : ""].filter(Boolean).join(" "));
  const publishedAt = value.publishedAt ? formatPreviewDate(value.publishedAt) : "";
  return [author, publishedAt ? `<span>${escapeHtml(publishedAt)}</span>` : ""].filter(Boolean).join(" · ");
}

function markdownInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/gu, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gu, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(markdown, title = "") {
  const lines = text(markdown).replaceAll("\r\n", "\n").split("\n");
  const output = [];
  let codeLines = [];
  let codeLanguage = "";
  let inCode = false;
  let listType = "";
  const closeList = () => { if (listType) output.push(`</${listType}>`); listType = ""; };
  const closeCode = () => {
    if (!codeLines.length && !codeLanguage) return;
    output.push(`<div class="preview-code"><div class="preview-code-header"><span>${escapeHtml(codeLanguage)}</span></div><pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre></div>`);
    codeLines = [];
    codeLanguage = "";
    inCode = false;
  };
  const firstContentLine = lines.findIndex((line) => line.trim());
  const titleHeading = firstContentLine >= 0 ? /^#\s+(.+)$/u.exec(lines[firstContentLine]) : null;
  if (titleHeading && text(titleHeading[1]).trim() === text(title).trim()) lines.splice(firstContentLine, 1);
  if (text(title).trim()) output.push(`<h1>${escapeHtml(title)}</h1>`);
  lines.forEach((line) => {
    const fence = /^```([^\s]*)\s*$/u.exec(line);
    if (fence) {
      if (inCode) closeCode();
      else { inCode = true; codeLanguage = fence[1] || ""; }
      return;
    }
    if (inCode) { codeLines.push(line); return; }
    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    const list = /^\s*([-*+] |\d+\. )(.+)$/u.exec(line);
    if (heading) { closeList(); const level = heading[1].length; output.push(`<h${level}>${markdownInline(heading[2])}</h${level}>`); return; }
    if (/^\s*([-*_])\1\1+\s*$/u.test(line)) { closeList(); output.push("<hr>"); return; }
    if (line.startsWith("> ")) { closeList(); output.push(`<blockquote>${markdownInline(line.slice(2))}</blockquote>`); return; }
    if (list) {
      const nextType = /^\d+\./u.test(list[1]) ? "ol" : "ul";
      if (nextType !== listType) { closeList(); listType = nextType; output.push(`<${listType}>`); }
      output.push(`<li>${markdownInline(list[2])}</li>`);
      return;
    }
    closeList();
    if (line.trim()) output.push(`<p>${markdownInline(line)}</p>`);
  });
  closeCode();
  closeList();
  return output.join("") || '<p class="empty">这篇素材没有可预览的 Markdown 内容。</p>';
}

function renderLibraryMarkdown(value) {
  capture = { blocks: [], content: value.markdown || "" };
  previewTitle.textContent = "Markdown 预览";
  previewSubtitle.textContent = "仅在此设备临时展示";
  const metadata = libraryMetadata(value);
  const sourceUrl = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\//u.test(value.sourceUrl || "") ? value.sourceUrl : "";
  const sourceLink = sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">打开 X 原文</a>` : "";
  article.classList.add("is-markdown");
  article.innerHTML = `<div class="preview-info"><span>Markdown 阅读视图</span>${metadata}${sourceLink}</div>${renderMarkdown(value.markdown, value.title)}`;
  copyButton.disabled = false;
  copyButton.setAttribute("aria-label", "复制 Markdown");
  copyButton.title = "复制 Markdown";
  document.title = `${value.title || "Markdown"} · 预览`;
}

async function loadCapture() {
  try {
    const libraryMode = new URLSearchParams(location.search).get("mode") === "library";
    const key = libraryMode ? "library-markdown-preview" : "latest-capture";
    const result = await chrome.storage.session.get(key);
    await chrome.storage.session.remove(key);
    if (!result[key]) throw new Error(libraryMode ? "预览已过期，请返回素材库重新打开。" : "This preview has expired. Return to X and extract the content again.");
    if (libraryMode) renderLibraryMarkdown(result[key]);
    else renderCapture(result[key]);
  } catch (error) {
    article.innerHTML = `<p class="empty">${escapeHtml(error.message || "Failed to load the preview.")}</p>`;
    status.textContent = "Preview unavailable";
  }
}

copyButton.addEventListener("click", async () => {
  if (!capture) return;
  try {
    const markdown = capture.content || globalThis.XToXhsMarkdown.blocksToMarkdown(capture.blocks, { includeImages: false });
    await navigator.clipboard.writeText(markdown);
    copyButton.setAttribute("aria-label", "Markdown 已复制");
    copyButton.title = "Markdown 已复制";
    status.textContent = "Markdown copied (images excluded)";
  } catch {
    status.textContent = "Copy failed. Check clipboard permissions.";
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
    status.textContent = "Code copied";
  } catch {
    status.textContent = "Copy failed. Check clipboard permissions.";
  }
});
loadCapture();
