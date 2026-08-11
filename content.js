(function initializeXToMdContentScript() {
document.dispatchEvent(new CustomEvent("x-to-md:dispose-content-script"));
try {
  globalThis.__xToMdContentScript?.dispose?.();
} catch {
  // An extension reload can invalidate the previous instance's chrome.runtime.
}

function textOf(element) {
  return (element?.innerText || element?.textContent || "")
    .replace(/\u00a0/gu, " ")
    .trim();
}

function inlineSegmentsOf(element) {
  const segments = [];
  const walk = (node, marks = {}) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue || "";
      if (text) segments.push({ text, ...marks });
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.tagName === "BR") {
      segments.push({ text: "\n", ...marks });
      return;
    }
    const nextMarks = { ...marks };
    const style = node.getAttribute("style") || "";
    if (["B", "STRONG"].includes(node.tagName)) nextMarks.strong = true;
    if (["I", "EM"].includes(node.tagName)) nextMarks.emphasis = true;
    if (node.tagName === "CODE") nextMarks.code = true;
    if (/font-weight\s*:\s*(?:bold|[6-9]00)/iu.test(style)) nextMarks.strong = true;
    if (/font-style\s*:\s*italic/iu.test(style)) nextMarks.emphasis = true;
    if (/text-decoration(?:-line)?\s*:[^;]*line-through/iu.test(style)) nextMarks.strike = true;
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      if (/^https?:\/\//u.test(href)) nextMarks.href = href;
    }
    [...node.childNodes].forEach((child) => walk(child, nextMarks));
  };
  walk(element);
  return segments.reduce((result, segment) => {
    const previous = result[result.length - 1];
    const previousMarks = previous ? JSON.stringify({ ...previous, text: undefined }) : "";
    const segmentMarks = JSON.stringify({ ...segment, text: undefined });
    if (previous && previousMarks === segmentMarks) previous.text += segment.text;
    else result.push(segment);
    return result;
  }, []);
}

function paragraphBlock(element) {
  const text = textOf(element);
  if (!text) return null;
  const segments = inlineSegmentsOf(element);
  return { type: "paragraph", text, segments };
}

function isAuxiliaryArticleBlock(element, sourceHandle = "") {
  const text = textOf(element);
  if (!text) return false;
  if (/^click to follow\s+/iu.test(text)) return true;
  if (!sourceHandle) return false;
  const escapedHandle = sourceHandle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^.+\\n@${escapedHandle}\\nFollow(?:\\n|$)`, "u").test(text);
}

function articleMetadata(root, sourceHandle, blocks) {
  const title = blocks.find((block) => block.type === "heading" && block.level === 1)?.text || null;
  return {
    authorHandle: null,
    authorName: null,
    authorAvatarUrl: null,
    authorVerified: false,
    publishedAt: null,
    title,
    metrics: {},
  };
}

function isMediaImage(element) {
  const src = element?.currentSrc || element?.src || "";
  return /pbs\.twimg\.com\/media\//u.test(src);
}

function originalMediaUrl(value) {
  try {
    const url = new URL(value);
    url.searchParams.set("name", "orig");
    return url.toString();
  } catch {
    return value;
  }
}

let importPanelState = null;
let candidateOverlayState = null;
let bookmarkCandidateState = null;
let bookmarkCandidateHideTimer = null;
let followSubscriptionState = null;
let followSubscriptionHideTimer = null;
let articleMoreMenuState = null;
let articleMoreMenuPending = null;
let articleMoreMenuRetryTimer = null;
let articleMoreTriggerState = null;
let articleMoreMenuObserver = null;
const runtimeMessageListeners = [];
const CONTENT_INBOX_STORAGE_KEY = "x-to-md-content-inbox";
const CONTENT_SCRIPT_REVISION = "article-more-menu-v9";
const contentScriptAbortController = new AbortController();
const contentScriptEventOptions = { signal: contentScriptAbortController.signal };
const articleMenuDiagnostics = { revision: CONTENT_SCRIPT_REVISION, stage: "initialized", history: [] };
let contentScriptDisposed = false;

function recordArticleMenuDiagnostic(stage, detail = {}) {
  articleMenuDiagnostics.stage = stage;
  articleMenuDiagnostics.history.push({ stage, detail, at: new Date().toISOString() });
  if (articleMenuDiagnostics.history.length > 20) articleMenuDiagnostics.history.shift();
}

function reportArticleMenuError(error) {
  recordArticleMenuDiagnostic("error", { message: error?.message || String(error) });
  console.error("[x-to-md] Could not inject Article menu.", error);
  removeArticleMoreMenu();
}

function disposeContentScript() {
  if (contentScriptDisposed) return;
  contentScriptDisposed = true;
  contentScriptAbortController.abort();
  runtimeMessageListeners.forEach((listener) => {
    try {
      chrome.runtime.onMessage.removeListener(listener);
    } catch {
      // The old extension context may already be invalidated during reload.
    }
  });
  articleMoreMenuObserver?.disconnect();
  articleMoreMenuObserver = null;
  if (articleMoreMenuRetryTimer) window.clearTimeout(articleMoreMenuRetryTimer);
  articleMoreMenuRetryTimer = null;
  removeBookmarkCandidateToolbar();
  removeFollowSubscriptionToolbar();
  removeArticleMoreMenu();
  removeImportPanel();
  restoreCandidateOverlay();
}

function addRuntimeMessageListener(listener) {
  chrome.runtime.onMessage.addListener(listener);
  runtimeMessageListeners.push(listener);
}

function profileHandleFromHref(href) {
  try {
    const handle = new URL(href, location.origin).pathname.split("/").filter(Boolean)[0] || "";
    return /^[a-z0-9_]{1,15}$/iu.test(handle) ? `@${handle}` : "";
  } catch {
    return "";
  }
}

function normalizedHandleText(value) {
  return String(value || "").replace(/[\s\u200B-\u200F\u2060\uFEFF]/gu, "").toLowerCase();
}

function authorPresentationFromElement(element, handle = "", fallbackDisplayName = "", explicitRoot = null) {
  const userCell = element?.closest?.('[data-testid="UserCell"]');
  const root = explicitRoot || userCell || element?.closest?.("article") || document;
  const avatar = root.querySelector('[data-testid^="UserAvatar-Container-"] img, [data-testid="Tweet-User-Avatar"] img, [data-testid="UserAvatar-Container"] img');
  const linkedIdentity = [...root.querySelectorAll('a[href]')]
    .filter((link) => profileHandleFromHref(link.getAttribute("href")).toLowerCase() === handle.toLowerCase())
    .map((link) => textOf(link))
    .find((text) => text && normalizedHandleText(text) !== normalizedHandleText(handle));
  const namedIdentity = textOf(root.querySelector('[data-testid="UserName"], [data-testid="User-Name"]'))
    .split("\n")
    .map((text) => text.trim())
    .find((text) => text && normalizedHandleText(text) !== normalizedHandleText(handle));
  const identity = linkedIdentity || namedIdentity;
  const displayName = identity || fallbackDisplayName;
  const normalizedIdentity = new Set([handle, displayName, "Follow", "Following"]
    .map(normalizedHandleText)
    .filter(Boolean));
  const mayContainInlineDescription = root.matches?.('[data-testid="UserCell"], [data-testid="HoverCard"], [data-testid="hoverCardParent"]');
  const descriptionCandidates = mayContainInlineDescription ? [...root.querySelectorAll('div[dir="auto"]')] : [];
  const description = root.querySelector('[data-testid="UserDescription"]') || (descriptionCandidates.length
    ? descriptionCandidates.find((node) => (
      node.offsetParent !== null &&
      !node.closest('a[href]') &&
      !node.querySelector('div[dir="auto"]') &&
      !node.closest('button[data-testid$="-follow"], button[data-testid$="-unfollow"]') &&
      textOf(node) &&
      !normalizedIdentity.has(normalizedHandleText(textOf(node)))
    ))
    : null);
  return {
    displayName,
    authorAvatarUrl: avatar?.currentSrc || avatar?.src || "",
    description: textOf(description),
    authorVerified: Boolean(root.querySelector('[data-testid="icon-verified"], [aria-label="Verified account"]')),
  };
}

function followButtonFromTarget(target) {
  const button = target?.closest?.("button");
  if (!button || button.closest("#x-to-md-follow-subscription-toolbar")) return null;
  const label = button.getAttribute("aria-label") || "";
  const visibleText = textOf(button);
  const labeledFollowState = /^(?:Follow|Following|Unfollow)\s+@[a-z0-9_]{1,15}$/iu.test(label);
  const nativeFollow = (
    button.matches('[data-testid$="-follow"]') && /^Follow$/iu.test(visibleText)
  );
  const nativeFollowing = (
    button.matches('[data-testid$="-unfollow"]') && /^(?:Following|Unfollow)$/iu.test(visibleText)
  );
  return labeledFollowState || nativeFollow || nativeFollowing ? button : null;
}

function followHandleFromButton(button) {
  const labelHandle = (button.getAttribute("aria-label") || "").match(/^(?:Follow|Following|Unfollow)\s+(@[a-z0-9_]{1,15})$/iu)?.[1];
  if (labelHandle) return labelHandle;
  const semanticRoot = button.closest('[data-testid="UserCell"], [data-testid="HoverCard"], [data-testid="hoverCardParent"], article');
  const profileLink = [...semanticRoot?.querySelectorAll?.('a[href]') || []]
    .find((link) => profileHandleFromHref(link.getAttribute("href")));
  return profileHandleFromHref(profileLink?.getAttribute("href"));
}

function authorRootFromFollowButton(button, handle) {
  const semanticRoot = button.closest('[data-testid="UserCell"], [data-testid="HoverCard"], [data-testid="hoverCardParent"], article');
  if (semanticRoot) return semanticRoot;
  let root = button.parentElement;
  for (let depth = 0; root && root !== document.body && depth < 12; depth += 1, root = root.parentElement) {
    const matchingProfile = [...root.querySelectorAll?.('a[href]') || []]
      .some((link) => profileHandleFromHref(link.getAttribute("href")).toLowerCase() === handle.toLowerCase());
    const avatar = root.querySelector?.('[data-testid^="UserAvatar-Container-"] img, [data-testid="Tweet-User-Avatar"] img, [data-testid="UserAvatar-Container"] img');
    if (matchingProfile && avatar) return root;
  }
  const currentHandle = profileHandleFromHref(location.pathname);
  if (currentHandle.toLowerCase() === handle.toLowerCase()) return button.closest('[data-testid="primaryColumn"]') || document;
  return null;
}

function authorFromFollowButton(button) {
  const handle = followHandleFromButton(button);
  if (!handle) return null;
  const root = authorRootFromFollowButton(button, handle);
  if (!root) return null;
  const presentation = authorPresentationFromElement(button, handle, handle, root);
  return { handle, profileUrl: `https://x.com/${handle.slice(1)}`, ...presentation };
}

