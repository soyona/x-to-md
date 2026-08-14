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

function verifiedBadge() {
  return '<span class="verified-badge article-verified" aria-label="Verified account"><svg viewBox="0 0 22 22" aria-hidden="true"><path d="M20.396 11c0-.946-.688-1.71-1.588-1.882.516-.756.444-1.81-.216-2.472-.66-.66-1.716-.732-2.472-.216-.172-.9-.936-1.588-1.882-1.588-.346 0-.67.096-.946.256C12.982 4.44 12.28 4 11.5 4s-1.482.44-1.792 1.098a1.92 1.92 0 0 0-.946-.256c-.946 0-1.71.688-1.882 1.588-.756-.516-1.812-.444-2.472.216-.66.662-.732 1.716-.216 2.472-.9.172-1.588.936-1.588 1.882s.688 1.71 1.588 1.882c-.516.756-.444 1.81.216 2.472.66.66 1.716.732 2.472.216.172.9.936 1.588 1.882 1.588.346 0 .67-.096.946-.256C10.018 17.56 10.72 18 11.5 18s1.482-.44 1.792-1.098c.276.16.6.256.946.256.946 0 1.71-.688 1.882-1.588.756.516 1.812.444 2.472-.216.66-.662.732-1.716.216-2.472.9-.172 1.588-.936 1.588-1.882zm-10.46 3.2-3.5-3.5 1.42-1.4 2.08 2.08 5.2-5.18 1.4 1.4-6.6 6.6z"/></svg></span>';
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

function readingItem(item) {
  const authorName = item.authorName || item.authorHandle || "未知作者";
  const profileUrl = authorProfileUrl(item.authorHandle);
  const avatar = item.authorAvatarUrl ? `<img src="${escapeHtml(item.authorAvatarUrl)}" alt="" />` : escapeHtml(avatarLabel(item));
  const cover = item.coverImageUrl
    ? `<span class="article-card-media"><img src="${escapeHtml(item.coverImageUrl)}" alt="" /><span class="article-card-badge">𝕏 Article</span></span>`
    : "";
  const excerpt = item.previewExcerpt ? `<span class="article-card-excerpt">${escapeHtml(item.previewExcerpt)}</span>` : "";
  return `<article class="article-post" data-source-url="${escapeHtml(normalizedSourceUrl(item.sourceUrl))}"><a class="article-avatar" href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(authorName)} 的 X 主页">${avatar}</a><div class="article-content"><div class="article-author"><strong>${escapeHtml(authorName)}${item.authorVerified ? verifiedBadge() : ""}</strong><span class="article-handle">${escapeHtml(item.authorHandle || "")}</span><span class="article-date">· ${escapeHtml(formatDate(item.publishedAt))}</span></div><a class="article-card" data-action="reading-open" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">${cover}<span class="article-card-body"><strong>${escapeHtml(item.title || "Untitled Article")}</strong>${excerpt}</span></a><footer class="article-engagement"><span class="reading-added-at">加入于 ${escapeHtml(formatDate(item.addedAt))}</span><button class="article-inbox-remove" data-action="reading-remove" data-url="${escapeHtml(item.sourceUrl)}" type="button" aria-label="从待读移除" title="从待读移除"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5h17l-2 12.5H5.5L3.5 5.5zm2.7 2 1.1 7h9.4l1.1-7H6.2zM8 3h8v2H8z"/><path d="M9 11h6v2H9z"/></svg></button></footer></div></article>`;
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
  return `<article class="author-cell"><a class="author-profile-link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(name)} 的 Articles"><div class="author-avatar" aria-hidden="true">${avatar}</div><div class="author-content"><div class="author-identity"><strong>${escapeHtml(name)}${author.authorVerified ? verifiedBadge() : ""}</strong><span>@${escapeHtml(author.handle.replace(/^@/u, ""))}</span></div>${description}</div></a><button class="author-remove-button" data-action="author-remove" data-handle="${escapeHtml(author.handle)}" type="button">取消收藏</button></article>`;
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
  const menu = state.assetMenu === asset.id ? `<div class="asset-menu ${state.assetMenuPlacement === "up" ? "is-up" : ""}" ${editorOpen ? 'role="dialog" aria-label="素材编辑"' : 'role="menu"'}><a href="${escapeHtml(asset.sourceUrl)}" target="_blank" rel="noreferrer" ${editorOpen ? "" : 'role="menuitem"'}>打开原文</a><button data-action="asset-tag-editor" data-id="${escapeHtml(asset.id)}" type="button" ${editorOpen ? "" : 'role="menuitem"'}>编辑标签</button>${tagEditor}<button data-action="asset-toggle-used" data-id="${escapeHtml(asset.id)}" type="button" ${editorOpen ? "" : 'role="menuitem"'}>${asset.usageStatus === "used" ? "标记为未使用" : "标记为已使用"}</button><button data-action="asset-delete" data-id="${escapeHtml(asset.id)}" type="button" ${editorOpen ? "" : 'role="menuitem"'}>删除素材</button></div>` : "";
  const cover = asset.coverImageUrl
    ? `<a class="article-card-media asset-card-media" href="${escapeHtml(asset.sourceUrl)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(asset.coverImageUrl)}" alt="" /></a>`
    : `<span class="article-card-media asset-card-media asset-card-placeholder" aria-hidden="true">${documentIcon()}</span>`;
  return `<article class="article-post asset-post"><a class="article-avatar asset-avatar" href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(authorName)} 的 X 主页">${avatar}</a><div class="article-content"><div class="article-author asset-author"><strong>${escapeHtml(authorName)}${asset.authorVerified ? verifiedBadge() : ""}</strong><span class="article-handle">${escapeHtml(asset.authorHandle || "")}</span><span class="article-date">· ${escapeHtml(formatDate(asset.publishedAt))}</span><div class="asset-menu-anchor"><button class="article-more" data-action="asset-menu" data-id="${escapeHtml(asset.id)}" type="button" aria-label="素材操作" aria-expanded="${state.assetMenu === asset.id}">${moreIcon()}</button>${menu}</div></div><div class="article-card asset-card">${cover}<div class="article-card-body asset-card-body"><a class="asset-title" href="${escapeHtml(asset.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(asset.title)}</a>${tags ? `<div class="asset-tags-row" aria-label="标签">${tags}</div>` : ""}</div></div><footer class="asset-footer"><span class="asset-usage-status ${asset.usageStatus === "used" ? "is-used" : ""}">${asset.usageStatus === "used" ? "已使用" : "未使用"}</span><button class="asset-preview-action" data-action="asset-preview" data-id="${escapeHtml(asset.id)}" type="button">预览 Markdown</button></footer></div></article>`;
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
