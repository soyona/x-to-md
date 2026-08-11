const STORAGE_KEY = "x-to-md-content-inbox";
const view = document.querySelector("#view");
const status = document.querySelector("#status");
const currentContext = document.querySelector("#current-context");

const state = {
  page: "candidates",
  data: { subscriptions: [], candidates: [], assets: [] },
  candidateSort: "addedAt",
  candidateQuery: "",
  candidateDate: "today",
  assetFilter: "all",
  assetQuery: "",
  candidatePreviews: {},
  candidateMenu: null,
  currentContext: null,
  undoAction: null,
};

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function formatDate(value) {
  if (!value) return "未记录";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
function id(prefix) { return `${prefix}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`; }
function setStatus(message = "", kind = "") {
  window.clearTimeout(setStatus.clearTimer);
  status.textContent = message;
  status.className = `status ${kind}`.trim();
  if (message && kind !== "error") setStatus.clearTimer = window.setTimeout(() => setStatus(), 3200);
}
async function loadData() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  state.data = { ...state.data, ...(stored[STORAGE_KEY] || {}) };
  state.data.subscriptions ||= [];
  state.data.candidates ||= [];
  state.data.assets ||= [];
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
  const undo = state.undoAction ? `<button class="link-button context-undo" data-action="undo-ignore" type="button">撤销忽略</button>` : "";
  if (!context || context.pageKind === "unsupported" || context.pageKind === "x-page") {
    currentContext.innerHTML = `${context?.pageKind === "unsupported" ? `<span>请打开 X 页面以使用当前内容操作</span>` : ""}${undo}`;
    return;
  }
  if (context.pageKind === "author-articles") {
    currentContext.innerHTML = `<div><strong>${escapeHtml(context.authorHandle || "当前作者")}</strong><span>可在 X 原文中将 Article 加入收件箱</span></div>${undo}`;
    return;
  }
  const candidate = state.data.candidates.find((item) => articleId(item.sourceUrl) === articleId(context.candidateUrl || context.sourceUrl));
  const saved = state.data.assets.some((item) => articleId(item.sourceUrl) === articleId(context.sourceUrl));
  currentContext.innerHTML = `<div><strong>${escapeHtml(contextLabel(context))}</strong><span>${escapeHtml(context.authorHandle || "X Article")}</span></div><button class="primary-button" data-action="context-save" type="button" ${saved ? "disabled" : ""}>${saved ? "已保存" : "保存并复制 Markdown"}</button>${candidate ? `<small>当前候选 · ${escapeHtml(candidate.status === "new" ? "待处理" : candidate.status)}</small>` : ""}${undo}`;
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
function dateRangeForFilter() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (state.candidateDate === "today") return { start: today, end: shiftDate(today, 1), label: "今日" };
  if (state.candidateDate === "yesterday") return { start: shiftDate(today, -1), end: today, label: "昨日" };
  const mondayOffset = (today.getDay() + 6) % 7;
  const thisMonday = shiftDate(today, -mondayOffset);
  if (state.candidateDate === "thisWeek") return { start: thisMonday, end: shiftDate(thisMonday, 7), label: "本周" };
  if (state.candidateDate === "lastWeek") return { start: shiftDate(thisMonday, -7), end: thisMonday, label: "上周" };
  if (state.candidateDate === "thisMonth") {
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
function chartData() {
  const range = dateRangeForFilter();
  const days = Math.max(1, Math.ceil((range.end - range.start) / 86400000));
  const counts = Array.from({ length: days }, () => 0);
  activeCandidates().forEach((candidate) => {
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
function renderCandidateChart() {
  const { range, counts } = chartData();
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
  return `<div class="candidate-chart" aria-label="${escapeHtml(range.label)}添加文章趋势"><div class="candidate-chart-heading"><strong>添加趋势</strong><span>${escapeHtml(range.label)} · ${counts.reduce((sum, count) => sum + count, 0)} 篇</span></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="按添加日期统计文章数量"><line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line class="chart-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/><text class="chart-y-label" x="4" y="${top + 4}">${max}</text><text class="chart-y-label" x="14" y="${height - bottom + 4}">0</text><polyline class="chart-line" points="${points}"/>${labels}</svg></div>`;
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
function xIcon(icon) {
  if (!icon?.paths?.length) return "";
  return `<svg class="article-icon" viewBox="${escapeHtml(icon.viewBox)}" aria-hidden="true">${icon.paths.map((path) => `<path d="${escapeHtml(path)}"></path>`).join("")}</svg>`;
}
function candidateCell(candidate) {
  const statusLabel = { new: "新发现", viewed: "已查看", extracted: "已提取", ignored: "已忽略", saved: "已保存素材" }[candidate.status] || "新发现";
  const authorName = candidate.authorName || candidate.authorHandle || "未知作者";
  const preview = state.candidatePreviews[articleId(candidate.sourceUrl)] || {};
  const avatar = candidate.authorAvatarUrl ? `<img src="${escapeHtml(candidate.authorAvatarUrl)}" alt="" />` : escapeHtml(avatarLabel(candidate));
  const cover = candidate.coverImageUrl ? `<img src="${escapeHtml(candidate.coverImageUrl)}" alt="" />` : `<span class="article-card-placeholder" aria-hidden="true"></span>`;
  const excerpt = preview.excerpt ? `<span class="article-card-excerpt">${escapeHtml(preview.excerpt)}</span>` : "";
  const engagement = (preview.engagement || []).map((item) => `<span class="article-engagement-item">${xIcon(item)}<span>${escapeHtml(item.count)}</span></span>`).join("");
  const menu = state.candidateMenu === candidate.id ? `<div class="candidate-menu" role="menu">${candidate.status === "extracted" ? `<button data-action="candidate-save" data-id="${escapeHtml(candidate.id)}" type="button" role="menuitem">添加至素材库</button>` : ""}<button data-action="candidate-ignore" data-id="${escapeHtml(candidate.id)}" type="button" role="menuitem">忽略候选</button></div>` : "";
  return `<article class="article-post" data-candidate="${escapeHtml(candidate.id)}"><span class="sr-only">${escapeHtml(statusLabel)}</span><div class="article-avatar" aria-hidden="true">${avatar}</div><div class="article-content"><div class="article-author"><strong>${escapeHtml(authorName)}</strong><span>${escapeHtml(candidate.authorHandle || "")}</span><span>· ${escapeHtml(formatDate(candidate.publishedAt))}</span><button class="article-more" data-action="candidate-menu" data-id="${escapeHtml(candidate.id)}" type="button" aria-label="候选操作" aria-expanded="${state.candidateMenu === candidate.id}">•••</button></div><a class="article-card" data-action="candidate-open" data-id="${escapeHtml(candidate.id)}" href="${escapeHtml(candidate.sourceUrl)}" target="_blank" rel="noreferrer"><span class="article-card-media">${cover}<span class="article-card-badge">𝕏 Article</span></span><span class="article-card-body"><strong>${escapeHtml(candidate.title)}</strong>${excerpt}</span></a><div class="article-engagement" aria-label="Article engagement">${engagement}</div>${menu}</div></article>`;
}
function renderCandidates() {
  const candidates = sortedCandidates(filteredCandidates());
  const total = activeCandidates().length;
  const hasCandidates = total > 0;
  const filters = `<div class="candidate-filters"><label class="candidate-search"><span class="sr-only">搜索收件箱</span><span aria-hidden="true">⌕</span><input data-candidate-search type="search" placeholder="搜索收件箱" value="${escapeHtml(state.candidateQuery)}" aria-label="搜索收件箱"></label><div class="candidate-date-row"><div class="candidate-date-tabs" role="group" aria-label="收件箱日期筛选"><button class="${state.candidateDate === "today" ? "is-active" : ""}" data-candidate-date="today" type="button">今日</button><button class="${state.candidateDate === "yesterday" ? "is-active" : ""}" data-candidate-date="yesterday" type="button">昨日</button><button class="${state.candidateDate === "thisWeek" ? "is-active" : ""}" data-candidate-date="thisWeek" type="button">本周</button><button class="${state.candidateDate === "lastWeek" ? "is-active" : ""}" data-candidate-date="lastWeek" type="button">上周</button><button class="${state.candidateDate === "thisMonth" ? "is-active" : ""}" data-candidate-date="thisMonth" type="button">本月</button></div></div></div>`;
  const range = dateRangeForFilter();
  const context = `<div class="candidate-context"><span>收件箱总数 ${total} · ${range.label} ${candidates.length} 篇</span><div class="candidate-sort" role="group" aria-label="收件箱排序"><button class="${state.candidateSort === "addedAt" ? "is-active" : ""}" data-candidate-sort="addedAt" type="button">最近添加</button><button class="${state.candidateSort === "publishedAt" ? "is-active" : ""}" data-candidate-sort="publishedAt" type="button">最新发表</button></div></div>`;
  const emptyMessage = hasCandidates ? "当前筛选条件下没有匹配的 Article。" : "还没有候选 Article。前往关注作者，打开作者的 Articles 页面并手动获取。";
  view.innerHTML = `${filters}${renderCandidateChart()}${context}${candidates.length ? candidates.map(candidateCell).join("") : `<p class="empty">${emptyMessage}</p>`}`;
}
function subscriptionCell(subscription) {
  const name = subscription.displayName || subscription.handle;
  const profileUrl = `https://x.com/${String(subscription.handle || "").replace(/^@/u, "")}`;
  const verified = subscription.authorVerified ? `<span class="verified-badge" role="img" aria-label="Verified account"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.25 12c0-1.43-.88-2.67-2.11-3.2.44-1.29.1-2.75-.92-3.77-1.01-1.01-2.48-1.36-3.77-.91C14.92 2.88 13.68 2 12.25 2s-2.67.88-3.2 2.12c-1.29-.45-2.75-.1-3.77.91-1.01 1.02-1.36 2.48-.91 3.77-1.24.53-2.12 1.77-2.12 3.2s.88 2.67 2.12 3.2c-.45 1.29-.1 2.75.91 3.77 1.02 1.01 2.48 1.36 3.77.91.53 1.24 1.77 2.12 3.2 2.12s2.67-.88 3.2-2.12c1.29.45 2.76.1 3.77-.91 1.02-1.02 1.36-2.48.92-3.77 1.23-.53 2.11-1.77 2.11-3.2zm-11.71 4.2-3.38-3.37 1.41-1.42 1.97 1.98 4.86-4.86 1.41 1.42-6.27 6.25z"></path></svg></span>` : "";
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
  const assets = state.data.assets.filter((asset) => (state.assetFilter === "all" || (state.assetFilter === "unused" && asset.usageStatus === "unused") || (state.assetFilter === "used" && asset.usageStatus === "used")) && (!query || `${asset.title} ${asset.authorHandle} ${asset.tags?.join(" ")}`.toLowerCase().includes(query)));
  view.innerHTML = `<div class="context"><span>只保存你主动确认的 Markdown</span>${state.currentContext?.pageKind === "article" ? `<button class="link-button" data-action="save-current" type="button">保存并复制 Markdown</button>` : ""}</div><input class="search" data-asset-search type="search" placeholder="搜索素材" value="${escapeHtml(state.assetQuery)}" aria-label="搜索素材"><div class="tabs"><button class="filter-tab ${state.assetFilter === "all" ? "is-active" : ""}" data-filter="all" type="button">全部</button><button class="filter-tab ${state.assetFilter === "unused" ? "is-active" : ""}" data-filter="unused" type="button">未使用</button><button class="filter-tab ${state.assetFilter === "used" ? "is-active" : ""}" data-filter="used" type="button">已用于创作</button></div>${assets.length ? assets.map((asset) => `<article class="cell"><a class="cell-title" href="${escapeHtml(asset.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(asset.title)}</a><div class="cell-meta">${escapeHtml(asset.authorHandle || "")} · 保存于 ${escapeHtml(formatDate(asset.createdAt))}${asset.tags?.length ? ` · ${escapeHtml(asset.tags.join("、"))}` : ""}</div><p class="cell-meta">${escapeHtml((asset.markdown || "").slice(0, 180))}${asset.markdown?.length > 180 ? "…" : ""}</p><div class="cell-actions"><button class="link-button" data-action="asset-copy" data-id="${escapeHtml(asset.id)}" type="button">复制 Markdown</button><button class="article-more" data-action="asset-menu" data-id="${escapeHtml(asset.id)}" type="button" aria-label="素材操作">•••</button>${state.candidateMenu === asset.id ? `<div class="candidate-menu asset-menu" role="menu"><button data-action="asset-open" data-id="${escapeHtml(asset.id)}" type="button" role="menuitem">打开原文</button><button data-action="asset-edit" data-id="${escapeHtml(asset.id)}" type="button" role="menuitem">编辑标签/备注</button><button data-action="asset-toggle-used" data-id="${escapeHtml(asset.id)}" type="button" role="menuitem">${asset.usageStatus === "used" ? "标记未使用" : "标记已用于创作"}</button><button data-action="asset-delete" data-id="${escapeHtml(asset.id)}" type="button" role="menuitem">删除素材</button></div>` : ""}</div></article>`).join("") : `<p class="empty">还没有已保存的素材。完成“保存并复制 Markdown”后，素材会出现在这里。</p>`}`;
}
function render() {
  document.querySelectorAll("[data-view]").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === state.page));
  if (state.page === "candidates") renderCandidates();
  else if (state.page === "subscriptions") renderSubscriptions();
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
  const candidate = expectedCandidate || state.data.candidates.find((item) => articleId(item.sourceUrl) === articleId(capture.sourceUrl));
  const existing = state.data.assets.find((asset) => asset.sourceUrl === capture.sourceUrl);
  if (existing) {
    if (candidate && candidate.status !== "saved") { candidate.status = "saved"; await saveData(); render(); }
    setStatus("该素材已在素材库中，Markdown 已复制");
    await refreshContext({ resetPage: false });
    return;
  }
  state.data.assets.unshift({ id: id("asset"), candidateId: candidate?.id || null, sourceUrl: capture.sourceUrl, title: capture.title || "Untitled Article", authorHandle: capture.authorHandle || "", markdown: capture.content || "", tags: [], note: "", usageStatus: "unused", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (candidate) candidate.status = "saved";
  await saveData(); setStatus("已保存并复制 Markdown"); render();
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
  const candidate = state.data.candidates.find((item) => item.id === idValue);
  if (candidate && action === "candidate-menu") { state.candidateMenu = state.candidateMenu === candidate.id ? null : candidate.id; return render(); }
  if (candidate && action === "candidate-open") { candidate.status = candidate.status === "new" ? "viewed" : candidate.status; await saveData(); window.open(candidate.sourceUrl, "_blank"); return render(); }
  if (candidate && action === "candidate-ignore") {
    candidate.status = "ignored";
    state.undoAction = { type: "candidate-restore", id: candidate.id };
    await saveData(); render(); setStatus("候选已忽略 · 3 秒内可撤销");
    window.setTimeout(() => { state.undoAction = null; renderCurrentContext(); }, 3200);
    return;
  }
  if (candidate && action === "candidate-save") return saveCurrentExtraction(candidate);
  if (candidate && action === "candidate-restore") { candidate.status = "new"; await saveData(); return render(); }
  if (action === "undo-ignore" && state.undoAction?.type === "candidate-restore") {
    const ignored = state.data.candidates.find((item) => item.id === state.undoAction.id);
    if (ignored) ignored.status = "new";
    state.undoAction = null;
    await saveData(); render(); setStatus("候选已恢复"); return;
  }
  const asset = state.data.assets.find((item) => item.id === idValue);
  if (action === "save-current" || action === "context-save") return saveCurrentExtraction();
  if (action === "asset-menu") { state.candidateMenu = state.candidateMenu === idValue ? null : idValue; return render(); }
  if (!asset) return;
  if (action === "asset-copy") { await navigator.clipboard.writeText(asset.markdown); setStatus("Markdown 已复制"); }
  if (action === "asset-open") { window.open(asset.sourceUrl, "_blank"); }
  if (action === "asset-edit") { asset.tags = (prompt("标签（用逗号分隔）", asset.tags.join(",")) || "").split(",").map((value) => value.trim()).filter(Boolean); asset.note = prompt("备注", asset.note) || ""; asset.updatedAt = new Date().toISOString(); await saveData(); return render(); }
  if (action === "asset-toggle-used") { asset.usageStatus = asset.usageStatus === "used" ? "unused" : "used"; asset.updatedAt = new Date().toISOString(); await saveData(); return render(); }
  if (action === "asset-delete" && confirm("删除素材？删除后无法恢复。")) { state.data.assets = state.data.assets.filter((item) => item.id !== idValue); await saveData(); render(); }
}

document.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { state.page = viewButton.dataset.view; render(); return; }
  const candidateSort = event.target.closest("[data-candidate-sort]");
  if (candidateSort) { state.candidateSort = candidateSort.dataset.candidateSort; renderCandidates(); return; }
  const candidateDate = event.target.closest("[data-candidate-date]");
  if (candidateDate) { state.candidateDate = candidateDate.dataset.candidateDate; renderCandidates(); return; }
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
view.addEventListener("input", (event) => {
  if (event.target.matches("[data-asset-search]")) { state.assetQuery = event.target.value; renderAssets(); }
  if (event.target.matches("[data-candidate-search]")) { state.candidateQuery = event.target.value; renderCandidates(); view.querySelector("[data-candidate-search]")?.focus(); }
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