function isArticleSourcePage() {
  return /\/(?:status|(?:i\/)?article)\/\d+/u.test(location.pathname);
}

function isArticlesIndexPage() {
  return /^\/[^/]+\/articles\/?$/u.test(location.pathname);
}

function articleCandidateId(sourceUrl) {
  return `article_${String(sourceUrl || "").split(/[?#]/u)[0].replace(/\/$/u, "").split("/").pop() || "unknown"}`;
}

function visibleCountOf(control) {
  const count = textOf(control?.querySelector('[data-testid="app-text-transition-container"]')) || textOf(control);
  const visibleCount = count.split("\n").map((value) => value.trim()).filter(Boolean).findLast((value) => /^\d[\d.,]*[KMB]?$/iu.test(value));
  if (visibleCount) return visibleCount;
  return (control?.getAttribute("aria-label") || "").match(/\b\d[\d.,]*[KMB]?\b/iu)?.[0] || "";
}

function iconSnapshotOf(control) {
  const svg = control?.querySelector("svg");
  const paths = [...svg?.querySelectorAll("path") || []].map((path) => path.getAttribute("d")).filter(Boolean);
  return paths.length ? { viewBox: svg.getAttribute("viewBox") || "0 0 24 24", paths } : null;
}

function actionSnapshotOf(root, selector, { includeCount = true } = {}) {
  const control = root?.querySelector(selector);
  const icon = iconSnapshotOf(control);
  if (!control && !icon) return null;
  return { count: includeCount ? visibleCountOf(control) : "", ...(icon || {}) };
}

function articlePreviewMetadata(root, cardText, title) {
  const previewExcerpt = [...cardText?.querySelectorAll('[dir="auto"]') || []]
    .map(textOf)
    .filter((value) => value && value !== title)
    .join("\n")
    .trim();
  return {
    previewExcerpt,
    authorVerified: Boolean(root?.querySelector('[data-testid="icon-verified"], [aria-label="Verified account"]')),
    previewCapturedAt: new Date().toISOString(),
    utilityIconSnapshot: actionSnapshotOf(root, 'button[aria-label*="Grok" i], [data-testid*="grok" i]', { includeCount: false }),
    engagementSnapshot: {
      reply: actionSnapshotOf(root, 'button[data-testid="reply"]'),
      repost: actionSnapshotOf(root, 'button[data-testid="retweet"], button[data-testid="unretweet"]'),
      like: actionSnapshotOf(root, 'button[data-testid="like"], button[data-testid="unlike"]'),
      views: actionSnapshotOf(root, 'a[href*="/analytics"], a[aria-label*="analytics" i]'),
      bookmark: actionSnapshotOf(root, 'button[data-testid="bookmark"], button[data-testid="removeBookmark"]', { includeCount: false }),
      share: actionSnapshotOf(root, 'button[data-testid="share"]', { includeCount: false }),
    },
  };
}

