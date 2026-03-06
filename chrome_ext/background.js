const BUILTIN_PDF_VIEWER_ID = "mhjfbmdgcfjbbpaeojofohoefgiehjai";
const VIEWER_URL = chrome.runtime.getURL("pdfjs/web/viewer.html");
const PROVIDER_TEMPLATE_STORAGE_KEY = "coolauxv_provider_templates_v1";
const PROVIDER_SECRET_STORAGE_KEY = "coolauxv_provider_custom_secrets_v1";
const DNR_RULE_ID_BASE = 20000;
const DNR_RULE_ID_LIMIT = 500;

const isOurViewer = (url) => typeof url === "string" && url.startsWith(VIEWER_URL);

const normalizePdfUrlCandidate = (value) => {
  if (!value) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const candidates = [raw];
  try {
    candidates.push(decodeURIComponent(raw));
  } catch (err) {
    // ignore decode error
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "file:" || parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch (err) {
      // keep trying
    }
  }
  return null;
};

const extractPdfUrl = (rawUrl) => {
  if (!rawUrl) {
    return null;
  }
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "chrome-extension:" && url.host === BUILTIN_PDF_VIEWER_ID) {
      const candidateParams = [
        url.searchParams.get("file"),
        url.searchParams.get("src"),
        url.searchParams.get("url")
      ];
      for (const param of candidateParams) {
        const normalized = normalizePdfUrlCandidate(param);
        if (normalized) {
          return normalized;
        }
      }
      return null;
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

const headersToString = (headers) => {
  const lines = [];
  headers.forEach((value, key) => {
    lines.push(`${key}: ${value}`);
  });
  return lines.join("\r\n");
};

const normalizePdfFilePath = (pathname) => {
  if (!pathname) return "";
  const raw = String(pathname);
  try {
    return decodeURIComponent(raw);
  } catch (err) {
    return raw;
  }
};

const isLocalPdfFileUrl = (url) => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") {
      return false;
    }
    const path = normalizePdfFilePath(parsed.pathname || "");
    return /\.pdf$/i.test(path);
  } catch (err) {
    return false;
  }
};

const serializeError = (err) => {
  if (!err) {
    return { name: "Error", message: "unknown error" };
  }
  return {
    name: err.name || "Error",
    message: err.message || String(err)
  };
};

const getHeaderValue = (responseHeaders, headerName) => {
  if (!Array.isArray(responseHeaders) || !headerName) {
    return "";
  }
  const target = String(headerName).toLowerCase();
  for (const header of responseHeaders) {
    if (!header || !header.name) continue;
    if (String(header.name).toLowerCase() !== target) continue;
    return String(header.value || "");
  }
  return "";
};

const isPdfResponseByHeaders = (responseHeaders) => {
  const contentType = getHeaderValue(responseHeaders, "content-type").toLowerCase();
  if (contentType.includes("application/pdf")) {
    return true;
  }
  const disposition = getHeaderValue(responseHeaders, "content-disposition").toLowerCase();
  if (disposition.includes(".pdf")) {
    return true;
  }
  return false;
};

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };
let currentLogLevel = "none";

const shouldLog = (level) => {
  const currentVal = LOG_LEVELS[currentLogLevel] ?? LOG_LEVELS.none;
  const targetVal = LOG_LEVELS[level] ?? LOG_LEVELS.debug;
  return targetVal >= currentVal;
};

const log = (level, ...args) => {
  if (!shouldLog(level)) {
    return;
  }
  const fn = console[level] || console.log;
  fn("[CoolAuxv]", ...args);
};

const syncLogLevel = () => new Promise((resolve) => {
  chrome.storage.local.get(["coolauxv_log_level"], (items) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      resolve();
      return;
    }
    const level = items && items.coolauxv_log_level;
    if (level && LOG_LEVELS[level] !== undefined) {
      currentLogLevel = level;
    } else {
      currentLogLevel = "none";
    }
    resolve();
  });
});

syncLogLevel();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }
  if (changes.coolauxv_log_level) {
    const nextVal = changes.coolauxv_log_level.newValue;
    if (nextVal && LOG_LEVELS[nextVal] !== undefined) {
      currentLogLevel = nextVal;
    } else {
      currentLogLevel = "none";
    }
  }
});

