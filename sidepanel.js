const STORAGE_KEY = "x-to-md-content-inbox";
const view = document.querySelector("#view");
const status = document.querySelector("#status");

const state = {
  page: "readingList",
  data: { schemaVersion: 1, readingList: [], authors: [], assets: [] },
  readingQuery: "",
  assetQuery: "",
  assetFilter: "all",
  assetMenu: null,
  assetMenuPlacement: "down",
  assetTagEditor: null,
  assetDialog: null,
};

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function formatDate(value) {
  if (!value) return "未记录";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : `${date.getMonth() + 1}/${date.getDate()}`;
}

function normalizedSourceUrl(value) {
  const fallback = String(value || "").split(/[?#]/u)[0].replace(/\/$/u, "");
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^(\/(?:[^/]+\/status|[^/]+\/article|i\/article)\/\d+)/u);
    return match ? `${url.origin}${match[1]}` : fallback;
  } catch {
    return fallback;
  }
}

function setStatus(message = "", kind = "") {
  window.clearTimeout(setStatus.clearTimer);
  status.textContent = message;
  status.className = `status ${kind}`.trim();
  if (message) setStatus.clearTimer = window.setTimeout(() => setStatus(), 3200);
}

async function loadData() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  state.data = value?.schemaVersion === 1
    ? {
      schemaVersion: 1,
      readingList: Array.isArray(value.readingList) ? value.readingList : [],
      authors: Array.isArray(value.authors) ? value.authors : [],
      assets: Array.isArray(value.assets) ? value.assets : [],
    }
    : { schemaVersion: 1, readingList: [], authors: [], assets: [] };
  const target = await chrome.storage.session.get("x-to-md-sidepanel-target");
  if (["readingList", "assets", "authors"].includes(target["x-to-md-sidepanel-target"])) {
    state.page = target["x-to-md-sidepanel-target"];
    await chrome.storage.session.remove("x-to-md-sidepanel-target");
  }
}

function avatarLabel(item) {
  return String(item?.authorName || item?.displayName || item?.authorHandle || item?.handle || "X").replace(/^@/u, "").slice(0, 1).toUpperCase();
}

function authorProfileUrl(handle) {
  const value = String(handle || "").replace(/^@/u, "");
  return /^[A-Za-z0-9_]{1,15}$/u.test(value) ? `https://x.com/${value}` : "";
}

let verifiedBadgeSequence = 0;

function verifiedBadge(type) {
  if (type === "blue") {
    return '<span class="verified-badge is-blue" aria-label="Verified account"><svg viewBox="0 0 22 22" aria-hidden="true"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg></span>';
  }
  if (type !== "gold") return "";
  verifiedBadgeSequence += 1;
  const gradientA = `x-to-md-verified-gold-${verifiedBadgeSequence}-a`;
  const gradientB = `x-to-md-verified-gold-${verifiedBadgeSequence}-b`;
  return `<span class="verified-badge is-gold" aria-label="Verified account"><svg viewBox="0 0 22 22" aria-hidden="true"><linearGradient gradientUnits="userSpaceOnUse" id="${gradientA}" x1="4.411" x2="18.083" y1="2.495" y2="21.508"><stop offset="0" stop-color="#f4e72a"></stop><stop offset=".539" stop-color="#cd8105"></stop><stop offset=".68" stop-color="#cb7b00"></stop><stop offset="1" stop-color="#f4ec26"></stop><stop offset="1" stop-color="#f4e72a"></stop></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="${gradientB}" x1="5.355" x2="16.361" y1="3.395" y2="19.133"><stop offset="0" stop-color="#f9e87f"></stop><stop offset=".406" stop-color="#e2b719"></stop><stop offset=".989" stop-color="#e2b719"></stop></linearGradient><g clip-rule="evenodd" fill-rule="evenodd"><path d="M13.324 3.848L11 1.6 8.676 3.848l-3.201-.453-.559 3.184L2.06 8.095 3.48 11l-1.42 2.904 2.856 1.516.559 3.184 3.201-.452L11 20.4l2.324-2.248 3.201.452.559-3.184 2.856-1.516L18.52 11l1.42-2.905-2.856-1.516-.559-3.184zm-7.09 7.575l3.428 3.428 5.683-6.206-1.347-1.247-4.4 4.795-2.072-2.072z" fill="url(#${gradientA})"></path><path d="M13.101 4.533L11 2.5 8.899 4.533l-2.895-.41-.505 2.88-2.583 1.37L4.2 11l-1.284 2.627 2.583 1.37.505 2.88 2.895-.41L11 19.5l2.101-2.033 2.895.41.505-2.88 2.583-1.37L17.8 11l1.284-2.627-2.583-1.37-.505-2.88zm-6.868 6.89l3.429 3.428 5.683-6.206-1.347-1.247-4.4 4.795-2.072-2.072z" fill="url(#${gradientB})"></path><path d="M6.233 11.423l3.429 3.428 5.65-6.17.038-.033-.005 1.398-5.683 6.206-3.429-3.429-.003-1.405.005.003z" fill="#d18800"></path></g></svg></span>`;
}

function moreIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
}

function searchIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 20-4.6-4.6a7.5 7.5 0 1 0-1.4 1.4L19.6 21 21 20zM5 10.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0z"/></svg>';
}

function addIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>';
}

function documentIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 2.5h8.8l3.2 3.2v13.8A2.5 2.5 0 0 1 16 22H6.5A2.5 2.5 0 0 1 4 19.5V5A2.5 2.5 0 0 1 6.5 2.5zm8 2H6.5a.5.5 0 0 0-.5.5v14.5a.5.5 0 0 0 .5.5H16a.5.5 0 0 0 .5-.5V6.5h-2z"/><path d="M9.2 9.1 7.4 12l1.8 2.9 1.5-.9-1.2-2 1.2-2zm5.6 0-1.5.9 1.2 2-1.2 2 1.5.9 1.8-2.9z"/></svg>';
}

function readingRemoveIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" aria-hidden="true"><path d="M3.5 6h14l-1.7 12H5.2L3.5 6zM7 3.5h7M6.5 11h2.7l1.15 2h.3l1.15-2h2.7M16 8.5h5"/></svg>';
}

function openOriginalIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" aria-hidden="true"><path d="M13 4h7v7M20 4l-9 9"/><path d="M18.5 13v5.5A1.5 1.5 0 0 1 17 20H5.5A1.5 1.5 0 0 1 4 18.5V7a1.5 1.5 0 0 1 1.5-1.5H11"/></svg>';
}

function editTagIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" aria-hidden="true"><path d="m4 20 4.2-1 10.55-10.55a2.12 2.12 0 0 0-3-3L5.2 16 4 20zM14.5 6.7l2.8 2.8"/></svg>';
}

function usageStatusIcon(isUsed) {
  return isUsed
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.2 2.4 2.4 5-5.2"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/></svg>';
}

function deleteIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" aria-hidden="true"><path d="M5 7h14M9 4h6l1 3M7 7l.8 13h8.4L17 7M10 10v7M14 10v7"/></svg>';
}

function previewMarkdownIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" aria-hidden="true"><path d="M5 2.5h9l4 4v15H5zM14 2.5v4h4M7.5 14s1.7-3 4.5-3 4.5 3 4.5 3-1.7 3-4.5 3-4.5-3-4.5-3z"/><circle cx="12" cy="14" r="1.25"/></svg>';
}

function menuItemIcon(icon) {
  return `<span class="asset-menu-item-icon" aria-hidden="true">${icon}</span>`;
}

