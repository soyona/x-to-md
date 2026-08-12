const STORAGE_KEY = "x-to-md-content-inbox";
const NAVIGATION_BADGES_STORAGE_KEY = "x-to-md-navigation-badges";
const NAVIGATION_LAYOUT_STORAGE_KEY = "x-to-md-navigation-layout";
const view = document.querySelector("#view");
const status = document.querySelector("#status");
const pageHeader = document.querySelector(".page-header");
const pageTitle = document.querySelector("#page-title");
const backButton = document.querySelector(".back-button");
const app = document.querySelector("#app");

const state = {
  page: "candidates",
  data: { subscriptions: [], candidates: [], assets: [] },
  badgeSeenAt: null,
  candidateSort: "addedAt",
  candidateQuery: "",
  candidateDate: "today",
  statsDate: "thisWeek",
  assetFilter: "all",
  assetQuery: "",
  candidateMenu: null,
  assetMenuPlacement: "down",
  assetTagEditor: null,
  assetPublishDialog: null,
  assetPublishDraft: "",
  assetPublishError: "",
  assetDialog: null,
  assetImageDialog: null,
  navigationPlacement: "left",
  lastVisibleNavigationPlacement: "left",
};

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function formatDate(value) {
  if (!value) return "未记录";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : `${date.getMonth() + 1}/${date.getDate()}`;
}
function setStatus(message = "", kind = "") {
  window.clearTimeout(setStatus.clearTimer);
  status.textContent = message;
  status.className = `status ${kind}`.trim();
  if (message) setStatus.clearTimer = window.setTimeout(() => setStatus(), 3200);
}
function candidateId(candidate) {
  const source = articleId(candidate?.sourceUrl || "");
  return candidate?.id || `article_${source.split("/").pop() || "unknown"}`;
}
async function loadData() {
  const stored = await chrome.storage.local.get([STORAGE_KEY, NAVIGATION_BADGES_STORAGE_KEY, NAVIGATION_LAYOUT_STORAGE_KEY]);
  state.data = { ...state.data, ...(stored[STORAGE_KEY] || {}) };
  state.data.subscriptions ||= [];
  state.data.candidates ||= [];
  state.data.assets ||= [];
  state.data.candidates = state.data.candidates.map((candidate) => ({ ...candidate, id: candidateId(candidate) }));
  state.badgeSeenAt = stored[NAVIGATION_BADGES_STORAGE_KEY] || null;
  if (!state.badgeSeenAt) {
    const now = new Date().toISOString();
    state.badgeSeenAt = { candidates: now, subscriptions: now, assets: now };
    await chrome.storage.local.set({ [NAVIGATION_BADGES_STORAGE_KEY]: state.badgeSeenAt });
  }
  const layout = stored[NAVIGATION_LAYOUT_STORAGE_KEY] || {};
  state.navigationPlacement = ["left", "right", "hidden"].includes(layout.placement) ? layout.placement : "left";
  state.lastVisibleNavigationPlacement = layout.lastVisiblePlacement === "right" ? "right" : "left";
}
async function saveData() { await chrome.storage.local.set({ [STORAGE_KEY]: state.data }); }
function badgeItems(viewName) {
  if (viewName === "candidates") return activeCandidates();
  return state.data[viewName] || [];
}
function badgeTimestamp(item, viewName) {
  return timestamp(item?.[viewName === "candidates" || viewName === "subscriptions" ? "addedAt" : "createdAt"]);
}
function unreadBadgeCount(viewName) {
  const seenAt = timestamp(state.badgeSeenAt?.[viewName]);
  return badgeItems(viewName).filter((item) => badgeTimestamp(item, viewName) > seenAt).length;
}
function renderNavigationBadges() {
  document.querySelectorAll(".tab[data-view]").forEach((tab) => {
    const viewName = tab.dataset.view;
    const count = ["candidates", "subscriptions", "assets"].includes(viewName) ? unreadBadgeCount(viewName) : 0;
    const badge = tab.querySelector(".tab-badge");
    if (badge) {
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? "99+" : String(count);
    }
    tab.setAttribute("aria-label", `${tab.title}${count ? `，${count} 个未读` : ""}`);
  });
}
async function markNavigationViewed(viewName) {
  if (!Object.hasOwn(state.badgeSeenAt || {}, viewName)) return;
  state.badgeSeenAt = { ...state.badgeSeenAt, [viewName]: new Date().toISOString() };
  await chrome.storage.local.set({ [NAVIGATION_BADGES_STORAGE_KEY]: state.badgeSeenAt });
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
function moreIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6.5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6.5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>';
}
function searchIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.25 3.75a6.5 6.5 0 1 0 5.262 10.324l4.781 4.781 1.414-1.414-4.781-4.781A6.5 6.5 0 0 0 10.25 3.75z"/></svg>';
}
function addIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
}
function platformForUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    const matches = (domain) => host === domain || host.endsWith(`.${domain}`);
    const platform = matches("xiaohongshu.com") || matches("xhslink.com") ? "xiaohongshu"
      : matches("reddit.com") || host === "redd.it" ? "reddit"
        : matches("weixin.qq.com") ? "wechat"
          : matches("bilibili.com") || host === "b23.tv" ? "bilibili" : "";
    return platform ? { platform, url: url.toString() } : null;
  } catch {
    return null;
  }
}
function platformIcon(platform) {
  if (platform === "xiaohongshu") return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" stroke="none"/><text x="12" y="14.5" fill="#fff" stroke="none" text-anchor="middle" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="6.4" font-weight="800">小红书</text></svg>';
  if (platform === "reddit") return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><circle cx="9.2" cy="12.2" r="1" fill="#fff" stroke="none"/><circle cx="14.8" cy="12.2" r="1" fill="#fff" stroke="none"/><path d="M8.8 15c1.9 1.4 4.5 1.4 6.4 0M14 6.4l1.7.5.6-1.2M7.2 9.7 5.6 8.5M16.8 9.7l1.6-1.2" stroke="#fff" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if (platform === "wechat") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.6 5.2c4.2 0 7.5 2.7 7.5 6 0 3.3-3.3 6-7.5 6-.8 0-1.5-.1-2.2-.3L7 18.7l.8-2.6c-1.7-1.1-2.7-2.8-2.7-4.9 0-3.3 3.4-6 7.5-6Z" fill="currentColor" stroke="none"/><circle cx="9.6" cy="10.8" r=".85" fill="#fff" stroke="none"/><circle cx="14.7" cy="10.8" r=".85" fill="#fff" stroke="none"/><path d="M17.6 16.4c.8.5 1.4 1.3 1.4 2.2 0 1.6-1.9 2.9-4.3 2.9-.5 0-1 0-1.4-.2l-2 1 .5-1.7" fill="#fff" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="3" fill="currentColor" stroke="none"/><path d="m8.2 4.5 2.1 1.5m5.5-1.5-2.1 1.5M8.5 11h2.3m2.4 0h2.3M10 14h4" stroke="#fff" stroke-width="1.35" stroke-linecap="round"/></svg>';
}
function platformLabel(platform) {
  return { xiaohongshu: "小红书", reddit: "Reddit", wechat: "微信", bilibili: "B站" }[platform] || "发布平台";
}
function publishedLinksForAsset(asset) {
  const links = Array.isArray(asset.publishedLinks) ? asset.publishedLinks : [];
  const legacy = asset.xiaohongshuNoteUrl ? [{ platform: "xiaohongshu", url: asset.xiaohongshuNoteUrl }] : [];
  const unique = new Map();
  [...links, ...legacy].forEach((item) => {
    const detected = platformForUrl(item?.url);
    if (detected) unique.set(detected.url, detected);
  });
  return [...unique.values()];
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
      ? `<button class="article-card-media asset-card-media" data-action="asset-view-cover" data-id="${escapeHtml(asset.id)}" type="button" aria-label="放大查看 ${escapeHtml(asset.title)} 封面"><img src="${escapeHtml(asset.coverImageUrl)}" alt="" /></button>`
      : `<span class="article-card-media asset-card-media asset-card-placeholder" aria-hidden="true">𝕏<br>Article</span>`;
    const verified = asset.authorVerified ? verifiedBadge() : "";
    const tags = (asset.tags || []).map((tag) => `<span class="asset-tag"><span>${escapeHtml(tag)}</span><button data-action="asset-remove-tag" data-id="${escapeHtml(asset.id)}" data-tag="${escapeHtml(tag)}" type="button" aria-label="删除标签 ${escapeHtml(tag)}" title="删除标签">×</button></span>`).join("");
    const avatarMarkup = authorProfileUrl
      ? `<a class="article-avatar asset-avatar" href="${escapeHtml(authorProfileUrl)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(authorName)} 的 X 主页">${avatar}</a>`
      : `<div class="article-avatar asset-avatar" aria-hidden="true">${avatar}</div>`;
    const tagEditor = state.assetTagEditor === asset.id ? `<div class="asset-tag-editor asset-menu-editor"><input data-asset-tag-input data-id="${escapeHtml(asset.id)}" type="text" placeholder="输入标签后回车" aria-label="添加标签"><button class="asset-icon-button" data-action="asset-add-tag" data-id="${escapeHtml(asset.id)}" type="button" aria-label="确认添加标签" title="确认添加标签">${addIcon()}</button></div>` : "";
    const publishedLinks = publishedLinksForAsset(asset);
    const editorOpen = state.assetTagEditor === asset.id;
    const menu = state.candidateMenu === asset.id ? `<div class="candidate-menu asset-menu ${state.assetMenuPlacement === "up" ? "is-up" : ""}" ${editorOpen ? 'role="dialog" aria-label="素材编辑"' : 'role="menu"'}><a href="${escapeHtml(asset.sourceUrl)}" target="_blank" rel="noreferrer" ${editorOpen ? "" : 'role="menuitem"'}>打开原文</a><button data-action="asset-copy" data-id="${escapeHtml(asset.id)}" type="button" ${editorOpen ? "" : 'role="menuitem"'}>复制 Markdown</button><button data-action="asset-tag-editor" data-id="${escapeHtml(asset.id)}" type="button" ${editorOpen ? "" : 'role="menuitem"'}>编辑标签</button>${tagEditor}<button data-action="asset-publish-editor" data-id="${escapeHtml(asset.id)}" type="button" ${editorOpen ? "" : 'role="menuitem"'}>管理发布链接</button>${asset.usageStatus === "used" ? `<button data-action="asset-toggle-used" data-id="${escapeHtml(asset.id)}" type="button" ${editorOpen ? "" : 'role="menuitem"'}>标记为未使用</button>` : ""}<button data-action="asset-delete" data-id="${escapeHtml(asset.id)}" type="button" ${editorOpen ? "" : 'role="menuitem"'}>删除素材</button></div>` : "";
    const platformLinks = publishedLinks.map((item) => `<a class="asset-platform-link is-${escapeHtml(item.platform)}" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" aria-label="打开${escapeHtml(platformLabel(item.platform))}笔记" title="打开${escapeHtml(platformLabel(item.platform))}笔记">${platformIcon(item.platform)}</a>`).join("");
    const dates = [asset.publishedAt ? `发布于 ${escapeHtml(formatDate(asset.publishedAt))}` : "", asset.createdAt ? `收录于 ${escapeHtml(formatDate(asset.createdAt))}` : ""].filter(Boolean).join('<span aria-hidden="true"> · </span>');
    const usage = asset.usageStatus === "used" ? "已使用" : "未使用";
    const published = platformLinks ? `<span class="asset-published-label">已发布至</span><span class="asset-platform-links" aria-label="已发布平台">${platformLinks}</span>` : '<span class="asset-platform-links" aria-hidden="true"></span>';
    const actions = `<footer class="asset-footer" aria-label="素材状态与操作"><span class="asset-usage-status ${asset.usageStatus === "used" ? "is-used" : ""}">${usage}</span>${published}<button class="asset-preview-action" data-action="asset-preview" data-id="${escapeHtml(asset.id)}" type="button">预览 Markdown</button>${asset.usageStatus === "unused" ? `<button class="primary-button asset-use-button" data-action="asset-toggle-used" data-id="${escapeHtml(asset.id)}" type="button">标记为已使用</button>` : ""}</footer>`;
    return `<article class="article-post asset-post">${avatarMarkup}<div class="article-content"><div class="article-author asset-author"><strong>${authorNameMarkup}${verified}</strong>${authorHandleMarkup ? `<span class="article-handle">${authorHandleMarkup}</span>` : ""}${dates ? `<span class="article-date">· ${dates}</span>` : ""}<div class="asset-menu-anchor"><button class="article-more" data-action="asset-menu" data-id="${escapeHtml(asset.id)}" type="button" aria-label="素材操作" aria-expanded="${state.candidateMenu === asset.id}">${moreIcon()}</button>${menu}</div></div><div class="article-card asset-card">${cover}<div class="article-card-body asset-card-body"><a class="asset-title" href="${escapeHtml(asset.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(asset.title)}</a>${tags ? `<div class="asset-tags-row" aria-label="标签">${tags}</div>` : ""}</div></div>${actions}</div></article>`;
  };
  const dialogAsset = state.data.assets.find((asset) => asset.id === state.assetDialog?.id);
  const dialog = dialogAsset ? `<div class="asset-dialog-backdrop"><section class="asset-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title"><h2 id="asset-dialog-title">删除素材？</h2><p>删除后无法恢复。</p><div class="asset-dialog-actions"><button class="secondary-button" data-action="asset-dialog-cancel" type="button">取消</button><button class="danger-button" data-action="asset-dialog-confirm" data-id="${escapeHtml(dialogAsset.id)}" type="button">删除</button></div></section></div>` : "";
  const publishDialogAsset = state.data.assets.find((asset) => asset.id === state.assetPublishDialog);
  const publishDialogLinks = publishDialogAsset ? publishedLinksForAsset(publishDialogAsset) : [];
  const publishDialog = publishDialogAsset ? `<div class="asset-dialog-backdrop"><section class="asset-dialog asset-publish-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-publish-dialog-title"><div class="asset-publish-dialog-heading"><h2 id="asset-publish-dialog-title">管理发布链接</h2><button class="asset-dialog-close" data-action="asset-publish-cancel" type="button" aria-label="关闭">×</button></div><p>保存后会显示在素材卡的“已发布至”中；同一平台的新链接将替换旧链接。</p><div class="asset-publish-list" aria-label="已保存的发布链接">${publishDialogLinks.length ? publishDialogLinks.map((item) => `<div class="asset-publish-item"><span class="asset-platform-link is-${escapeHtml(item.platform)}" aria-hidden="true">${platformIcon(item.platform)}</span><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(platformLabel(item.platform))}</a><button class="link-button asset-publish-remove" data-action="asset-publish-remove" data-id="${escapeHtml(publishDialogAsset.id)}" data-platform="${escapeHtml(item.platform)}" type="button">移除</button></div>`).join("") : `<p class="asset-publish-empty">尚未添加发布链接</p>`}</div><label class="asset-publish-field"><span>发布链接</span><input data-asset-publish-input data-id="${escapeHtml(publishDialogAsset.id)}" type="url" inputmode="url" placeholder="粘贴小红书、Reddit、微信或 B 站链接" value="${escapeHtml(state.assetPublishDraft)}" aria-describedby="asset-publish-hint${state.assetPublishError ? " asset-publish-error" : ""}" aria-invalid="${Boolean(state.assetPublishError)}"></label><p class="asset-publish-hint" id="asset-publish-hint">仅支持公开的 HTTPS 链接。</p>${state.assetPublishError ? `<p class="asset-publish-error" id="asset-publish-error" role="alert">${escapeHtml(state.assetPublishError)}</p>` : ""}<div class="asset-dialog-actions"><button class="secondary-button" data-action="asset-publish-cancel" type="button">取消</button><button class="primary-button" data-action="asset-publish-save" data-id="${escapeHtml(publishDialogAsset.id)}" type="button">保存链接</button></div></section></div>` : "";
  const imageAsset = state.data.assets.find((asset) => asset.id === state.assetImageDialog && asset.coverImageUrl);
  const imageDialog = imageAsset ? `<div class="asset-image-backdrop" role="dialog" aria-modal="true" aria-label="${escapeHtml(imageAsset.title)} 封面"><img src="${escapeHtml(imageAsset.coverImageUrl)}" alt="${escapeHtml(imageAsset.title)} 封面" /><button class="asset-image-close" data-action="asset-image-close" type="button" aria-label="关闭封面查看">×</button></div>` : "";
  const assetTabs = [["all", "全部"], ["unused", "未使用"], ["used", "已使用"]].map(([filter, label]) => `<button class="${state.assetFilter === filter ? "is-active" : ""}" data-filter="${filter}" type="button" aria-label="${label} ${assetCounts[filter]} 篇">${label}<span class="candidate-date-count" aria-hidden="true">${assetCounts[filter]}</span></button>`).join("");
  view.innerHTML = `<div class="asset-filters"><label class="panel-search"><span class="sr-only">搜索素材</span>${searchIcon()}<input data-asset-search type="search" placeholder="搜索标题、作者、@handle 或标签" value="${escapeHtml(state.assetQuery)}" aria-label="搜索素材"></label><div class="candidate-date-tabs asset-filter-tabs" role="group" aria-label="素材库分类筛选">${assetTabs}</div></div>${assets.length ? assets.map(assetCell).join("") : `<p class="empty">还没有已保存的素材。请在 X 原文中保存 Markdown 后查看。</p>`}${dialog}${publishDialog}${imageDialog}`;
}
function layoutIcon(placement) {
  if (placement === "left") return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M10 4v16"/></svg>';
  if (placement === "right") return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M14 4v16"/></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 8 8 8m0-8-8 8"/></svg>';
}
function renderSettings() {
  const options = [["left", "导航栏显示在左侧"], ["right", "导航栏显示在右侧"], ["hidden", "隐藏导航栏"]]
    .map(([placement, label]) => `<button class="layout-option ${state.navigationPlacement === placement ? "is-active" : ""}" type="button" data-navigation-placement="${placement}" aria-label="${label}" title="${label}">${layoutIcon(placement)}</button>`).join("");
  view.innerHTML = `<section class="settings-list" aria-label="界面设置"><h2>导航栏</h2><div class="layout-options" role="group" aria-label="导航栏位置">${options}</div></section>`;
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
  document.querySelectorAll("[data-view]").forEach((tab) => {
    const isCurrentPage = tab.dataset.view === state.page;
    tab.classList.toggle("is-active", isCurrentPage);
    tab.toggleAttribute("aria-current", isCurrentPage);
  });
  app.classList.toggle("nav-right", state.navigationPlacement === "right");
  app.classList.toggle("nav-hidden", state.navigationPlacement === "hidden");
  app.classList.toggle("nav-restore-right", state.navigationPlacement === "hidden" && state.lastVisibleNavigationPlacement === "right");
  renderNavigationBadges();
  pageHeader.hidden = !["stats", "settings"].includes(state.page);
  pageTitle.textContent = { candidates: "收件箱", subscriptions: "关注作者", assets: "素材库", stats: "统计", settings: "设置" }[state.page] || "收件箱";
  if (state.page === "candidates") renderCandidates();
  else if (state.page === "subscriptions") renderSubscriptions();
  else if (state.page === "stats") renderStats();
  else if (state.page === "settings") renderSettings();
  else renderAssets();
}
async function setNavigationPlacement(placement) {
  if (placement === "hidden") state.lastVisibleNavigationPlacement = state.navigationPlacement === "right" ? "right" : state.lastVisibleNavigationPlacement;
  else state.lastVisibleNavigationPlacement = placement;
  state.navigationPlacement = placement;
  await chrome.storage.local.set({ [NAVIGATION_LAYOUT_STORAGE_KEY]: { placement, lastVisiblePlacement: state.lastVisibleNavigationPlacement } });
  render();
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
  if (action === "navigation-restore") return setNavigationPlacement(state.lastVisibleNavigationPlacement);
  if (action === "asset-image-close") { state.assetImageDialog = null; return render(); }
  if (action === "asset-menu") {
    const opens = state.candidateMenu !== idValue;
    state.candidateMenu = opens ? idValue : null;
    state.assetMenuPlacement = opens && target.getBoundingClientRect().bottom + 320 > window.innerHeight ? "up" : "down";
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
  if (action === "asset-publish-cancel") { state.assetPublishDialog = null; state.assetPublishDraft = ""; state.assetPublishError = ""; return render(); }
  if (!asset) return;
  if (action === "asset-view-cover") { state.assetImageDialog = asset.id; return render(); }
  if (action === "asset-preview") {
    await chrome.storage.session.set({ "library-markdown-preview": { title: asset.title, markdown: asset.markdown, authorName: asset.authorName, authorHandle: asset.authorHandle, sourceUrl: asset.sourceUrl, publishedAt: asset.publishedAt } });
    await chrome.tabs.create({ url: chrome.runtime.getURL("preview.html?mode=library") });
    return;
  }
  if (action === "asset-copy") { await navigator.clipboard.writeText(asset.markdown); setStatus("Markdown 已复制"); }
  if (action === "asset-toggle-used") { asset.usageStatus = asset.usageStatus === "used" ? "unused" : "used"; asset.updatedAt = new Date().toISOString(); state.candidateMenu = null; await saveData(); return render(); }
  if (action === "asset-tag-editor") { state.assetTagEditor = state.assetTagEditor === asset.id ? null : asset.id; return render(); }
  if (action === "asset-publish-editor") { state.assetPublishDialog = asset.id; state.assetPublishDraft = ""; state.assetPublishError = ""; state.candidateMenu = null; state.assetTagEditor = null; return render(); }
  if (action === "asset-publish-save") {
    const input = target.closest(".asset-publish-dialog")?.querySelector("[data-asset-publish-input]");
    const value = input?.value.trim() || "";
    const publishedLink = platformForUrl(value);
    if (!publishedLink) {
      state.assetPublishDraft = value;
      state.assetPublishError = "请输入小红书、Reddit、微信或 B 站的 HTTPS 链接";
      render();
      view.querySelector("[data-asset-publish-input]")?.focus();
      return;
    }
    asset.publishedLinks = [...publishedLinksForAsset(asset).filter((item) => item.platform !== publishedLink.platform), publishedLink];
    delete asset.xiaohongshuNoteUrl;
    asset.updatedAt = new Date().toISOString();
    state.assetPublishDialog = null;
    state.assetPublishDraft = "";
    state.assetPublishError = "";
    await saveData();
    setStatus(`${platformLabel(publishedLink.platform)}链接已保存`);
    return render();
  }
  if (action === "asset-publish-remove") {
    asset.publishedLinks = publishedLinksForAsset(asset).filter((item) => item.platform !== target.dataset.platform);
    delete asset.xiaohongshuNoteUrl;
    asset.updatedAt = new Date().toISOString();
    await saveData();
    setStatus("发布链接已移除");
    return render();
  }
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
  if (viewButton) { state.page = viewButton.dataset.view; await markNavigationViewed(state.page); render(); return; }
  const navigationPlacement = event.target.closest("[data-navigation-placement]");
  if (navigationPlacement) { await setNavigationPlacement(navigationPlacement.dataset.navigationPlacement); return; }
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
  if (event.target.matches("[data-asset-publish-input]")) {
    state.assetPublishDraft = event.target.value;
    state.assetPublishError = "";
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
  if (event.target.matches("[data-asset-search], [data-candidate-search], [data-asset-publish-input]")) event.target.dataset.composing = "true";
});
view.addEventListener("compositionend", (event) => {
  if (!event.target.matches("[data-asset-search], [data-candidate-search], [data-asset-publish-input]")) return;
  event.target.dataset.composing = "false";
  event.target.dispatchEvent(new Event("input", { bubbles: true }));
});
view.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches("[data-asset-tag-input], [data-asset-publish-input]")) return;
  event.preventDefault();
  const isTagInput = event.target.matches("[data-asset-tag-input]");
  const selector = isTagInput ? ".asset-tag-editor" : ".asset-publish-dialog";
  const action = isTagInput ? "asset-add-tag" : "asset-publish-save";
  handleAction(action, event.target.closest(selector)?.querySelector("[data-action]")).catch((error) => setStatus(error.message || "操作失败", "error"));
});
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "capture-completed" || !message.sourceUrl) return;
  const candidate = state.data.candidates.find((item) => articleId(item.sourceUrl) === articleId(message.sourceUrl));
  if (!candidate || candidate.status === "saved") return;
  candidate.status = "extracted";
  saveData().then(() => { if (state.page === "candidates") render(); setStatus("候选已标记为已提取"); }).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || (!changes[STORAGE_KEY] && !changes[NAVIGATION_BADGES_STORAGE_KEY] && !changes[NAVIGATION_LAYOUT_STORAGE_KEY])) return;
  loadData().then(() => render()).catch(() => {});
});
loadData().then(() => render()).catch((error) => setStatus(error.message || "无法加载本地数据", "error"));
