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

let latestCapture = null;
let nativePreviewState = null;
let importPanelState = null;

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
    #x-to-md-import-panel [data-import-status]:not(:empty) {
      margin-top: 12px !important; color: rgb(244, 33, 46) !important;
      font: 400 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }
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
  panel.setAttribute("aria-label", "Save Markdown");
  panel.innerHTML = '<h2>Save Markdown</h2><p>Read the current X content. Nothing is uploaded.</p><button type="button" data-import>Extract and copy</button><div data-import-status role="status" aria-live="polite"></div>';
  document.head.append(style);
  document.body.append(panel);
  importPanelState = { panel, style };
  const button = panel.querySelector("[data-import]");
  const status = panel.querySelector("[data-import-status]");
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Extracting…";
    status.textContent = "";
    try {
      const capture = await capturePage();
      latestCapture = capture;
      await navigator.clipboard.writeText(capture.content);
      openNativePreview();
      removeImportPanel();
    } catch (error) {
      status.textContent = error.message || "Extraction failed. Please try again.";
      button.disabled = false;
      button.textContent = "Extract and copy";
    }
  });
}

function toggleImportPanel() {
  if (importPanelState) removeImportPanel();
  else {
    restoreNativePreview();
    createImportPanel();
  }
}

function nativePreviewStyle() {
  const style = document.createElement("style");
  style.id = "x-to-md-native-preview-style";
  style.textContent = `
    #x-to-md-native-preview-toolbar,
    #x-to-md-native-preview-toolbar * {
      box-sizing: border-box !important;
    }
    #x-to-md-native-preview-toolbar {
      position: fixed !important; top: 8px !important; right: 8px !important;
      z-index: 2147483647 !important; display: flex !important; gap: 0 !important;
      align-items: center !important; padding: 0 !important;
      color: #0f1419 !important; font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }
    #x-to-md-native-preview-toolbar > [data-x-toolbar-button] {
      display: flex !important; align-items: center !important; justify-content: center !important;
      width: 40px !important; height: 40px !important;
    }
    #x-to-md-native-preview-toolbar button {
      display: flex !important; align-items: center !important; justify-content: center !important;
      width: 40px !important; height: 40px !important; min-width: 40px !important;
      min-height: 40px !important; margin: 0 !important; padding: 0 !important;
      border: 0 !important; border-radius: 9999px !important; appearance: none !important;
      background: transparent !important; color: rgb(83, 100, 113) !important;
      cursor: pointer !important; font: inherit !important;
    }
    #x-to-md-native-preview-toolbar button:hover,
    #x-to-md-native-preview-toolbar button:focus-visible {
      background: rgba(15, 20, 25, .08) !important;
    }
    #x-to-md-native-preview-toolbar > [data-x-toolbar-button] svg {
      width: 24px !important; height: 24px !important; display: block !important;
      flex: 0 0 24px !important; fill: currentColor !important;
    }
    #x-to-md-native-preview-toolbar [data-copy-menu] {
      position: absolute !important; top: calc(100% + 8px) !important; right: 0 !important;
      width: 296px !important; overflow: hidden !important;
      border: 1px solid #eff3f4 !important; border-radius: 16px !important; background: #fff !important;
      box-shadow: 0 4px 12px rgba(15, 20, 25, .14), 0 0 2px rgba(15, 20, 25, .08) !important;
      color: #0f1419 !important; font: 400 15px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }
    #x-to-md-native-preview-toolbar [data-copy-menu] button {
      display: flex !important; align-items: center !important; justify-content: flex-start !important;
      width: 100% !important; height: 72px !important; min-height: 72px !important;
      margin: 0 !important; padding: 0 28px !important;
      border: 0 !important; border-radius: 0 !important; appearance: none !important; background: #fff !important; color: #0f1419 !important;
      font: 700 16px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      text-align: left !important;
    }
    #x-to-md-native-preview-toolbar [data-copy-menu] button + button { border-top: 1px solid #eff3f4 !important; }
    #x-to-md-native-preview-toolbar [data-copy-menu] button:hover { background: #f7f9f9 !important; }
    #x-to-md-native-preview-toolbar [data-copy-menu] svg { width: 24px !important; height: 24px !important; display: block !important; flex: 0 0 24px !important; margin-right: 24px !important; fill: currentColor !important; color: #0f1419 !important; }
    #x-to-md-copy-toast {
      position: fixed !important; right: 16px !important; bottom: 88px !important;
      z-index: 2147483647 !important; transform: none !important;
      margin: 0 !important; padding: 12px 16px !important;
      border: 0 !important; border-radius: 9999px !important;
      background: #0f1419 !important; color: #fff !important;
      font: 400 15px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      box-shadow: 0 4px 12px rgba(15, 20, 25, .16) !important;
    }
  `;
  return style;
}

