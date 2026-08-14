(function initializeXToMdContentScript() {
const previousArticleActionsEntrySlots = new Set([
  ...document.querySelectorAll("[data-x-to-md-article-actions-slot]"),
  ...[...document.querySelectorAll("[data-x-to-md-article-actions-entry]")]
    .map((entry) => entry.parentElement)
    .filter(Boolean),
]);
const removablePreviousArticleActionsEntrySlots = new Set(
  [...previousArticleActionsEntrySlots].filter(articleActionsSlotStillOwned),
);
previousArticleActionsEntrySlots.forEach((slot) => {
  if (!removablePreviousArticleActionsEntrySlots.has(slot)) neutralizeArticleActionsSlot(slot);
});
document.dispatchEvent(new CustomEvent("x-to-md:dispose-content-script"));
try {
  globalThis.__xToMdContentScript?.dispose?.();
} catch {
  // An extension reload can invalidate the previous instance's chrome.runtime.
}
removablePreviousArticleActionsEntrySlots.forEach((slot) => slot.remove());

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
  if (/^click to (?:follow|subscribe)\s+/iu.test(text)) return true;
  if (!sourceHandle) return false;
  const escapedHandle = sourceHandle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^.+\\n@${escapedHandle}\\nFollow(?:\\n|$)`, "u").test(text);
}

function articleMetadata(root, sourceHandle, blocks) {
  const title = blocks.find((block) => block.type === "heading" && block.level === 1)?.text || null;
  const candidate = isArticleSourcePage() ? articleCandidateFromPage() : null;
  return {
    authorHandle: candidate?.authorHandle || null,
    authorName: candidate?.authorName || null,
    authorAvatarUrl: candidate?.authorAvatarUrl || null,
    authorVerified: candidate?.authorVerified || false,
    coverImageUrl: candidate?.coverImageUrl || "",
    publishedAt: candidate?.publishedAt || null,
    previewExcerpt: candidate?.previewExcerpt || "",
    title: candidate?.title || title,
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

let articleMoreMenuState = null;
let articleMoreMenuPending = null;
let articleMoreTriggerState = null;
let articleActionsEntryObserver = null;
let articleActionsEntryHostObserver = null;
let articleActionsEntryWaitObserver = null;
let articleActionsEntryObservedRoot = null;
let articleActionsEntryFlushFrame = null;
let articleActionsEntryVisibleScanPending = false;
const pendingArticleActionsRoots = new Set();
const pendingArticleActionsMoreButtons = new Set();
const runtimeMessageListeners = [];
const CONTENT_INBOX_STORAGE_KEY = "x-to-md-content-inbox";
const CONTENT_SCRIPT_REVISION = "article-first-v1";
const contentScriptAbortController = new AbortController();
const contentScriptEventOptions = { signal: contentScriptAbortController.signal };
const articleMenuDiagnostics = { revision: CONTENT_SCRIPT_REVISION, stage: "initialized", history: [] };
let contentScriptDisposed = false;

document.documentElement?.setAttribute("data-x-to-md-content-script-revision", CONTENT_SCRIPT_REVISION);

function recordArticleMenuDiagnostic(stage, detail = {}) {
  articleMenuDiagnostics.stage = stage;
  articleMenuDiagnostics.history.push({ stage, detail, at: new Date().toISOString() });
  if (articleMenuDiagnostics.history.length > 20) articleMenuDiagnostics.history.shift();
  document.documentElement?.setAttribute("data-x-to-md-article-actions-stage", stage);
}

function reportArticleMenuError(error) {
  recordArticleMenuDiagnostic("error", { message: error?.message || String(error) });
  if (!/Extension context invalidated|Cannot read properties of undefined \(reading 'local'\)/u.test(error?.message || String(error))) {
    console.error("[x-to-md] Could not inject Article menu.", error);
  }
  removeArticleMoreMenu();
}

function hasExtensionStorage() {
  try {
    return Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.storage?.local);
  } catch {
    return false;
  }
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
  articleActionsEntryObserver?.disconnect();
  articleActionsEntryObserver = null;
  articleActionsEntryHostObserver?.disconnect();
  articleActionsEntryHostObserver = null;
  articleActionsEntryWaitObserver?.disconnect();
  articleActionsEntryWaitObserver = null;
  articleActionsEntryObservedRoot = null;
  if (articleActionsEntryFlushFrame !== null) window.cancelAnimationFrame(articleActionsEntryFlushFrame);
  articleActionsEntryFlushFrame = null;
  articleActionsEntryVisibleScanPending = false;
  pendingArticleActionsRoots.clear();
  pendingArticleActionsMoreButtons.clear();
  if (document.documentElement?.getAttribute("data-x-to-md-content-script-revision") === CONTENT_SCRIPT_REVISION) {
    document.documentElement.removeAttribute("data-x-to-md-content-script-revision");
    document.documentElement.removeAttribute("data-x-to-md-article-actions-stage");
  }
  removeArticleMoreMenu();
  document.querySelectorAll("[data-x-to-md-article-actions-slot]").forEach(removeOwnedArticleActionsSlotOrNeutralize);
  document.querySelectorAll("[data-x-to-md-article-actions-entry]").forEach((entry) => {
    entry.remove();
  });
  document.querySelector("#x-to-md-article-actions-entry-style")?.remove();
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

function looksLikeDisplayName(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const normalized = normalizedHandleText(text);
  if (!normalized) return false;
  if (/^(?:follow|following|unfollow|subscribe|openinapp)$/iu.test(normalized)) return false;
  if (/^\d[\d.,]*[kmb]?$/iu.test(normalized)) return false;
  if (/^[·•]+$/u.test(normalized)) return false;
  return /[\p{L}\p{N}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
}

function authorPresentationFromElement(element, handle = "", fallbackDisplayName = "", explicitRoot = null) {
  const userCell = element?.closest?.('[data-testid="UserCell"]');
  const root = explicitRoot || userCell || element?.closest?.("article") || document;
  const profileLink = [...root.querySelectorAll('a[href]')]
    .find((link) => profileHandleFromHref(link.getAttribute("href")).toLowerCase() === handle.toLowerCase()) || null;
  const avatar = profileLink?.querySelector("img")
    || root.querySelector('[data-testid^="UserAvatar-Container-"] img, [data-testid="Tweet-User-Avatar"] img, [data-testid="UserAvatar-Container"] img, img[src*="/profile_images/"]');
  const linkedIdentity = [...root.querySelectorAll('a[href]')]
    .filter((link) => profileHandleFromHref(link.getAttribute("href")).toLowerCase() === handle.toLowerCase())
    .map((link) => textOf(link))
    .find((text) => looksLikeDisplayName(text) && normalizedHandleText(text) !== normalizedHandleText(handle));
  const identityLines = [...root.querySelectorAll('[data-testid="UserName"], [data-testid="User-Name"]')]
    .map((node) => textOf(node).split("\n").map((text) => text.trim()).filter(Boolean))
    .find((lines) => lines.some((text) => normalizedHandleText(text) === normalizedHandleText(handle))) || [];
  const namedIdentity = identityLines
    .find((text) => looksLikeDisplayName(text) && normalizedHandleText(text) !== normalizedHandleText(handle));
  const profileIdentity = profileLink
    ? textOf(profileLink).split("\n").map((text) => text.trim()).filter(Boolean)
      .find((text) => looksLikeDisplayName(text) && normalizedHandleText(text) !== normalizedHandleText(handle))
    : "";
  const identity = namedIdentity || profileIdentity || linkedIdentity;
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

function isArticleSourcePage() {
  return /\/(?:status|(?:i\/)?article)\/\d+/u.test(location.pathname);
}

function canonicalArticleSourceUrl(value = location.href) {
  const fallback = String(value || "").split(/[?#]/u)[0].replace(/\/$/u, "");
  try {
    const url = new URL(value, location.origin);
    const match = url.pathname.match(/^(\/(?:[^/]+\/status|[^/]+\/article|i\/article)\/\d+)/u);
    return match ? `${url.origin}${match[1]}` : fallback;
  } catch {
    return fallback;
  }
}

function isArticlesIndexPage() {
  return /^\/[^/]+\/articles\/?$/u.test(location.pathname);
}

function statusSourceId() {
  return /^\/[^/]+\/status\/(\d+)(?:\/|$)/u.exec(location.pathname)?.[1] || "";
}

function statusSourceCardFromPage() {
  const statusId = statusSourceId();
  if (!statusId) return null;
  const statusPath = new RegExp(`^/[^/]+/status/${statusId}(?:$|[?#/])`, "u");
  return [...document.querySelectorAll('article[data-testid="tweet"]')]
    .find((card) => [...card.querySelectorAll('a[href]')]
      .some((link) => statusPath.test(link.getAttribute("href") || ""))) || null;
}

function isValidArticleActionsOwner(root) {
  if (root?.matches?.('article[data-testid="tweet"]')) {
    return !statusSourceId() || root === statusSourceCardFromPage();
  }
  return isArticleSourcePage() && root === articleActionsEntryRootFromPage();
}

function articleCandidateId(sourceUrl) {
  return `article_${canonicalArticleSourceUrl(sourceUrl).split("/").pop() || "unknown"}`;
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

function articleCandidateRootFromPage() {
  const root = findRoot();
  if (root) return root;
  const statusId = /\/status\/(\d+)/u.exec(location.pathname)?.[1];
  if (statusId) {
    const statusLink = new RegExp(`/status/${statusId}(?:$|[?#/])`, "u");
    const tweetRoot = [...document.querySelectorAll('article[data-testid="tweet"]')]
      .find((root) => [...root.querySelectorAll('a[href]')]
        .some((link) => statusLink.test(link.getAttribute("href") || "")));
    if (tweetRoot) return tweetRoot;
  }
  return document.querySelector('[data-testid="twitterArticleReadView"], [data-testid="article"], [data-testid="twitterArticleRichTextView"], [data-testid="longformRichTextComponent"], [data-testid="articleBody"]') || null;
}

function articleActionsEntryRootFromPage() {
  const captureRoot = articleCandidateRootFromPage();
  if (articleMoreButtonFromRoot(captureRoot)) return captureRoot;
  const main = document.querySelector("main");
  const moreButton = articleMoreButtonFromRoot(main);
  if (!moreButton) return captureRoot;
  return moreButton.closest('[data-testid="twitterArticleReadView"], [data-testid="article"], [data-testid="articleBody"], [data-testid="longformRichTextComponent"], article[data-testid="tweet"], [data-testid="cellInnerDiv"], [data-testid="primaryColumn"], main')
    || moreButton.closest("article")
    || moreButton.parentElement
    || captureRoot;
}

function articleCandidateAuthorFromPage(root) {
  const handle = profileHandleFromHref(location.pathname);
  if (!handle) return { handle: "", displayName: "", authorAvatarUrl: "", authorVerified: false };
  return { handle, ...authorPresentationFromElement(root, handle, handle, root) };
}

function articleCandidateFromPage(author) {
  if (!isArticleSourcePage()) return null;
  const root = articleCandidateRootFromPage();
  const pageAuthor = articleCandidateAuthorFromPage(root);
  const authorHandle = author?.handle || pageAuthor.handle;
  const authorName = pageAuthor.displayName || author?.displayName || authorHandle;
  const title = textOf(root?.querySelector('[data-testid="twitter-article-title"], [data-testid="articleTitle"], [data-testid="longformTitle"], h1, [role="heading"]')) || "Untitled Article";
  const sourceUrl = canonicalArticleSourceUrl();
  const time = root.querySelector("time");
  const cover = root.querySelector('[data-testid="article-cover-image"] img') || [...root.querySelectorAll("img")].find(isMediaImage);
  return {
    id: articleCandidateId(sourceUrl),
    contentType: "article",
    sourceUrl,
    title,
    authorHandle,
    authorName,
    authorAvatarUrl: pageAuthor.authorAvatarUrl || author?.authorAvatarUrl || "",
    coverImageUrl: cover ? originalMediaUrl(cover.currentSrc || cover.src) : "",
    publishedAt: time?.getAttribute("datetime") || null,
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
  const sourceUrl = canonicalArticleSourceUrl(new URL(link.getAttribute("href"), location.origin).toString());
  const cardText = cover?.nextElementSibling;
  const textNodes = cardText ? [...cardText.querySelectorAll('[dir="auto"]')] : [];
  const titleNode = textNodes[0] || root.querySelector('[data-testid="twitter-article-title"], [data-testid="articleTitle"], [data-testid="longformTitle"]');
  const lines = textOf(root).split("\n").map((line) => line.trim()).filter(Boolean);
  const articleMarker = lines.findIndex((line) => /^article$/iu.test(line));
  if (!cover && articleMarker < 0 && !isArticlesIndexPage()) return null;
  const title = textOf(titleNode) || lines[articleMarker + 1] || "Untitled Article";
  const authorLink = [...root.querySelectorAll('a[href^="/"]')].find((candidate) => profileHandleFromHref(candidate.getAttribute("href")));
  const handle = profileHandleFromHref(authorLink?.getAttribute("href"));
  const authorAvatar = root.querySelector('[data-testid="Tweet-User-Avatar"] img, [data-testid="UserAvatar-Container"] img');
  const coverImage = cover?.querySelector("img") || [...root.querySelectorAll("img")].find((image) => image !== authorAvatar && isMediaImage(image));
  return {
    id: `article_${sourceUrl.split("/").pop()}`,
    contentType: "article",
    sourceUrl,
    title,
    authorHandle: handle,
    authorName: textOf(root.querySelector('[data-testid="User-Name"]'))?.split("\n")[0] || handle,
    authorAvatarUrl: authorAvatar?.currentSrc || authorAvatar?.src || "",
    coverImageUrl: coverImage ? originalMediaUrl(coverImage.currentSrc || coverImage.src) : "",
    publishedAt: root.querySelector("time")?.getAttribute("datetime") || null,
    ...articlePreviewMetadata(root, cardText, title),
  };
}

function postCandidateFromRoot(root, author = null) {
  const statusLink = [...root?.querySelectorAll?.('a[href]') || []]
    .find((link) => /\/status\/\d+(?:$|[?#])/u.test(link.getAttribute("href") || ""));
  if (!statusLink) return null;
  const sourceUrl = canonicalArticleSourceUrl(new URL(statusLink.getAttribute("href"), location.origin).toString());
  const tweetText = root.querySelector('[data-testid="tweetText"]');
  const authorLink = [...root.querySelectorAll('a[href^="/"]')]
    .find((link) => profileHandleFromHref(link.getAttribute("href")));
  const handle = author?.handle || profileHandleFromHref(authorLink?.getAttribute("href"));
  const presentation = author || authorPresentationFromElement(root, handle, handle, root);
  const authorAvatar = root.querySelector('[data-testid="Tweet-User-Avatar"] img, [data-testid="UserAvatar-Container"] img');
  const media = [...root.querySelectorAll("img")].find((image) => image !== authorAvatar && isMediaImage(image));
  const title = textOf(tweetText) || "Untitled Post";
  return {
    id: `post_${sourceUrl.split("/").pop()}`,
    contentType: "post",
    sourceUrl,
    title,
    authorHandle: handle,
    authorName: presentation.displayName || handle,
    authorAvatarUrl: presentation.authorAvatarUrl || authorAvatar?.currentSrc || authorAvatar?.src || "",
    coverImageUrl: media ? originalMediaUrl(media.currentSrc || media.src) : "",
    publishedAt: root.querySelector("time")?.getAttribute("datetime") || null,
    ...articlePreviewMetadata(root, tweetText, title),
  };
}

function contentCandidateFromPage(author) {
  const root = articleCandidateRootFromPage();
  const isArticle = /\/(?:i\/)?article\/\d+/u.test(location.pathname)
    || Boolean(root?.querySelector('[data-testid="article-cover-image"], [data-testid="twitter-article-title"], [data-testid="articleText"], [data-testid="twitterArticleRichTextView"]'));
  return isArticle ? articleCandidateFromPage(author) : postCandidateFromRoot(root, author);
}

function normalizedSourceUrl(value) {
  return canonicalArticleSourceUrl(value);
}

function matchesSource(item, sourceUrl) {
  return normalizedSourceUrl(item?.sourceUrl) === normalizedSourceUrl(sourceUrl);
}

function showPageToast(message, action = null) {
  document.querySelector("#x-to-md-page-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "x-to-md-page-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.append(document.createTextNode(message));
  if (action?.label) {
    const link = document.createElement("button");
    link.type = "button";
    link.textContent = action.label;
    link.style.cssText = "margin: 0 0 0 4px !important; padding: 0 !important; border: 0 !important; background: transparent !important; color: #1d9bf0 !important; font: inherit !important; text-decoration: underline !important; cursor: pointer !important;";
    link.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-side-panel", view: action.view }).catch(() => {});
      toast.remove();
    });
    toast.append(link);
  }
  toast.style.cssText = "position: fixed !important; z-index: 2147483647 !important; right: 24px !important; bottom: 24px !important; max-width: calc(100vw - 48px) !important; padding: 12px 16px !important; border-radius: 9999px !important; background: rgb(15, 20, 25) !important; color: #fff !important; box-shadow: 0 4px 12px rgba(15, 20, 25, .2) !important; font: 700 14px/20px TwitterChirp, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif !important;";
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

async function extractAndCopyCurrentPage() {
  const candidate = contentCandidateFromPage();
  const capture = await capturePage(findRoot(), candidate?.sourceUrl || location.href, candidate, { validateLocation: true });
  await navigator.clipboard.writeText(capture.content);
  showPageToast("Markdown 已复制");
}

async function previewCurrentPageMarkdown(candidate = null, root = null) {
  if (candidate?.contentType !== "article") throw new Error("只有 Article 支持 Markdown 预览。");
  const capture = await capturePage(root || findRoot(), candidate?.sourceUrl || location.href, candidate, { validateLocation: true });
  const result = await chrome.runtime.sendMessage({ type: "open-markdown-preview", capture, canSave: true });
  if (result?.error) throw new Error(result.error);
}

async function saveCurrentPageToLibrary(candidate = null, root = null) {
  const article = candidate || contentCandidateFromPage(articleActionsAuthor(root || findRoot(), candidate));
  if (article?.contentType !== "article") throw new Error("只有 Article 可以保存为素材。");
  const capture = await capturePage(root || findRoot(), article.sourceUrl, article, { validateLocation: true });
  const result = await chrome.runtime.sendMessage({ type: "save-article-asset", capture });
  if (result?.error) throw new Error(result.error);
  showPageToast("已保存为素材 · ", { label: "查看", view: "assets" });
}

async function removeCurrentPageFromLibrary(sourceUrl) {
  const result = await chrome.runtime.sendMessage({ type: "remove-article-asset", sourceUrl });
  if (result?.error) throw new Error(result.error);
  showPageToast("已从素材库移除");
}

async function addReadingArticle(reference) {
  const result = await chrome.runtime.sendMessage({ type: "save-reading-article", reference });
  if (result?.error) throw new Error(result.error);
  showPageToast("已加入待读 · ", { label: "查看", view: "readingList" });
}

async function removeReadingArticle(sourceUrl) {
  const result = await chrome.runtime.sendMessage({ type: "remove-reading-article", sourceUrl });
  if (result?.error) throw new Error(result.error);
  showPageToast("已从待读移除");
}

async function saveCollectedAuthor(author) {
  const result = await chrome.runtime.sendMessage({ type: "save-author", author });
  if (result?.error) throw new Error(result.error);
  showPageToast("已收藏作者 · ", { label: "查看", view: "authors" });
}

async function removeCollectedAuthor(handle) {
  const result = await chrome.runtime.sendMessage({ type: "remove-author", handle });
  if (result?.error) throw new Error(result.error);
  showPageToast("已取消收藏作者");
}

function removeArticleMoreMenu() {
  document.querySelector("#x-to-md-article-actions-menu")?.remove();
  document.querySelector("#x-to-md-article-actions-style")?.remove();
  articleMoreTriggerState?.entry?.setAttribute("aria-expanded", "false");
  articleMoreMenuPending = null;
  articleMoreMenuState = null;
}

function articleActionsEntryIconPaths() {
  return [
    "M6.5 2.5h8.8l3.2 3.2v13.8A2.5 2.5 0 0 1 16 22H6.5A2.5 2.5 0 0 1 4 19.5V5A2.5 2.5 0 0 1 6.5 2.5zm8 2H6.5a.5.5 0 0 0-.5.5v14.5a.5.5 0 0 0 .5.5H16a.5.5 0 0 0 .5-.5V6.5h-2z",
    "M9.2 9.1 7.4 12l1.8 2.9 1.5-.9-1.2-2 1.2-2zm5.6 0-1.5.9 1.2 2-1.2 2 1.5.9 1.8-2.9z",
  ];
}

function articleMoreButtonFromRoot(root) {
  return [...root?.querySelectorAll?.('button[data-testid="caret"][aria-haspopup="menu"]') || []]
    .find((button) => articleActionsContextFromMoreButton(button, root)) || null;
}

function articleActionsContextFromMoreButton(moreButton, ownerRoot = null) {
  const moreSlot = moreButton?.parentElement;
  const moreWrapper = moreSlot?.parentElement?.parentElement;
  const actionsRow = moreWrapper?.parentElement;
  if (!actionsRow || moreWrapper.parentElement !== actionsRow) return null;
  if (ownerRoot?.matches?.('article[data-testid="tweet"]') && moreButton.closest('article[data-testid="tweet"]') !== ownerRoot) return null;
  return { actionsRow, moreWrapper, moreSlot };
}

function articleActionsSlotStillOwned(slot) {
  const actionsRow = slot?.parentElement;
  if (!actionsRow || !slot.shadowRoot?.querySelector("[data-x-to-md-article-actions-entry]")) return false;
  const moreButton = [...actionsRow.querySelectorAll('button[data-testid="caret"][aria-haspopup="menu"]')]
    .find((button) => articleActionsContextFromMoreButton(button)?.actionsRow === actionsRow);
  if (!moreButton) return false;
  const card = slot.closest('article[data-testid="tweet"]');
  return !card || moreButton.closest('article[data-testid="tweet"]') === card;
}

function neutralizeArticleActionsSlot(slot) {
  slot?.shadowRoot?.replaceChildren();
  slot?.querySelectorAll?.("[data-x-to-md-article-actions-entry]").forEach((entry) => entry.remove());
  slot?.removeAttribute?.("data-x-to-md-article-actions-slot");
  if (slot?.style?.marginLeft === "auto") slot.style.removeProperty("margin-left");
}

function removeOwnedArticleActionsSlotOrNeutralize(slot) {
  if (articleActionsSlotStillOwned(slot)) slot.remove();
  else neutralizeArticleActionsSlot(slot);
}

function removeInvalidArticleActionsSlots() {
  document.querySelectorAll("[data-x-to-md-article-actions-slot]").forEach((slot) => {
    const owner = slot.closest('article[data-testid="tweet"]')
      || (isArticleSourcePage() ? articleActionsEntryRootFromPage() : null);
    const moreButton = owner ? articleMoreButtonFromRoot(owner) : null;
    const context = moreButton ? articleActionsContextFromMoreButton(moreButton, owner) : null;
    if (!isValidArticleActionsOwner(owner) || !contentCandidateForActionsRoot(owner) || !context || slot.parentElement !== context.actionsRow) neutralizeArticleActionsSlot(slot);
  });
}

function articleMoreButtonsFromNode(node) {
  const element = node instanceof Element ? node : node?.parentElement;
  if (!element) return [];
  const buttons = [];
  if (element.matches?.('button[data-testid="caret"][aria-haspopup="menu"]')) buttons.push(element);
  element.querySelectorAll?.('button[data-testid="caret"][aria-haspopup="menu"]')
    .forEach((button) => buttons.push(button));
  return buttons;
}

function articleUtilityActionButtonFromRow(actionsRow) {
  return [...actionsRow?.querySelectorAll?.('button[aria-label="Grok actions"], button[aria-label="Summarize"]') || []]
    .find((button) => button.parentElement?.parentElement === actionsRow) || null;
}

function articleActionsRootFromTarget(target) {
  const tweet = target?.closest?.('article[data-testid="tweet"]');
  if (tweet) return tweet;
  return isArticleSourcePage() ? articleActionsEntryRootFromPage() : null;
}

function contentCandidateForActionsRoot(root) {
  if (!root?.isConnected) return null;
  return isArticleSourcePage() ? contentCandidateFromPage() : articleCandidateFromListRoot(root);
}

function injectArticleActionsEntry(root, targetMoreButton = null) {
  if (!root?.isConnected) return;
  if (!isValidArticleActionsOwner(root)) return;
  if (!contentCandidateForActionsRoot(root)) return;
  const moreButton = targetMoreButton || articleMoreButtonFromRoot(root);
  const main = document.querySelector("main");
  if (!moreButton?.parentElement || !main?.contains(moreButton)) return;
  const context = articleActionsContextFromMoreButton(moreButton, root);
  if (!context) return;
  const { actionsRow, moreWrapper, moreSlot } = context;
  if (actionsRow.querySelector("[data-x-to-md-article-actions-slot]")) return;
  const utilityButton = articleUtilityActionButtonFromRow(actionsRow);
  const utilitySlot = utilityButton?.parentElement || null;
  const geometrySlot = utilitySlot || moreSlot;
  const entrySlot = document.createElement("div");
  entrySlot.className = geometrySlot.className;
  entrySlot.dataset.xToMdArticleActionsSlot = "true";
  entrySlot.style.marginLeft = "auto";
  const entryRoot = entrySlot.attachShadow({ mode: "open" });
  const entry = document.createElement("button");
  entry.dataset.xToMdArticleActionsEntry = "true";
  entry.setAttribute("type", "button");
  entry.setAttribute("aria-label", "X to MD 操作");
  entry.setAttribute("aria-haspopup", "menu");
  entry.setAttribute("aria-expanded", "false");
  entry.setAttribute("title", "X to MD 操作");
  const geometryButton = utilityButton || moreButton;
  const buttonRect = geometryButton.getBoundingClientRect();
  const sourceIcon = geometryButton.querySelector("svg");
  const iconRect = sourceIcon?.getBoundingClientRect();
  const entryStyle = document.createElement("style");
  entryStyle.textContent = `
    :host { display: block; }
    button { display: flex; width: ${Math.round(buttonRect.width) || 34}px; height: ${Math.round(buttonRect.height) || 34}px; margin: 0; padding: 0; border: 0; border-radius: 9999px; align-items: center; justify-content: center; background: transparent; color: ${getComputedStyle(geometryButton).color}; cursor: pointer; transition: background-color 0.2s ease; }
    button:hover, button:focus-visible, button[aria-expanded="true"] { background-color: rgba(83, 100, 113, 0.1); outline: none; }
    svg { display: block; width: ${Math.round(iconRect?.width) || 20}px; height: ${Math.round(iconRect?.height) || 20}px; fill: currentColor; }
  `;
  const entryIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  entryIcon.setAttribute("viewBox", "0 0 24 24");
  entryIcon.setAttribute("aria-hidden", "true");
  articleActionsEntryIconPaths().forEach((pathData) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    entryIcon.append(path);
  });
  entry.append(entryIcon);
  entry.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openArticleActionsFromEntry(entry, root).catch(reportArticleMenuError);
  });
  entryRoot.append(entryStyle, entry);
  (utilitySlot || moreWrapper).before(entrySlot);
}

function injectVisibleArticleActionsEntries() {
  removeInvalidArticleActionsSlots();
  const statusCard = statusSourceCardFromPage();
  if (statusCard) {
    injectArticleActionsEntry(statusCard);
    return;
  }
  document.querySelectorAll('article[data-testid="tweet"]').forEach(injectArticleActionsEntry);
  if (isArticleSourcePage()) injectArticleActionsEntry(articleActionsEntryRootFromPage());
}

function flushArticleActionsEntries() {
  articleActionsEntryFlushFrame = null;
  if (contentScriptDisposed) return;
  const scanVisible = articleActionsEntryVisibleScanPending;
  const roots = [...pendingArticleActionsRoots];
  const moreButtons = [...pendingArticleActionsMoreButtons];
  articleActionsEntryVisibleScanPending = false;
  pendingArticleActionsRoots.clear();
  pendingArticleActionsMoreButtons.clear();
  if (scanVisible) {
    injectVisibleArticleActionsEntries();
    return;
  }
  removeInvalidArticleActionsSlots();
  roots.filter((root) => root?.isConnected).forEach(injectArticleActionsEntry);
  moreButtons.filter((button) => button?.isConnected).forEach((button) => {
    const root = articleActionsRootFromTarget(button);
    if (root) injectArticleActionsEntry(root, button);
  });
}

function scheduleArticleActionsEntries({ roots = [], moreButtons = [], scanVisible = false } = {}) {
  roots.forEach((root) => pendingArticleActionsRoots.add(root));
  moreButtons.forEach((button) => pendingArticleActionsMoreButtons.add(button));
  articleActionsEntryVisibleScanPending ||= scanVisible;
  if (contentScriptDisposed || articleActionsEntryFlushFrame !== null) return;
  articleActionsEntryFlushFrame = window.requestAnimationFrame(flushArticleActionsEntries);
}

function ensureArticleActionsEntryHostObserver() {
  if (contentScriptDisposed || articleActionsEntryHostObserver || !articleActionsEntryObservedRoot?.parentElement) return;
  const host = articleActionsEntryObservedRoot.parentElement;
  articleActionsEntryHostObserver = new MutationObserver(() => {
    const nextRoot = document.querySelector("main");
    if (!nextRoot) return;
    if (nextRoot !== articleActionsEntryObservedRoot || !articleActionsEntryObservedRoot?.isConnected) {
      startArticleActionsEntryObserver();
    }
  });
  articleActionsEntryHostObserver.observe(host, { childList: true });
}

function waitForArticleActionsEntryMain() {
  if (contentScriptDisposed || articleActionsEntryWaitObserver) return;
  const reactRoot = document.querySelector("#react-root");
  if (!reactRoot) {
    recordArticleMenuDiagnostic("missing-react-root");
    return;
  }
  recordArticleMenuDiagnostic("waiting-for-main");
  articleActionsEntryWaitObserver = new MutationObserver(() => {
    if (!document.querySelector("main")) return;
    articleActionsEntryWaitObserver?.disconnect();
    articleActionsEntryWaitObserver = null;
    startArticleActionsEntryObserver();
  });
  articleActionsEntryWaitObserver.observe(reactRoot, { childList: true, subtree: true });
  if (document.querySelector("main")) {
    articleActionsEntryWaitObserver.disconnect();
    articleActionsEntryWaitObserver = null;
    startArticleActionsEntryObserver();
  }
}

function startArticleActionsEntryObserver() {
  if (contentScriptDisposed) return;
  const timelineRoot = document.querySelector("main");
  if (!timelineRoot) {
    waitForArticleActionsEntryMain();
    return;
  }
  articleActionsEntryWaitObserver?.disconnect();
  articleActionsEntryWaitObserver = null;
  if (articleActionsEntryObserver && articleActionsEntryObservedRoot === timelineRoot && articleActionsEntryObservedRoot?.isConnected) {
    scheduleArticleActionsEntries({ scanVisible: true });
    return;
  }
  articleActionsEntryObserver?.disconnect();
  articleActionsEntryObserver = new MutationObserver((mutations) => {
    const roots = new Set();
    const moreButtons = new Set();
    mutations.forEach((mutation) => {
      const targetRoot = articleActionsRootFromTarget(mutation.target);
      if (targetRoot) roots.add(targetRoot);
      articleMoreButtonsFromNode(mutation.target).forEach((button) => moreButtons.add(button));
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        const contextualRoot = articleActionsRootFromTarget(node);
        if (contextualRoot) roots.add(contextualRoot);
        articleMoreButtonsFromNode(node).forEach((button) => moreButtons.add(button));
        node.querySelectorAll?.('article[data-testid="tweet"]')
          .forEach((root) => roots.add(root));
      });
    });
    scheduleArticleActionsEntries({ roots, moreButtons });
  });
  articleActionsEntryObserver.observe(timelineRoot, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-harvest-observe-id"],
  });
  articleActionsEntryObservedRoot = timelineRoot;
  articleActionsEntryHostObserver?.disconnect();
  articleActionsEntryHostObserver = null;
  ensureArticleActionsEntryHostObserver();
  recordArticleMenuDiagnostic("observing-main");
  scheduleArticleActionsEntries({ scanVisible: true });
}

function saveAuthorIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4c-1.105 0-2 .9-2 2s.895 2 2 2 2-.9 2-2-.895-2-2-2zM6 6c0-2.21 1.791-4 4-4s4 1.79 4 4-1.791 4-4 4-4-1.79-4-4zm13 4v3h2v-3h3V8h-3V5h-2v3h-3v2h3zM3.651 19h12.698c-.337-1.8-1.023-3.21-1.945-4.19C13.318 13.65 11.838 13 10 13s-3.317.65-4.404 1.81c-.922.98-1.608 2.39-1.945 4.19zm.486-5.56C5.627 11.85 7.648 11 10 11s4.373.85 5.863 2.44c1.477 1.58 2.366 3.8 2.632 6.46l.11 1.1H1.395l.11-1.1c.266-2.66 1.155-4.88 2.632-6.46z"></path></svg>';
}

function removeAuthorIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4c-1.105 0-2 .9-2 2s.895 2 2 2 2-.9 2-2-.895-2-2-2zM6 6c0-2.21 1.791-4 4-4s4 1.79 4 4-1.791 4-4 4-4-1.79-4-4zm12.586 3l-2.043-2.04 1.414-1.42L20 7.59l2.043-2.05-1.414-1.42L18.586 9zM3.651 19h12.698c-.337-1.8-1.023-3.21-1.945-4.19C13.318 13.65 11.838 13 10 13s-3.317.65-4.404 1.81c-.922.98-1.608 2.39-1.945 4.19zm.486-5.56C5.627 11.85 7.648 11 10 11s4.373.85 5.863 2.44c1.477 1.58 2.366 3.8 2.632 6.46l.11 1.1H1.395l.11-1.1c.266-2.66 1.155-4.88 2.632-6.46z"></path></svg>';
}

