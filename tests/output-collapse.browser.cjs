// Optional browser regression; all model responses are simulated.
// NODE_PATH=/tmp/coolauxv-browser-tests/node_modules CHROMIUM_PATH=/usr/bin/chromium node tests/output-collapse.browser.cjs
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
        await page.route('**/*', route => route.abort());
        await page.setContent('<html><body>Completed output collapse regression</body></html>');
        await page.evaluate(() => {
            window.__store = {
                coolauxv_default_provider: 'test', coolauxv_enable_basic_anim: false,
                coolauxv_enable_continuous_chat: true, coolauxv_legacy_provider_settings_migrated_v1: true,
                coolauxv_provider_templates_v1: [{
                    id: 'test', label: 'Test', type: 'chat-completions', baseUrl: 'https://example.com/v1/chat/completions',
                    apiKey: 'unit-test-key', modelGroups: [{ models: [{ id: 'test-model', supportsReasoning: true, supportsMultimodal: true }] }]
                }]
            };
            window.__requests = [];
            window.GM_getValue = (key, fallback) => Object.hasOwn(__store, key) ? __store[key] : fallback;
            window.GM_setValue = (key, value) => { __store[key] = value; };
            window.GM_deleteValue = key => delete __store[key];
            window.GM_listValues = () => Object.keys(__store);
            window.GM_addStyle = css => { const el = document.createElement('style'); el.textContent = css; document.head.append(el); };
            window.GM_getResourceText = () => '';
            window.GM_info = { script: { version: '16.7' } };
            window.marked = { parse: text => '<p>' + text + '</p>' };
            window.GM_xmlhttpRequest = options => {
                const request = { kind: 'gm', options, aborted: false };
                __requests.push(request);
                return { abort: () => { request.aborted = true; } };
            };
            window.fetch = (url, options) => new Promise(resolve => { __requests.push({ kind: 'fetch', options, resolve }); });
        });
        const source = fs.readFileSync(file, 'utf8').replace('    const startMain = () => {', `
            window.__output = { getProviderTemplates, saveProviderTemplates, setImage: image => { capturedImageBase64 = image; } };
            const startMain = () => {`);
        await page.addScriptTag({ content: source });
        await page.waitForSelector('#coolauxv-translate-popup', { state: 'attached' });
        await page.evaluate(() => { document.querySelector('#coolauxv-translate-popup').style.display = 'flex'; });
        await page.locator('#coolauxv-main-action-buttons [data-action-id="translate"]').waitFor({ state: 'visible' });
        const collapsed = () => page.locator('#coolauxv-main-top-section').evaluate(el => el.classList.contains('coolauxv-top-collapsed'));
        const openTop = () => page.evaluate(() => {
            const button = document.querySelector('#coolauxv-top-collapse-btn');
            if (button.textContent === '展开') button.click();
        });
        const start = async ({ type = 'chat-completions', transport = 'gm', image = false, chat = false, continuous = true, reasoning = false } = {}) => {
            await openTop();
            const before = await page.evaluate(config => {
                GM_setValue('coolauxv_enable_continuous_chat', config.continuous);
                const providers = __output.getProviderTemplates();
                const provider = providers[0];
                provider.type = config.type;
                provider.stream.parser = config.type;
                provider.stream.deltaPath = config.type === 'chat-completions' ? 'choices.0.delta.content' : '';
                provider.headersTemplate = config.transport === 'fetch' ? { 'Content-Type': 'application/json' } : null;
                provider.reasoningEnabled = config.reasoning;
                __output.saveProviderTemplates(providers);
                __output.setImage(config.image ? 'data:image/png;base64,AA==' : '');
                return __requests.length;
            }, { type, transport, image, continuous, reasoning });
            await page.locator(chat ? '#coolauxv-chat-input' : '#coolauxv-input').fill('hello');
            await page.locator(chat ? '#coolauxv-btn-chat-send' : '#coolauxv-main-action-buttons [data-action-id="translate"]').click();
            await page.waitForFunction(before => __requests.length > before, before);
            return page.evaluate(() => __requests.length - 1);
        };
        const beginStream = index => page.evaluate(index => {
            const request = __requests[index];
            const stream = new ReadableStream({ start: controller => { request.controller = controller; } });
            if (request.kind === 'fetch') request.resolve(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
            else request.options.onloadstart({ status: 200, response: stream });
        }, index);
        const chunk = (index, type, text = 'completed answer') => page.evaluate(({ index, type, text }) => {
            const event = type === 'openai-responses' ? { type: 'response.output_text.delta', delta: text }
                : { choices: [{ delta: { content: text } }] };
            __requests[index].controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n'));
        }, { index, type, text });
        const finish = index => page.evaluate(index => __requests[index].controller.close(), index);
        const waitCollapsed = () => page.waitForFunction(() => document.querySelector('#coolauxv-main-top-section').classList.contains('coolauxv-top-collapsed'));
        for (const scenario of [
            { type: 'chat-completions' },
            { type: 'chat-completions', transport: 'fetch', continuous: false },
            { type: 'openai-responses', reasoning: true },
            { type: 'chat-completions', image: true }
        ]) {
            const index = await start(scenario);
            await beginStream(index);
            await chunk(index, scenario.type);
            await page.waitForFunction(() => document.querySelector('#coolauxv-result').textContent.includes('completed answer'));
            assert.equal(await collapsed(), false, 'the input must stay expanded while the answer streams');
            await finish(index);
            await waitCollapsed();
            assert.equal(await page.locator('#coolauxv-top-collapse-btn').textContent(), '展开');
        }
        // A continuous-chat reply also re-collapses the top if the user expanded it during streaming.
        const chat = await start({ chat: true });
        await beginStream(chat);
        await openTop();
        await chunk(chat, 'chat-completions', 'chat answer');
        await finish(chat);
        await waitCollapsed();
        // Empty or failed replies leave the input available for editing/retry.
        for (const status of [200, 400]) {
            const index = await start();
            await page.evaluate(({ index, status }) => __requests[index].options.onload({
                status, responseText: JSON.stringify(status === 200 ? { choices: [{ message: { content: '' } }] } : { error: { message: 'test failure' } })
            }), { index, status });
            assert.equal(await collapsed(), false);
        }
        // Non-streaming text responses follow the same completion path.
        const json = await start();
        await page.evaluate(index => __requests[index].options.onload({ status: 200,
            responseText: JSON.stringify({ choices: [{ message: { content: 'JSON answer' } }] }) }), json);
        await waitCollapsed();
        // Reuse the existing fold animation when basic/advanced animations are enabled.
        await page.locator('#coolauxv-settings-btn').click();
        await page.locator('#coolauxv-cfg-basic-anim').check();
        await page.locator('#coolauxv-cfg-minimize-anim').check();
        await page.locator('#coolauxv-settings-btn').click();
        const animated = await start();
        await beginStream(animated);
        await chunk(animated, 'chat-completions', 'animated answer');
        await finish(animated);
        await waitCollapsed();
        await page.waitForFunction(() => document.querySelector('#coolauxv-main-top-section').offsetHeight === 0);
        await page.evaluate(() => {
            GM_setValue('coolauxv_enable_basic_anim', false);
            GM_setValue('coolauxv_enable_minimize_anim', false);
            document.querySelector('#coolauxv-translate-popup').classList.add('coolauxv-basic-anim-off');
        });
        // Manually stopping output must not fold the user's active input.
        const interrupted = await start();
        await beginStream(interrupted);
        await chunk(interrupted, 'chat-completions', 'partial answer');
        await page.locator('#coolauxv-btn-stop').click();
        await finish(interrupted);
        assert.equal(await collapsed(), false);
        // Reasoning visibility is independent of both the top input and the bottom chat state.
        await page.evaluate(() => {
            const providers = __output.getProviderTemplates();
            providers[0].reasoningEnabled = true;
            __output.saveProviderTemplates(providers);
        });
        await page.locator('#coolauxv-input').fill('');
        const chatState = await page.locator('#coolauxv-chat-bar').getAttribute('class');
        await page.locator('#coolauxv-reasoning-toggle').uncheck();
        await page.locator('#coolauxv-reasoning-toggle').check();
        assert.equal(await collapsed(), false);
        assert.equal(await page.locator('#coolauxv-chat-bar').getAttribute('class'), chatState);
        assert.deepEqual(errors, []);
        console.log(file + ': PASS (Fetch/GM streaming, JSON, Responses, images, chat, errors, empty replies, stopping, independent reasoning visibility)');
        await page.close();
    }
    await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