function hideForNativePreview(element, hiddenElements, preserveLayout = false) {
  hiddenElements.push({ element, style: element.getAttribute("style") });
  if (preserveLayout) {
    element.style.setProperty("visibility", "hidden", "important");
    element.style.setProperty("pointer-events", "none", "important");
  } else {
    element.style.setProperty("display", "none", "important");
  }
}

function restoreNativePreview() {
  if (!nativePreviewState) return;
  closeNativeCopyMenu();
  if (nativePreviewState.documentClickHandler) {
    document.removeEventListener("click", nativePreviewState.documentClickHandler, true);
  }
  nativePreviewState.hiddenElements.forEach(({ element, style }) => {
    if (style === null) element.removeAttribute("style");
    else element.setAttribute("style", style);
  });
  nativePreviewState.copyToast?.remove();
  if (nativePreviewState.copyToastTimer) clearTimeout(nativePreviewState.copyToastTimer);
  nativePreviewState.toolbar.remove();
  nativePreviewState.style.remove();
  nativePreviewState = null;
}

async function copyNativePreviewMarkdown() {
  if (!latestCapture) return;
  await navigator.clipboard.writeText(
    globalThis.XToXhsMarkdown.blocksToMarkdown(latestCapture.blocks, { includeImages: false }),
  );
}

async function copyNativePreviewText() {
  if (!latestCapture) return;
  await navigator.clipboard.writeText(latestCapture.plainText || "");
}

function showCopyToast() {
  if (!nativePreviewState) return;
  nativePreviewState.copyToast?.remove();
  if (nativePreviewState.copyToastTimer) clearTimeout(nativePreviewState.copyToastTimer);
  const toast = document.createElement("div");
  toast.id = "x-to-md-copy-toast";
  toast.setAttribute("role", "status");
  toast.textContent = "Copied to clipboard";
  document.body.append(toast);
  nativePreviewState.copyToast = toast;
  nativePreviewState.copyToastTimer = setTimeout(() => {
    toast.remove();
    if (nativePreviewState?.copyToast === toast) nativePreviewState.copyToast = null;
  }, 1800);
}

function closeNativeCopyMenu() {
  if (!nativePreviewState?.copyMenu) return;
  nativePreviewState.copyMenu.remove();
  nativePreviewState.copyMenu = null;
  nativePreviewState.toolbar.querySelector("[data-preview-copy]")?.setAttribute("aria-expanded", "false");
}