function readingItem(item) {
  const authorName = item.authorName || item.authorHandle || "未知作者";
  const profileUrl = authorProfileUrl(item.authorHandle);
  const avatar = item.authorAvatarUrl ? `<img src="${escapeHtml(item.authorAvatarUrl)}" alt="" />` : escapeHtml(avatarLabel(item));
  const cover = item.coverImageUrl
    ? `<span class="article-card-media"><img src="${escapeHtml(item.coverImageUrl)}" alt="" /><span class="article-card-badge">𝕏 Article</span></span>`
    : "";
  const excerpt = item.previewExcerpt ? `<span class="article-card-excerpt">${escapeHtml(item.previewExcerpt)}</span>` : "";
  return `<article class="article-post" data-source-url="${escapeHtml(normalizedSourceUrl(item.sourceUrl))}"><a class="article-avatar" href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(authorName)} 的 X 主页">${avatar}</a><div class="article-content"><div class="article-author"><strong>${escapeHtml(authorName)}${verifiedBadge(item.authorVerificationType)}</strong><span class="article-handle">${escapeHtml(item.authorHandle || "")}</span><span class="article-date">· ${escapeHtml(formatDate(item.publishedAt))}</span></div><a class="article-card" data-action="reading-open" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">${cover}<span class="article-card-body"><strong>${escapeHtml(item.title || "Untitled Article")}</strong>${excerpt}</span></a><footer class="article-engagement"><span class="reading-added-at">加入于 ${escapeHtml(formatDate(item.addedAt))}</span><button class="article-inbox-remove" data-action="reading-remove" data-url="${escapeHtml(item.sourceUrl)}" type="button" aria-label="从待读移除" title="从待读移除">${readingRemoveIcon()}</button></footer></div></article>`;
}

function renderReadingList() {
  const query = state.readingQuery.trim().toLowerCase();
  const items = state.data.readingList.filter((item) => !query || `${item.title} ${item.authorName} ${item.authorHandle}`.toLowerCase().includes(query));
  const search = `<div class="reading-filters"><label class="panel-search"><span class="sr-only">搜索待读</span>${searchIcon()}<input data-reading-search type="search" placeholder="搜索标题、作者或 @handle" value="${escapeHtml(state.readingQuery)}" aria-label="搜索待读"></label></div>`;
  view.innerHTML = `${search}${items.length ? items.map(readingItem).join("") : '<p class="empty">还没有待读 Article。请在 X 的 Article Card 菜单中加入待读。</p>'}`;
}

function authorItem(author) {
  const name = author.displayName || author.handle;
  const profileUrl = `${authorProfileUrl(author.handle)}/articles`;
  const avatar = author.authorAvatarUrl ? `<img src="${escapeHtml(author.authorAvatarUrl)}" alt="" />` : escapeHtml(avatarLabel(author));
  const description = author.description ? `<p class="author-description">${escapeHtml(author.description)}</p>` : "";
  return `<article class="author-cell"><a class="author-profile-link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(name)} 的 Articles"><div class="author-avatar" aria-hidden="true">${avatar}</div><div class="author-content"><div class="author-identity"><strong>${escapeHtml(name)}${verifiedBadge(author.authorVerificationType)}</strong><span class="author-handle">@${escapeHtml(author.handle.replace(/^@/u, ""))}</span></div>${description}</div></a><button class="author-remove-button" data-action="author-remove" data-handle="${escapeHtml(author.handle)}" type="button">取消收藏</button></article>`;
}

function renderAuthors() {
  view.innerHTML = state.data.authors.length
    ? state.data.authors.map(authorItem).join("")
    : '<p class="empty">还没有收藏作者。阅读优质 Article 时，可以从 x-to-md 菜单收藏作者。</p>';
}

