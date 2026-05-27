const BUILTIN_PDF_VIEWER_ID = "mhjfbmdgcfjbbpaeojofohoefgiehjai";
const VIEWER_URL = chrome.runtime.getURL("pdfjs/web/viewer.html");
const PROVIDER_TEMPLATE_STORAGE_KEY = "coolauxv_provider_templates_v1";
const PROVIDER_SECRET_STORAGE_KEY = "coolauxv_provider_custom_secrets_v1";
const DEBUGGER_PERSISTENT_STORAGE_KEY = "coolauxv_enable_debugger_header_persistent";
const DNR_RULE_ID_BASE = 20000;
const DNR_RULE_ID_LIMIT = 500;

const FETCH_FORBIDDEN_HEADERS = new Set([
  "accept-charset", "accept-encoding", "access-control-request-headers",
  "access-control-request-method", "connection", "content-length",
  "cookie", "cookie2", "date", "dnt", "expect", "host", "keep-alive",
  "origin", "referer", "te", "trailer", "transfer-encoding", "upgrade", "via"
]);

const hasCriticalInjectedHeaders = (headers) => {
  return Object.keys(headers || {}).some((key) => {
    const lower = String(key).toLowerCase().trim();
    return lower === "origin" || lower === "referer";
  });
};

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

const parseCookieHeader = (headerValue) => {
  const result = [];
  const raw = String(headerValue || "").trim();
  if (!raw) return result;
  raw.split(";").forEach((part) => {
    const item = String(part || "").trim();
    if (!item) return;
    const eq = item.indexOf("=");
    if (eq <= 0) return;
    const name = item.slice(0, eq).trim();
    const value = item.slice(eq + 1).trim();
    if (!name) return;
    result.push({ name, value });
  });
  return result;
};

const setCookiesForRequest = async (requestUrl, cookieHeader) => {
  if (!chrome.cookies || !chrome.cookies.set) return;
  let targetHost = "";
  try {
    targetHost = new URL(String(requestUrl || "")).hostname || "";
  } catch (e) {
    targetHost = "";
  }
  const cookies = parseCookieHeader(cookieHeader);
  if (!cookies.length) return;
  for (const c of cookies) {
    try {
      if (chrome.cookies.getAll && targetHost) {
        const existing = await chrome.cookies.getAll({ domain: targetHost, name: c.name });
        for (const item of (existing || [])) {
          try {
            const scheme = item.secure ? "https" : "http";
            const removeUrl = `${scheme}://${(item.domain || "").replace(/^\./, "")}${item.path || "/"}`;
            await chrome.cookies.remove({ url: removeUrl, name: item.name, storeId: item.storeId });
          } catch (e) {
            // ignore remove failures
          }
        }
      }
      await chrome.cookies.set({
        url: requestUrl,
        name: c.name,
        value: c.value,
        path: "/",
        secure: true,
        sameSite: "no_restriction"
      });
      log("debug", "Cookie prepared for background fetch", {
        host: targetHost,
        name: c.name,
        valueLen: String(c.value || "").length
      });
    } catch (err) {
      log("warn", "Failed to set cookie before background fetch", { url: requestUrl, name: c.name, err });
    }
  }
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
let debuggerHeaderInjectionPersistent = false;

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
  if (changes[DEBUGGER_PERSISTENT_STORAGE_KEY]) {
    debuggerHeaderInjectionPersistent = !!changes[DEBUGGER_PERSISTENT_STORAGE_KEY].newValue;
    if (!debuggerHeaderInjectionPersistent) {
      for (const tabId of Array.from(persistentDebuggerTabs)) {
        detachTabDebugger(tabId, true).catch(() => {});
      }
    } else {
      prewarmPersistentDebugger().catch(() => {});
    }
  }
});

const getActiveTab = () => new Promise((resolve) => {
  if (!chrome.tabs || !chrome.tabs.query) {
    resolve(null);
    return;
  }
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      resolve(null);
      return;
    }
    resolve(Array.isArray(tabs) && tabs.length ? tabs[0] : null);
  });
});

const syncDebuggerPersistentMode = () => new Promise((resolve) => {
  chrome.storage.local.get([DEBUGGER_PERSISTENT_STORAGE_KEY], (items) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      resolve();
      return;
    }
    debuggerHeaderInjectionPersistent = !!(items && items[DEBUGGER_PERSISTENT_STORAGE_KEY]);
    resolve();
  });
});

syncDebuggerPersistentMode();