function setMenuRowIcon(row, icon) {
  const svg = document.createRange().createContextualFragment(icon).firstElementChild;
  if (!svg) return;
  row.querySelectorAll("svg").forEach((existing) => existing.remove());
  const iconSlot = document.createElement("span");
  iconSlot.className = "x-to-md-menu-icon";
  iconSlot.setAttribute("aria-hidden", "true");
  iconSlot.style.cssText = "display: flex !important; width: 24px !important; height: 24px !important; min-width: 24px !important; min-height: 24px !important; margin-right: 12px !important; align-items: center !important; justify-content: center !important; color: currentColor !important;";
  svg.style.cssText = "display: block !important; width: 24px !important; height: 24px !important; fill: currentColor !important; color: currentColor !important;";
  iconSlot.append(svg);
  row.prepend(iconSlot);
}

function readingTrayIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5h17l-2 12.5H5.5L3.5 5.5zm2.7 2 1.1 7h9.4l1.1-7H6.2zM8 3h8v2H8z"></path><path d="M9 11h6v2H9z"></path></svg>';
}

function libraryBookmarkIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5A2.5 2.5 0 0 1 7.5 1h9A2.5 2.5 0 0 1 19 3.5V23l-7-4.5L5 23V3.5zm2.5 0v15.85l4.5-2.9 4.5 2.9V3.5a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5z"></path></svg>';
}

function copyTextIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10A2.5 2.5 0 0 1 19.5 6v12A2.5 2.5 0 0 1 17 20.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5zm0 2a.5.5 0 0 0-.5.5v12a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V6a.5.5 0 0 0-.5-.5H7z"></path><path d="M8 8h8v1.75H8zm0 3.5h8v1.75H8zm0 3.5h5v1.75H8z"></path></svg>';
}

function markdownPreviewIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 2.5h8.8l3.2 3.2v13.8A2.5 2.5 0 0 1 16 22H6.5A2.5 2.5 0 0 1 4 19.5V5A2.5 2.5 0 0 1 6.5 2.5zm8 2H6.5a.5.5 0 0 0-.5.5v14.5a.5.5 0 0 0 .5.5H16a.5.5 0 0 0 .5-.5V6.5h-2z"></path><path d="M9.2 9.1 7.4 12l1.8 2.9 1.5-.9-1.2-2 1.2-2zm5.6 0-1.5.9 1.2 2-1.2 2 1.5.9 1.8-2.9z"></path></svg>';
}

function articleActionsAuthor(root, fallbackCandidate = null) {
  const context = currentPageContext();
  const handle = fallbackCandidate?.authorHandle || context?.authorHandle || "";
  if (!handle) return null;
  const presentation = authorPresentationFromElement(
    root,
    handle,
    fallbackCandidate?.authorName || context?.authorName || handle,
    root,
  );
  return {
    handle,
    profileUrl: `https://x.com/${handle.slice(1)}`,
    ...presentation,
  };
}

