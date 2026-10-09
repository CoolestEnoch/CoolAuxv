// Optional browser regression, using stubbed storage and no live model requests.
// npm install --prefix /tmp/coolauxv-browser-tests playwright
// NODE_PATH=/tmp/coolauxv-browser-tests/node_modules CHROMIUM_PATH=/usr/bin/chromium node tests/request-templates.browser.cjs
const fs = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
    const files = process.argv.length > 2 ? process.argv.slice(2)
        : ['coolauxv.user.js', 'chrome_ext/coolauxv.user.js'].map(file => resolve(__dirname, '..', file));
    for (const file of files) {
        const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
        const errors = [];
        const dialogs = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
        await page.route('**/*', route => route.abort());
        await page.setContent('<html><body>Request template regression</body></html>');
        await page.evaluate(() => {
            window.__store = {
                coolauxv_default_provider: 'openai', coolauxv_model_provider: 'openai',
                coolauxv_enable_basic_anim: false, coolauxv_legacy_provider_settings_migrated_v1: true,
                coolauxv_provider_templates_v1: [{
                    id: 'openai', label: 'Template Test', type: 'chat-completions',
                    baseUrl: 'https://example.com/v1/chat/completions', apiKey: 'unit-test-key',
                    headersTemplate: null, bodyTemplate: null,
                    display: { headersTemplate: true, bodyTemplate: true },
                    modelGroups: [{ models: [{ id: 'plain', supportsReasoning: false }] }]
                }]
            };
            window.GM_getValue = (key, fallback) => Object.hasOwn(__store, key) ? __store[key] : fallback;
            window.GM_setValue = (key, value) => { __store[key] = JSON.parse(JSON.stringify(value)); };
            window.GM_deleteValue = key => delete __store[key];
            window.GM_listValues = () => Object.keys(__store);
            window.GM_addStyle = css => { const node = document.createElement('style'); node.textContent = css; document.head.append(node); };
            window.GM_getResourceText = () => '';
            window.GM_xmlhttpRequest = () => ({ abort() {} });
            window.GM_setClipboard = value => { window.__clipboard = value; };
            window.GM_info = { script: { version: '16.7' } };
            window.marked = { parse: text => text };
        });
        const source = fs.readFileSync(file, 'utf8').replace('    const startMain = () => {', `
            window.__templates = { getProviderTemplates, buildProviderHeaders, buildTextPayload };
            const startMain = () => {`);
        await page.addScriptTag({ content: source });
        await page.waitForSelector('#coolauxv-translate-popup', { state: 'attached' });
        await page.evaluate(() => { document.querySelector('#coolauxv-translate-popup').style.display = 'flex'; });
        await page.locator('#coolauxv-settings-btn').click();
        const header = page.locator('#coolauxv-provider-form-headers');
        const body = page.locator('#coolauxv-provider-form-body-template');
        const open = () => page.locator('[data-action="edit-provider"][data-provider-id="openai"]').click();
        const save = async () => {
            await page.locator('#coolauxv-provider-modal-submit').click();
            await page.locator('#coolauxv-provider-modal-overlay').waitFor({ state: 'detached' });
        };
        const provider = () => page.evaluate(() => __templates.getProviderTemplates().find(item => item.id === 'openai'));
        const request = () => page.evaluate(() => {
            const provider = __templates.getProviderTemplates().find(item => item.id === 'openai');
            return { headers: __templates.buildProviderHeaders(provider), body: __templates.buildTextPayload(provider, 'plain', 'system', 'hello') };
        });
        for (const type of ['chat-completions', 'openai-responses']) {
            await open();
            await page.selectOption('#coolauxv-provider-form-type', type);
            assert.equal(await header.inputValue(), '');
            assert.equal(await body.inputValue(), '');
            assert.equal(await header.evaluate(element => element.matches(':placeholder-shown')), true);
            assert.equal(await body.evaluate(element => element.matches(':placeholder-shown')), true);
            assert.equal(await header.evaluate(element => getComputedStyle(element, '::placeholder').color), 'rgb(153, 153, 153)');
            assert.deepEqual(JSON.parse(await header.getAttribute('placeholder')), {
                'Content-Type': 'application/json', Authorization: 'Bearer {{apiKey}}'
            });
            const bodyHint = JSON.parse(await body.getAttribute('placeholder'));
            assert.equal(bodyHint[type === 'chat-completions' ? 'messages' : 'input'], type === 'chat-completions' ? '{{messages}}' : '{{input}}');
            await save();
            assert.equal((await provider()).headersTemplate, null);
            assert.equal((await provider()).bodyTemplate, null);
            const defaults = await request();
            assert.equal(defaults.headers.Authorization, 'Bearer unit-test-key');
            assert.equal(defaults.headers.Origin, undefined);
            assert.ok(Array.isArray(type === 'chat-completions' ? defaults.body.messages : defaults.body.input));
            await open();
            await header.fill('{"X-Custom":"unit"}');
            await body.fill('{"prompt":"{{latestUserText}}"}');
            assert.equal(await header.evaluate(element => element.matches(':placeholder-shown')), false);
            await save();
            assert.deepEqual(await request(), { headers: { 'X-Custom': 'unit' }, body: { prompt: 'hello' } });
            await open();
            assert.deepEqual(JSON.parse(await header.inputValue()), { 'X-Custom': 'unit' });
            await body.fill('{invalid');
            await page.locator('#coolauxv-provider-modal-submit').click();
            assert.equal(await page.locator('#coolauxv-provider-modal-overlay').isVisible(), true);
            assert.ok(dialogs.at(-1).includes('JSON'));
            await header.fill('{}');
            await body.fill('{}');
            await save();
            assert.deepEqual(await request(), { headers: {}, body: {} });
            await open();
            assert.equal(await header.inputValue(), '{}');
            assert.equal(await body.inputValue(), '{}');
            await header.fill(' \n\t ');
            await body.fill(' \n\t ');
            await save();
            const inlineHeader = page.locator('[data-provider-id="openai"][data-provider-field="headersTemplate"]');
            const inlineBody = page.locator('[data-provider-id="openai"][data-provider-field="bodyTemplate"]');
            assert.equal(await inlineHeader.inputValue(), '');
            assert.equal(await inlineBody.inputValue(), '');
            assert.ok(await inlineBody.getAttribute('placeholder'));
            await inlineHeader.fill('{"X-Inline":"only"}');
            await inlineHeader.dispatchEvent('change');
            await inlineBody.fill('{"prompt":"inline"}');
            await inlineBody.dispatchEvent('change');
            assert.deepEqual(await request(), { headers: { 'X-Inline': 'only' }, body: { prompt: 'inline' } });
            await inlineHeader.fill(' ');
            await inlineHeader.dispatchEvent('change');
            await inlineBody.fill('');
            await inlineBody.dispatchEvent('change');
            assert.equal(await inlineHeader.inputValue(), '');
            assert.equal((await provider()).headersTemplate, null);
            assert.equal((await provider()).bodyTemplate, null);
            // Actual sharing must preserve null instead of reintroducing built-in overrides on import.
            await page.locator('#coolauxv-btn-provider-batch').click();
            await page.locator('.coolauxv-provider-select[data-provider-id="openai"]').check();
            await page.locator('#coolauxv-btn-provider-share').click();
            const encoded = await page.evaluate(() => __clipboard);
            const exported = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')).providers[0];
            assert.equal(exported.headersTemplate, null);
            assert.equal(exported.bodyTemplate, null);
            if (type === 'chat-completions') assert.equal(exported.type, 'chat-completions');
            const beforeIds = (await page.evaluate(() => __templates.getProviderTemplates())).map(item => item.id);
            await page.locator('#coolauxv-btn-provider-batch').click();
            await page.locator('#coolauxv-btn-provider-add').click();
            await page.locator('#coolauxv-provider-mode-base64').click();
            await page.locator('#coolauxv-provider-form-base64-input').fill(encoded);
            await save();
            const added = (await page.evaluate(() => __templates.getProviderTemplates())).find(item => !beforeIds.includes(item.id));
            assert.equal(added.type, type);
            assert.equal(added.headersTemplate, null);
            assert.equal(added.bodyTemplate, null);
        }
        // New providers start with hints, and switching protocols updates only default fields.
        await page.locator('#coolauxv-btn-provider-add').click();
        assert.equal(await header.inputValue(), '');
        assert.equal(await body.inputValue(), '');
        await header.fill('{"X-Custom":"keep"}');
        await body.fill('{"prompt":"keep"}');
        await page.selectOption('#coolauxv-provider-form-type', 'openai-responses');
        assert.deepEqual(JSON.parse(await header.inputValue()), { 'X-Custom': 'keep' });
        assert.deepEqual(JSON.parse(await body.inputValue()), { prompt: 'keep' });
        assert.equal(JSON.parse(await body.getAttribute('placeholder')).input, '{{input}}');
        assert.deepEqual(errors, []);
        console.log(file + ': PASS (hints, blank defaults, full overrides, empty objects, validation, protocol changes, inline editing, share/import)');
        await page.close();
    }
    await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