const isDebuggerRelevantTab = (tab) => {
  if (!tab || typeof tab.url !== "string") {
    return false;
  }
  return isOurViewer(tab.url);
};

const prewarmPersistentDebugger = async () => {
  if (!debuggerHeaderInjectionPersistent || persistentDebuggerTabs.size > 0) {
    return;
  }
  const tab = await getActiveTab();
  if (!isDebuggerRelevantTab(tab)) {
    return;
  }
  try {
    await attachTabDebugger(tab.id, true);
    log("debug", "Prewarmed persistent debugger for active tab", { tabId: tab.id, url: tab.url });
  } catch (err) {
    log("warn", "Failed to prewarm persistent debugger", err);
  }
};

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

let customJsContextCache = {};
const invalidateCustomJsCache = () => { customJsContextCache = {}; };

const executeCustomJs = (template, baseContext) => {
  if (!template || !template.customJsCode) return {};
  const providerId = template.id;
  const runOnce = template.customJsRunOnce !== false;
  if (runOnce && customJsContextCache[providerId] && Object.keys(customJsContextCache[providerId]).length > 0) {
    return customJsContextCache[providerId];
  }
  const code = String(template.customJsCode).trim();
  if (!code) return {};
  const hasAwait = /\bawait\b/.test(code);
  try {
    const validIdent = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    const allKeys = Object.keys(baseContext);
    const sandboxKeys = allKeys.filter(k => validIdent.test(k));
    const sandboxValues = sandboxKeys.map(k => baseContext[k]);
    const declarationNames = [];
    code.replace(/^(?:\s*(?:const|let|var)\s+(\w+)\b\s*[=;])|(?:\s*function\s+(\w+)\b)/gm, (match, varName, funcName) => {
      const name = varName || funcName;
      if (name) declarationNames.push(name);
      return match;
    });
    const exportLines = declarationNames
      .filter((name, i, arr) => arr.indexOf(name) === i)
      .map(name => `__exports__["${name}"] = typeof ${name} !== "undefined" ? ${name} : undefined;`)
      .join("\n");
    const fnPrefix = hasAwait ? "async " : "";
    const allParamKeys = ["__bgFetch__"].concat(sandboxKeys);
    const allParamValues = [(typeof fetch === "function" ? fetch : null)].concat(sandboxValues);
    const wrapper = new Function(...allParamKeys, `
      "use strict";
      var GM_xmlhttpRequest = __bgFetch__ ? function(opts) {
        return __bgFetch__(opts.url, {
          method: opts.method || "GET",
          headers: opts.headers || {},
          body: opts.data || opts.body || undefined
        }).then(function(resp) {
          return resp.text().then(function(txt) {
            return {
              status: resp.status,
              statusText: resp.statusText || "",
              responseText: txt,
              responseHeaders: "",
              finalUrl: resp.url || opts.url || ""
            };
          });
        });
      } : null;
      return (${fnPrefix} function() {
        const __exports__ = {};
        ${code}
        ${exportLines}
        return __exports__;
      })();
    `);
    const normalizeContext = (raw) => {
      const context = {};
      Object.keys(raw || {}).forEach((key) => {
        const val = raw[key];
        if (typeof val === "function" || typeof val === "string" ||
            typeof val === "number" || typeof val === "boolean") {
          context[key] = val;
        }
      });
      return context;
    };
    const result = wrapper(...allParamValues);
    if (result && typeof result.then === "function") {
      return result.then((resolved) => {
        const context = normalizeContext(resolved || {});
        if (runOnce) customJsContextCache[providerId] = context;
        return context;
      }).catch((err) => {
        if (runOnce) delete customJsContextCache[providerId];
        throw err;
      });
    }
    const context = normalizeContext(result || {});
    if (runOnce) customJsContextCache[providerId] = context;
    return context;
  } catch (e) {
    console.warn("[CoolAuxv] Custom JS execution failed (bg):", e.message);
    return {};
  }
};

const applyTemplateString = (value, context) => {
  return String(value || "").replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, key) => {
    if (context && Object.prototype.hasOwnProperty.call(context, key)) {
      const v = context[key];
      if (typeof v === "function") {
        try { const r = v(context); return r == null ? "" : String(r); }
        catch (e) { return ""; }
      }
      return v ?? "";
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
  const jsContext = executeCustomJs(template, merged);
  return Object.assign({}, merged, jsContext);
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
    invalidateCustomJsCache();
    const templates = normalizeTemplates(items[PROVIDER_TEMPLATE_STORAGE_KEY]);
    const secrets = normalizeSecretStore(items[PROVIDER_SECRET_STORAGE_KEY]);
    resolve({ templates, secrets });
  });
});

