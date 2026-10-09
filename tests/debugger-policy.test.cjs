// Run with: node --test tests/*.test.cjs
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function event() {
    const listeners = [];
    return {
        listeners,
        addListener: fn => listeners.push(fn),
        removeListener() {},
        emit: (...args) => Promise.all(listeners.map(fn => fn(...args)))
    };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

function environment() {
    const values = {
        coolauxv_default_provider: 'plain',
        coolauxv_enable_debugger_header_persistent: true,
        coolauxv_provider_templates_v1: [
            { id: 'plain', customJsCode: '' },
            { id: 'whitespace', customJsCode: ' \n\t ' },
            { id: 'hook', customJsCode: 'const value = 1;' }
        ]
    };
    const calls = { connect: [], attach: [], detach: [], ports: [], fetch: [] };
    const attached = new Set();
    const makePort = name => {
        const port = { name, sender: { tab: { id: 7 } }, onMessage: event(), onDisconnect: event(), messages: [],
            postMessage: msg => port.messages.push(msg), disconnect() {} };
        calls.ports.push(port);
        return port;
    };
    const chrome = {
        runtime: {
            getURL: path => `chrome-extension://test/${path}`,
            onConnect: event(), onInstalled: event(), onMessage: event(),
            connect: ({ name }) => { calls.connect.push(name); return makePort(name); }
        },
        storage: { onChanged: event(), local: {
            get: (keys, cb) => queueMicrotask(() => cb(keys === null ? { ...values } : Object.fromEntries(keys.map(key => [key, values[key]])))),
            set: (items, cb) => { Object.assign(values, items); cb?.(); },
            remove: (keys, cb) => { keys.forEach(key => delete values[key]); cb?.(); }
        } },
        tabs: { query: (_, cb) => cb([{ id: 7, url: 'chrome-extension://test/pdfjs/web/viewer.html' }]),
            onUpdated: event(), onRemoved: event(), update() {} },
        webNavigation: { onCommitted: event() },
        debugger: {
            onEvent: event(),
            getTargets: async () => [...attached].map(tabId => ({ tabId, attached: true })),
            attach: async ({ tabId }) => { calls.attach.push(tabId); attached.add(tabId); },
            detach: async ({ tabId }) => { calls.detach.push(tabId); attached.delete(tabId); },
            sendCommand: async () => ({})
        }
    };
    const window = { addEventListener() {}, postMessage() {} };
    window.top = window;
    const context = vm.createContext({
        chrome, window, document: {}, URL, Headers, AbortController, TextDecoder, TextEncoder,
        console: { log() {}, debug() {}, info() {}, warn() {}, error() {} },
        location: { protocol: 'chrome-extension:', href: 'chrome-extension://test/pdfjs/web/viewer.html' },
        navigator: {}, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        fetch: async (url) => { calls.fetch.push(url); return { ok: true, status: 200, statusText: 'OK', headers: new Headers(), text: async () => 'ok' }; }
    });
    return { values, calls, chrome, context, makePort };
}

for (const file of ['chrome_ext/gm_polyfill.js', 'chrome_ext/bootstrap.js']) {
    test(`${file}: no custom JS means no debugger, including fallback and nondefault providers`, async () => {
        const env = environment();
        let source = readFileSync(resolve(__dirname, '..', file), 'utf8');
        if (file.endsWith('bootstrap.js')) {
            source = source.slice(0, source.lastIndexOf('  bootstrap().catch'))
                + '  globalThis.testApi = { GM_xmlhttpRequest, GM_setValue };\n})();';
        }
        vm.runInContext(source, env.context, { filename: file });
        await flush();
        const api = env.context.testApi || env.context;
        Object.entries(env.values).forEach(([key, value]) => api.GM_setValue(key, value));
        const request = providerId => api.GM_xmlhttpRequest({ url: 'https://example.com/v1/chat/completions',
            coolauxvProviderId: providerId, headers: { Origin: 'https://example.com' }, onerror() {} });
        for (const id of ['plain', 'whitespace', 'unknown']) request(id).abort();
        request().abort();
        await flush();
        assert.ok(env.calls.connect.every(name => name === 'coolauxv-gm-xhr'));
        env.calls.connect.length = 0;
        api.GM_setValue('coolauxv_default_provider', 'hook');
        request('plain').abort();
        await flush();
        assert.ok(!env.calls.connect.includes('coolauxv-gm-xhr-debugger'));
        env.calls.connect.length = 0;
        const allowed = request('hook');
        await flush();
        assert.ok(env.calls.connect.includes('coolauxv-gm-xhr-debugger'));
        assert.equal(env.calls.ports.at(-1).messages[0].providerId, 'hook');
        allowed.abort();
        env.calls.connect.length = 0;
        api.GM_setValue('coolauxv_enable_debugger_header_injection', false);
        request('hook').abort();
        await flush();
        assert.ok(!env.calls.connect.includes('coolauxv-gm-xhr-debugger'));
        api.GM_setValue('coolauxv_enable_debugger_header_injection', true);
        env.chrome.runtime.connect = ({ name }) => {
            env.calls.connect.push(name);
            if (name === 'coolauxv-gm-xhr') throw new Error('background unavailable');
            return env.makePort(name);
        };
        env.calls.connect.length = 0;
        request('plain');
        await flush();
        assert.ok(!env.calls.connect.includes('coolauxv-gm-xhr-debugger'));
        assert.equal(env.calls.fetch.length, 1);
    });
}

async function background(configure = () => {}) {
    const env = environment();
    configure(env);
    const source = readFileSync(resolve(__dirname, '..', 'chrome_ext/background.js'), 'utf8');
    vm.runInContext(source + '\nglobalThis.api = { attachTabDebugger, prewarmPersistentDebugger };', env.context);
    await flush();
    return env;
}

test('background: startup DNR scans do not execute other providers, and explicit hook evaluation runs once', async () => {
    const rules = [];
    const env = await background(env => {
        const hook = env.values.coolauxv_provider_templates_v1.find(item => item.id === 'hook');
        hook.baseUrl = 'https://example.com/v1/chat/completions';
        hook.headersTemplate = { Origin: 'https://example.com' };
        hook.customJsRunOnce = false;
        hook.customJsCode = 'const response = await GM_xmlhttpRequest({url:"https://example.com/hook"});\nconst ready = true;';
        env.chrome.declarativeNetRequest = {
            getDynamicRules: async () => [],
            updateDynamicRules: async value => rules.push(value)
        };
    });
    assert.deepEqual(env.calls.fetch, [], 'startup must not execute unselected hooks');
    assert.deepEqual(env.calls.attach, []);
    assert.equal(rules.length, 1);
    assert.equal(rules[0].addRules.length, 1, 'static DNR headers must still be configured');
    const context = await new Promise(resolve => env.chrome.runtime.onMessage.emit(
        { action: 'evaluateCustomJs', providerId: 'hook' }, { tab: { id: 7 } }, resolve));
    assert.equal(context.ready, true);
    assert.equal(env.calls.fetch.length, 1, 'explicit hook evaluation must execute exactly once');
});

test('background: no-JS providers cannot attach or prewarm a debugger', async () => {
    const env = await background();
    for (const id of ['plain', 'whitespace', 'unknown']) {
        await assert.rejects(env.context.api.attachTabDebugger(7, true, id), /without custom JavaScript/);
    }
    await env.context.api.prewarmPersistentDebugger();
    assert.deepEqual(env.calls.attach, []);
    const port = env.makePort('coolauxv-gm-xhr-debugger');
    await env.chrome.runtime.onConnect.emit(port);
    await port.onMessage.emit({ type: 'setup', providerId: 'plain', forbiddenHeaders: { origin: 'https://example.com' } });
    assert.equal(port.messages.at(-1).type, 'error');
    assert.deepEqual(env.calls.attach, []);
});

test('background: certificate bypass cannot attach for a no-JS provider', async () => {
    const env = await background();
    const result = await new Promise(resolve => env.chrome.runtime.onMessage.emit(
        { action: 'setIgnoreCertErrors', providerId: 'plain', ignore: true }, { tab: { id: 7 } }, resolve));
    assert.equal(result.ok, false);
    assert.deepEqual(env.calls.attach, []);
});

test('background: persistent debugger is reclaimed when the provider changes or its JS is cleared', async () => {
    const env = await background();
    env.values.coolauxv_default_provider = 'hook';
    await env.context.api.prewarmPersistentDebugger();
    assert.deepEqual(env.calls.attach, [7]);
    env.values.coolauxv_default_provider = 'plain';
    await env.chrome.storage.onChanged.emit({ coolauxv_default_provider: { newValue: 'plain' } }, 'local');
    await flush();
    assert.deepEqual(env.calls.detach, [7]);
    env.values.coolauxv_default_provider = 'hook';
    await env.context.api.prewarmPersistentDebugger();
    env.values.coolauxv_provider_templates_v1.find(item => item.id === 'hook').customJsCode = '  ';
    await env.chrome.storage.onChanged.emit({ coolauxv_provider_templates_v1: { newValue: env.values.coolauxv_provider_templates_v1 } }, 'local');
    await flush();
    assert.deepEqual(env.calls.attach, [7, 7]);
    assert.deepEqual(env.calls.detach, [7, 7]);
});

test('extension client: custom-JS requests retain their provider and no-JS requests skip certificate debugger setup', async () => {
    const env = environment();
    const requests = [];
    const messages = [];
    env.context.GM_getValue = (key, fallback) => env.values[key] ?? fallback;
    env.context.GM_xmlhttpRequest = options => {
        requests.push(options);
        options.onload({ status: 200 });
    };
    env.chrome.runtime.sendMessage = async message => { messages.push(message); return { ok: true }; };
    const source = readFileSync(resolve(__dirname, '..', 'chrome_ext/coolauxv.user.js'), 'utf8');
    vm.runInContext(source.slice(0, source.lastIndexOf('    setupBridgeServer();')) + `
        globalThis.client = { executeCustomJs, withCertBypass, needsCertBypass };
    })();`, env.context);
    const plain = { id: 'plain', customJsCode: '  ', verifySsl: false };
    let requestCount = 0;
    await env.context.client.withCertBypass(plain, async () => { requestCount++; });
    assert.equal(requestCount, 1);
    assert.equal(messages.length, 0);
    assert.equal(!!env.context.client.needsCertBypass(plain), false);
    const hook = { id: 'hook', verifySsl: false,
        customJsCode: 'const response = await GM_xmlhttpRequest({ url: "https://example.com", headers: { Origin: "https://example.com" } });\nconst status = response.status;' };
    const result = await env.context.client.executeCustomJs(hook, { providerId: 'hook' }, { awaitAsync: true });
    assert.equal(result.status, 200);
    assert.equal(requests[0].coolauxvProviderId, 'hook');
    await env.context.client.withCertBypass(hook, async () => {});
    assert.deepEqual(messages.map(message => [message.providerId, message.ignore]), [['hook', true], ['hook', false]]);
});