function openNativePreview() {
  if (!latestCapture) throw new Error("Extract the content before opening the native preview.");
  restoreNativePreview();
  const root = findRoot();
  if (!root) throw new Error("Could not find the current X content area. Please refresh the page and try again.");

  const hiddenElements = [];
  let current = root;
  while (current && current !== document.body) {
    const parent = current.parentElement;
    if (!parent) break;
    [...parent.children]
      .filter((element) => element !== current && !element.contains(current))
      .forEach((element) => hideForNativePreview(element, hiddenElements, true));
    current = parent;
  }
  const style = nativePreviewStyle();
  const toolbar = document.createElement("aside");
  toolbar.id = "x-to-md-native-preview-toolbar";
  toolbar.setAttribute("aria-label", "Native preview controls");
  toolbar.innerHTML = '<button aria-expanded="false" aria-haspopup="menu" aria-label="Copy text" title="Copy text" role="button" class="css-g5y9jx r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-nhe8su r-yn5ncy r-clrlgt r-1ec6tlx r-1h0z5md r-15ysp7h r-4wgw6l r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l" style="border-color: rgba(0, 0, 0, 0); background-color: rgba(0, 0, 0, 0);" type="button" data-preview-copy><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 2C20.88 2 22 3.12 22 4.5v11c0 1.21-.86 2.22-2 2.45V4.5c0-.28-.22-.5-.5-.5H6.05c.23-1.14 1.24-2 2.45-2h11zm-4 4C16.88 6 18 7.12 18 8.5v11c0 1.38-1.12 2.5-2.5 2.5h-11C3.12 22 2 20.88 2 19.5v-11C2 7.12 3.12 6 4.5 6h11zM4 19.5c0 .28.22.5.5.5h11c.28 0 .5-.22.5-.5v-11c0-.28-.22-.5-.5-.5h-11c-.28 0-.5.22-.5.5v11z"></path></svg></button><button aria-label="Exit" title="Exit" role="button" class="css-g5y9jx r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-15ysp7h r-4wgw6l r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l" style="border-color: rgba(0, 0, 0, 0); background-color: rgba(0, 0, 0, 0);" type="button" data-preview-close><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg></button>';
  toolbar.innerHTML = '<div data-x-toolbar-button><button aria-expanded="false" aria-haspopup="menu" aria-label="Copy text" title="Copy text" role="button" class="css-g5y9jx r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-nhe8su r-yn5ncy r-clrlgt r-1ec6tlx r-1h0z5md r-15ysp7h r-4wgw6l r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l" style="border-color: rgba(0, 0, 0, 0); background-color: rgba(0, 0, 0, 0);" type="button" data-preview-copy><div dir="ltr" class="css-146c3p1 r-qvutc0 r-37j5jr r-q4m81j r-a023e6 r-rjixqe r-b88u0q r-1awozwy r-6koalj r-18u37iz r-16y2uox r-bcqeeo r-1777fci" style="color: rgb(83, 100, 113);"><svg viewBox="0 0 24 24" aria-hidden="true" class="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-lrvibr r-m6rgpd r-1hjwoze r-12ym1je" style="color: rgb(83, 100, 113);"><g><path d="M19.5 2C20.88 2 22 3.12 22 4.5v11c0 1.21-.86 2.22-2 2.45V4.5c0-.28-.22-.5-.5-.5H6.05c.23-1.14 1.24-2 2.45-2h11zm-4 4C16.88 6 18 7.12 18 8.5v11c0 1.38-1.12 2.5-2.5 2.5h-11C3.12 22 2 20.88 2 19.5v-11C2 7.12 3.12 6 4.5 6h11zM4 19.5c0 .28.22.5.5.5h11c.28 0 .5-.22.5-.5v-11c0-.28-.22-.5-.5-.5h-11c-.28 0-.5.22-.5.5v11z"></path></g></svg><div class="css-g5y9jx r-xoduu5"><span class="css-1jxf684 r-dnmrzs r-1udh08x r-1udbk01 r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-1b43r93 r-1cwl3u0"></span></div></div></button></div><div data-x-toolbar-button><button aria-expanded="false" aria-haspopup="menu" aria-label="Exit" title="Exit" role="button" class="css-g5y9jx r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-15ysp7h r-4wgw6l r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l" style="border-color: rgba(0, 0, 0, 0); background-color: rgba(0, 0, 0, 0);" type="button" data-preview-close><div dir="ltr" class="css-146c3p1 r-qvutc0 r-37j5jr r-q4m81j r-a023e6 r-rjixqe r-b88u0q r-1awozwy r-6koalj r-18u37iz r-16y2uox r-bcqeeo r-1777fci" style="color: rgb(83, 100, 113);"><svg viewBox="0 0 24 24" aria-hidden="true" class="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-lrvibr r-m6rgpd r-1hjwoze r-12ym1je" style="color: rgb(83, 100, 113);"><g><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></g></svg><div class="css-g5y9jx r-xoduu5"><span class="css-1jxf684 r-dnmrzs r-1udh08x r-1udbk01 r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3 r-1b43r93 r-1cwl3u0"></span></div></div></button></div>';
  document.head.append(style);
  document.body.append(toolbar);
  nativePreviewState = { hiddenElements, root, style, toolbar, copyMenu: null, copyToast: null, copyToastTimer: null, documentClickHandler: null };
  toolbar.querySelector("[data-preview-copy]").addEventListener("click", (event) => {
    event.stopPropagation();
    if (nativePreviewState.copyMenu) {
      closeNativeCopyMenu();
      return;
    }
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.setAttribute("data-copy-menu", "");
    menu.innerHTML = '<button type="button" role="menuitem" data-copy-text><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 2C20.88 2 22 3.12 22 4.5v11c0 1.21-.86 2.22-2 2.45V4.5c0-.28-.22-.5-.5-.5H6.05c.23-1.14 1.24-2 2.45-2h11zm-4 4C16.88 6 18 7.12 18 8.5v11c0 1.38-1.12 2.5-2.5 2.5h-11C3.12 22 2 20.88 2 19.5v-11C2 7.12 3.12 6 4.5 6h11zM4 19.5c0 .28.22.5.5.5h11c.28 0 .5-.22.5-.5v-11c0-.28-.22-.5-.5-.5h-11c-.28 0-.5.22-.5.5v11z"></path></svg><span>Copy text</span></button><button type="button" role="menuitem" data-copy-markdown><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 2C20.88 2 22 3.12 22 4.5v11c0 1.21-.86 2.22-2 2.45V4.5c0-.28-.22-.5-.5-.5H6.05c.23-1.14 1.24-2 2.45-2h11zm-4 4C16.88 6 18 7.12 18 8.5v11c0 1.38-1.12 2.5-2.5 2.5h-11C3.12 22 2 20.88 2 19.5v-11C2 7.12 3.12 6 4.5 6h11zM4 19.5c0 .28.22.5.5.5h11c.28 0 .5-.22.5-.5v-11c0-.28-.22-.5-.5-.5h-11c-.28 0-.5.22-.5.5v11z"></path></svg><span>Copy markdown</span></button>';
    toolbar.append(menu);
    nativePreviewState.copyMenu = menu;
    toolbar.querySelector("[data-preview-copy]").setAttribute("aria-expanded", "true");
    menu.querySelector("[data-copy-text]").addEventListener("click", () => {
      copyNativePreviewText().then(showCopyToast).finally(closeNativeCopyMenu);
    });
    menu.querySelector("[data-copy-markdown]").addEventListener("click", () => {
      copyNativePreviewMarkdown().then(showCopyToast).finally(closeNativeCopyMenu);
    });
  });
  nativePreviewState.documentClickHandler = (event) => {
    if (!toolbar.contains(event.target)) closeNativeCopyMenu();
  };
  document.addEventListener("click", nativePreviewState.documentClickHandler, true);
  toolbar.querySelector("[data-preview-close]").addEventListener("click", restoreNativePreview);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "capture-x") return;
  capturePage()
    .then((capture) => {
      latestCapture = capture;
      sendResponse(capture);
    })
    .catch((error) => sendResponse({ error: error.message || "Failed to read the content." }));
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "open-native-preview") return;
  try {
    openNativePreview();
    sendResponse({ ok: true });
  } catch (error) {
    sendResponse({ error: error.message || "The native preview could not be opened." });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "toggle-import-panel") return;
  toggleImportPanel();
  sendResponse({ ok: true });
});