const resolveHeadersTemplate = (tpl, secrets) => {
  if (!tpl || !tpl.headersTemplate) return {};
  let headers = tpl.headersTemplate;
  if (typeof headers === "string") {
    try { headers = JSON.parse(headers); } catch (e) { return {}; }
  }
  if (!headers || typeof headers !== "object") return {};
  const context = Object.assign({}, buildTemplateContext(tpl, secrets), { apiKey: tpl.apiKey || "" });
  const resolved = {};
  const dnrSkipHeaders = new Set(["cookie"]);
  Object.keys(headers).forEach((key) => {
    const raw = headers[key];
    if (raw === undefined || raw === null) return;
    const normalizedKey = String(key || "").toLowerCase().trim();
    if (!normalizedKey || dnrSkipHeaders.has(normalizedKey)) return;
    const rawStr = String(raw);
    // Skip dynamic template headers in DNR; they are resolved at runtime with full custom-js context.
    if (/{{\s*[^}]+\s*}}/.test(rawStr)) return;
    const value = applyTemplateString(rawStr, context).trim();
    if (value && normalizedKey) resolved[normalizedKey] = value;
  });
  return resolved;
};

const updateOriginStripRules = async () => {
  if (!chrome.declarativeNetRequest) {
    return;
  }
  const snapshot = await loadProviderStorageSnapshot();
  const domainHeaders = new Map();
  snapshot.templates.forEach((tpl) => {
    const url = resolveTemplateBaseUrl(tpl, snapshot.secrets);
    if (!url || !url.hostname) return;
    const headers = resolveHeadersTemplate(tpl, snapshot.secrets);
    const entry = domainHeaders.get(url.hostname) || {};
    Object.keys(headers).forEach((key) => {
      if (!entry[key]) entry[key] = headers[key];
    });
    if (Object.keys(entry).length) domainHeaders.set(url.hostname, entry);
  });
  const addRules = [];
  let idx = 0;
  for (const [domain, headers] of domainHeaders) {
    if (idx >= DNR_RULE_ID_LIMIT) break;
    const requestHeaders = Object.keys(headers).map((key) => ({
      header: key, operation: "set", value: headers[key]
    }));
    if (requestHeaders.length) {
      addRules.push({
        id: DNR_RULE_ID_BASE + idx,
        priority: 1,
        action: { type: "modifyHeaders", requestHeaders },
        condition: { requestDomains: [domain], resourceTypes: ["xmlhttprequest", "other"] }
      });
      idx += 1;
    }
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
  }, 50);
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
    const safeHeaders = {};
    const forbiddenHeaders = {};
    Object.keys(msg.headers || {}).forEach((key) => {
      const lowerKey = String(key || "").toLowerCase().trim();
      if (FETCH_FORBIDDEN_HEADERS.has(lowerKey)) {
        forbiddenHeaders[lowerKey] = msg.headers[key];
      } else {
        safeHeaders[key] = msg.headers[key];
      }
    });
    if (Object.keys(forbiddenHeaders).length) {
      log("debug", "Request has fetch-forbidden headers, relying on DNR rules", forbiddenHeaders);
    }
    if (forbiddenHeaders.cookie) {
      await setCookiesForRequest(msg.url, forbiddenHeaders.cookie);
    }
    const requestInit = {
      method: msg.method || "GET",
      headers: safeHeaders,
      body: msg.data,
      signal: controller.signal,
      credentials: "include"
    };
    if (forbiddenHeaders.referer) {
      requestInit.referrer = forbiddenHeaders.referer;
      requestInit.referrerPolicy = "unsafe-url";
    }

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

// --- debugger-based custom header injection ---

const pendingDebuggerRequests = new Map(); // debugId -> {port, tabId, forbiddenHeaders, persistent, targetUrl, targetMethod}
const tabDebuggerRefs = new Map(); // tabId -> count
const persistentDebuggerTabs = new Set();
const DEBUG_REQUEST_ID_HEADER = "x-coolauxv-debug-id";

const getHeaderValueByName = (headers, name) => {
  const target = String(name || "").toLowerCase();
  if (!target) return "";
  if (Array.isArray(headers)) {
    for (const item of headers) {
      if (!item || !item.name) continue;
      if (String(item.name).toLowerCase() === target) {
        return String(item.value || "");
      }
    }
    return "";
  }
  if (headers && typeof headers === "object") {
    for (const key of Object.keys(headers)) {
      if (String(key).toLowerCase() === target) {
        return String(headers[key] || "");
      }
    }
  }
  return "";
};

