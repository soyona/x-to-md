const STORAGE_KEY = "x-to-md-content-inbox";
const view = document.querySelector("#view");
const status = document.querySelector("#status");
const currentContext = document.querySelector("#current-context");
const pageHeader = document.querySelector(".page-header");
const pageTitle = document.querySelector("#page-title");
const backButton = document.querySelector(".back-button");

const state = {
  page: "candidates",
  data: { subscriptions: [], candidates: [], assets: [] },
  candidateSort: "addedAt",
  candidateQuery: "",
  candidateDate: "today",
  statsDate: "thisWeek",
  assetFilter: "all",
  assetQuery: "",
  candidateMenu: null,
  assetMenuPlacement: "down",
  assetTagEditor: null,
  assetDialog: null,
  currentContext: null,
};

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function formatDate(value) {
  if (!value) return "未记录";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
function setStatus(message = "", kind = "") {
  window.clearTimeout(setStatus.clearTimer);
  status.textContent = message;
  status.className = `status ${kind}`.trim();
  if (message && kind !== "error") setStatus.clearTimer = window.setTimeout(() => setStatus(), 3200);
}
function candidateId(candidate) {
  const source = articleId(candidate?.sourceUrl || "");
  return candidate?.id || `article_${source.split("/").pop() || "unknown"}`;
}
async function loadData() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  state.data = { ...state.data, ...(stored[STORAGE_KEY] || {}) };
  state.data.subscriptions ||= [];
  state.data.candidates ||= [];
  state.data.assets ||= [];
  state.data.candidates = state.data.candidates.map((candidate) => ({ ...candidate, id: candidateId(candidate) }));
}
async function saveData() { await chrome.storage.local.set({ [STORAGE_KEY]: state.data }); }
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}
function wait(milliseconds) { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)); }
async function sendToContent(tab, message) {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    const disconnected = /Could not establish connection|Receiving end does not exist/u.test(error?.message || "");
    if (!disconnected || !tab.id || !validX(tab.url)) throw error;
    setStatus("正在刷新当前 X 页面以连接扩展…");
    await chrome.tabs.reload(tab.id);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await wait(500);
      try {
        return await chrome.tabs.sendMessage(tab.id, message);
      } catch (retryError) {
        if (!/Could not establish connection|Receiving end does not exist/u.test(retryError?.message || "")) throw retryError;
      }
    }
    throw new Error("无法连接当前 X 页面。请刷新页面后重试。");
  }
}
function validX(url) { return /^https:\/\/(?:www\.)?(?:x|twitter)\.com\//u.test(url || ""); }
function contextLabel(context) {
  if (!context) return "正在读取当前页面…";
  if (context.pageKind === "article") return context.title || "当前 Article";
  if (context.pageKind === "author-articles") return `${context.authorHandle || "当前作者"} · Articles`;
  if (context.pageKind === "x-page") return "当前 X 页面";
  return "请打开 X 页面";
}
function renderCurrentContext() {
  currentContext.hidden = state.page === "subscriptions";
  if (currentContext.hidden) {
    currentContext.innerHTML = "";
    return;
  }
  const context = state.currentContext;
  if (!context || context.pageKind === "unsupported" || context.pageKind === "x-page") {
    currentContext.innerHTML = context?.pageKind === "unsupported" ? "<span>请打开 X 页面以使用当前内容操作</span>" : "";
    return;
  }
  if (context.pageKind === "author-articles") {
    currentContext.innerHTML = `<div><strong>${escapeHtml(context.authorHandle || "当前作者")}</strong><span>可在 X 原文中将 Article 加入收件箱</span></div>`;
    return;
  }
  const candidate = state.data.candidates.find((item) => articleId(item.sourceUrl) === articleId(context.candidateUrl || context.sourceUrl));
  const saved = state.data.assets.some((item) => articleId(item.sourceUrl) === articleId(context.sourceUrl));
  currentContext.innerHTML = `<div><strong>${escapeHtml(contextLabel(context))}</strong><span>${escapeHtml(context.authorHandle || "X Article")}</span></div><button class="primary-button" data-action="context-save" type="button" ${saved ? "disabled" : ""}>${saved ? "已保存" : "保存并复制 Markdown"}</button>${candidate ? `<small>当前候选 · ${escapeHtml(candidate.status === "new" ? "待处理" : candidate.status)}</small>` : ""}`;
}
async function refreshContext({ resetPage = true } = {}) {
  const tab = await activeTab();
  if (!tab?.id || !validX(tab.url)) {
    state.currentContext = { ok: true, pageKind: "unsupported", sourceUrl: tab?.url || "" };
  } else {
    try {
      state.currentContext = await sendToContent(tab, { type: "get-current-context" });
    } catch (error) {
      state.currentContext = { ok: false, pageKind: "x-page", sourceUrl: tab.url, error: error.message };
    }
  }
  if (resetPage && state.currentContext?.pageKind === "article") state.page = "candidates";
  renderCurrentContext();
  if (state.page === "assets") renderAssets();
}
function articleId(sourceUrl) { return sourceUrl.split(/[?#]/u)[0].replace(/\/$/u, ""); }
function timestamp(value) {
  const time = Date.parse(value || "");
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}
function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function shiftDate(date, days) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}
function dateRangeForFilter(filter = state.candidateDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (filter === "today") return { start: today, end: shiftDate(today, 1), label: "今日" };
  if (filter === "yesterday") return { start: shiftDate(today, -1), end: today, label: "昨日" };
  const mondayOffset = (today.getDay() + 6) % 7;
  const thisMonday = shiftDate(today, -mondayOffset);
  if (filter === "thisWeek") return { start: thisMonday, end: shiftDate(thisMonday, 7), label: "本周" };
  if (filter === "lastWeek") return { start: shiftDate(thisMonday, -7), end: thisMonday, label: "上周" };
  if (filter === "thisMonth") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start, end: new Date(today.getFullYear(), today.getMonth() + 1, 1), label: "本月" };
  }
  return { start: today, end: shiftDate(today, 1), label: "今日" };
}
function candidateInRange(candidate, range = dateRangeForFilter()) {
  const time = timestamp(candidate.addedAt);
  return time >= range.start.valueOf() && time < range.end.valueOf();
}
function candidateMatchesQuery(candidate) {
  const query = state.candidateQuery.trim().toLowerCase();
  if (!query) return true;
  return [candidate.title, candidate.authorName, candidate.authorHandle, candidate.sourceUrl]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}
function filteredCandidates() {
  return state.data.candidates
    .filter((candidate) => candidate.status !== "ignored" && candidate.status !== "saved")
    .filter(candidateMatchesQuery)
    .filter((candidate) => candidateInRange(candidate));
}
function activeCandidates() {
  return state.data.candidates.filter((candidate) => candidate.status !== "ignored" && candidate.status !== "saved");
}
function candidateCountForDate(filter) {
  const range = dateRangeForFilter(filter);
  return activeCandidates().filter((candidate) => candidateInRange(candidate, range)).length;
}
function chartData(filter = state.candidateDate) {
  const range = dateRangeForFilter(filter);
  const days = Math.max(1, Math.ceil((range.end - range.start) / 86400000));
  const counts = Array.from({ length: days }, () => 0);
  state.data.candidates.forEach((candidate) => {
    const time = timestamp(candidate.addedAt);
    if (time < range.start.valueOf() || time >= range.end.valueOf()) return;
    const index = Math.floor((time - range.start.valueOf()) / 86400000);
    if (index >= 0 && index < counts.length) counts[index] += 1;
  });
  return { range, counts };
}
function chartLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
function renderStatsChart() {
  const { range, counts } = chartData(state.statsDate);
  const max = Math.max(1, ...counts);
  const width = 360;
  const height = 128;
  const left = 30;
  const right = 8;
  const top = 10;
  const bottom = 28;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const points = counts.map((count, index) => {
    const x = counts.length === 1 ? left + plotWidth / 2 : left + (index / (counts.length - 1)) * plotWidth;
    const y = top + plotHeight - (count / max) * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const labelIndexes = [...new Set([0, Math.floor((counts.length - 1) / 2), counts.length - 1])];
  const labels = labelIndexes.map((index) => {
    const date = new Date(range.start);
    date.setDate(date.getDate() + index);
    const x = counts.length === 1 ? left + plotWidth / 2 : left + (index / (counts.length - 1)) * plotWidth;
    return `<text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="middle">${escapeHtml(chartLabel(date))}</text>`;
  }).join("");
  const total = counts.reduce((sum, count) => sum + count, 0);
  const summary = counts.map((count, index) => `${chartLabel(new Date(range.start.getTime() + index * 86400000))} ${count} 篇`).join("，");
  return `<section class="stats-chart candidate-chart" aria-label="${escapeHtml(range.label)}新增候选趋势"><div class="stats-chart-heading"><strong>新增候选趋势</strong><span>${escapeHtml(range.label)} · ${total} 篇</span></div><p class="stats-chart-summary">${escapeHtml(summary || "暂无数据")}</p><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="按添加日期统计文章数量"><line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line class="chart-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/><text class="chart-y-label" x="4" y="${top + 4}">${max}</text><text class="chart-y-label" x="14" y="${height - bottom + 4}">0</text><polyline class="chart-line" points="${points}"/>${labels}</svg></section>`;
}
function sortedCandidates(candidates) {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const field = state.candidateSort === "publishedAt" ? "publishedAt" : "addedAt";
      const difference = timestamp(right.candidate[field]) - timestamp(left.candidate[field]);
      if (difference) return difference;
      if (field === "publishedAt") {
        const addedDifference = timestamp(right.candidate.addedAt) - timestamp(left.candidate.addedAt);
        if (addedDifference) return addedDifference;
      }
      return right.index - left.index;
    })
    .map(({ candidate }) => candidate);
}
function avatarLabel(candidate) {
  const name = candidate.authorName || candidate.authorHandle || "X";
  return Array.from(name.replace(/^@/u, "").trim()).slice(0, 2).join("").toUpperCase();
}
function profileUrl(handle) {
  const normalizedHandle = String(handle || "").replace(/^@/u, "").trim();
  return normalizedHandle ? `https://x.com/${encodeURIComponent(normalizedHandle)}` : "";
}
function copyIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5h10v13h-10zM5.5 18.5h-1v-13h10v1"/></svg>';
}
function moreIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6.5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6.5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>';
}
function searchIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.25 3.75a6.5 6.5 0 1 0 5.262 10.324l4.781 4.781 1.414-1.414-4.781-4.781A6.5 6.5 0 0 0 10.25 3.75z"/></svg>';
}
function tagIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13.5 13.5 20.5l-10-10v-7h7zM8 8h.01"/></svg>';
}
function usedIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7.5"/></svg>';
}
function addIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
}
function xIcon(icon) {
  if (!icon?.paths?.length) return "";
  return `<svg class="article-icon" viewBox="${escapeHtml(icon.viewBox)}" aria-hidden="true">${icon.paths.map((path) => `<path d="${escapeHtml(path)}"></path>`).join("")}</svg>`;
}
function verifiedBadge() {
  return `<span class="verified-badge article-verified" role="img" aria-label="Verified account"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.25 12c0-1.43-.88-2.67-2.11-3.2.44-1.29.1-2.75-.92-3.77-1.01-1.01-2.48-1.36-3.77-.91C14.92 2.88 13.68 2 12.25 2s-2.67.88-3.2 2.12c-1.29-.45-2.75-.1-3.77.91-1.01 1.02-1.36 2.48-.91 3.77-1.24.53-2.12 1.77-2.12 3.2s.88 2.67 2.12 3.2c-.45 1.29-.1 2.75.91 3.77 1.02 1.01 2.48 1.36 3.77.91.53 1.24 1.77 2.12 3.2 2.12s2.67-.88 3.2-2.12c1.29.45 2.76.1 3.77-.91 1.02-1.02 1.36-2.48.92-3.77 1.23-.53 2.11-1.77 2.11-3.2zm-11.71 4.2-3.38-3.37 1.41-1.42 1.97 1.98 4.86-4.86 1.41 1.42-6.27 6.25z"></path></svg></span>`;
}
function snapshotMetric(snapshot, key) {
  const item = snapshot?.[key];
  return `<span class="article-engagement-item article-engagement-${key}" aria-hidden="true"><span class="article-action-icon">${xIcon(item)}</span>${item?.count ? `<span>${escapeHtml(item.count)}</span>` : ""}</span>`;
}
function snapshotAction(snapshot, key) {
  return `<span class="article-snapshot-action article-snapshot-${key}" aria-hidden="true">${xIcon(snapshot?.[key])}</span>`;
}
function candidateCell(candidate) {
  const statusLabel = { new: "新发现", viewed: "已查看", extracted: "已提取", ignored: "已从收件箱移除", saved: "已保存素材" }[candidate.status] || "新发现";
  const authorName = candidate.authorName || candidate.authorHandle || "未知作者";
  const avatar = candidate.authorAvatarUrl ? `<img src="${escapeHtml(candidate.authorAvatarUrl)}" alt="" />` : escapeHtml(avatarLabel(candidate));
  const verified = candidate.authorVerified ? verifiedBadge() : "";
  const media = candidate.coverImageUrl ? `<span class="article-card-media"><img src="${escapeHtml(candidate.coverImageUrl)}" alt="" /><span class="article-card-badge">𝕏 Article</span></span>` : "";
  const excerpt = candidate.previewExcerpt ? `<span class="article-card-excerpt">${escapeHtml(candidate.previewExcerpt)}</span>` : "";
  const snapshot = candidate.engagementSnapshot || {};
  const engagementLabel = ["reply", "repost", "like", "views"].map((key) => snapshot[key]?.count ? `${key} ${snapshot[key].count}` : "").filter(Boolean).join("，") || "暂无互动数据";
  const metrics = ["reply", "repost", "like", "views"].map((key) => snapshotMetric(snapshot, key)).join("");
  const utility = xIcon(candidate.utilityIconSnapshot);
  const removeButton = `<button class="article-inbox-remove" data-action="candidate-remove" data-id="${escapeHtml(candidate.id)}" type="button" aria-label="从收件箱移除" title="从收件箱移除" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z"></path></svg></button>`;
  return `<article class="article-post" data-candidate="${escapeHtml(candidate.id)}" data-source-url="${escapeHtml(articleId(candidate.sourceUrl))}"><span class="sr-only">${escapeHtml(statusLabel)}</span><div class="article-avatar" aria-hidden="true">${avatar}</div><div class="article-content"><div class="article-author"><strong><span class="article-author-name">${escapeHtml(authorName)}</span>${verified}</strong><span class="article-handle">${escapeHtml(candidate.authorHandle || "")}</span><span class="article-date">· ${escapeHtml(formatDate(candidate.publishedAt))}</span><span class="article-author-actions" aria-hidden="true"><span class="article-utility-slot">${utility}</span><span class="article-overflow-slot"></span></span></div><a class="article-card" data-action="candidate-open" data-id="${escapeHtml(candidate.id)}" href="${escapeHtml(candidate.sourceUrl)}" target="_blank" rel="noreferrer">${media}<span class="article-card-body"><strong>${escapeHtml(candidate.title)}</strong>${excerpt}</span></a><div class="article-engagement" role="group" aria-label="${escapeHtml(engagementLabel)}"><span class="article-engagement-metrics">${metrics}</span><span class="article-engagement-actions">${removeButton}${snapshotAction(snapshot, "bookmark")}${snapshotAction(snapshot, "share")}</span></div></div></article>`;
}
function renderCandidates() {
  const candidates = sortedCandidates(filteredCandidates());
  const total = activeCandidates().length;
  const hasCandidates = total > 0;
  const dates = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth"];
  const dateTabs = dates.map((date) => {
    const label = dateRangeForFilter(date).label;
    const count = candidateCountForDate(date);
    return `<button class="${state.candidateDate === date ? "is-active" : ""}" data-candidate-date="${date}" type="button" aria-label="${label} ${count} 篇">${label}<span class="candidate-date-count" aria-hidden="true">${count}</span></button>`;
  }).join("");
  const filters = `<div class="candidate-filters"><label class="panel-search"><span class="sr-only">搜索收件箱</span>${searchIcon()}<input data-candidate-search type="search" placeholder="搜索标题、作者或 @handle" value="${escapeHtml(state.candidateQuery)}" aria-label="搜索收件箱"></label><div class="candidate-date-row"><div class="candidate-date-tabs" role="group" aria-label="收件箱日期筛选">${dateTabs}</div><div class="candidate-sort" role="group" aria-label="收件箱排序"><button class="${state.candidateSort === "addedAt" ? "is-active" : ""}" data-candidate-sort="addedAt" type="button">最近添加</button><button class="${state.candidateSort === "publishedAt" ? "is-active" : ""}" data-candidate-sort="publishedAt" type="button">最新发表</button></div></div></div>`;
  const emptyMessage = hasCandidates ? "当前筛选条件下没有匹配的 Article。" : "还没有候选 Article。前往关注作者，打开作者的 Articles 页面并手动获取。";
  view.innerHTML = `${filters}${candidates.length ? candidates.map(candidateCell).join("") : `<p class="empty">${emptyMessage}</p>`}`;
}
function subscriptionCell(subscription) {
  const name = subscription.displayName || subscription.handle;
  const profileUrl = `https://x.com/${String(subscription.handle || "").replace(/^@/u, "")}`;
  const verified = subscription.authorVerified ? verifiedBadge() : "";
  const avatar = subscription.authorAvatarUrl
    ? `<img src="${escapeHtml(subscription.authorAvatarUrl)}" alt="" />`
    : escapeHtml(avatarLabel({ authorName: name, authorHandle: subscription.handle }));
  const description = subscription.description ? `<p class="author-description">${escapeHtml(subscription.description)}</p>` : "";
  return `<article class="author-cell" data-subscription="${escapeHtml(subscription.id)}"><a class="author-profile-link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(subscription.handle)} on X"><div class="author-avatar" aria-hidden="true">${avatar}</div><div class="author-content"><div class="author-identity"><strong>${escapeHtml(name)}${verified}</strong><span>${escapeHtml(subscription.handle)}</span></div>${description}</div></a><button class="follow-button is-following" data-action="subscription-unfollow" data-id="${escapeHtml(subscription.id)}" type="button" aria-label="unfollow ${escapeHtml(subscription.handle)}"><span class="following-label">Following</span><span class="unfollow-label">unfollow</span></button></article>`;
}
function renderSubscriptions() {
  view.innerHTML = state.data.subscriptions.length
    ? state.data.subscriptions.map(subscriptionCell).join("")
    : `<p class="empty">还没有关注作者。在 X 的 Follow 或 Following 按钮上悬停后点击“Follow”。</p>`;
}
function renderAssets() {
  const query = state.assetQuery.trim().toLowerCase();
  const assetCounts = {
    all: state.data.assets.length,
    unused: state.data.assets.filter((asset) => asset.usageStatus === "unused").length,
    used: state.data.assets.filter((asset) => asset.usageStatus === "used").length,
  };
  const assets = state.data.assets.filter((asset) => (state.assetFilter === "all" || (state.assetFilter === "unused" && asset.usageStatus === "unused") || (state.assetFilter === "used" && asset.usageStatus === "used")) && (!query || `${asset.title} ${asset.authorName} ${asset.authorHandle} ${asset.tags?.join(" ")}`.toLowerCase().includes(query)));
  const assetCell = (asset) => {
    const authorName = asset.authorName || asset.authorHandle || "未知作者";
    const authorProfileUrl = profileUrl(asset.authorHandle);
    const avatar = asset.authorAvatarUrl
      ? `<img src="${escapeHtml(asset.authorAvatarUrl)}" alt="" />`
      : escapeHtml(avatarLabel(asset));
    const authorNameMarkup = authorProfileUrl
      ? `<a href="${escapeHtml(authorProfileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(authorName)}</a>`
      : `<span>${escapeHtml(authorName)}</span>`;
    const authorHandleMarkup = asset.authorHandle && asset.authorHandle !== authorName
      ? authorProfileUrl ? `<a href="${escapeHtml(authorProfileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(asset.authorHandle)}</a>` : `<span>${escapeHtml(asset.authorHandle)}</span>`
      : "";
    const cover = asset.coverImageUrl
      ? `<img src="${escapeHtml(asset.coverImageUrl)}" alt="" />`
      : `<span class="asset-cover-placeholder" aria-hidden="true">𝕏<br>Article</span>`;
    const fallbackExcerpt = !asset.coverImageUrl && asset.previewExcerpt ? `<p class="asset-excerpt">${escapeHtml(asset.previewExcerpt)}</p>` : "";
    const verified = asset.authorVerified ? verifiedBadge() : "";
    const tags = (asset.tags || []).map((tag) => `<span class="asset-tag"><span>${escapeHtml(tag)}</span><button data-action="asset-remove-tag" data-id="${escapeHtml(asset.id)}" data-tag="${escapeHtml(tag)}" type="button" aria-label="删除标签 ${escapeHtml(tag)}" title="删除标签">×</button></span>`).join("");
    const menu = state.candidateMenu === asset.id ? `<div class="candidate-menu asset-menu ${state.assetMenuPlacement === "up" ? "is-up" : ""}" role="menu"><button data-action="asset-delete" data-id="${escapeHtml(asset.id)}" type="button" role="menuitem">删除素材</button></div>` : "";
    const avatarMarkup = authorProfileUrl
      ? `<a class="asset-avatar" href="${escapeHtml(authorProfileUrl)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(authorName)} 的 X 主页">${avatar}</a>`
      : `<div class="asset-avatar" aria-hidden="true">${avatar}</div>`;
    const tagEditor = state.assetTagEditor === asset.id ? `<div class="asset-tag-editor"><input data-asset-tag-input data-id="${escapeHtml(asset.id)}" type="text" placeholder="输入标签后回车" aria-label="添加标签"><button class="asset-icon-button" data-action="asset-add-tag" data-id="${escapeHtml(asset.id)}" type="button" aria-label="确认添加标签" title="确认添加标签">${addIcon()}</button></div>` : "";
    return `<article class="asset-cell"><a class="asset-cover" href="${escapeHtml(asset.sourceUrl)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(asset.title)} 原文">${cover}</a><div class="asset-content"><div class="asset-heading">${avatarMarkup}<div class="asset-heading-copy"><a class="asset-title" href="${escapeHtml(asset.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(asset.title)}</a><div class="asset-byline">${authorNameMarkup}${verified}${authorHandleMarkup}${asset.publishedAt ? `<span>· 发布于 ${escapeHtml(formatDate(asset.publishedAt))}</span>` : ""}</div></div><div class="asset-menu-anchor"><button class="article-more" data-action="asset-menu" data-id="${escapeHtml(asset.id)}" type="button" aria-label="素材操作" aria-expanded="${state.candidateMenu === asset.id}">${moreIcon()}</button>${menu}</div></div>${fallbackExcerpt}<div class="asset-meta"><span>${asset.usageStatus === "used" ? "已用于创作" : "未使用"}</span><span>保存于 ${escapeHtml(formatDate(asset.createdAt))}</span></div>${tags || tagEditor ? `<div class="asset-tags-row" aria-label="标签">${tags}${tagEditor}</div>` : ""}<div class="cell-actions"><button class="asset-icon-button" data-action="asset-copy" data-id="${escapeHtml(asset.id)}" type="button" aria-label="复制 Markdown" title="复制 Markdown">${copyIcon()}</button><button class="asset-icon-button ${asset.usageStatus === "used" ? "is-active" : ""}" data-action="asset-toggle-used" data-id="${escapeHtml(asset.id)}" type="button" aria-label="${asset.usageStatus === "used" ? "标记未使用" : "标记已用于创作"}" title="${asset.usageStatus === "used" ? "标记未使用" : "标记已用于创作"}">${usedIcon()}</button><button class="asset-icon-button ${state.assetTagEditor === asset.id ? "is-active" : ""}" data-action="asset-tag-editor" data-id="${escapeHtml(asset.id)}" type="button" aria-label="添加标签" title="添加标签">${tagIcon()}</button></div></div></article>`;
  };
  const dialogAsset = state.data.assets.find((asset) => asset.id === state.assetDialog?.id);
  const dialog = dialogAsset ? `<div class="asset-dialog-backdrop"><section class="asset-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title"><h2 id="asset-dialog-title">删除素材？</h2><p>删除后无法恢复。</p><div class="asset-dialog-actions"><button class="secondary-button" data-action="asset-dialog-cancel" type="button">取消</button><button class="danger-button" data-action="asset-dialog-confirm" data-id="${escapeHtml(dialogAsset.id)}" type="button">删除</button></div></section></div>` : "";
  const assetTabs = [["all", "全部"], ["unused", "未使用"], ["used", "已用于创作"]].map(([filter, label]) => `<button class="filter-tab ${state.assetFilter === filter ? "is-active" : ""}" data-filter="${filter}" type="button" aria-label="${label} ${assetCounts[filter]} 篇">${label}<span class="candidate-date-count" aria-hidden="true">${assetCounts[filter]}</span></button>`).join("");
  view.innerHTML = `<div class="context"><span>只保存你主动确认的 Markdown</span>${state.currentContext?.pageKind === "article" ? `<button class="link-button" data-action="save-current" type="button">保存并复制 Markdown</button>` : ""}</div><div class="asset-filters"><label class="panel-search"><span class="sr-only">搜索素材</span>${searchIcon()}<input data-asset-search type="search" placeholder="搜索标题、作者、@handle 或标签" value="${escapeHtml(state.assetQuery)}" aria-label="搜索素材"></label></div><div class="tabs">${assetTabs}</div>${assets.length ? assets.map(assetCell).join("") : `<p class="empty">还没有已保存的素材。完成“保存并复制 Markdown”后，素材会出现在这里。</p>`}${dialog}`;
}
function renderStats() {
  const range = dateRangeForFilter(state.statsDate);
  const { counts } = chartData(state.statsDate);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const pending = activeCandidates().length;
  const dates = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth"];
  const dateTabs = dates.map((date) => `<button class="stats-date-tab ${state.statsDate === date ? "is-active" : ""}" data-stats-date="${date}" type="button">${dateRangeForFilter(date).label}</button>`).join("");
  view.innerHTML = `<div class="stats-filters" role="group" aria-label="统计日期范围">${dateTabs}</div><section class="stats-summary" aria-label="统计摘要"><div><span>本范围新增</span><strong>${total}</strong><small>${escapeHtml(range.label)}</small></div><div><span>当前待处理</span><strong>${pending}</strong><small>未移除或未保存</small></div></section>${total ? renderStatsChart() : `<p class="empty stats-empty">${escapeHtml(range.label)}还没有新增 Article。</p>`}`;
}
function render() {
  document.querySelectorAll("[data-view]").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === state.page));
  pageHeader.hidden = ["candidates", "subscriptions", "assets"].includes(state.page);
  pageTitle.textContent = { candidates: "收件箱", subscriptions: "关注作者", assets: "素材库", stats: "统计" }[state.page] || "收件箱";
  if (state.page === "candidates") renderCandidates();
  else if (state.page === "subscriptions") renderSubscriptions();
  else if (state.page === "stats") renderStats();
  else renderAssets();
  renderCurrentContext();
}
async function saveCurrentExtraction(expectedCandidate = null) {
  const tab = await activeTab();
  if (!tab?.id || !validX(tab.url)) throw new Error("请先打开要保存的 X 原文。");
  if (expectedCandidate && articleId(tab.url) !== articleId(expectedCandidate.sourceUrl)) throw new Error("请先打开此候选的 X 原文。");
  const capture = await sendToContent(tab, { type: "capture-current-for-sidepanel" });
  if (capture?.error) throw new Error(capture.error || "无法读取当前 X 内容。");
  await navigator.clipboard.writeText(capture.content || "");
  const result = await chrome.runtime.sendMessage({ type: "save-capture-to-library", capture });
  if (result?.error) throw new Error(result.error);
  await loadData();
  setStatus(result?.existing ? "该素材已在素材库中，Markdown 已复制" : "已保存并复制 Markdown");
  render();
  await refreshContext({ resetPage: false });
}
async function handleAction(action, target) {
  const idValue = target.dataset.id;
  if (action === "subscription-unfollow") {
    state.data.subscriptions = state.data.subscriptions.filter((item) => item.id !== idValue);
    await saveData();
    render();
    setStatus("已取消关注");
    return;
  }
  const sourceUrl = target.closest("[data-source-url]")?.dataset.sourceUrl;
  const candidate = state.data.candidates.find((item) => item.id === idValue)
    || state.data.candidates.find((item) => articleId(item.sourceUrl) === sourceUrl);
  if (candidate && action === "candidate-open") { candidate.status = candidate.status === "new" ? "viewed" : candidate.status; await saveData(); window.open(candidate.sourceUrl, "_blank"); return render(); }
  if (candidate && action === "candidate-remove") {
    candidate.status = "ignored";
    await saveData(); render(); setStatus("已从收件箱移除");
    return;
  }
  const asset = state.data.assets.find((item) => item.id === idValue);
  if (action === "save-current" || action === "context-save") return saveCurrentExtraction();
  if (action === "asset-menu") {
    const opens = state.candidateMenu !== idValue;
    state.candidateMenu = opens ? idValue : null;
    state.assetMenuPlacement = opens && target.getBoundingClientRect().bottom + 150 > window.innerHeight ? "up" : "down";
    return render();
  }
  if (action === "asset-dialog-cancel") { state.assetDialog = null; return render(); }
  if (action === "asset-dialog-confirm") {
    const dialogAsset = state.data.assets.find((item) => item.id === idValue);
    if (!dialogAsset || !state.assetDialog) return;
    state.data.assets = state.data.assets.filter((item) => item.id !== idValue);
    state.assetDialog = null;
    state.candidateMenu = null;
    await saveData();
    return render();
  }
  if (!asset) return;
  if (action === "asset-copy") { await navigator.clipboard.writeText(asset.markdown); setStatus("Markdown 已复制"); }
  if (action === "asset-toggle-used") { asset.usageStatus = asset.usageStatus === "used" ? "unused" : "used"; asset.updatedAt = new Date().toISOString(); state.candidateMenu = null; await saveData(); return render(); }
  if (action === "asset-tag-editor") { state.assetTagEditor = state.assetTagEditor === asset.id ? null : asset.id; return render(); }
  if (action === "asset-add-tag") {
    const input = target.closest(".asset-tag-editor")?.querySelector("[data-asset-tag-input]");
    const tag = input?.value.trim();
    if (!tag) { input?.focus(); return; }
    const tags = asset.tags || [];
    if (tags.some((value) => value.toLowerCase() === tag.toLowerCase())) { setStatus("标签已存在"); input?.focus(); return; }
    asset.tags = [...tags, tag];
    asset.updatedAt = new Date().toISOString();
    state.assetTagEditor = null;
    await saveData();
    return render();
  }
  if (action === "asset-remove-tag") {
    asset.tags = (asset.tags || []).filter((tag) => tag !== target.dataset.tag);
    asset.updatedAt = new Date().toISOString();
    await saveData();
    return render();
  }
  if (action === "asset-delete") { state.assetDialog = { id: asset.id, type: "delete" }; state.candidateMenu = null; return render(); }
}