function positionArticleActionsMenu(menu, entry) {
  const entryRect = entry.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const left = Math.min(Math.max(entryRect.right - menuRect.width, 8), window.innerWidth - menuRect.width - 8);
  const below = entryRect.bottom + 4;
  const above = entryRect.top - menuRect.height - 4;
  menu.style.left = `${left}px`;
  menu.style.top = `${below + menuRect.height <= window.innerHeight - 8 ? below : Math.max(8, above)}px`;
}

function createArticleActionsMenuStyle() {
  const style = document.createElement("style");
  style.id = "x-to-md-article-actions-style";
  style.textContent = `
    #x-to-md-article-actions-menu,
    #x-to-md-article-actions-menu * { box-sizing: border-box !important; }
    #x-to-md-article-actions-menu {
      position: fixed !important;
      z-index: 2147483647 !important;
      width: 300px !important;
      max-width: calc(100vw - 16px) !important;
      padding: 8px 0 !important;
      border-radius: 12px !important;
      overflow: hidden !important;
      box-shadow: 0 0 15px rgba(101, 119, 134, 0.2), 0 0 3px 1px rgba(101, 119, 134, 0.15) !important;
    }
    #x-to-md-article-actions-menu [data-x-to-md-action] {
      display: flex !important;
      width: 100% !important;
      min-height: 44px !important;
      margin: 0 !important;
      padding: 12px 16px !important;
      border: 0 !important;
      border-radius: 0 !important;
      align-items: center !important;
      background: transparent !important;
      color: inherit !important;
      font: inherit !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      line-height: 20px !important;
      text-align: left !important;
      cursor: pointer !important;
    }
    #x-to-md-article-actions-menu [data-x-to-md-action]:hover,
    #x-to-md-article-actions-menu [data-x-to-md-action]:focus-visible {
      background: rgba(83, 100, 113, 0.1) !important;
      outline: none !important;
    }
  `;
  return style;
}

