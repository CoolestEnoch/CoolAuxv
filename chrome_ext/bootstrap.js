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

  const GM_xmlhttpRequest = (options) => {
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