function articleCandidateFromPage(author) {
  if (!isArticleSourcePage()) return null;
  const root = document.querySelector('[data-testid="twitterArticleReadView"], [data-testid="article"], [data-testid="twitterArticleRichTextView"], [data-testid="longformRichTextComponent"], [data-testid="articleBody"]') || findRoot();
  const title = textOf(root?.querySelector('[data-testid="twitter-article-title"], [data-testid="articleTitle"], [data-testid="longformTitle"], h1, [role="heading"]')) || "Untitled Article";
  const sourceUrl = location.href.split(/[?#]/u)[0];
  const time = root.querySelector("time");
  const avatar = root.querySelector('[data-testid="Tweet-User-Avatar"] img, [data-testid="UserAvatar-Container"] img');
  const cover = root.querySelector('[data-testid="article-cover-image"] img') || [...root.querySelectorAll("img")].find(isMediaImage);
  return {
    id: articleCandidateId(sourceUrl),
    sourceUrl,
    title,
    authorHandle: author?.handle || "",
    authorName: author?.displayName || "",
    authorAvatarUrl: avatar?.currentSrc || avatar?.src || "",
    coverImageUrl: cover ? originalMediaUrl(cover.currentSrc || cover.src) : "",
    publishedAt: time?.getAttribute("datetime") || null,
    status: "new",
    ...articlePreviewMetadata(root, root.querySelector('[data-testid="article-cover-image"]')?.nextElementSibling, title),
  };
}

function articleCardRootFromTarget(target) {
  let root = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
  while (root && root !== document.body) {
    const coverCount = root.querySelectorAll?.('[data-testid="article-cover-image"]').length || 0;
    const articleLinks = [...root.querySelectorAll?.('a[href]') || []]
      .filter((link) => /\/(?:status|(?:i\/)?article)\/\d+/u.test(link.getAttribute("href") || ""));
    if (articleLinks.length === 1 && coverCount <= 1) return root;
    root = root.parentElement;
  }
  return null;
}

function articleCandidateFromListRoot(root) {
  const cover = root?.querySelector('[data-testid="article-cover-image"]');
  const articleLink = cover?.closest('a[href]');
  const link = /\/(?:status|(?:i\/)?article)\/\d+/u.test(articleLink?.getAttribute("href") || "")
    ? articleLink
    : [...root?.querySelectorAll?.('a[href]') || []].find((candidate) => /\/(?:status|(?:i\/)?article)\/\d+/u.test(candidate.getAttribute("href") || ""));
  if (!link) return null;
  const sourceUrl = new URL(link.getAttribute("href"), location.origin).toString().split(/[?#]/u)[0];
  const cardText = cover?.nextElementSibling;
  const textNodes = cardText ? [...cardText.querySelectorAll('[dir="auto"]')] : [];
  const titleNode = textNodes[0] || root.querySelector('[data-testid="twitter-article-title"], [data-testid="articleTitle"], [data-testid="longformTitle"]');
  const lines = textOf(root).split("\n").map((line) => line.trim()).filter(Boolean);
  const articleMarker = lines.findIndex((line) => /^article$/iu.test(line));
  const title = textOf(titleNode) || lines[articleMarker + 1] || "Untitled Article";
  const authorLink = [...root.querySelectorAll('a[href^="/"]')].find((candidate) => profileHandleFromHref(candidate.getAttribute("href")));
  const handle = profileHandleFromHref(authorLink?.getAttribute("href"));
  const authorAvatar = root.querySelector('[data-testid="Tweet-User-Avatar"] img, [data-testid="UserAvatar-Container"] img');
  const coverImage = cover?.querySelector("img") || [...root.querySelectorAll("img")].find((image) => image !== authorAvatar && isMediaImage(image));
  return {
    id: `article_${sourceUrl.split("/").pop()}`,
    sourceUrl,
    title,
    authorHandle: handle,
    authorName: textOf(root.querySelector('[data-testid="User-Name"]'))?.split("\n")[0] || handle,
    authorAvatarUrl: authorAvatar?.currentSrc || authorAvatar?.src || "",
    coverImageUrl: coverImage ? originalMediaUrl(coverImage.currentSrc || coverImage.src) : "",
    publishedAt: root.querySelector("time")?.getAttribute("datetime") || null,
    status: "new",
    ...articlePreviewMetadata(root, cardText, title),
  };
}

function normalizedSourceUrl(value) {
  return String(value || "").split(/[?#]/u)[0].replace(/\/$/u, "");
}

function restoreCandidateOverlay() {
  if (!candidateOverlayState) return;
  candidateOverlayState.hiddenRoots.forEach(({ element, style }) => {
    if (style === null) element.removeAttribute("style");
    else element.setAttribute("style", style);
  });
  candidateOverlayState.panel.remove();
  candidateOverlayState.style.remove();
  candidateOverlayState = null;
}

async function toggleCandidateOverlay() {
  if (candidateOverlayState) {
    restoreCandidateOverlay();
    return { ok: true, open: false };
  }
  const stored = await chrome.storage.local.get(CONTENT_INBOX_STORAGE_KEY);
  const candidateUrls = new Set((stored[CONTENT_INBOX_STORAGE_KEY]?.candidates || [])
    .filter((candidate) => !["ignored", "saved"].includes(candidate.status))
    .map((candidate) => normalizedSourceUrl(candidate.sourceUrl)));
  const articleRoots = [...document.querySelectorAll('[data-testid="cellInnerDiv"]')]
    .map((root) => ({ root, candidate: articleCandidateFromListRoot(root) }))
    .filter(({ candidate }) => candidate);
  const visibleCandidates = articleRoots.filter(({ candidate }) => candidateUrls.has(normalizedSourceUrl(candidate.sourceUrl)));
  const hiddenRoots = articleRoots
    .filter(({ candidate }) => !candidateUrls.has(normalizedSourceUrl(candidate.sourceUrl)))
    .map(({ root }) => ({ element: root, style: root.getAttribute("style") }));
  hiddenRoots.forEach(({ element }) => element.style.setProperty("display", "none", "important"));

  const style = document.createElement("style");
  style.id = "x-to-md-candidate-overlay-style";
  style.textContent = `
    #x-to-md-candidate-overlay { position: fixed !important; z-index: 2147483647 !important; top: 12px !important; right: 12px !important; display: flex !important; align-items: center !important; gap: 10px !important; min-height: 40px !important; padding: 0 10px 0 14px !important; border-radius: 9999px !important; background: var(--twitter-color-background, #fff) !important; color: var(--twitter-color-text, rgb(15, 20, 25)) !important; box-shadow: 0 4px 12px rgba(15, 20, 25, .16) !important; font: 700 14px/20px TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; }
    #x-to-md-candidate-overlay button { width: 32px !important; height: 32px !important; margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 9999px !important; background: transparent !important; color: inherit !important; font: 400 24px/32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; cursor: pointer !important; }
    #x-to-md-candidate-overlay button:hover { background: rgba(15, 20, 25, .1) !important; }
  `;
  const panel = document.createElement("aside");
  panel.id = "x-to-md-candidate-overlay";
  panel.setAttribute("aria-label", "Candidate collection");
  panel.innerHTML = `<span>候选集 · ${visibleCandidates.length}/${candidateUrls.size}</span><button type="button" aria-label="关闭候选集">×</button>`;
  document.head.append(style);
  document.body.append(panel);
  candidateOverlayState = { panel, style, hiddenRoots };
  panel.querySelector("button")?.addEventListener("click", restoreCandidateOverlay);
  return { ok: true, open: true, visible: visibleCandidates.length, total: candidateUrls.size };
}

function bookmarkButtonFromTarget(target) {
  const button = target?.closest?.('button[data-testid="bookmark"], button[data-testid="removeBookmark"]');
  return button?.closest?.("#x-to-md-bookmark-candidate-toolbar") ? null : button;
}

function articleCandidateFromBookmarkButton(bookmarkButton) {
  const root = bookmarkButton.closest('[data-testid="cellInnerDiv"], article') || articleCardRootFromTarget(bookmarkButton);
  return articleCandidateFromListRoot(root) || (isArticleSourcePage() ? articleCandidateFromPage() : null);
}

function isActiveInboxCandidate(candidate) {
  return candidate && !["ignored", "saved"].includes(candidate.status);
}

function matchesInboxCandidate(candidate, sourceUrl) {
  return normalizedSourceUrl(candidate?.sourceUrl) === normalizedSourceUrl(sourceUrl);
}

async function addInboxCandidate(candidate) {
  const stored = await chrome.storage.local.get(CONTENT_INBOX_STORAGE_KEY);
  const inbox = stored[CONTENT_INBOX_STORAGE_KEY] || {};
  const candidates = inbox.candidates || [];
  const existingIndex = candidates.findIndex((item) => matchesInboxCandidate(item, candidate.sourceUrl));
  const addedAt = new Date().toISOString();
  if (existingIndex >= 0) {
    const existing = candidates[existingIndex];
    candidates[existingIndex] = { ...existing, ...candidate, id: existing.id || candidate.id, status: "new", addedAt };
  } else {
    candidates.push({ ...candidate, status: "new", addedAt });
  }
  await chrome.storage.local.set({ [CONTENT_INBOX_STORAGE_KEY]: { ...inbox, candidates } });
}

async function removeInboxCandidate(sourceUrl) {
  const stored = await chrome.storage.local.get(CONTENT_INBOX_STORAGE_KEY);
  const inbox = stored[CONTENT_INBOX_STORAGE_KEY] || {};
  const candidates = inbox.candidates || [];
  const candidate = candidates.find((item) => matchesInboxCandidate(item, sourceUrl) && isActiveInboxCandidate(item));
  if (candidate) candidate.status = "ignored";
  await chrome.storage.local.set({ [CONTENT_INBOX_STORAGE_KEY]: { ...inbox, candidates } });
}

function removeBookmarkCandidateToolbar() {
  if (bookmarkCandidateHideTimer) window.clearTimeout(bookmarkCandidateHideTimer);
  bookmarkCandidateHideTimer = null;
  document.querySelector("#x-to-md-bookmark-candidate-toolbar")?.remove();
  document.querySelector("#x-to-md-bookmark-candidate-style")?.remove();
  bookmarkCandidateState = null;
}

function scheduleRemoveBookmarkCandidateToolbar() {
  if (bookmarkCandidateHideTimer) window.clearTimeout(bookmarkCandidateHideTimer);
  bookmarkCandidateHideTimer = window.setTimeout(removeBookmarkCandidateToolbar, 180);
}

function isWithinAnchorOrToolbar(target, anchor, toolbarSelector) {
  return Boolean(target?.closest?.(toolbarSelector) || (target instanceof Node && anchor?.contains(target)));
}

function positionBookmarkCandidateToolbar(toolbar, bookmarkButton) {
  if (!toolbar.isConnected || !bookmarkButton.isConnected) return;
  const rect = bookmarkButton.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  const gap = 8;
  const left = rect.left - toolbarRect.width - gap;
  const fallbackLeft = Math.min(window.innerWidth - toolbarRect.width - gap, rect.right + gap);
  toolbar.style.left = `${left >= gap ? left : fallbackLeft}px`;
  toolbar.style.top = `${rect.top + (rect.height - toolbarRect.height) / 2}px`;
}

async function showBookmarkCandidateToolbar(bookmarkButton, candidate = articleCandidateFromBookmarkButton(bookmarkButton)) {
  if (!candidate) return;
  removeFollowSubscriptionToolbar();
  removeBookmarkCandidateToolbar();
  bookmarkCandidateState = { bookmarkButton, candidate, toolbar: null, isInInbox: false };
  const stored = await chrome.storage.local.get(CONTENT_INBOX_STORAGE_KEY);
  if (bookmarkCandidateState?.bookmarkButton !== bookmarkButton || !bookmarkButton.isConnected) return;
  const isInInbox = (stored[CONTENT_INBOX_STORAGE_KEY]?.candidates || [])
    .some((item) => matchesInboxCandidate(item, candidate.sourceUrl) && isActiveInboxCandidate(item));
  const style = document.createElement("style");
  style.id = "x-to-md-bookmark-candidate-style";
  style.textContent = `
    #x-to-md-bookmark-candidate-toolbar { position: fixed !important; z-index: 2147483647 !important; display: flex !important; align-items: center !important; gap: 4px !important; margin: 0 !important; padding: 0 !important; }
    #x-to-md-bookmark-candidate-toolbar button { display: flex !important; align-items: center !important; justify-content: center !important; box-sizing: border-box !important; width: 32px !important; height: 32px !important; min-width: 32px !important; min-height: 32px !important; margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 9999px !important; background: #1D9BF0 !important; color: #FFFFFF !important; cursor: pointer !important; }
    #x-to-md-bookmark-candidate-toolbar button[data-extract-current] { width: auto !important; padding: 0 14px !important; background: rgb(15, 20, 25) !important; font: 700 14px/20px TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; white-space: nowrap !important; }
    #x-to-md-bookmark-candidate-toolbar button[data-extract-current]:hover, #x-to-md-bookmark-candidate-toolbar button[data-extract-current]:focus-visible { background: rgb(39, 44, 48) !important; }
    #x-to-md-bookmark-candidate-toolbar button.is-in-inbox { border: 1px solid #1D9BF0 !important; background: rgb(255, 255, 255) !important; color: #1D9BF0 !important; }
    #x-to-md-bookmark-candidate-toolbar button.is-in-inbox:hover,
    #x-to-md-bookmark-candidate-toolbar button.is-in-inbox:focus-visible { border-color: rgb(244, 33, 46) !important; background: rgba(244, 33, 46, .1) !important; color: rgb(244, 33, 46) !important; }
    #x-to-md-bookmark-candidate-toolbar svg { display: block !important; width: 18.75px !important; height: 18.75px !important; fill: currentColor !important; }
  `;
  const toolbar = document.createElement("aside");
  toolbar.id = "x-to-md-bookmark-candidate-toolbar";
  toolbar.setAttribute("aria-label", "Article 操作");
  const actionLabel = isInInbox ? "从收件箱移除" : "添加至收件箱";
  const bookmarkPath = isInInbox
    ? "M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z"
    : "M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z";
  const extractButton = isArticleSourcePage()
    ? '<button type="button" data-extract-current aria-label="Extract and copy" title="Extract and copy">Extract and copy</button>'
    : "";
  toolbar.innerHTML = `${extractButton}<button class="${isInInbox ? "is-in-inbox" : ""}" type="button" data-toggle-inbox-candidate aria-label="${actionLabel}" title="${actionLabel}" aria-pressed="${isInInbox}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${bookmarkPath}"></path></svg></button>`;
  document.head.append(style);
  document.body.append(toolbar);
  bookmarkCandidateState = { bookmarkButton, candidate, toolbar, isInInbox };
  positionBookmarkCandidateToolbar(toolbar, bookmarkButton);
  toolbar.addEventListener("mousedown", (event) => event.preventDefault());
  toolbar.addEventListener("pointerenter", () => {
    if (bookmarkCandidateHideTimer) window.clearTimeout(bookmarkCandidateHideTimer);
    bookmarkCandidateHideTimer = null;
  });
  toolbar.addEventListener("pointerleave", scheduleRemoveBookmarkCandidateToolbar);
  toolbar.querySelector("[data-toggle-inbox-candidate]")?.addEventListener("click", async () => {
    const selectedState = bookmarkCandidateState;
    if (!selectedState?.candidate) return;
    if (selectedState.isInInbox) await removeInboxCandidate(selectedState.candidate.sourceUrl);
    else await addInboxCandidate(selectedState.candidate);
    removeBookmarkCandidateToolbar();
  });
  toolbar.querySelector("[data-extract-current]")?.addEventListener("click", () => {
    removeBookmarkCandidateToolbar();
    createImportPanel();
  });
}

function handleBookmarkButtonEntry(target) {
  const bookmarkButton = bookmarkButtonFromTarget(target);
  if (!bookmarkButton) return;
  if (bookmarkCandidateHideTimer) window.clearTimeout(bookmarkCandidateHideTimer);
  bookmarkCandidateHideTimer = null;
  if (bookmarkCandidateState?.bookmarkButton === bookmarkButton) return;
  showBookmarkCandidateToolbar(bookmarkButton).catch(removeBookmarkCandidateToolbar);
}

function removeFollowSubscriptionToolbar() {
  if (followSubscriptionHideTimer) window.clearTimeout(followSubscriptionHideTimer);
  followSubscriptionHideTimer = null;
  document.querySelector("#x-to-md-follow-subscription-toolbar")?.remove();
  document.querySelector("#x-to-md-follow-subscription-style")?.remove();
  followSubscriptionState = null;
}

function scheduleRemoveFollowSubscriptionToolbar() {
  if (followSubscriptionHideTimer) window.clearTimeout(followSubscriptionHideTimer);
  followSubscriptionHideTimer = window.setTimeout(removeFollowSubscriptionToolbar, 180);
}

function positionFollowSubscriptionToolbar(toolbar, followButton) {
  if (!toolbar.isConnected || !followButton.isConnected) return;
  const buttonRect = followButton.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  const left = Math.min(Math.max(buttonRect.right - toolbarRect.width, 8), window.innerWidth - toolbarRect.width - 8);
  const below = buttonRect.bottom + 6;
  const above = buttonRect.top - toolbarRect.height - 6;
  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${below + toolbarRect.height <= window.innerHeight - 8 ? below : Math.max(8, above)}px`;
}

async function saveAuthorSubscription(author) {
  const stored = await chrome.storage.local.get(CONTENT_INBOX_STORAGE_KEY);
  const inbox = stored[CONTENT_INBOX_STORAGE_KEY] || {};
  const subscriptions = inbox.subscriptions || [];
  const existingSubscription = subscriptions.find((subscription) => subscription.handle?.toLowerCase() === author.handle.toLowerCase());
  const authorMetadata = { displayName: author.displayName, profileUrl: author.profileUrl, authorAvatarUrl: author.authorAvatarUrl, description: author.description, authorVerified: author.authorVerified };
  if (existingSubscription) Object.assign(existingSubscription, authorMetadata);
  else subscriptions.push({ id: `sub_${crypto.randomUUID?.() || Date.now()}`, handle: author.handle, ...authorMetadata });
  await chrome.storage.local.set({ [CONTENT_INBOX_STORAGE_KEY]: { ...inbox, subscriptions } });
}

async function removeAuthorSubscription(handle) {
  const stored = await chrome.storage.local.get(CONTENT_INBOX_STORAGE_KEY);
  const inbox = stored[CONTENT_INBOX_STORAGE_KEY] || {};
  const subscriptions = (inbox.subscriptions || [])
    .filter((subscription) => subscription.handle?.toLowerCase() !== handle.toLowerCase());
  await chrome.storage.local.set({ [CONTENT_INBOX_STORAGE_KEY]: { ...inbox, subscriptions } });
}

async function showFollowSubscriptionToolbar(followButton, author) {
  removeBookmarkCandidateToolbar();
  removeFollowSubscriptionToolbar();
  followSubscriptionState = { followButton, author, toolbar: null, isFollowing: false };
  const stored = await chrome.storage.local.get(CONTENT_INBOX_STORAGE_KEY);
  if (followSubscriptionState?.followButton !== followButton || !followButton.isConnected) return;
  const isFollowing = (stored[CONTENT_INBOX_STORAGE_KEY]?.subscriptions || [])
    .some((subscription) => subscription.handle?.toLowerCase() === author.handle.toLowerCase());
  const style = document.createElement("style");
  style.id = "x-to-md-follow-subscription-style";
  style.textContent = `
    #x-to-md-follow-subscription-toolbar { --x-background: var(--twitter-color-background, rgb(255, 255, 255)); --x-border: var(--twitter-color-border, rgb(239, 243, 244)); position: fixed !important; z-index: 2147483647 !important; padding: 4px !important; border: 1px solid var(--x-border) !important; border-radius: 9999px !important; background: var(--x-background) !important; box-shadow: 0 4px 12px rgba(15, 20, 25, .15) !important; }
    #x-to-md-follow-subscription-toolbar button { display: block !important; min-height: 32px !important; margin: 0 !important; padding: 0 14px !important; border: 0 !important; border-radius: 9999px !important; background: #1D9BF0 !important; color: #FFFFFF !important; font: 700 14px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; cursor: pointer !important; white-space: nowrap !important; }
    #x-to-md-follow-subscription-toolbar button:hover { background: #1D9BF0 !important; }
    #x-to-md-follow-subscription-toolbar button.is-following { border: 1px solid rgb(207, 217, 222) !important; background: rgb(255, 255, 255) !important; color: rgb(15, 20, 25) !important; }
    #x-to-md-follow-subscription-toolbar .cancel-follow-label { display: none !important; }
    #x-to-md-follow-subscription-toolbar button.is-following:hover,
    #x-to-md-follow-subscription-toolbar button.is-following:focus-visible { border-color: rgb(244, 33, 46) !important; background: rgba(244, 33, 46, .1) !important; color: rgb(244, 33, 46) !important; }
    #x-to-md-follow-subscription-toolbar button.is-following:hover .following-label,
    #x-to-md-follow-subscription-toolbar button.is-following:focus-visible .following-label { display: none !important; }
    #x-to-md-follow-subscription-toolbar button.is-following:hover .cancel-follow-label,
    #x-to-md-follow-subscription-toolbar button.is-following:focus-visible .cancel-follow-label { display: inline !important; }
  `;
  const toolbar = document.createElement("aside");
  toolbar.id = "x-to-md-follow-subscription-toolbar";
  toolbar.setAttribute("aria-label", `${isFollowing ? "Following" : "Follow"} ${author.handle}`);
  toolbar.innerHTML = isFollowing
    ? '<button class="is-following" type="button" data-toggle-follow-subscription><span class="following-label">Following</span><span class="cancel-follow-label">unfollow</span></button>'
    : '<button type="button" data-toggle-follow-subscription>Follow</button>';
  document.head.append(style);
  document.body.append(toolbar);
  followSubscriptionState = { followButton, author, toolbar, isFollowing };
  positionFollowSubscriptionToolbar(toolbar, followButton);
  toolbar.addEventListener("mousedown", (event) => event.preventDefault());
  toolbar.addEventListener("pointerenter", () => {
    if (followSubscriptionHideTimer) window.clearTimeout(followSubscriptionHideTimer);
    followSubscriptionHideTimer = null;
  });
  toolbar.addEventListener("pointerleave", scheduleRemoveFollowSubscriptionToolbar);
  toolbar.querySelector("[data-toggle-follow-subscription]")?.addEventListener("click", async () => {
    const selectedState = followSubscriptionState;
    if (!selectedState?.author) return;
    if (selectedState.isFollowing) await removeAuthorSubscription(selectedState.author.handle);
    else await saveAuthorSubscription(selectedState.author);
    removeFollowSubscriptionToolbar();
  });
}

function handleFollowButtonEntry(target) {
  const followButton = followButtonFromTarget(target);
  if (!followButton) return;
  if (followSubscriptionHideTimer) window.clearTimeout(followSubscriptionHideTimer);
  followSubscriptionHideTimer = null;
  if (followSubscriptionState?.followButton === followButton) return;
  const author = authorFromFollowButton(followButton);
  if (author) showFollowSubscriptionToolbar(followButton, author).catch(removeFollowSubscriptionToolbar);
}

function removeArticleMoreMenu() {
  articleMoreMenuObserver?.disconnect();
  articleMoreMenuObserver = null;
  document.querySelector("#x-to-md-article-menu-group")?.remove();
  articleMoreMenuState = null;
}

function reconcileArticleMoreMenu(menu, group) {
  articleMoreMenuObserver?.disconnect();
  articleMoreMenuObserver = new MutationObserver(() => {
    if (!menu.isConnected) {
      articleMoreMenuObserver?.disconnect();
      articleMoreMenuObserver = null;
      articleMoreMenuState = null;
      return;
    }
    if (!group.isConnected) {
      recordArticleMenuDiagnostic("group-removed-by-page");
      menu.prepend(group);
      recordArticleMenuDiagnostic("group-restored");
    }
  });
  articleMoreMenuObserver.observe(menu, { childList: true });
}

function visibleNativeMenu() {
  return [...document.querySelectorAll('[data-testid="Dropdown"]')]
    .find((dropdown) => dropdown.getClientRects().length
      && [...dropdown.querySelectorAll(':scope > [role="menuitem"]')]
        .some((item) => /^(?:Embed Article|Report Article)$/u.test(textOf(item)))) || null;
}

function nativeMenuIcon(menu, label) {
  return [...menu.querySelectorAll('[role="menuitem"]')]
    .find((item) => textOf(item).includes(label))
    ?.querySelector("svg")?.outerHTML || "";
}

function articleMenuAuthor(menu) {
  const followItemText = [...menu.querySelectorAll(':scope > [role="menuitem"]')]
    .map(textOf)
    .find((label) => /^(?:Follow|Unfollow)\s+@[a-z0-9_]{1,15}$/iu.test(label)) || "";
  const menuHandle = followItemText.match(/@[a-z0-9_]{1,15}/iu)?.[0] || "";
  const context = menuHandle ? null : currentPageContext();
  const handle = menuHandle || context?.authorHandle || "";
  if (!handle) return null;
  return {
    handle,
    displayName: context?.authorName || handle,
    profileUrl: `https://x.com/${handle.slice(1)}`,
  };
}

function articleMoreButtonFromTarget(target) {
  const button = target?.closest?.('button[data-testid="caret"][aria-haspopup="menu"]');
  if (!button) return null;
  let candidate = null;
  try {
    const root = button.closest('[data-testid="cellInnerDiv"], article') || articleCardRootFromTarget(button);
    candidate = articleCandidateFromListRoot(root) || (isArticleSourcePage() ? articleCandidateFromPage() : null);
  } catch (error) {
    recordArticleMenuDiagnostic("candidate-read-failed", { message: error?.message || String(error) });
    // Opening the native menu must not depend on optional candidate metadata.
  }
  return { button, candidate };
}

function scheduleArticleMoreMenu() {
  if (articleMoreMenuRetryTimer) window.clearTimeout(articleMoreMenuRetryTimer);
  articleMoreMenuRetryTimer = null;
  recordArticleMenuDiagnostic("waiting-for-dropdown");
  let attempts = 0;
  const injectWhenReady = () => {
    if (visibleNativeMenu()) {
      articleMoreMenuRetryTimer = null;
      recordArticleMenuDiagnostic("dropdown-found", { attempts });
      showArticleMoreMenu().catch(reportArticleMenuError);
      return;
    }
    attempts += 1;
    if (attempts < 30) articleMoreMenuRetryTimer = window.setTimeout(injectWhenReady, 50);
    else recordArticleMenuDiagnostic("dropdown-timeout", { attempts });
  };
  window.requestAnimationFrame(injectWhenReady);
}

async function showArticleMoreMenu() {
  const menu = visibleNativeMenu();
  if (!menu || (articleMoreMenuState?.menu === menu && articleMoreMenuState.group.isConnected)) return;
  if (articleMoreMenuPending === menu) return;
  articleMoreMenuPending = menu;
  removeArticleMoreMenu();
  const author = articleMenuAuthor(menu);
  const sourceCandidate = articleMoreTriggerState?.candidate || articleCandidateFromPage(author);
  const candidate = sourceCandidate && author ? {
    ...sourceCandidate,
    authorHandle: sourceCandidate.authorHandle || author.handle,
    authorName: sourceCandidate.authorName || author.displayName,
  } : sourceCandidate;
  if (!author || !candidate) {
    recordArticleMenuDiagnostic("missing-menu-context", { hasAuthor: Boolean(author), hasCandidate: Boolean(candidate) });
    articleMoreMenuPending = null;
    return;
  }
  let stored;
  try {
    stored = await chrome.storage.local.get(CONTENT_INBOX_STORAGE_KEY);
  } finally {
    articleMoreMenuPending = null;
  }
  recordArticleMenuDiagnostic("storage-read");
  if (!menu.isConnected || menu !== visibleNativeMenu()) {
    recordArticleMenuDiagnostic("dropdown-replaced-before-insert");
    return;
  }
  const inbox = stored[CONTENT_INBOX_STORAGE_KEY] || {};
  const isFollowing = (inbox.subscriptions || []).some((item) => item.handle?.toLowerCase() === author.handle.toLowerCase());
  const isInInbox = (inbox.candidates || []).some((item) => matchesInboxCandidate(item, candidate.sourceUrl) && isActiveInboxCandidate(item));
  const group = document.createElement("div");
  group.id = "x-to-md-article-menu-group";
  group.setAttribute("aria-label", "x-to-md Article 操作");
  group.style.cssText = "border-bottom: 1px solid rgb(239, 243, 244);";
  const actionRow = (label, icon, action) => {
    const template = [...menu.querySelectorAll(':scope > [role="menuitem"]')]
      .find((item) => textOf(item) === "Embed Article") || menu.querySelector(':scope > [role="menuitem"]');
    const row = template.cloneNode(true);
    row.dataset.xToMdAction = action;
    row.querySelector("svg")?.replaceWith(document.createRange().createContextualFragment(icon).firstElementChild || document.createElement("span"));
    const labelSlot = [...row.querySelectorAll("span, div")]
      .filter((element) => textOf(element) === "Embed Article")
      .at(-1);
    if (labelSlot) labelSlot.textContent = label;
    else row.append(document.createTextNode(label));
    const runAction = async () => {
      if (action === "follow") {
        if (isFollowing) await removeAuthorSubscription(author.handle);
        else await saveAuthorSubscription(author);
      } else if (action === "extract") {
        createImportPanel();
      } else if (isInInbox) {
        await removeInboxCandidate(candidate.sourceUrl);
      } else {
        await addInboxCandidate(candidate);
      }
      removeArticleMoreMenu();
    };
    row.addEventListener("click", () => runAction().catch(removeArticleMoreMenu));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); runAction().catch(removeArticleMoreMenu); }
    });
    return row;
  };
  group.append(
    actionRow(isFollowing ? "取消关注作者" : "关注作者", nativeMenuIcon(menu, "Follow") || nativeMenuIcon(menu, "Mute"), "follow"),
    actionRow("Extract and copy", nativeMenuIcon(menu, "Embed Article"), "extract"),
    actionRow(isInInbox ? "从收件箱移除" : "添加至收件箱", document.querySelector('button[data-testid="bookmark"], button[data-testid="removeBookmark"]')?.querySelector("svg")?.outerHTML || "", "inbox"),
  );
  menu.prepend(group);
  articleMoreMenuState = { menu, group };
  recordArticleMenuDiagnostic("group-inserted");
  reconcileArticleMoreMenu(menu, group);
}

document.addEventListener("pointerover", (event) => {
  handleBookmarkButtonEntry(event.target);
  handleFollowButtonEntry(event.target);
}, contentScriptEventOptions);
document.addEventListener("focusin", (event) => {
  handleBookmarkButtonEntry(event.target);
  handleFollowButtonEntry(event.target);
}, contentScriptEventOptions);
document.addEventListener("pointerout", (event) => {
  const anchoredBookmark = event.target?.closest?.("button") === bookmarkCandidateState?.bookmarkButton;
  if (anchoredBookmark && !isWithinAnchorOrToolbar(event.relatedTarget, bookmarkCandidateState?.bookmarkButton, "#x-to-md-bookmark-candidate-toolbar")) scheduleRemoveBookmarkCandidateToolbar();
  const anchoredButton = event.target?.closest?.("button") === followSubscriptionState?.followButton;
  if (anchoredButton && !isWithinAnchorOrToolbar(event.relatedTarget, followSubscriptionState?.followButton, "#x-to-md-follow-subscription-toolbar")) scheduleRemoveFollowSubscriptionToolbar();
}, contentScriptEventOptions);
document.addEventListener("focusout", (event) => {
  const anchoredBookmark = event.target?.closest?.("button") === bookmarkCandidateState?.bookmarkButton;
  if (anchoredBookmark && !isWithinAnchorOrToolbar(event.relatedTarget, bookmarkCandidateState?.bookmarkButton, "#x-to-md-bookmark-candidate-toolbar")) scheduleRemoveBookmarkCandidateToolbar();
  const anchoredButton = event.target?.closest?.("button") === followSubscriptionState?.followButton;
  if (anchoredButton && !isWithinAnchorOrToolbar(event.relatedTarget, followSubscriptionState?.followButton, "#x-to-md-follow-subscription-toolbar")) scheduleRemoveFollowSubscriptionToolbar();
}, contentScriptEventOptions);
document.addEventListener("click", (event) => {
  const clickedButton = event.target?.closest?.("button");
  if (clickedButton === followSubscriptionState?.followButton) {
    window.setTimeout(() => {
      if (!followButtonFromTarget(clickedButton)) removeFollowSubscriptionToolbar();
    }, 0);
  }
}, contentScriptEventOptions);

function handleArticleMoreMenuTrigger(event) {
  const trigger = articleMoreButtonFromTarget(event.target);
  if (!trigger) return;
  articleMoreTriggerState = trigger;
  recordArticleMenuDiagnostic("caret-triggered", { hasCandidate: Boolean(trigger.candidate), eventType: event.type });
  scheduleArticleMoreMenu();
}

document.addEventListener("pointerdown", handleArticleMoreMenuTrigger, { capture: true, ...contentScriptEventOptions });
document.addEventListener("click", handleArticleMoreMenuTrigger, { capture: true, ...contentScriptEventOptions });

document.addEventListener("mousedown", (event) => {
  if (!event.target.closest("#x-to-md-bookmark-candidate-toolbar") && event.target.closest("button") !== bookmarkCandidateState?.bookmarkButton) removeBookmarkCandidateToolbar();
  if (!event.target.closest("#x-to-md-follow-subscription-toolbar") && event.target.closest("button") !== followSubscriptionState?.followButton) removeFollowSubscriptionToolbar();
}, { capture: true, ...contentScriptEventOptions });

function importPanelStyle() {
  const style = document.createElement("style");
  style.id = "x-to-md-import-panel-style";
  style.textContent = `
    #x-to-md-import-panel,
    #x-to-md-import-panel * {
      box-sizing: border-box !important;
    }
    #x-to-md-import-panel {
      position: fixed !important; top: 16px !important; right: 16px !important;
      z-index: 2147483646 !important; box-sizing: border-box !important;
      width: 300px !important; padding: 20px !important;
      border: 1px solid rgb(239, 243, 244) !important;
      border-radius: 16px !important; background: rgb(255, 255, 255) !important;
      box-shadow: 0 2px 8px rgba(15, 20, 25, .08), 0 8px 24px rgba(15, 20, 25, .14) !important;
      color: rgb(15, 20, 25) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      font-size: 15px !important; line-height: 1.4 !important;
    }
    #x-to-md-import-panel h2 {
      margin: 0 !important; color: rgb(15, 20, 25) !important;
      font: 700 20px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      letter-spacing: -.015em !important;
    }
    #x-to-md-import-panel p {
      margin: 8px 0 20px !important; color: rgb(83, 100, 113) !important;
      font: 400 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }
    #x-to-md-import-panel button {
      display: flex !important; align-items: center !important; justify-content: center !important;
      box-sizing: border-box !important; width: 100% !important;
      height: 46px !important; min-height: 46px !important; margin: 0 !important; padding: 0 18px !important;
      border: 0 !important; border-radius: 9999px !important; appearance: none !important;
      background: rgb(15, 20, 25) !important; color: #fff !important; cursor: pointer !important;
      font: 700 15px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      text-align: center !important; white-space: nowrap !important;
    }
    #x-to-md-import-panel button:hover { background: rgb(39, 44, 48) !important; }
    #x-to-md-import-panel button:disabled { opacity: .6 !important; cursor: wait !important; }
    #x-to-md-import-panel button[data-import-state="open"] { border: 1px solid rgb(207, 217, 222) !important; background: #fff !important; color: rgb(15, 20, 25) !important; }
    #x-to-md-import-panel [data-import-status]:not(:empty) {
      margin-top: 12px !important; color: rgb(244, 33, 46) !important;
      font: 400 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }
    #x-to-md-import-panel [data-import-status].is-success { color: rgb(0, 186, 124) !important; }
  `;
  return style;
}

function removeImportPanel() {
  if (!importPanelState) return;
  importPanelState.style.remove();
  importPanelState.panel.remove();
  importPanelState = null;
}

function createImportPanel() {
  if (importPanelState) return;
  const style = importPanelStyle();
  const panel = document.createElement("aside");
  panel.id = "x-to-md-import-panel";
  panel.setAttribute("aria-label", "Copy Markdown");
  panel.innerHTML = '<h2>Copy Markdown</h2><p>Copy the current X content as Markdown. Nothing is uploaded.</p><button type="button" data-import>Extract and copy</button><div data-import-status role="status" aria-live="polite"></div>';
  document.head.append(style);
  document.body.append(panel);
  importPanelState = { panel, style, capture: null, saved: false };
  const button = panel.querySelector("[data-import]");
  const status = panel.querySelector("[data-import-status]");
  button.addEventListener("click", async () => {
    const panelState = importPanelState;
    if (!panelState) return;
    button.disabled = true;
    button.textContent = panelState.capture ? "Saving…" : "Extracting…";
    status.textContent = "";
    status.className = "";
    try {
      if (!panelState.capture) {
        const capture = await capturePage();
        await navigator.clipboard.writeText(capture.content);
        panelState.capture = capture;
        chrome.runtime.sendMessage({ type: "capture-completed", sourceUrl: capture.sourceUrl }).catch(() => {});
        button.disabled = false;
        button.textContent = "Save to library";
        status.textContent = "Markdown copied. Save it to add it to your library.";
        status.className = "is-success";
        return;
      }
      if (!panelState.saved) {
        const result = await chrome.runtime.sendMessage({ type: "save-capture-to-library", capture: panelState.capture });
        if (result?.error) throw new Error(result.error);
        panelState.saved = true;
        button.disabled = false;
        button.dataset.importState = "open";
        button.textContent = "Open Side Panel";
        status.textContent = result?.existing ? "Already in your library." : "Saved to library.";
        status.className = "is-success";
        return;
      }
      const result = await chrome.runtime.sendMessage({ type: "open-side-panel" });
      if (result?.error) throw new Error(result.error);
      removeImportPanel();
    } catch (error) {
      status.textContent = error.message || "Extraction failed. Please try again.";
      button.disabled = false;
      button.textContent = panelState.saved ? "Open Side Panel" : panelState.capture ? "Save to library" : "Extract and copy";
    }
  });
}

function toggleImportPanel() {
  if (importPanelState) removeImportPanel();
  else createImportPanel();
}


const CODE_NODE_SELECTOR = 'pre, code, [data-testid="codeBlock"], [data-testid*="code"], [role="code"], [class*="longform-code"], [class*="code-block"]';
const CODE_COMPOSITE_SELECTOR = '[class*="longform-atomic"], [data-testid="codeBlock"], [class*="code-block"]';

function codeLanguageOf(element) {
  const candidates = [
    element,
    element?.parentElement,
    ...[...element?.querySelectorAll?.('[data-language], [data-lang], [data-testid*="language"], [class*="language"], [class*="lang-"]') || []],
  ].filter(Boolean);
  for (const candidate of candidates) {
    const declared = candidate.getAttribute?.("data-language") || candidate.getAttribute?.("data-lang") || candidate.getAttribute?.("aria-label") || "";
    if (/^[a-z][\w+#.-]*$/iu.test(declared)) return declared;
    const className = candidate.getAttribute?.("class") || "";
    const match = /(?:language|lang)-([a-z][\w+#.-]*)/iu.exec(className);
    if (match) return match[1];
  }
  return null;
}

function codeElementOf(element) {
  return element?.matches?.("pre, code")
    ? element
    : element?.querySelector?.("pre, code") || element;
}

function codeContainerOf(element) {
  let current = element;
  while (current) {
    if (current.matches?.(CODE_COMPOSITE_SELECTOR) && current.querySelector?.(CODE_NODE_SELECTOR)) return current;
    if (current.matches?.("pre")) return current;
    current = current.parentElement;
  }
  return element.matches?.(CODE_NODE_SELECTOR) ? element : null;
}

function codeBlock(element) {
  const codeElement = codeElementOf(element);
  const text = textOf(codeElement);
  return text ? { type: "code", text, language: codeLanguageOf(element) || codeLanguageOf(codeElement) } : null;
}

function headingLevel(element) {
  if (element.matches?.("h1, h2, h3, h4, h5, h6")) {
    return Number(element.tagName.slice(1));
  }
  if (element.matches?.('[data-testid="twitter-article-title"], [data-testid="articleTitle"], [data-testid="longformTitle"]')) {
    return 1;
  }
  if (element.matches?.('[class*="longform-header-one"]')) return 1;
  if (element.matches?.('[class*="longform-header-two"]')) return 2;
  if (element.matches?.('[class*="longform-header-three"]')) return 3;
  return Math.min(6, Math.max(1, Number(element.getAttribute?.("aria-level")) || 2));
}

function blockFromElement(element, seenImages) {
  if (element.matches?.('hr, [data-testid="divider"], [role="separator"]')) {
    return { type: "divider" };
  }
  if (element.matches?.('[class*="longform-atomic"]')) {
    if (element.querySelector?.("img, video, figure")) return null;
    if (element.querySelector?.(CODE_NODE_SELECTOR)) return codeBlock(element);
    const link = element.querySelector?.('a[href^="http"]');
    if (link) {
      const url = link.getAttribute("href") || "";
      return { type: "link", url, text: textOf(link) || url };
    }
    return { type: "divider" };
  }
  if (element.matches?.("code") && element.closest("pre")) return null;
  if (
    element.matches?.(
      CODE_NODE_SELECTOR,
    )
  ) {
    const text = textOf(element);
    return text ? { type: "code", text, language: null } : null;
  }
  if (element.matches?.('[data-testid="tweetText"], [data-testid="articleText"]')) {
    return paragraphBlock(element);
  }
  if (element.matches?.('.longform-unstyled')) {
    return paragraphBlock(element);
  }
  if (element.matches?.('[data-testid="twitter-article-title"]')) {
    const text = textOf(element);
    return text ? { type: "heading", level: 1, text, segments: inlineSegmentsOf(element) } : null;
  }
  if (
    element.matches?.(
      'h1, h2, h3, h4, h5, h6, [role="heading"], [data-testid="articleTitle"], [data-testid="longformTitle"], [class*="longform-header-one"], [class*="longform-header-two"], [class*="longform-header-three"]',
    )
  ) {
    const text = textOf(element);
    const level = headingLevel(element);
    return text ? { type: "heading", level, text, segments: inlineSegmentsOf(element) } : null;
  }
  if (element.matches?.('.longform-unstyled .public-DraftStyleDefault-block')) {
    return paragraphBlock(element);
  }
  if (element.matches?.('[class*="longform-blockquote"]')) {
    const paragraph = paragraphBlock(element);
    return paragraph ? { ...paragraph, type: "blockquote" } : null;
  }
  if (element.matches?.('[class*="longform-unordered-list-item"], [class*="longform-ordered-list-item"]')) {
    const paragraph = paragraphBlock(element);
    if (!paragraph) return null;
    return {
      ...paragraph,
      type: "listItem",
      ordered: element.matches?.('[class*="longform-ordered-list-item"]'),
    };
  }
  if (element.matches?.("blockquote")) {
    const paragraph = paragraphBlock(element);
    return paragraph ? { ...paragraph, type: "blockquote" } : null;
  }
  if (
    element.matches?.('p, h1, h2, h3, h4, h5, h6, li, blockquote, [dir="auto"]') &&
    !element.closest('button, [role="button"], time, [data-testid="User-Name"], [data-testid="socialContext"]') &&
    !element.parentElement?.closest('[data-testid="tweetText"], [data-testid="articleText"]') &&
    !element.parentElement?.closest('[data-testid="twitter-article-title"], [data-testid="articleTitle"], [data-testid="longformTitle"], [role="heading"], [class*="longform-header-"], [class*="longform-blockquote"], [class*="longform-unordered-list-item"], [class*="longform-ordered-list-item"]') &&
    !element.parentElement?.closest("blockquote") &&
    !element.querySelector?.('p, h1, h2, h3, h4, h5, h6, li, blockquote, [dir="auto"]')
  ) {
    return paragraphBlock(element);
  }
  if (isMediaImage(element)) {
    const url = originalMediaUrl(element.currentSrc || element.src);
    if (seenImages.has(url)) return null;
    seenImages.add(url);
    return { type: "image", url, altText: element.alt || "" };
  }
  return null;
}

const TEXT_BLOCK_SELECTOR = [
  '[data-testid="tweetText"]',
  '[data-testid="articleText"]',
  '[data-testid="twitter-article-title"]',
  '[data-testid="articleTitle"]',
  '[data-testid="longformTitle"]',
  '[class*="longform-header-one"]',
  '[class*="longform-header-two"]',
  '[class*="longform-header-three"]',
  '[class*="longform-blockquote"]',
  '[class*="longform-unordered-list-item"]',
  '[class*="longform-ordered-list-item"]',
  '.longform-unstyled',
  '.longform-unstyled .public-DraftStyleDefault-block',
  'h1, h2, h3, h4, h5, h6, p, li, blockquote, [role="heading"], [dir="auto"]',
].join(", ");

function isNestedTextBlock(element) {
  return Boolean(element.parentElement?.closest(TEXT_BLOCK_SELECTOR));
}

function findRoot() {
  const articleRoot = document.querySelector(
    '[data-testid="twitterArticleReadView"], [data-testid="article"]',
  );
  if (articleRoot) return articleRoot;

  const richTextRoot = document.querySelector(
    '[data-testid="twitterArticleRichTextView"], [data-testid="longformRichTextComponent"], [data-testid="articleBody"]',
  );
  if (richTextRoot) {
    return richTextRoot.closest('article, [data-testid="tweet"]') || richTextRoot;
  }

  const statusId = /\/status\/(\d+)/u.exec(location.pathname)?.[1];
  const tweetRoots = [...document.querySelectorAll('article[data-testid="tweet"]')];
  if (statusId) {
    const matchingRoot = tweetRoots.find((root) =>
      [...root.querySelectorAll('a[href]')].some((link) =>
        new RegExp(`/status/${statusId}(?:$|[?#])`, "u").test(
          link.getAttribute("href") || "",
        ),
      ),
    );
    if (matchingRoot) return matchingRoot;
  }
  return tweetRoots[0] || document.querySelector("main");
}

function waitForRender(delay = 350) {
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

async function expandCollapsedContent(root) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const expandButton = [...root.querySelectorAll('button, [role="button"]')].find(
      (element) => /show more|显示更多/u.test(textOf(element)),
    );
    if (!expandButton) return;
    expandButton.click();
    await waitForRender();
  }
}

async function revealLazyContent(root) {
  const scrollElement = document.scrollingElement;
  const previousScrollTop = scrollElement?.scrollTop || 0;
  const hadLongPage = (scrollElement?.scrollHeight || 0) > window.innerHeight * 1.5;
  if (hadLongPage) {
    window.scrollTo(0, scrollElement.scrollHeight);
    await waitForRender(500);
  }
  await expandCollapsedContent(root);
  if (hadLongPage) {
    window.scrollTo(0, previousScrollTop);
    await waitForRender(250);
  }
}

async function capturePage() {
  const root = findRoot();
  if (!root) throw new Error("Open a post or Article and try again.");
  await revealLazyContent(root);
  const sourceHandle = decodeURIComponent(location.pathname.split("/").filter(Boolean)[0] || "");
  const blocks = [];
  const seenImages = new Set();
  const candidates = root.querySelectorAll('hr, [data-testid="divider"], [role="separator"], [class*="longform-atomic"], pre, code, [data-testid="codeBlock"], [data-testid*="code"], [role="code"], [class*="longform-code"], [class*="code-block"], [class*="monospace"], [data-testid="tweetText"], [data-testid="articleText"], [data-testid="twitter-article-title"], [data-testid="articleTitle"], [data-testid="longformTitle"], .longform-unstyled, .longform-unstyled .public-DraftStyleDefault-block, [class*="longform-header-one"], [class*="longform-header-two"], [class*="longform-header-three"], [class*="longform-blockquote"], [class*="longform-unordered-list-item"], [class*="longform-ordered-list-item"], p, h1, h2, h3, h4, h5, h6, [role="heading"], li, blockquote, [dir="auto"], img');
  const seenBlockKeys = new Set();
  const seenCodeContainers = new Set();
  candidates.forEach((element) => {
    if (isAuxiliaryArticleBlock(element, sourceHandle)) {
      if (blocks.at(-1)?.type === "divider") blocks.pop();
      return;
    }
    if (element.matches?.(TEXT_BLOCK_SELECTOR) && isNestedTextBlock(element)) return;
    const blockKey = element.getAttribute?.("data-offset-key");
    if (blockKey && seenBlockKeys.has(blockKey)) return;
    const codeContainer = codeContainerOf(element);
    if (codeContainer) {
      if (seenCodeContainers.has(codeContainer)) return;
      seenCodeContainers.add(codeContainer);
      const block = codeBlock(codeContainer);
      if (block) blocks.push(block);
      return;
    }
    const block = blockFromElement(element, seenImages);
    if (block) {
      if (blockKey) seenBlockKeys.add(blockKey);
      blocks.push(block);
    }
  });
  if (!blocks.some((block) => block.type !== "image")) {
    const fallback = textOf(root);
    if (fallback) blocks.unshift({ type: "paragraph", text: fallback });
  }
  const content = globalThis.XToXhsMarkdown.blocksToMarkdown(blocks, { includeImages: false });
  if (!content) throw new Error("No content found. Please wait for the page to finish loading.");
  const plainText = blocks
    .filter((block) => block.type !== "image")
    .map((block) => block.text || block.url || "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const metadata = articleMetadata(root, sourceHandle, blocks);
  return {
    kind: "x-to-xhs.capture",
    version: 1,
    sourceUrl: location.href,
    ...metadata,
    content,
    plainText,
    blocks,
  };
}

function currentPageContext() {
  const sourceUrl = location.href.split(/[?#]/u)[0];
  const root = findRoot();
  const title = textOf(root?.querySelector('[data-testid="twitter-article-title"], [data-testid="articleTitle"], [data-testid="longformTitle"], h1, [role="heading"]')) || "";
  const userName = textOf(root?.querySelector('[data-testid="User-Name"]')) || textOf(document.querySelector('[data-testid="User-Name"]'));
  const userLines = userName.split("\n").map((line) => line.trim()).filter(Boolean);
  const authorHandle = userLines.find((line) => /^@[a-z0-9_]{1,15}$/iu.test(line)) || "";
  const authorName = userLines.find((line) => line && line !== authorHandle && !/^·/u.test(line)) || "";
  if (isArticleSourcePage()) {
    const candidate = articleCandidateFromPage({ displayName: authorName, handle: authorHandle });
    return { ok: true, pageKind: "article", sourceUrl, title: title || candidate?.title || document.title, authorName, authorHandle, candidateUrl: candidate?.sourceUrl || sourceUrl };
  }
  if (isArticlesIndexPage()) {
    const handle = profileHandleFromHref(location.pathname) || authorHandle;
    return { ok: true, pageKind: "author-articles", sourceUrl, title: document.title, authorName, authorHandle: handle, candidateUrl: "" };
  }
  return { ok: true, pageKind: /^https:\/\/(?:www\.)?(?:x|twitter)\.com\//u.test(sourceUrl) ? "x-page" : "unsupported", sourceUrl, title: "", authorName: "", authorHandle: "", candidateUrl: "" };
}

addRuntimeMessageListener((message, sender, sendResponse) => {
  if (message?.type !== "get-current-context") return;
  try {
    sendResponse(currentPageContext());
  } catch (error) {
    sendResponse({ ok: false, error: error.message || "无法读取当前 X 页面上下文。" });
  }
});

addRuntimeMessageListener((message, sender, sendResponse) => {
  if (message?.type !== "capture-x") return;
  capturePage()
    .then((capture) => {
      chrome.runtime.sendMessage({ type: "capture-completed", sourceUrl: capture.sourceUrl }).catch(() => {});
      sendResponse(capture);
    })
    .catch((error) => sendResponse({ error: error.message || "Failed to read the content." }));
  return true;
});

addRuntimeMessageListener((message, sender, sendResponse) => {
  if (message?.type !== "capture-current-for-sidepanel") return;
  capturePage()
    .then((capture) => { chrome.runtime.sendMessage({ type: "capture-completed", sourceUrl: capture.sourceUrl }).catch(() => {}); sendResponse(capture); })
    .catch((error) => sendResponse({ error: error.message || "Failed to read the current X page." }));
  return true;
});

addRuntimeMessageListener((message, sender, sendResponse) => {
  if (message?.type !== "x-to-md-ready") return;
  sendResponse({ ok: true, revision: CONTENT_SCRIPT_REVISION });
});

addRuntimeMessageListener((message, sender, sendResponse) => {
  if (message?.type !== "toggle-candidate-overlay") return;
  toggleCandidateOverlay()
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message || "Could not open the candidate collection." }));
  return true;
});

addRuntimeMessageListener((message, sender, sendResponse) => {
  if (message?.type !== "toggle-import-panel") return;
  toggleImportPanel();
  sendResponse({ ok: true });
});

globalThis.__xToMdContentScript = {
  revision: CONTENT_SCRIPT_REVISION,
  diagnostics: articleMenuDiagnostics,
  dispose: disposeContentScript,
};
}());