async function showArticleActionsMenu(entry, sourceCandidate, root) {
  if (!hasExtensionStorage()) return;
  if (articleMoreMenuState?.entry === entry) {
    removeArticleMoreMenu();
    return;
  }
  if (articleMoreMenuPending === entry) return;
  removeArticleMoreMenu();
  articleMoreMenuPending = entry;
  const discoveredAuthor = articleActionsAuthor(root, sourceCandidate);
  const candidate = sourceCandidate && discoveredAuthor ? {
    ...sourceCandidate,
    authorHandle: sourceCandidate.authorHandle || discoveredAuthor.handle,
    authorName: sourceCandidate.authorName || discoveredAuthor.displayName,
  } : sourceCandidate;
  if (!candidate) {
    recordArticleMenuDiagnostic("missing-menu-context", { hasCandidate: false });
    articleMoreMenuPending = null;
    return;
  }
  let stored;
  try {
    stored = await chrome.storage.local.get(CONTENT_INBOX_STORAGE_KEY);
  } catch (error) {
    if (articleMoreMenuPending === entry) articleMoreMenuPending = null;
    throw error;
  }
  if (articleMoreMenuPending !== entry || !entry.isConnected) return;
  articleMoreMenuPending = null;
  recordArticleMenuDiagnostic("storage-read");
  const inbox = stored[CONTENT_INBOX_STORAGE_KEY]?.schemaVersion === 1 ? stored[CONTENT_INBOX_STORAGE_KEY] : {};
  const author = discoveredAuthor || {
    handle: candidate.authorHandle || "",
    displayName: candidate.authorName || candidate.authorHandle || "",
    authorAvatarUrl: candidate.authorAvatarUrl || "",
    authorVerified: Boolean(candidate.authorVerified),
    description: "",
  };
  const isAuthorSaved = (inbox.authors || []).some((item) => item.handle?.replace(/^@/u, "").toLowerCase() === author.handle?.replace(/^@/u, "").toLowerCase());
  const isInReadingList = (inbox.readingList || []).some((item) => matchesSource(item, candidate.sourceUrl));
  const isInLibrary = (inbox.assets || []).some((item) => matchesSource(item, candidate.sourceUrl));
  const menu = document.createElement("div");
  menu.id = "x-to-md-article-actions-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "X to MD 操作");
  const pageStyle = getComputedStyle(document.body);
  menu.style.backgroundColor = pageStyle.backgroundColor;
  menu.style.color = pageStyle.color;
  const actionRow = (label, icon, action) => {
    const row = document.createElement("button");
    row.type = "button";
    row.setAttribute("role", "menuitem");
    row.dataset.xToMdAction = action;
    setMenuRowIcon(row, icon);
    const labelSlot = document.createElement("span");
    labelSlot.textContent = label;
    row.append(labelSlot);
    const runAction = async () => {
      if (action === "author") {
        if (isAuthorSaved) await removeCollectedAuthor(author.handle);
        else await saveCollectedAuthor(author);
      } else if (action === "preview") {
        await previewCurrentPageMarkdown(candidate, root);
      } else if (action === "copy-markdown") {
        await extractAndCopyCurrentPage();
      } else if (action === "library") {
        if (isInLibrary) await removeCurrentPageFromLibrary(candidate.sourceUrl);
        else await saveCurrentPageToLibrary(candidate, root);
      } else if (isInReadingList) {
        await removeReadingArticle(candidate.sourceUrl);
      } else {
        await addReadingArticle(candidate);
      }
      removeArticleMoreMenu();
    };
    row.addEventListener("click", (event) => {
      event.stopPropagation();
      runAction().catch(reportArticleMenuError);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); runAction().catch(removeArticleMoreMenu); }
    });
    return row;
  };
  if (candidate.contentType === "post") {
    menu.append(actionRow("复制 Markdown", copyTextIcon(), "copy-markdown"));
  } else if (!isArticleSourcePage()) {
    menu.append(actionRow(isInReadingList ? "从待读移除" : "加入待读", readingTrayIcon(), "reading-list"));
  } else {
    menu.append(
      actionRow(isInLibrary ? "从素材库移除" : "保存为素材", libraryBookmarkIcon(), "library"),
      actionRow("预览 / 复制 Markdown", markdownPreviewIcon(), "preview"),
      actionRow(isAuthorSaved ? "取消收藏作者" : "收藏作者", isAuthorSaved ? removeAuthorIcon() : saveAuthorIcon(), "author"),
    );
  }
  const style = createArticleActionsMenuStyle();
  document.head.append(style);
  document.body.append(menu);
  positionArticleActionsMenu(menu, entry);
  entry.setAttribute("aria-expanded", "true");
  articleMoreMenuState = { menu, entry };
  recordArticleMenuDiagnostic("actions-menu-opened");
}

