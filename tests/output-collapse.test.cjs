const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function load(file) {
    const context = vm.createContext({
        console, URL, TextEncoder, TextDecoder,
        window: { addEventListener() {} }, document: {}, navigator: {},
        location: { protocol: 'https:', pathname: '/', href: 'https://example.com/' },
        GM_getValue: (key, fallback) => fallback,
        setTimeout: () => 0, clearTimeout() {}
    });
    const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
    vm.runInContext(source.slice(0, source.lastIndexOf('    setupBridgeServer();')) + `
        let updates = 0;
        globalThis.api = {
            prepare(options = {}) {
                updates = 0;
                popup = { querySelector: () => ({}) };
                activeActionToken = 7;
                ignoreIncomingOutput = !!options.interrupted;
                streamErrorHandled = !!options.error;
                isTopSectionCollapsed = false;
                updateTopSectionCollapseUI = () => { updates++; };
            },
            complete: collapseTopSectionAfterResponse,
            collapsed: () => isTopSectionCollapsed,
            updates: () => updates
        };
    })();`, context, { filename: file });
    return context.api;
}

for (const file of ['coolauxv.user.js', 'chrome_ext/coolauxv.user.js']) {
    test(`${file}: current completed output collapses the top section once`, () => {
        const api = load(file);
        api.prepare();
        api.complete(7, 'completed answer');
        assert.equal(api.collapsed(), true);
        assert.equal(api.updates(), 1);
        api.complete(7, 'completed answer');
        assert.equal(api.updates(), 1);
    });

    test(`${file}: empty, failed, interrupted, and stale output must not collapse the top section`, () => {
        const api = load(file);
        for (const scenario of [
            { text: '' }, { text: ' \n ' },
            { text: 'partial', interrupted: true },
            { text: 'partial', error: true },
            { text: 'old answer', token: 6 }
        ]) {
            api.prepare(scenario);
            api.complete(scenario.token ?? 7, scenario.text);
            assert.equal(api.collapsed(), false);
            assert.equal(api.updates(), 0);
        }
    });
}