function assetItem(asset) {
  const authorName = asset.authorName || asset.authorHandle || "未知作者";
  const profileUrl = authorProfileUrl(asset.authorHandle);
  const avatar = asset.authorAvatarUrl ? `<img src="${escapeHtml(asset.authorAvatarUrl)}" alt="" />` : escapeHtml(avatarLabel(asset));
  const tags = (asset.tags || []).map((tag) => `<span class="asset-tag"><span>${escapeHtml(tag)}</span><button data-action="asset-remove-tag" data-id="${escapeHtml(asset.id)}" data-tag="${escapeHtml(tag)}" type="button" aria-label="删除标签 ${escapeHtml(tag)}">×</button></span>`).join("");
  const tagEditor = state.assetTagEditor === asset.id ? `<div class="asset-tag-editor asset-menu-editor"><input data-asset-tag-input data-id="${escapeHtml(asset.id)}" type="text" placeholder="输入标签后回车" aria-label="添加标签"><button class="asset-icon-button" data-action="asset-add-tag" data-id="${escapeHtml(asset.id)}" type="button" aria-label="确认添加标签">${addIcon()}</button></div>` : "";
  const editorOpen = state.assetTagEditor === asset.id;
  const menu = state.assetMenu === asset.id ? `<div class="asset-menu ${state.assetMenuPlacement === "up" ? "is-up" : ""}" ${editorOpen ? 'role="dialog" aria-label="素材编辑"' : 'role="menu"'}><a href="${escapeHtml(asset.sourceUrl)}" target="_blank" rel="noreferrer" ${editorOpen ? "" : 'role="menuitem"'}>${menuItemIcon(openOriginalIcon())}<span>打开原文</span></a><button data-action="asset-tag-editor" data-id="${escapeHtml(asset.id)}" type="button" ${editorOpen ? "" : 'role="menuitem"'}>${menuItemIcon(editTagIcon())}<span>编辑标签</span></button>${tagEditor}<button data-action="asset-toggle-used" data-id="${escapeHtml(asset.id)}" type="button" ${editorOpen ? "" : 'role="menuitem"'}>${menuItemIcon(usageStatusIcon(asset.usageStatus !== "used"))}<span>${asset.usageStatus === "used" ? "标记为未使用" : "标记为已使用"}</span></button><button class="is-destructive" data-action="asset-delete" data-id="${escapeHtml(asset.id)}" type="button" ${editorOpen ? "" : 'role="menuitem"'}>${menuItemIcon(deleteIcon())}<span>删除素材</span></button></div>` : "";
  const cover = asset.coverImageUrl
    ? `<a class="article-card-media asset-card-media" href="${escapeHtml(asset.sourceUrl)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(asset.coverImageUrl)}" alt="" /></a>`
    : `<span class="article-card-media asset-card-media asset-card-placeholder" aria-hidden="true">${documentIcon()}</span>`;
  return `<article class="article-post asset-post"><a class="article-avatar asset-avatar" href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(authorName)} 的 X 主页">${avatar}</a><div class="article-content"><div class="article-author asset-author"><strong>${escapeHtml(authorName)}${verifiedBadge(asset.authorVerificationType)}</strong><span class="article-handle">${escapeHtml(asset.authorHandle || "")}</span><span class="article-date">· ${escapeHtml(formatDate(asset.publishedAt))}</span><div class="asset-menu-anchor"><button class="article-more" data-action="asset-menu" data-id="${escapeHtml(asset.id)}" type="button" aria-label="素材操作" aria-expanded="${state.assetMenu === asset.id}">${moreIcon()}</button>${menu}</div></div><div class="article-card asset-card">${cover}<div class="article-card-body asset-card-body"><a class="asset-title" href="${escapeHtml(asset.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(asset.title)}</a>${tags ? `<div class="asset-tags-row" aria-label="标签">${tags}</div>` : ""}</div></div><footer class="asset-footer"><span class="asset-usage-status ${asset.usageStatus === "used" ? "is-used" : ""}">${asset.usageStatus === "used" ? "已使用" : "未使用"}</span><button class="asset-preview-action" data-action="asset-preview" data-id="${escapeHtml(asset.id)}" type="button">${previewMarkdownIcon()}<span>预览 Markdown</span></button></footer></div></article>`;
}

