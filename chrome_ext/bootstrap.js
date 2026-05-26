(() => {
  if (globalThis.__coolauxv_bootstrapped) {
    return;
  }
  globalThis.__coolauxv_bootstrapped = true;

  if (window.top !== window) {
    return;
  }

  const storage = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local)
    ? chrome.storage.local
    : null;
  const gmStore = {};
  const resourceText = {};

  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  const loadStorage = () => new Promise((resolve) => {
    if (!storage) {
      resolve({});
      return;
    }
    storage.get(null, (items) => resolve(items || {}));
  });

  const onStorageChange = (changes, area) => {
    if (area !== "local") {
      return;
    }
    Object.keys(changes).forEach((key) => {
      const change = changes[key];
      if (!change || !("newValue" in change)) {
        return;
      }
      if (change.newValue === undefined) {
        delete gmStore[key];
      } else {
        gmStore[key] = change.newValue;
      }
    });
  };

  const ensureDomReady = () => new Promise((resolve) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    } else {
      resolve();
    }
  });

  const loadText = async (path) => {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) {
      throw new Error("chrome.runtime.getURL is not available");
    }
    const res = await fetch(chrome.runtime.getURL(path));
    if (!res.ok) {
      throw new Error(`Failed to load ${path}: ${res.status}`);
    }
    return res.text();
  };

  const loadScript = async (path) => {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.getURL) {
      throw new Error("chrome.runtime.getURL is not available");
    }
    const res = await fetch(chrome.runtime.getURL(path));
    if (!res.ok) {
      throw new Error(`Failed to load ${path}: ${res.status}`);
    }
    const code = await res.text();
    const sourceUrl = chrome.runtime.getURL(path);
    const fn = new Function(`${code}\n//# sourceURL=${sourceUrl}`);
    fn();
  };

  const GM_addStyle = (cssText) => {
    if (!cssText) {
      return null;
    }
    const style = document.createElement("style");
    style.textContent = cssText;
    (document.head || document.documentElement).appendChild(style);
    return style;
  };

  const GM_getValue = (key, defaultValue) => {
    return hasOwn(gmStore, key) ? gmStore[key] : defaultValue;
  };

  const GM_setValue = (key, value) => {
    gmStore[key] = value;
    if (!storage) {
      return;
    }
    const data = {};
    data[key] = value;
    storage.set(data);
  };

  const GM_deleteValue = (key) => {
    delete gmStore[key];
    if (storage) {
      storage.remove(key);
    }
  };

  const fallbackCopy = (text) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("Clipboard fallback failed", err);
    }
    textarea.remove();
  };

  const GM_setClipboard = (text) => {
    const value = text == null ? "" : String(text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).catch(() => fallbackCopy(value));
      return;
    }
    fallbackCopy(value);
  };

  const GM_getResourceText = (name) => {
    return resourceText[name] || "";
  };

  const headersToString = (headers) => {
    const lines = [];
    headers.forEach((value, key) => {
      lines.push(`${key}: ${value}`);
    });
    return lines.join("\r\n");
  };

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

  const GM_xmlhttpRequestWithFetch = (options) => {
    const opts = options || {};
    const controller = new AbortController();
    let timeoutId = null;
    let completed = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    if (opts.timeout) {
      timeoutId = setTimeout(() => {
        if (completed) {
          return;
        }
        completed = true;
        controller.abort();
        if (opts.ontimeout) {
          opts.ontimeout({ status: 0, statusText: "timeout" });
        }
      }, opts.timeout);
    }

    fetch(opts.url, {
      method: opts.method || "GET",
      headers: opts.headers || {},
      body: opts.data,
      signal: controller.signal,
      credentials: "omit"
    }).then(async (response) => {
      if (completed) {
        return;
      }
      const base = {
        status: response.status,
        statusText: response.statusText,
        responseHeaders: headersToString(response.headers),
        finalUrl: response.url
      };

      if (opts.responseType === "stream" && response.body) {
        const streams = response.body.tee();
        const streamForScript = streams[0];
        const streamForLoad = streams[1];

        const startRes = {
          ...base,
          response: streamForScript
        };
        if (opts.onloadstart) {
          opts.onloadstart(startRes);
        }
        if (opts.onload) {
          const text = await new Response(streamForLoad).text();
          opts.onload({
            ...base,
            response: streamForScript,
            responseText: text
          });
        }
        completed = true;
        cleanup();
        return;
      }

      let data = "";
      if (opts.responseType === "arraybuffer") {
        data = await response.arrayBuffer();
      } else if (opts.responseType === "blob") {
        data = await response.blob();
      } else if (opts.responseType === "json") {
        data = await response.json();
      } else {
        data = await response.text();
      }

      const res = {
        ...base,
        response: data,
        responseText: typeof data === "string" ? data : ""
      };

      if (opts.onloadstart) {
        opts.onloadstart(res);
      }
      if (opts.onload) {
        opts.onload(res);
      }
      completed = true;
      cleanup();
    }).catch((err) => {
      if (completed) {
        return;
      }
      completed = true;
      cleanup();
      if (err && err.name === "AbortError") {
        return;
      }
      if (opts.onerror) {
        opts.onerror(err);
      }
    });

    return {
      abort: () => {
        if (completed) {
          return;
        }
        completed = true;
        cleanup();
        controller.abort();
      }
    };
  };

  const GM_xmlhttpRequestViaBackground = (options) => {
    const opts = options || {};
    const responseType = opts.responseType || "";
    const port = chrome.runtime.connect({ name: "coolauxv-gm-xhr" });
    let completed = false;
    let timeoutId = null;
    let responseBase = null;
    let streamController = null;
    let streamQueue = [];
    let streamClosed = false;
    let stream = null;
    let responseText = "";
    const decoder = responseType === "stream" && typeof TextDecoder !== "undefined"
      ? new TextDecoder("utf-8")
      : null;
    const encoder = responseType === "stream" && typeof TextEncoder !== "undefined"
      ? new TextEncoder()
      : null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      try {
        port.disconnect();
      } catch (e) {
        // ignore
      }
    };

    const fail = (err) => {
      if (completed) return;
      completed = true;
      cleanup();
      if (opts.onerror) opts.onerror(err);
    };

    const ensureStream = () => {
      if (stream) return stream;
      stream = new ReadableStream({
        start(controller) {
          streamController = controller;
          if (streamQueue.length) {
            streamQueue.forEach((chunk) => controller.enqueue(chunk));
            streamQueue = [];
          }
          if (streamClosed) controller.close();
        },
        cancel() {
          try { port.postMessage({ type: "abort" }); } catch (e) { /* ignore */ }
        }
      });
      return stream;
    };

    if (opts.timeout) {
      timeoutId = setTimeout(() => {
        if (completed) return;
        completed = true;
        try { port.postMessage({ type: "abort" }); } catch (e) { /* ignore */ }
        cleanup();
        if (opts.ontimeout) opts.ontimeout({ status: 0, statusText: "timeout" });
      }, opts.timeout);
    }

    port.onMessage.addListener((msg) => {
      if (!msg || completed) return;
      if (msg.type === "start") {
        responseBase = {
          status: msg.status || 0,
          statusText: msg.statusText || "",
          responseHeaders: msg.responseHeaders || "",
          finalUrl: msg.finalUrl || opts.url || ""
        };
        if (responseType === "stream" && opts.onloadstart) {
          opts.onloadstart({ ...responseBase, response: ensureStream() });
        }
        return;
      }
      if (msg.type === "chunk" && responseType === "stream") {
        let chunk = null;
        if (typeof msg.chunkText === "string") {
          if (msg.chunkText) {
            responseText += msg.chunkText;
            chunk = encoder ? encoder.encode(msg.chunkText) : new TextEncoder().encode(msg.chunkText);
          }
        } else if (msg.chunk) {
          chunk = new Uint8Array(msg.chunk);
          if (decoder) responseText += decoder.decode(chunk, { stream: true });
        }
        if (chunk) {
          if (streamController) streamController.enqueue(chunk);
          else streamQueue.push(chunk);
        }
        return;
      }
      if (msg.type === "end" && responseType === "stream") {
        streamClosed = true;
        if (streamController) streamController.close();
        if (decoder) responseText += decoder.decode();
        if (opts.onload) {
          opts.onload({
            ...(responseBase || { status: 0, statusText: "" }),
            response: stream || ensureStream(),
            responseText
          });
        }
        completed = true;
        cleanup();
        return;
      }
      if (msg.type === "load") {
        const base = {
          status: msg.status || 0,
          statusText: msg.statusText || "",
          responseHeaders: msg.responseHeaders || "",
          finalUrl: msg.finalUrl || opts.url || ""
        };
        let data = msg.data;
        if (msg.responseType === "blob") {
          data = new Blob([msg.data || new ArrayBuffer(0)], { type: msg.blobType || "" });
        }
        const res = { ...base, response: data, responseText: typeof data === "string" ? data : "" };
        if (opts.onloadstart) opts.onloadstart(res);
        if (opts.onload) opts.onload(res);
        completed = true;
        cleanup();
        return;
      }
      if (msg.type === "error") {
        const err = new Error(msg.message || "GM_xmlhttpRequest error");
        if (msg.name) err.name = msg.name;
        fail(err);
      }
    });

    port.onDisconnect.addListener(() => {
      if (completed) return;
      fail(new Error("GM_xmlhttpRequest disconnected"));
    });

    try {
      port.postMessage({
        type: "request",
        url: opts.url,
        method: opts.method || "GET",
        headers: opts.headers || {},
        data: opts.data,
        responseType
      });
    } catch (err) {
      fail(err);
    }

    return {
      abort: () => {
        if (completed) return;
        completed = true;
        try { port.postMessage({ type: "abort" }); } catch (e) { /* ignore */ }
        cleanup();
      }
    };
  };

  const GM_xmlhttpRequestWithDebugger = (options) => {
    const opts = options || {};
    const abortController = new AbortController();
    let timeoutId = null;
    let completed = false;
    let debuggerPort = null;
    let debuggerReady = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (debuggerPort) {
        try { debuggerPort.disconnect(); } catch (e) { /* ignore */ }
        debuggerPort = null;
      }
    };

    const fail = (err) => {
      if (completed) return;
      completed = true;
      cleanup();
      if (opts.onerror) opts.onerror(err);
    };

    const safeHeaders = {};
    const forbiddenHeaders = {};
    Object.keys(opts.headers || {}).forEach((key) => {
      const lowerKey = String(key).toLowerCase().trim();
      if (FETCH_FORBIDDEN_HEADERS.has(lowerKey)) forbiddenHeaders[lowerKey] = opts.headers[key];
      else safeHeaders[key] = opts.headers[key];
    });

    if (opts.timeout) {
      timeoutId = setTimeout(() => {
        if (completed) return;
        completed = true;
        cleanup();
        if (opts.ontimeout) opts.ontimeout({ status: 0, statusText: "timeout" });
      }, opts.timeout);
    }

    const doFetch = () => {
      fetch(opts.url, {
        method: opts.method || "GET",
        headers: safeHeaders,
        body: opts.data,
        signal: abortController.signal,
        credentials: "omit"
      }).then(async (response) => {
        if (completed) return;
        const base = {
          status: response.status,
          statusText: response.statusText,
          responseHeaders: headersToString(response.headers),
          finalUrl: response.url
        };

        if (opts.responseType === "stream" && response.body) {
          const streams = response.body.tee();
          const streamForScript = streams[0];
          const streamForLoad = streams[1];
          const startRes = { ...base, response: streamForScript };
          if (opts.onloadstart) opts.onloadstart(startRes);
          if (opts.onload) {
            const text = await new Response(streamForLoad).text();
            opts.onload({ ...base, response: streamForScript, responseText: text });
          }
          completed = true;
          cleanup();
          return;
        }

        let data = "";
        if (opts.responseType === "arraybuffer") data = await response.arrayBuffer();
        else if (opts.responseType === "blob") data = await response.blob();
        else if (opts.responseType === "json") data = await response.json();
        else data = await response.text();

        const res = { ...base, response: data, responseText: typeof data === "string" ? data : "" };
        if (opts.onloadstart) opts.onloadstart(res);
        if (opts.onload) opts.onload(res);
        completed = true;
        cleanup();
      }).catch((err) => {
        if (completed) return;
        completed = true;
        cleanup();
        if (err && err.name === "AbortError") return;
        if (opts.onerror) opts.onerror(err);
      });
    };

    debuggerPort = chrome.runtime.connect({ name: "coolauxv-gm-xhr-debugger" });
    debuggerPort.onMessage.addListener((msg) => {
      if (completed) return;
      if (msg.type === "debugger_ready") {
        debuggerReady = true;
        if (msg.debugId) safeHeaders["X-CoolAuxv-Debug-Id"] = msg.debugId;
        doFetch();
      } else if (msg.type === "error") {
        fail(new Error(msg.message || "debugger setup failed"));
      }
    });
    debuggerPort.onDisconnect.addListener(() => {
      if (!completed && !debuggerReady) fail(new Error("debugger disconnected before ready"));
    });
    debuggerPort.postMessage({
      type: "setup",
      url: opts.url,
      method: opts.method || "GET",
      forbiddenHeaders
    });

    return {
      abort: () => {
        if (completed) return;
        completed = true;
        cleanup();
        abortController.abort();
      }
    };
  };

  const GM_xmlhttpRequest = (options) => {
    const opts = options || {};
    if (!chrome.runtime || !chrome.runtime.connect) {
      return GM_xmlhttpRequestWithFetch(opts);
    }
    if (hasCriticalInjectedHeaders(opts.headers || {})) {
      return GM_xmlhttpRequestWithDebugger(opts);
    }
    try {
      return GM_xmlhttpRequestViaBackground(opts);
    } catch (err) {
      return GM_xmlhttpRequestWithFetch(opts);
    }
  };

  const setupGlobals = () => {
    globalThis.GM_addStyle = GM_addStyle;
    globalThis.GM_getValue = GM_getValue;
    globalThis.GM_setValue = GM_setValue;
    globalThis.GM_deleteValue = GM_deleteValue;
    globalThis.GM_setClipboard = GM_setClipboard;
    globalThis.GM_getResourceText = GM_getResourceText;
    globalThis.GM_xmlhttpRequest = GM_xmlhttpRequest;
  };

  const bootstrap = async () => {
    await ensureDomReady();

    const stored = await loadStorage();
    Object.assign(gmStore, stored);
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(onStorageChange);
    }

    globalThis.unsafeWindow = window;

    resourceText.katexCSS = await loadText("vendor/katex.min.css");
    setupGlobals();

    await loadScript("vendor/marked.min.js");
    await loadScript("vendor/html2canvas.min.js");
    await loadScript("vendor/katex.min.js");
    await loadScript("vendor/auto-render.min.js");
    await loadScript("coolauxv.user.js");
  };

  bootstrap().catch((err) => {
    console.error("CoolAuxv bootstrap failed", err);
  });
})();