const isTabDebuggerAttached = async (tabId) => {
  if (!chrome.debugger || !chrome.debugger.getTargets) {
    return false;
  }
  try {
    const targets = await chrome.debugger.getTargets();
    return Array.isArray(targets) && targets.some((target) => target && target.tabId === tabId && target.attached);
  } catch (err) {
    return false;
  }
};

const detachTabDebugger = async (tabId, force = false) => {
  const persistent = persistentDebuggerTabs.has(tabId);
  if (persistent && !force && debuggerHeaderInjectionPersistent) {
    return;
  }

  const count = (tabDebuggerRefs.get(tabId) || 0) - 1;
  if (count > 0 && !force) {
    tabDebuggerRefs.set(tabId, count);
    return;
  }

  tabDebuggerRefs.delete(tabId);
  persistentDebuggerTabs.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  } catch (e) {
    // ignore detach errors
  }
};

const attachTabDebugger = async (tabId, persistent = false) => {
  if (persistent) {
    for (const oldTabId of Array.from(persistentDebuggerTabs)) {
      if (oldTabId === tabId) continue;
      await detachTabDebugger(oldTabId, true);
    }
    persistentDebuggerTabs.add(tabId);
  }
  if (await isTabDebuggerAttached(tabId)) {
    tabDebuggerRefs.set(tabId, Math.max(tabDebuggerRefs.get(tabId) || 0, 1));
    try {
      await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
        patterns: [{ requestStage: "Request" }]
      });
    } catch (e) {
      // keep going; the session may already be configured
    }
    return;
  }

  const count = tabDebuggerRefs.get(tabId) || 0;
  if (count > 0) {
    tabDebuggerRefs.set(tabId, count + 1);
    return; // already attached
  }
  await chrome.debugger.attach({ tabId }, "1.3");
  tabDebuggerRefs.set(tabId, 1);
  await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
    patterns: [{ requestStage: "Request" }]
  });
};