async function openArticleActionsFromEntry(entry, sourceRoot = null) {
  const root = sourceRoot || articleActionsRootFromTarget(entry);
  if (!root) {
    recordArticleMenuDiagnostic("missing-actions-entry-context", { hasRoot: false });
    return;
  }
  const candidate = contentCandidateForActionsRoot(root);
  articleMoreTriggerState = { candidate, root, entry };
  recordArticleMenuDiagnostic("actions-entry-triggered", { hasCandidate: Boolean(candidate) });
  await showArticleActionsMenu(entry, candidate, root);
}

startArticleActionsEntryObserver();

document.addEventListener("mousedown", (event) => {
  if (articleMoreMenuState
    && !event.target.closest("#x-to-md-article-actions-menu")
    && !event.target.closest("[data-x-to-md-article-actions-slot]")) removeArticleMoreMenu();
}, { capture: true, ...contentScriptEventOptions });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && articleMoreMenuState) {
    const entry = articleMoreMenuState.entry;
    removeArticleMoreMenu();
    entry?.focus();
  }
}, contentScriptEventOptions);
window.addEventListener("resize", removeArticleMoreMenu, contentScriptEventOptions);
window.addEventListener("scroll", removeArticleMoreMenu, { capture: true, ...contentScriptEventOptions });

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

