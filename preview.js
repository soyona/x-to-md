const article = document.querySelector("#article");
const status = document.querySelector("#status");
const copyButton = document.querySelector("#copy");
const saveButton = document.querySelector("#save");
const previewTitle = document.querySelector("#preview-title");
const previewSubtitle = document.querySelector("#preview-subtitle");
let preview = null;

function text(value) {
  return String(value || "");
}

function escapeHtml(value) {
  return text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? text(value) : `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function authorProfileUrl(handle) {
  const normalized = text(handle).replace(/^@/u, "");
  return /^[A-Za-z0-9_]{1,15}$/u.test(normalized) ? `https://x.com/${normalized}` : "";
}

function metadata(value) {
  const profileUrl = authorProfileUrl(value.authorHandle);
  const authorName = text(value.authorName);
  const handle = text(value.authorHandle).replace(/^@/u, "");
  const author = profileUrl
    ? `<a href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(authorName || `@${handle}`)}${handle ? ` @${escapeHtml(handle)}` : ""}</a>`
    : escapeHtml([authorName, handle ? `@${handle}` : ""].filter(Boolean).join(" "));
  const publishedAt = value.publishedAt ? `<span>${escapeHtml(formatDate(value.publishedAt))}</span>` : "";
  return [author, publishedAt].filter(Boolean).join(" · ");
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
    if (!inCode) return;
    output.push(`<div class="preview-code"><div class="preview-code-header"><span>${escapeHtml(codeLanguage)}</span><button type="button" class="preview-code-copy" data-code-copy>复制</button></div><pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre></div>`);
    codeLines = [];
    codeLanguage = "";
    inCode = false;
  };
  const normalizedTitle = text(title).replace(/\s+/gu, " ").trim();
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const titleHeading = /^#\s+(.+)$/u.exec(lines[index]);
    if (titleHeading && text(titleHeading[1]).replace(/\s+/gu, " ").trim() === normalizedTitle) lines.splice(index, 1);
  }
  if (normalizedTitle) output.push(`<h1>${escapeHtml(title)}</h1>`);
  lines.forEach((line) => {
    const fence = /^```([^\s]*)\s*$/u.exec(line);
    if (fence) {
      if (inCode) closeCode();
      else { closeList(); inCode = true; codeLanguage = fence[1] || ""; }
      return;
    }
    if (inCode) { codeLines.push(line); return; }
    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    const list = /^\s*([-*+] |\d+\. )(.+)$/u.exec(line);
    if (heading) { closeList(); output.push(`<h${heading[1].length}>${markdownInline(heading[2])}</h${heading[1].length}>`); return; }
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
  return output.join("") || '<p class="empty">这篇 Article 没有可预览的 Markdown 内容。</p>';
}

function renderPreview(value) {
  preview = value;
  previewTitle.textContent = "Markdown 预览";
  previewSubtitle.textContent = value.canSave ? "检查后可保存为素材" : "仅在此设备临时展示";
  const sourceUrl = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\//u.test(value.sourceUrl || "") ? value.sourceUrl : "";
  const sourceLink = sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">打开 X 原文</a>` : "";
  article.classList.add("is-markdown");
  article.innerHTML = `<div class="preview-info"><span>Markdown 阅读视图</span>${metadata(value)}${sourceLink}</div>${renderMarkdown(value.markdown, value.title)}`;
  copyButton.disabled = false;
  saveButton.hidden = !value.canSave;
  document.title = `${value.title || "Markdown"} · 预览`;
}

async function loadPreview() {
  try {
    const result = await chrome.storage.session.get("library-markdown-preview");
    await chrome.storage.session.remove("library-markdown-preview");
    if (!result["library-markdown-preview"]) throw new Error("预览已过期，请返回 X 或素材库重新打开。");
    renderPreview(result["library-markdown-preview"]);
  } catch (error) {
    article.innerHTML = `<p class="empty">${escapeHtml(error.message || "无法打开预览。")}</p>`;
    status.textContent = "预览不可用";
  }
}

copyButton.addEventListener("click", async () => {
  if (!preview?.markdown) return;
  try {
    await navigator.clipboard.writeText(preview.markdown);
    copyButton.setAttribute("aria-label", "Markdown 已复制");
    copyButton.title = "Markdown 已复制";
    status.textContent = "Markdown 已复制（不含图片）";
  } catch {
    status.textContent = "复制失败，请检查剪贴板权限。";
  }
});

saveButton.addEventListener("click", async () => {
  if (!preview?.canSave) return;
  saveButton.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({
      type: "save-article-asset",
      capture: { ...preview, content: preview.markdown, contentType: "article" },
    });
    if (result?.error) throw new Error(result.error);
    preview.canSave = false;
    saveButton.hidden = true;
    status.textContent = "已保存为素材";
  } catch (error) {
    status.textContent = error.message || "保存失败";
    saveButton.disabled = false;
  }
});

document.querySelector("#close").addEventListener("click", () => window.close());
article.addEventListener("click", async (event) => {
  const button = event.target.closest?.("[data-code-copy]");
  if (!button) return;
  const code = button.closest(".preview-code")?.querySelector("code")?.textContent || "";
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = "已复制";
    status.textContent = "代码已复制";
  } catch {
    status.textContent = "复制失败，请检查剪贴板权限。";
  }
});

loadPreview();