const normalizeSecretStore = (input) => {
  if (!input) {
    return {};
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }
  return input && typeof input === "object" ? input : {};
};

const normalizeTemplates = (input) => {
  if (!input) {
    return [];
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  return Array.isArray(input) ? input : [];
};

const applyTemplateString = (value, context) => {
  return String(value || "").replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, key) => {
    if (context && Object.prototype.hasOwnProperty.call(context, key)) {
      return context[key] ?? "";
    }
    return "";
  });
};

const buildTemplateContext = (template, secretsStore) => {
  const custom = template && template.customFields ? template.customFields : {};
  const meta = template && template.customFieldMeta ? template.customFieldMeta : {};
  const secrets = template && template.id && secretsStore[template.id]
    ? secretsStore[template.id]
    : {};
  const merged = Object.assign({}, custom);
  Object.keys(meta || {}).forEach((key) => {
    if (meta[key] && meta[key].masked && Object.prototype.hasOwnProperty.call(secrets, key)) {
      merged[key] = secrets[key];
    }
  });
  return merged;
};

const resolveTemplateBaseUrl = (template, secretsStore) => {
  if (!template || !template.baseUrl) {
    return null;
  }
  const context = buildTemplateContext(template, secretsStore);
  context.apiKey = template.apiKey || "";
  const rendered = applyTemplateString(template.baseUrl, context);
  try {
    return new URL(rendered);
  } catch (err) {
    return null;
  }
};

const loadProviderStorageSnapshot = () => new Promise((resolve) => {
  chrome.storage.local.get([PROVIDER_TEMPLATE_STORAGE_KEY, PROVIDER_SECRET_STORAGE_KEY], (items) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      resolve({ templates: [], secrets: {} });
      return;
    }
    const templates = normalizeTemplates(items[PROVIDER_TEMPLATE_STORAGE_KEY]);
    const secrets = normalizeSecretStore(items[PROVIDER_SECRET_STORAGE_KEY]);
    resolve({ templates, secrets });
  });
});

const updateOriginStripRules = async () => {
  if (!chrome.declarativeNetRequest) {
    return;
  }
  const snapshot = await loadProviderStorageSnapshot();
  const domains = new Set();
  snapshot.templates.forEach((tpl) => {
    const url = resolveTemplateBaseUrl(tpl, snapshot.secrets);
    if (url && url.hostname) {
      domains.add(url.hostname);
    }
  });
  const addRules = [];
  let idx = 0;
  for (const domain of domains) {
    if (idx >= DNR_RULE_ID_LIMIT) {
      break;
    }
    addRules.push({
      id: DNR_RULE_ID_BASE + idx,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "origin", operation: "remove" }
        ]
      },
      condition: {
        requestDomains: [domain],
        resourceTypes: ["xmlhttprequest"]
      }
    });
    idx += 1;
  }
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter((rule) => rule.id >= DNR_RULE_ID_BASE && rule.id < DNR_RULE_ID_BASE + DNR_RULE_ID_LIMIT)
    .map((rule) => rule.id);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
};

let dnrUpdateTimer = null;
const scheduleOriginStripRuleUpdate = () => {
  if (dnrUpdateTimer) {
    clearTimeout(dnrUpdateTimer);
  }
  dnrUpdateTimer = setTimeout(() => {
    dnrUpdateTimer = null;
    updateOriginStripRules().catch((err) => {
      console.warn("CoolAuxv DNR update failed", err);
    });
  }, 200);
};

const maybeRedirectBuiltinViewer = (tabId, url) => {
  if (!url || isOurViewer(url)) {
    return;
  }
  const target = extractPdfUrl(url);
  if (!target) {
    return;
  }
  redirectToViewer(tabId, target);
};

const maybeRedirectLocalPdf = (tabId, url) => {
  if (!url || isOurViewer(url)) {
    return;
  }
  if (!isLocalPdfFileUrl(url)) {
    return;
  }
  log("info", "Detected local PDF navigation, redirecting to CoolAuxv viewer", { tabId, url });
  redirectToViewer(tabId, url);
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo && changeInfo.url) {
    maybeRedirectLocalPdf(tabId, changeInfo.url);
    maybeRedirectBuiltinViewer(tabId, changeInfo.url);
    return;
  }
  if (changeInfo && changeInfo.status === "complete" && tab && tab.url) {
    maybeRedirectLocalPdf(tabId, tab.url);
    maybeRedirectBuiltinViewer(tabId, tab.url);
  }
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) {
    return;
  }
  maybeRedirectLocalPdf(details.tabId, details.url);
  maybeRedirectBuiltinViewer(details.tabId, details.url);
});

