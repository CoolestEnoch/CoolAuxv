// Run with: node --test tests/model-capabilities.test.cjs
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function loadScript(file) {
    const values = new Map([['coolauxv_log_level', 'none']]);
    const context = vm.createContext({
        console: { ...console, log() {} },
        URL,
        TextEncoder,
        TextDecoder,
        setTimeout: () => 0,
        clearTimeout() {},
        atob: value => Buffer.from(value, 'base64').toString('binary'),
        btoa: value => Buffer.from(value, 'binary').toString('base64'),
        window: { addEventListener() {} },
        document: {},
        location: { protocol: 'https:', href: 'https://example.com/', pathname: '/' },
        navigator: { userAgent: 'regression-test' },
        GM_getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
        GM_setValue: (key, value) => values.set(key, value),
        GM_listValues: () => [...values.keys()]
    });
    const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
    // Expose the real implementation without starting the browser UI or making requests.
    const bootstrap = source.lastIndexOf('    setupBridgeServer();');
    assert.ok(bootstrap > 0);
    vm.runInContext(source.slice(0, bootstrap) + `
        globalThis.api = { ensureProviderTemplate, getDefaultProviderTemplates,
            getDefaultBodyTemplateByType, buildProviderMessage, buildProviderPayload,
            buildTextPayload, buildVisionPayload, normalizeReasoningEffort,
            getProviderSelectedModel, fillProviderModelGroups, buildModelButtonsHTML,
            processOpenaiStreamLine, buildProviderDisplayContext, buildTemplateContext,
            getDefaultHeadersTemplateByType, getProviderHeadersTemplate, getProviderBodyTemplate,
            getProviderNormalBodyTemplate, getProviderReasoningBodyTemplate, getDefaultReasoningBodyTemplateByType,
            shouldUseReasoningBodyTemplate, hasReasoningModels,
            getRequestTemplatePlaceholder, buildProviderHeaders, mergeProviderDefaultsForImport,
            displayHookRunCount() { return globalThis.__displayHookRuns || 0; },
            resetReasoningStream() { hasReasoning = false; streamReasoningBuffer = ''; isShowReasoning = true; resetStreamParsingState(); },
            reasoningText() { return streamReasoningBuffer; } };
    })();`, context, { filename: file });
    return context.api;
}