document.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { state.page = viewButton.dataset.view; render(); return; }
  const candidateSort = event.target.closest("[data-candidate-sort]");
  if (candidateSort) { state.candidateSort = candidateSort.dataset.candidateSort; renderCandidates(); return; }
  const candidateDate = event.target.closest("[data-candidate-date]");
  if (candidateDate) { state.candidateDate = candidateDate.dataset.candidateDate; renderCandidates(); return; }
  const statsDate = event.target.closest("[data-stats-date]");
  if (statsDate) { state.statsDate = statsDate.dataset.statsDate; renderStats(); return; }
  const filter = event.target.closest("[data-filter]");
  if (filter) { state.assetFilter = filter.dataset.filter; render(); return; }
  const action = event.target.closest("[data-action]");
  if (!action) {
    if (state.candidateMenu && !event.target.closest(".candidate-menu")) { state.candidateMenu = null; render(); }
    return;
  }
  if (action.dataset.action === "candidate-open") event.preventDefault();
  try {
    await handleAction(action.dataset.action, action);
  } catch (error) { setStatus(error.message || "操作失败", "error"); }
});
backButton.addEventListener("click", () => { if (state.page !== "candidates") { state.page = "candidates"; render(); } });
view.addEventListener("input", (event) => {
  if (event.isComposing || event.target.dataset.composing === "true") return;
  if (event.target.matches("[data-asset-search]")) {
    const cursor = event.target.selectionStart;
    state.assetQuery = event.target.value;
    renderAssets();
    const search = view.querySelector("[data-asset-search]");
    search?.focus();
    if (typeof cursor === "number") search?.setSelectionRange(cursor, cursor);
  }
  if (event.target.matches("[data-candidate-search]")) {
    const cursor = event.target.selectionStart;
    state.candidateQuery = event.target.value;
    renderCandidates();
    const search = view.querySelector("[data-candidate-search]");
    search?.focus();
    if (typeof cursor === "number") search?.setSelectionRange(cursor, cursor);
  }
});
view.addEventListener("compositionstart", (event) => {
  if (event.target.matches("[data-asset-search], [data-candidate-search]")) event.target.dataset.composing = "true";
});
view.addEventListener("compositionend", (event) => {
  if (!event.target.matches("[data-asset-search], [data-candidate-search]")) return;
  event.target.dataset.composing = "false";
  event.target.dispatchEvent(new Event("input", { bubbles: true }));
});
view.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches("[data-asset-tag-input]")) return;
  event.preventDefault();
  handleAction("asset-add-tag", event.target.closest(".asset-tag-editor")?.querySelector("[data-action='asset-add-tag']")).catch((error) => setStatus(error.message || "操作失败", "error"));
});
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "capture-completed" || !message.sourceUrl) return;
  const candidate = state.data.candidates.find((item) => articleId(item.sourceUrl) === articleId(message.sourceUrl));
  if (!candidate || candidate.status === "saved") return;
  candidate.status = "extracted";
  saveData().then(() => { if (state.page === "candidates") render(); setStatus("候选已标记为已提取"); }).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;
  loadData().then(() => render()).catch(() => {});
});
chrome.tabs.onActivated?.addListener(() => refreshContext({ resetPage: false }).catch(() => {}));
chrome.tabs.onUpdated?.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === "complete") refreshContext({ resetPage: false }).catch(() => {});
});
loadData().then(async () => { render(); await refreshContext(); }).catch((error) => setStatus(error.message || "无法加载本地数据", "error"));
