(() => {
  const pendingGm = new Map();
  const parseCookieHeader = (raw) => {
    const out = {};
    const text = String(raw || '').trim();
    if (!text) return out;
    text.split(';').forEach((part) => {
      const item = String(part || '').trim();
      if (!item) return;
      const idx = item.indexOf('=');
      if (idx <= 0) return;
      const k = item.slice(0, idx).trim();
      const v = item.slice(idx + 1).trim();
      if (!k) return;
      out[k] = v;
    });
    return out;
  };

  const buildResult = (raw) => {
    const context = {};
    Object.keys(raw || {}).forEach((key) => {
      const val = raw[key];
      if (typeof val === 'function' || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        context[key] = val;
      }
    });
    return context;
  };

  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || data.source !== 'coolauxv-sandbox-host') return;

    if (data.type === 'coolauxv-sandbox-gm-result' && data.gmId) {
      const pending = pendingGm.get(data.gmId);
      if (!pending) return;
      pendingGm.delete(data.gmId);
      if (data.ok) pending.resolve(data.res || {});
      else pending.reject(new Error((data.err && data.err.message) || 'gm request failed'));
      return;
    }

    if (data.type !== 'coolauxv-sandbox-eval' || !data.id) return;

    const reply = (payload) => {
      window.parent.postMessage({ source: 'coolauxv-sandbox-frame', id: data.id, ...payload }, '*');
    };

    try {
      const code = String(data.code || '').trim();
      const baseContext = (data.baseContext && typeof data.baseContext === 'object') ? data.baseContext : {};
      if (!code) {
        reply({ type: 'coolauxv-sandbox-eval-result', ok: true, context: {} });
        return;
      }

      const hasAwait = /\bawait\b/.test(code);
      const validIdent = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
      const sandboxKeys = Object.keys(baseContext).filter((k) => validIdent.test(k));
      const sandboxValues = sandboxKeys.map((k) => baseContext[k]);

      const declarationNames = [];
      code.replace(/^(?:\s*(?:const|let|var)\s+(\w+)\b\s*[=;])|(?:\s*function\s+(\w+)\b)/gm, (match, varName, funcName) => {
        const name = varName || funcName;
        if (name) declarationNames.push(name);
        return match;
      });
      const expectedKeys = Array.isArray(data.expectedKeys) ? data.expectedKeys : [];

      const exportLines = declarationNames
        .concat(expectedKeys)
        .filter((name, i, arr) => arr.indexOf(name) === i)
        .filter((name) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name))
        .map((name) => `__exports__["${name}"] = typeof ${name} !== "undefined" ? ${name} : undefined;`)
        .join('\n');

      let lastCookieMap = {};
      const gmRpc = function(opts) {
        try {
          const headers = opts && opts.headers ? opts.headers : {};
          const rawCookie = headers.Cookie || headers.cookie || '';
          const parsed = parseCookieHeader(rawCookie);
          if (parsed && Object.keys(parsed).length) {
            lastCookieMap = Object.assign({}, lastCookieMap, parsed);
          }
        } catch (e) {}
        const gmId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        return new Promise((resolve, reject) => {
          pendingGm.set(gmId, { resolve, reject });
          window.parent.postMessage({
            source: 'coolauxv-sandbox-frame',
            type: 'coolauxv-sandbox-gm-request',
            gmId,
            options: opts || {}
          }, '*');
        });
      };

      const fnPrefix = hasAwait ? 'async ' : '';
      const wrapper = new Function(...(['__coolauxv_gm_rpc__'].concat(sandboxKeys)), `
        "use strict";
        var GM_xmlhttpRequest = function(opts) {
          return __coolauxv_gm_rpc__(opts);
        };
        return (${fnPrefix} function() {
          const __exports__ = {};
          ${code}
          ${exportLines}
          return __exports__;
        })();
      `);

      const raw = wrapper(...([gmRpc].concat(sandboxValues)));
      const resolved = (raw && typeof raw.then === 'function') ? await raw : raw;
      const context = buildResult(resolved || {});
      expectedKeys.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(context, key) || context[key] === '' || context[key] == null) {
          if (Object.prototype.hasOwnProperty.call(lastCookieMap, key)) {
            context[key] = String(lastCookieMap[key] || '');
          }
        }
      });
      reply({ type: 'coolauxv-sandbox-eval-result', ok: true, context });
    } catch (err) {
      reply({ type: 'coolauxv-sandbox-eval-result', ok: false, err: { message: err && err.message ? err.message : String(err) } });
    }
  });
})();