for (const file of ['coolauxv.user.js', 'chrome_ext/coolauxv.user.js']) {
    const api = loadScript(file);
    const create = (overrides = {}) => api.ensureProviderTemplate({
        id: 'test', type: 'chat-completions', reasoningEnabled: true,
        modelGroups: [{ selectedModel: 'reasoning-mm', models: [
            { id: 'reasoning-mm', supportsReasoning: true, supportsMultimodal: true },
            { id: 'plain', supportsReasoning: false, supportsMultimodal: false }
        ] }], ...overrides
    });

    test(`${file}: reasoning template defaults inherit normal fields and expose the toolbar effort`, () => {
        for (const type of ['chat-completions', 'openai-responses']) {
            const provider = create({ type, bodyTemplate: { prompt: '{{latestUserText}}', vendor_option: true } });
            assert.equal(provider.reasoningBodyTemplate, null);
            assert.equal(api.hasReasoningModels(provider), true);
            const placeholder = JSON.parse(api.getRequestTemplatePlaceholder(type, 'reasoningBodyTemplate', provider.bodyTemplate));
            assert.equal(placeholder.prompt, '{{latestUserText}}');
            assert.equal(placeholder.vendor_option, true);
            assert.equal(type === 'chat-completions' ? placeholder.reasoning_effort : placeholder.reasoning.effort, '{{reasoningEffort}}');
            const effort = payload => type === 'chat-completions' ? payload.reasoning_effort : payload.reasoning?.effort;
            assert.equal(effort(api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello')), 'medium');
            provider.reasoningEffort = 'high';
            const enabled = api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello');
            assert.equal(enabled.prompt, 'hello');
            assert.equal(enabled.vendor_option, true);
            assert.equal(effort(enabled), 'high');
            if (type === 'openai-responses') assert.equal(enabled.reasoning.summary, 'auto');
            provider.reasoningEnabled = false;
            assert.equal(api.shouldUseReasoningBodyTemplate(provider, 'reasoning-mm'), false);
            assert.equal(effort(api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello')), 'none');
        }
    });

    test(`${file}: custom reasoning bodies replace the entire body only for enabled reasoning models`, () => {
        for (const type of ['chat-completions', 'openai-responses']) {
            const reasoning = type === 'chat-completions' ? { reasoning_effort: '{{reasoningEffort}}' } : { reasoning: { effort: '{{reasoningEffort}}' } };
            const provider = create({ type, reasoningEffort: 'high', bodyTemplate: { ordinary: '{{latestUserText}}' },
                reasoningBodyTemplate: { thinking: '{{latestUserText}}', ...reasoning } });
            const enabled = api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello');
            assert.equal(enabled.thinking, 'hello');
            assert.equal(enabled.ordinary, undefined);
            assert.equal(type === 'chat-completions' ? enabled.reasoning_effort : enabled.reasoning.effort, 'high');
            if (type === 'openai-responses') assert.equal(enabled.reasoning.summary, undefined, 'custom reasoning bodies must not acquire default fields');
            const ordinary = api.buildTextPayload(provider, 'plain', 'system', 'hello');
            assert.deepEqual(JSON.parse(JSON.stringify(ordinary)), { ordinary: 'hello' });
            provider.reasoningBodyTemplate = {};
            assert.equal(Object.keys(api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello')).length, 0);
            provider.reasoningBodyTemplate = type === 'chat-completions' ? { reasoning_effort: 'low' } : { reasoning: { effort: 'low' } };
            const fixed = api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello');
            assert.equal(type === 'chat-completions' ? fixed.reasoning_effort : fixed.reasoning.effort, 'low', 'fixed values must remain user overrides');
            provider.reasoningEnabled = false;
            const disabled = api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello');
            assert.equal(disabled.ordinary, 'hello');
            assert.equal(disabled.thinking, undefined);
            provider.reasoningEnabled = true;
            provider.reasoningBodyTemplate = null;
            assert.equal(api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello').ordinary, 'hello');
        }
    });

    test(`${file}: reasoning template configuration survives normalization and import`, () => {
        for (const value of [null, {}, { prompt: '{{latestUserText}}', reasoning_effort: '{{reasoningEffort}}' }]) {
            const provider = create({ reasoningBodyTemplate: value });
            const roundtrip = api.ensureProviderTemplate(JSON.parse(JSON.stringify(provider)));
            assert.equal(JSON.stringify(roundtrip.reasoningBodyTemplate), JSON.stringify(value));
            const imported = api.ensureProviderTemplate(api.mergeProviderDefaultsForImport({ id: 'openai', reasoningBodyTemplate: value }));
            assert.equal(JSON.stringify(imported.reasoningBodyTemplate), JSON.stringify(value));
        }
        assert.equal(create({ reasoningBodyTemplate: ' \n ' }).reasoningBodyTemplate, null);
        assert.equal(create({ reasoningBodyTemplate: '{"reasoning_effort":"{{reasoningEffort}}"}' }).reasoningBodyTemplate.reasoning_effort, '{{reasoningEffort}}');
    });

    test(`${file}: blank OpenAI templates stay blank and resolve to standard defaults at request time`, () => {
        for (const type of ['chat-completions', 'openai-responses']) {
            for (const blank of [undefined, null, '', ' \n\t ']) {
                const provider = create({ type, apiKey: 'unit-test-key', headersTemplate: blank, bodyTemplate: blank });
                assert.equal(provider.headersTemplate, null);
                assert.equal(provider.bodyTemplate, null);
                const roundtrip = api.ensureProviderTemplate(JSON.parse(JSON.stringify(provider)));
                assert.equal(roundtrip.headersTemplate, null);
                assert.equal(roundtrip.bodyTemplate, null);
                const headers = api.buildProviderHeaders(roundtrip);
                assert.equal(headers['Content-Type'], 'application/json');
                assert.equal(headers.Authorization, 'Bearer unit-test-key');
                assert.equal(headers.Origin, undefined);
                const payload = api.buildTextPayload(roundtrip, 'plain', 'system', 'hello');
                assert.equal(payload.model, 'plain');
                assert.equal(payload.stream, true);
                assert.ok(Array.isArray(type === 'chat-completions' ? payload.messages : payload.input));
                assert.deepEqual(JSON.parse(api.getRequestTemplatePlaceholder(type, 'headersTemplate')), {
                    'Content-Type': 'application/json', Authorization: 'Bearer {{apiKey}}'
                });
                assert.equal(JSON.parse(api.getRequestTemplatePlaceholder(type, 'bodyTemplate'))[type === 'chat-completions' ? 'messages' : 'input'], type === 'chat-completions' ? '{{messages}}' : '{{input}}');
            }
        }
    });

    test(`${file}: custom OpenAI templates replace defaults completely, including explicit empty objects`, () => {
        for (const type of ['chat-completions', 'openai-responses']) {
            const provider = create({ type, apiKey: 'unit-test-key', headersTemplate: { 'X-Custom': 'unit-test' }, bodyTemplate: { prompt: '{{latestUserText}}' } });
            const headers = api.buildProviderHeaders(provider);
            assert.deepEqual(JSON.parse(JSON.stringify(headers)), { 'X-Custom': 'unit-test' });
            const payload = api.buildTextPayload(provider, 'plain', 'system', 'hello');
            assert.deepEqual(JSON.parse(JSON.stringify(payload)), { prompt: 'hello' });
            const empty = create({ type, headersTemplate: {}, bodyTemplate: {} });
            assert.notEqual(empty.headersTemplate, null);
            assert.notEqual(empty.bodyTemplate, null);
            assert.equal(Object.keys(api.buildProviderHeaders(empty)).length, 0);
            assert.equal(Object.keys(api.buildTextPayload(empty, 'plain', 'system', 'hello')).length, 0);
            const explicitDefaults = create({ type, headersTemplate: api.getDefaultHeadersTemplateByType(type), bodyTemplate: api.getDefaultBodyTemplateByType(type) });
            assert.notEqual(explicitDefaults.headersTemplate, null);
            assert.notEqual(explicitDefaults.bodyTemplate, null);
        }
    });

    test(`${file}: importing built-in providers preserves blank and custom template overrides`, () => {
        const blank = api.ensureProviderTemplate(api.mergeProviderDefaultsForImport({ id: 'openai', headersTemplate: null, bodyTemplate: null }));
        assert.equal(blank.headersTemplate, null);
        assert.equal(blank.bodyTemplate, null);
        const custom = api.ensureProviderTemplate(api.mergeProviderDefaultsForImport({ id: 'openai', headersTemplate: { 'X-Custom': 'only' }, bodyTemplate: { prompt: 'only' } }));
        assert.deepEqual(JSON.parse(JSON.stringify(custom.headersTemplate)), { 'X-Custom': 'only' });
        assert.deepEqual(JSON.parse(JSON.stringify(custom.bodyTemplate)), { prompt: 'only' });
        const empty = api.ensureProviderTemplate(api.mergeProviderDefaultsForImport({ id: 'openai', headersTemplate: {}, bodyTemplate: {} }));
        assert.equal(Object.keys(empty.headersTemplate).length, 0);
        assert.equal(Object.keys(empty.bodyTemplate).length, 0);
    });

    test(`${file}: display contexts never execute hooks or cached functions`, () => {
        const provider = create({ id: 'display-only-hook', customJsRunOnce: true,
            customJsCode: 'globalThis.__displayHookRuns = (globalThis.__displayHookRuns || 0) + 1;\nconst displayName = "Cached label";\nfunction dynamicLabel() { globalThis.__displayHookRuns += 100; return "Computed label"; }' });
        const initialDisplay = api.buildProviderDisplayContext(provider);
        assert.equal(initialDisplay.providerId, provider.id);
        assert.equal(initialDisplay.displayName, undefined);
        assert.equal(api.displayHookRunCount(), 0);
        const runtime = api.buildTemplateContext(provider);
        assert.equal(runtime.displayName, 'Cached label');
        assert.equal(typeof runtime.dynamicLabel, 'function');
        assert.equal(api.displayHookRunCount(), 1);
        const cachedDisplay = api.buildProviderDisplayContext(provider);
        assert.equal(cachedDisplay.displayName, 'Cached label');
        assert.equal(cachedDisplay.dynamicLabel, undefined);
        assert.equal(api.displayHookRunCount(), 1);
    });

    test(`${file}: migrate legacy classes and duplicate vision models into one list`, () => {
        const provider = create({ modelGroups: [
            { type: 'text', selectedModel: 'r', models: [{ id: 'r', class: '推理模型' }, { id: 'plain', class: '通用模型' }] },
            { type: 'vision', models: [{ id: 'r' }] }
        ] });
        assert.equal(provider.modelGroups.length, 1);
        assert.equal(provider.modelGroups[0].models.length, 2);
        assert.equal(provider.modelGroups[0].selectedModel, 'r');
        assert.equal(provider.modelGroups[0].models[0].supportsReasoning, true);
        assert.equal(provider.modelGroups[0].models[0].supportsMultimodal, true);
        assert.equal(provider.modelGroups[0].models[1].supportsMultimodal, false);
        assert.equal(provider.modelGroups[0].models[0].class, undefined);
    });

    test(`${file}: explicit capability checkboxes survive legacy defaults and JSON roundtrips`, () => {
        const provider = create({ supportsVision: true, supportsReasoningEffort: true,
            modelGroups: [{ models: [{ id: 'plain', supportsReasoning: false, supportsMultimodal: false, tag: '多模态' }] }]
        });
        const roundtrip = api.ensureProviderTemplate(JSON.parse(JSON.stringify(provider)));
        assert.equal(roundtrip.modelGroups[0].models[0].supportsReasoning, false);
        assert.equal(roundtrip.modelGroups[0].models[0].supportsMultimodal, false);
        assert.equal(JSON.stringify(provider), JSON.stringify(roundtrip));
    });

    test(`${file}: reasoning switch controls standard request fields for both OpenAI protocols`, () => {
        for (const type of ['chat-completions', 'openai-responses']) {
            const provider = create({ type });
            const effort = payload => type === 'chat-completions' ? payload.reasoning_effort : payload.reasoning?.effort;
            assert.equal(effort(api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello')), 'medium');
            if (type === 'openai-responses') assert.equal(api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello').reasoning.summary, 'auto');
            provider.reasoningEffort = 'high';
            assert.equal(effort(api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello')), 'high');
            provider.reasoningEnabled = false;
            assert.equal(effort(api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello')), 'none');
            assert.equal(effort(api.buildTextPayload(provider, 'plain', 'system', 'hello')), undefined);
            provider.reasoningEnabled = true;
            provider.reasoningEffort = '';
            provider.bodyTemplate = { ...provider.bodyTemplate, ...(type === 'chat-completions'
                ? { reasoning_effort: 'none' } : { reasoning: { effort: 'none', summary: 'auto' } }) };
            const overridden = api.buildTextPayload(provider, 'reasoning-mm', 'system', 'hello');
            assert.equal(effort(overridden), 'medium');
            if (type === 'openai-responses') assert.equal(overridden.reasoning.summary, 'auto');
        }
        const ollama = create({ type: 'ollama' });
        assert.equal(api.buildTextPayload(ollama, 'reasoning-mm', 'system', 'hello').think, true);
        ollama.reasoningEnabled = false;
        assert.equal(api.buildTextPayload(ollama, 'reasoning-mm', 'system', 'hello').think, false);
        assert.equal(api.normalizeReasoningEffort('ultra'), '');
    });

    test(`${file}: Responses reasoning summary deltas reach the reasoning buffer without duplicating done events`, () => {
        const provider = create({ type: 'openai-responses' });
        api.resetReasoningStream();
        for (const event of [
            { type: 'response.reasoning_summary_text.delta', delta: 'First ' },
            { type: 'response.reasoning_summary_text.delta', delta: 'step.' },
            { type: 'response.reasoning_summary_text.done', text: 'First step.' }
        ]) api.processOpenaiStreamLine(provider, `data: ${JSON.stringify(event)}`);
        assert.equal(api.reasoningText(), 'First step.');
    });

    test(`${file}: text, images, and assistant history use the correct protocol schema`, () => {
        const image = 'data:image/png;base64,AA==';
        const chat = api.buildVisionPayload(create(), 'reasoning-mm', 'describe', image);
        const responsesProvider = create({ type: 'openai-responses' });
        const responses = api.buildVisionPayload(responsesProvider, 'reasoning-mm', 'describe', image);
        assert.equal(chat.input, undefined);
        assert.equal(chat.messages.at(-1).content[0].image_url.url, image);
        assert.equal(chat.messages.at(-1).content[1].type, 'text');
        assert.equal(responses.messages, undefined);
        assert.equal(responses.input.at(-1).content[0].image_url, image);
        assert.equal(responses.input.at(-1).content[0].type, 'input_image');
        assert.equal(responses.input.at(-1).content[0].detail, 'auto');
        assert.equal(responses.input.at(-1).content[1].type, 'input_text');
        const assistant = api.buildProviderMessage(responsesProvider, 'assistant', 'previous answer', '');
        assert.equal(assistant.role, 'assistant');
        assert.equal(assistant.content, 'previous answer');
        const history = api.buildProviderPayload(responsesProvider, 'reasoning-mm', [assistant]);
        assert.equal(history.input[0].content, 'previous answer');
        const oldTemplate = create({ type: 'openai-responses', bodyTemplate: { model: '{{model}}', input: '{{messages}}', stream: true } });
        assert.equal(oldTemplate.bodyTemplate.input, '{{input}}');
    });

    test(`${file}: API model refresh preserves capabilities and adds unchecked models`, () => {
        const provider = create();
        api.fillProviderModelGroups(provider, ['new', 'reasoning-mm']);
        assert.equal(api.getProviderSelectedModel(provider).supportsReasoning, true);
        assert.equal(provider.modelGroups[0].models[0].supportsReasoning, false);
        assert.equal(provider.modelGroups[0].models[0].supportsMultimodal, false);
        assert.equal(provider.modelGroups[0].models[1].supportsMultimodal, true);
        assert.ok(api.getDefaultProviderTemplates().every(provider => provider.modelGroups.length === 1));
        assert.ok(api.buildModelButtonsHTML(provider.modelGroups[0], provider.id).includes('多模态'));
    });
}