function renderAssets() {
  const query = state.assetQuery.trim().toLowerCase();
  const counts = {
    all: state.data.assets.length,
    unused: state.data.assets.filter((asset) => asset.usageStatus !== "used").length,
    used: state.data.assets.filter((asset) => asset.usageStatus === "used").length,
  };
  const assets = state.data.assets.filter((asset) => (state.assetFilter === "all" || asset.usageStatus === state.assetFilter) && (!query || `${asset.title} ${asset.authorName} ${asset.authorHandle} ${(asset.tags || []).join(" ")}`.toLowerCase().includes(query)));
  const tabs = [["all", "全部"], ["unused", "未使用"], ["used", "已使用"]].map(([key, label]) => `<button class="${state.assetFilter === key ? "is-active" : ""}" data-filter="${key}" type="button">${label}<span class="asset-filter-count" aria-hidden="true">${counts[key]}</span></button>`).join("");
  const dialogAsset = state.data.assets.find((asset) => asset.id === state.assetDialog);
  const dialog = dialogAsset ? `<div class="asset-dialog-backdrop"><section class="asset-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title"><h2 id="asset-dialog-title">删除素材？</h2><p>删除后无法恢复。</p><div class="asset-dialog-actions"><button class="secondary-button" data-action="asset-dialog-cancel" type="button">取消</button><button class="danger-button" data-action="asset-dialog-confirm" data-id="${escapeHtml(dialogAsset.id)}" type="button">删除</button></div></section></div>` : "";
  view.innerHTML = `<div class="asset-filters"><label class="panel-search"><span class="sr-only">搜索素材</span>${searchIcon()}<input data-asset-search type="search" placeholder="搜索标题、作者、@handle 或标签" value="${escapeHtml(state.assetQuery)}" aria-label="搜索素材"></label><div class="asset-filter-tabs" role="group" aria-label="素材分类">${tabs}</div></div>${assets.length ? assets.map(assetItem).join("") : '<p class="empty">还没有素材。请在 Article 原文页保存为素材。</p>'}${dialog}`;
}

function render() {
  document.querySelectorAll("[data-view]").forEach((tab) => {
    const active = tab.dataset.view === state.page;
    tab.classList.toggle("is-active", active);
    tab.toggleAttribute("aria-current", active);
  });
  document.title = `${{ readingList: "待读", assets: "素材库", authors: "作者" }[state.page]} · X to MD`;
  if (state.page === "readingList") renderReadingList();
  else if (state.page === "authors") renderAuthors();
  else renderAssets();
}

async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (result?.error) throw new Error(result.error);
  return result;
}

async function updateAsset(asset, patch) {
  await send({ type: "save-article-asset", assetId: asset.id, patch });
}

