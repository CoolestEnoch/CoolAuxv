// Optional browser regression with stubbed storage and no live model requests.
// npm install --prefix /tmp/coolauxv-browser-tests playwright
// NODE_PATH=/tmp/coolauxv-browser-tests/node_modules CHROMIUM_PATH=/usr/bin/chromium node tests/reasoning-templates.browser.cjs
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
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        await page.route('**/*', route => route.abort());
        await page.setContent('<html><body>Reasoning template regression</body></html>');
        await page.evaluate(() => {
            window.__store = {
                coolauxv_default_provider: 'openai', coolauxv_model_provider: 'openai',
                coolauxv_enable_basic_anim: false, coolauxv_legacy_provider_settings_migrated_v1: true,
                coolauxv_provider_templates_v1: [{
                    id: 'openai', label: 'Reasoning Test', type: 'chat-completions',
                    baseUrl: 'https://example.com/v1/chat/completions', apiKey: 'unit-test-key',
                    headersTemplate: null, bodyTemplate: null, reasoningBodyTemplate: null,
                    display: { bodyTemplate: true },
                    modelGroups: [{ models: [{ id: 'plain', supportsReasoning: false }, { id: 'nonreasoning', supportsReasoning: false }] }]
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
            window.__templates = { getProviderTemplates, buildTextPayload };
            const startMain = () => {`);
        await page.addScriptTag({ content: source });
        await page.waitForSelector('#coolauxv-translate-popup', { state: 'attached' });
        await page.evaluate(() => { document.querySelector('#coolauxv-translate-popup').style.display = 'flex'; });
        await page.locator('#coolauxv-settings-btn').click();
        const body = page.locator('#coolauxv-provider-form-body-template');
        const reasoningBody = page.locator('#coolauxv-provider-form-reasoning-body-template');
        const reasoningSection = page.locator('#coolauxv-provider-reasoning-body-section');
        const open = () => page.locator('[data-action="edit-provider"][data-provider-id="openai"]').click();
        const save = async () => {
            await page.locator('#coolauxv-provider-modal-submit').click();
            await page.locator('#coolauxv-provider-modal-overlay').waitFor({ state: 'detached' });
        };
        const request = (model = 'plain') => page.evaluate(model => {
            const provider = __templates.getProviderTemplates().find(item => item.id === 'openai');
            return __templates.buildTextPayload(provider, model, 'system', 'hello');
        }, model);
        const current = () => page.evaluate(() => __templates.getProviderTemplates().find(item => item.id === 'openai'));
        for (const type of ['chat-completions', 'openai-responses']) {
            const effort = payload => type === 'chat-completions' ? payload.reasoning_effort : payload.reasoning?.effort;
            await open();
            assert.equal(await reasoningSection.isVisible(), false, 'providers without reasoning models must not show the extra template');
            await page.selectOption('#coolauxv-provider-form-type', type);
            await page.locator('[data-field="model.supportsReasoning"]').first().check();
            assert.equal(await reasoningSection.isVisible(), true, 'the reasoning capability checkbox must reveal the template immediately');
            await page.locator('[data-display-key="reasoningBodyTemplate"]').check();
            assert.equal(await reasoningBody.inputValue(), '');
            assert.equal(await reasoningBody.evaluate(element => element.matches(':placeholder-shown')), true);
            await body.fill('{"ordinary":"{{latestUserText}}"}');
            const hint = JSON.parse(await reasoningBody.getAttribute('placeholder'));
            assert.equal(hint.ordinary, '{{latestUserText}}');
            assert.equal(effort(hint), '{{reasoningEffort}}');
            if (type === 'openai-responses') assert.equal(hint.reasoning.summary, 'auto');
            await save();
            assert.equal((await current()).reasoningBodyTemplate, null);
            await page.locator('#coolauxv-settings-btn').click();
            await page.locator('#coolauxv-reasoning-enable').check();
            await page.selectOption('#coolauxv-reasoning-effort', 'high');
            assert.equal((await request()).ordinary, 'hello');
            assert.equal(effort(await request()), 'high');
            await page.locator('#coolauxv-reasoning-enable').uncheck();
            assert.equal(effort(await request()), 'none');
            await page.locator('#coolauxv-reasoning-enable').check();
            await page.locator('#coolauxv-settings-btn').click();
            await open();
            const custom = { thinking: '{{latestUserText}}', ...(type === 'chat-completions'
                ? { reasoning_effort: '{{reasoningEffort}}' } : { reasoning: { effort: '{{reasoningEffort}}' } }) };
            await reasoningBody.fill(JSON.stringify(custom));
            await save();
            const payload = await request();
            assert.equal(payload.thinking, 'hello');
            assert.equal(payload.ordinary, undefined);
            assert.equal(effort(payload), 'high');
            if (type === 'openai-responses') assert.equal(payload.reasoning.summary, undefined);
            assert.deepEqual(await request('nonreasoning'), { ordinary: 'hello' });
            await open();
            assert.deepEqual(JSON.parse(await reasoningBody.inputValue()), custom);
            await page.locator('#coolauxv-provider-modal-cancel').click();
            await page.locator('#coolauxv-provider-modal-overlay').waitFor({ state: 'detached' });
            // Sharing and importing must preserve the separate request body and its variables.
            await page.locator('#coolauxv-btn-provider-batch').click();
            await page.locator('.coolauxv-provider-select[data-provider-id="openai"]').check();
            await page.locator('#coolauxv-btn-provider-share').click();
            const encoded = await page.evaluate(() => __clipboard);
            assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')).providers[0].reasoningBodyTemplate, custom);
            const beforeIds = (await page.evaluate(() => __templates.getProviderTemplates())).map(item => item.id);
            await page.locator('#coolauxv-btn-provider-batch').click();
            await page.locator('#coolauxv-btn-provider-add').click();
            await page.locator('#coolauxv-provider-mode-base64').click();
            await page.locator('#coolauxv-provider-form-base64-input').fill(encoded);
            await save();
            const added = (await page.evaluate(() => __templates.getProviderTemplates())).find(item => !beforeIds.includes(item.id));
            assert.deepEqual(added.reasoningBodyTemplate, custom);
            assert.equal(added.type, type);
            const inline = page.locator('[data-provider-id="openai"][data-provider-field="reasoningBodyTemplate"]');
            await inline.fill('{}');
            await inline.dispatchEvent('change');
            assert.deepEqual(await request(), {}, 'an explicit empty reasoning body is a full override');
            await inline.fill(' \n ');
            await inline.dispatchEvent('change');
            assert.equal((await current()).reasoningBodyTemplate, null);
            assert.equal((await request()).ordinary, 'hello');
            assert.equal(effort(await request()), 'high');
            await open();
            await reasoningBody.fill('{invalid');
            await page.locator('#coolauxv-provider-modal-submit').click();
            assert.equal(await page.locator('#coolauxv-provider-modal-overlay').isVisible(), true, 'an invalid active reasoning template must be rejected');
            await page.locator('[data-field="model.supportsReasoning"]').first().uncheck();
            assert.equal(await reasoningSection.isVisible(), false);
            await save();
            assert.deepEqual(await request(), { ordinary: 'hello' });
        }
        assert.deepEqual(errors, []);
        console.log(file + ': PASS (reasoning capability, effort hints, inheritance, full overrides, toolbar selection, ordinary models, share/import)');
        await page.close();
    }
    await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