chrome.debugger.onEvent.addListener(async (source, method, params) => {
  if (method !== "Fetch.requestPaused") return;
  const tabId = source.tabId;
  if (!tabId) return;

  const headers = params.request.headers || {};
  const requestUrl = String(params.request && params.request.url ? params.request.url : "");
  const requestMethod = String(params.request && params.request.method ? params.request.method : "GET").toUpperCase();
  const debugIdFromHeader = getHeaderValueByName(headers, DEBUG_REQUEST_ID_HEADER);
  let matchedDebugId = null;
  let pending = null;
  if (debugIdFromHeader) {
    const direct = pendingDebuggerRequests.get(debugIdFromHeader);
    if (direct && direct.tabId === tabId) {
      matchedDebugId = debugIdFromHeader;
      pending = direct;
    }
  }
  if (!pending) {
    const pendingEntries = Array.from(pendingDebuggerRequests.entries()).reverse();
    for (const [debugId, entry] of pendingEntries) {
      if (!entry || entry.tabId !== tabId) continue;
      const targetMethod = String(entry.targetMethod || "GET").toUpperCase();
      if (targetMethod && requestMethod !== targetMethod) continue;
      const targetUrl = String(entry.targetUrl || "");
      if (targetUrl && requestUrl !== targetUrl) continue;
      matchedDebugId = debugId;
      pending = entry;
      break;
    }
  }
  if (!matchedDebugId || !pending) {
    // Not our request, continue unmodified
    try {
      await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
        requestId: params.requestId
      });
    } catch (e) { /* ignore */ }
    return;
  }

  if (!pending.persistent) {
    pendingDebuggerRequests.delete(matchedDebugId);
  }

  // Build modified headers + forbidden headers
  const modifiedHeaders = [];
  Object.keys(headers).forEach((name) => {
    const lower = String(name || "").toLowerCase();
    // Drop browser fetch-metadata style headers to better match curl-like requests.
    if (lower.startsWith("sec-fetch-")) return;
    if (lower === "priority") return;
    if (lower === DEBUG_REQUEST_ID_HEADER) return;
    modifiedHeaders.push({ name, value: headers[name] });
  });
  Object.keys(pending.forbiddenHeaders || {}).forEach((name) => {
    const lower = name.toLowerCase();
    const idx = modifiedHeaders.findIndex((h) => h.name.toLowerCase() === lower);
    if (idx >= 0) {
      modifiedHeaders[idx].value = pending.forbiddenHeaders[name];
    } else {
      modifiedHeaders.push({ name, value: pending.forbiddenHeaders[name] });
    }
  });

  log("debug", "Injecting forbidden headers via debugger", {
    debugId: matchedDebugId,
    url: requestUrl,
    headers: Object.keys(pending.forbiddenHeaders)
  });

  try {
    await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
      requestId: params.requestId,
      headers: modifiedHeaders
    });
  } catch (e) {
    log("warn", "Fetch.continueRequest failed", e);
  }

  if (!pending.persistent) {
    await detachTabDebugger(tabId);
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (!port || port.name !== "coolauxv-gm-xhr-debugger") {
    return;
  }

  let tabId = null;
  let active = true;

  port.onMessage.addListener(async (msg) => {
    if (!msg || !active) return;
    if (msg.type !== "setup") return;

    tabId = port.sender && port.sender.tab ? port.sender.tab.id : null;
    log("debug", "debugger setup", { tabId, hasDebugger: !!chrome.debugger });

    if (!tabId) {
      log("error", "debugger: no tab id from sender");
      port.postMessage({ type: "error", message: "no tab id" });
      return;
    }

    if (!chrome.debugger) {
      log("error", "debugger API not available; check debugger permission");
      port.postMessage({ type: "error", message: "debugger API not available" });
      return;
    }

    const debugId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const forbiddenHeaders = Object.assign({}, msg.forbiddenHeaders || {});
    if (forbiddenHeaders.cookie && msg.url) {
      try {
        await setCookiesForRequest(msg.url, forbiddenHeaders.cookie);
      } catch (e) {
        // keep fallback injection path
      }
    }
    const persistent = debuggerHeaderInjectionPersistent && hasCriticalInjectedHeaders(forbiddenHeaders);
    pendingDebuggerRequests.set(debugId, {
      port,
      tabId,
      forbiddenHeaders,
      persistent,
      targetUrl: msg.url || "",
      targetMethod: msg.method || "GET"
    });

    try {
      log("debug", "debugger: attempting attach to tab", { tabId });
      await attachTabDebugger(tabId, persistent);
      log("debug", "debugger: attach OK, Fetch.enable done", { tabId, persistent });
      port.postMessage({ type: "debugger_ready", debugId });
    } catch (err) {
      log("error", "debugger: attach FAILED", {
        tabId,
        message: err && err.message ? err.message : "",
        stack: err && err.stack ? err.stack : ""
      });
      pendingDebuggerRequests.delete(debugId);
      port.postMessage({ type: "error", message: err.message || "debugger attach failed" });
    }
  });

  port.onDisconnect.addListener(async () => {
    active = false;
    // Clean up any pending requests for this port
    for (const [debugId, pending] of pendingDebuggerRequests) {
      if (pending.port === port) {
        pendingDebuggerRequests.delete(debugId);
      }
    }
    if (tabId && !debuggerHeaderInjectionPersistent) {
      try { await detachTabDebugger(tabId); } catch (e) { /* ignore */ }
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabDebuggerRefs.has(tabId) || persistentDebuggerTabs.has(tabId)) {
    detachTabDebugger(tabId, true).catch(() => {});
  }
});

if (debuggerHeaderInjectionPersistent) {
  prewarmPersistentDebugger().catch(() => {});
}

// --- end debugger-based custom header injection ---

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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === "evaluateCustomJs" && msg.providerId) {
    chrome.storage.local.get([PROVIDER_TEMPLATE_STORAGE_KEY, PROVIDER_SECRET_STORAGE_KEY], (items) => {
      const templates = normalizeTemplates(items[PROVIDER_TEMPLATE_STORAGE_KEY]);
      const secretsStore = normalizeSecretStore(items[PROVIDER_SECRET_STORAGE_KEY]);
      const template = templates.find(t => t.id === msg.providerId);
      if (!template || !template.customJsCode) {
        sendResponse({});
        return;
      }
      const baseContext = buildTemplateContext(template, secretsStore);
      const context = executeCustomJs(template, baseContext);
      if (context && typeof context.then === "function") {
        context.then((resolved) => {
          sendResponse(resolved || {});
        }).catch(() => {
          sendResponse({});
        });
        return;
      }
      sendResponse(context || {});
    });
    return true;
  }
});

updateOriginStripRules().catch((err) => {
  console.warn("CoolAuxv DNR initial setup failed", err);
});