const handlePdfMainFrameHeaders = (details) => {
  if (!details || details.tabId < 0) {
    return;
  }
  if (details.frameId !== 0 || details.type !== "main_frame") {
    return;
  }
  if (isOurViewer(details.url)) {
    return;
  }
  if (!isPdfResponseByHeaders(details.responseHeaders)) {
    return;
  }
  log("info", "Detected PDF main-frame response by headers, redirecting to CoolAuxv viewer", {
    tabId: details.tabId,
    statusCode: details.statusCode,
    url: details.url
  });
  redirectToViewer(details.tabId, details.url);
};

if (chrome.webRequest && chrome.webRequest.onHeadersReceived) {
  chrome.webRequest.onHeadersReceived.addListener(
    handlePdfMainFrameHeaders,
    { urls: ["<all_urls>"], types: ["main_frame"] },
    ["responseHeaders", "extraHeaders"]
  );
}

chrome.runtime.onConnect.addListener((port) => {
  if (!port || port.name !== "coolauxv-gm-xhr") {
    return;
  }

  let controller = null;
  let closed = false;
  let streamLogCounter = 0;

  const cleanup = () => {
    controller = null;
  };

  port.onMessage.addListener(async (msg) => {
    if (!msg || closed) {
      return;
    }
    if (msg.type === "abort") {
      if (controller) {
        controller.abort();
      }
      return;
    }
    if (msg.type !== "request") {
      return;
    }

    controller = new AbortController();
    const requestInit = {
      method: msg.method || "GET",
      headers: msg.headers || {},
      body: msg.data,
      signal: controller.signal,
      credentials: "omit"
    };

    try {
      const response = await fetch(msg.url, requestInit);
      const contentType = response.headers.get("content-type") || "";
      const base = {
        status: response.status,
        statusText: response.statusText,
        responseHeaders: headersToString(response.headers),
        finalUrl: response.url,
        responseType: msg.responseType || "",
        contentType
      };

      if (msg.responseType === "stream") {
        streamLogCounter += 1;
        const logPrefix = `CoolAuxv GM stream #${streamLogCounter}`;
        log("debug", `${logPrefix} start`, { url: msg.url, contentType });
        port.postMessage({ type: "start", ...base });
        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let totalBytes = 0;
          let chunkCount = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            if (value) {
              totalBytes += value.byteLength;
              chunkCount += 1;
              const chunkText = decoder.decode(value, { stream: true });
              if (chunkText) {
                port.postMessage({ type: "chunk", chunkText });
              }
            }
          }
          const tail = decoder.decode();
          if (tail) {
            port.postMessage({ type: "chunk", chunkText: tail });
          }
          log("debug", `${logPrefix} end`, { chunks: chunkCount, bytes: totalBytes });
        } else {
          log("debug", `${logPrefix} no response.body`);
        }
        port.postMessage({ type: "end" });
        return;
      }

      let data = "";
      if (msg.responseType === "arraybuffer") {
        data = await response.arrayBuffer();
      } else if (msg.responseType === "blob") {
        const blob = await response.blob();
        data = await blob.arrayBuffer();
        base.blobType = blob.type || "";
      } else if (msg.responseType === "json") {
        data = await response.json();
      } else {
        data = await response.text();
      }

      port.postMessage({
        type: "load",
        ...base,
        data
      });
    } catch (err) {
      log("debug", "CoolAuxv GM stream error", err);
      port.postMessage({ type: "error", ...serializeError(err) });
    }
  });

  port.onDisconnect.addListener(() => {
    closed = true;
    if (controller) {
      controller.abort();
    }
    cleanup();
  });
});

chrome.runtime.onInstalled.addListener(() => {
  scheduleOriginStripRuleUpdate();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }
  if (changes[PROVIDER_TEMPLATE_STORAGE_KEY] || changes[PROVIDER_SECRET_STORAGE_KEY]) {
    scheduleOriginStripRuleUpdate();
  }
});

scheduleOriginStripRuleUpdate();