async function prepareTargetContent(root) {
  if (!root?.isConnected) throw new Error("目标内容已离开页面，请重新打开原文后重试。");
  await expandCollapsedContent(root);
  if (!root.isConnected) throw new Error("目标内容在采集过程中发生变化，请重试。");
}

async function capturePage(root = findRoot(), sourceUrl = location.href, sourceCandidate = null, { validateLocation = false } = {}) {
  if (!root) throw new Error("Open a post or Article and try again.");
  const expectedSourceUrl = normalizedSourceUrl(sourceUrl);
  if (validateLocation && expectedSourceUrl && expectedSourceUrl !== normalizedSourceUrl(location.href)) {
    throw new Error("当前页面与目标原文不一致。");
  }
  await prepareTargetContent(root);
  if (validateLocation && expectedSourceUrl && expectedSourceUrl !== normalizedSourceUrl(location.href)) {
    throw new Error("采集过程中原文地址发生变化，请重试。");
  }
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
  const documentTitle = sourceCandidate?.title
    || textOf(root.querySelector?.('[data-testid="twitter-article-title"], [data-testid="articleTitle"], [data-testid="longformTitle"]'))
    || blocks.find((block) => block.type === "heading" && block.level === 1)?.text
    || "";
  const normalizedBlocks = globalThis.XToXhsMarkdown.withoutRepeatedDocumentTitle(blocks, documentTitle);
  const content = globalThis.XToXhsMarkdown.blocksToMarkdown(normalizedBlocks, { includeImages: false });
  if (!content) throw new Error("No content found. Please wait for the page to finish loading.");
  const plainText = normalizedBlocks
    .filter((block) => block.type !== "image")
    .map((block) => block.text || block.url || "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const metadata = sourceCandidate ? {
    authorHandle: sourceCandidate.authorHandle || null,
    authorName: sourceCandidate.authorName || null,
    authorAvatarUrl: sourceCandidate.authorAvatarUrl || null,
    authorVerified: sourceCandidate.authorVerified || false,
    coverImageUrl: sourceCandidate.coverImageUrl || "",
    publishedAt: sourceCandidate.publishedAt || null,
    previewExcerpt: sourceCandidate.previewExcerpt || "",
    title: sourceCandidate.title || null,
    metrics: {},
  } : articleMetadata(root, sourceHandle, normalizedBlocks);
  return {
    kind: "x-to-xhs.capture",
    version: 1,
    contentType: sourceCandidate?.contentType || contentCandidateFromPage()?.contentType || "article",
    sourceUrl: expectedSourceUrl || normalizedSourceUrl(sourceUrl),
    ...metadata,
    content,
    plainText,
    blocks: normalizedBlocks,
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
  if (message?.type !== "capture-x") return;
  capturePage()
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message || "Failed to read the content." }));
  return true;
});

addRuntimeMessageListener((message, sender, sendResponse) => {
  if (message?.type !== "x-to-md-ready") return;
  sendResponse({ ok: true, revision: CONTENT_SCRIPT_REVISION });
});

globalThis.__xToMdContentScript = {
  revision: CONTENT_SCRIPT_REVISION,
  diagnostics: articleMenuDiagnostics,
  dispose: disposeContentScript,
};
}());
