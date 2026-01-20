const BUILTIN_PDF_VIEWER_ID = "mhjfbmdgcfjbbpaeojofohoefgiehjai";
const VIEWER_URL = chrome.runtime.getURL("pdfjs/web/viewer.html");

const isOurViewer = (url) => typeof url === "string" && url.startsWith(VIEWER_URL);

const looksLikePdf = (url) => {
  if (!url) {
    return false;
  }
  return /\.pdf($|[?#])/i.test(url);
};

const extractPdfUrl = (rawUrl) => {
  if (!rawUrl) {
    return null;
  }
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "chrome-extension:" && url.host === BUILTIN_PDF_VIEWER_ID) {
      const fileParam = url.searchParams.get("file");
      return fileParam || null;
    }
    if (url.protocol === "file:" || url.protocol === "http:" || url.protocol === "https:") {
      if (looksLikePdf(url.href)) {
        return url.href;
      }
    }
  } catch (err) {
    return null;
  }
  return null;
};

const redirectToViewer = (tabId, targetUrl) => {
  if (!targetUrl) {
    return;
  }
  const nextUrl = `${VIEWER_URL}?file=${encodeURIComponent(targetUrl)}`;
  chrome.tabs.update(tabId, { url: nextUrl });
};

const maybeRedirect = (tabId, url) => {
  if (!url || isOurViewer(url)) {
    return;
  }
  const target = extractPdfUrl(url);
  if (!target) {
    return;
  }
  redirectToViewer(tabId, target);
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo && changeInfo.url) {
    maybeRedirect(tabId, changeInfo.url);
    return;
  }
  if (changeInfo && changeInfo.status === "complete" && tab && tab.url) {
    maybeRedirect(tabId, tab.url);
  }
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) {
    return;
  }
  maybeRedirect(details.tabId, details.url);
});