async function handleAction(action, target) {
  if (action === "reading-open") return;
  if (action === "reading-remove") {
    await send({ type: "remove-reading-article", sourceUrl: target.dataset.url });
    setStatus("已从待读移除");
    return;
  }
  if (action === "author-remove") {
    await send({ type: "remove-author", handle: target.dataset.handle });
    setStatus("已取消收藏作者");
    return;
  }
  const asset = state.data.assets.find((item) => item.id === target.dataset.id);
  if (action === "asset-menu") {
    const opening = state.assetMenu !== target.dataset.id;
    state.assetMenu = opening ? target.dataset.id : null;
    state.assetMenuPlacement = opening && target.getBoundingClientRect().bottom + 260 > window.innerHeight ? "up" : "down";
    render();
    return;
  }
  if (action === "asset-dialog-cancel") { state.assetDialog = null; render(); return; }
  if (action === "asset-dialog-confirm") {
    const selected = state.data.assets.find((item) => item.id === target.dataset.id);
    if (selected) await send({ type: "remove-article-asset", sourceUrl: selected.sourceUrl });
    state.assetDialog = null;
    setStatus("素材已删除");
    return;
  }
  if (!asset) return;
  if (action === "asset-preview") {
    await send({ type: "open-markdown-preview", capture: asset, canSave: false });
    return;
  }
  if (action === "asset-toggle-used") {
    await updateAsset(asset, { usageStatus: asset.usageStatus === "used" ? "unused" : "used" });
    state.assetMenu = null;
    return;
  }
  if (action === "asset-tag-editor") { state.assetTagEditor = state.assetTagEditor === asset.id ? null : asset.id; render(); return; }
  if (action === "asset-add-tag") {
    const input = target.closest(".asset-tag-editor")?.querySelector("[data-asset-tag-input]");
    const tag = input?.value.trim();
    if (!tag) { input?.focus(); return; }
    if ((asset.tags || []).some((value) => value.toLowerCase() === tag.toLowerCase())) { setStatus("标签已存在"); return; }
    await updateAsset(asset, { tags: [...(asset.tags || []), tag] });
    state.assetTagEditor = null;
    return;
  }
  if (action === "asset-remove-tag") {
    await updateAsset(asset, { tags: (asset.tags || []).filter((tag) => tag !== target.dataset.tag) });
    return;
  }
  if (action === "asset-delete") { state.assetDialog = asset.id; state.assetMenu = null; render(); }
}

document.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-view]");
  if (tab) { state.page = tab.dataset.view; state.assetMenu = null; render(); return; }
  const filter = event.target.closest("[data-filter]");
  if (filter) { state.assetFilter = filter.dataset.filter; renderAssets(); return; }
  const action = event.target.closest("[data-action]");
  if (!action) {
    if (state.assetMenu && !event.target.closest(".asset-menu")) { state.assetMenu = null; render(); }
    return;
  }
  try { await handleAction(action.dataset.action, action); }
  catch (error) { setStatus(error.message || "操作失败", "error"); }
});

view.addEventListener("input", (event) => {
  if (event.isComposing || event.target.dataset.composing === "true") return;
  const isAsset = event.target.matches("[data-asset-search]");
  const isReading = event.target.matches("[data-reading-search]");
  if (!isAsset && !isReading) return;
  const cursor = event.target.selectionStart;
  if (isAsset) { state.assetQuery = event.target.value; renderAssets(); }
  else { state.readingQuery = event.target.value; renderReadingList(); }
  const input = view.querySelector(isAsset ? "[data-asset-search]" : "[data-reading-search]");
  input?.focus();
  if (typeof cursor === "number") input?.setSelectionRange(cursor, cursor);
});

view.addEventListener("compositionstart", (event) => {
  if (event.target.matches("[data-asset-search], [data-reading-search], [data-asset-tag-input]")) event.target.dataset.composing = "true";
});

view.addEventListener("compositionend", (event) => {
  if (!event.target.matches("[data-asset-search], [data-reading-search], [data-asset-tag-input]")) return;
  event.target.dataset.composing = "false";
  if (!event.target.matches("[data-asset-tag-input]")) event.target.dispatchEvent(new Event("input", { bubbles: true }));
});

view.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches("[data-asset-tag-input]")) return;
  event.preventDefault();
  handleAction("asset-add-tag", event.target.closest(".asset-tag-editor")?.querySelector("[data-action='asset-add-tag']")).catch((error) => setStatus(error.message || "操作失败", "error"));
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (state.assetDialog) state.assetDialog = null;
  if (state.assetMenu) state.assetMenu = null;
  if (state.assetTagEditor) state.assetTagEditor = null;
  render();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "navigate-sidepanel" || !["readingList", "assets", "authors"].includes(message.view)) return;
  state.page = message.view;
  render();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;
  loadData().then(render).catch(() => {});
});

loadData().then(render).catch((error) => setStatus(error.message || "无法加载本地数据", "error"));
