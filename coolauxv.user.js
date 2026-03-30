// ==UserScript==
// @name         CoolAuxv 网页翻译与阅读助手
// @namespace    https://github.com/CoolestEnoch/CoolAuxv
// @version      v16.4
// @description  使用模块化提供商的网页翻译与解读工具，支持多种语言模型和推理模型，提供丰富的配置选项，优化阅读体验。
// @author       github@CoolestEnoch
// @match        *://*/*
// @match        https://mozilla.github.io/pdf.js/web/viewer.html*
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_getResourceText
// @grant        GM_listValues
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js
// @require      https://cdn.jsdelivr.net/npm/mermaid@9.4.3/dist/mermaid.min.js
// @resource     katexCSS https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css
// @connect      open.bigmodel.cn
// @connect      api.openai.com
// @connect      api.cnb.cool
// @connect      *
// @license      GPL-3.0
// @downloadURL  https://github.com/CoolestEnoch/CoolAuxv/raw/refs/heads/main/coolauxv.user.js
// @updateURL    https://github.com/CoolestEnoch/CoolAuxv/raw/refs/heads/main/coolauxv.meta.js
// ==/UserScript==


(function () {
    'use strict';

    const BRIDGE_SOURCE_EXT = "coolauxv-extension";
    const BRIDGE_SOURCE_US = "coolauxv-userscript";
    const BRIDGE_PING_TYPE = "coolauxv_bridge_ping";
    const BRIDGE_READY_TYPE = "coolauxv_bridge_ready";
    const BRIDGE_REQUEST_TYPE = "coolauxv_bridge_request";
    const BRIDGE_RESPONSE_TYPE = "coolauxv_bridge_response";
    const BRIDGE_DETECT_TIMEOUT_MS = 800;

    let extensionDetected = false;
    let bridgeToken = "";
    let startMainTimer = null;
    let uiStarted = false;
    let requestBridgeCleanup = () => { };

    const isCoolauxvKey = (key) => typeof key === "string" && key.startsWith("coolauxv_");

    const generateBridgeToken = () => {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    };

    const generateRequestId = () => {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    };

    const generateMessageId = () => {
        return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    };

    const postBridgeMessage = (payload) => {
        window.postMessage({ source: BRIDGE_SOURCE_US, ...payload }, "*");
    };

    const markExtensionDetected = () => {
        if (extensionDetected) {
            return;
        }
        extensionDetected = true;
        if (startMainTimer) {
            clearTimeout(startMainTimer);
            startMainTimer = null;
        }
        if (uiStarted) {
            requestBridgeCleanup();
        }
    };

    const getBridgeKeys = () => {
        if (typeof GM_listValues !== "function") {
            return [];
        }
        return GM_listValues().filter(isCoolauxvKey);
    };

    const handleBridgeRequest = (data) => {
        if (!bridgeToken || data.token !== bridgeToken) {
            return;
        }
        const id = data.id;
        const action = data.action;
        const response = { type: BRIDGE_RESPONSE_TYPE, id: id, ok: true };
        try {
            if (action === "get") {
                const key = data.key;
                const fallback = data.defaultValue;
                response.value = isCoolauxvKey(key) ? GM_getValue(key, fallback) : fallback;
            } else if (action === "set") {
                const key = data.key;
                if (isCoolauxvKey(key)) {
                    GM_setValue(key, data.value);
                }
            } else if (action === "delete") {
                const key = data.key;
                if (isCoolauxvKey(key)) {
                    GM_deleteValue(key);
                }
            } else if (action === "list") {
                response.value = getBridgeKeys();
            } else if (action === "dump") {
                const dump = {};
                const keys = getBridgeKeys();
                keys.forEach((key) => {
                    dump[key] = GM_getValue(key);
                });
                response.value = dump;
            } else if (action === "clear") {
                const keys = getBridgeKeys();
                keys.forEach((key) => GM_deleteValue(key));
                response.value = keys.length;
            } else {
                response.ok = false;
                response.error = "unknown action";
            }
        } catch (err) {
            response.ok = false;
            response.error = err ? err.message || String(err) : "error";
        }
        postBridgeMessage(response);
    };

    const setupBridgeServer = () => {
        window.addEventListener("message", (event) => {
            if (event.source !== window) {
                return;
            }
            const data = event.data;
            if (!data || data.source !== BRIDGE_SOURCE_EXT) {
                return;
            }
            if (data.type === BRIDGE_PING_TYPE) {
                if (!bridgeToken) {
                    bridgeToken = generateBridgeToken();
                }
                markExtensionDetected();
                postBridgeMessage({
                    type: BRIDGE_READY_TYPE,
                    nonce: data.nonce,
                    token: bridgeToken,
                    protocol: 1
                });
                return;
            }
            if (data.type === BRIDGE_REQUEST_TYPE) {
                markExtensionDetected();
                handleBridgeRequest(data);
            }
        });
    };

    // ========================================================================
    // 全局配置与常量
    // ========================================================================

    const DEFAULT_PROVIDER = "zhipu";
    const DEFAULT_MODEL_PROVIDER = "zhipu";
    const PROVIDER_TEMPLATE_STORAGE_KEY = "coolauxv_provider_templates_v1";
    const PROVIDER_SECRET_STORAGE_KEY = "coolauxv_provider_custom_secrets_v1";
    const LEGACY_PROVIDER_MIGRATION_FLAG = "coolauxv_legacy_provider_settings_migrated_v1";
    const PROVIDER_SHARE_VERSION = 1;
    const ACTION_TEMPLATE_STORAGE_KEY = "coolauxv_action_templates_v1";
    const ACTION_SHARE_VERSION = 1;
    const CHAT_HISTORY_SHARE_VERSION = 1;
    const CHAT_HISTORY_SHARE_TYPE = "coolauxv-chat-history";
    const CHAT_QUEUE_SHARE_VERSION = 1;
    const CHAT_QUEUE_SHARE_TYPE = "coolauxv-chat-queue";
    const CHAT_QUEUE_STORAGE_KEY = "coolauxv_chat_queue_v1";
    const CHAT_QUEUE_VERSION = 1;
    const CHAT_QUEUE_MAX_SIZE = 100;
    const DEFAULT_KEY_LINK_TITLE = "获取 KEY";
    const DEFAULT_PROVIDER_SESSION_FIELD_KEY = "conversationId";
    const getScriptVersion = () => {
        const gmInfo = (typeof GM_info !== "undefined" && GM_info) ? GM_info : (globalThis && globalThis.GM_info);
        if (gmInfo && gmInfo.script && gmInfo.script.version) {
            return String(gmInfo.script.version);
        }
        return "";
    };

    const LOG_PRESETS = ["debug", "info", "warn", "error", "none"];

    const DEFAULT_LOG_LEVEL = "none";

    const DEFAULT_PROMPT_VISION = "请先详细描述这张图，然后再详细解读这张图。";
    const DEFAULT_ENABLE_CONTINUOUS_CHAT = false;
    const DEFAULT_CHAT_HISTORY_PERSIST = false;
    const DEFAULT_CHAT_ENTER_SEND = false;
    const DEFAULT_PROMPT_CONTINUOUS_CHAT = "忽略之前给你的提示词，现在开始你是一个连续对话助手，要结合上下文用中文回答用户问题；如有图片，请结合图片内容回答；要听从用户指示。";

    const DEFAULT_WIN_WIDTH = "480px";
    const DEFAULT_WIN_HEIGHT = "480px";

    const DEFAULT_SHOW_RAW = false;
    const DEFAULT_SHOW_REASONING = true;
    const DEFAULT_ENABLE_BLUR_GLASS = false; // 默认关闭模糊
    const DEFAULT_USE_NEW_SCREENSHOT = "v1"; // 默认使用老逻辑截图
    const DEFAULT_ENABLE_BASIC_ANIM = true; // 默认开启基础动画（折叠/展开）
    const DEFAULT_ENABLE_MINIMIZE_ANIM = false; // 默认关闭收起动画
    const DEFAULT_SELECTION_ICON_ACTION = "translate";
    const POPUP_ANIM_EASING = "cubic-bezier(0.2, 0, 0, 1)";
    const POPUP_ANIM_EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
    const POPUP_ANIM_EASE_OUT = "cubic-bezier(0, 0, 0.2, 1)";
    const DEFAULT_ANIM_SPEED = 1;

    const DEFAULT_ACTION_TEMPLATE_BASE64_LIST = [
        "eyJpZCI6InRyYW5zbGF0ZSIsImxhYmVsIjoi57+76K+RIiwic3lzdGVtUHJvbXB0Ijoi5L2g5piv5LiA5Liq57+76K+R5byV5pOO44CC5bCG55So5oi36L6T5YWl55u05o6l57+76K+R5oiQ5Lit5paH44CC5aaC5p6c6L6T5YWl5piv5Lit5paH5YiZ6K+R5Li66Iux5paH44CC5LiN6KaB6L6T5Ye65Lu75L2V5aSa5L2Z55qE6Kej6YeK44CCIiwiY29sb3IiOiJyZ2IoMjQ5LCAyNTAsIDI1MSkiLCJ2aXNpb25Qcm9tcHRPcmRlciI6ImFmdGVyIn0=",
        "eyJpZCI6ImV4cGxhaW4iLCJsYWJlbCI6Iuino+ivuyIsInN5c3RlbVByb21wdCI6IueUqOaIt+i+k+WFpeaWh+acrOWQju+8jOWFiOe/u+ivkeWFqOaWh++8muiLpemdnuS4reaWh+ivkeaIkOS4reaWh++8jOiLpeaYr+S4reaWh+ivkeaIkOiLseaWh++8jOS4uuiLseaWh+eugOWGmeeUqOaLrOWPt+agh+azqOWujOaVtOWGmeazleOAgueUqOaIt+aYr+i/meS4qumihuWfn+eahOaWsOaJi++8jOS9oOaYr+i/meS4qumihuWfn+eahOi1hOa3seS4k+WutuWFvOWkp+W4iO+8jOeEtuWQjuivpue7huino+ivu++8mueUqOmAmuS/l+S4reaWh+ino+mHiuaJgOacieS4k+S4muamguW/te+8jOavj+S4quamguW/teino+mHiuWJjeWFiOaYjuehruagh+azqOWOn+acr+ivre+8iOiLseaWh+eugOWGmemcgOWQjOaXtue7meWHuuWFqOensO+8iSzlpoLmnpzmnInlhazlvI/vvIzor7fnlKhsYXRleOagvOW8j+i+k+WHuuOAguino+ivu+imgeivpue7huWFqOmdou+8jOa2teebluWumuS5ieOAgeiDjOaZr+OAgeWOn+eQhuOAgeW6lOeUqOWSjOaEj+S5ieOAgui+k+WHuuS4uuaOkueJiOS4sOWvjOeahE1hcmtkb3du77yM6Zmk57+76K+R5aSW5YWo5paH6YO955So5Lit5paH5Zue562U77yM5LiN5YWB6K645oqK5YWo5paH6YO95pS+5ZyoY29kZWJsb2Nr6YeM44CCIiwiY29sb3IiOiJyZ2IoMTA5LCA0MCwgMjE3KSIsInZpc2lvblByb21wdE9yZGVyIjoiYmVmb3JlIn0=",
        "eyJ2ZXJzaW9uIjoxLCJhY3Rpb25zIjpbeyJpZCI6Ii0tIiwibGFiZWwiOiLmgLvnu5MiLCJzeXN0ZW1Qcm9tcHQiOiLnlKjkuK3mlofmgLvnu5PnlKjmiLfovpPlhaXnmoTmlofmnKzvvIzlj6/ku6Xmj5LlhaVtZXJtYWlk5rWB56iL5Zu+77yM5Luj56CB5b+F6aG75pS+5ZyoY29kZWJsb2Nr6YeM77yMbGF0ZXjlhazlvI/lv4XpobvnlKgk5YyF6KO577yM5LiN54S25riy5p+T5LiN5LqG44CCIiwiY29sb3IiOiJyZ2IoNjMsIDIxNywgMTkyKSJ9XX0=",
        "eyJ2ZXJzaW9uIjoxLCJhY3Rpb25zIjpbeyJpZCI6ImNoYXQiLCJsYWJlbCI6IuiBiuWkqSIsInN5c3RlbVByb21wdCI6IuWSjOeUqOaIt+i/m+ihjOS6pOa1geOAgiJ9XX0="
    ];

    const LATEST_CHANGELOG = `
        v16.3
        ## ✨ 新功能
        *   支持Ollama API了
        ---
        v16.3.2
        ## 🔧 问题修复
        *   修复分隔线显示不够明显的问题
        ---
        v16.3.1
        ## 🔧 问题修复
        *   修复AI输出没法被正确停止的问题
        *   修复顶部区域、连续对话区域动画消失
        ---
        v16.3
        ## ✨ 新功能
        *   支持No-History Chat格式的提供商了
        ## 🔧 问题修复
        *   自定义大模型提供商的时候会显示每个字段的占位符了
        ---
        v16.2.1 更新日志
        ## 🔧 问题修复
        *   丢失的连续对话提示词设置UI回来了
        ---
        v16.2 更新日志
        ## 🔧 问题修复
        *   修复聊天记录导出失败
        *   修复导入聊天记录成功后不会立即刷新
        *   修复聊天记录管理页有时候会自己关掉
        *   修复聊天记录导出时角色选择不生效
        *   修复导出为pdf时不会渲染markdown界面
        ## ✨ 新功能
        *   主界面按钮可一键恢复默认了
        *   新增“总结”和“聊天”按钮
        ## ⚡ 优化
        *   优化内置大模型提供商和主界面按钮配置文件的处理逻辑
        *   优化内置大模型提供商和主界面按钮分享的id设置逻辑
        ---
        v16.1.3 更新日志
        ## 🔧 问题修复
        *   修复不勾选聊天记录持久化也会保存聊天记录
        ---
        v16.1.2 更新日志
        ## 🔧 问题修复
        *   修复导入聊天记录后自动开启聊天记录持久化
        *   修复聊天记录持久化按钮不勾选时不能管理聊天记录
        ---
        v16.1.1 更新日志
        ## 🔧 问题修复
        *   修复导入ChatGPT聊天记录的时候不会导入引用信息
        ---
        v16.1 更新日志
        ## ✨ 新功能
        *   支持导入ChatGPT的聊天记录了，目前已测试[这个插件](https://github.com/pionxzh/chatgpt-exporter)导出的json可用。
        ---
        v16.0 更新日志
        ## ✨ 新功能
        *   首页按钮“翻译”、“解读”按钮解耦，可自定义、可新增可删除。
        *   大模型提供商、首页自定义按钮顺序可以自定义拖动排序了。
        *   **Mermaid 图表渲染**：支持在对话中渲染流程图、时序图、甘特图等 Mermaid 图表
        *   **PDF 阅读增强**：
            *   内置 PDF.js 查看器支持分数缩放，缩放更平滑
            *   自动将 arXiv 的 PDF 链接重定向到内置查看器，无需手动切换
        ## 🔧 问题修复
        *   修复偶发的本地 PDF 文件无法在内置 PDF.js 中预览的问题
        *   修复pdfjs预览器里可能出现两个分数缩放输入框的问题
        *   修复pdfjs预览器里偶发的没法分数缩放问题
        ## 🎨 界面优化
        *   错误提示信息增加“删除”按钮，可快速关闭
        *   空输入时的错误提示改为浮动显示，避免遮挡界面
    `;

    const DEFAULT_PROVIDER_BASE64_LIST = [
        "eyJpZCI6InpoaXB1IiwibGFiZWwiOiLmmbrosLEiLCJ0eXBlIjoiY2hhdC1jb21wbGV0aW9ucyIsImJhc2VVcmwiOiJodHRwczovL29wZW4uYmlnbW9kZWwuY24vYXBpL3BhYXMvdjQvY2hhdC9jb21wbGV0aW9ucyIsImFwaUtleSI6IiIsImFwaUtleVBsYWNlaG9sZGVyIjoiMTE0NTE0MTkxOTgxMOWTvOWTvOWViuWViuWViuWViuWViiIsImtleUxpbmsiOiJodHRwczovL2JpZ21vZGVsLmNuL3VzZXJjZW50ZXIvcHJvai1tZ210L2FwaWtleXMiLCJyb2xlcyI6eyJzeXN0ZW0iOiJzeXN0ZW0iLCJ1c2VyIjoidXNlciIsImFzc2lzdGFudCI6ImFzc2lzdGFudCJ9LCJoZWFkZXJzVGVtcGxhdGUiOnsiQ29udGVudC1UeXBlIjoiYXBwbGljYXRpb24vanNvbiIsIkF1dGhvcml6YXRpb24iOiJCZWFyZXIge3thcGlLZXl9fSJ9LCJib2R5VGVtcGxhdGUiOnsibW9kZWwiOiJ7e21vZGVsfX0iLCJzdHJlYW0iOnRydWUsIm1lc3NhZ2VzIjoie3ttZXNzYWdlc319In0sInN0cmVhbSI6eyJwYXJzZXIiOiJjaGF0LWNvbXBsZXRpb25zIiwiZGVsdGFQYXRoIjoiY2hvaWNlcy4wLmRlbHRhLmNvbnRlbnQiLCJyZWFzb25pbmdQYXRoIjoiY2hvaWNlcy4wLmRlbHRhLnJlYXNvbmluZ19jb250ZW50In0sInN1cHBvcnRzVmlzaW9uIjp0cnVlLCJtb2RlbEdyb3VwcyI6W3siaWQiOiJnZW5lcmFsIiwibGFiZWwiOiLpgJrnlKjmqKHlnosiLCJ0eXBlIjoidGV4dCIsIm1vZGVscyI6W3siaWQiOiJnbG0tNC1mbGFzaCIsImNsYXNzIjoi6K+t6KiA5qih5Z6LIiwidGFnIjoi5YWN6LS5In0seyJpZCI6ImdsbS00LWZsYXNoLTI1MDQxNCIsImNsYXNzIjoi6K+t6KiA5qih5Z6LIiwidGFnIjoi5YWN6LS5In0seyJpZCI6ImdsbS00di1mbGFzaCIsImNsYXNzIjoi6YCa55So5qih5Z6LIiwidGFnIjoi5YWN6LS5IHwg5aSa5qih5oCBIn0seyJpZCI6ImdsbS00LjUtZmxhc2giLCJjbGFzcyI6IuaOqOeQhuaooeWeiyIsInRhZyI6IuWFjei0uSJ9LHsiaWQiOiJnbG0tejEtZmxhc2giLCJjbGFzcyI6IuaOqOeQhuaooeWeiyIsInRhZyI6IuWFjei0uSJ9LHsiaWQiOiJnbG0tNC42di1mbGFzaCIsImNsYXNzIjoi5o6o55CG5qih5Z6LIiwidGFnIjoi5YWN6LS5IHwg5aSa5qih5oCBIn0seyJpZCI6ImdsbS00LjF2LXRoaW5raW5nLWZsYXNoIiwiY2xhc3MiOiLmjqjnkIbmqKHlnosiLCJ0YWciOiLlhY3otLkgfCDlpJrmqKHmgIEifSx7ImlkIjoiZ2xtLTQuNyIsImNsYXNzIjoi5o6o55CG5qih5Z6LIiwidGFnIjoi5LuY6LS5In0seyJpZCI6ImRlZXBzZWVrLXIxIiwiY2xhc3MiOiLmjqjnkIbmqKHlnosiLCJ0YWciOiLku5jotLkifV19LHsiaWQiOiJ2aXNpb24iLCJsYWJlbCI6IuinhuinieaooeWeiyIsInR5cGUiOiJ2aXNpb24iLCJtb2RlbHMiOlt7ImlkIjoiZ2xtLTR2LWZsYXNoIiwiY2xhc3MiOiLpgJrnlKjmqKHlnosiLCJ0YWciOiLlhY3otLkgfCDlpJrmqKHmgIEifSx7ImlkIjoiZ2xtLTQuNnYtZmxhc2giLCJjbGFzcyI6IuaOqOeQhuaooeWeiyIsInRhZyI6IuWFjei0uSB8IOWkmuaooeaAgSJ9LHsiaWQiOiJnbG0tNC4xdi10aGlua2luZy1mbGFzaCIsImNsYXNzIjoi5o6o55CG5qih5Z6LIiwidGFnIjoi5YWN6LS5IHwg5aSa5qih5oCBIn1dfV0sImRpc3BsYXkiOnsiYXBpS2V5Ijp0cnVlLCJtb2RlbEdyb3VwcyI6dHJ1ZX0sInJlcG8iOiIifQ==",
        "eyJpZCI6Im9wZW5haSIsImxhYmVsIjoiT3BlbkFJIiwidHlwZSI6Im9wZW5haS1yZXNwb25zZXMiLCJiYXNlVXJsIjoiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MS9yZXNwb25zZXMiLCJhcGlLZXkiOiIiLCJhcGlLZXlQbGFjZWhvbGRlciI6InNrLTExNDUxNDE5MTk4MTAiLCJrZXlMaW5rIjoiaHR0cHM6Ly9wbGF0Zm9ybS5vcGVuYWkuY29tL2FwaS1rZXlzIiwicm9sZXMiOnsic3lzdGVtIjoic3lzdGVtIiwidXNlciI6InVzZXIiLCJhc3Npc3RhbnQiOiJhc3Npc3RhbnQifSwiaGVhZGVyc1RlbXBsYXRlIjp7IkNvbnRlbnQtVHlwZSI6ImFwcGxpY2F0aW9uL2pzb24iLCJBdXRob3JpemF0aW9uIjoiQmVhcmVyIHt7YXBpS2V5fX0iLCJPcGVuQUktQ2xpZW50IjoiQ29vbEF1eHYifSwiYm9keVRlbXBsYXRlIjp7Im1vZGVsIjoie3ttb2RlbH19Iiwic3RyZWFtIjp0cnVlLCJpbnB1dCI6Int7bWVzc2FnZXN9fSJ9LCJzdHJlYW0iOnsicGFyc2VyIjoib3BlbmFpLXJlc3BvbnNlcyIsImRlbHRhUGF0aCI6IiIsInJlYXNvbmluZ1BhdGgiOiIifSwic3VwcG9ydHNWaXNpb24iOnRydWUsIm1vZGVsR3JvdXBzIjpbeyJpZCI6ImdlbmVyYWwiLCJsYWJlbCI6IumAmueUqOaooeWeiyIsInR5cGUiOiJ0ZXh0IiwibW9kZWxzIjpbeyJpZCI6ImdwdC00by1taW5pIiwiY2xhc3MiOiLpgJrnlKjmqKHlnosiLCJ0YWciOiLmjqjojZAifSx7ImlkIjoiZ3B0LTRvIiwiY2xhc3MiOiLpgJrnlKjmqKHlnosiLCJ0YWciOiLpq5jmgKfog70ifSx7ImlkIjoiZ3B0LTQuMS1taW5pIiwiY2xhc3MiOiLpgJrnlKjmqKHlnosiLCJ0YWciOiLpq5jmgKfku7fmr5QifV19XSwiZGlzcGxheSI6eyJhcGlLZXkiOnRydWUsIm1vZGVsR3JvdXBzIjp0cnVlfSwicmVwbyI6IiJ9",
        "eyJpZCI6ImNuYiIsImxhYmVsIjoiQ05CIiwidHlwZSI6ImNoYXQtY29tcGxldGlvbnMiLCJiYXNlVXJsIjoiaHR0cHM6Ly9hcGkuY25iLmNvb2wve3JlcG99Ly0vYWkvY2hhdC9jb21wbGV0aW9ucyIsImFwaUtleSI6IiIsImFwaUtleVBsYWNlaG9sZGVyIjoiY25iLTExNDUxNDE5MTk4MTAiLCJrZXlMaW5rIjoiaHR0cHM6Ly9jbmIuY29vbC9wcm9maWxlL3Rva2VuL2NyZWF0ZSIsInJvbGVzIjp7InN5c3RlbSI6InN5c3RlbSIsInVzZXIiOiJ1c2VyIiwiYXNzaXN0YW50IjoiYXNzaXN0YW50In0sImhlYWRlcnNUZW1wbGF0ZSI6eyJDb250ZW50LVR5cGUiOiJhcHBsaWNhdGlvbi9qc29uIiwiQWNjZXB0IjoiYXBwbGljYXRpb24vdm5kLmNuYi5hcGkranNvbiIsIkF1dGhvcml6YXRpb24iOiJCZWFyZXIge3thcGlLZXl9fSJ9LCJib2R5VGVtcGxhdGUiOnsibW9kZWwiOiJ7e21vZGVsfX0iLCJzdHJlYW0iOnRydWUsIm1lc3NhZ2VzIjoie3ttZXNzYWdlc319In0sInN0cmVhbSI6eyJwYXJzZXIiOiJjaGF0LWNvbXBsZXRpb25zIiwiZGVsdGFQYXRoIjoiY2hvaWNlcy4wLmRlbHRhLmNvbnRlbnQiLCJyZWFzb25pbmdQYXRoIjoiIn0sInN1cHBvcnRzVmlzaW9uIjpmYWxzZSwibW9kZWxHcm91cHMiOlt7ImlkIjoiZ2VuZXJhbCIsImxhYmVsIjoi6YCa55So5qih5Z6LIiwidHlwZSI6InRleHQiLCJtb2RlbHMiOlt7ImlkIjoiaHVueXVhbi1hMTNiIiwiY2xhc3MiOiLpgJrnlKjmqKHlnosiLCJ0YWciOiLpu5jorqQifV19XSwiZGlzcGxheSI6eyJhcGlLZXkiOnRydWUsIm1vZGVsR3JvdXBzIjp0cnVlfSwicmVwbyI6IiJ9"
    ];

    const DEFAULT_DISPLAY_FIELDS = {
        apiKey: true,
        modelGroups: true,
        label: false,
        baseUrl: false,
        apiKeyPlaceholder: false,
        keyLink: false,
        roles: false,
        type: false,
        supportsVision: false,
        supportsContinuousChat: false,
        streamDelta: false,
        streamReasoning: false,
        streamSession: false,
        streamReasoningTag: false,
        headersTemplate: false,
        bodyTemplate: false,
        customFields: false,
        customFieldsMask: false
    };

    let providerTemplatesCache = null;
    let actionTemplatesCache = null;
    const MERMAID_RENDER_FAILED = Symbol("coolauxv_mermaid_render_failed");
    const chatMermaidSvgCache = new Map();
    const chatMermaidRenderPending = new Map();
    let chatMermaidCacheVersion = 0;
    let mermaidLocalRendererInitialized = false;

    const normalizeMermaidCode = (code) => String(code || "").replace(/\r\n?/g, "\n").trim();

    const isMermaidRendererLike = (value) => {
        if (!value) return false;
        if (typeof value.render === "function") return true;
        if (value.mermaidAPI && typeof value.mermaidAPI.render === "function") return true;
        return false;
    };

    const unwrapMermaidRenderer = (value) => {
        if (!value) return null;
        if (isMermaidRendererLike(value)) return value;
        if (value.default && isMermaidRendererLike(value.default)) return value.default;
        return null;
    };

    const getLocalMermaidRenderer = () => {
        const candidates = [];
        if (typeof mermaid !== "undefined" && mermaid) {
            candidates.push(mermaid);
        }
        if (globalThis && globalThis.mermaid) {
            candidates.push(globalThis.mermaid);
        }
        if (typeof module !== "undefined" && module && module.exports) {
            candidates.push(module.exports);
        }
        if (typeof exports !== "undefined" && exports) {
            candidates.push(exports);
        }
        for (let i = 0; i < candidates.length; i++) {
            const resolved = unwrapMermaidRenderer(candidates[i]);
            if (!resolved) continue;
            if (globalThis && !globalThis.mermaid) {
                try {
                    globalThis.mermaid = resolved;
                } catch (e) { }
            }
            return resolved;
        }
        return null;
    };

    const initLocalMermaidRendererIfNeeded = (renderer) => {
        if (!renderer || mermaidLocalRendererInitialized) return;
        const mermaidInitConfig = {
            startOnLoad: false,
            securityLevel: "strict",
            theme: "default",
            flowchart: {
                htmlLabels: false
            }
        };
        if (typeof renderer.initialize === "function") {
            renderer.initialize(mermaidInitConfig);
            mermaidLocalRendererInitialized = true;
            return;
        }
        if (renderer.mermaidAPI && typeof renderer.mermaidAPI.initialize === "function") {
            renderer.mermaidAPI.initialize(mermaidInitConfig);
            mermaidLocalRendererInitialized = true;
        }
    };

    const requestMermaidSvgByLocal = (code) => {
        return new Promise((resolve, reject) => {
            const renderer = getLocalMermaidRenderer();
            if (!renderer) {
                reject(new Error("Mermaid local renderer unavailable"));
                return;
            }
            try {
                initLocalMermaidRendererIfNeeded(renderer);
            } catch (err) {
                reject(err);
                return;
            }
            const renderApi = renderer.mermaidAPI && typeof renderer.mermaidAPI.render === "function"
                ? renderer.mermaidAPI
                : renderer;
            if (!renderApi || typeof renderApi.render !== "function") {
                reject(new Error("Mermaid render API unavailable"));
                return;
            }
            const renderId = `coolauxv-mermaid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            const resolveSvg = (value) => {
                let svgText = "";
                if (typeof value === "string") {
                    svgText = value;
                } else if (value && typeof value.svg === "string") {
                    svgText = value.svg;
                }
                if (svgText && svgText.includes("<svg")) {
                    resolve(svgText);
                    return;
                }
                reject(new Error("Mermaid local render returned invalid svg"));
            };
            try {
                if (renderApi.render.length >= 3) {
                    renderApi.render(renderId, code, (svgCode) => {
                        resolveSvg(svgCode);
                    });
                    return;
                }
                const renderResult = renderApi.render(renderId, code);
                if (renderResult && typeof renderResult.then === "function") {
                    renderResult.then((output) => {
                        resolveSvg(output);
                    }).catch((err) => reject(err));
                    return;
                }
                resolveSvg(renderResult);
            } catch (err) {
                reject(err);
            }
        });
    };

    const clearMermaidSvgCache = () => {
        chatMermaidCacheVersion += 1;
        chatMermaidSvgCache.clear();
        chatMermaidRenderPending.clear();
    };

    const getCachedMermaidSvg = (code) => {
        const normalized = normalizeMermaidCode(code);
        if (!normalized) return "";
        const cached = chatMermaidSvgCache.get(normalized);
        return typeof cached === "string" ? cached : "";
    };

    const isMermaidRenderFailed = (code) => {
        const normalized = normalizeMermaidCode(code);
        if (!normalized) return false;
        return chatMermaidSvgCache.get(normalized) === MERMAID_RENDER_FAILED;
    };

    const ensureMermaidSvgCached = (code) => {
        const normalized = normalizeMermaidCode(code);
        if (!normalized) return Promise.resolve("");
        if (chatMermaidSvgCache.has(normalized)) {
            const cached = chatMermaidSvgCache.get(normalized);
            return Promise.resolve(typeof cached === "string" ? cached : "");
        }
        if (chatMermaidRenderPending.has(normalized)) {
            return chatMermaidRenderPending.get(normalized);
        }
        const requestVersion = chatMermaidCacheVersion;
        const task = requestMermaidSvgByLocal(normalized)
            .then((svgText) => {
                if (requestVersion !== chatMermaidCacheVersion) return "";
                if (svgText) {
                    chatMermaidSvgCache.set(normalized, svgText);
                    return svgText;
                }
                chatMermaidSvgCache.set(normalized, MERMAID_RENDER_FAILED);
                return "";
            })
            .catch((err) => {
                if (requestVersion === chatMermaidCacheVersion) {
                    chatMermaidSvgCache.set(normalized, MERMAID_RENDER_FAILED);
                    Logger.warn("CoolAuxv Mermaid 渲染失败:", err);
                }
                return "";
            })
            .finally(() => {
                chatMermaidRenderPending.delete(normalized);
            });
        chatMermaidRenderPending.set(normalized, task);
        return task;
    };

    const cloneDeep = (obj) => JSON.parse(JSON.stringify(obj));

    const normalizeProviderId = (id) => String(id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const normalizeProviderType = (type) => {
        if (type === "openai-responses") return "openai-responses";
        if (type === "chat-parts") return "chat-parts";
        if (type === "ollama") return "ollama";
        if (type === "chat-no-history") return "chat-no-history";
        return "chat-completions";
    };
    const isChatCompletionsLikeProviderType = (type) => {
        const normalized = normalizeProviderType(type);
        return normalized === "chat-completions" || normalized === "chat-no-history" || normalized === "ollama";
    };
    const getProviderTypeLabel = (type) => {
        const normalized = normalizeProviderType(type);
        if (normalized === "openai-responses") return "OpenAI Responses";
        if (normalized === "chat-parts") return "Chat Parts";
        if (normalized === "ollama") return "Ollama";
        if (normalized === "chat-no-history") return "No-History Chat";
        return "Chat Completions";
    };
    const getDefaultBodyTemplateByType = (type) => {
        const normalized = normalizeProviderType(type);
        if (normalized === "openai-responses") {
            return { model: "{{model}}", stream: true, input: "{{messages}}" };
        }
        if (normalized === "chat-parts") {
            return { model: "{{model}}", id: "{{requestId}}", messages: "{{messages}}", trigger: "{{trigger}}" };
        }
        if (normalized === "chat-no-history") {
            return {
                conversationId: "{{conversationId}}",
                content: "{{latestUserText}}",
                model: "{{model}}"
            };
        }
        if (normalized === "ollama") {
            return { model: "{{model}}", stream: true, messages: "{{messages}}" };
        }
        return { model: "{{model}}", stream: true, messages: "{{messages}}" };
    };
    const getDefaultDeltaPathByType = (type) => {
        const normalized = normalizeProviderType(type);
        if (normalized === "openai-responses" || normalized === "chat-parts") return "";
        if (normalized === "chat-no-history") return "content";
        if (normalized === "ollama") return "message.content";
        return "choices.0.delta.content";
    };
    const getDefaultStreamTemplateByType = (type) => {
        const normalized = normalizeProviderType(type);
        const parser = normalized === "chat-no-history" ? "chat-completions" : normalized;
        return {
            parser: parser,
            deltaPath: getDefaultDeltaPathByType(normalized),
            reasoningPath: "",
            sessionIdPath: "",
            sessionIdKey: DEFAULT_PROVIDER_SESSION_FIELD_KEY,
            reasoningTag: ""
        };
    };

    const decodeBase64Utf8 = (base64) => {
        try {
            const raw = atob(base64);
            const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) {
                bytes[i] = raw.charCodeAt(i);
            }
            if (typeof TextDecoder !== "undefined") {
                return new TextDecoder().decode(bytes);
            }
            return decodeURIComponent(escape(raw));
        } catch (e) {
            return "";
        }
    };

    const uint8ToBinaryString = (bytes) => {
        if (!bytes || !bytes.length) return "";
        const chunkSize = 0x8000;
        const chunks = [];
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            chunks.push(String.fromCharCode.apply(null, chunk));
        }
        return chunks.join("");
    };

    const encodeBase64Utf8 = (text) => {
        try {
            const input = String(text === undefined || text === null ? "" : text);
            if (typeof TextEncoder !== "undefined") {
                const bytes = new TextEncoder().encode(input);
                const binary = uint8ToBinaryString(bytes);
                return btoa(binary);
            }
            return btoa(unescape(encodeURIComponent(input)));
        } catch (e) {
            return "";
        }
    };

    const parseProviderBase64 = (base64) => {
        const decoded = decodeBase64Utf8(base64);
        if (!decoded) return null;
        try {
            return JSON.parse(decoded);
        } catch (e) {
            return null;
        }
    };

    const parseActionBase64 = (base64) => {
        const decoded = decodeBase64Utf8(base64);
        if (!decoded) return null;
        try {
            return JSON.parse(decoded);
        } catch (e) {
            return null;
        }
    };

    const unpackActionPayloadItems = (payload) => {
        if (!payload || typeof payload !== "object") return [];
        if (Array.isArray(payload.actions)) {
            return payload.actions.filter((item) => item && typeof item === "object");
        }
        return [payload];
    };

    const unpackProviderPayloadItems = (payload) => {
        if (!payload || typeof payload !== "object") return [];
        if (Array.isArray(payload.providers)) {
            return payload.providers.filter((item) => item && typeof item === "object");
        }
        return [payload];
    };

    const parseDefaultActionTemplateBase64Entry = (base64) => {
        return unpackActionPayloadItems(parseActionBase64(base64));
    };

    const parseDefaultProviderTemplateBase64Entry = (base64) => {
        return unpackProviderPayloadItems(parseProviderBase64(base64));
    };

    const clampColorValue = (value, min, max) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return min;
        return Math.max(min, Math.min(max, num));
    };

    const normalizeHue = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return 0;
        const base = num % 360;
        return base < 0 ? base + 360 : base;
    };

    const parseRgbString = (value) => {
        const matched = String(value || "").trim().match(/^rgba?\(\s*([^\)]+)\s*\)$/i);
        if (!matched) return null;
        const parts = matched[1].split(",").map((part) => part.trim());
        if (parts.length < 3) return null;
        const parseChannel = (raw) => {
            if (raw.endsWith("%")) {
                const pct = clampColorValue(parseFloat(raw), 0, 100);
                return Math.round((pct / 100) * 255);
            }
            return Math.round(clampColorValue(parseFloat(raw), 0, 255));
        };
        const r = parseChannel(parts[0]);
        const g = parseChannel(parts[1]);
        const b = parseChannel(parts[2]);
        if (![r, g, b].every((item) => Number.isFinite(item))) return null;
        return { r: r, g: g, b: b };
    };

    const hslToRgb = (h, s, l) => {
        const hh = normalizeHue(h);
        const ss = clampColorValue(s, 0, 100) / 100;
        const ll = clampColorValue(l, 0, 100) / 100;
        if (ss === 0) {
            const gray = Math.round(ll * 255);
            return { r: gray, g: gray, b: gray };
        }
        const chroma = (1 - Math.abs(2 * ll - 1)) * ss;
        const x = chroma * (1 - Math.abs(((hh / 60) % 2) - 1));
        const m = ll - chroma / 2;
        let r1 = 0;
        let g1 = 0;
        let b1 = 0;
        if (hh < 60) {
            r1 = chroma;
            g1 = x;
        } else if (hh < 120) {
            r1 = x;
            g1 = chroma;
        } else if (hh < 180) {
            g1 = chroma;
            b1 = x;
        } else if (hh < 240) {
            g1 = x;
            b1 = chroma;
        } else if (hh < 300) {
            r1 = x;
            b1 = chroma;
        } else {
            r1 = chroma;
            b1 = x;
        }
        return {
            r: Math.round((r1 + m) * 255),
            g: Math.round((g1 + m) * 255),
            b: Math.round((b1 + m) * 255)
        };
    };

    const rgbToHsl = (r, g, b) => {
        const rr = clampColorValue(r, 0, 255) / 255;
        const gg = clampColorValue(g, 0, 255) / 255;
        const bb = clampColorValue(b, 0, 255) / 255;
        const max = Math.max(rr, gg, bb);
        const min = Math.min(rr, gg, bb);
        const delta = max - min;
        let h = 0;
        if (delta !== 0) {
            if (max === rr) {
                h = 60 * (((gg - bb) / delta) % 6);
            } else if (max === gg) {
                h = 60 * (((bb - rr) / delta) + 2);
            } else {
                h = 60 * (((rr - gg) / delta) + 4);
            }
        }
        const l = (max + min) / 2;
        const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
        return {
            h: Math.round(normalizeHue(h)),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    };

    const parseHslString = (value) => {
        const matched = String(value || "").trim().match(/^hsla?\(\s*([^\)]+)\s*\)$/i);
        if (!matched) return null;
        const parts = matched[1].split(",").map((part) => part.trim());
        if (parts.length < 3) return null;
        const hueRaw = parts[0].replace(/deg$/i, "").trim();
        const satRaw = parts[1];
        const lightRaw = parts[2];
        const hue = normalizeHue(parseFloat(hueRaw));
        const sat = satRaw.endsWith("%") ? clampColorValue(parseFloat(satRaw), 0, 100) : clampColorValue(parseFloat(satRaw), 0, 100);
        const light = lightRaw.endsWith("%") ? clampColorValue(parseFloat(lightRaw), 0, 100) : clampColorValue(parseFloat(lightRaw), 0, 100);
        if (![hue, sat, light].every((item) => Number.isFinite(item))) return null;
        return hslToRgb(hue, sat, light);
    };

    const parseColorToRgb = (value) => {
        const raw = String(value || "").trim();
        if (!raw) return null;
        const byRgb = parseRgbString(raw);
        if (byRgb) return byRgb;
        const byHsl = parseHslString(raw);
        if (byHsl) return byHsl;
        return null;
    };

    const rgbToCss = (rgb) => {
        if (!rgb) return "";
        const r = Math.round(clampColorValue(rgb.r, 0, 255));
        const g = Math.round(clampColorValue(rgb.g, 0, 255));
        const b = Math.round(clampColorValue(rgb.b, 0, 255));
        return `rgb(${r}, ${g}, ${b})`;
    };

    const hslToCss = (hsl) => {
        if (!hsl) return "";
        const h = Math.round(normalizeHue(hsl.h));
        const s = Math.round(clampColorValue(hsl.s, 0, 100));
        const l = Math.round(clampColorValue(hsl.l, 0, 100));
        return `hsl(${h}, ${s}%, ${l}%)`;
    };

    const normalizeColorValue = (input, fallback) => {
        const parsed = parseColorToRgb(input);
        if (parsed) return rgbToCss(parsed);
        const fallbackParsed = parseColorToRgb(fallback || "");
        if (fallbackParsed) return rgbToCss(fallbackParsed);
        return "rgb(249, 250, 251)";
    };

    const mixRgbColor = (rgb, targetRgb, ratio) => {
        if (!rgb || !targetRgb) return rgb;
        const t = clampColorValue(ratio, 0, 1);
        return {
            r: Math.round(rgb.r + (targetRgb.r - rgb.r) * t),
            g: Math.round(rgb.g + (targetRgb.g - rgb.g) * t),
            b: Math.round(rgb.b + (targetRgb.b - rgb.b) * t)
        };
    };

    const getColorLuma = (rgb) => {
        if (!rgb) return 1;
        const toLinear = (n) => {
            const value = clampColorValue(n, 0, 255) / 255;
            return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
        };
        const r = toLinear(rgb.r);
        const g = toLinear(rgb.g);
        const b = toLinear(rgb.b);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const normalizeActionId = (id) => normalizeProviderId(id);

    const normalizeActionVisionPromptOrder = (value) => (value === "before" ? "before" : "after");

    let defaultActionSeedMapCache = null;
    const getDefaultActionSeedMap = () => {
        if (defaultActionSeedMapCache) return defaultActionSeedMapCache;
        const map = {};
        DEFAULT_ACTION_TEMPLATE_BASE64_LIST
            .flatMap(parseDefaultActionTemplateBase64Entry)
            .filter((item) => item && typeof item === "object")
            .forEach((item) => {
                const id = normalizeActionId(item.id || "");
                if (!id || map[id]) return;
                map[id] = {
                    systemPrompt: String(item.systemPrompt || item.prompt || "").trim(),
                    color: String(item.color || "").trim()
                };
            });
        defaultActionSeedMapCache = map;
        return map;
    };
    const getDefaultActionPromptById = (actionId) => {
        const id = normalizeActionId(actionId);
        if (!id) return "请根据用户输入完成任务。";
        const map = getDefaultActionSeedMap();
        const prompt = map[id] && map[id].systemPrompt ? String(map[id].systemPrompt).trim() : "";
        return prompt || "请根据用户输入完成任务。";
    };
    const hashStringToActionColor = (seed) => {
        const text = String(seed || "").trim() || "coolauxv-action";
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = text.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        const saturation = 62 + (Math.abs(hash >> 8) % 14); // 62~75
        const lightness = 46 + (Math.abs(hash >> 16) % 12); // 46~57
        return hslToCss({ h: hue, s: saturation, l: lightness });
    };
    const buildActionColorSeed = (actionId, raw) => {
        const id = normalizeActionId(actionId);
        if (!raw || typeof raw !== "object") return id || "coolauxv-action";
        const label = String(raw.label || raw.text || "").trim();
        const prompt = String(raw.systemPrompt || raw.prompt || "").trim();
        const visionOrder = String(raw.visionPromptOrder || raw.visionOrder || "").trim();
        return [id, label, prompt, visionOrder].filter(Boolean).join("|") || (id || "coolauxv-action");
    };
    const normalizeActionWeight = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return 1;
        const clamped = Math.min(12, Math.max(0.2, num));
        return Math.round(clamped * 100) / 100;
    };
    const getDefaultActionColorById = (actionId, raw) => {
        const id = normalizeActionId(actionId);
        const map = getDefaultActionSeedMap();
        const seedColor = id && map[id] ? map[id].color : "";
        if (seedColor) {
            return normalizeColorValue(seedColor, "rgb(249, 250, 251)");
        }
        if (id && id !== "translate" && id !== "explain") {
            return hashStringToActionColor(buildActionColorSeed(id, raw));
        }
        return id === "explain" ? "rgb(109, 40, 217)" : "rgb(249, 250, 251)";
    };

    const resolveActionTemplateRawId = (raw) => {
        if (!raw || typeof raw !== "object") return "";
        const explicitId = normalizeActionId(raw.id || raw.key || raw.actionId || "");
        if (explicitId) return explicitId;
        const legacyName = String(raw.name || "").trim();
        const labelLike = String(raw.label || raw.text || "").trim();
        if (legacyName && !labelLike && /^[a-zA-Z0-9_-]+$/.test(legacyName)) {
            return normalizeActionId(legacyName);
        }
        return "";
    };

    const ensureActionTemplate = (raw) => {
        if (!raw || typeof raw !== "object") return null;
        const id = resolveActionTemplateRawId(raw);
        if (!id) return null;
        const fallbackPrompt = getDefaultActionPromptById(id);
        const prompt = String(raw.systemPrompt || raw.prompt || "").trim() || fallbackPrompt;
        const defaultColor = getDefaultActionColorById(id, raw);
        const color = normalizeColorValue(raw.color || "", defaultColor);
        return {
            id: id,
            label: String(raw.label || raw.text || id).trim() || id,
            systemPrompt: prompt,
            color: color,
            weight: normalizeActionWeight(raw.weight),
            visionPromptOrder: normalizeActionVisionPromptOrder(raw.visionPromptOrder || raw.visionOrder || "")
        };
    };

    const normalizeActionTemplates = (list) => {
        if (!Array.isArray(list)) return [];
        const output = [];
        const seen = new Set();
        list.forEach((item) => {
            const normalized = ensureActionTemplate(item);
            if (!normalized) return;
            if (seen.has(normalized.id)) {
                let idx = 2;
                let nextId = `${normalized.id}-${idx}`;
                while (seen.has(nextId)) {
                    idx += 1;
                    nextId = `${normalized.id}-${idx}`;
                }
                normalized.id = nextId;
            }
            seen.add(normalized.id);
            output.push(normalized);
        });
        return output;
    };

    const serializeActionTemplateList = (list) => normalizeActionTemplates(list)
        .map((tpl) => encodeBase64Utf8(JSON.stringify(tpl)))
        .filter(Boolean);

    const deserializeActionTemplateList = (raw) => {
        let parsed = raw;
        let needsRewrite = false;
        if (parsed === null || parsed === undefined || parsed === "") {
            return { templates: [], needsRewrite: false };
        }
        if (typeof parsed === "string") {
            const text = parsed.trim();
            if (!text) return { templates: [], needsRewrite: false };
            try {
                parsed = JSON.parse(text);
                needsRewrite = true;
            } catch (e) {
                const single = parseActionBase64(text);
                if (!single) return { templates: [], needsRewrite: false };
                return { templates: normalizeActionTemplates([single]), needsRewrite: true };
            }
        }
        let list = [];
        if (Array.isArray(parsed)) {
            const hasNonStringItem = parsed.some((item) => typeof item !== "string");
            if (hasNonStringItem) needsRewrite = true;
            list = parsed
                .map((item) => (typeof item === "string" ? parseActionBase64(item) : item))
                .filter(Boolean);
        } else if (parsed && typeof parsed === "object") {
            needsRewrite = true;
            list = Array.isArray(parsed.actions) ? parsed.actions : [parsed];
        } else {
            return { templates: [], needsRewrite: false };
        }
        return { templates: normalizeActionTemplates(list), needsRewrite: needsRewrite };
    };

    const buildLegacyPromptWithAppend = (customKey, appendKey, defaultPrompt) => {
        const custom = String(GM_getValue(customKey, "") || "").trim();
        const isAppend = !!GM_getValue(appendKey, false);
        if (!custom) return defaultPrompt;
        return isAppend ? `${defaultPrompt}\n${custom}` : custom;
    };

    const getDefaultActionTemplates = () => {
        const defaults = DEFAULT_ACTION_TEMPLATE_BASE64_LIST
            .flatMap(parseDefaultActionTemplateBase64Entry)
            .filter(Boolean);
        const normalized = normalizeActionTemplates(defaults);
        const trans = normalized.find((item) => item.id === "translate");
        const explain = normalized.find((item) => item.id === "explain");
        if (trans) {
            trans.systemPrompt = buildLegacyPromptWithAppend("coolauxv_prompt_trans", "coolauxv_append_trans", getDefaultActionPromptById("translate"));
        }
        if (explain) {
            explain.systemPrompt = buildLegacyPromptWithAppend("coolauxv_prompt_explain", "coolauxv_append_explain", getDefaultActionPromptById("explain"));
        }
        return normalized;
    };

    const loadActionTemplates = () => {
        let stored = null;
        try {
            stored = GM_getValue(ACTION_TEMPLATE_STORAGE_KEY, null);
        } catch (e) {
            stored = null;
        }
        const parsed = deserializeActionTemplateList(stored);
        let templates = parsed.templates;
        if (!templates.length) {
            templates = getDefaultActionTemplates();
            GM_setValue(ACTION_TEMPLATE_STORAGE_KEY, serializeActionTemplateList(templates));
        } else if (parsed.needsRewrite) {
            GM_setValue(ACTION_TEMPLATE_STORAGE_KEY, serializeActionTemplateList(templates));
        }
        templates = normalizeActionTemplates(templates);
        actionTemplatesCache = templates;
        return templates;
    };

    const getActionTemplates = () => actionTemplatesCache || loadActionTemplates();

    const saveActionTemplates = (list) => {
        const normalized = normalizeActionTemplates(list);
        actionTemplatesCache = normalized;
        GM_setValue(ACTION_TEMPLATE_STORAGE_KEY, serializeActionTemplateList(normalized));
        return normalized;
    };

    const resolveActionTemplateId = (actionId, list) => {
        const templates = list || getActionTemplates();
        const normalizedId = normalizeActionId(actionId);
        if (normalizedId && templates.some((item) => item.id === normalizedId)) {
            return normalizedId;
        }
        const fallback = templates.find((item) => item.id === DEFAULT_SELECTION_ICON_ACTION);
        return fallback ? fallback.id : (templates[0] ? templates[0].id : DEFAULT_SELECTION_ICON_ACTION);
    };

    const getActionTemplateById = (actionId) => {
        const templates = getActionTemplates();
        const id = resolveActionTemplateId(actionId, templates);
        return templates.find((item) => item.id === id) || null;
    };

    const normalizeModelItem = (item) => {
        if (!item || typeof item !== "object") return null;
        const id = String(item.id || item.name || "").trim();
        if (!id) return null;
        return {
            id: id,
            class: String(item.class || item.sub || item.category || "").trim(),
            tag: String(item.tag || "").trim()
        };
    };

    const normalizeModelGroup = (group, idx) => {
        if (!group || typeof group !== "object") return null;
        const label = String(group.label || group.name || `模型分类${idx + 1}`);
        const id = normalizeProviderId(group.id || label || `group-${idx + 1}`);
        const type = group.type === "vision" ? "vision" : "text";
        const rawModels = Array.isArray(group.models) ? group.models : (Array.isArray(group.list) ? group.list : []);
        const models = rawModels.map(normalizeModelItem).filter(Boolean);
        let selectedModel = String(group.selectedModel || group.model || "").trim();
        if (!selectedModel && models.length) {
            selectedModel = models[0].id;
        }
        return {
            id: id,
            label: label,
            type: type,
            models: models,
            selectedModel: selectedModel
        };
    };

    const normalizeModelGroups = (tpl) => {
        let groups = Array.isArray(tpl.modelGroups) ? tpl.modelGroups : null;
        if (!groups && tpl.models) {
            groups = [];
            if (tpl.models.text && tpl.models.text.length) {
                groups.push({
                    id: "general",
                    label: "通用模型",
                    type: "text",
                    models: tpl.models.text,
                    selectedModel: tpl.modelName || ""
                });
            }
            if (tpl.models.vision && tpl.models.vision.length) {
                groups.push({
                    id: "vision",
                    label: "视觉模型",
                    type: "vision",
                    models: tpl.models.vision,
                    selectedModel: tpl.visionModel || ""
                });
            }
        }
        if (!groups || !groups.length) {
            groups = [{ id: "general", label: "通用模型", type: "text", models: [], selectedModel: "" }];
        }
        return groups.map((group, idx) => normalizeModelGroup(group, idx)).filter(Boolean);
    };

    const normalizeTemplateKey = (key) => String(key || "").trim().replace(/[^a-zA-Z0-9_.-]/g, "");

    const normalizeCustomFields = (input) => {
        const result = {};
        if (!input) return result;
        if (Array.isArray(input)) {
            input.forEach((item) => {
                if (!item || typeof item !== "object") return;
                const rawKey = item.key || item.name || "";
                const key = normalizeTemplateKey(rawKey);
                if (!key) return;
                const value = item.value !== undefined ? item.value : (item.val !== undefined ? item.val : "");
                result[key] = String(value);
            });
            return result;
        }
        if (typeof input === "object") {
            Object.keys(input).forEach((rawKey) => {
                const key = normalizeTemplateKey(rawKey);
                if (!key) return;
                result[key] = String(input[rawKey]);
            });
        }
        return result;
    };

    const normalizeCustomFieldMeta = (input, customFields, display) => {
        const result = {};
        const defaults = {
            display: !(display && display.customFields === false),
            masked: !!(display && display.customFieldsMask)
        };
        const ensureMeta = (rawKey, meta) => {
            const key = normalizeTemplateKey(rawKey);
            if (!key) return;
            const displayVal = meta && meta.display !== undefined ? !!meta.display : defaults.display;
            const maskedVal = meta && meta.masked !== undefined ? !!meta.masked : defaults.masked;
            result[key] = { display: displayVal, masked: maskedVal };
        };
        if (Array.isArray(input)) {
            input.forEach((item) => {
                if (!item || typeof item !== "object") return;
                const rawKey = item.key || item.name || "";
                ensureMeta(rawKey, {
                    display: item.display !== undefined ? item.display : (item.show !== undefined ? item.show : item.visible),
                    masked: item.masked !== undefined ? item.masked : (item.mask !== undefined ? item.mask : item.secret)
                });
            });
        } else if (input && typeof input === "object") {
            Object.keys(input).forEach((rawKey) => {
                const meta = input[rawKey];
                if (meta && typeof meta === "object") {
                    ensureMeta(rawKey, meta);
                } else {
                    ensureMeta(rawKey, null);
                }
            });
        }
        if (customFields && typeof customFields === "object") {
            Object.keys(customFields).forEach((rawKey) => {
                if (!Object.prototype.hasOwnProperty.call(result, rawKey)) {
                    ensureMeta(rawKey, null);
                }
            });
        }
        const finalKeys = new Set(customFields ? Object.keys(customFields) : []);
        Object.keys(result).forEach((key) => {
            if (!finalKeys.has(key)) delete result[key];
        });
        return result;
    };

    const getCustomFieldMetaMap = (template) => {
        const custom = template && template.customFields ? template.customFields : {};
        const display = template && template.display ? template.display : {};
        const input = template ? template.customFieldMeta : null;
        return normalizeCustomFieldMeta(input, custom, display);
    };

    const ensureProviderTemplate = (tpl) => {
        if (!tpl || typeof tpl !== "object") return null;
        const isEmptyPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length;
        let headersTemplate = tpl.headersTemplate;
        if (typeof headersTemplate === "string") {
            try { headersTemplate = JSON.parse(headersTemplate); } catch (e) { headersTemplate = null; }
        }
        let bodyTemplate = tpl.bodyTemplate;
        if (typeof bodyTemplate === "string") {
            try { bodyTemplate = JSON.parse(bodyTemplate); } catch (e) { bodyTemplate = null; }
        }
        if (isEmptyPlainObject(headersTemplate)) headersTemplate = null;
        if (isEmptyPlainObject(bodyTemplate)) bodyTemplate = null;

        const modelGroups = normalizeModelGroups(tpl);
        const customFields = normalizeCustomFields(tpl.customFields);
        const display = Object.assign({}, DEFAULT_DISPLAY_FIELDS, tpl.display || {});
        const customFieldMeta = normalizeCustomFieldMeta(tpl.customFieldMeta || tpl.customFields, customFields, display);
        if (tpl.repo && !Object.prototype.hasOwnProperty.call(customFields, "repo")) {
            customFields.repo = String(tpl.repo || "");
        }
        const normalizedType = normalizeProviderType(tpl.type);
        const hasSupportsVision = tpl.supportsVision !== undefined && tpl.supportsVision !== null && tpl.supportsVision !== "";
        const supportsVision = hasSupportsVision
            ? !!tpl.supportsVision
            : modelGroups.some((group) => group.type === "vision");
        const hasSupportsContinuousChat = tpl.supportsContinuousChat !== undefined && tpl.supportsContinuousChat !== null && tpl.supportsContinuousChat !== "";
        const supportsContinuousChat = hasSupportsContinuousChat
            ? !!tpl.supportsContinuousChat
            : true;
        const defaultStream = getDefaultStreamTemplateByType(normalizedType);

        const normalized = {
            id: normalizeProviderId(tpl.id),
            label: String(tpl.label || tpl.id || "Provider"),
            type: normalizedType,
            baseUrl: String(tpl.baseUrl || ""),
            apiKey: String(tpl.apiKey || ""),
            apiKeyPlaceholder: String(tpl.apiKeyPlaceholder || ""),
            keyLink: String(tpl.keyLink || ""),
            keyLinkTitle: String(tpl.keyLinkTitle || DEFAULT_KEY_LINK_TITLE),
            roles: {
                system: (tpl.roles && tpl.roles.system) ? String(tpl.roles.system) : "system",
                user: (tpl.roles && tpl.roles.user) ? String(tpl.roles.user) : "user",
                assistant: (tpl.roles && tpl.roles.assistant) ? String(tpl.roles.assistant) : "assistant"
            },
            headersTemplate: headersTemplate && typeof headersTemplate === "object" ? headersTemplate : { "Content-Type": "application/json" },
            bodyTemplate: bodyTemplate && typeof bodyTemplate === "object" ? bodyTemplate : getDefaultBodyTemplateByType(normalizedType),
            stream: tpl.stream && typeof tpl.stream === "object" ? {
                parser: (() => {
                    if (tpl.stream.parser === "openai-responses") return "openai-responses";
                    if (tpl.stream.parser === "chat-parts") return "chat-parts";
                    if (tpl.stream.parser === "ollama") return "ollama";
                    if (tpl.stream.parser === "chat-completions") return "chat-completions";
                    return normalizedType === "chat-no-history" ? "chat-completions" : normalizedType;
                })(),
                deltaPath: tpl.stream.deltaPath !== undefined ? String(tpl.stream.deltaPath) : defaultStream.deltaPath,
                reasoningPath: tpl.stream.reasoningPath !== undefined ? String(tpl.stream.reasoningPath) : defaultStream.reasoningPath,
                sessionIdPath: tpl.stream.sessionIdPath !== undefined ? String(tpl.stream.sessionIdPath) : defaultStream.sessionIdPath,
                sessionIdKey: tpl.stream.sessionIdKey !== undefined
                    ? (normalizeTemplateKey(tpl.stream.sessionIdKey) || defaultStream.sessionIdKey)
                    : defaultStream.sessionIdKey,
                reasoningTag: tpl.stream.reasoningTag !== undefined ? String(tpl.stream.reasoningTag).trim().toLowerCase() : defaultStream.reasoningTag
            } : defaultStream,
            supportsVision: supportsVision,
            supportsContinuousChat: supportsContinuousChat,
            modelGroups: modelGroups,
            display: display,
            customFields: customFields,
            customFieldMeta: customFieldMeta
        };
        if (!normalized.id) return null;
        return normalized;
    };

    const normalizeProviderTemplates = (list) => {
        if (!Array.isArray(list)) return [];
        const result = [];
        const seen = new Set();
        list.forEach((item) => {
            const normalized = ensureProviderTemplate(item);
            if (!normalized) return;
            if (seen.has(normalized.id)) {
                let idx = 2;
                let newId = `${normalized.id}-${idx}`;
                while (seen.has(newId)) {
                    idx += 1;
                    newId = `${normalized.id}-${idx}`;
                }
                normalized.id = newId;
            }
            seen.add(normalized.id);
            result.push(normalized);
        });
        return result;
    };

    const getDefaultProviderTemplates = () => {
        const templates = DEFAULT_PROVIDER_BASE64_LIST
            .flatMap(parseDefaultProviderTemplateBase64Entry)
            .filter(Boolean);
        return normalizeProviderTemplates(templates);
    };

    const loadProviderTemplates = () => {
        let stored = null;
        try {
            stored = GM_getValue(PROVIDER_TEMPLATE_STORAGE_KEY, null);
        } catch (e) {
            stored = null;
        }
        let templates = null;
        if (stored) {
            try {
                templates = typeof stored === "string" ? JSON.parse(stored) : stored;
            } catch (e) {
                templates = null;
            }
        }
        if (!Array.isArray(templates) || !templates.length) {
            templates = getDefaultProviderTemplates();
            GM_setValue(PROVIDER_TEMPLATE_STORAGE_KEY, templates);
        }
        templates = normalizeProviderTemplates(templates);
        templates = sanitizeMaskedCustomFields(templates);
        providerTemplatesCache = templates;
        return templates;
    };

    const getProviderTemplates = () => providerTemplatesCache || loadProviderTemplates();

    const saveProviderTemplates = (list) => {
        const normalized = normalizeProviderTemplates(list);
        providerTemplatesCache = normalized;
        GM_setValue(PROVIDER_TEMPLATE_STORAGE_KEY, normalized);
        return normalized;
    };

    const getProviderTemplateById = (id) => {
        const providerId = normalizeProviderId(id);
        const templates = getProviderTemplates();
        return templates.find((tpl) => tpl.id === providerId) || null;
    };

    const resolveProviderId = (id, templates) => {
        const providerId = normalizeProviderId(id);
        const list = templates || getProviderTemplates();
        if (providerId && list.some((tpl) => tpl.id === providerId)) return providerId;
        const fallback = list.find((tpl) => tpl.id === DEFAULT_PROVIDER);
        return fallback ? fallback.id : (list[0] ? list[0].id : DEFAULT_PROVIDER);
    };

    const migrateLegacyProviderSettings = (templates) => {
        const list = templates || getProviderTemplates();
        if (GM_getValue(LEGACY_PROVIDER_MIGRATION_FLAG, false)) {
            return list;
        }
        let changed = false;
        list.forEach((tpl) => {
            if (tpl.id === "zhipu") {
                const legacyKey = GM_getValue("coolauxv_zhipu_api_key", "") || GM_getValue("coolauxv_api_key", "");
                if (legacyKey && (!tpl.apiKey || tpl.apiKey === tpl.apiKeyPlaceholder)) {
                    tpl.apiKey = legacyKey;
                    changed = true;
                }
                const legacyModel = GM_getValue("coolauxv_zhipu_model_name", "") || GM_getValue("coolauxv_model_name", "");
                if (legacyModel) {
                    const textGroup = tpl.modelGroups.find((group) => group.type !== "vision") || tpl.modelGroups[0];
                    if (textGroup && textGroup.selectedModel !== legacyModel) {
                        textGroup.selectedModel = legacyModel;
                        changed = true;
                    }
                }
                const legacyVision = GM_getValue("coolauxv_zhipu_model_vision", "") || GM_getValue("coolauxv_model_vision", "");
                if (legacyVision) {
                    const visionGroup = tpl.modelGroups.find((group) => group.type === "vision");
                    if (visionGroup && visionGroup.selectedModel !== legacyVision) {
                        visionGroup.selectedModel = legacyVision;
                        changed = true;
                    }
                }
            }
            if (tpl.id === "openai") {
                const legacyKey = GM_getValue("coolauxv_openai_api_key", "");
                if (legacyKey && (!tpl.apiKey || tpl.apiKey === tpl.apiKeyPlaceholder)) {
                    tpl.apiKey = legacyKey;
                    changed = true;
                }
                const legacyModel = GM_getValue("coolauxv_openai_model_name", "");
                if (legacyModel) {
                    const textGroup = tpl.modelGroups.find((group) => group.type !== "vision") || tpl.modelGroups[0];
                    if (textGroup && textGroup.selectedModel !== legacyModel) {
                        textGroup.selectedModel = legacyModel;
                        changed = true;
                    }
                }
            }
            if (tpl.id === "cnb") {
                const legacyKey = GM_getValue("coolauxv_cnb_api_key", "");
                if (legacyKey && (!tpl.apiKey || tpl.apiKey === tpl.apiKeyPlaceholder)) {
                    tpl.apiKey = legacyKey;
                    changed = true;
                }
                const legacyModel = GM_getValue("coolauxv_cnb_model_name", "");
                if (legacyModel) {
                    const textGroup = tpl.modelGroups.find((group) => group.type !== "vision") || tpl.modelGroups[0];
                    if (textGroup && textGroup.selectedModel !== legacyModel) {
                        textGroup.selectedModel = legacyModel;
                        changed = true;
                    }
                }
                const legacyRepo = GM_getValue("coolauxv_cnb_repo", "");
                if (legacyRepo) {
                    tpl.customFields = normalizeCustomFields(tpl.customFields);
                    if (!Object.prototype.hasOwnProperty.call(tpl.customFields, "repo")) {
                        tpl.customFields.repo = legacyRepo;
                        changed = true;
                    }
                }
            }
        });
        if (changed) {
            saveProviderTemplates(list);
        }
        GM_setValue(LEGACY_PROVIDER_MIGRATION_FLAG, true);
        return list;
    };

    const normalizeSecretStore = (input) => {
        if (!input) return {};
        if (typeof input === "string") {
            try {
                const parsed = JSON.parse(input);
                if (parsed && typeof parsed === "object") return parsed;
            } catch (e) {
                return {};
            }
        }
        return (input && typeof input === "object") ? input : {};
    };

    const loadProviderSecretStore = () => {
        try {
            return normalizeSecretStore(GM_getValue(PROVIDER_SECRET_STORAGE_KEY, null));
        } catch (e) {
            return {};
        }
    };

    const saveProviderSecretStore = (store) => {
        const normalized = normalizeSecretStore(store);
        GM_setValue(PROVIDER_SECRET_STORAGE_KEY, normalized);
        return normalized;
    };

    const getProviderSecretFields = (providerId) => {
        const store = loadProviderSecretStore();
        const entry = store && providerId ? store[providerId] : null;
        return entry && typeof entry === "object" ? Object.assign({}, entry) : {};
    };

    const setProviderSecretFields = (providerId, fields) => {
        if (!providerId) return;
        const store = loadProviderSecretStore();
        if (fields && typeof fields === "object" && Object.keys(fields).length) {
            store[providerId] = Object.assign({}, fields);
        } else if (Object.prototype.hasOwnProperty.call(store, providerId)) {
            delete store[providerId];
        }
        saveProviderSecretStore(store);
    };

    const updateProviderSecretField = (providerId, fieldKey, value) => {
        if (!providerId || !fieldKey) return;
        const store = loadProviderSecretStore();
        const entry = store[providerId] && typeof store[providerId] === "object" ? store[providerId] : {};
        const nextValue = value === undefined || value === null ? "" : String(value);
        if (!nextValue) {
            delete entry[fieldKey];
        } else {
            entry[fieldKey] = nextValue;
        }
        if (Object.keys(entry).length) {
            store[providerId] = entry;
        } else if (Object.prototype.hasOwnProperty.call(store, providerId)) {
            delete store[providerId];
        }
        saveProviderSecretStore(store);
    };

    const clearProviderSecretFields = (providerId) => {
        if (!providerId) return;
        const store = loadProviderSecretStore();
        if (Object.prototype.hasOwnProperty.call(store, providerId)) {
            delete store[providerId];
            saveProviderSecretStore(store);
        }
    };

    const getTemplateCustomFields = (template) => {
        const custom = template && template.customFields ? template.customFields : {};
        const meta = getCustomFieldMetaMap(template);
        const secrets = template && template.id ? getProviderSecretFields(template.id) : {};
        const merged = Object.assign({}, custom);
        Object.keys(meta).forEach((key) => {
            if (meta[key] && meta[key].masked) {
                if (Object.prototype.hasOwnProperty.call(secrets, key)) {
                    merged[key] = secrets[key];
                }
            }
        });
        return merged;
    };

    const sanitizeMaskedCustomFields = (templates) => {
        if (!Array.isArray(templates)) return [];
        const store = loadProviderSecretStore();
        let templatesChanged = false;
        let secretsChanged = false;

        templates.forEach((tpl) => {
            if (!tpl || !tpl.id) return;
            tpl.customFields = normalizeCustomFields(tpl.customFields);
            tpl.customFieldMeta = normalizeCustomFieldMeta(tpl.customFieldMeta || tpl.customFields, tpl.customFields, tpl.display || {});
            const meta = tpl.customFieldMeta || {};
            const fieldKeys = Object.keys(tpl.customFields);
            const entry = store[tpl.id] && typeof store[tpl.id] === "object" ? Object.assign({}, store[tpl.id]) : {};
            let entryChanged = false;
            let templateTouched = false;
            fieldKeys.forEach((key) => {
                const metaItem = meta[key] || { display: true, masked: false };
                if (metaItem.masked) {
                    const value = tpl.customFields[key];
                    if (value !== undefined && value !== null && String(value)) {
                        if (!Object.prototype.hasOwnProperty.call(entry, key)) {
                            entry[key] = String(value);
                            entryChanged = true;
                        }
                    }
                    if (tpl.customFields[key] !== "") {
                        tpl.customFields[key] = "";
                        templateTouched = true;
                    }
                } else if (Object.prototype.hasOwnProperty.call(entry, key)) {
                    delete entry[key];
                    entryChanged = true;
                }
            });
            Object.keys(entry).forEach((key) => {
                if (!Object.prototype.hasOwnProperty.call(tpl.customFields, key)) {
                    delete entry[key];
                    entryChanged = true;
                }
            });
            if (templateTouched) templatesChanged = true;
            if (entryChanged) {
                if (Object.keys(entry).length) {
                    store[tpl.id] = entry;
                } else if (Object.prototype.hasOwnProperty.call(store, tpl.id)) {
                    delete store[tpl.id];
                }
                secretsChanged = true;
            }
        });

        const validIds = new Set(templates.map((tpl) => (tpl && tpl.id ? tpl.id : null)).filter(Boolean));
        Object.keys(store).forEach((id) => {
            if (!validIds.has(id)) {
                delete store[id];
                secretsChanged = true;
            }
        });

        if (secretsChanged) {
            saveProviderSecretStore(store);
        }
        if (templatesChanged) {
            return saveProviderTemplates(templates);
        }
        return templates;
    };

    const stringToColorStyles = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }

        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

        const palette = [
            { h: 210, s: 60, bgL: 88 },
            { h: 30, s: 78, bgL: 90 },
            { h: 170, s: 55, bgL: 86 },
            { h: 50, s: 82, bgL: 91 },
            { h: 275, s: 55, bgL: 88 },
            { h: 330, s: 60, bgL: 89 },
            { h: 0, s: 68, bgL: 90 },
            { h: 195, s: 70, bgL: 88 },
            { h: 240, s: 55, bgL: 87 },
            { h: 15, s: 70, bgL: 89 },
            { h: 300, s: 58, bgL: 88 },
            { h: 100, s: 50, bgL: 85 }
        ];

        const idx = Math.abs(hash) % palette.length;
        const base = palette[idx];
        const variant = Math.abs(hash >> 6) % 3;
        const delta = (variant - 1) * 3;

        const bgL = clamp(base.bgL + delta, 82, 92);
        const borderL = clamp(bgL - 14, 64, 78);
        const textS = clamp(base.s + 10, 50, 85);

        return {
            bg: `hsl(${base.h}, ${base.s}%, ${bgL}%)`,
            border: `hsl(${base.h}, ${base.s}%, ${borderL}%)`,
            text: `hsl(${base.h}, ${textS}%, 18%)`,
            tag: `hsl(${base.h}, ${textS}%, 32%)`
        };
    };

    const buildModelButtonsHTML = (group, providerId) => {
        if (!group || !Array.isArray(group.models)) return "";
        const buckets = {};
        group.models.forEach((m) => {
            const groupName = m.class || "模型";
            if (!buckets[groupName]) buckets[groupName] = [];
            buckets[groupName].push(m);
        });

        return Object.keys(buckets).map((className) => `
            <div class="coolauxv-sub-label" style="font-size: 12px; color: #999; margin: 8px 0 4px 0;">${className}</div>
            <div class="coolauxv-tag-container">
                ${buckets[className].map((m) => {
                    const modelId = m.id || m.name || "";
                    const c = stringToColorStyles(m.tag || modelId || "");
                    return `
                        <div class="coolauxv-model-btn" data-provider-id="${providerId}" data-group-id="${group.id}" data-val="${modelId}" data-tag="${m.tag || ""}"
                             style="background:${c.bg}; border: 1px solid ${c.border}; color:${c.text};">
                            <span class="coolauxv-model-name">${modelId}</span>
                            <span class="coolauxv-model-tag" style="color:${c.tag}">${m.tag || ""}</span>
                        </div>
                    `;
                }).join("")}
            </div>
        `).join("");
    };

    // ========================================================================
    // 日志工具
    // ========================================================================

    const LEVELS = { 'debug': 0, 'info': 1, 'warn': 2, 'error': 3, 'none': 4 };

    const Logger = {
        _getLevel: () => {
            const val = GM_getValue("coolauxv_log_level", "");
            return val ? val : DEFAULT_LOG_LEVEL;
        },
        shouldLog: (targetLevel) => {
            const currentLevelStr = Logger._getLevel();
            const currentVal = LEVELS[currentLevelStr] !== undefined ? LEVELS[currentLevelStr] : 0;
            const targetVal = LEVELS[targetLevel];
            return targetVal >= currentVal;
        },

        // 统一使用默认 Tag（[CoolAuxv]）
        _print: (level, tag, args) => {
            if (Logger.shouldLog(level)) {
                // 如果没有传入 tag，则使用默认的
                const prefix = tag ? `[${tag}]` : `[CoolAuxv]`;
                const fn = level === "debug" ? console.log : (console[level] || console.log);
                // 将 Tag 作为前缀添加到参数列表中
                fn(prefix, ...args);
            }
        },

        // 保持原有 API 兼容性：不传 Tag，内部默认使用[CoolAuxv]
        // 这样现有的 Logger.info("msg") 调用完全不受影响
        debug: (...args) => Logger._print('debug', null, args),
        info: (...args) => Logger._print('info', null, args),
        warn: (...args) => Logger._print('warn', null, args),
        error: (...args) => Logger._print('error', null, args)
    };

    // ========================================================================
    // 特殊逻辑：PDF.js Viewer 注入 (接收端 - 极速版)
    // ========================================================================
    function initPdfReceiver() {
        if (!location.href.includes("mozilla.github.io/pdf.js/web/viewer.html")) {
            return;
        }
        const isBlur = GM_getValue("coolauxv_enable_blur_glass", false);
        const appWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

        // 1. 创建进度悬浮窗
        const loader = document.createElement("div");
        loader.id = "coolauxv-pdf-loader";
        Object.assign(loader.style, {
            position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)",
            padding: "12px 24px", borderRadius: "12px", zIndex: "9999",
            display: "none", // 默认显示
            flexDirection: "column", alignItems: "center", gap: "8px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)", transition: "all 0.3s ease",
            background: isBlur ? "rgba(255, 255, 255, 0.65)" : "rgba(255, 255, 255, 0.95)",
            backdropFilter: isBlur ? "blur(12px)" : "none",
            border: "1px solid rgba(255,255,255,0.5)",
            color: "#333", fontSize: "14px", fontWeight: "600"
        });

        loader.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="coolauxv-spinner">⚡</span>
                <span>正在打开文件...</span>
            </div>
            <style>@keyframes spin { 100% { transform: rotate(360deg); } } .coolauxv-spinner { display:inline-block; animation: spin 1s linear infinite; }</style>
        `;
        document.body.appendChild(loader);

        // 2. 主动握手逻辑
        // 只要页面加载了，就疯狂告诉 opener 我准备好了 (每100ms发一次，直到收到数据为止，防止丢包)
        const readyInterval = setInterval(() => {
            if (window.opener) {
                window.opener.postMessage({ type: "PDF_I_AM_READY" }, "*");
            }
        }, 100);

        window.addEventListener("message", async (event) => {
            // 收到数据
            if (event.data && event.data.type === "OPEN_PDF_BLOB") {
                clearInterval(readyInterval); // 停止呼叫
                loader.style.display = "flex";

                const buildPageData = (buffer) => {
                    try {
                        return new appWindow.Uint8Array(buffer);
                    } catch (err) {
                        const sandboxData = new Uint8Array(buffer);
                        const pageData = new appWindow.Uint8Array(sandboxData.length);
                        pageData.set(sandboxData);
                        return pageData;
                    }
                };

                try {
                    // 等待 App 初始化
                    const waitForApp = () => new Promise(resolve => {
                        const check = () => {
                            if (appWindow.PDFViewerApplication && appWindow.PDFViewerApplication.open) resolve(appWindow.PDFViewerApplication);
                            else setTimeout(check, 50); // 缩短检查间隔
                        };
                        check();
                    });
                    const pdfApp = await waitForApp();

                    // 优先零拷贝视图，失败再回退深拷贝
                    const pageData = buildPageData(event.data.buffer);
                    await pdfApp.open(pageData);

                    // 成功回执
                    if (event.source) event.source.postMessage({ type: "PDF_OPENED_ACK" }, "*");

                    // 隐藏 Loader
                    loader.innerHTML = "✅ 加载完成";
                    setTimeout(() => { loader.style.opacity = "0"; setTimeout(() => loader.style.display = "none", 300); }, 800);

                } catch (e) {
                    Logger.error(e);
                    // 兼容模式兜底
                    try {
                        const pageData = buildPageData(event.data.buffer);
                        await appWindow.PDFViewerApplication.open({ data: pageData });
                        if (event.source) event.source.postMessage({ type: "PDF_OPENED_ACK" }, "*");
                        loader.style.display = "none";
                    } catch (e2) {
                        alert("错误: " + e.message);
                    }
                }
            }
        });
        // return;
    }

    const PDFJS_CUSTOM_SCALE_CONTAINER_ID = "coolauxv-pdfjs-custom-scale-container";
    const PDFJS_CUSTOM_SCALE_INPUT_ID = "coolauxv-pdfjs-custom-scale-input";
    const PDFJS_CUSTOM_SCALE_MIN = 0.1;
    const PDFJS_CUSTOM_SCALE_MAX = 10;
    const PDFJS_CUSTOM_SCALE_INIT_FLAG = "__coolauxv_pdfjs_custom_scale_init";
    const PDFJS_CUSTOM_SCALE_BOUND_ATTR = "data-coolauxv-pdfjs-custom-scale-bound";
    const PDFJS_CUSTOM_SCALE_EVENTBUS_BOUND_ATTR = "data-coolauxv-pdfjs-eventbus-bound";

    const getPdfjsViewerApplication = () => {
        const app = (globalThis && globalThis.PDFViewerApplication)
            || (typeof unsafeWindow !== "undefined" && unsafeWindow && unsafeWindow.PDFViewerApplication)
            || null;
        return app && typeof app === "object" ? app : null;
    };

    const clampPdfjsScale = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return NaN;
        return Math.min(PDFJS_CUSTOM_SCALE_MAX, Math.max(PDFJS_CUSTOM_SCALE_MIN, numeric));
    };

    const parsePdfjsScaleFromInput = (raw) => {
        const cleaned = String(raw || "")
            .replace(/[%\s]/g, "")
            .replace(/,/g, ".")
            .trim();
        const percent = Number.parseFloat(cleaned);
        if (!Number.isFinite(percent)) return NaN;
        return clampPdfjsScale(percent / 100);
    };

    const parsePdfjsScaleFromSelect = (scaleSelect) => {
        if (!scaleSelect) return NaN;
        const numeric = Number.parseFloat(String(scaleSelect.value || "").trim());
        if (Number.isFinite(numeric) && numeric > 0) {
            return clampPdfjsScale(numeric);
        }
        const customScaleOption = scaleSelect.querySelector("#customScaleOption") || document.getElementById("customScaleOption");
        if (!customScaleOption) return NaN;
        const text = String(customScaleOption.textContent || "");
        const matched = text.match(/([0-9]+(?:[.,][0-9]+)?)/);
        if (!matched) return NaN;
        const percent = Number.parseFloat(matched[1].replace(",", "."));
        if (!Number.isFinite(percent)) return NaN;
        return clampPdfjsScale(percent / 100);
    };

    const readCurrentPdfjsScale = (scaleSelect) => {
        const app = getPdfjsViewerApplication();
        if (app && app.pdfViewer) {
            const currentScale = Number(app.pdfViewer.currentScale);
            if (Number.isFinite(currentScale) && currentScale > 0) {
                return clampPdfjsScale(currentScale);
            }
        }
        const fallbackScale = parsePdfjsScaleFromSelect(scaleSelect);
        if (Number.isFinite(fallbackScale) && fallbackScale > 0) {
            return fallbackScale;
        }
        return 1;
    };

    const formatPdfjsScalePercent = (scale) => {
        const percent = Math.round(Number(scale) * 1000) / 10;
        if (!Number.isFinite(percent)) return "100";
        return Number.isInteger(percent) ? String(percent.toFixed(0)) : String(percent);
    };

    const applyPdfjsScale = (scale, scaleSelect) => {
        const nextScale = clampPdfjsScale(scale);
        if (!Number.isFinite(nextScale)) return false;

        const app = getPdfjsViewerApplication();
        if (app && app.pdfViewer) {
            try {
                app.pdfViewer.currentScaleValue = String(nextScale);
                return true;
            } catch (err) {
                Logger.debug("[PDF.js] 设置 currentScaleValue 失败:", err && (err.message || String(err)));
            }
        }
        if (!scaleSelect) return false;
        try {
            scaleSelect.value = String(nextScale);
            scaleSelect.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
        } catch (err) {
            Logger.debug("[PDF.js] 触发 scaleSelect change 失败:", err && (err.message || String(err)));
            return false;
        }
    };

    const stylePdfjsCustomScaleInput = (container, input, suffix) => {
        Object.assign(container.style, {
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            marginInlineStart: "8px",
            padding: "0 6px",
            minHeight: "30px",
            border: "1px solid rgba(120, 120, 120, 0.35)",
            borderRadius: "6px",
            background: "rgba(255, 255, 255, 0.88)",
            boxSizing: "border-box"
        });
        Object.assign(input.style, {
            width: "58px",
            height: "24px",
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: "12px",
            lineHeight: "1.2",
            textAlign: "right",
            padding: "0",
            margin: "0",
            boxSizing: "border-box"
        });
        Object.assign(suffix.style, {
            fontSize: "12px",
            lineHeight: "1",
            opacity: "0.75",
            userSelect: "none"
        });
    };

    const installPdfjsCustomScaleControl = () => {
        const scaleSelect = document.getElementById("scaleSelect");
        const scaleSelectContainer = document.getElementById("scaleSelectContainer");
        if (!scaleSelect || !scaleSelectContainer) return false;

        const existing = document.getElementById(PDFJS_CUSTOM_SCALE_CONTAINER_ID);
        if (existing && existing.isConnected && scaleSelect.getAttribute(PDFJS_CUSTOM_SCALE_BOUND_ATTR) === "1") {
            return true;
        }
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }

        const container = document.createElement("span");
        container.id = PDFJS_CUSTOM_SCALE_CONTAINER_ID;
        const input = document.createElement("input");
        input.id = PDFJS_CUSTOM_SCALE_INPUT_ID;
        input.type = "text";
        input.inputMode = "decimal";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.setAttribute("aria-label", "Custom zoom percentage");
        input.placeholder = "100";
        const suffix = document.createElement("span");
        suffix.textContent = "%";
        stylePdfjsCustomScaleInput(container, input, suffix);
        container.appendChild(input);
        container.appendChild(suffix);

        let syncing = false;
        const syncFromViewer = () => {
            if (syncing) return;
            const scale = readCurrentPdfjsScale(scaleSelect);
            if (!Number.isFinite(scale) || scale <= 0) return;
            input.value = formatPdfjsScalePercent(scale);
        };

        const commitInputScale = () => {
            const parsed = parsePdfjsScaleFromInput(input.value);
            if (!Number.isFinite(parsed)) {
                syncFromViewer();
                return;
            }
            syncing = true;
            const applied = applyPdfjsScale(parsed, scaleSelect);
            syncing = false;
            if (!applied) {
                syncFromViewer();
                return;
            }
            setTimeout(syncFromViewer, 40);
        };

        input.addEventListener("focus", () => {
            input.select();
        });
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                commitInputScale();
                input.blur();
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                syncFromViewer();
                input.blur();
            }
        });
        input.addEventListener("blur", () => {
            commitInputScale();
        });

        scaleSelect.addEventListener("change", () => {
            if (document.activeElement === input) return;
            syncFromViewer();
        });

        const bindEventBusListener = () => {
            if (scaleSelect.getAttribute(PDFJS_CUSTOM_SCALE_EVENTBUS_BOUND_ATTR) === "1") return true;
            const app = getPdfjsViewerApplication();
            if (!(app && app.eventBus && typeof app.eventBus.on === "function")) return false;
            app.eventBus.on("scalechanging", () => {
                if (document.activeElement === input) return;
                syncFromViewer();
            });
            scaleSelect.setAttribute(PDFJS_CUSTOM_SCALE_EVENTBUS_BOUND_ATTR, "1");
            Logger.debug("[PDF.js] 已绑定 eventBus.scalechanging 同步");
            return true;
        };

        if (!bindEventBusListener()) {
            let bindTryCount = 0;
            const bindTimer = setInterval(() => {
                bindTryCount += 1;
                if (bindEventBusListener() || bindTryCount >= 40) {
                    clearInterval(bindTimer);
                }
            }, 250);
        }

        const scaleMutationObserver = new MutationObserver(() => {
            if (document.activeElement === input) return;
            syncFromViewer();
        });
        scaleMutationObserver.observe(scaleSelect, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["value", "aria-valuetext", "data-l10n-args"]
        });
        container.__coolauxvScaleMutationObserver = scaleMutationObserver;

        scaleSelectContainer.insertAdjacentElement("afterend", container);
        scaleSelect.setAttribute(PDFJS_CUSTOM_SCALE_BOUND_ATTR, "1");
        syncFromViewer();
        Logger.debug("[PDF.js] 已注入自定义缩放输入框");
        return true;
    };

    const initPdfjsCustomScaleEnhancer = () => {
        if (globalThis[PDFJS_CUSTOM_SCALE_INIT_FLAG]) return;
        globalThis[PDFJS_CUSTOM_SCALE_INIT_FLAG] = true;

        let retryTimer = null;
        let retryCount = 0;
        let observer = null;
        let unloaded = false;

        const hasPdfjsSignals = () => {
            return !!(
                document.getElementById("scaleSelect")
                || document.getElementById("scaleSelectContainer")
                || document.getElementById("viewerContainer")
                || document.getElementById("zoomIn")
                || document.getElementById(PDFJS_CUSTOM_SCALE_CONTAINER_ID)
            );
        };

        const ensureInstalled = () => {
            if (unloaded) return false;
            if (!hasPdfjsSignals()) return false;
            return installPdfjsCustomScaleControl();
        };

        const startObserverIfNeeded = () => {
            if (observer || !document.documentElement) return;
            observer = new MutationObserver(() => {
                if (unloaded) return;
                const input = document.getElementById(PDFJS_CUSTOM_SCALE_INPUT_ID);
                const scaleSelect = document.getElementById("scaleSelect");
                if (input && scaleSelect && scaleSelect.getAttribute(PDFJS_CUSTOM_SCALE_BOUND_ATTR) === "1" && document.contains(input)) return;
                ensureInstalled();
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
        };

        if (ensureInstalled()) {
            startObserverIfNeeded();
        } else {
            retryTimer = setInterval(() => {
                retryCount += 1;
                if (ensureInstalled()) {
                    if (retryTimer) {
                        clearInterval(retryTimer);
                        retryTimer = null;
                    }
                    startObserverIfNeeded();
                    return;
                }
                if (retryCount >= 60 && retryTimer) {
                    clearInterval(retryTimer);
                    retryTimer = null;
                }
            }, 500);
        }

        window.addEventListener("beforeunload", () => {
            unloaded = true;
            if (retryTimer) {
                clearInterval(retryTimer);
                retryTimer = null;
            }
            if (observer) {
                observer.disconnect();
                observer = null;
            }
        }, { once: true });
    };



    // --- 1. 样式注入 ---
    const ensureStyles = () => {
        const styles = `
    /* ============================
       样式隔离与重置核心
       ============================ */
    #coolauxv-translate-popup {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #333;
      z-index: 2147483646 !important;
      max-width: none !important;
      max-height: none !important;
      min-width: 180px;
      min-height: 120px;
      display: flex; flex-direction: column;
      /* 强制重置宿主网页可能存在的全局属性 */
      text-align: left !important;
      line-height: 1.5 !important;
      font-size: 14px;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #coolauxv-translate-popup * { box-sizing: border-box; outline: none; }
    #coolauxv-translate-popup input,
    #coolauxv-translate-popup textarea,
    #coolauxv-translate-popup .coolauxv-scroll-box,
    #coolauxv-translate-popup .coolauxv-markdown,
    #coolauxv-translate-popup .coolauxv-raw-text {
      user-select: text;
      -webkit-user-select: text;
    }

    #coolauxv-modal-overlay,
    #coolauxv-changelog-overlay,
    #coolauxv-loading-toast,
    #coolauxv-screenshot-toolbar {
      user-select: none;
      -webkit-user-select: none;
    }

    /* 图标与窗口 */
    #coolauxv-translate-icon {
      position: absolute;
      z-index: 2147483647 !important;
      width: 44px; height: 44px;
      background-color: #3b82f6; color: white; border-radius: 50%;
      display: flex; justify-content: center; align-items: center;
      cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      font-size: 17px; font-weight: bold; font-family: sans-serif;
      user-select: none; border: 3px solid white;
      transition: transform 0.1s, opacity 0.2s;
      box-sizing: content-box !important; /* 防止外部强制 border-box 导致图标变小 */
    }
    #coolauxv-translate-icon:active { transform: scale(0.9); }

    /* 顶部控件 */
    #coolauxv-header {
        flex-shrink: 0;
        display: flex; justify-content: space-between; align-items: center;
        flex-wrap: wrap;
        touch-action: none;
        gap: 5px;
        text-align: left !important;
    }

    @media screen and (max-width: 600px) {
        #coolauxv-translate-popup { min-width: 50px !important; width: 92vw; }
        .coolauxv-ctrl-btn { font-size: 22px !important; padding: 8px !important; }
        .coolauxv-toggle-label { padding: 4px 8px !important; margin-bottom: 4px; }
    }

    .coolauxv-ctrl-btn { padding: 0 4px; font-size: 18px; color: #666; cursor: pointer; transition: color 0.2s; line-height: 1; }
    .coolauxv-ctrl-btn:hover { color: #3b82f6; }
    #coolauxv-quit:hover { color: #ef4444; }
    #coolauxv-settings-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }
    #coolauxv-settings-btn .coolauxv-settings-icon-track {
        position: relative;
        width: 1.2em;
        height: 1.2em;
        overflow: hidden;
        display: inline-block;
    }
    #coolauxv-settings-btn .coolauxv-settings-icon {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        transform: translate3d(0, 0, 0);
        opacity: 1;
        will-change: transform, opacity;
    }
    #coolauxv-settings-btn .coolauxv-settings-icon-next {
        opacity: 0;
        pointer-events: none;
    }
    #coolauxv-translate-popup.coolauxv-basic-anim-off #coolauxv-header-main-controls,
    #coolauxv-translate-popup.coolauxv-basic-anim-off #coolauxv-main-top-section,
    #coolauxv-translate-popup.coolauxv-basic-anim-off #coolauxv-chat-body,
    #coolauxv-translate-popup.coolauxv-basic-anim-off #coolauxv-reasoning-wrapper,
    #coolauxv-translate-popup.coolauxv-basic-anim-off #coolauxv-btn-scroll-bottom,
    #coolauxv-translate-popup.coolauxv-basic-anim-off #coolauxv-btn-scroll-bottom .coolauxv-scroll-bottom-text {
        transition: none !important;
    }
    #coolauxv-translate-popup.coolauxv-basic-anim-off .coolauxv-provider-checkbox,
    #coolauxv-translate-popup.coolauxv-basic-anim-off .coolauxv-action-checkbox,
    #coolauxv-translate-popup.coolauxv-basic-anim-off .coolauxv-sort-handle,
    #coolauxv-translate-popup.coolauxv-basic-anim-off .coolauxv-batch-actions,
    #coolauxv-translate-popup.coolauxv-basic-anim-off .coolauxv-action-batch-actions,
    #coolauxv-translate-popup.coolauxv-basic-anim-off .coolauxv-batch-toggle-icon {
        transition: none !important;
    }

    /* 复选框 */
    .coolauxv-toggle-label {
        font-size: 12px; display: flex; align-items: center; cursor: pointer;
        background: #e9ecef; padding: 2px 6px; border-radius: 4px; color: #666;
        margin-right: 6px; user-select: none; white-space: nowrap;
        height: auto !important; line-height: normal !important;
        width: auto !important;
    }
    .coolauxv-toggle-label:hover { background: #dee2e6; }

    /* 防止宿主 CSS 破坏 Checkbox */
    .coolauxv-toggle-label input[type="checkbox"] {
        margin: 0 4px 0 0 !important;
        cursor: pointer;
        appearance: checkbox !important; -webkit-appearance: checkbox !important;
        width: 13px !important; height: 13px !important;
        position: static !important; display: inline-block !important;
        box-shadow: none !important; border: 1px solid #999 !important;
        padding: 0 !important; float: none !important;
    }

    /* 调整把手 */
    #coolauxv-resize-handle {
        position: absolute; bottom: 0; right: 0;
        width: 30px; height: 30px; cursor: nwse-resize; z-index: 20;
        display: flex; justify-content: flex-end; align-items: flex-end;
        touch-action: none;
    }
    #coolauxv-resize-icon { width: 15px; height: 15px; fill: #999; pointer-events: none; }

    /* 滚动条 */
    .coolauxv-scroll-box::-webkit-scrollbar { width: 5px; height: 5px; }
    .coolauxv-scroll-box::-webkit-scrollbar-track { background: #f1f1f1; }
    .coolauxv-scroll-box::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
    .coolauxv-scroll-box::-webkit-scrollbar-thumb:hover { background: #999; }

    /* 布局容器 */
    #coolauxv-view-stage {
        position: relative;
        flex: 1;
        overflow: hidden;
    }
    #coolauxv-main-view,
    #coolauxv-settings-view {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        transition: transform 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1);
        will-change: transform, opacity;
    }
    #coolauxv-main-view {
        overflow: hidden;
    }
    #coolauxv-main-view > div {
        padding-bottom: 8px !important;
    }

    #coolauxv-content-container {
        flex: 1; display: flex; flex-direction: column;
        border: 1px solid #eee; border-radius: 8px;
        overflow: hidden; background: #fff; position: relative;
    }

    /* 设置界面 */
    #coolauxv-settings-view {
        display: none;
        padding: 15px;
        background: #fff;
        overflow-y: auto;
        text-align: left !important;
    }
    .coolauxv-setting-group { margin-bottom: 15px; }
    /* 设置项标题 Label */
    .coolauxv-setting-label {
        display: flex !important; /* 提升优先级，防止被网站改为 inline-block */
        align-items: center;
        font-weight: bold;
        margin-bottom: 5px;
        font-size: 13px;
        color: #333;
        flex-wrap: wrap;
        gap: 8px;

        /* 强制占满整行，防止被网站 CSS 挤压导致文字换行 */
        width: 100% !important;
        max-width: none !important;
        float: none !important;
        text-align: left !important;
        box-sizing: border-box !important;
    }
    .coolauxv-settings-inline-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        align-items: flex-start;
        margin-top: 6px;
    }
    .coolauxv-settings-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 180px;
        flex: 0 1 auto;
    }
    .coolauxv-settings-item-wide {
        min-width: 260px;
        flex: 1 1 260px;
    }
    .coolauxv-settings-item-wrap-wide {
        min-width: 260px;
        flex: 1 1 260px;
    }
    #coolauxv-continuous-chat-prompt-section {
        flex: 1 1 100%;
        width: 100%;
        min-width: 0;
    }
    .coolauxv-settings-item-head {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }
    .coolauxv-settings-item .coolauxv-toggle-label {
        width: auto;
        background: none;
        padding: 0;
        border: none;
        margin-right: 0;
    }
    .coolauxv-settings-item-hint {
        font-size: 11px;
        color: #999;
        line-height: 1.4;
    }

    .coolauxv-provider-checkbox {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-right: -8px;
        font-size: 12px;
        color: #666;
        max-width: 0;
        opacity: 0;
        transform: translateX(-8px);
        overflow: hidden;
        pointer-events: none;
        transition: max-width 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1),
                    margin-right 0.25s cubic-bezier(0.2, 0, 0, 1);
    }
    .coolauxv-provider-checkbox input {
        margin: 0;
    }
    .coolauxv-batch-mode .coolauxv-provider-checkbox {
        max-width: 80px;
        opacity: 1;
        transform: translateX(0);
        pointer-events: auto;
        margin-right: 0;
    }
    .coolauxv-action-checkbox {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-right: -8px;
        font-size: 12px;
        color: #666;
        max-width: 0;
        opacity: 0;
        transform: translateX(-8px);
        overflow: hidden;
        pointer-events: none;
        transition: max-width 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1),
                    margin-right 0.25s cubic-bezier(0.2, 0, 0, 1);
    }
    .coolauxv-action-checkbox input {
        margin: 0;
    }
    .coolauxv-action-batch-mode .coolauxv-action-checkbox {
        max-width: 80px;
        opacity: 1;
        transform: translateX(0);
        pointer-events: auto;
        margin-right: 0;
    }
    .coolauxv-sort-handle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 6px;
        background: #f3f4f6;
        color: #6b7280;
        font-size: 12px;
        line-height: 1;
        user-select: none;
        cursor: grab;
        margin-right: -8px;
        max-width: 0;
        opacity: 0;
        transform: translateX(-8px);
        overflow: hidden;
        pointer-events: none;
        transition: max-width 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1),
                    margin-right 0.25s cubic-bezier(0.2, 0, 0, 1);
    }
    .coolauxv-sort-handle:active {
        cursor: grabbing;
    }
    .coolauxv-batch-mode .coolauxv-provider-sort-handle {
        max-width: 24px;
        opacity: 1;
        transform: translateX(0);
        pointer-events: auto;
        margin-right: 0;
    }
    .coolauxv-action-batch-mode .coolauxv-action-sort-handle {
        max-width: 24px;
        opacity: 1;
        transform: translateX(0);
        pointer-events: auto;
        margin-right: 0;
    }
    .coolauxv-batch-mode .coolauxv-provider-sort-handle:hover,
    .coolauxv-action-batch-mode .coolauxv-action-sort-handle:hover {
        background: #e5e7eb;
        color: #374151;
    }
    .coolauxv-sort-item.coolauxv-dragging {
        opacity: 0.58;
    }
    .coolauxv-sort-item.coolauxv-drag-over {
        outline: 1px dashed rgba(107, 114, 128, 0.8);
        outline-offset: 2px;
        border-radius: 10px;
    }
    .coolauxv-batch-actions {
        display: flex;
        gap: 8px;
        margin-bottom: 0;
        align-items: center;
        max-height: 0;
        opacity: 0;
        transform: translateY(-4px);
        overflow: hidden;
        pointer-events: none;
        transition: max-height 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1);
    }
    .coolauxv-batch-mode .coolauxv-batch-actions {
        max-height: 60px;
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
        margin-bottom: 8px;
    }
    .coolauxv-action-batch-actions {
        max-height: 0;
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
        margin-bottom: 0;
    }
    .coolauxv-action-batch-mode .coolauxv-action-batch-actions {
        max-height: 60px;
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
        margin-bottom: 8px;
    }
    .coolauxv-batch-toggle-btn {
        display: inline-flex !important;
        align-items: center;
        gap: 4px;
        overflow: hidden;
        white-space: nowrap;
    }
    .coolauxv-batch-toggle-icon {
        display: inline-block;
        max-width: 1.2em;
        opacity: 1;
        transform: translateX(0);
        overflow: hidden;
        transition: max-width 0.36s cubic-bezier(0.22, 1, 0.36, 1),
                    opacity 0.30s cubic-bezier(0.22, 1, 0.36, 1),
                    transform 0.36s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .coolauxv-batch-toggle-btn.coolauxv-batch-toggle-active .coolauxv-batch-toggle-icon {
        max-width: 0;
        opacity: 0;
        transform: translateX(-8px);
    }
    .coolauxv-batch-toggle-btn.coolauxv-no-anim .coolauxv-batch-toggle-icon {
        transition: none !important;
    }

    .coolauxv-chat-history-batch-actions {
        display: flex;
        gap: 8px;
        margin-bottom: 0;
        flex-wrap: wrap;
        align-items: center;
        max-height: 0;
        opacity: 0;
        transform: translateY(-4px);
        overflow: hidden;
        pointer-events: none;
        transition: max-height 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1);
    }
    .coolauxv-chat-history-batch-mode .coolauxv-chat-history-batch-actions {
        max-height: 64px;
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
        margin-bottom: 10px;
    }
    .coolauxv-chat-history-queue-item-select {
        display: flex;
        align-items: center;
        margin-top: 2px;
        max-width: 0;
        opacity: 0;
        transform: translateX(-8px);
        overflow: hidden;
        pointer-events: none;
        transition: max-width 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1);
    }
    .coolauxv-chat-history-batch-mode .coolauxv-chat-history-queue-item-select {
        max-width: 32px;
        opacity: 1;
        transform: translateX(0);
        pointer-events: auto;
    }
    .coolauxv-chat-history-queue-item-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        max-height: 56px;
        opacity: 1;
        transform: translateY(0);
        overflow: hidden;
        transition: max-height 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1);
    }
    .coolauxv-chat-history-batch-mode .coolauxv-chat-history-queue-item-actions {
        max-height: 0;
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
    }
    .coolauxv-chat-history-queue-item.coolauxv-selected {
        box-shadow: inset 0 0 0 1px #93c5fd;
    }
    .coolauxv-chat-history-no-anim .coolauxv-chat-history-batch-actions,
    .coolauxv-chat-history-no-anim .coolauxv-chat-history-queue-item-select,
    .coolauxv-chat-history-no-anim .coolauxv-chat-history-queue-item-actions,
    .coolauxv-chat-history-no-anim .coolauxv-batch-toggle-icon {
        transition: none !important;
    }
    #coolauxv-chat-history-action-overlay.coolauxv-chat-history-glass-overlay {
        background: rgba(15, 23, 42, 0.24) !important;
        backdrop-filter: blur(12px) saturate(125%) !important;
    }
    #coolauxv-chat-history-action-overlay .coolauxv-chat-history-glass {
        background: rgba(255, 255, 255, 0.58) !important;
        border: 1px solid rgba(255, 255, 255, 0.65);
        backdrop-filter: blur(18px) saturate(130%);
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.22);
    }
    #coolauxv-chat-history-action-overlay .coolauxv-chat-history-glass .coolauxv-chat-history-queue-item {
        background: rgba(255, 255, 255, 0.46) !important;
        border-color: rgba(255, 255, 255, 0.62) !important;
        backdrop-filter: blur(10px) saturate(130%);
    }
    #coolauxv-chat-history-action-overlay .coolauxv-chat-history-glass .coolauxv-action-btn {
        background: rgba(255, 255, 255, 0.66);
        border-color: rgba(255, 255, 255, 0.72);
    }
    #coolauxv-chat-history-action-overlay .coolauxv-chat-history-glass .coolauxv-action-btn:hover {
        background: rgba(255, 255, 255, 0.84);
    }

    .coolauxv-provider-title {
        font-weight: 600;
        color: #1f2937;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        padding: 2px 6px;
        border-radius: 6px;
    }
    .coolauxv-provider-subtitle {
        font-size: 11px;
        font-weight: 600;
        color: #6b7280;
    }


    .coolauxv-link-btn {
        font-size: 11px; color: #3b82f6; text-decoration: none;
        cursor: pointer; font-weight: normal;
        background: #f0f7ff; padding: 1px 6px; border-radius: 4px;
        border: 1px solid #dbeafe; display: inline-block;
    }
    .coolauxv-link-btn:hover { background: #e0efff; text-decoration: none; }

    /* 单选按钮组样式 (Radio Group) */
    .coolauxv-radio-group {
        display: flex;
        gap: 15px;
        flex-wrap: wrap;
        align-items: center; /* 确保垂直居中 */
        margin-top: 5px;
        padding: 5px 0;
        line-height: normal !important; /* 防止容器行高过大 */
    }
    .coolauxv-radio-label {
        display: inline-flex !important; /* 强制内联弹性布局，防止被宿主 block 撑满整行 */
        align-items: center;
        cursor: pointer;
        user-select: none;
        font-size: 13px;
        color: #555;
        transition: color 0.2s;

        /* 防止宿主 CSS 污染导致的间距变大或换行 */
        margin: 0 !important;
        padding: 0 !important;
        width: auto !important;      /* 防止 width: 100% */
        min-width: 0 !important;
        max-width: none !important;
        float: none !important;
        border: none !important;
        background: none !important;
        text-indent: 0 !important;   /* 防止首行缩进 */
        height: auto !important;
    }
    .coolauxv-radio-label:hover { color: #3b82f6; }


    /* 自定义 Radio 输入框样式 */
    .coolauxv-radio-label input[type="radio"] {
        margin: 0 6px 0 0 !important;
        cursor: pointer;
        appearance: auto;
        width: 14px;
        height: 14px;
        accent-color: #3b82f6; /* 使用主题蓝色 */
        vertical-align: middle;
    }
    .coolauxv-radio-text { vertical-align: middle; }

    /* 配置输入框 */
    .coolauxv-input-wrapper { position: relative; width: 100%; }

    /* ============================
    统一输入框样式 (Unified Inputs)
    ============================ */
    #coolauxv-input,
    #coolauxv-chat-input,
    .coolauxv-setting-input {
        width: 100%;
        padding: 8px;
        padding-right: 30px; /* 统一预留右侧图标空间 */
        border: 1px solid #ddd;
        border-radius: 8px; /* 统一圆角 */
        font-size: 14px;    /* 统一字号 */
        outline: none;
        transition: border 0.2s, box-shadow 0.2s, background-color 0.2s;
        font-family: inherit;
        box-sizing: border-box;
        background-color: #fff;
        color: #333;
        text-align: left !important;
        line-height: 1.5;
    }

    /* 聚焦状态 (高亮 + 淡淡的光晕) */
    #coolauxv-input:focus,
    #coolauxv-chat-input:focus,
    .coolauxv-setting-input:focus {
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    /* 各自独有的布局属性 (Specific Layouts) */
    #coolauxv-input { height: 70px; resize: none; }
    #coolauxv-chat-input { min-height: 70px; max-height: 60vh; resize: vertical !important; overflow: auto; }
    .coolauxv-fixed-input { resize: none; }
    .coolauxv-resizable-input { resize: vertical; min-height: 60px; max-height: 300px; }


    .coolauxv-clear-icon {
        position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
        cursor: pointer; color: #ccc; font-weight: bold; font-size: 16px;
        line-height: 1; display: none;
    }
    .coolauxv-input-wrapper.coolauxv-has-value .coolauxv-clear-icon {
        display: block;
    }

    .coolauxv-fixed-input { resize: none; }
    .coolauxv-read-only { background-color: #f9fafb; color: #666; cursor: default; }
    .coolauxv-resizable-input { resize: vertical; min-height: 60px; max-height: 300px; }

    .coolauxv-collapse-section {
        overflow: hidden;
        height: auto;
        max-height: none;
        opacity: 1;
        transform: translateY(0);
        transition: height 0.40s cubic-bezier(0.22, 1, 0.36, 1),
                    max-height 0.40s cubic-bezier(0.22, 1, 0.36, 1),
                    opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1),
                    transform 0.40s cubic-bezier(0.22, 1, 0.36, 1);
        will-change: height, max-height, opacity, transform;
    }
    .coolauxv-collapse-section.coolauxv-collapsed {
        height: 0;
        max-height: 0;
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
    }
    .coolauxv-model-provider-section {
        overflow: hidden;
        max-height: 0;
        opacity: 0;
        transform: translateY(-4px);
        transition: max-height 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1);
        will-change: max-height, opacity, transform;
        pointer-events: none;
    }
    .coolauxv-model-provider-section.coolauxv-model-visible {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
    }
    .coolauxv-provider-row {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        flex-wrap: wrap;
    }
    .coolauxv-provider-col {
        flex: 1 1 180px;
        min-width: 160px;
    }

    /* 模型按钮容器 */
    .coolauxv-tag-container { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
    .coolauxv-model-btn {
        display: flex; flex-direction: column; align-items: center; justify-content: center;

        /* 仅保留布局，严禁出现 background/color */
        padding: 4px 10px; border-radius: 12px; /* 圆角改大一点，符合 Android 12 风格 */
        cursor: pointer; user-select: none;
        min-width: 80px;

        /* 动画 */
        transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
        text-align: center !important;
    }
    .coolauxv-model-btn:hover {
        filter: brightness(0.95); /* 稍微变暗 */
        transform: scale(1.02);   /* 轻微放大 */
        box-shadow: 0 2px 8px rgba(0,0,0,0.05); /* 轻微浮起 */
    }
    .coolauxv-model-name { font-size: 12px; font-weight: bold; }
    .coolauxv-model-tag { font-size: 10px; margin-top: 1px; }

    .coolauxv-sub-label { font-size: 11px; color: #888; width: 100%; margin: 8px 0 4px 0; font-weight: normal; text-align: left !important; }
    .coolauxv-sub-label-inline { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }

    .coolauxv-back-btn { margin-top: 20px; padding: 10px; background: #f3f4f6; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-weight: bold; text-align: center !important; color: #555; }
    .coolauxv-reset-btn {
        margin-top: 10px;
        display: flex; align-items: center; justify-content: center;
        padding: 8px 12px; border-radius: 8px;
        cursor: pointer; user-select: none;
        font-size: 13px; font-weight: 600;
        transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
        border: 1px solid rgba(0,0,0,0.1);
        background: #fff0f0; color: #d32f2f;
        text-align: center !important;
    }
    .coolauxv-reset-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        border-color: rgba(0,0,0,0.15);
        background: #ffe4e6;
    }

    /* 推理框与结果框 */
    .coolauxv-box-wrapper { position: relative; width: 100%; display: flex; flex-direction: column; overflow: hidden; }

    #coolauxv-reasoning-wrapper {
        background-color: #f8f9fa; flex-shrink: 0;
        border-bottom: 1px dashed #ddd; display: none; height: 120px;
        transform-origin: top center;
        overflow: hidden;
        max-height: 120px;
        opacity: 1;
        transform: translateY(0);
        transition: max-height 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1);
        will-change: max-height, opacity, transform;
    }

    #coolauxv-reasoning-box {
        padding: 10px; font-size: 13px; color: #555;
        flex: 1; overflow-y: auto; margin-top: 18px;
        text-align: left !important; text-indent: 0 !important; /* 强制左对齐 */
    }
    #coolauxv-reasoning-wrapper::after {
        content: "💡 思考过程"; position: absolute; top: 6px; left: 10px;
        font-weight: bold; font-size: 11px; color: #888; pointer-events: none;
    }
    #coolauxv-reasoning-wrapper.coolauxv-reasoning-collapsed {
        max-height: 0;
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
    }

    #coolauxv-separator {
        height: 8px; background: #f1f1f1; border-top: 1px solid #e0e0e0; border-bottom: 1px solid #e0e0e0;
        cursor: row-resize; display: none; justify-content: center; align-items: center; flex-shrink: 0;
    }
    #coolauxv-separator:hover { background: #e0e0e0; }
    #coolauxv-separator::after { content: ""; width: 30px; height: 2px; background: #ccc; border-radius: 1px; }

    #coolauxv-result-wrapper { flex: 1; min-height: 0; background: #fff; }
    #coolauxv-result {
        font-size: 15px; line-height: 1.6; padding: 12px;
        flex: 1; overflow-y: auto; height: 100%;
        text-align: left !important; text-indent: 0 !important; /* 强制左对齐 */
    }
    #coolauxv-btn-scroll-bottom {
        position: absolute;
        right: 10px;
        bottom: 10px;
        z-index: 11;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        width: 30px;
        min-width: 30px;
        max-width: 108px;
        overflow: hidden;
        padding: 6px 8px;
        min-height: 28px;
        font-size: 12px;
        border-radius: 999px;
        white-space: nowrap;
        transform-origin: left center;
        transition: width 0.25s cubic-bezier(0.2, 0, 0, 1),
                    padding 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.25s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
    }
    #coolauxv-btn-scroll-bottom .coolauxv-scroll-bottom-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        flex: 0 0 14px;
    }
    #coolauxv-btn-scroll-bottom .coolauxv-scroll-bottom-text {
        max-width: 0;
        margin-left: 0;
        opacity: 0;
        overflow: hidden;
        transition: max-width 0.25s cubic-bezier(0.2, 0, 0, 1),
                    margin-left 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1);
    }
    #coolauxv-btn-scroll-bottom:hover {
        width: 92px;
        padding-right: 10px;
    }
    #coolauxv-btn-scroll-bottom:hover .coolauxv-scroll-bottom-text {
        max-width: 60px;
        margin-left: 6px;
        opacity: 1;
    }
    #coolauxv-btn-scroll-bottom.coolauxv-animated-visibility {
        transform: translateY(4px) scale(0.98);
    }
    #coolauxv-btn-scroll-bottom.coolauxv-animated-visibility.coolauxv-visible {
        transform: translateY(0) scale(1);
    }

    .coolauxv-copy-btn {
        position: absolute; top: 2px; right: 2px;
        background: transparent; border: none;
        padding: 2px 4px; cursor: pointer;
        font-size: 11px; color: #999; z-index: 10;
        opacity: 0.5; transition: all 0.2s; user-select: none;
        text-align: center !important;
    }
    .coolauxv-copy-btn:hover { opacity: 1; color: #3b82f6; background: rgba(0,0,0,0.03); border-radius: 4px; }
    .coolauxv-clear-btn { right: 24px; }

    .coolauxv-input-ctrl-btn {
        cursor: pointer; color: #bbb; font-size: 13px; padding: 3px;
        text-align: center; line-height: 1; transition: color 0.2s;
    }
    .coolauxv-input-ctrl-btn:hover { color: #3b82f6; background: #f0f7ff; border-radius: 4px; }

    /* 连续对话操作条 */
    #coolauxv-chat-bar {
        margin-top: 8px;
        display: none;
        flex-direction: column;
        gap: 6px;
        flex-shrink: 0;
    }
    #coolauxv-chat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        color: #666;
    }
    #coolauxv-chat-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    #coolauxv-chat-history-btn,
    #coolauxv-chat-toggle {
        cursor: pointer;
        font-size: 12px;
        color: #3b82f6;
        background: transparent;
        border: none;
        padding: 2px 6px;
        border-radius: 4px;
    }
    #coolauxv-chat-history-btn:hover,
    #coolauxv-chat-toggle:hover {
        background: #e0efff;
    }
    #coolauxv-header-left {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        min-width: 0;
    }
    #coolauxv-top-collapse-btn {
        cursor: pointer;
        font-size: 12px;
        color: #3b82f6;
        background: transparent;
        border: none;
        padding: 2px 6px;
        border-radius: 4px;
        white-space: nowrap;
        line-height: 1;
    }
    #coolauxv-top-collapse-btn:hover {
        background: #e0efff;
    }
    #coolauxv-header-main-controls {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        white-space: nowrap;
        overflow: hidden;
        max-width: none;
        opacity: 1;
        transform: scaleX(1);
        transform-origin: left center;
        transition: max-width 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1);
        will-change: max-width, opacity, transform;
    }
    #coolauxv-header-main-controls.coolauxv-header-controls-collapsed {
        max-width: 0 !important;
        opacity: 0;
        transform: scaleX(0.96);
        pointer-events: none;
    }
    #coolauxv-main-top-section {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        max-height: none;
        opacity: 1;
        transform: translateY(0);
        transition: max-height 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1);
        will-change: max-height, opacity, transform;
        flex-shrink: 0;
    }
    #coolauxv-main-top-section.coolauxv-top-collapsed {
        max-height: 0;
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
    }
    #coolauxv-chat-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        position: relative;
        overflow: hidden;
        max-height: none;
        opacity: 1;
        transform: translateY(0);
        transition: max-height 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1);
        will-change: max-height, opacity, transform;
    }
    #coolauxv-chat-bar.coolauxv-chat-collapsed #coolauxv-chat-body {
        max-height: 0;
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
    }
    #coolauxv-chat-actions { display: flex; }
    #coolauxv-chat-actions > .coolauxv-action-btn { margin-right: 10px; }
    #coolauxv-chat-actions > .coolauxv-action-btn:last-child { margin-right: 0; }
    #coolauxv-chat-inline-notice {
        position: absolute;
        left: 8px;
        right: 8px;
        bottom: 48px;
        z-index: 18;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 7px 10px;
        border-radius: 8px;
        border: 1px solid #fecaca;
        background: #fff1f2;
        color: #b91c1c;
        font-size: 12px;
        line-height: 1.4;
        box-shadow: 0 8px 20px rgba(185, 28, 28, 0.12);
    }
    #coolauxv-chat-inline-notice-text {
        min-width: 0;
        word-break: break-word;
    }
    #coolauxv-chat-inline-notice-close {
        border: none;
        background: transparent;
        color: #b91c1c;
        font-size: 16px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        padding: 0 2px;
        flex: 0 0 auto;
    }
    #coolauxv-chat-inline-notice-close:hover {
        color: #991b1b;
    }
    #coolauxv-chat-inline-notice.coolauxv-animated-visibility {
        max-width: none;
        padding: 7px 10px;
        transform: translateY(4px) scale(0.98);
    }
    #coolauxv-chat-inline-notice.coolauxv-animated-visibility.coolauxv-visible {
        transform: translateY(0) scale(1);
    }
    .coolauxv-chat-preview-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 8px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        border: 1px solid rgba(0,0,0,0.1);
        background: #f9fafb;
        color: #374151;
        user-select: none;
    }
    .coolauxv-chat-preview-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        border-color: rgba(0,0,0,0.15);
        background: #fff;
    }
    .coolauxv-chat-refresh-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 8px;
        border-radius: 999px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        border: 1px solid rgba(59,130,246,0.35);
        background: #eff6ff;
        color: #1d4ed8;
        vertical-align: middle;
        margin-left: 6px;
    }
    .coolauxv-chat-refresh-btn:hover {
        background: #dbeafe;
        border-color: rgba(59,130,246,0.55);
    }
    .coolauxv-chat-edit-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 8px;
        border-radius: 999px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        border: 1px solid rgba(16,185,129,0.35);
        background: #ecfdf5;
        color: #065f46;
        vertical-align: middle;
        margin-left: 6px;
    }
    .coolauxv-chat-edit-btn:hover {
        background: #d1fae5;
        border-color: rgba(16,185,129,0.55);
    }
    .coolauxv-chat-delete-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 8px;
        border-radius: 999px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        border: 1px solid rgba(239,68,68,0.35);
        background: #fef2f2;
        color: #991b1b;
        vertical-align: middle;
        margin-left: 6px;
    }
    .coolauxv-chat-delete-btn:hover {
        background: #fee2e2;
        border-color: rgba(239,68,68,0.55);
    }
    .coolauxv-chat-strip-media-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 8px;
        border-radius: 999px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        border: 1px solid rgba(59,130,246,0.35);
        background: #eff6ff;
        color: #1d4ed8;
        vertical-align: middle;
        margin-left: 6px;
    }
    .coolauxv-chat-strip-media-btn:hover {
        background: #dbeafe;
        border-color: rgba(59,130,246,0.55);
    }

    /* ============================
       统一按钮风格 (Action Buttons)
       ============================ */
    .coolauxv-action-btn {
        display: flex; align-items: center; justify-content: center;
        padding: 6px 10px; border-radius: 8px;
        cursor: pointer; user-select: none;
        font-size: 12px; font-weight: 600;
        line-height: 1.2;
        transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
        border: 1px solid rgba(0,0,0,0.1);
        background: #f9fafb; color: #374151;
        text-align: center !important;
        position: relative; overflow: hidden;
    }

    /* 悬停效果：轻微浮起 + 变色 */
    .coolauxv-action-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        border-color: rgba(0,0,0,0.15);
        background: #fff;
    }

    /* 点击效果 */
    .coolauxv-action-btn:active {
        transform: scale(0.98);
        background: #f3f4f6;
    }
    .coolauxv-action-btn:disabled {
        cursor: not-allowed;
        opacity: 0.5;
        box-shadow: none;
        transform: none;
    }

    /* 特定颜色的变种 (通过 style 覆盖，但保留 hover 动画) */
    .coolauxv-btn-primary { background: #e0f2fe; color: #0284c7; border-color: #bae6fd; }
    .coolauxv-btn-primary:hover { background: #bae6fd; }

    .coolauxv-btn-purple { background: #6d28d9; color: #fff; border-color: #5b21b6; }
    .coolauxv-btn-purple:hover { background: #5b21b6; }

    .coolauxv-btn-blue { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
    .coolauxv-btn-blue:hover { background: #bfdbfe; }
    .coolauxv-main-action-btn {
        flex: var(--coolauxv-action-weight, 1) 1 0;
        min-width: 0;
        background: var(--coolauxv-action-bg, #f9fafb);
        color: var(--coolauxv-action-fg, #374151);
        border-color: var(--coolauxv-action-border, rgba(0,0,0,0.12));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .coolauxv-main-action-btn:hover {
        background: var(--coolauxv-action-bg-hover, #fff);
        border-color: var(--coolauxv-action-border-hover, rgba(0,0,0,0.18));
    }

    #coolauxv-main-action-buttons {
        flex: var(--coolauxv-main-action-total-weight, 1) 1 0;
        width: 100%;
        min-width: 0;
        overflow: visible;
    }
    .coolauxv-main-action-btn,
    #coolauxv-btn-stop,
    #coolauxv-btn-image-file,
    #coolauxv-btn-screenshot,
    #coolauxv-btn-preview,
    #coolauxv-btn-clear-shot {
        padding-top: 5px !important;
        padding-bottom: 5px !important;
        min-height: 30px;
    }
    #coolauxv-btn-preview,
    #coolauxv-btn-clear-shot,
    #coolauxv-btn-preview-chat,
    #coolauxv-btn-clear-chat-shot {
        width: 36px;
        min-width: 36px;
        flex: 0 0 36px !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
    }

    /* 连续对话按钮显隐动画 (Animated Visibility) */
    .coolauxv-animated-visibility {
        opacity: 0;
        transform: translateY(-4px) scale(0.98);
        max-width: 0;
        padding: 0;
        pointer-events: none;
        overflow: hidden;
        transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
    }
    #coolauxv-chat-actions > .coolauxv-animated-visibility {
        margin-right: 0;
    }
    .coolauxv-animated-visibility.coolauxv-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        max-width: 140px;
        padding: 8px 12px;
        pointer-events: auto;
    }
    #coolauxv-chat-actions > .coolauxv-animated-visibility.coolauxv-visible {
        margin-right: 10px;
    }

    /* Markdown 强制样式 */
    .coolauxv-markdown, .coolauxv-raw-text { text-align: left !important; }
    .coolauxv-markdown p { margin: 0 0 10px 0; text-align: left !important; text-indent: 0 !important; }
    .coolauxv-markdown ul, .coolauxv-markdown ol { padding-left: 20px; margin: 5px 0 10px 0; text-align: left !important; }
    .coolauxv-markdown h1, .coolauxv-markdown h2, .coolauxv-markdown h3 { font-weight: bold; margin: 15px 0 8px 0; color: #1f2937; line-height: 1.4; text-align: left !important; }
    .coolauxv-markdown hr, .coolauxv-markdown-body hr {
        border: 0;
        border-top: 2px dashed #9ca3af;
        margin: 14px 0;
        opacity: 1;
    }
    .coolauxv-markdown .coolauxv-chat-turn-divider,
    .coolauxv-markdown-body .coolauxv-chat-turn-divider {
        display: block;
        height: 0;
        border-top: 2px solid #6b7280;
        margin: 16px 0 14px 0;
        opacity: 1;
    }
    .coolauxv-markdown a, .coolauxv-markdown-body a {
        color: #1d4ed8 !important;
        text-decoration-line: underline !important;
        text-decoration-thickness: 2px !important;
        text-underline-offset: 2px !important;
        font-weight: 600;
        background: rgba(59, 130, 246, 0.14);
        border-radius: 4px;
        padding: 0 3px;
        cursor: pointer;
    }
    .coolauxv-markdown a:hover, .coolauxv-markdown-body a:hover {
        color: #1e40af !important;
        background: rgba(59, 130, 246, 0.24);
    }
    .coolauxv-markdown a:visited, .coolauxv-markdown-body a:visited {
        color: #3730a3 !important;
    }
    .coolauxv-markdown a:focus-visible, .coolauxv-markdown-body a:focus-visible {
        outline: 2px solid rgba(59, 130, 246, 0.4);
        outline-offset: 1px;
    }
    .coolauxv-markdown code { background-color: #f3f4f6; color: #c2410c; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
    .coolauxv-markdown pre { background-color: #1f2937; color: #f9fafb; padding: 10px; border-radius: 6px; overflow-x: auto; margin: 10px 0; text-align: left !important; }
    .coolauxv-mermaid-rendered { margin: 10px 0; padding: 8px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; overflow-x: auto; }
    .coolauxv-mermaid-rendered svg { display: block; max-width: 100%; height: auto; margin: 0 auto; cursor: zoom-in; }
    .coolauxv-mermaid-fallback { margin: 10px 0; }
    .coolauxv-raw-text { white-space: pre-wrap; font-family: monospace; color: #444; }

    /* 原始错误信息展开/收起 */
    .coolauxv-error-detail-toggle {
        cursor: pointer;
        color: #2563eb;
        background: none;
        border: none;
        padding: 0;
        font-size: 12px;
    }
    .coolauxv-error-detail-body {
        overflow: hidden;
        max-height: none;
        opacity: 1;
        transform: translateY(0);
        transition: max-height 0.25s cubic-bezier(0.2, 0, 0, 1),
                    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
                    transform 0.25s cubic-bezier(0.2, 0, 0, 1);
        will-change: max-height, opacity, transform;
    }
    .coolauxv-error-detail-body.coolauxv-collapsed {
        max-height: 0;
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
    }
    .coolauxv-error-detail-pre {
        white-space: pre-wrap;
        background: #fff;
        border: 1px solid #fde68a;
        padding: 6px;
        border-radius: 6px;
        margin-top: 6px;
        font-size: 12px;
        color: #7c2d12;
    }

    /* GitHub 开源按钮样式 */
    .coolauxv-github-btn {
        display: inline-flex; align-items: center; justify-content: center;
        text-decoration: none;
        padding: 6px 14px; border-radius: 8px;
        cursor: pointer; user-select: none;
        font-size: 13px; font-weight: 600;
        transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
        border: 1px solid rgba(0,0,0,0.1);
        background: #f9fafb; color: #374151;
        margin-top: 5px;
        font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
    }
    .coolauxv-github-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        border-color: rgba(0,0,0,0.15);
        background: #fff;
        text-decoration: none;
    }
    .coolauxv-github-btn svg { fill: currentColor; margin-right: 6px; }

    /* ============================
    流体玻璃 (Blur Glass Effect)
    ============================ */
    /* 1. 主窗口容器 */
    .coolauxv-blur-glass-enabled {
        /* 背景：线性渐变模拟光线扫过的质感 */
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.15)) !important;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        /* 边框：高亮白边模拟玻璃边缘 */
        border: 1px solid rgba(255, 255, 255, 0.6) !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15) !important;

        /* 核心需求：给非文本框文字加上白色光晕/阴影，对抗杂乱背景 */
        text-shadow: 0 1px 2px rgba(255, 255, 255, 0.9), 0 0 1px rgba(255, 255, 255, 0.8) !important;
    }

    /* 重置输入框/代码块内的文字阴影 */
    .coolauxv-blur-glass-enabled input,
    .coolauxv-blur-glass-enabled textarea,
    .coolauxv-blur-glass-enabled .coolauxv-scroll-box,
    .coolauxv-blur-glass-enabled pre,
    .coolauxv-blur-glass-enabled code,
    .coolauxv-blur-glass-enabled .coolauxv-model-btn {
        text-shadow: none !important;
    }

    /* 2. 标题栏 & 设置页容器：全透明，透出底层的玻璃感 */
    .coolauxv-blur-glass-enabled #coolauxv-header,
    .coolauxv-blur-glass-enabled #coolauxv-settings-view {
        background: transparent !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.3) !important;
    }

    /* 3. 输入框玻璃特效 (统一) */
    .coolauxv-blur-glass-enabled #coolauxv-input,
    .coolauxv-blur-glass-enabled #coolauxv-chat-input,
    .coolauxv-blur-glass-enabled .coolauxv-setting-input {
        background-color: rgba(255, 255, 255, 0.75) !important;
        border: 1px solid rgba(255, 255, 255, 0.6) !important;
        box-shadow: inset 0 1px 4px rgba(0,0,0,0.05);
        color: #000 !important;
    }
    .coolauxv-blur-glass-enabled #coolauxv-input:focus,
    .coolauxv-blur-glass-enabled #coolauxv-chat-input:focus,
    .coolauxv-blur-glass-enabled .coolauxv-setting-input:focus {
        background-color: rgba(255, 255, 255, 0.95) !important;
        border-color: #3b82f6 !important;
        box-shadow: 0 0 8px rgba(255,255,255,0.8) !important;
    }

    /* 4. 结果显示区：雾白背景 */
    .coolauxv-blur-glass-enabled #coolauxv-content-container {
        background: transparent !important;
        border: 1px solid rgba(255, 255, 255, 0.4) !important;
    }

    .coolauxv-blur-glass-enabled #coolauxv-reasoning-wrapper {
        background-color: rgba(248, 249, 250, 0.7) !important;
        border-bottom: 1px dashed rgba(0, 0, 0, 0.1) !important;
    }

    .coolauxv-blur-glass-enabled #coolauxv-result-wrapper {
        background-color: rgba(255, 255, 255, 0.75) !important;
    }

    /* 5. 功能按钮：半透明磨砂 */
    .coolauxv-blur-glass-enabled #coolauxv-btn-trans {
        background: rgba(243, 244, 246, 0.65) !important;
        border: 1px solid rgba(255, 255, 255, 0.6) !important;
        backdrop-filter: blur(4px);
    }
    .coolauxv-blur-glass-enabled #coolauxv-btn-trans:hover {
        background: rgba(243, 244, 246, 0.9) !important;
    }

    .coolauxv-blur-glass-enabled #coolauxv-btn-explain {
        background: rgba(165, 22, 232, 0.75) !important;
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.3) !important;
        box-shadow: 0 4px 12px rgba(165, 22, 232, 0.25);
        color: #fff;
    }
    .coolauxv-blur-glass-enabled #coolauxv-btn-explain:hover {
        background: rgba(165, 22, 232, 0.9) !important;
    }

    .coolauxv-blur-glass-enabled #coolauxv-btn-screenshot {
        background: rgba(59, 130, 246, 0.75) !important;
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.3) !important;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
    }
    .coolauxv-blur-glass-enabled #coolauxv-btn-screenshot:hover {
        background: rgba(59, 130, 246, 0.9) !important;
    }

    .coolauxv-blur-glass-enabled #coolauxv-btn-preview {
        background: rgba(255, 255, 255, 0.2) !important;
        border: 1px solid rgba(255, 255, 255, 0.4) !important;
        color: #333;
    }
    .coolauxv-blur-glass-enabled #coolauxv-btn-preview:hover {
        background: rgba(255, 255, 255, 0.4) !important;
    }

    .coolauxv-blur-glass-enabled .coolauxv-github-btn {
        background: rgba(255, 255, 255, 0.3) !important;
        border: 1px solid rgba(255, 255, 255, 0.6) !important;
        color: #1f2937 !important;
        backdrop-filter: blur(6px);
    }
    .coolauxv-blur-glass-enabled .coolauxv-github-btn:hover {
        background: rgba(255, 255, 255, 0.5) !important;
    }
    .coolauxv-blur-glass-enabled .coolauxv-reset-btn {
        background: rgba(255, 235, 238, 0.6) !important;
        border: 1px solid rgba(255, 255, 255, 0.6) !important;
        color: #b91c1c !important;
        backdrop-filter: blur(6px);
    }
    .coolauxv-blur-glass-enabled .coolauxv-reset-btn:hover {
        background: rgba(254, 226, 226, 0.8) !important;
    }

    /* 6. 分隔条 */
    .coolauxv-blur-glass-enabled #coolauxv-separator {
        background: rgba(255, 255, 255, 0.5) !important;
    }

    /* 7. 模型按钮样式 (特定) */
    .coolauxv-model-btn.coolauxv-blur-glass-style-btn {
        background: rgba(220, 245, 255, 0.25) !important;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(179, 224, 255, 0.4) !important;
        box-shadow: 0 4px 12px rgba(0, 102, 255, 0.15);
        transition: all 0.2s ease;
    }
    .coolauxv-model-btn.coolauxv-blur-glass-style-btn:hover {
        background: rgba(220, 245, 255, 0.5) !important;
        border-color: rgba(179, 224, 255, 0.8) !important;
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(0, 102, 255, 0.25);
    }

    /* 识屏按钮 (蓝色系) */
    .coolauxv-blur-glass-enabled #coolauxv-btn-screenshot {
        background: rgba(59, 130, 246, 0.75) !important; /* 蓝色半透明 */
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.3) !important;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
    }
    .coolauxv-blur-glass-enabled #coolauxv-btn-screenshot:hover {
        background: rgba(59, 130, 246, 0.9) !important;
    }


    /* ============================
       截图功能样式
       ============================ */
    #coolauxv-screenshot-overlay {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        z-index: 2147483647; cursor: crosshair; display: none;
        /* 使用大阴影技术来实现"镂空"效果 */
        pointer-events: auto;
    }

    #coolauxv-selection-box {
        position: absolute;
        border: 2px solid #a516e8;
        /* 核心：背景透明，利用超大阴影压暗周围，形成聚光灯效果 */
        background: transparent !important;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5) !important;
        pointer-events: none;
        z-index: 2147483648;
        display: none;
    }

    /* === 截图加载时的提示 === */
    /* 1. 默认状态：纯灰蒙版 (Dark Mode style) */
    #coolauxv-loading-toast {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        /* 使用 Flex 布局居中内容 */
        display: none; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
        padding: 20px 30px; border-radius: 12px; font-size: 14px; z-index: 2147483655;

        background: rgba(40, 40, 40, 0.9); /* 纯深灰色，不带模糊 */
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 4px 15px rgba(0,0,0,0.5);

        transition: all 0.3s ease; /* 添加过渡动画 */
    }

    /* 2. 激活状态：流体玻璃 (Blur Glass) */
    /* 当添加了 .coolauxv-blur-glass-style 类时生效 */
    #coolauxv-loading-toast.coolauxv-blur-glass-style {
        /* 模拟 iOS 风格的亮色毛玻璃 */
        background: rgba(255, 255, 255, 0.25) !important;
        backdrop-filter: blur(15px) !important;
        -webkit-backdrop-filter: blur(15px) !important;
        border: 1px solid rgba(255, 255, 255, 0.5) !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15) !important;

        /* 玻璃背景通常较亮，文字改为深色以保证对比度 */
        color: #1f2937 !important;
        text-shadow: 0 1px 1px rgba(255, 255, 255, 0.8);
    }

    #coolauxv-screenshot-toolbar {
        position: absolute;
        display: none;
        gap: 8px;
        z-index: 2147483649;
        background: white;
        padding: 4px;
        border-radius: 6px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }

    .coolauxv-shot-btn {
        padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; border: none; color: white;
    }
    #coolauxv-shot-ok { background: #a516e8; }
    #coolauxv-shot-cancel { background: #666; }

    /* ============================
        图片预览层样式
    ============================ */
    #coolauxv-img-preview-overlay {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.85);
        z-index: 2147483650; /* 比截图层更高 */
        display: none;
        justify-content: center; align-items: center;
        cursor: zoom-out;
        backdrop-filter: blur(5px);
    }
    #coolauxv-img-preview-overlay img {
        max-width: 95%; max-height: 95%;
        box-shadow: 0 0 30px rgba(0,0,0,0.5);
        border-radius: 4px;
        object-fit: contain;
    }
    #coolauxv-mermaid-preview-overlay {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0);
        z-index: 2147483651;
        display: none;
        overflow: hidden;
        cursor: grab;
        opacity: 0;
        backdrop-filter: blur(0px);
        transition: opacity 0.22s cubic-bezier(0.2, 0, 0, 1),
                    background-color 0.22s cubic-bezier(0.2, 0, 0, 1),
                    backdrop-filter 0.22s cubic-bezier(0.2, 0, 0, 1);
    }
    #coolauxv-mermaid-preview-overlay.coolauxv-visible {
        opacity: 1;
        background: rgba(0, 0, 0, 0.88);
        backdrop-filter: blur(6px);
    }
    #coolauxv-mermaid-preview-overlay.coolauxv-no-anim {
        transition: none !important;
    }
    #coolauxv-mermaid-preview-stage {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
    }
    #coolauxv-mermaid-preview-stage svg {
        display: block;
        max-width: none !important;
        max-height: none !important;
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
        text-rendering: geometricPrecision;
        shape-rendering: geometricPrecision;
    }

    /* 预览按钮 (透明背景，带边框) */
    .coolauxv-blur-glass-enabled #coolauxv-btn-preview {
        background: rgba(255, 255, 255, 0.2) !important;
        border: 1px solid rgba(255, 255, 255, 0.4) !important;
        color: #333;
    }
    .coolauxv-blur-glass-enabled #coolauxv-btn-preview:hover {
        background: rgba(255, 255, 255, 0.4) !important;
    }


    /* ============================
        AI思考中的动画
    ============================ */
    @keyframes coolauxv-pulse-anim {
        0% { opacity: 0.5; }
        50% { opacity: 1; }
        100% { opacity: 0.5; }
    }
    .coolauxv-pulse {
        animation: coolauxv-pulse-anim 1.5s infinite ease-in-out;
    }

    /* 更新日志弹窗样式 */
    #coolauxv-changelog-overlay {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.5); z-index: 2147483660; /* 确保比主界面高 */
        display: flex; justify-content: center; align-items: center;
        backdrop-filter: blur(4px);
        opacity: 0; transition: opacity 0.3s;
    }
    #coolauxv-changelog-box {
        background: white; width: 400px; max-width: 90%;
        padding: 20px; border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        transform: scale(0.9); transition: transform 0.3s;
        text-align: left !important;
    }
    #coolauxv-btn-know {
        background: #a516e8; color: white; border: none;
        padding: 8px 20px; border-radius: 6px; cursor: pointer;
        font-weight: bold; margin-top: 15px; width: 100%;
    }
    #coolauxv-btn-know:hover { background: #8e12c9; }

    /* Markdown 表格样式 */
    .coolauxv-markdown table {
        border-collapse: collapse;
        width: 100%;
        margin: 15px 0;
        display: block;
        overflow-x: auto;
    }
    .coolauxv-markdown th, .coolauxv-markdown td {
        border: 1px solid #dfe2e5;
        padding: 6px 13px;
        font-size: 13px;
    }
    .coolauxv-markdown th {
        background-color: #f3f4f6;
        font-weight: bold;
    }
    .coolauxv-markdown tr:nth-child(2n) {
        background-color: #f8f9fa;
    }

    /* KaTeX 公式容器 */
    .katex-display {
        overflow-x: auto;
        overflow-y: hidden;
        margin: 10px 0;
        padding: 5px 0;
    }

    /* Markdown 图片显示问题 */
    .coolauxv-markdown img {
        display: block !important;       /* 强制显示，对抗宿主网页隐藏图片的 CSS */
        max-width: 100% !important;      /* 限制最大宽度，防止撑破容器 */
        height: auto !important;         /* 高度自适应 */
        border-radius: 6px;              /* 圆角美化 */
        margin: 10px 0;                  /* 上下间距 */
        box-shadow: 0 2px 10px rgba(0,0,0,0.1); /* 轻微阴影，增加层次感 */
        border: 1px solid rgba(0,0,0,0.05);     /* 极淡边框 */
        background-color: #fafafa;              /* 加载失败时的背景色 */
    }

    `;

        GM_addStyle(styles);

        const katexCSS = GM_getResourceText("katexCSS");
        if (katexCSS) GM_addStyle(katexCSS);
    };

    // --- 2. 状态变量 ---
    let popup, floatBall, cursorBtn;
    let currentSelection = "";
    let lastSelectionText = "";
    let isIconDismissed = false;

    let isShowRaw = DEFAULT_SHOW_RAW;
    let isShowReasoning = DEFAULT_SHOW_REASONING;
    let isQuitted = false;
    let activeView = "main";
    let isViewSwitching = false;
    let viewSwitchTimer = null;
    let isPopupAnimating = false;

    requestBridgeCleanup = () => {
        isQuitted = true;
        if (popup) popup.style.display = "none";
        if (floatBall) floatBall.style.display = "none";
        if (cursorBtn) cursorBtn.style.display = "none";
    };

    const VIEW_EDGES = ["left", "right", "top", "bottom"];
    const getRandomViewEdge = () => VIEW_EDGES[Math.floor(Math.random() * VIEW_EDGES.length)];
    const getOppositeViewEdge = (edge) => {
        switch (edge) {
            case "left": return "right";
            case "right": return "left";
            case "top": return "bottom";
            case "bottom": return "top";
            default: return "left";
        }
    };
    const getViewTransform = (edge) => {
        switch (edge) {
            case "left": return "translate3d(-100%, 0, 0)";
            case "right": return "translate3d(100%, 0, 0)";
            case "top": return "translate3d(0, -100%, 0)";
            case "bottom": return "translate3d(0, 100%, 0)";
            default: return "translate3d(0, 0, 0)";
        }
    };

    const setHeaderMainControlsVisibility = (visible) => {
        if (!popup) return;
        const controls = popup.querySelector("#coolauxv-header-main-controls");
        if (!controls) return;
        if (!isBasicAnimEnabled()) {
            if (visible) {
                controls.style.display = "flex";
                controls.style.overflow = "visible";
                controls.style.maxWidth = "none";
                controls.classList.remove("coolauxv-header-controls-collapsed");
            } else {
                controls.style.overflow = "hidden";
                controls.style.maxWidth = "0px";
                controls.classList.add("coolauxv-header-controls-collapsed");
                controls.style.display = "none";
            }
            return;
        }

        if (visible) {
            if (controls.style.display === "flex" && !controls.classList.contains("coolauxv-header-controls-collapsed")) {
                return;
            }
            controls.style.display = "flex";
            controls.style.overflow = "hidden";
            controls.classList.add("coolauxv-header-controls-collapsed");
            controls.style.maxWidth = "0px";
            void controls.offsetWidth;
            const targetWidth = Math.max(controls.scrollWidth, 1);
            controls.style.maxWidth = `${targetWidth}px`;
            controls.classList.remove("coolauxv-header-controls-collapsed");
            let timeoutId = 0;
            const onEnd = (e) => {
                if (e.propertyName !== "max-width") return;
                cleanup();
                if (!controls.classList.contains("coolauxv-header-controls-collapsed")) {
                    controls.style.maxWidth = "none";
                    controls.style.overflow = "visible";
                }
            };
            const cleanup = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = 0;
                }
                controls.removeEventListener("transitionend", onEnd);
            };
            controls.addEventListener("transitionend", onEnd);
            timeoutId = window.setTimeout(() => {
                cleanup();
                if (!controls.classList.contains("coolauxv-header-controls-collapsed")) {
                    controls.style.maxWidth = "none";
                    controls.style.overflow = "visible";
                }
            }, 320);
            return;
        }

        if (controls.style.display === "none") return;
        controls.style.overflow = "hidden";
        if (controls.style.maxWidth === "none" || !controls.style.maxWidth) {
            controls.style.maxWidth = `${Math.max(controls.scrollWidth, 1)}px`;
        }
        void controls.offsetWidth;
        controls.classList.add("coolauxv-header-controls-collapsed");
        controls.style.maxWidth = "0px";
        let timeoutId = 0;
        const onEnd = (e) => {
            if (e.propertyName !== "max-width") return;
            cleanup();
            if (controls.classList.contains("coolauxv-header-controls-collapsed")) {
                controls.style.display = "none";
            }
        };
        const cleanup = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = 0;
            }
            controls.removeEventListener("transitionend", onEnd);
        };
        controls.addEventListener("transitionend", onEnd);
        timeoutId = window.setTimeout(() => {
            cleanup();
            if (controls.classList.contains("coolauxv-header-controls-collapsed")) {
                controls.style.display = "none";
            }
        }, 320);
    };

    const getSettingsBtnIconByView = (view) => (view === "settings" ? "🏠" : "⚙️");
    const getSettingsBtnTitleByView = (view) => (view === "settings" ? "返回主界面" : "设置");

    const applySettingsBtnIcon = (view) => {
        if (!popup) return;
        const settingsBtn = popup.querySelector("#coolauxv-settings-btn");
        if (!settingsBtn) return;
        const currentIcon = settingsBtn.querySelector(".coolauxv-settings-icon-current");
        const nextIcon = settingsBtn.querySelector(".coolauxv-settings-icon-next");
        if (!currentIcon || !nextIcon) return;

        const icon = getSettingsBtnIconByView(view);
        currentIcon.textContent = icon;
        currentIcon.style.transition = "none";
        currentIcon.style.transform = "translate3d(0, 0, 0)";
        currentIcon.style.opacity = "1";

        nextIcon.textContent = "";
        nextIcon.style.transition = "none";
        nextIcon.style.transform = "translate3d(0, 0, 0)";
        nextIcon.style.opacity = "0";

        settingsBtn.dataset.iconView = view;
        settingsBtn.dataset.iconAnimating = "false";
        settingsBtn.title = getSettingsBtnTitleByView(view);
    };

    const animateSettingsBtnIcon = (targetView, edge) => {
        if (!popup) return;
        const settingsBtn = popup.querySelector("#coolauxv-settings-btn");
        if (!settingsBtn) return;
        const currentIcon = settingsBtn.querySelector(".coolauxv-settings-icon-current");
        const nextIcon = settingsBtn.querySelector(".coolauxv-settings-icon-next");
        if (!currentIcon || !nextIcon) return;

        const currentView = settingsBtn.dataset.iconView || "main";
        if (currentView === targetView) {
            applySettingsBtnIcon(targetView);
            return;
        }

        const outEdge = edge || "right";
        const outTransform = getViewTransform(outEdge);
        const inTransform = getViewTransform(getOppositeViewEdge(outEdge));
        const speed = getAnimSpeedFactor();
        const durTransform = Math.round(250 / speed);
        const durOpacity = Math.round(200 / speed);

        settingsBtn.dataset.iconAnimating = "true";
        settingsBtn.title = getSettingsBtnTitleByView(targetView);

        nextIcon.textContent = getSettingsBtnIconByView(targetView);
        currentIcon.style.transition = "none";
        currentIcon.style.transform = "translate3d(0, 0, 0)";
        currentIcon.style.opacity = "1";
        nextIcon.style.transition = "none";
        nextIcon.style.transform = inTransform;
        nextIcon.style.opacity = "0";

        void settingsBtn.offsetWidth;

        currentIcon.style.transition = `transform ${durTransform}ms ${POPUP_ANIM_EASING}, opacity ${durOpacity}ms ${POPUP_ANIM_EASING}`;
        nextIcon.style.transition = `transform ${durTransform}ms ${POPUP_ANIM_EASING}, opacity ${durOpacity}ms ${POPUP_ANIM_EASING}`;

        requestAnimationFrame(() => {
            currentIcon.style.transform = outTransform;
            currentIcon.style.opacity = "0";
            nextIcon.style.transform = "translate3d(0, 0, 0)";
            nextIcon.style.opacity = "1";
        });

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            applySettingsBtnIcon(targetView);
        };
        const onEnd = (e) => {
            if (e.target !== nextIcon || e.propertyName !== "transform") return;
            nextIcon.removeEventListener("transitionend", onEnd);
            finish();
        };
        nextIcon.addEventListener("transitionend", onEnd);
        setTimeout(finish, Math.max(durTransform, durOpacity) + 80);
    };

    const setViewImmediate = (targetView) => {
        if (!popup) return;
        const mainView = popup.querySelector("#coolauxv-main-view");
        const settingsView = popup.querySelector("#coolauxv-settings-view");
        if (!mainView || !settingsView) return;
        if (viewSwitchTimer) {
            clearTimeout(viewSwitchTimer);
            viewSwitchTimer = null;
        }
        isViewSwitching = false;
        setHeaderMainControlsVisibility(targetView !== "settings");
        applySettingsBtnIcon(targetView);
        if (targetView === "settings") {
            mainView.style.display = "none";
            mainView.style.opacity = "0";
            mainView.style.transform = "translate3d(0, 0, 0)";
            mainView.style.pointerEvents = "none";

            settingsView.style.display = "flex";
            settingsView.style.opacity = "1";
            settingsView.style.transform = "translate3d(0, 0, 0)";
            settingsView.style.pointerEvents = "auto";
            activeView = "settings";
            return;
        }

        settingsView.style.display = "none";
        settingsView.style.opacity = "0";
        settingsView.style.transform = "translate3d(0, 0, 0)";
        settingsView.style.pointerEvents = "none";

        mainView.style.display = "flex";
        mainView.style.opacity = "1";
        mainView.style.transform = "translate3d(0, 0, 0)";
        mainView.style.pointerEvents = "auto";
        activeView = "main";
    };

    const animateViewSwap = (fromView, toView, edge, onDone) => {
        if (!fromView || !toView) return;
        if (isViewSwitching) return;
        if (fromView === toView) return;
        isViewSwitching = true;
        if (viewSwitchTimer) {
            clearTimeout(viewSwitchTimer);
            viewSwitchTimer = null;
        }

        const outTransform = getViewTransform(edge);
        const inTransform = getViewTransform(getOppositeViewEdge(edge));

        toView.style.display = "flex";
        toView.style.zIndex = "2";
        fromView.style.zIndex = "1";

        toView.style.transition = "none";
        toView.style.transform = inTransform;
        toView.style.opacity = "0";
        toView.style.pointerEvents = "none";

        fromView.style.transition = "none";
        fromView.style.transform = "translate3d(0, 0, 0)";
        fromView.style.opacity = "1";
        fromView.style.pointerEvents = "auto";

        void toView.offsetHeight;

        toView.style.transition = "";
        fromView.style.transition = "";

        requestAnimationFrame(() => {
            fromView.style.transform = outTransform;
            fromView.style.opacity = "0";
            fromView.style.pointerEvents = "none";

            toView.style.transform = "translate3d(0, 0, 0)";
            toView.style.opacity = "1";
            toView.style.pointerEvents = "auto";
        });

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            if (viewSwitchTimer) {
                clearTimeout(viewSwitchTimer);
                viewSwitchTimer = null;
            }
            fromView.style.display = "none";
            fromView.style.zIndex = "";
            toView.style.zIndex = "";
            isViewSwitching = false;
            if (typeof onDone === "function") onDone();
        };
        const onEnd = (e) => {
            if (e.target !== toView) return;
            if (e.propertyName !== "transform") return;
            toView.removeEventListener("transitionend", onEnd);
            finish();
        };
        toView.addEventListener("transitionend", onEnd);
        viewSwitchTimer = setTimeout(finish, 320);
    };

    const combineTransform = (base, extra) => {
        const normalized = base && base !== "none" ? base.trim() : "";
        return normalized ? `${normalized} ${extra}` : extra;
    };

    const getPopupBaseTransform = () => {
        if (!popup) return "";
        return popup.dataset.baseTransform || popup.style.transform || "";
    };

    const setPopupBaseTransform = (value) => {
        if (!popup) return;
        popup.dataset.baseTransform = value || "";
    };

    const setPopupAnimating = (animating) => {
        isPopupAnimating = animating;
        if (popup) popup.style.pointerEvents = animating ? "none" : "auto";
        if (floatBall) floatBall.style.pointerEvents = animating ? "none" : "auto";
    };

    const isBasicAnimEnabled = () => GM_getValue("coolauxv_enable_basic_anim", DEFAULT_ENABLE_BASIC_ANIM);
    const isMinimizeAnimEnabled = () => (
        isBasicAnimEnabled() && GM_getValue("coolauxv_enable_minimize_anim", DEFAULT_ENABLE_MINIMIZE_ANIM)
    );

    const getAnimSpeedFactor = () => {
        const raw = GM_getValue("coolauxv_anim_speed", DEFAULT_ANIM_SPEED);
        const val = Number.parseFloat(raw);
        if (!Number.isFinite(val) || val <= 0) return DEFAULT_ANIM_SPEED;
        return Math.max(0.3, Math.min(3, val));
    };

    const resetPopupAnimStyles = (baseTransform) => {
        if (!popup) return;
        popup.style.transition = "";
        popup.style.opacity = "1";
        popup.style.borderRadius = "12px";
        popup.style.filter = "";
        popup.style.transformOrigin = "";
        popup.style.transform = baseTransform || "";
    };

    const measureFloatBallRect = () => {
        if (!floatBall) return null;
        const prevDisplay = floatBall.style.display;
        const prevOpacity = floatBall.style.opacity;
        if (prevDisplay === "none") {
            floatBall.style.display = "block";
            floatBall.style.opacity = "0";
        }
        const rect = floatBall.getBoundingClientRect();
        return { rect, restore: () => {
            floatBall.style.display = prevDisplay;
            floatBall.style.opacity = prevOpacity;
        }};
    };

    const animatePopupToFloatBall = (onDone) => {
        if (!popup || !floatBall || isPopupAnimating) return;
        const measured = measureFloatBallRect();
        if (!measured || !measured.rect.width || !measured.rect.height) {
            if (measured && measured.restore) measured.restore();
            if (typeof onDone === "function") onDone();
            return;
        }
        const ballRect = measured.rect;
        const popupRect = popup.getBoundingClientRect();
        const baseTransform = popup.style.transform || "";
        setPopupBaseTransform(baseTransform);

        const scale = Math.max(0.06, Math.min(0.25, Math.min(ballRect.width / popupRect.width, ballRect.height / popupRect.height)));
        const dx = (ballRect.left + ballRect.width / 2) - (popupRect.left + popupRect.width / 2);
        const dy = (ballRect.top + ballRect.height / 2) - (popupRect.top + popupRect.height / 2);
        const targetTransform = combineTransform(baseTransform, `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`);
        const speed = getAnimSpeedFactor();
        const durTransform = Math.round(320 / speed);
        const durOpacity = Math.round(220 / speed);
        const durRadius = Math.round(250 / speed);
        const durFilter = Math.round(250 / speed);

        setPopupAnimating(true);
        popup.style.transition = `transform ${durTransform}ms ${POPUP_ANIM_EASING}, opacity ${durOpacity}ms ${POPUP_ANIM_EASING}, border-radius ${durRadius}ms ${POPUP_ANIM_EASING}, filter ${durFilter}ms ${POPUP_ANIM_EASING}`;
        popup.style.transformOrigin = "center center";
        popup.style.opacity = "0.2";
        popup.style.borderRadius = "999px";
        popup.style.filter = "blur(2px)";
        popup.style.transform = targetTransform;

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            popup.style.display = "none";
            resetPopupAnimStyles(baseTransform);
            setPopupAnimating(false);
            if (measured && measured.restore) measured.restore();
            if (typeof onDone === "function") onDone();
        };
        const onEnd = (e) => {
            if (e.target !== popup || e.propertyName !== "transform") return;
            popup.removeEventListener("transitionend", onEnd);
            finish();
        };
        popup.addEventListener("transitionend", onEnd);
        setTimeout(finish, Math.max(durTransform, durOpacity, durRadius, durFilter) + 120);
    };

    const animatePopupFromFloatBall = (onDone) => {
        if (!popup || !floatBall || isPopupAnimating) return;
        const measured = measureFloatBallRect();
        if (!measured || !measured.rect.width || !measured.rect.height) {
            if (measured && measured.restore) measured.restore();
            if (typeof onDone === "function") onDone();
            return;
        }
        const ballRect = measured.rect;
        const baseTransform = popup.style.transform || "";
        setPopupBaseTransform(baseTransform);

        popup.style.display = "flex";
        popup.style.visibility = "hidden";
        const popupRect = popup.getBoundingClientRect();
        const scale = Math.max(0.06, Math.min(0.25, Math.min(ballRect.width / popupRect.width, ballRect.height / popupRect.height)));
        const dx = (ballRect.left + ballRect.width / 2) - (popupRect.left + popupRect.width / 2);
        const dy = (ballRect.top + ballRect.height / 2) - (popupRect.top + popupRect.height / 2);
        const startTransform = combineTransform(baseTransform, `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`);
        const speed = getAnimSpeedFactor();
        const durTransform = Math.round(320 / speed);
        const durOpacity = Math.round(220 / speed);
        const durRadius = Math.round(250 / speed);
        const durFilter = Math.round(250 / speed);

        setPopupAnimating(true);
        popup.style.transition = "none";
        popup.style.transformOrigin = "center center";
        popup.style.opacity = "0.2";
        popup.style.borderRadius = "999px";
        popup.style.filter = "blur(2px)";
        popup.style.transform = startTransform;
        popup.style.visibility = "visible";

        void popup.offsetHeight;

        popup.style.transition = `transform ${durTransform}ms ${POPUP_ANIM_EASING}, opacity ${durOpacity}ms ${POPUP_ANIM_EASING}, border-radius ${durRadius}ms ${POPUP_ANIM_EASING}, filter ${durFilter}ms ${POPUP_ANIM_EASING}`;
        popup.style.transform = baseTransform || "";
        popup.style.opacity = "1";
        popup.style.borderRadius = "12px";
        popup.style.filter = "";

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            popup.style.visibility = "";
            resetPopupAnimStyles(baseTransform);
            setPopupAnimating(false);
            if (measured && measured.restore) measured.restore();
            if (typeof onDone === "function") onDone();
        };
        const onEnd = (e) => {
            if (e.target !== popup || e.propertyName !== "transform") return;
            popup.removeEventListener("transitionend", onEnd);
            finish();
        };
        popup.addEventListener("transitionend", onEnd);
        setTimeout(finish, Math.max(durTransform, durOpacity, durRadius, durFilter) + 120);
    };

    const animatePopupFromBottom = (onDone) => {
        if (!popup || isPopupAnimating) return;
        const baseTransform = "translate(-50%, -50%)";
        setPopupBaseTransform(baseTransform);
        const speed = getAnimSpeedFactor();
        const durTransform = Math.round(380 / speed);
        const durOpacity = Math.round(280 / speed);

        setPopupAnimating(true);
        popup.style.display = "flex";
        popup.style.visibility = "hidden";
        popup.style.left = "50%";
        popup.style.top = "50%";
        popup.style.transform = baseTransform;
        const popupRect = popup.getBoundingClientRect();
        const dy = Math.max(0, window.innerHeight - popupRect.top + popupRect.height + 40);
        const startTransform = combineTransform(baseTransform, `translate3d(0, ${dy}px, 0)`);

        popup.style.transition = "none";
        popup.style.transformOrigin = "center center";
        popup.style.opacity = "0";
        popup.style.transform = startTransform;
        popup.style.visibility = "visible";

        void popup.offsetHeight;

        popup.style.transition = `transform ${durTransform}ms ${POPUP_ANIM_EASE_OUT}, opacity ${durOpacity}ms ${POPUP_ANIM_EASE_OUT}`;
        popup.style.transform = baseTransform;
        popup.style.opacity = "1";

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            popup.style.visibility = "";
            resetPopupAnimStyles(baseTransform);
            setPopupAnimating(false);
            if (typeof onDone === "function") onDone();
        };
        const onEnd = (e) => {
            if (e.target !== popup || e.propertyName !== "transform") return;
            popup.removeEventListener("transitionend", onEnd);
            finish();
        };
        popup.addEventListener("transitionend", onEnd);
        setTimeout(finish, Math.max(durTransform, durOpacity) + 140);
    };

    const animatePopupSlideOutDown = (onDone) => {
        if (!popup || isPopupAnimating) return;
        const popupRect = popup.getBoundingClientRect();
        const baseTransform = "translate3d(0, 0, 0)";
        setPopupBaseTransform(baseTransform);
        const speed = getAnimSpeedFactor();
        const durTransform = Math.round(360 / speed);
        const durOpacity = Math.round(200 / speed);

        const dy = Math.max(0, window.innerHeight - popupRect.top + popupRect.height + 40);
        const targetTransform = `translate3d(0, ${dy}px, 0)`;

        setPopupAnimating(true);
        popup.style.transition = "none";
        popup.style.transformOrigin = "center center";
        popup.style.left = `${popupRect.left}px`;
        popup.style.top = `${popupRect.top}px`;
        popup.style.transform = baseTransform;
        popup.style.opacity = "1";

        void popup.offsetHeight;

        popup.style.transition = `transform ${durTransform}ms ${POPUP_ANIM_EASE_IN}, opacity ${durOpacity}ms ${POPUP_ANIM_EASE_IN}`;
        popup.style.opacity = "0";
        popup.style.transform = targetTransform;

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            popup.style.display = "none";
            resetPopupAnimStyles(baseTransform);
            setPopupAnimating(false);
            if (typeof onDone === "function") onDone();
        };
        const onEnd = (e) => {
            if (e.target !== popup || e.propertyName !== "transform") return;
            popup.removeEventListener("transitionend", onEnd);
            finish();
        };
        popup.addEventListener("transitionend", onEnd);
        setTimeout(finish, Math.max(durTransform, durOpacity) + 80);
    };

    const animatePopupScaleOut = (onDone) => {
        if (!popup || isPopupAnimating) return;
        const baseTransform = getPopupBaseTransform();
        setPopupBaseTransform(baseTransform);
        const targetTransform = combineTransform(baseTransform, "scale(0.05)");
        const speed = getAnimSpeedFactor();
        const durTransform = Math.round(260 / speed);
        const durOpacity = Math.round(200 / speed);

        setPopupAnimating(true);
        popup.style.transition = `transform ${durTransform}ms ${POPUP_ANIM_EASE_IN}, opacity ${durOpacity}ms ${POPUP_ANIM_EASE_IN}`;
        popup.style.transformOrigin = "center center";
        popup.style.opacity = "0";
        popup.style.transform = targetTransform;

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            popup.style.display = "none";
            resetPopupAnimStyles(baseTransform);
            setPopupAnimating(false);
            if (typeof onDone === "function") onDone();
        };
        const onEnd = (e) => {
            if (e.target !== popup || e.propertyName !== "transform") return;
            popup.removeEventListener("transitionend", onEnd);
            finish();
        };
        popup.addEventListener("transitionend", onEnd);
        setTimeout(finish, Math.max(durTransform, durOpacity) + 80);
    };

    let abortController = null;
    let gmRequest = null;
    let streamTextBuffer = "";
    let streamReasoningBuffer = "";
    let hasReasoning = false;
    let streamMode = "single";
    let streamErrorHandled = false;
    let openaiStreamHasDelta = false;
    let openaiStreamHasFull = false;
    let chatPartsStreamHasDelta = false;
    let chatPartsStreamHasFull = false;
    let ignoreIncomingOutput = false;

    let historyRecords = [];
    let chatMessages = [];
    let chatHistoryRecords = [];
    let chatProvider = "";
    let chatSystemPrompt = "";
    let chatDisplayBuffer = "";
    let chatSessionStarted = false;
    let chatSessionId = "";
    let chatProviderRuntimeState = {};
    let chatCapturedImageBase64 = "";
    let chatImageStore = {};
    let chatImageCounter = 0;
    let chatAssistantBuffer = "";
    let chatPendingAssistantPrefix = "";
    let chatAssistantLabel = "";
    let chatEditingTurnId = "";
    let chatEditingRecordId = "";
    let chatEditingRole = "";
    let isChatCollapsed = true;
    let isTopSectionCollapsed = false;
    let updateChatCollapseUI = () => { };
    let updateTopSectionCollapseUI = () => { };
    let openChatHistoryManager = async () => { };
    let queueCurrentChatSessionToBackground = () => false;

    let streamThinkTagCarry = "";
    let streamThinkTagInReasoning = false;

    function normalizeProviderRuntimeFieldsGlobal(input) {
        const result = {};
        if (!input || typeof input !== "object") return result;
        Object.keys(input).forEach((rawKey) => {
            const key = normalizeTemplateKey(rawKey);
            if (!key) return;
            const value = input[rawKey];
            if (value === undefined || value === null) return;
            const normalized = String(value).trim();
            if (!normalized) return;
            result[key] = normalized;
        });
        return result;
    }

    function normalizeProviderRuntimeStateGlobal(input) {
        const result = {};
        if (!input || typeof input !== "object") return result;
        Object.keys(input).forEach((rawProviderId) => {
            const providerId = normalizeProviderId(rawProviderId);
            if (!providerId) return;
            const fields = normalizeProviderRuntimeFieldsGlobal(input[rawProviderId]);
            if (!Object.keys(fields).length) return;
            result[providerId] = fields;
        });
        return result;
    }

    function getProviderRuntimeFields(providerId) {
        const normalizedProviderId = normalizeProviderId(providerId || chatProvider || "");
        if (!normalizedProviderId) return {};
        const entry = chatProviderRuntimeState && chatProviderRuntimeState[normalizedProviderId];
        return entry && typeof entry === "object" ? entry : {};
    }

    function setProviderRuntimeFieldValue(providerId, fieldKey, value, options = {}) {
        const normalizedProviderId = normalizeProviderId(providerId || "");
        const normalizedFieldKey = normalizeTemplateKey(fieldKey || "");
        if (!normalizedProviderId || !normalizedFieldKey) return false;
        const normalizedValue = value === undefined || value === null ? "" : String(value).trim();
        if (!normalizedValue) return false;
        const nextState = normalizeProviderRuntimeStateGlobal(chatProviderRuntimeState);
        const currentFields = Object.assign({}, nextState[normalizedProviderId] || {});
        if (currentFields[normalizedFieldKey] === normalizedValue) return false;
        currentFields[normalizedFieldKey] = normalizedValue;
        nextState[normalizedProviderId] = currentFields;
        chatProviderRuntimeState = nextState;
        if (options && options.persistQueue) {
            queueCurrentChatSessionToBackground();
        }
        return true;
    }

    let lastRenderedText = "";
    let lastRenderedReasoning = "";
    let isRendering = false;

    let selectionTimer = null;
    let chatInlineNoticeTimer = null;
    let isWindowDragging = false;
    let isSplitterDragging = false;
    let activeActionToken = 0;
    let mermaidPreviewOverlay = null;
    let mermaidPreviewStage = null;
    let mermaidPreviewCloseTimer = 0;
    const mermaidPreviewState = {
        active: false,
        scale: 1,
        tx: 0,
        ty: 0,
        minScale: 0.15,
        maxScale: 10,
        dragging: false,
        startX: 0,
        startY: 0,
        originTx: 0,
        originTy: 0,
        moved: false,
        ignoreClick: false
    };

    const clampMermaidPreviewValue = (value, min, max) => Math.min(max, Math.max(min, value));

    const applyMermaidPreviewTransform = () => {
        if (!mermaidPreviewStage) return;
        mermaidPreviewStage.style.transform = `translate(${mermaidPreviewState.tx}px, ${mermaidPreviewState.ty}px) scale(${mermaidPreviewState.scale})`;
    };

    const syncMermaidPreviewAnimMode = () => {
        if (!mermaidPreviewOverlay) return;
        const useAnim = isMinimizeAnimEnabled();
        mermaidPreviewOverlay.classList.toggle("coolauxv-no-anim", !useAnim);
        return useAnim;
    };

    const finalizeMermaidPreviewClose = () => {
        if (!mermaidPreviewOverlay || !mermaidPreviewStage) return;
        mermaidPreviewOverlay.style.display = "none";
        mermaidPreviewOverlay.classList.remove("coolauxv-visible");
        mermaidPreviewOverlay.style.cursor = "grab";
        mermaidPreviewStage.innerHTML = "";
    };

    const closeMermaidPreview = () => {
        if (!mermaidPreviewOverlay || !mermaidPreviewStage) return;
        if (mermaidPreviewCloseTimer) {
            clearTimeout(mermaidPreviewCloseTimer);
            mermaidPreviewCloseTimer = 0;
        }
        mermaidPreviewState.active = false;
        mermaidPreviewState.dragging = false;
        mermaidPreviewState.moved = false;
        mermaidPreviewState.ignoreClick = false;
        const useAnim = syncMermaidPreviewAnimMode();
        if (!useAnim) {
            finalizeMermaidPreviewClose();
            return;
        }
        mermaidPreviewOverlay.classList.remove("coolauxv-visible");
        mermaidPreviewCloseTimer = window.setTimeout(() => {
            mermaidPreviewCloseTimer = 0;
            if (mermaidPreviewState.active) return;
            finalizeMermaidPreviewClose();
        }, 240);
    };

    const openMermaidPreview = (sourceSvg, suppressNextOverlayClick = false) => {
        if (!sourceSvg || !mermaidPreviewOverlay || !mermaidPreviewStage) return;
        if (mermaidPreviewCloseTimer) {
            clearTimeout(mermaidPreviewCloseTimer);
            mermaidPreviewCloseTimer = 0;
        }
        const clone = sourceSvg.cloneNode(true);
        clone.removeAttribute("style");
        clone.style.display = "block";
        clone.style.width = "auto";
        clone.style.height = "auto";
        clone.style.maxWidth = "none";
        clone.style.maxHeight = "none";
        clone.style.pointerEvents = "none";

        const sourceRect = sourceSvg.getBoundingClientRect();
        if (!clone.getAttribute("width") && sourceRect.width > 0) {
            clone.setAttribute("width", String(Math.round(sourceRect.width)));
        }
        if (!clone.getAttribute("height") && sourceRect.height > 0) {
            clone.setAttribute("height", String(Math.round(sourceRect.height)));
        }

        mermaidPreviewStage.innerHTML = "";
        mermaidPreviewStage.appendChild(clone);
        mermaidPreviewOverlay.style.display = "block";
        mermaidPreviewOverlay.classList.remove("coolauxv-visible");
        mermaidPreviewOverlay.style.cursor = "grab";
        mermaidPreviewState.active = true;
        mermaidPreviewState.dragging = false;
        mermaidPreviewState.moved = false;
        mermaidPreviewState.ignoreClick = !!suppressNextOverlayClick;
        const useAnim = syncMermaidPreviewAnimMode();
        if (useAnim) {
            requestAnimationFrame(() => {
                if (mermaidPreviewState.active) {
                    mermaidPreviewOverlay.classList.add("coolauxv-visible");
                }
            });
        } else {
            mermaidPreviewOverlay.classList.add("coolauxv-visible");
        }

        const overlayRect = mermaidPreviewOverlay.getBoundingClientRect();
        const cloneRect = clone.getBoundingClientRect();
        let svgWidth = cloneRect.width || sourceRect.width;
        let svgHeight = cloneRect.height || sourceRect.height;
        if ((!svgWidth || !svgHeight) && clone.viewBox && clone.viewBox.baseVal) {
            svgWidth = svgWidth || clone.viewBox.baseVal.width;
            svgHeight = svgHeight || clone.viewBox.baseVal.height;
        }
        if (!svgWidth || !svgHeight) {
            svgWidth = Math.max(overlayRect.width * 0.8, 320);
            svgHeight = Math.max(overlayRect.height * 0.8, 240);
        }

        const fitScale = Math.min((overlayRect.width * 0.92) / svgWidth, (overlayRect.height * 0.92) / svgHeight);
        mermaidPreviewState.scale = clampMermaidPreviewValue(Number.isFinite(fitScale) ? fitScale : 1, mermaidPreviewState.minScale, mermaidPreviewState.maxScale);
        mermaidPreviewState.tx = (overlayRect.width - svgWidth * mermaidPreviewState.scale) / 2;
        mermaidPreviewState.ty = (overlayRect.height - svgHeight * mermaidPreviewState.scale) / 2;
        applyMermaidPreviewTransform();
    };

    const initMermaidPreviewEvents = () => {
        if (!mermaidPreviewOverlay || !mermaidPreviewStage || mermaidPreviewOverlay.dataset.bound === "1") return;
        mermaidPreviewOverlay.dataset.bound = "1";

        const endDrag = () => {
            if (!mermaidPreviewState.dragging) return;
            mermaidPreviewState.dragging = false;
            mermaidPreviewOverlay.style.cursor = "grab";
            if (mermaidPreviewState.moved) {
                mermaidPreviewState.ignoreClick = true;
            }
        };

        mermaidPreviewOverlay.addEventListener("mousedown", (e) => {
            if (!mermaidPreviewState.active || e.button !== 0) return;
            mermaidPreviewState.dragging = true;
            mermaidPreviewState.moved = false;
            mermaidPreviewState.startX = e.clientX;
            mermaidPreviewState.startY = e.clientY;
            mermaidPreviewState.originTx = mermaidPreviewState.tx;
            mermaidPreviewState.originTy = mermaidPreviewState.ty;
            mermaidPreviewOverlay.style.cursor = "grabbing";
            e.preventDefault();
        });

        window.addEventListener("mousemove", (e) => {
            if (!mermaidPreviewState.active || !mermaidPreviewState.dragging) return;
            const dx = e.clientX - mermaidPreviewState.startX;
            const dy = e.clientY - mermaidPreviewState.startY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                mermaidPreviewState.moved = true;
            }
            mermaidPreviewState.tx = mermaidPreviewState.originTx + dx;
            mermaidPreviewState.ty = mermaidPreviewState.originTy + dy;
            applyMermaidPreviewTransform();
        });

        window.addEventListener("mouseup", endDrag);

        mermaidPreviewOverlay.addEventListener("wheel", (e) => {
            if (!mermaidPreviewState.active) return;
            e.preventDefault();
            const rect = mermaidPreviewOverlay.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const factor = Math.exp(-e.deltaY * 0.0015);
            const nextScale = clampMermaidPreviewValue(mermaidPreviewState.scale * factor, mermaidPreviewState.minScale, mermaidPreviewState.maxScale);
            if (Math.abs(nextScale - mermaidPreviewState.scale) < 0.0001) return;

            const worldX = (px - mermaidPreviewState.tx) / mermaidPreviewState.scale;
            const worldY = (py - mermaidPreviewState.ty) / mermaidPreviewState.scale;
            mermaidPreviewState.scale = nextScale;
            mermaidPreviewState.tx = px - worldX * nextScale;
            mermaidPreviewState.ty = py - worldY * nextScale;
            mermaidPreviewState.ignoreClick = true;
            applyMermaidPreviewTransform();
        }, { passive: false });

        mermaidPreviewOverlay.addEventListener("click", () => {
            if (!mermaidPreviewState.active) return;
            if (mermaidPreviewState.ignoreClick) {
                mermaidPreviewState.ignoreClick = false;
                return;
            }
            closeMermaidPreview();
        });

        window.addEventListener("keydown", (e) => {
            if (!mermaidPreviewState.active) return;
            if (e.key !== "Escape") return;
            e.preventDefault();
            closeMermaidPreview();
        });
    };

    const normalizeSelectionIconAction = (mode) => resolveActionTemplateId(mode, getActionTemplates());
    const getSelectionIconAction = () => normalizeSelectionIconAction(
        GM_getValue("coolauxv_selection_icon_action", DEFAULT_SELECTION_ICON_ACTION)
    );

    function initUI() {
        try {
            if (extensionDetected) {
                requestBridgeCleanup();
                return;
            }
            cursorBtn = document.createElement("div");
            cursorBtn.id = "coolauxv-translate-icon";
            cursorBtn.innerText = "译";
            Object.assign(cursorBtn.style, { display: "none", position: "absolute" });

            const onIconClick = (e) => {
                if (isQuitted || isPopupAnimating) return;
                e.preventDefault(); e.stopPropagation();

                // 每次点击浮窗图标（重新激活），清空截图和预览状态，回归文本模式
                capturedImageBase64 = "";
                const btnPreview = popup.querySelector("#coolauxv-btn-preview");
                setAnimatedVisibility(btnPreview, false);
                const btnMainClear = popup.querySelector("#coolauxv-btn-clear-shot");
                setAnimatedVisibility(btnMainClear, false);

                cursorBtn.style.display = "none";
                isIconDismissed = true;
                lastSelectionText = currentSelection;

                const input = popup.querySelector("#coolauxv-input");
                if (input && currentSelection) {
                    input.value = currentSelection;
                }

                if (popup.style.display !== "flex") {
                    floatBall.style.display = "none";
                    resetPopupState();
                    const enableMinAnim = isMinimizeAnimEnabled();
                    if (enableMinAnim) {
                        animatePopupFromBottom(() => {
                            checkUpdateAndShowChangelog();
                        });
                    } else {
                        popup.style.display = "flex";
                        checkUpdateAndShowChangelog();
                    }
                }

                resetMainViewLayoutBySettings();

                // 点击图标按设置执行默认操作（翻译/解读）
                doAction(getSelectionIconAction());
            };
            cursorBtn.addEventListener("touchend", onIconClick);
            cursorBtn.onclick = onIconClick;
            document.body.appendChild(cursorBtn);

            floatBall = document.createElement("div");
            floatBall.innerText = "智";
            Object.assign(floatBall.style, {
                display: "none", position: "fixed", bottom: "100px", right: "20px",
                width: "50px", height: "50px", background: "linear-gradient(135deg, #a516e8, #6610f2)",
                color: "white", borderRadius: "50%", textAlign: "center", lineHeight: "50px",
                zIndex: "2147483647", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.4)",
                fontWeight: "bold", fontSize: "18px",
                userSelect: "none", webkitUserSelect: "none", touchAction: "none" // touchAction 防止移动端滚动
            });
            // 状态变量
            let isBallDraggable = GM_getValue("coolauxv_draggable_ball", false);
            let isBallDragging = false;
            let ballHasMoved = false; // 用于区分点击和拖拽
            let ballStartX, ballStartY, ballInitLeft, ballInitTop;
            let lastTouchActivateTs = 0;
            const onBallActivate = (e) => {
                if (ballHasMoved) return; // 如果是拖拽操作，不触发点击
                if (isQuitted) return;
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }

                // 恢复默认操作
                resetPopupState();
                setViewImmediate("main");
                const enableMinAnim = isMinimizeAnimEnabled();
                if (enableMinAnim) {
                    animatePopupFromFloatBall(() => {
                        floatBall.style.display = "none";
                        checkUpdateAndShowChangelog();
                    });
                } else {
                    popup.style.display = "flex";
                    floatBall.style.display = "none";
                    checkUpdateAndShowChangelog();
                }
            };
            // 1. 点击事件（增加防误触判断）
            floatBall.onclick = (e) => {
                if (Date.now() - lastTouchActivateTs < 500) return; // 避免触屏触发 click 双击
                onBallActivate(e);
            };
            floatBall.addEventListener("touchend", (e) => {
                lastTouchActivateTs = Date.now();
                onBallActivate(e);
            });
            // 2. 拖拽事件处理函数
            const onBallDown = (e) => {
                ballHasMoved = false;
                // 如果未开启拖拽功能，直接返回
                const canDrag = GM_getValue("coolauxv_draggable_ball", false);
                if (!canDrag) return;

                isBallDragging = true;
                ballHasMoved = false;

                // 兼容鼠标和触摸
                const clientX = e.clientX || e.touches[0].clientX;
                const clientY = e.clientY || e.touches[0].clientY;

                const rect = floatBall.getBoundingClientRect();

                // 关键：开始拖拽时，将定位从 bottom/right 切换为 left/top，防止坐标跳变
                floatBall.style.bottom = 'auto';
                floatBall.style.right = 'auto';
                floatBall.style.left = rect.left + 'px';
                floatBall.style.top = rect.top + 'px';

                ballStartX = clientX;
                ballStartY = clientY;
                ballInitLeft = rect.left;
                ballInitTop = rect.top;

                e.preventDefault(); // 防止选中文本
            };

            const onBallMove = (e) => {
                if (!isBallDragging) return;

                const clientX = e.clientX || e.touches[0].clientX;
                const clientY = e.clientY || e.touches[0].clientY;

                const dx = clientX - ballStartX;
                const dy = clientY - ballStartY;

                // 只有移动距离超过 2px 才视为拖拽（防止手抖）
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                    ballHasMoved = true;
                }

                floatBall.style.left = (ballInitLeft + dx) + 'px';
                floatBall.style.top = (ballInitTop + dy) + 'px';

                e.preventDefault();
            };

            const onBallUp = () => {
                isBallDragging = false;
            };

            // 3. 绑定监听
            floatBall.addEventListener("mousedown", onBallDown);
            floatBall.addEventListener("touchstart", onBallDown, { passive: false });

            // 绑定到 document 以防止拖出球体范围失效
            document.addEventListener("mousemove", onBallMove);
            document.addEventListener("touchmove", onBallMove, { passive: false });
            document.addEventListener("mouseup", onBallUp);
            document.addEventListener("touchend", onBallUp);

            document.body.appendChild(floatBall);

            // 如果开启了悬浮球常驻，且主窗口未显示（初始化时肯定未显示），则显示悬浮球
            if (GM_getValue("coolauxv_persistent_ball", false)) {
                floatBall.style.display = "block";
            }

            popup = document.createElement("div");
            popup.id = "coolauxv-translate-popup";
            if (GM_getValue("coolauxv_enable_blur_glass", DEFAULT_ENABLE_BLUR_GLASS)) {
                popup.classList.add("coolauxv-blur-glass-enabled");
            }
            if (!isBasicAnimEnabled()) {
                popup.classList.add("coolauxv-basic-anim-off");
            }
            Object.assign(popup.style, {
                display: "none", flexDirection: "column", position: "fixed",
                zIndex: "2147483646",
                background: "white", boxShadow: "0 0 50px rgba(0,0,0,0.5)",
                borderRadius: "12px", border: "1px solid #e0e0e0", overflow: "hidden"
            });
            resetPopupState();

            const currentLogLevel = GM_getValue("coolauxv_log_level", DEFAULT_LOG_LEVEL);
            const logRadioHTML = LOG_PRESETS.map(level => {
                const isChecked = level === currentLogLevel ? "checked" : "";
                return `
                    <label class="coolauxv-radio-label">
                        <input type="radio" name="coolauxv_log_level_radio" value="${level}" ${isChecked}>
                        <span class="coolauxv-radio-text">${level}</span>
                    </label>
                `;
            }).join("");

            popup.innerHTML = `
            <div id="coolauxv-header" style="background:#f8f9fa; padding:10px 12px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; user-select:none; flex-shrink:0; cursor: move; flex-wrap:wrap; gap:5px;">
              <div id="coolauxv-header-left">
                <span style="font-weight:800; color:#a516e8; margin-right:10px;">⚡ CoolAuxv</span>

                <span id="coolauxv-settings-btn" class="coolauxv-ctrl-btn" title="设置" style="font-size:16px;">
                    <span class="coolauxv-settings-icon-track">
                        <span class="coolauxv-settings-icon coolauxv-settings-icon-current">⚙️</span>
                        <span class="coolauxv-settings-icon coolauxv-settings-icon-next"></span>
                    </span>
                </span>

                <div id="coolauxv-header-main-controls">
                    <button type="button" id="coolauxv-top-collapse-btn" data-no-drag="true" title="展开/收起顶部区域">收起</button>
                    <label class="coolauxv-toggle-label" title="显示原文" style="margin-left:8px;">
                        <input type="checkbox" id="coolauxv-raw-toggle" ${DEFAULT_SHOW_RAW ? "checked" : ""}>原文
                    </label>
                    <label class="coolauxv-toggle-label" id="coolauxv-reasoning-toggle-container" style="display:none;" title="显示推理">
                        <input type="checkbox" id="coolauxv-reasoning-toggle" ${DEFAULT_SHOW_REASONING ? "checked" : ""}>显示推理
                    </label>
                </div>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                <span id="coolauxv-quit" class="coolauxv-ctrl-btn" title="退出">⏻</span>
                <span id="coolauxv-min" class="coolauxv-ctrl-btn" title="最小化">－</span>
                <span id="coolauxv-close" class="coolauxv-ctrl-btn" title="关闭">×</span>
              </div>
            </div>

            <div id="coolauxv-view-stage">
            <!-- 主界面 -->
            <div id="coolauxv-main-view">
                <div style="padding:15px; flex:1; display:flex; flex-direction:column; overflow:hidden;">

                  <div id="coolauxv-main-top-section">
                  <div style="position:relative; width:100%; margin-bottom:10px; flex-shrink:0;">
                      <textarea id="coolauxv-input" placeholder="输入内容..." style="width:100%; height:70px; border:1px solid #ddd; border-radius:8px; padding:8px 24px 8px 8px; box-sizing:border-box; font-size:14px; resize:none; font-family:inherit;"></textarea>
                      <div style="position:absolute; right:2px; top:0; bottom:0; display:flex; flex-direction:column; justify-content:center; gap:4px;">
                          <span id="coolauxv-btn-input-clear" class="coolauxv-input-ctrl-btn" title="清空">✕</span>
                          <span id="coolauxv-btn-input-paste" class="coolauxv-input-ctrl-btn" title="粘贴">📋</span>
                      </div>
                  </div>

                  <div style="display:flex; gap:10px; margin-bottom:10px; flex-shrink:0;">
                      <div id="coolauxv-main-action-buttons" style="display:flex; gap:10px; min-width:0;"></div>

                      <button id="coolauxv-btn-stop" class="coolauxv-action-btn coolauxv-animated-visibility" style="display:none; flex:0.6; background:#fee2e2; color:#b91c1c; border-color:#fecaca;" title="打断当前输出">⏹ 停止</button>

                      <button id="coolauxv-btn-image-file" class="coolauxv-action-btn coolauxv-btn-blue" style="flex:0.45; white-space:nowrap;" title="选择本地图片">🖼 本地</button>

                      <!-- 识屏按钮：蓝色风格 -->
                      <button id="coolauxv-btn-screenshot" class="coolauxv-action-btn coolauxv-btn-blue" style="flex:0.4; white-space:nowrap;" title="截取屏幕并分析">📷 识屏</button>

                      <!-- 预览按钮：默认风格 -->
                      <button id="coolauxv-btn-preview" class="coolauxv-action-btn coolauxv-animated-visibility" style="display:none; font-size:14px;" title="预览截图">🔍</button>
                      <button id="coolauxv-btn-clear-shot" class="coolauxv-action-btn coolauxv-animated-visibility" style="display:none; font-size:14px;" title="清除识屏">🗑</button>
                  </div>
                  <input type="file" id="coolauxv-input-image-file" accept="image/*" style="display:none;">
                  </div>

                  <div id="coolauxv-content-container">
                      <div id="coolauxv-reasoning-wrapper" class="coolauxv-box-wrapper">
                          <span class="coolauxv-copy-btn" data-type="reasoning" title="复制思考过程">📋</span>
                          <div id="coolauxv-reasoning-box" class="coolauxv-scroll-box"></div>
                      </div>

                      <div id="coolauxv-separator" title="拖动调整高度"></div>

                      <div id="coolauxv-result-wrapper" class="coolauxv-box-wrapper" style="flex:1;">
                          <span id="coolauxv-clear-result" class="coolauxv-copy-btn coolauxv-clear-btn" title="清空输出">🧹</span>
                          <span class="coolauxv-copy-btn" data-type="result" title="复制结果">📋</span>
                          <button id="coolauxv-btn-scroll-bottom" class="coolauxv-action-btn coolauxv-animated-visibility" style="display:none;" aria-label="回到底部">
                              <span class="coolauxv-scroll-bottom-icon">↓</span>
                              <span class="coolauxv-scroll-bottom-text">回到底部</span>
                          </button>
                          <div id="coolauxv-result" class="coolauxv-scroll-box"></div>
                      </div>
                  </div>

                  <div id="coolauxv-chat-bar">
                      <div id="coolauxv-chat-header">
                          <span>连续对话</span>
                          <div id="coolauxv-chat-header-actions">
                              <button type="button" id="coolauxv-chat-history-btn" title="导入或导出聊天记录">聊天记录</button>
                              <button type="button" id="coolauxv-chat-toggle">收起</button>
                          </div>
                      </div>
                      <div id="coolauxv-chat-body">
                          <textarea id="coolauxv-chat-input" placeholder="连续对话输入..."></textarea>
                          <div id="coolauxv-chat-actions">
                              <button id="coolauxv-btn-chat-image-file" class="coolauxv-action-btn coolauxv-btn-blue" style="flex:0.45; white-space:nowrap;" title="选择本地图片">🖼 本地</button>
                              <button id="coolauxv-btn-screenshot-chat" class="coolauxv-action-btn coolauxv-btn-blue" style="flex:0.4; white-space:nowrap;" title="截取屏幕并分析">📷 识屏</button>
                              <button id="coolauxv-btn-preview-chat" class="coolauxv-action-btn coolauxv-animated-visibility" style="display:none; font-size:14px;" title="预览截图">🔍</button>
                              <button id="coolauxv-btn-clear-chat-shot" class="coolauxv-action-btn coolauxv-animated-visibility" style="display:none; font-size:14px;" title="清除识屏">🗑</button>
                              <button id="coolauxv-btn-chat-stop" class="coolauxv-action-btn coolauxv-animated-visibility" style="display:none; flex:0.5; background:#fee2e2; color:#b91c1c; border-color:#fecaca;" title="打断当前输出">⏹ 停止</button>
                              <button id="coolauxv-btn-chat-edit-cancel" class="coolauxv-action-btn coolauxv-animated-visibility" style="display:none; flex:0.5;" title="退出编辑模式">取消编辑</button>
                              <button id="coolauxv-btn-chat-send" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">发送</button>
                          </div>
                          <input type="file" id="coolauxv-input-chat-image-file" accept="image/*" style="display:none;">
                      </div>
                  </div>
                </div>
            </div>

            <!-- 设置界面 -->
            <div id="coolauxv-settings-view">
                <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">
                    <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                        <span>⚙️ 配置设置</span>
                        <span style="font-size:12px; color:#999; font-weight:normal;">版本 ${getScriptVersion() || "未知"}</span>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                        <a href="https://github.com/CoolestEnoch/CoolAuxv" target="_blank" class="coolauxv-github-btn" title="查看源码与文档">
                            <svg height="16" width="16" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
                            CoolAuxv (GitHub)
                        </a>
                        <a href="https://github.com/CoolestEnoch/CoolAuxv/raw/refs/heads/main/coolauxv.user.js" class="coolauxv-github-btn" title="检查更新">检查更新</a>
                        <a href="https://github.com/CoolestEnoch/CoolAuxv/commits/main" target="_blank" class="coolauxv-github-btn" title="查看历史版本更新日志">更新日志</a>
                    </div>
                </h3>

                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">
                        默认大模型提供商
                        <div style="margin-left:auto; display:flex; gap:6px; align-items:center;">
                            <span id="coolauxv-btn-provider-add" class="coolauxv-link-btn" style="cursor:pointer; user-select:none;">➕ 添加</span>
                            <span id="coolauxv-btn-provider-batch" class="coolauxv-link-btn coolauxv-batch-toggle-btn" style="cursor:pointer; user-select:none;">
                                <span class="coolauxv-batch-toggle-icon" aria-hidden="true">🧩</span>
                                <span data-batch-toggle-text>批量</span>
                            </span>
                            <span id="coolauxv-btn-toggle-provider-all" class="coolauxv-link-btn" style="cursor:pointer; user-select:none;">展开全部</span>
                        </div>
                    </label>
                    <div id="coolauxv-provider-radio-group" class="coolauxv-radio-group"></div>
                </div>

                <div id="coolauxv-provider-sections"></div>

                <div class="coolauxv-setting-group">
                    <div id="coolauxv-provider-batch-actions" class="coolauxv-batch-actions">
                        <button id="coolauxv-btn-provider-share" class="coolauxv-action-btn">🔗 分享</button>
                        <button id="coolauxv-btn-provider-batch-delete" class="coolauxv-action-btn" style="background:#ffe4e6; color:#b91c1c; border-color:#fecdd3;">🗑 删除</button>
                    </div>
                    <label class="coolauxv-setting-label">模型提供商</label>
                    <select id="coolauxv-cfg-model-provider" style="padding:4px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px; background:#fff;"></select>
                </div>

                <div id="coolauxv-model-sections"></div>

                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">
                        主界面按钮模块
                        <div style="margin-left:auto; display:flex; gap:6px; align-items:center;">
                            <span id="coolauxv-btn-action-add" class="coolauxv-link-btn" style="cursor:pointer; user-select:none;">➕ 添加</span>
                            <span id="coolauxv-btn-action-reset" class="coolauxv-link-btn" style="cursor:pointer; user-select:none;">♻️ 重置</span>
                            <span id="coolauxv-btn-action-batch" class="coolauxv-link-btn coolauxv-batch-toggle-btn" style="cursor:pointer; user-select:none;">
                                <span class="coolauxv-batch-toggle-icon" aria-hidden="true">🧩</span>
                                <span data-batch-toggle-text>批量</span>
                            </span>
                            <span id="coolauxv-btn-toggle-action-all" class="coolauxv-link-btn" style="cursor:pointer; user-select:none;">展开全部</span>
                        </div>
                    </label>
                </div>
                <div id="coolauxv-action-sections"></div>

                <div class="coolauxv-setting-group">
                    <div id="coolauxv-action-batch-actions" class="coolauxv-batch-actions coolauxv-action-batch-actions">
                        <button id="coolauxv-btn-action-share" class="coolauxv-action-btn">🔗 分享</button>
                        <button id="coolauxv-btn-action-batch-delete" class="coolauxv-action-btn" style="background:#ffe4e6; color:#b91c1c; border-color:#fecdd3;">🗑 删除</button>
                    </div>
                </div>

                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">窗口初始大小 (Width / Height)</label>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="coolauxv-cfg-width" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="默认: ${DEFAULT_WIN_WIDTH}">
                        <input type="text" id="coolauxv-cfg-height" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="默认: ${DEFAULT_WIN_HEIGHT}">
                    </div>
                    <div style="font-size:11px; color:#999; margin-top:4px;">支持 px, vw, fit-content 等。例如: 450px</div>
                </div>

                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">日志等级 (Log Level)</label>
                    <div class="coolauxv-radio-group">
                        ${logRadioHTML}
                    </div>
                </div>

                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">PDF 阅读工具 (PDF.js Onilne)</label>
                    <div class="coolauxv-input-wrapper">
                        <input type="text" id="coolauxv-pdf-url" class="coolauxv-setting-input" placeholder="输入在线 PDF 链接...">
                        <span class="coolauxv-clear-icon" id="coolauxv-btn-clear-pdf">×</span>
                    </div>
                    <div style="display:flex; gap:10px; margin-top:8px;">
                        <!-- 在线链接按钮：默认风格 -->
                        <button id="coolauxv-btn-pdf-link" class="coolauxv-action-btn" style="flex:1;">🌐 打开网络链接</button>

                        <!-- 本地加载按钮：主色调风格 (浅蓝) -->
                        <button id="coolauxv-btn-pdf-local-online" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">🚀 在线加载本地文件</button>

                        <input type="file" id="coolauxv-input-pdf-file" accept=".pdf" style="display:none;">
                    </div>

                    <div style="font-size:11px; color:#999; margin-top:4px;">提示：本地文件将通过内存传输至 Mozilla 在线阅读器渲染，不消耗流量。</div>
                </div>


                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">杂项 (Miscellaneous)</label>
                    <div class="coolauxv-settings-inline-wrap">
                        <div class="coolauxv-settings-item">
                            <label class="coolauxv-toggle-label">
                                <input type="checkbox" id="coolauxv-cfg-blur-glass"> 流体玻璃 (Blur Glass)
                            </label>
                        </div>
                        <div class="coolauxv-settings-item">
                            <label class="coolauxv-toggle-label">
                                <input type="checkbox" id="coolauxv-cfg-persistent-ball"> 悬浮球常驻
                            </label>
                        </div>
                        <div class="coolauxv-settings-item">
                            <label class="coolauxv-toggle-label">
                                <input type="checkbox" id="coolauxv-cfg-draggable-ball"> 悬浮球可拖动
                            </label>
                        </div>
                        <div class="coolauxv-settings-item">
                            <label class="coolauxv-toggle-label">
                                <input type="checkbox" id="coolauxv-cfg-basic-anim"> 基础动画
                            </label>
                        </div>
                        <div class="coolauxv-settings-item">
                            <label class="coolauxv-toggle-label">
                                <input type="checkbox" id="coolauxv-cfg-minimize-anim"> 高级动画
                            </label>
                        </div>
                        <div class="coolauxv-settings-item">
                            <label class="coolauxv-toggle-label">
                                动画速度
                                <input type="number" id="coolauxv-cfg-anim-speed" min="0.3" max="3" step="0.1" style="width:70px; margin-left:6px;">
                            </label>
                        </div>
                    </div>
                </div>

                <!-- 实验性功能 Group -->
                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label" style="color:#e65100;">🧪 实验性功能 (Experimental)</label>

                    <div class="coolauxv-settings-inline-wrap">
                        <div class="coolauxv-settings-item coolauxv-settings-item-wide">
                            <div class="coolauxv-settings-item-head">
                                <span style="font-size:13px; color:#555;">截屏算法版本</span>
                                <select id="coolauxv-cfg-new-screenshot" style="padding:4px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px; background:#fff;">
                                    <option value="v1">v1 (默认 - 旧算法)</option>
                                    <option value="v2">v2 (html2canvas 全屏)</option>
                                    <option value="v3">v3 (原生接口 - 屏幕共享)</option>
                                </select>
                            </div>
                            <div class="coolauxv-settings-item-hint">v1: 兼容性最好; v2: 修复错位; v3: 更通用，但Android可能不能用</div>
                        </div>
                        <div class="coolauxv-settings-item coolauxv-settings-item-wide">
                            <div class="coolauxv-settings-item-head">
                                <span style="font-size:13px; color:#555;">“译”悬浮球默认操作</span>
                            </div>
                            <div id="coolauxv-selection-action-radio-group" class="coolauxv-radio-group" style="margin-top:0;"></div>
                            <div class="coolauxv-settings-item-hint">点击“译”悬浮球时默认触发对应按钮事件</div>
                        </div>
                        <div class="coolauxv-settings-item">
                            <label class="coolauxv-toggle-label">
                                <input type="checkbox" id="coolauxv-cfg-continuous-chat"> 连续对话
                            </label>
                            <div class="coolauxv-settings-item-hint">启用后显示连续对话输入区</div>
                        </div>
                        <div id="coolauxv-continuous-chat-prompt-section" class="coolauxv-collapse-section coolauxv-settings-item-wrap-wide">
                            <div class="coolauxv-settings-item coolauxv-settings-item-wide">
                                <div class="coolauxv-settings-item-head">
                                    <span style="font-size:13px; color:#555;">连续对话提示词</span>
                                    <label class="coolauxv-toggle-label" style="font-size:12px; gap:4px;">
                                        <input type="checkbox" id="coolauxv-cfg-append-chat"> 追加
                                    </label>
                                </div>
                                <textarea id="coolauxv-cfg-prompt-chat" class="coolauxv-setting-input coolauxv-resizable-input" rows="3" placeholder="${DEFAULT_PROMPT_CONTINUOUS_CHAT}"></textarea>
                                <div class="coolauxv-settings-item-hint">勾选“追加”时会把输入内容追加到默认提示词后面；未勾选时将直接替代默认提示词。</div>
                            </div>
                        </div>
                        <div class="coolauxv-settings-item">
                            <label class="coolauxv-toggle-label">
                                <input type="checkbox" id="coolauxv-cfg-chat-history-persist"> 聊天记录持久化
                            </label>
                            <div class="coolauxv-settings-item-hint">连续对话过程中实时入后台队列；开启后支持跨标签页同步</div>
                            <div style="margin-top:4px;">
                                <button type="button" id="coolauxv-btn-clear-chat-persist" class="coolauxv-link-btn" style="border-color:#fecaca; color:#b91c1c; background:#fff1f2;">🧹 清空持久化聊天记录</button>
                                <button type="button" id="coolauxv-btn-manage-chat-persist" class="coolauxv-link-btn">💬 聊天记录管理</button>
                            </div>
                        </div>
                        <div class="coolauxv-settings-item">
                            <label class="coolauxv-toggle-label">
                                <input type="checkbox" id="coolauxv-cfg-chat-enter-send"> 回车键发送消息
                            </label>
                            <div class="coolauxv-settings-item-hint">开启后 Enter 发送，Shift+Enter 换行</div>
                        </div>
                    </div>
                </div>


                <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
                    <button id="coolauxv-cfg-export" class="coolauxv-action-btn" style="flex:1;">⬇️ 导出配置</button>
                    <button id="coolauxv-cfg-import" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">⬆️ 恢复配置</button>
                </div>

                <div class="coolauxv-reset-btn" id="coolauxv-cfg-reset">⚠️ 重置所有配置</div>
            </div>

            </div>

            <div id="coolauxv-resize-handle"><svg id="coolauxv-resize-icon" viewBox="0 0 10 10"><path d="M10 10 L10 2 L2 10 Z" /></svg></div>
            `;
            document.body.appendChild(popup);
            setViewImmediate("main");

            // 截图加载提示
            const loadingToast = document.createElement("div");
            loadingToast.id = "coolauxv-loading-toast";
            if (GM_getValue("coolauxv_enable_blur_glass", DEFAULT_ENABLE_BLUR_GLASS)) {
                loadingToast.classList.add("coolauxv-blur-glass-style");
            }
            loadingToast.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                    <div class="coolauxv-pulse" style="font-size:24px;">📸</div>
                    <div>正在初始化识屏...</div>
                    <div style="font-size:11px; opacity:0.8;">加载截图中，请耐心等待</div>
                </div>
            `;
            document.body.appendChild(loadingToast);

            // 截图层
            const screenshotLayer = document.createElement("div");
            screenshotLayer.innerHTML = `
                <div id="coolauxv-screenshot-overlay">
                    <div id="coolauxv-selection-box"></div>
                    <div id="coolauxv-screenshot-toolbar">
                        <button id="coolauxv-shot-ok" class="coolauxv-shot-btn">确定</button>
                        <button id="coolauxv-shot-cancel" class="coolauxv-shot-btn">取消</button>
                    </div>
                </div>
            `;
            document.body.appendChild(screenshotLayer);

            // 预览层
            const previewLayer = document.createElement("div");
            previewLayer.id = "coolauxv-img-preview-overlay";
            previewLayer.innerHTML = `<img id="coolauxv-img-preview-el" src="">`;
            previewLayer.onclick = () => { previewLayer.style.display = "none"; };
            document.body.appendChild(previewLayer);

            const mermaidPreviewLayer = document.createElement("div");
            mermaidPreviewLayer.id = "coolauxv-mermaid-preview-overlay";
            mermaidPreviewLayer.innerHTML = `<div id="coolauxv-mermaid-preview-stage"></div>`;
            document.body.appendChild(mermaidPreviewLayer);
            mermaidPreviewOverlay = mermaidPreviewLayer;
            mermaidPreviewStage = mermaidPreviewLayer.querySelector("#coolauxv-mermaid-preview-stage");
            initMermaidPreviewEvents();

            setTimeout(() => {
                bindEvents();
                bindInputCtrlEvents();
                bindCopyEvents();
                initSettingsLogic();
                initDragAndResize();
                initSplitter();
                initScreenshotEvents();

                // 绑定预览按钮事件
                const btnPreview = popup.querySelector("#coolauxv-btn-preview");
                const btnMainClear = popup.querySelector("#coolauxv-btn-clear-shot");
                const btnChatPreview = popup.querySelector("#coolauxv-btn-preview-chat");
                const btnChatClear = popup.querySelector("#coolauxv-btn-clear-chat-shot");
                const previewOverlay = document.querySelector("#coolauxv-img-preview-overlay");
                const previewImg = document.querySelector("#coolauxv-img-preview-el");
                if (btnPreview && previewOverlay && previewImg) {
                    btnPreview.onclick = () => {
                        if (capturedImageBase64) {
                            previewImg.src = capturedImageBase64;
                            previewOverlay.style.display = "flex";
                        }
                    };
                }
                if (btnMainClear) {
                    btnMainClear.onclick = () => {
                        capturedImageBase64 = "";
                        setAnimatedVisibility(btnPreview, false);
                        setAnimatedVisibility(btnMainClear, false);
                    };
                }
                if (btnChatPreview && previewOverlay && previewImg) {
                    btnChatPreview.onclick = () => {
                        if (chatCapturedImageBase64) {
                            previewImg.src = chatCapturedImageBase64;
                            previewOverlay.style.display = "flex";
                        }
                    };
                }
                if (btnChatClear) {
                    btnChatClear.onclick = () => {
                        chatCapturedImageBase64 = "";
                        setAnimatedVisibility(btnChatPreview, false);
                        setAnimatedVisibility(btnChatClear, false);
                    };
                }
            }, 0);

        } catch (e) {
            Logger.error("初始化失败:", e);
        }
    }

    // --- 3. 设置逻辑 ---
    function initSettingsLogic() {
        const mainView = popup.querySelector("#coolauxv-main-view");
        const settingsView = popup.querySelector("#coolauxv-settings-view");
        const settingsBtn = popup.querySelector("#coolauxv-settings-btn");
        const resetBtn = popup.querySelector("#coolauxv-cfg-reset");
        const exportBtn = popup.querySelector("#coolauxv-cfg-export");
        const importBtn = popup.querySelector("#coolauxv-cfg-import");

        if (!mainView || !settingsView) return;

        // --- 切换逻辑核心 ---
        if (settingsBtn) {
            settingsBtn.onclick = () => {
                if (isViewSwitching) return;
                const showSettings = activeView !== "settings";
                const targetView = showSettings ? "settings" : "main";
                setHeaderMainControlsVisibility(!showSettings);
                const edge = getRandomViewEdge();
                const enableAnim = isMinimizeAnimEnabled();
                if (enableAnim) {
                    animateSettingsBtnIcon(targetView, getRandomViewEdge());
                } else {
                    applySettingsBtnIcon(targetView);
                }
                if (showSettings) {
                    loadConfig(); // 进入设置时重新加载配置，确保显示最新值
                    if (enableAnim) {
                        animateViewSwap(mainView, settingsView, edge, () => {
                            activeView = "settings";
                        });
                    } else {
                        setViewImmediate("settings");
                    }
                } else {
                    if (enableAnim) {
                        animateViewSwap(settingsView, mainView, edge, () => {
                            activeView = "main";
                        });
                    } else {
                        setViewImmediate("main");
                    }
                }
            };
        }

        // --- 通用的配置加载与保存逻辑 ---
        const clearableInputs = [
            "coolauxv-cfg-width",
            "coolauxv-cfg-height",
            "coolauxv-pdf-url"
        ];
        const attachClearButton = (input) => {
            if (!input) return;
            let wrapper = input.parentNode;
            if (!wrapper || !wrapper.classList.contains("coolauxv-input-wrapper")) {
                wrapper = document.createElement("div");
                wrapper.className = "coolauxv-input-wrapper";
                input.parentNode.insertBefore(wrapper, input);
                wrapper.appendChild(input);
            }

            let clearBtn = wrapper.querySelector(".coolauxv-clear-icon");
            if (!clearBtn) {
                clearBtn = document.createElement("span");
                clearBtn.className = "coolauxv-clear-icon";
                clearBtn.innerText = "×";
                clearBtn.title = "清空配置";
                wrapper.appendChild(clearBtn);
            }

            const syncClearBtn = () => {
                wrapper.classList.toggle("coolauxv-has-value", !!input.value);
            };
            input._coolauxvSyncClear = syncClearBtn;

            clearBtn.onclick = () => {
                input.value = "";
                input.dispatchEvent(new Event('input'));
                input.focus();
                syncClearBtn();
            };

            input.addEventListener("input", syncClearBtn);
            input.addEventListener("change", syncClearBtn);
            syncClearBtn();
        };

        clearableInputs.forEach(id => attachClearButton(popup.querySelector(`#${id}`)));
        const syncAllClearButtons = () => {
            clearableInputs.forEach((id) => {
                const input = popup.querySelector(`#${id}`);
                if (input && typeof input._coolauxvSyncClear === "function") {
                    input._coolauxvSyncClear();
                }
            });
        };

        const settingsRoot = popup.querySelector("#coolauxv-settings-view");
        const providerRadioGroup = popup.querySelector("#coolauxv-provider-radio-group");
        const providerSectionsContainer = popup.querySelector("#coolauxv-provider-sections");
        const modelSectionsContainer = popup.querySelector("#coolauxv-model-sections");
        const inputModelProvider = popup.querySelector("#coolauxv-cfg-model-provider");
        const btnToggleProviderAll = popup.querySelector("#coolauxv-btn-toggle-provider-all");
        const btnProviderAdd = popup.querySelector("#coolauxv-btn-provider-add");
        const btnProviderBatch = popup.querySelector("#coolauxv-btn-provider-batch");
        const btnProviderShare = popup.querySelector("#coolauxv-btn-provider-share");
        const btnProviderBatchDelete = popup.querySelector("#coolauxv-btn-provider-batch-delete");
        const actionSectionsContainer = popup.querySelector("#coolauxv-action-sections");
        const btnActionAdd = popup.querySelector("#coolauxv-btn-action-add");
        const btnActionReset = popup.querySelector("#coolauxv-btn-action-reset");
        const btnActionBatch = popup.querySelector("#coolauxv-btn-action-batch");
        const btnActionShare = popup.querySelector("#coolauxv-btn-action-share");
        const btnActionBatchDelete = popup.querySelector("#coolauxv-btn-action-batch-delete");
        const btnToggleActionAll = popup.querySelector("#coolauxv-btn-toggle-action-all");
        const selectionActionRadioGroup = popup.querySelector("#coolauxv-selection-action-radio-group");
        const inputWidth = popup.querySelector("#coolauxv-cfg-width");
        const inputHeight = popup.querySelector("#coolauxv-cfg-height");
        const inputPdfUrl = popup.querySelector("#coolauxv-pdf-url");
        const btnPdfLink = popup.querySelector("#coolauxv-btn-pdf-link");
        const inputPdfFile = popup.querySelector("#coolauxv-input-pdf-file");
        const btnPdfLocalOnline = popup.querySelector("#coolauxv-btn-pdf-local-online");
        const inputBlurGlass = popup.querySelector("#coolauxv-cfg-blur-glass");
        const inputPersistentBall = popup.querySelector("#coolauxv-cfg-persistent-ball");
        const inputDraggableBall = popup.querySelector("#coolauxv-cfg-draggable-ball");
        const radioBtns = popup.querySelectorAll('input[name="coolauxv_log_level_radio"]');
        const inputNewScreenshot = popup.querySelector("#coolauxv-cfg-new-screenshot");
        const inputContinuousChat = popup.querySelector("#coolauxv-cfg-continuous-chat");
        const continuousChatPromptSection = popup.querySelector("#coolauxv-continuous-chat-prompt-section");
        const inputPromptContinuousChat = popup.querySelector("#coolauxv-cfg-prompt-chat");
        const inputAppendContinuousChat = popup.querySelector("#coolauxv-cfg-append-chat");
        const inputChatHistoryPersist = popup.querySelector("#coolauxv-cfg-chat-history-persist");
        const btnClearChatPersist = popup.querySelector("#coolauxv-btn-clear-chat-persist");
        const btnManageChatPersist = popup.querySelector("#coolauxv-btn-manage-chat-persist");
        const inputChatEnterSend = popup.querySelector("#coolauxv-cfg-chat-enter-send");
        const inputBasicAnim = popup.querySelector("#coolauxv-cfg-basic-anim");
        const inputMinimizeAnim = popup.querySelector("#coolauxv-cfg-minimize-anim");
        const inputAnimSpeed = popup.querySelector("#coolauxv-cfg-anim-speed");
        const chatBar = popup.querySelector("#coolauxv-chat-bar");
        const chatBody = popup.querySelector("#coolauxv-chat-body");
        const chatToggleBtn = popup.querySelector("#coolauxv-chat-toggle");
        const chatInput = popup.querySelector("#coolauxv-chat-input");
        const topSection = popup.querySelector("#coolauxv-main-top-section");
        const headerBar = popup.querySelector("#coolauxv-header");
        const topSectionToggleBtn = popup.querySelector("#coolauxv-top-collapse-btn");

        const CONFIG_KEYS = [
            "coolauxv_default_provider",
            "coolauxv_model_provider",
            PROVIDER_TEMPLATE_STORAGE_KEY,
            ACTION_TEMPLATE_STORAGE_KEY,
            "coolauxv_zhipu_api_key",
            "coolauxv_openai_api_key",
            "coolauxv_cnb_api_key",
            "coolauxv_zhipu_model_name",
            "coolauxv_zhipu_model_vision",
            "coolauxv_openai_model_name",
            "coolauxv_cnb_model_name",
            "coolauxv_win_width",
            "coolauxv_win_height",
            "coolauxv_log_level",
            "coolauxv_prompt_trans",
            "coolauxv_prompt_explain",
            "coolauxv_prompt_chat",
            "coolauxv_prompt_vision",
            "coolauxv_append_trans",
            "coolauxv_append_explain",
            "coolauxv_append_vision",
            "coolauxv_append_chat",
            "coolauxv_use_new_screenshot",
            "coolauxv_enable_continuous_chat",
            "coolauxv_chat_history_persist",
            "coolauxv_chat_enter_send",
            "coolauxv_enable_basic_anim",
            "coolauxv_enable_minimize_anim",
            "coolauxv_anim_speed",
            "coolauxv_enable_blur_glass",
            "coolauxv_persistent_ball",
            "coolauxv_draggable_ball",
            "coolauxv_selection_icon_action"
        ];
        const LEGACY_CONFIG_KEYS = [
            "coolauxv_api_key",
            "coolauxv_model_name",
            "coolauxv_model_vision",
            "coolauxv_zhipu_api_key",
            "coolauxv_openai_api_key",
            "coolauxv_cnb_api_key",
            "coolauxv_cnb_repo",
            "coolauxv_zhipu_model_name",
            "coolauxv_zhipu_model_vision",
            "coolauxv_openai_model_name",
            "coolauxv_cnb_model_name",
            "coolauxv_enable_exit_anim",
            LEGACY_PROVIDER_MIGRATION_FLAG
        ];

        const listAllStoredKeys = () => {
            if (typeof GM_listValues === "function") {
                const keys = GM_listValues();
                return Array.isArray(keys) ? keys : [];
            }
            return [];
        };

        const clearAllStoredKeys = () => {
            const keys = listAllStoredKeys();
            if (keys.length) {
                const uniqueKeys = Array.from(new Set(keys));
                uniqueKeys.forEach((key) => GM_deleteValue(key));
                return;
            }
            CONFIG_KEYS.forEach((key) => GM_deleteValue(key));
            LEGACY_CONFIG_KEYS.forEach((key) => GM_deleteValue(key));
            GM_deleteValue(PROVIDER_SECRET_STORAGE_KEY);
            GM_deleteValue(CHAT_QUEUE_STORAGE_KEY);
        };

        const encodeBase64 = (text) => {
            const input = String(text === undefined || text === null ? "" : text);
            try {
                if (typeof TextEncoder !== "undefined") {
                    const bytes = new TextEncoder().encode(input);
                    const binary = uint8ToBinaryString(bytes);
                    return btoa(binary);
                }
                return btoa(unescape(encodeURIComponent(input)));
            } catch (e) {
                Logger.error("[ChatHistory]", "encodeBase64 failed", e && (e.message || String(e)), {
                    inputLength: input.length
                });
                return "";
            }
        };

        const decodeBase64 = (base64) => {
            const raw = atob(base64);
            if (typeof TextDecoder !== "undefined") {
                const bytes = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) {
                    bytes[i] = raw.charCodeAt(i);
                }
                return new TextDecoder().decode(bytes);
            }
            return decodeURIComponent(escape(raw));
        };

        const normalizeChatHistoryRecord = (record) => {
            if (!record || typeof record !== "object") return null;
            const role = String(record.role || "").trim();
            if (!["system", "user", "assistant"].includes(role)) return null;
            return {
                recordId: typeof record.recordId === "string" ? record.recordId : "",
                role: role,
                text: typeof record.text === "string" ? record.text : "",
                imageBase64: typeof record.imageBase64 === "string" ? record.imageBase64 : "",
                displayText: typeof record.displayText === "string" ? record.displayText : "",
                turnId: typeof record.turnId === "string" ? record.turnId : "",
                assistantLabel: typeof record.assistantLabel === "string" ? record.assistantLabel : ""
            };
        };

        const normalizeProviderRuntimeFields = (input) => {
            const result = {};
            if (!input || typeof input !== "object") return result;
            Object.keys(input).forEach((rawKey) => {
                const key = normalizeTemplateKey(rawKey);
                if (!key) return;
                const value = input[rawKey];
                if (value === undefined || value === null) return;
                const normalized = String(value).trim();
                if (!normalized) return;
                result[key] = normalized;
            });
            return result;
        };

        const normalizeProviderRuntimeState = (input) => {
            const result = {};
            if (!input || typeof input !== "object") return result;
            Object.keys(input).forEach((rawProviderId) => {
                const providerId = normalizeProviderId(rawProviderId);
                if (!providerId) return;
                const fields = normalizeProviderRuntimeFields(input[rawProviderId]);
                if (!Object.keys(fields).length) return;
                result[providerId] = fields;
            });
            return result;
        };

        const getProviderRuntimeFields = (providerId) => {
            const normalizedProviderId = normalizeProviderId(providerId || chatProvider || "");
            if (!normalizedProviderId) return {};
            const entry = chatProviderRuntimeState && chatProviderRuntimeState[normalizedProviderId];
            return entry && typeof entry === "object" ? entry : {};
        };

        const setProviderRuntimeFieldValue = (providerId, fieldKey, value, options = {}) => {
            const normalizedProviderId = normalizeProviderId(providerId || "");
            const normalizedFieldKey = normalizeTemplateKey(fieldKey || "");
            if (!normalizedProviderId || !normalizedFieldKey) return false;
            const normalizedValue = value === undefined || value === null ? "" : String(value).trim();
            if (!normalizedValue) return false;
            const nextState = normalizeProviderRuntimeState(chatProviderRuntimeState);
            const currentFields = Object.assign({}, nextState[normalizedProviderId] || {});
            if (currentFields[normalizedFieldKey] === normalizedValue) return false;
            currentFields[normalizedFieldKey] = normalizedValue;
            nextState[normalizedProviderId] = currentFields;
            chatProviderRuntimeState = nextState;
            if (options && options.persistQueue) {
                queueCurrentChatSessionToBackground();
            }
            return true;
        };

        const normalizeChatHistoryPayload = (payload) => {
            if (!payload || typeof payload !== "object") return null;
            const records = Array.isArray(payload.chatHistoryRecords)
                ? payload.chatHistoryRecords.map((record) => normalizeChatHistoryRecord(record)).filter(Boolean)
                : [];
            if (!records.length) return null;
            const runtimeState = normalizeProviderRuntimeState(
                payload.chatProviderRuntimeState
                || payload.chatProviderState
                || payload.providerRuntimeState
                || payload.providerState
            );
            const rawSessionId = typeof payload.chatSessionId === "string"
                ? payload.chatSessionId
                : (typeof payload.chatId === "string" ? payload.chatId : "");
            const normalizedSessionId = String(rawSessionId || "").trim();
            const normalizedTitle = String(payload.title || payload.name || "").trim();
            const normalizedChatName = String(payload.chatName || payload.customTitle || "").trim();
            return {
                type: CHAT_HISTORY_SHARE_TYPE,
                version: CHAT_HISTORY_SHARE_VERSION,
                exportedAt: typeof payload.exportedAt === "string" ? payload.exportedAt : new Date().toISOString(),
                chatProvider: typeof payload.chatProvider === "string" ? payload.chatProvider : "",
                chatSessionId: normalizedSessionId,
                title: normalizedTitle,
                chatName: normalizedChatName,
                chatSystemPrompt: typeof payload.chatSystemPrompt === "string" ? payload.chatSystemPrompt : "",
                chatAssistantLabel: typeof payload.chatAssistantLabel === "string" ? payload.chatAssistantLabel : "",
                chatProviderRuntimeState: runtimeState,
                chatHistoryRecords: records
            };
        };

        const buildChatHistoryExportPayload = () => {
            const records = chatHistoryRecords
                .map((record) => normalizeChatHistoryRecord(record))
                .filter(Boolean);
            if (chatSessionStarted && chatAssistantBuffer && chatAssistantBuffer.trim()) {
                const pendingAssistantRecord = normalizeChatHistoryRecord({
                    role: "assistant",
                    text: chatAssistantBuffer,
                    assistantLabel: chatAssistantLabel || ""
                });
                if (pendingAssistantRecord) records.push(pendingAssistantRecord);
            }
            if (!records.length) return null;
            const sessionId = String(chatSessionId || "").trim() || generateRequestId();
            chatSessionId = sessionId;
            return normalizeChatHistoryPayload({
                type: CHAT_HISTORY_SHARE_TYPE,
                version: CHAT_HISTORY_SHARE_VERSION,
                exportedAt: new Date().toISOString(),
                chatProvider: chatProvider || "",
                chatSessionId: sessionId,
                chatSystemPrompt: chatSystemPrompt || "",
                chatAssistantLabel: chatAssistantLabel || "",
                chatProviderRuntimeState: chatProviderRuntimeState,
                chatHistoryRecords: records
            });
        };

        const toChatHistoryImportPayload = (payload) => {
            const normalized = normalizeChatHistoryPayload(payload);
            if (!normalized) return null;
            return {
                records: normalized.chatHistoryRecords,
                providerId: normalized.chatProvider || "",
                sessionId: normalized.chatSessionId || "",
                systemPrompt: normalized.chatSystemPrompt || "",
                assistantLabel: normalized.chatAssistantLabel || "",
                providerRuntimeState: normalizeProviderRuntimeState(normalized.chatProviderRuntimeState || {})
            };
        };

        const normalizeChatQueueItem = (item) => {
            if (!item || typeof item !== "object") return null;
            const payload = normalizeChatHistoryPayload(item.payload);
            if (!payload) return null;
            const id = String(item.id || payload.chatSessionId || "").trim() || `queue-${generateRequestId()}`;
            payload.chatSessionId = id;
            const nowIso = new Date().toISOString();
            const createdAtRaw = String(item.createdAt || "").trim();
            const updatedAtRaw = String(item.updatedAt || item.modifiedAt || item.createdAt || "").trim();
            const createdAt = createdAtRaw || updatedAtRaw || nowIso;
            const updatedAt = updatedAtRaw || createdAtRaw || nowIso;
            const autoTitle = formatChatQueueTitle(payload);
            const title = String(item.title || "").trim();
            const titleNameRaw = item.chatName || item.customTitle || item.renamedTitle || "";
            let chatName = String(titleNameRaw || "").trim();
            let storedTitle = title || autoTitle;
            if (!chatName && title && autoTitle && title !== autoTitle) {
                chatName = title;
                storedTitle = autoTitle;
            }
            return {
                id: id,
                version: CHAT_QUEUE_VERSION,
                createdAt: createdAt,
                updatedAt: updatedAt,
                title: storedTitle || "连续对话",
                chatName: chatName,
                payload: payload
            };
        };

        const parseQueueTime = (value) => {
            const time = Date.parse(String(value || "").trim());
            return Number.isFinite(time) ? time : 0;
        };

        const shouldReplaceQueueItem = (nextItem, currentItem) => {
            const nextTime = parseQueueTime(nextItem && (nextItem.updatedAt || nextItem.createdAt));
            const currentTime = parseQueueTime(currentItem && (currentItem.updatedAt || currentItem.createdAt));
            if (nextTime !== currentTime) return nextTime > currentTime;
            const nextCreated = parseQueueTime(nextItem && nextItem.createdAt);
            const currentCreated = parseQueueTime(currentItem && currentItem.createdAt);
            return nextCreated >= currentCreated;
        };

        const normalizeChatQueueList = (list) => {
            const byId = new Map();
            const source = Array.isArray(list) ? list : [];
            source.forEach((item) => {
                const normalized = normalizeChatQueueItem(item);
                if (!normalized) return;
                const existing = byId.get(normalized.id);
                if (!existing || shouldReplaceQueueItem(normalized, existing)) {
                    byId.set(normalized.id, normalized);
                }
            });
            return Array.from(byId.values())
                .sort((a, b) => parseQueueTime(b.updatedAt || b.createdAt) - parseQueueTime(a.updatedAt || a.createdAt));
        };

        const mergeChatQueueLists = (primary, secondary) => {
            const first = Array.isArray(primary) ? primary : [];
            const second = Array.isArray(secondary) ? secondary : [];
            return normalizeChatQueueList(first.concat(second));
        };

        const isChatHistoryQueueFeatureEnabled = () => {
            return GM_getValue("coolauxv_enable_continuous_chat", DEFAULT_ENABLE_CONTINUOUS_CHAT);
        };

        const isChatHistoryQueuePersistenceEnabled = () => {
            return GM_getValue("coolauxv_chat_history_persist", DEFAULT_CHAT_HISTORY_PERSIST);
        };

        const loadPersistentChatQueue = () => {
            try {
                return normalizeChatQueueList(GM_getValue(CHAT_QUEUE_STORAGE_KEY, []));
            } catch (e) {
                return [];
            }
        };

        const savePersistentChatQueue = (list) => {
            const normalized = normalizeChatQueueList(list).slice(0, CHAT_QUEUE_MAX_SIZE);
            GM_setValue(CHAT_QUEUE_STORAGE_KEY, normalized);
            return normalized;
        };

        let chatBackgroundQueue = [];
        let chatQueuePersistBootstrapped = false;

        const syncChatQueueFromPersistentStore = () => {
            const globalQueue = loadPersistentChatQueue();
            if (!chatQueuePersistBootstrapped && chatBackgroundQueue.length) {
                chatBackgroundQueue = normalizeChatQueueList(chatBackgroundQueue.concat(globalQueue)).slice(0, CHAT_QUEUE_MAX_SIZE);
                savePersistentChatQueue(chatBackgroundQueue);
            } else {
                chatBackgroundQueue = globalQueue.slice(0, CHAT_QUEUE_MAX_SIZE);
            }
            chatQueuePersistBootstrapped = true;
            return chatBackgroundQueue;
        };

        const persistChatQueueToGlobalStore = () => {
            chatBackgroundQueue = normalizeChatQueueList(chatBackgroundQueue).slice(0, CHAT_QUEUE_MAX_SIZE);
            savePersistentChatQueue(chatBackgroundQueue);
            chatQueuePersistBootstrapped = true;
        };

        const getChatQueueItems = () => {
            syncChatQueueFromPersistentStore();
            return chatBackgroundQueue.slice();
        };

        const formatChatQueueTitle = (payload) => {
            const normalized = normalizeChatHistoryPayload(payload);
            if (!normalized) return "连续对话";
            const firstUser = normalized.chatHistoryRecords.find((record) => record.role === "user");
            const rawText = firstUser
                ? ((firstUser.displayText || firstUser.text || (firstUser.imageBase64 ? "（仅识屏）" : "")).trim())
                : "";
            const compact = rawText.replace(/\s+/g, " ");
            if (!compact) return "连续对话";
            return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact;
        };

        const getChatQueueDisplayTitle = (item) => {
            if (!item || typeof item !== "object") return "连续对话";
            const customName = String(item.chatName || "").trim();
            if (customName) return customName;
            const title = String(item.title || "").trim();
            if (title) return title;
            return formatChatQueueTitle(item.payload);
        };

        const enqueueChatPayloadToQueue = (payload, options = {}) => {
            if (!isChatHistoryQueueFeatureEnabled()) return null;
            const normalizedPayload = normalizeChatHistoryPayload(payload);
            if (!normalizedPayload) return null;
            const queueId = String(options.id || normalizedPayload.chatSessionId || "").trim() || `queue-${generateRequestId()}`;
            normalizedPayload.chatSessionId = queueId;
            syncChatQueueFromPersistentStore();
            const existingItem = chatBackgroundQueue.find((item) => item.id === queueId);
            const updatedAt = String(options.updatedAt || "").trim() || new Date().toISOString();
            const autoTitle = String(options.title || "").trim() || formatChatQueueTitle(normalizedPayload);
            const chatName = String(options.chatName || (existingItem && existingItem.chatName) || "").trim();
            const queuedItem = normalizeChatQueueItem({
                id: queueId,
                createdAt: (existingItem && existingItem.createdAt) || options.createdAt || updatedAt,
                updatedAt: updatedAt,
                title: autoTitle,
                chatName: chatName,
                payload: normalizedPayload
            });
            if (!queuedItem) return null;
            chatBackgroundQueue = normalizeChatQueueList([queuedItem].concat(chatBackgroundQueue)).slice(0, CHAT_QUEUE_MAX_SIZE);
            persistChatQueueToGlobalStore();
            return queuedItem;
        };

        const getChatQueueItemById = (itemId) => {
            if (!itemId) return null;
            const items = getChatQueueItems();
            return items.find((item) => item.id === itemId) || null;
        };

        const removeChatQueueItemById = (itemId) => {
            if (!itemId) return false;
            syncChatQueueFromPersistentStore();
            const before = chatBackgroundQueue.length;
            chatBackgroundQueue = chatBackgroundQueue.filter((item) => item.id !== itemId);
            const changed = chatBackgroundQueue.length !== before;
            if (changed) persistChatQueueToGlobalStore();
            return changed;
        };

        const renameChatQueueItemById = (itemId, nextTitle) => {
            if (!itemId) return null;
            syncChatQueueFromPersistentStore();
            const index = chatBackgroundQueue.findIndex((item) => item.id === itemId);
            if (index < 0) return null;
            const current = chatBackgroundQueue[index];
            const normalizedTitle = String(nextTitle || "").trim();
            const fallbackTitle = formatChatQueueTitle(current.payload);
            const currentChatName = String(current.chatName || "").trim();
            const currentStoredTitle = String(current.title || "").trim() || fallbackTitle;
            if (normalizedTitle === currentChatName && currentStoredTitle === fallbackTitle) {
                return current;
            }
            const renamed = normalizeChatQueueItem(Object.assign({}, current, {
                title: fallbackTitle,
                chatName: normalizedTitle,
                updatedAt: new Date().toISOString()
            }));
            if (!renamed) return null;
            chatBackgroundQueue[index] = renamed;
            persistChatQueueToGlobalStore();
            return renamed;
        };

        const asNonEmptyString = (value) => {
            if (value === undefined || value === null) return "";
            return String(value).trim();
        };

        const pickFirstNonEmptyString = (...values) => {
            for (let i = 0; i < values.length; i++) {
                const normalized = asNonEmptyString(values[i]);
                if (normalized) return normalized;
            }
            return "";
        };

        const formatImportedAssistantLabel = (providerId, modelName) => {
            const providerText = asNonEmptyString(providerId);
            const modelText = asNonEmptyString(modelName);
            if (providerText && modelText) return `${providerText} ${modelText}`.trim();
            return modelText || providerText;
        };

        const parseJsonOrBase64Payload = (inputText) => {
            const raw = String(inputText || "").trim();
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (e) { }
            try {
                const normalizedBase64 = raw.replace(/\s+/g, "");
                return JSON.parse(decodeBase64(normalizedBase64));
            } catch (e) {
                return null;
            }
        };

        const extractOpenAITextFromPart = (part) => {
            if (typeof part === "string") return part;
            if (!part || typeof part !== "object") return "";
            const partType = asNonEmptyString(part.type).toLowerCase();
            if (partType && [
                "search_query",
                "search_result",
                "tool_use",
                "tool_result",
                "reasoning",
                "reasoning_recap",
                "thought",
                "thoughts",
                "thinking",
                "code"
            ].includes(partType)) {
                return "";
            }
            if (typeof part.text === "string") return part.text;
            if (typeof part.content === "string") return part.content;
            if (typeof part.output_text === "string") return part.output_text;
            if (typeof part.value === "string" && (part.type === "text" || part.type === "output_text")) return part.value;
            if (part.text && typeof part.text === "object") {
                if (typeof part.text.value === "string") return part.text.value;
                if (Array.isArray(part.text.parts)) {
                    return part.text.parts.map((item) => extractOpenAITextFromPart(item)).filter(Boolean).join("");
                }
            }
            if (Array.isArray(part.parts)) {
                return part.parts.map((item) => extractOpenAITextFromPart(item)).filter(Boolean).join("");
            }
            if (Array.isArray(part.content)) {
                return part.content.map((item) => extractOpenAITextFromPart(item)).filter(Boolean).join("");
            }
            return "";
        };

        const shouldImportOpenAIMessage = (message, role) => {
            if (!message || typeof message !== "object") return false;
            const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
            if (metadata.is_visually_hidden_from_conversation) return false;
            const content = message.content && typeof message.content === "object" ? message.content : {};
            const contentType = asNonEmptyString(content.content_type).toLowerCase();
            if (contentType && contentType !== "text") return false;
            if (role !== "assistant") return true;
            const channel = asNonEmptyString(message.channel || metadata.channel).toLowerCase();
            if (channel && channel !== "final") return false;
            const recipient = asNonEmptyString(message.recipient).toLowerCase();
            if (recipient && recipient !== "all") return false;
            return true;
        };

        const extractOpenAIMessageText = (content) => {
            if (typeof content === "string") return content.trim();
            if (!content || typeof content !== "object") return "";
            if (Array.isArray(content.parts)) {
                return content.parts.map((part) => extractOpenAITextFromPart(part)).filter(Boolean).join("\n").trim();
            }
            if (Array.isArray(content.content)) {
                return content.content.map((part) => extractOpenAITextFromPart(part)).filter(Boolean).join("\n").trim();
            }
            if (Array.isArray(content.items)) {
                return content.items.map((part) => extractOpenAITextFromPart(part)).filter(Boolean).join("\n").trim();
            }
            if (typeof content.text === "string") return content.text.trim();
            if (content.text && typeof content.text === "object") {
                return extractOpenAITextFromPart(content.text).trim();
            }
            return "";
        };

        const normalizeOpenAISourceUrl = (value) => {
            const raw = asNonEmptyString(value);
            if (!raw) return "";
            if (!/^https?:\/\//i.test(raw)) return "";
            return raw;
        };

        const getOpenAIUrlAttributionLabel = (url, fallback) => {
            const direct = asNonEmptyString(fallback);
            if (direct) return direct;
            const normalized = normalizeOpenAISourceUrl(url);
            if (!normalized) return "来源";
            try {
                const hostname = new URL(normalized).hostname.replace(/^www\./i, "");
                return hostname || "来源";
            } catch (e) {
                return "来源";
            }
        };

        const buildOpenAIReferenceLinks = (reference) => {
            if (!reference || typeof reference !== "object") return [];
            const links = [];
            const seen = new Set();
            const pushLink = (url, label) => {
                const normalized = normalizeOpenAISourceUrl(url);
                if (!normalized) return;
                const key = normalized.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                links.push({
                    label: getOpenAIUrlAttributionLabel(normalized, label),
                    url: normalized
                });
            };

            const items = Array.isArray(reference.items) ? reference.items : [];
            items.forEach((item) => {
                if (!item || typeof item !== "object") return;
                pushLink(item.url, item.attribution || item.title);
                const supporting = Array.isArray(item.supporting_websites) ? item.supporting_websites : [];
                supporting.forEach((site) => {
                    if (!site || typeof site !== "object") return;
                    pushLink(site.url, site.attribution || site.title);
                });
            });

            if (!links.length) {
                const safeUrls = Array.isArray(reference.safe_urls) ? reference.safe_urls : [];
                safeUrls.forEach((url) => {
                    pushLink(url, "");
                });
            }
            return links;
        };

        const formatOpenAIReferenceMarkdown = (reference) => {
            const links = buildOpenAIReferenceLinks(reference);
            if (!links.length) return "";
            return links.map((item) => `[${item.label}](<${item.url}>)`).join(" ");
        };

        const escapeOpenAIReferenceTokenForRegex = (value) => {
            return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        };

        const applyOpenAIContentReferences = (text, message) => {
            const baseText = String(text || "");
            if (!baseText.trim()) return "";
            if (!message || typeof message !== "object") return baseText.trim();
            const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
            const refs = Array.isArray(metadata.content_references) ? metadata.content_references : [];
            if (!refs.length) return baseText.trim();

            let output = baseText;
            refs.forEach((reference) => {
                if (!reference || typeof reference !== "object") return;
                const token = asNonEmptyString(reference.matched_text);
                if (!token) return;
                const markdown = formatOpenAIReferenceMarkdown(reference);
                const replacement = markdown ? ` ${markdown}` : "";
                const tokenPattern = new RegExp(escapeOpenAIReferenceTokenForRegex(token), "g");
                output = output.replace(tokenPattern, replacement);
            });

            // 清理未匹配到 content_references 的残留 cite token
            output = output.replace(/cite[\s\S]*?/g, "");
            return output.trim();
        };

        const collectOpenAIMessageSourceUrls = (message) => {
            if (!message || typeof message !== "object") return [];
            const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
            const urls = [];
            const seen = new Set();
            const pushUrl = (value) => {
                const normalized = normalizeOpenAISourceUrl(value);
                if (!normalized) return;
                const key = normalized.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                urls.push(normalized);
            };

            if (Array.isArray(metadata.citations)) {
                metadata.citations.forEach((item) => {
                    if (typeof item === "string") {
                        pushUrl(item);
                        return;
                    }
                    if (!item || typeof item !== "object") return;
                    pushUrl(item.url);
                    pushUrl(item.uri);
                    pushUrl(item.link);
                    pushUrl(item.source);
                });
            }

            if (Array.isArray(metadata.search_result_groups)) {
                metadata.search_result_groups.forEach((group) => {
                    if (!group || typeof group !== "object") return;
                    pushUrl(group.url);
                    const entries = Array.isArray(group.entries) ? group.entries : [];
                    entries.forEach((entry) => {
                        if (!entry || typeof entry !== "object") return;
                        pushUrl(entry.url);
                        pushUrl(entry.link);
                        pushUrl(entry.source);
                    });
                });
            }

            return urls;
        };

        const appendOpenAISourceMarkdown = (text, urls) => {
            const baseText = String(text || "").trim();
            if (!baseText) return "";
            if (!Array.isArray(urls) || !urls.length) return baseText;
            const links = urls.map((url, idx) => `[来源${idx + 1}](<${url}>)`).join(" ");
            return `${baseText}\n\n${links}`;
        };

        const extractOpenAIMessageModel = (message, fallbackModel) => {
            const metadata = message && message.metadata && typeof message.metadata === "object" ? message.metadata : {};
            const authorMeta = message && message.author && message.author.metadata && typeof message.author.metadata === "object"
                ? message.author.metadata
                : {};
            return pickFirstNonEmptyString(
                metadata.resolved_model_slug,
                metadata.model_slug,
                metadata.default_model_slug,
                metadata.model,
                metadata.model_id,
                authorMeta.resolved_model_slug,
                authorMeta.model_slug,
                authorMeta.default_model_slug,
                fallbackModel
            );
        };

        const isOpenAIConversationObject = (value) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) return false;
            return !!(value.mapping && typeof value.mapping === "object");
        };

        const getOpenAIConversationSource = (parsed) => {
            if (isOpenAIConversationObject(parsed)) return parsed;
            if (parsed && typeof parsed === "object" && Array.isArray(parsed.conversations)) {
                return parsed.conversations.find((item) => isOpenAIConversationObject(item)) || null;
            }
            if (Array.isArray(parsed)) {
                return parsed.find((item) => isOpenAIConversationObject(item)) || null;
            }
            return null;
        };

        const parseOpenAIConversationPayload = (parsed) => {
            const conversation = getOpenAIConversationSource(parsed);
            if (!conversation) return null;
            const mapping = conversation.mapping && typeof conversation.mapping === "object" ? conversation.mapping : null;
            if (!mapping) return null;
            let cursor = pickFirstNonEmptyString(conversation.current_node, conversation.currentNode);
            if (!cursor) return null;

            const branch = [];
            const visited = new Set();
            while (cursor && !visited.has(cursor)) {
                visited.add(cursor);
                const node = mapping[cursor];
                if (!node || typeof node !== "object") break;
                branch.push(node);
                cursor = asNonEmptyString(node.parent);
            }
            if (!branch.length) return null;
            branch.reverse();

            const sessionId = pickFirstNonEmptyString(conversation.conversation_id, conversation.id);
            const title = pickFirstNonEmptyString(
                conversation.title,
                conversation.name,
                conversation.chatName,
                conversation.topic
            );
            const providerId = pickFirstNonEmptyString(
                conversation.chatProvider,
                conversation.providerId,
                conversation.provider,
                "openai"
            );
            const defaultModel = pickFirstNonEmptyString(
                conversation.default_model_slug,
                conversation.model_slug,
                conversation.modelName,
                conversation.model
            );

            const records = [];
            let systemPrompt = "";
            let latestModel = defaultModel;

            branch.forEach((node) => {
                const message = node && node.message && typeof node.message === "object" ? node.message : null;
                if (!message) return;
                const role = asNonEmptyString(message.author && message.author.role);
                if (!["system", "user", "assistant"].includes(role)) return;
                if (!shouldImportOpenAIMessage(message, role)) return;
                const rawText = extractOpenAIMessageText(message.content);
                const textWithInlineRefs = applyOpenAIContentReferences(rawText, message);
                const sourceUrls = collectOpenAIMessageSourceUrls(message);
                const text = textWithInlineRefs || appendOpenAISourceMarkdown(rawText, sourceUrls);
                if (!text) return;

                let assistantLabel = "";
                if (role === "assistant") {
                    const modelName = extractOpenAIMessageModel(message, latestModel);
                    if (modelName) latestModel = modelName;
                    assistantLabel = formatImportedAssistantLabel(providerId, modelName);
                } else if (role === "system" && !systemPrompt) {
                    systemPrompt = text;
                }

                const normalizedRecord = normalizeChatHistoryRecord({
                    role: role,
                    text: text,
                    assistantLabel: assistantLabel
                });
                if (normalizedRecord) records.push(normalizedRecord);
            });

            if (!records.length) return null;
            const modelName = latestModel || defaultModel;
            return {
                records: records,
                providerId: providerId,
                sessionId: sessionId,
                title: asNonEmptyString(title),
                systemPrompt: systemPrompt,
                assistantLabel: formatImportedAssistantLabel(providerId, modelName),
                modelName: modelName
            };
        };

        const parseChatHistoryImportPayload = (inputText) => {
            const raw = String(inputText || "").trim();
            if (!raw) return null;
            const parsed = parseJsonOrBase64Payload(raw);
            if (!parsed) return null;
            const openaiPayload = parseOpenAIConversationPayload(parsed);
            if (openaiPayload) return openaiPayload;

            let recordsSource = null;
            let providerId = "";
            let sessionId = "";
            let title = "";
            let systemPrompt = "";
            let assistantLabel = "";
            let modelName = "";
            let providerRuntimeState = {};

            if (Array.isArray(parsed)) {
                recordsSource = parsed;
            } else if (parsed && typeof parsed === "object") {
                if (parsed.type && parsed.type !== CHAT_HISTORY_SHARE_TYPE) return null;
                if (Array.isArray(parsed.chatHistoryRecords)) recordsSource = parsed.chatHistoryRecords;
                else if (Array.isArray(parsed.records)) recordsSource = parsed.records;
                providerId = typeof parsed.chatProvider === "string"
                    ? parsed.chatProvider
                    : (typeof parsed.providerId === "string" ? parsed.providerId : "");
                sessionId = typeof parsed.chatSessionId === "string"
                    ? parsed.chatSessionId
                    : (typeof parsed.sessionId === "string" ? parsed.sessionId : "");
                title = pickFirstNonEmptyString(parsed.chatName, parsed.customTitle, parsed.title, parsed.name);
                systemPrompt = typeof parsed.chatSystemPrompt === "string"
                    ? parsed.chatSystemPrompt
                    : (typeof parsed.systemPrompt === "string" ? parsed.systemPrompt : "");
                assistantLabel = typeof parsed.chatAssistantLabel === "string"
                    ? parsed.chatAssistantLabel
                    : (typeof parsed.assistantLabel === "string" ? parsed.assistantLabel : "");
                modelName = pickFirstNonEmptyString(parsed.chatModel, parsed.modelName, parsed.model, parsed.default_model_slug);
                providerRuntimeState = normalizeProviderRuntimeState(
                    parsed.chatProviderRuntimeState
                    || parsed.chatProviderState
                    || parsed.providerRuntimeState
                    || parsed.providerState
                );
            }

            if (!Array.isArray(recordsSource)) return null;
            const normalizedProviderId = asNonEmptyString(providerId);
            const normalizedModelName = asNonEmptyString(modelName);
            const normalizedAssistantLabel = asNonEmptyString(assistantLabel)
                || formatImportedAssistantLabel(normalizedProviderId, normalizedModelName);
            const records = recordsSource
                .map((record) => normalizeChatHistoryRecord(record))
                .filter(Boolean)
                .map((record) => {
                    if (record.role !== "assistant" || record.assistantLabel || !normalizedAssistantLabel) return record;
                    return Object.assign({}, record, { assistantLabel: normalizedAssistantLabel });
                });
            return {
                records: records,
                providerId: normalizedProviderId,
                sessionId: asNonEmptyString(sessionId),
                title: asNonEmptyString(title),
                systemPrompt: asNonEmptyString(systemPrompt),
                assistantLabel: normalizedAssistantLabel,
                modelName: normalizedModelName,
                providerRuntimeState: providerRuntimeState
            };
        };

        const applyImportedChatHistory = (parsedPayload) => {
            if (!parsedPayload || !Array.isArray(parsedPayload.records)) return false;
            if (isRendering) {
                alert("当前正在生成内容，请稍候再导入。");
                return false;
            }
            if (abortController) abortController.abort();
            if (gmRequest && gmRequest.abort) gmRequest.abort();

            clearChatSessionState();

            const chatInputEl = popup.querySelector("#coolauxv-chat-input");
            if (chatInputEl) chatInputEl.value = "";
            chatCapturedImageBase64 = "";
            const btnChatPreview = popup.querySelector("#coolauxv-btn-preview-chat");
            const btnChatClear = popup.querySelector("#coolauxv-btn-clear-chat-shot");
            setAnimatedVisibility(btnChatPreview, false);
            setAnimatedVisibility(btnChatClear, false);

            chatHistoryRecords = parsedPayload.records;
            const importedHasRecords = chatHistoryRecords.length > 0;
            const templates = getProviderTemplates();
            const config = getActiveConfig();
            const importedProviderId = asNonEmptyString(parsedPayload.providerId);
            const importedModelName = asNonEmptyString(parsedPayload.modelName);
            const resolvedProvider = resolveProviderId(importedProviderId || config.provider || DEFAULT_PROVIDER, templates);
            chatProvider = importedHasRecords ? (importedProviderId || resolvedProvider) : "";
            chatSessionStarted = importedHasRecords;
            chatSessionId = importedHasRecords
                ? (parsedPayload.sessionId || generateRequestId())
                : "";
            chatProviderRuntimeState = normalizeProviderRuntimeState(parsedPayload.providerRuntimeState || {});
            chatSystemPrompt = parsedPayload.systemPrompt || "";
            const importedAssistantLabel = asNonEmptyString(parsedPayload.assistantLabel)
                || formatImportedAssistantLabel(chatProvider || resolvedProvider, importedModelName);
            chatAssistantLabel = importedAssistantLabel || formatChatModelLabel(resolvedProvider, config.modelVision);
            if (chatAssistantLabel) {
                chatHistoryRecords = chatHistoryRecords.map((record) => {
                    if (!record || record.role !== "assistant" || record.assistantLabel) return record;
                    return Object.assign({}, record, { assistantLabel: chatAssistantLabel });
                });
            }

            if (importedHasRecords) {
                rebuildChatDisplayFromHistory(chatAssistantLabel);
                chatMessages = buildChatMessagesForProvider(resolvedProvider);
                streamMode = "chat";
            } else {
                chatMessages = [];
                chatDisplayBuffer = "";
                streamTextBuffer = "";
                streamMode = "single";
            }

            streamReasoningBuffer = "";
            lastRenderedReasoning = "";
            hasReasoning = false;
            lastRenderedText = "";

            const resultDiv = popup.querySelector("#coolauxv-result");
            if (!streamTextBuffer && resultDiv) resultDiv.innerHTML = "";
            const reasoningDiv = popup.querySelector("#coolauxv-reasoning-box");
            if (reasoningDiv) reasoningDiv.innerHTML = "";

            renderContent();
            if (importedHasRecords && chatBar && chatBar.style.display !== "none") {
                isChatCollapsed = false;
                updateChatCollapseUI();
            }
            if (importedHasRecords) {
                isTopSectionCollapsed = true;
                updateTopSectionCollapseUI();
            }
            return true;
        };

        const copyTextToClipboard = async (text) => {
            const value = String(text || "");
            if (!value) return false;
            try {
                if (typeof GM_setClipboard !== "undefined") {
                    GM_setClipboard(value, "text");
                    return true;
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(value);
                    return true;
                }
            } catch (e) { }
            return false;
        };

        const downloadChatHistoryFile = (base64Text) => {
            const value = String(base64Text || "").trim();
            if (!value) return false;
            try {
                const stamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "").replace("T", "_");
                const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `coolauxv-chat-history-${stamp}.auv`;
                document.body.appendChild(link);
                link.click();
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    if (link.parentNode) link.parentNode.removeChild(link);
                }, 0);
                return true;
            } catch (e) {
                Logger.error("[ChatHistory]", "download .auv failed", e && (e.message || String(e)), {
                    textLength: value.length
                });
                return false;
            }
        };

        const exportChatHistoryToPdf = (payload, options = {}) => {
            if (!payload || !Array.isArray(payload.chatHistoryRecords) || !payload.chatHistoryRecords.length) {
                alert("当前没有可导出的连续对话记录。");
                return false;
            }

            const escapeHtml = (value) => String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
            const escapeAttr = (value) => String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/"/g, "&quot;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
            const renderPdfMathText = (value) => {
                const text = String(value ?? "");
                const fallback = escapeHtml(text).replace(/\n/g, "<br>");
                if (typeof katex === "undefined" || !katex || typeof katex.renderToString !== "function") {
                    return fallback;
                }
                const mathPattern = /\\\[((?:.|\n)*?)\\\]|\\\(((?:.|\n)*?)\\\)|\$\$([\s\S]+?)\$\$|\$([^\n$]+?)\$/g;
                let lastIndex = 0;
                let output = "";
                let matched = false;
                text.replace(mathPattern, (raw, blockLatex, inlineLatex, blockDollarLatex, inlineDollarLatex, offset) => {
                    matched = true;
                    output += escapeHtml(text.slice(lastIndex, offset)).replace(/\n/g, "<br>");
                    const expr = blockLatex !== undefined
                        ? blockLatex
                        : (inlineLatex !== undefined
                            ? inlineLatex
                            : (blockDollarLatex !== undefined ? blockDollarLatex : inlineDollarLatex));
                    const displayMode = blockLatex !== undefined || blockDollarLatex !== undefined;
                    try {
                        output += katex.renderToString(expr, { throwOnError: false, displayMode: displayMode });
                    } catch (e) {
                        output += escapeHtml(raw);
                    }
                    lastIndex = offset + raw.length;
                    return raw;
                });
                if (!matched) return fallback;
                output += escapeHtml(text.slice(lastIndex)).replace(/\n/g, "<br>");
                return output;
            };
            const renderPdfMarkdownText = (value) => {
                const text = String(value ?? "");
                if (!text) return "";
                if (typeof marked !== "undefined" && marked && typeof marked.parse === "function") {
                    try {
                        const markdownInput = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                        const rendered = marked.parse(markdownInput, {
                            gfm: true,
                            breaks: true
                        });
                        if (typeof rendered === "string" && rendered.trim()) {
                            return rendered;
                        }
                    } catch (err) {
                        Logger.warn("[ChatHistory]", "pdf markdown render failed", err && (err.message || String(err)));
                    }
                }
                return renderPdfMathText(text);
            };
            const toHtmlText = (value) => renderPdfMarkdownText(value);
            const roleLabelMap = {
                system: "系统",
                user: "用户",
                assistant: "助手"
            };
            const requestedRoles = Array.isArray(options.roles) ? options.roles : ["user", "assistant"];
            const roleSet = new Set(requestedRoles.filter((role) => ["system", "user", "assistant"].includes(role)));
            if (!roleSet.size) {
                alert("请至少选择一个导出角色。");
                return false;
            }
            const filteredRecords = payload.chatHistoryRecords.filter((record) => roleSet.has(record.role));
            if (!filteredRecords.length) {
                alert("当前没有符合所选角色的聊天记录。");
                return false;
            }

            const recordsHtml = filteredRecords.map((record, idx) => {
                const role = ["system", "user", "assistant"].includes(record.role) ? record.role : "assistant";
                const roleLabel = roleLabelMap[role] || role;
                const text = (record.displayText || record.text || "").trim();
                const imageHtml = record.imageBase64
                    ? `<div class="chat-image-wrap"><img src="${escapeAttr(record.imageBase64)}" alt="chat-image-${idx + 1}"></div>`
                    : "";
                const metaParts = [];
                if (record.turnId) metaParts.push(`轮次ID: ${escapeHtml(record.turnId)}`);
                if (record.assistantLabel) metaParts.push(`模型: ${escapeHtml(record.assistantLabel)}`);
                const metaHtml = metaParts.length
                    ? `<div class="chat-meta">${metaParts.join(" · ")}</div>`
                    : "";
                return `
                    <section class="chat-item role-${role}">
                        <div class="chat-role">${roleLabel}</div>
                        ${metaHtml}
                        <div class="chat-text">${toHtmlText(text || "(空消息)")}</div>
                        ${imageHtml}
                    </section>
                `;
            }).join("");

            const exportedAt = payload.exportedAt
                ? new Date(payload.exportedAt).toLocaleString()
                : new Date().toLocaleString();
            const providerText = escapeHtml(payload.chatProvider || "未记录");
            const sessionText = escapeHtml(payload.chatSessionId || "未记录");

            const html = `
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>CoolAuxv 聊天记录</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #111827;
      line-height: 1.6;
      background: #ffffff;
    }
    .page-header {
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 8px;
      margin-bottom: 14px;
    }
    .page-title {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      color: #7c3aed;
    }
    .page-subtitle {
      margin-top: 4px;
      font-size: 12px;
      color: #6b7280;
    }
    .chat-item {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .role-system { background: #f9fafb; }
    .role-user { background: #eff6ff; }
    .role-assistant { background: #f8fafc; }
    .chat-role {
      font-size: 12px;
      font-weight: 700;
      color: #4b5563;
      margin-bottom: 4px;
    }
    .chat-meta {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 6px;
    }
    .chat-text {
      font-size: 13px;
      color: #111827;
      white-space: normal;
      word-break: break-word;
    }
    .chat-text > :first-child {
      margin-top: 0;
    }
    .chat-text > :last-child {
      margin-bottom: 0;
    }
    .chat-text p {
      margin: 0 0 8px 0;
    }
    .chat-text ul, .chat-text ol {
      margin: 0 0 8px 0;
      padding-left: 20px;
    }
    .chat-text li {
      margin: 2px 0;
    }
    .chat-text h1, .chat-text h2, .chat-text h3, .chat-text h4 {
      margin: 10px 0 6px 0;
      line-height: 1.35;
    }
    .chat-text pre {
      margin: 8px 0;
      padding: 8px 10px;
      background: #111827;
      color: #f9fafb;
      border-radius: 8px;
      overflow: auto;
    }
    .chat-text code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 12px;
      background: #f3f4f6;
      padding: 1px 4px;
      border-radius: 4px;
    }
    .chat-text pre code {
      background: transparent;
      color: inherit;
      padding: 0;
      border-radius: 0;
    }
    .chat-text blockquote {
      margin: 8px 0;
      padding: 0 10px;
      border-left: 3px solid #d1d5db;
      color: #4b5563;
    }
    .chat-text table {
      border-collapse: collapse;
      width: 100%;
      margin: 8px 0;
      font-size: 12px;
    }
    .chat-text th, .chat-text td {
      border: 1px solid #d1d5db;
      padding: 4px 6px;
      text-align: left;
      vertical-align: top;
    }
    .chat-text th {
      background: #f3f4f6;
      font-weight: 700;
    }
    .chat-text .katex-display {
      margin: 0.4em 0;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 2px 0;
    }
    .chat-image-wrap {
      margin-top: 8px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 4px;
      background: #ffffff;
    }
    .chat-image-wrap img {
      max-width: 100%;
      height: auto;
      display: block;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <header class="page-header">
    <h1 class="page-title">CoolAuxv 聊天记录导出</h1>
    <div class="page-subtitle">导出时间：${escapeHtml(exportedAt)}</div>
    <div class="page-subtitle">Provider：${providerText} ｜ Session：${sessionText}</div>
  </header>
  <main>
    ${recordsHtml}
  </main>
</body>
</html>
            `;

            const printWindow = window.open("", "_blank");
            if (!printWindow) {
                alert("无法打开打印窗口，请检查浏览器弹窗拦截设置。");
                return false;
            }
            try {
                printWindow.document.open();
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    try {
                        printWindow.print();
                    } catch (e) {
                        alert("打印窗口启动失败，请重试。");
                    }
                }, 300);
                return true;
            } catch (e) {
                alert("导出 PDF 失败，请稍后重试。");
                return false;
            }
        };

        const importChatHistoryFromText = (base64Text) => {
            const parsedItems = parseChatQueueImportItems(base64Text);
            if (!parsedItems.length) {
                alert("聊天记录格式无效，请确认 JSON 或 Base64 内容正确。");
                return false;
            }
            const importedCount = importChatQueueItems(parsedItems);
            if (!importedCount) {
                alert("聊天记录导入失败，请稍后重试。");
                return false;
            }
            alert(`已导入 ${importedCount} 条聊天记录到已保存会话。`);
            return true;
        };

        const openChatHistoryExportModal = (base64Text, payload) => {
            const existingOverlay = document.getElementById("coolauxv-chat-history-export-overlay");
            if (existingOverlay && existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay);
            }
            const overlay = document.createElement("div");
            overlay.id = "coolauxv-chat-history-export-overlay";
            Object.assign(overlay.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                background: "rgba(0, 0, 0, 0.5)",
                zIndex: "2147483661",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backdropFilter: "blur(4px)",
                opacity: "0",
                transition: "opacity 0.2s"
            });

            const box = document.createElement("div");
            Object.assign(box.style, {
                background: "#fff",
                width: "520px",
                maxWidth: "92%",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                padding: "18px",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                transform: "scale(0.96)",
                transition: "transform 0.2s",
                overflow: "hidden"
            });

            box.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
                    <div style="font-size:18px; font-weight:800; color:#a516e8;">⬇️ 导出聊天记录</div>
                    <button type="button" id="coolauxv-chat-history-export-close" class="coolauxv-ctrl-btn" title="关闭">×</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; flex:1;">
                    <div class="coolauxv-sub-label">已生成 Base64，可复制或保存为 .auv</div>
                    <div style="font-size:12px; color:#666;">导出内容已生成，可直接点击下方按钮复制或保存为 .auv 文件。</div>
                    <div class="coolauxv-sub-label">导出角色（PDF）</div>
                    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
                        <label class="coolauxv-toggle-label" style="background:none; padding:0; border:none;">
                            <input type="checkbox" id="coolauxv-chat-history-export-role-user" checked> user
                        </label>
                        <label class="coolauxv-toggle-label" style="background:none; padding:0; border:none;">
                            <input type="checkbox" id="coolauxv-chat-history-export-role-assistant" checked> assistant
                        </label>
                        <label class="coolauxv-toggle-label" style="background:none; padding:0; border:none;">
                            <input type="checkbox" id="coolauxv-chat-history-export-role-system"> system
                        </label>
                    </div>
                </div>
                <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
                    <button type="button" id="coolauxv-chat-history-export-copy" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1 1 40%;">复制 Base64</button>
                    <button type="button" id="coolauxv-chat-history-export-save" class="coolauxv-action-btn" style="flex:1 1 40%;">保存 .auv</button>
                    <button type="button" id="coolauxv-chat-history-export-pdf" class="coolauxv-action-btn" style="flex:1 1 40%;">导出 PDF</button>
                </div>
            `;

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            void overlay.offsetWidth;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    overlay.style.opacity = "1";
                    box.style.transform = "scale(1)";
                });
            });

            const closeModal = () => {
                document.removeEventListener("keydown", onEsc);
                overlay.style.opacity = "0";
                box.style.transform = "scale(0.96)";
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 200);
            };
            const onEsc = (e) => {
                if (e.key === "Escape") closeModal();
            };
            document.addEventListener("keydown", onEsc);

            const copyBtn = box.querySelector("#coolauxv-chat-history-export-copy");
            const saveBtn = box.querySelector("#coolauxv-chat-history-export-save");
            const pdfBtn = box.querySelector("#coolauxv-chat-history-export-pdf");
            const roleUserEl = box.querySelector("#coolauxv-chat-history-export-role-user");
            const roleAssistantEl = box.querySelector("#coolauxv-chat-history-export-role-assistant");
            const roleSystemEl = box.querySelector("#coolauxv-chat-history-export-role-system");
            const closeBtn = box.querySelector("#coolauxv-chat-history-export-close");
            const collectSelectedRoles = () => {
                const selectedRoles = [];
                if (roleUserEl && roleUserEl.checked) selectedRoles.push("user");
                if (roleAssistantEl && roleAssistantEl.checked) selectedRoles.push("assistant");
                if (roleSystemEl && roleSystemEl.checked) selectedRoles.push("system");
                return selectedRoles;
            };
            const buildRoleFilteredExportBase64 = () => {
                const selectedRoles = collectSelectedRoles();
                if (!selectedRoles.length) {
                    alert("请至少选择一个导出角色。");
                    return null;
                }
                const normalizedPayload = normalizeChatHistoryPayload(payload);
                if (!normalizedPayload) {
                    alert("当前没有可导出的连续对话记录。");
                    return null;
                }
                const roleSet = new Set(selectedRoles);
                const filteredRecords = normalizedPayload.chatHistoryRecords.filter((record) => roleSet.has(record.role));
                if (!filteredRecords.length) {
                    alert("当前没有符合所选角色的聊天记录。");
                    return null;
                }
                const filteredPayload = Object.assign({}, normalizedPayload, {
                    chatHistoryRecords: filteredRecords
                });
                let payloadJson = "";
                try {
                    payloadJson = JSON.stringify(filteredPayload);
                } catch (e) {
                    Logger.error("[ChatHistory]", "role filtered export JSON stringify failed", e && (e.message || String(e)));
                    alert("聊天记录导出失败，请稍后重试。");
                    return null;
                }
                const encoded = encodeBase64(payloadJson);
                if (!encoded) {
                    Logger.error("[ChatHistory]", "role filtered export encode failed", {
                        recordCount: filteredRecords.length,
                        jsonLength: payloadJson.length
                    });
                    alert("聊天记录导出失败，请稍后重试。");
                    return null;
                }
                return encoded;
            };

            if (copyBtn) {
                copyBtn.addEventListener("click", async () => {
                    const text = buildRoleFilteredExportBase64();
                    if (!text) {
                        return;
                    }
                    const copied = await copyTextToClipboard(text);
                    if (copied) {
                        alert("聊天记录 Base64 已复制到剪贴板。");
                    } else {
                        alert("复制失败，请稍后重试。");
                    }
                });
            }
            if (saveBtn) {
                saveBtn.addEventListener("click", () => {
                    const text = buildRoleFilteredExportBase64();
                    if (!text) {
                        return;
                    }
                    const saved = downloadChatHistoryFile(text);
                    if (saved) {
                        alert("聊天记录已保存为 .auv 文件。");
                    } else {
                        alert("保存失败，请稍后重试。");
                    }
                });
            }
            if (pdfBtn) {
                pdfBtn.addEventListener("click", () => {
                    const selectedRoles = collectSelectedRoles();
                    if (!selectedRoles.length) {
                        alert("请至少选择一个导出角色。");
                        return;
                    }
                    alert("即将弹出打印窗口，请在打印对话框中选择“另存为 PDF”。");
                    exportChatHistoryToPdf(payload, { roles: selectedRoles });
                });
            }
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeModal();
            });
        };

        const exportChatHistoryPayload = (payload, options = {}) => {
            const mergedPayload = Object.assign({}, payload || {}, options || {});
            const normalizedPayload = normalizeChatHistoryPayload(mergedPayload);
            if (!normalizedPayload) {
                Logger.warn("[ChatHistory]", "export skipped: no valid records");
                alert("当前没有可导出的连续对话记录。");
                return false;
            }
            let payloadJson = "";
            try {
                payloadJson = JSON.stringify(normalizedPayload);
            } catch (e) {
                Logger.error("[ChatHistory]", "export JSON stringify failed", e && (e.message || String(e)));
                alert("聊天记录导出失败，请稍后重试。");
                return false;
            }
            const base64 = encodeBase64(payloadJson);
            if (!base64) {
                Logger.error("[ChatHistory]", "export encode failed", {
                    recordCount: normalizedPayload.chatHistoryRecords.length,
                    jsonLength: payloadJson.length
                });
                alert("聊天记录导出失败，请稍后重试。");
                return false;
            }
            Logger.debug("[ChatHistory]", "export ready", {
                recordCount: normalizedPayload.chatHistoryRecords.length,
                jsonLength: payloadJson.length,
                base64Length: base64.length,
                sessionId: normalizedPayload.chatSessionId || ""
            });
            openChatHistoryExportModal(base64, normalizedPayload);
            return true;
        };

        const exportChatHistory = () => {
            const payload = buildChatHistoryExportPayload();
            return exportChatHistoryPayload(payload);
        };

        const openChatHistoryImportModal = (onImported) => {
            const existingOverlay = document.getElementById("coolauxv-chat-history-import-overlay");
            if (existingOverlay && existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay);
            }
            const overlay = document.createElement("div");
            overlay.id = "coolauxv-chat-history-import-overlay";
            Object.assign(overlay.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                background: "rgba(0, 0, 0, 0.5)",
                zIndex: "2147483661",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backdropFilter: "blur(4px)",
                opacity: "0",
                transition: "opacity 0.2s"
            });
            const box = document.createElement("div");
            Object.assign(box.style, {
                background: "#fff",
                width: "520px",
                maxWidth: "92%",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                padding: "18px",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                transform: "scale(0.96)",
                transition: "transform 0.2s",
                overflow: "hidden"
            });

            box.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
                    <div style="font-size:18px; font-weight:800; color:#a516e8;">⬆️ 导入聊天记录</div>
                    <button type="button" id="coolauxv-chat-history-import-close" class="coolauxv-ctrl-btn" title="关闭">×</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; flex:1;">
                    <div class="coolauxv-sub-label">粘贴 JSON / Base64 文本，或选择 .auv / .json 文件</div>
                    <textarea id="coolauxv-chat-history-import-text" class="coolauxv-setting-input coolauxv-resizable-input" rows="3" placeholder="粘贴导入内容..." spellcheck="false"></textarea>
                    <div style="font-size:11px; color:#888;">支持聊天记录导出的 Base64，也支持 OpenAI 官方导出 JSON。导入后会保存到后台已保存会话。</div>
                </div>
                <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
                    <button type="button" id="coolauxv-chat-history-import-exporter-link" class="coolauxv-action-btn" style="flex:1;">支持格式导出插件</button>
                    <button type="button" id="coolauxv-chat-history-import-file" class="coolauxv-action-btn" style="flex:1;">选择 .auv/.json</button>
                    <button type="button" id="coolauxv-chat-history-import-submit" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">导入到已保存会话</button>
                </div>
            `;

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => {
                overlay.style.opacity = "1";
                box.style.transform = "scale(1)";
            });

            const closeModal = () => {
                document.removeEventListener("keydown", onEsc);
                overlay.style.opacity = "0";
                box.style.transform = "scale(0.96)";
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 200);
            };
            const onEsc = (e) => {
                if (e.key === "Escape") closeModal();
            };
            document.addEventListener("keydown", onEsc);

            const inputEl = box.querySelector("#coolauxv-chat-history-import-text");
            const exporterLinkBtn = box.querySelector("#coolauxv-chat-history-import-exporter-link");
            const fileBtn = box.querySelector("#coolauxv-chat-history-import-file");
            const submitBtn = box.querySelector("#coolauxv-chat-history-import-submit");
            const closeBtn = box.querySelector("#coolauxv-chat-history-import-close");
            if (inputEl) setTimeout(() => inputEl.focus(), 0);

            if (exporterLinkBtn) {
                exporterLinkBtn.addEventListener("click", () => {
                    window.open("https://github.com/pionxzh/chatgpt-exporter", "_blank", "noopener,noreferrer");
                });
            }
            if (fileBtn) {
                fileBtn.addEventListener("click", () => {
                    const fileInput = document.createElement("input");
                    fileInput.type = "file";
                    fileInput.accept = ".auv,.json,text/plain,application/json";
                    fileInput.addEventListener("change", async () => {
                        const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
                        if (!file) return;
                        try {
                            const text = await file.text();
                            if (inputEl) {
                                inputEl.value = text;
                                inputEl.focus();
                            }
                        } catch (e) {
                            alert("读取文件失败，请重试。");
                        }
                    }, { once: true });
                    fileInput.click();
                });
            }
            if (submitBtn) {
                submitBtn.addEventListener("click", () => {
                    const text = inputEl ? String(inputEl.value || "").trim() : "";
                    if (!text) {
                        alert("请先粘贴 JSON/Base64 文本或选择 .auv/.json 文件。");
                        return;
                    }
                    const imported = importChatHistoryFromText(text);
                    if (imported) {
                        if (typeof onImported === "function") onImported();
                        closeModal();
                    }
                });
            }
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeModal();
            });
        };

        const escapeQueueText = (value) => String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        const formatQueueTime = (iso) => {
            if (!iso) return "";
            try {
                return new Date(iso).toLocaleString();
            } catch (e) {
                return String(iso);
            }
        };

        const getQueueRecordCount = (item) => {
            const payload = item && item.payload ? item.payload : null;
            return payload && Array.isArray(payload.chatHistoryRecords) ? payload.chatHistoryRecords.length : 0;
        };

        const buildQueueMetaText = (item) => {
            if (!item || !item.payload) return "";
            const providerText = item.payload.chatProvider ? `Provider: ${item.payload.chatProvider}` : "Provider: 未记录";
            return `${providerText} · ${getQueueRecordCount(item)} 条消息 · 更新于 ${formatQueueTime(item.updatedAt || item.createdAt)}`;
        };

        const exportChatQueueItems = (items) => {
            const normalizedItems = normalizeChatQueueList(items);
            if (!normalizedItems.length) {
                Logger.warn("[ChatHistory]", "batch export skipped: no selected queue items");
                alert("请先选择要导出的后台会话。");
                return false;
            }
            const payload = {
                type: CHAT_QUEUE_SHARE_TYPE,
                version: CHAT_QUEUE_SHARE_VERSION,
                exportedAt: new Date().toISOString(),
                items: normalizedItems
            };
            let payloadJson = "";
            try {
                payloadJson = JSON.stringify(payload);
            } catch (e) {
                Logger.error("[ChatHistory]", "batch export JSON stringify failed", e && (e.message || String(e)));
                alert("批量导出失败，请稍后重试。");
                return false;
            }
            const base64 = encodeBase64(payloadJson);
            if (!base64) {
                Logger.error("[ChatHistory]", "batch export encode failed", {
                    itemCount: normalizedItems.length,
                    jsonLength: payloadJson.length
                });
                alert("批量导出失败，请稍后重试。");
                return false;
            }
            Logger.debug("[ChatHistory]", "batch export ready", {
                itemCount: normalizedItems.length,
                jsonLength: payloadJson.length,
                base64Length: base64.length
            });
            openChatQueueExportModal(base64);
            return true;
        };

        const openChatQueueExportModal = (base64Text) => {
            const existingOverlay = document.getElementById("coolauxv-chat-queue-export-overlay");
            if (existingOverlay && existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay);
            }
            const overlay = document.createElement("div");
            overlay.id = "coolauxv-chat-queue-export-overlay";
            Object.assign(overlay.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                background: "rgba(0, 0, 0, 0.5)",
                zIndex: "2147483661",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backdropFilter: "blur(4px)",
                opacity: "0",
                transition: "opacity 0.2s"
            });

            const box = document.createElement("div");
            Object.assign(box.style, {
                background: "#fff",
                width: "520px",
                maxWidth: "92%",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                padding: "18px",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                transform: "scale(0.96)",
                transition: "transform 0.2s",
                overflow: "hidden"
            });

            box.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
                    <div style="font-size:18px; font-weight:800; color:#a516e8;">⬇️ 批量导出后台会话</div>
                    <button type="button" id="coolauxv-chat-queue-export-close" class="coolauxv-ctrl-btn" title="关闭">×</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; flex:1;">
                    <div class="coolauxv-sub-label">已生成 Base64，可复制或保存为 .auv</div>
                    <div style="font-size:12px; color:#666;">导出内容已生成，可直接点击下方按钮复制或保存为 .auv 文件。</div>
                    <div style="font-size:11px; color:#888;">可在“批量导入后台会话”中恢复。</div>
                </div>
                <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
                    <button type="button" id="coolauxv-chat-queue-export-copy" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1 1 40%;">复制 Base64</button>
                    <button type="button" id="coolauxv-chat-queue-export-save" class="coolauxv-action-btn" style="flex:1 1 40%;">保存 .auv</button>
                </div>
            `;

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => {
                overlay.style.opacity = "1";
                box.style.transform = "scale(1)";
            });

            const closeModal = () => {
                document.removeEventListener("keydown", onEsc);
                overlay.style.opacity = "0";
                box.style.transform = "scale(0.96)";
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 200);
            };
            const onEsc = (e) => {
                if (e.key === "Escape") closeModal();
            };
            document.addEventListener("keydown", onEsc);

            const copyBtn = box.querySelector("#coolauxv-chat-queue-export-copy");
            const saveBtn = box.querySelector("#coolauxv-chat-queue-export-save");
            const closeBtn = box.querySelector("#coolauxv-chat-queue-export-close");
            if (copyBtn) {
                copyBtn.addEventListener("click", async () => {
                    const text = String(base64Text || "").trim();
                    if (!text) {
                        alert("没有可复制的内容。");
                        return;
                    }
                    const copied = await copyTextToClipboard(text);
                    if (copied) {
                        alert("批量会话 Base64 已复制到剪贴板。");
                    } else {
                        alert("复制失败，请稍后重试。");
                    }
                });
            }
            if (saveBtn) {
                saveBtn.addEventListener("click", () => {
                    const text = String(base64Text || "").trim();
                    if (!text) {
                        alert("没有可保存的内容。");
                        return;
                    }
                    const saved = downloadChatHistoryFile(text);
                    if (saved) {
                        alert("批量会话已保存为 .auv 文件。");
                    } else {
                        alert("保存失败，请稍后重试。");
                    }
                });
            }
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeModal();
            });
        };

        const parseChatQueueImportItems = (base64Input) => {
            const raw = String(base64Input || "").trim();
            if (!raw) return [];
            let parsed = null;
            try {
                parsed = JSON.parse(decodeBase64(raw.replace(/\s+/g, "")));
            } catch (e) {
                parsed = null;
            }

            if (Array.isArray(parsed)) {
                const normalizedArray = normalizeChatQueueList(parsed);
                if (normalizedArray.length) return normalizedArray;
            } else if (parsed && typeof parsed === "object") {
                if (parsed.type === CHAT_QUEUE_SHARE_TYPE && Array.isArray(parsed.items)) {
                    return normalizeChatQueueList(parsed.items);
                }
                if (parsed.payload) {
                    const singleItem = normalizeChatQueueItem(parsed);
                    if (singleItem) return [singleItem];
                }
            }

            const fallbackHistory = parseChatHistoryImportPayload(raw);
            if (!fallbackHistory) return [];
            const historyPayload = normalizeChatHistoryPayload({
                type: CHAT_HISTORY_SHARE_TYPE,
                version: CHAT_HISTORY_SHARE_VERSION,
                exportedAt: new Date().toISOString(),
                chatProvider: fallbackHistory.providerId || "",
                chatSessionId: fallbackHistory.sessionId || "",
                chatSystemPrompt: fallbackHistory.systemPrompt || "",
                chatAssistantLabel: fallbackHistory.assistantLabel || "",
                chatProviderRuntimeState: fallbackHistory.providerRuntimeState || {},
                chatHistoryRecords: fallbackHistory.records || []
            });
            if (!historyPayload) return [];
            const importedTitle = asNonEmptyString(fallbackHistory.title);
            const queueItem = normalizeChatQueueItem({
                id: historyPayload.chatSessionId || `queue-${generateRequestId()}`,
                updatedAt: new Date().toISOString(),
                title: importedTitle || formatChatQueueTitle(historyPayload),
                payload: historyPayload
            });
            return queueItem ? [queueItem] : [];
        };

        const importChatQueueItems = (items) => {
            const normalizedItems = normalizeChatQueueList(items);
            if (!normalizedItems.length) return 0;
            syncChatQueueFromPersistentStore();
            chatBackgroundQueue = normalizeChatQueueList(normalizedItems.concat(chatBackgroundQueue)).slice(0, CHAT_QUEUE_MAX_SIZE);
            persistChatQueueToGlobalStore();
            return normalizedItems.length;
        };

        const openChatQueueImportModal = (onImported) => {
            const existingOverlay = document.getElementById("coolauxv-chat-queue-import-overlay");
            if (existingOverlay && existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay);
            }
            const overlay = document.createElement("div");
            overlay.id = "coolauxv-chat-queue-import-overlay";
            Object.assign(overlay.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                background: "rgba(0, 0, 0, 0.5)",
                zIndex: "2147483661",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backdropFilter: "blur(4px)",
                opacity: "0",
                transition: "opacity 0.2s"
            });

            const box = document.createElement("div");
            Object.assign(box.style, {
                background: "#fff",
                width: "520px",
                maxWidth: "92%",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                padding: "18px",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                transform: "scale(0.96)",
                transition: "transform 0.2s",
                overflow: "hidden"
            });

            box.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
                    <div style="font-size:18px; font-weight:800; color:#a516e8;">⬆️ 批量导入后台会话</div>
                    <button type="button" id="coolauxv-chat-queue-import-close" class="coolauxv-ctrl-btn" title="关闭">×</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; flex:1;">
                    <div class="coolauxv-sub-label">粘贴批量 Base64 文本，或选择 .auv 文件</div>
                    <textarea id="coolauxv-chat-queue-import-text" class="coolauxv-setting-input coolauxv-resizable-input" rows="3" placeholder="粘贴导入内容..." spellcheck="false"></textarea>
                    <div style="font-size:11px; color:#888;">支持批量会话导出内容，也兼容单条聊天记录 Base64。</div>
                </div>
                <div style="display:flex; gap:10px; margin-top:12px;">
                    <button type="button" id="coolauxv-chat-queue-import-file" class="coolauxv-action-btn" style="flex:1;">选择 .auv</button>
                    <button type="button" id="coolauxv-chat-queue-import-submit" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">导入到后台队列</button>
                </div>
            `;

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => {
                overlay.style.opacity = "1";
                box.style.transform = "scale(1)";
            });

            const closeModal = () => {
                document.removeEventListener("keydown", onEsc);
                overlay.style.opacity = "0";
                box.style.transform = "scale(0.96)";
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 200);
            };
            const onEsc = (e) => {
                if (e.key === "Escape") closeModal();
            };
            document.addEventListener("keydown", onEsc);

            const inputEl = box.querySelector("#coolauxv-chat-queue-import-text");
            const fileBtn = box.querySelector("#coolauxv-chat-queue-import-file");
            const submitBtn = box.querySelector("#coolauxv-chat-queue-import-submit");
            const closeBtn = box.querySelector("#coolauxv-chat-queue-import-close");
            if (inputEl) setTimeout(() => inputEl.focus(), 0);

            if (fileBtn) {
                fileBtn.addEventListener("click", () => {
                    const fileInput = document.createElement("input");
                    fileInput.type = "file";
                    fileInput.accept = ".auv,text/plain";
                    fileInput.addEventListener("change", async () => {
                        const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
                        if (!file) return;
                        try {
                            const text = await file.text();
                            if (inputEl) {
                                inputEl.value = text;
                                inputEl.focus();
                            }
                        } catch (e) {
                            alert("读取 .auv 文件失败，请重试。");
                        }
                    }, { once: true });
                    fileInput.click();
                });
            }
            if (submitBtn) {
                submitBtn.addEventListener("click", () => {
                    const text = inputEl ? String(inputEl.value || "").trim() : "";
                    if (!text) {
                        alert("请先粘贴 Base64 文本或选择 .auv 文件。");
                        return;
                    }
                    const parsedItems = parseChatQueueImportItems(text);
                    if (!parsedItems.length) {
                        alert("导入内容无效，无法识别后台会话。");
                        return;
                    }
                    const importedCount = importChatQueueItems(parsedItems);
                    if (!importedCount) {
                        alert("导入失败，请稍后重试。");
                        return;
                    }
                    if (typeof onImported === "function") onImported(importedCount);
                    closeModal();
                });
            }
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeModal();
            });
        };

        const openChatHistoryActionModal = () => {
            const existingOverlay = document.getElementById("coolauxv-chat-history-action-overlay");
            if (existingOverlay && existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay);
            }
            const overlay = document.createElement("div");
            overlay.id = "coolauxv-chat-history-action-overlay";
            Object.assign(overlay.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                background: "rgba(0, 0, 0, 0.5)",
                zIndex: "2147483661",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backdropFilter: "blur(4px)",
                opacity: "0",
                transition: "opacity 0.2s"
            });
            if (GM_getValue("coolauxv_enable_blur_glass", DEFAULT_ENABLE_BLUR_GLASS)) {
                overlay.classList.add("coolauxv-chat-history-glass-overlay");
            }

            const box = document.createElement("div");
            Object.assign(box.style, {
                background: "#fff",
                width: "680px",
                maxWidth: "90%",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                padding: "18px",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                transform: "scale(0.96)",
                transition: "transform 0.2s",
                overflow: "hidden"
            });
            if (GM_getValue("coolauxv_enable_blur_glass", DEFAULT_ENABLE_BLUR_GLASS)) {
                box.classList.add("coolauxv-chat-history-glass");
            }

            box.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
                    <div style="font-size:18px; font-weight:800; color:#a516e8;">💬 聊天记录管理</div>
                    <button type="button" id="coolauxv-chat-history-action-close" class="coolauxv-ctrl-btn" title="关闭">×</button>
                </div>
                <div style="font-size:12px; color:#666; margin-bottom:12px;">可导入导出聊天记录，也可以管理后台队列里的历史会话。</div>
                <div style="display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
                    <button type="button" id="coolauxv-chat-history-action-export" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">导出当前聊天记录</button>
                    <button type="button" id="coolauxv-chat-history-action-import" class="coolauxv-action-btn" style="flex:1;">导入聊天记录</button>
                    <button type="button" id="coolauxv-chat-history-action-batch-toggle" class="coolauxv-action-btn coolauxv-batch-toggle-btn" style="flex:0.6;">
                        <span class="coolauxv-batch-toggle-icon" aria-hidden="true">🧩</span>
                        <span data-batch-toggle-text>批量</span>
                    </button>
                </div>
                <div id="coolauxv-chat-history-batch-actions" class="coolauxv-chat-history-batch-actions">
                    <button type="button" id="coolauxv-chat-history-batch-select-all" class="coolauxv-action-btn" style="flex:0.6;">全选</button>
                    <button type="button" id="coolauxv-chat-history-batch-clear" class="coolauxv-action-btn" style="flex:0.6;">清空选择</button>
                    <button type="button" id="coolauxv-chat-history-batch-export" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">批量导出</button>
                    <button type="button" id="coolauxv-chat-history-batch-import" class="coolauxv-action-btn" style="flex:1;">批量导入</button>
                    <button type="button" id="coolauxv-chat-history-batch-delete" class="coolauxv-action-btn" style="flex:1; background:#fee2e2; color:#b91c1c; border-color:#fecaca;">批量删除</button>
                    <span id="coolauxv-chat-history-batch-count" style="font-size:11px; color:#666; margin-left:auto;">已选 0 项</span>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
                    <div style="font-size:13px; font-weight:700; color:#374151;">后台对话队列</div>
                    <div style="font-size:11px; color:#888;">仅连续对话开启时生效</div>
                </div>
                <div id="coolauxv-chat-history-queue-list" class="coolauxv-scroll-box" style="display:flex; flex-direction:column; gap:8px; overflow-y:auto; max-height:52vh; padding-right:2px;"></div>
            `;

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => {
                overlay.style.opacity = "1";
                box.style.transform = "scale(1)";
            });

            const closeModal = () => {
                document.removeEventListener("keydown", onEsc);
                overlay.style.opacity = "0";
                box.style.transform = "scale(0.96)";
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 200);
            };
            const onEsc = (e) => {
                if (e.key === "Escape") closeModal();
            };
            document.addEventListener("keydown", onEsc);

            const exportBtn = box.querySelector("#coolauxv-chat-history-action-export");
            const importBtn = box.querySelector("#coolauxv-chat-history-action-import");
            const closeBtn = box.querySelector("#coolauxv-chat-history-action-close");
            const batchToggleBtn = box.querySelector("#coolauxv-chat-history-action-batch-toggle");
            const batchSelectAllBtn = box.querySelector("#coolauxv-chat-history-batch-select-all");
            const batchClearBtn = box.querySelector("#coolauxv-chat-history-batch-clear");
            const batchExportBtn = box.querySelector("#coolauxv-chat-history-batch-export");
            const batchImportBtn = box.querySelector("#coolauxv-chat-history-batch-import");
            const batchDeleteBtn = box.querySelector("#coolauxv-chat-history-batch-delete");
            const batchCountEl = box.querySelector("#coolauxv-chat-history-batch-count");
            const queueListEl = box.querySelector("#coolauxv-chat-history-queue-list");
            let isBatchMode = false;
            const selectedQueueIds = new Set();

            const updateBatchCount = () => {
                if (!batchCountEl) return;
                batchCountEl.textContent = `已选 ${selectedQueueIds.size} 项`;
            };

            const updateBatchToggleButtonState = () => {
                if (!batchToggleBtn) return;
                const enableAnim = isMinimizeAnimEnabled();
                batchToggleBtn.classList.toggle("coolauxv-batch-toggle-active", isBatchMode);
                batchToggleBtn.classList.toggle("coolauxv-no-anim", !enableAnim);
                const textEl = batchToggleBtn.querySelector("[data-batch-toggle-text]");
                if (textEl) {
                    textEl.textContent = isBatchMode ? "完成批量" : "批量";
                } else {
                    batchToggleBtn.textContent = isBatchMode ? "完成批量" : "批量";
                }
            };

            const syncQueueSelectionUI = () => {
                if (!queueListEl) return;
                queueListEl.querySelectorAll("[data-queue-id]").forEach((itemEl) => {
                    const queueId = itemEl.getAttribute("data-queue-id");
                    itemEl.classList.toggle("coolauxv-selected", !!queueId && selectedQueueIds.has(queueId));
                });
                queueListEl.querySelectorAll("[data-queue-select]").forEach((inputEl) => {
                    const queueId = inputEl.getAttribute("data-queue-select");
                    inputEl.checked = !!queueId && selectedQueueIds.has(queueId);
                });
            };

            const updateBatchModeClass = () => {
                box.classList.toggle("coolauxv-chat-history-batch-mode", isBatchMode);
                box.classList.toggle("coolauxv-chat-history-no-anim", !isMinimizeAnimEnabled());
                updateBatchToggleButtonState();
            };

            const setBatchMode = (enabled) => {
                isBatchMode = !!enabled;
                if (!isBatchMode) {
                    selectedQueueIds.clear();
                }
                updateBatchCount();
                syncQueueSelectionUI();
                updateBatchModeClass();
            };

            const animateQueueItemRemoval = (queueIds, onDone) => {
                const finish = () => {
                    if (typeof onDone === "function") onDone();
                };
                const ids = Array.isArray(queueIds) ? queueIds.filter(Boolean) : [];
                if (!ids.length || !queueListEl || !isMinimizeAnimEnabled()) {
                    finish();
                    return;
                }
                const idSet = new Set(ids);
                const itemEls = Array.from(queueListEl.querySelectorAll("[data-queue-id]"))
                    .filter((el) => idSet.has(el.getAttribute("data-queue-id")));
                if (!itemEls.length) {
                    finish();
                    return;
                }
                let pending = itemEls.length;
                const doneOne = () => {
                    pending -= 1;
                    if (pending <= 0) finish();
                };
                itemEls.forEach((itemEl) => {
                    itemEl.style.overflow = "hidden";
                    itemEl.style.maxHeight = `${itemEl.scrollHeight}px`;
                    itemEl.style.opacity = "1";
                    itemEl.style.transform = "translateY(0)";
                    itemEl.style.transition = "max-height 0.24s cubic-bezier(0.2,0,0,1), opacity 0.2s cubic-bezier(0.2,0,0,1), transform 0.24s cubic-bezier(0.2,0,0,1)";
                    itemEl.style.pointerEvents = "none";
                    void itemEl.offsetHeight;
                    let finished = false;
                    let timeoutId = 0;
                    const cleanup = () => {
                        if (finished) return;
                        finished = true;
                        itemEl.removeEventListener("transitionend", onEnd);
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                            timeoutId = 0;
                        }
                        doneOne();
                    };
                    const onEnd = (e) => {
                        if (e.propertyName !== "max-height") return;
                        cleanup();
                    };
                    itemEl.addEventListener("transitionend", onEnd);
                    timeoutId = window.setTimeout(cleanup, 320);
                    itemEl.style.maxHeight = "0px";
                    itemEl.style.opacity = "0";
                    itemEl.style.transform = "translateY(-8px)";
                });
            };

            const renderQueueItems = () => {
                if (!queueListEl) return;
                if (!isChatHistoryQueueFeatureEnabled()) {
                    selectedQueueIds.clear();
                    updateBatchCount();
                    queueListEl.innerHTML = `<div style="font-size:12px; color:#999; text-align:center; padding:16px 8px; border:1px dashed #d1d5db; border-radius:8px;">请先在设置中开启“连续对话”，后台队列功能才会生效。</div>`;
                    return;
                }
                const items = getChatQueueItems();
                const existingIds = new Set(items.map((item) => item.id));
                Array.from(selectedQueueIds).forEach((id) => {
                    if (!existingIds.has(id)) selectedQueueIds.delete(id);
                });
                updateBatchCount();
                if (!items.length) {
                    queueListEl.innerHTML = `<div style="font-size:12px; color:#999; text-align:center; padding:16px 8px; border:1px dashed #d1d5db; border-radius:8px;">后台队列为空。关闭聊天框后会自动收纳到这里。</div>`;
                    return;
                }
                queueListEl.innerHTML = items.map((item) => `
                    <div data-queue-id="${item.id}" class="coolauxv-chat-history-queue-item ${selectedQueueIds.has(item.id) ? "coolauxv-selected" : ""}" style="border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; background:#f9fafb;">
                        <div style="display:flex; gap:8px; align-items:flex-start;">
                            <label class="coolauxv-chat-history-queue-item-select" style="cursor:pointer;">
                                <input type="checkbox" data-queue-select="${item.id}" ${selectedQueueIds.has(item.id) ? "checked" : ""}>
                            </label>
                            <div style="flex:1; min-width:0;">
                                <div style="font-size:13px; font-weight:700; color:#111827; margin-bottom:4px; word-break:break-word;">${escapeQueueText(getChatQueueDisplayTitle(item))}</div>
                                <div style="font-size:11px; color:#6b7280; margin-bottom:8px; word-break:break-word;">${escapeQueueText(buildQueueMetaText(item))}</div>
                            </div>
                        </div>
                        <div class="coolauxv-chat-history-queue-item-actions">
                            <button type="button" class="coolauxv-action-btn coolauxv-btn-primary" data-queue-action="restore" data-queue-id="${item.id}" style="flex:1 1 22%;">恢复</button>
                            <button type="button" class="coolauxv-action-btn" data-queue-action="rename" data-queue-id="${item.id}" style="flex:1 1 22%;">重命名</button>
                            <button type="button" class="coolauxv-action-btn" data-queue-action="export" data-queue-id="${item.id}" style="flex:1 1 22%;">导出</button>
                            <button type="button" class="coolauxv-action-btn" data-queue-action="delete" data-queue-id="${item.id}" style="flex:1 1 22%; background:#fee2e2; color:#b91c1c; border-color:#fecaca;">删除</button>
                        </div>
                    </div>
                `).join("");
                syncQueueSelectionUI();
                updateBatchModeClass();
            };

            if (exportBtn) {
                exportBtn.addEventListener("click", () => {
                    exportChatHistory();
                });
            }
            if (importBtn) {
                importBtn.addEventListener("click", () => {
                    openChatHistoryImportModal(() => {
                        renderQueueItems();
                    });
                });
            }
            if (batchToggleBtn) {
                batchToggleBtn.addEventListener("click", () => {
                    setBatchMode(!isBatchMode);
                });
            }
            if (batchSelectAllBtn) {
                batchSelectAllBtn.addEventListener("click", () => {
                    if (!isChatHistoryQueueFeatureEnabled()) {
                        alert("请先开启连续对话。");
                        return;
                    }
                    selectedQueueIds.clear();
                    getChatQueueItems().forEach((item) => selectedQueueIds.add(item.id));
                    updateBatchCount();
                    syncQueueSelectionUI();
                });
            }
            if (batchClearBtn) {
                batchClearBtn.addEventListener("click", () => {
                    selectedQueueIds.clear();
                    updateBatchCount();
                    syncQueueSelectionUI();
                });
            }
            if (batchExportBtn) {
                batchExportBtn.addEventListener("click", () => {
                    const selectedItems = getChatQueueItems().filter((item) => selectedQueueIds.has(item.id));
                    if (!selectedItems.length) {
                        alert("请先选择要导出的后台会话。");
                        return;
                    }
                    exportChatQueueItems(selectedItems);
                });
            }
            if (batchImportBtn) {
                batchImportBtn.addEventListener("click", () => {
                    if (!isChatHistoryQueueFeatureEnabled()) {
                        alert("请先开启连续对话。");
                        return;
                    }
                    openChatQueueImportModal((count) => {
                        selectedQueueIds.clear();
                        renderQueueItems();
                        alert(`已导入 ${count} 条后台会话。`);
                    });
                });
            }
            if (batchDeleteBtn) {
                batchDeleteBtn.addEventListener("click", () => {
                    if (!selectedQueueIds.size) {
                        alert("请先选择要删除的后台会话。");
                        return;
                    }
                    if (!confirm(`确定删除选中的 ${selectedQueueIds.size} 条后台会话吗？`)) return;
                    const toDeleteIds = Array.from(selectedQueueIds);
                    const toDeleteSet = new Set(toDeleteIds);
                    animateQueueItemRemoval(toDeleteIds, () => {
                        syncChatQueueFromPersistentStore();
                        chatBackgroundQueue = chatBackgroundQueue.filter((item) => !toDeleteSet.has(item.id));
                        persistChatQueueToGlobalStore();
                        selectedQueueIds.clear();
                        renderQueueItems();
                    });
                });
            }
            if (queueListEl) {
                queueListEl.addEventListener("change", (e) => {
                    if (!isBatchMode) return;
                    const selectInput = e.target.closest("[data-queue-select]");
                    if (!selectInput) return;
                    const queueId = selectInput.getAttribute("data-queue-select");
                    if (!queueId) return;
                    if (selectInput.checked) selectedQueueIds.add(queueId);
                    else selectedQueueIds.delete(queueId);
                    updateBatchCount();
                    syncQueueSelectionUI();
                });
                queueListEl.addEventListener("click", (e) => {
                    if (!isChatHistoryQueueFeatureEnabled()) {
                        alert("请先开启连续对话。");
                        return;
                    }
                    if (isBatchMode) return;
                    const actionBtn = e.target.closest("[data-queue-action]");
                    if (!actionBtn) return;
                    const action = actionBtn.getAttribute("data-queue-action");
                    const queueId = actionBtn.getAttribute("data-queue-id");
                    if (!queueId) return;
                    const item = getChatQueueItemById(queueId);
                    if (!item) {
                        alert("该会话不存在，列表将刷新。");
                        renderQueueItems();
                        return;
                    }
                    if (action === "restore") {
                        const parsedPayload = toChatHistoryImportPayload(item.payload);
                        if (!parsedPayload) {
                            alert("会话数据无效，无法恢复。");
                            return;
                        }
                        closeModal();
                        const applied = applyImportedChatHistory(parsedPayload);
                        if (applied) {
                            alert("已恢复该会话。");
                        }
                        return;
                    }
                    if (action === "rename") {
                        const currentTitle = String(getChatQueueDisplayTitle(item) || "连续对话").trim();
                        const nextTitleRaw = prompt("请输入新的会话名称（留空则自动命名）：", currentTitle);
                        if (nextTitleRaw === null) return;
                        const renamed = renameChatQueueItemById(queueId, nextTitleRaw);
                        if (!renamed) {
                            alert("重命名失败，请重试。");
                        }
                        renderQueueItems();
                        return;
                    }
                    if (action === "export") {
                        exportChatHistoryPayload(item.payload, {
                            title: item.title || "",
                            chatName: item.chatName || ""
                        });
                        return;
                    }
                    if (action === "delete") {
                        animateQueueItemRemoval([queueId], () => {
                            const ok = removeChatQueueItemById(queueId);
                            if (!ok) {
                                alert("删除失败，请重试。");
                            }
                            renderQueueItems();
                        });
                    }
                });
            }
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeModal();
            });
            setBatchMode(false);
            renderQueueItems();
        };

        queueCurrentChatSessionToBackground = () => {
            if (!isChatHistoryQueueFeatureEnabled()) return false;
            if (!isChatHistoryQueuePersistenceEnabled()) return false;
            const payload = buildChatHistoryExportPayload();
            if (!payload) return false;
            const queued = enqueueChatPayloadToQueue(payload, { createdAt: new Date().toISOString() });
            return !!queued;
        };

        openChatHistoryManager = async () => {
            openChatHistoryActionModal();
        };

        const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);
        const isEmptyValue = (value) => {
            if (value === null || value === undefined) return true;
            if (typeof value === "string") return value.trim() === "";
            if (Array.isArray(value)) return value.length === 0;
            if (isPlainObject(value)) return Object.keys(value).length === 0;
            return false;
        };
        const SHARE_PRESERVE_KEYS = new Set(["customFields", "customFieldMeta"]);
        const pruneEmptyValues = (value, preserveKeys = SHARE_PRESERVE_KEYS) => {
            if (Array.isArray(value)) {
                return value.map((item) => pruneEmptyValues(item, preserveKeys)).filter((item) => !isEmptyValue(item));
            }
            if (isPlainObject(value)) {
                const result = {};
                Object.keys(value).forEach((key) => {
                    const raw = value[key];
                    if (preserveKeys && preserveKeys.has(key)) {
                        if (!isEmptyValue(raw)) {
                            result[key] = raw;
                        }
                        return;
                    }
                    const next = pruneEmptyValues(raw, preserveKeys);
                    if (!isEmptyValue(next)) {
                        result[key] = next;
                    }
                });
                return result;
            }
            return value;
        };
        const isDeepEqual = (a, b) => {
            if (a === b) return true;
            if (typeof a !== typeof b) return false;
            if (Array.isArray(a)) {
                if (!Array.isArray(b) || a.length !== b.length) return false;
                for (let i = 0; i < a.length; i += 1) {
                    if (!isDeepEqual(a[i], b[i])) return false;
                }
                return true;
            }
            if (isPlainObject(a)) {
                if (!isPlainObject(b)) return false;
                const keysA = Object.keys(a);
                const keysB = Object.keys(b);
                if (keysA.length !== keysB.length) return false;
                for (let i = 0; i < keysA.length; i += 1) {
                    const key = keysA[i];
                    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
                    if (!isDeepEqual(a[key], b[key])) return false;
                }
                return true;
            }
            return false;
        };
        const deepMerge = (base, override) => {
            if (!isPlainObject(base) || !isPlainObject(override)) return override;
            const output = Object.assign({}, base);
            Object.keys(override).forEach((key) => {
                const nextVal = override[key];
                if (isPlainObject(nextVal) && isPlainObject(output[key])) {
                    output[key] = deepMerge(output[key], nextVal);
                } else {
                    output[key] = nextVal;
                }
            });
            return output;
        };
        const hashStringForShareId = (input) => {
            const text = String(input || "");
            let hashA = 0x811c9dc5;
            let hashB = 0x9e3779b1;
            for (let i = 0; i < text.length; i += 1) {
                const code = text.charCodeAt(i);
                hashA ^= code;
                hashA = Math.imul(hashA, 0x01000193);
                hashB ^= code + i;
                hashB = Math.imul(hashB, 0x85ebca6b);
            }
            return `${(hashA >>> 0).toString(36)}${(hashB >>> 0).toString(36)}`;
        };
        const buildHashedShareTemplateId = (template, kind, extraSalt = "") => {
            const payload = cloneDeep(template || {});
            payload.id = "";
            if (Object.prototype.hasOwnProperty.call(payload, "sourceId")) {
                payload.sourceId = "";
            }
            const seed = `${JSON.stringify(payload)}|${Date.now()}|${extraSalt}`;
            const hash = hashStringForShareId(seed).slice(0, 10) || Date.now().toString(36).slice(-8);
            const rawId = `${kind === "provider" ? "provider" : "action"}-${hash}`;
            return kind === "provider" ? normalizeProviderId(rawId) : normalizeActionId(rawId);
        };
        const buildShareTemplateWithHashedId = (template, kind, extraSalt = "", usedIds = null) => {
            if (!template || typeof template !== "object") return template;
            const clone = cloneDeep(template);
            const originalId = String(clone.id || "").trim();
            let nextId = buildHashedShareTemplateId(clone, kind, extraSalt);
            if (usedIds && typeof usedIds.has === "function" && typeof usedIds.add === "function") {
                let attempt = 0;
                while (usedIds.has(nextId) && attempt < 32) {
                    attempt += 1;
                    nextId = buildHashedShareTemplateId(clone, kind, `${extraSalt}|${attempt}`);
                }
                if (usedIds.has(nextId)) {
                    const rawFallback = `${kind === "provider" ? "provider" : "action"}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
                    nextId = kind === "provider" ? normalizeProviderId(rawFallback) : normalizeActionId(rawFallback);
                }
                usedIds.add(nextId);
            }
            clone.id = nextId;
            if (originalId) {
                clone.sourceId = originalId;
            } else if (Object.prototype.hasOwnProperty.call(clone, "sourceId")) {
                delete clone.sourceId;
            }
            return clone;
        };
        let defaultProviderTemplateMapCache = null;
        const getDefaultProviderTemplateMap = () => {
            if (defaultProviderTemplateMapCache) return defaultProviderTemplateMapCache;
            const map = {};
            getDefaultProviderTemplates().forEach((tpl) => {
                map[tpl.id] = tpl;
            });
            defaultProviderTemplateMapCache = map;
            return map;
        };
        const mergeProviderDefaults = (raw) => {
            if (!raw || typeof raw !== "object") return raw;
            const providerId = normalizeProviderId(raw.id || "");
            const sourceProviderId = normalizeProviderId(raw.sourceId || raw.templateId || "");
            const defaults = getDefaultProviderTemplateMap();
            const matchId = (providerId && defaults[providerId])
                ? providerId
                : ((sourceProviderId && defaults[sourceProviderId]) ? sourceProviderId : "");
            if (!matchId) return raw;
            const base = defaults[matchId];
            if (!base) return raw;
            return deepMerge(cloneDeep(base), raw);
        };
        const compactProviderTemplate = (tpl) => {
            if (!tpl || typeof tpl !== "object") return tpl;
            const clone = cloneDeep(tpl);
            const defaults = getDefaultProviderTemplateMap();
            const defaultTpl = clone.id ? defaults[clone.id] : null;
            const normalizedType = normalizeProviderType(clone.type);

            if (defaultTpl) {
                Object.keys(clone).forEach((key) => {
                    if (key === "id") return;
                    if (isDeepEqual(clone[key], defaultTpl[key])) {
                        delete clone[key];
                    }
                });
            }

            if (clone.type === "chat-completions") delete clone.type;
            if (clone.label && clone.id && clone.label === clone.id) delete clone.label;
            if (clone.keyLinkTitle === DEFAULT_KEY_LINK_TITLE) delete clone.keyLinkTitle;

            const defaultRoles = { system: "system", user: "user", assistant: "assistant" };
            if (clone.roles && isDeepEqual(clone.roles, defaultRoles)) delete clone.roles;

            const defaultHeaders = { "Content-Type": "application/json" };
            if (clone.headersTemplate && isDeepEqual(clone.headersTemplate, defaultHeaders)) delete clone.headersTemplate;

            const defaultBody = getDefaultBodyTemplateByType(normalizedType);
            if (clone.bodyTemplate && isDeepEqual(clone.bodyTemplate, defaultBody)) delete clone.bodyTemplate;

            const defaultStream = getDefaultStreamTemplateByType(normalizedType);
            if (clone.stream && isDeepEqual(clone.stream, defaultStream)) delete clone.stream;

            if (clone.supportsContinuousChat === true) delete clone.supportsContinuousChat;
            if (clone.supportsVision !== undefined) {
                const defaultSupportsVision = Array.isArray(clone.modelGroups)
                    && clone.modelGroups.some((group) => (group.type || "text") === "vision");
                if (clone.supportsVision === defaultSupportsVision) delete clone.supportsVision;
            }

            if (clone.display && isPlainObject(clone.display)) {
                const nextDisplay = {};
                Object.keys(clone.display).forEach((key) => {
                    if (clone.display[key] !== DEFAULT_DISPLAY_FIELDS[key]) {
                        nextDisplay[key] = clone.display[key];
                    }
                });
                if (Object.keys(nextDisplay).length) clone.display = nextDisplay;
                else delete clone.display;
            }

            if (Array.isArray(clone.modelGroups)) {
                clone.modelGroups = clone.modelGroups.map((group) => {
                    const nextGroup = Object.assign({}, group);
                    if (nextGroup.type === "text") delete nextGroup.type;
                    if (Array.isArray(nextGroup.models)) {
                        nextGroup.models = nextGroup.models.map((model) => {
                            const id = String(model.id || model.name || "").trim();
                            if (!id) return null;
                            const nextModel = { id: id };
                            const modelClass = String(model.class || "").trim();
                            const modelTag = String(model.tag || "").trim();
                            if (modelClass) nextModel.class = modelClass;
                            if (modelTag) nextModel.tag = modelTag;
                            return nextModel;
                        }).filter(Boolean);
                    }
                    if (nextGroup.selectedModel) {
                        const first = nextGroup.models && nextGroup.models.length ? nextGroup.models[0].id : "";
                        if (!first || nextGroup.selectedModel === first) {
                            delete nextGroup.selectedModel;
                        }
                    }
                    return nextGroup;
                });
            }

            if (clone.customFieldMeta && isPlainObject(clone.customFieldMeta)) {
                const resolvedDisplay = Object.assign({}, DEFAULT_DISPLAY_FIELDS, clone.display || {});
                const displayDefaults = {
                    display: !(resolvedDisplay.customFields === false),
                    masked: !!resolvedDisplay.customFieldsMask
                };
                const nextMeta = {};
                Object.keys(clone.customFieldMeta).forEach((key) => {
                    const meta = clone.customFieldMeta[key] || {};
                    const displayVal = meta.display !== undefined ? !!meta.display : displayDefaults.display;
                    const maskedVal = meta.masked !== undefined ? !!meta.masked : displayDefaults.masked;
                    if (displayVal !== displayDefaults.display || maskedVal !== displayDefaults.masked) {
                        nextMeta[key] = { display: displayVal, masked: maskedVal };
                    }
                });
                if (Object.keys(nextMeta).length) clone.customFieldMeta = nextMeta;
                else delete clone.customFieldMeta;
            }

            return pruneEmptyValues(clone);
        };
        let defaultActionTemplateMapCache = null;
        const getDefaultActionTemplateMap = () => {
            if (defaultActionTemplateMapCache) return defaultActionTemplateMapCache;
            const map = {};
            getDefaultActionTemplates().forEach((tpl) => {
                map[tpl.id] = tpl;
            });
            defaultActionTemplateMapCache = map;
            return map;
        };
        const mergeActionDefaults = (raw) => {
            if (!raw || typeof raw !== "object") return raw;
            const actionId = normalizeActionId(raw.id || "");
            const sourceActionId = normalizeActionId(raw.sourceId || raw.templateId || "");
            const defaults = getDefaultActionTemplateMap();
            const matchId = (actionId && defaults[actionId])
                ? actionId
                : ((sourceActionId && defaults[sourceActionId]) ? sourceActionId : "");
            if (!matchId) return raw;
            const base = defaults[matchId];
            if (!base) return raw;
            return deepMerge(cloneDeep(base), raw);
        };
        const compactActionTemplate = (tpl) => {
            if (!tpl || typeof tpl !== "object") return tpl;
            const clone = cloneDeep(tpl);
            const defaults = getDefaultActionTemplateMap();
            const defaultTpl = clone.id ? defaults[clone.id] : null;
            if (defaultTpl) {
                Object.keys(clone).forEach((key) => {
                    if (key === "id") return;
                    if (isDeepEqual(clone[key], defaultTpl[key])) {
                        delete clone[key];
                    }
                });
            }
            if (clone.label && clone.id && clone.label === clone.id) delete clone.label;
            if (clone.visionPromptOrder === "after") delete clone.visionPromptOrder;
            if (normalizeActionWeight(clone.weight) === 1) delete clone.weight;
            if (clone.id === "translate" && clone.systemPrompt === getDefaultActionPromptById("translate")) delete clone.systemPrompt;
            if (clone.id === "explain" && clone.systemPrompt === getDefaultActionPromptById("explain")) delete clone.systemPrompt;
            if (clone.color) {
                const normalizedColor = normalizeColorValue(clone.color || "", "");
                const defaultColor = getDefaultActionColorById(clone.id, clone);
                if (normalizedColor === normalizeColorValue(defaultColor, defaultColor)) {
                    delete clone.color;
                } else {
                    clone.color = normalizedColor;
                }
            }
            return pruneEmptyValues(clone);
        };
        const compactConfigSnapshot = (snapshot) => {
            const next = Object.assign({}, snapshot);
            const defaults = {
                coolauxv_default_provider: DEFAULT_PROVIDER,
                coolauxv_model_provider: DEFAULT_MODEL_PROVIDER,
                coolauxv_win_width: DEFAULT_WIN_WIDTH,
                coolauxv_win_height: DEFAULT_WIN_HEIGHT,
                coolauxv_log_level: DEFAULT_LOG_LEVEL,
                coolauxv_use_new_screenshot: DEFAULT_USE_NEW_SCREENSHOT,
                coolauxv_enable_continuous_chat: DEFAULT_ENABLE_CONTINUOUS_CHAT,
                coolauxv_chat_history_persist: DEFAULT_CHAT_HISTORY_PERSIST,
                coolauxv_chat_enter_send: DEFAULT_CHAT_ENTER_SEND,
                coolauxv_enable_basic_anim: DEFAULT_ENABLE_BASIC_ANIM,
                coolauxv_enable_minimize_anim: DEFAULT_ENABLE_MINIMIZE_ANIM,
                coolauxv_anim_speed: DEFAULT_ANIM_SPEED,
                coolauxv_enable_blur_glass: DEFAULT_ENABLE_BLUR_GLASS,
                coolauxv_persistent_ball: false,
                coolauxv_draggable_ball: false,
                coolauxv_append_trans: false,
                coolauxv_append_explain: false,
                coolauxv_append_vision: false,
                coolauxv_append_chat: false
            };
            Object.keys(defaults).forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(next, key) && isDeepEqual(next[key], defaults[key])) {
                    delete next[key];
                }
            });
            const pruneDefaultPrompt = (key, defaultValue, appendKey) => {
                if (!Object.prototype.hasOwnProperty.call(next, key)) return;
                const val = String(next[key] || "");
                const isAppend = appendKey ? !!next[appendKey] : false;
                if (!val.trim()) {
                    delete next[key];
                    if (appendKey) delete next[appendKey];
                    return;
                }
                if (!isAppend && val === defaultValue) {
                    delete next[key];
                }
            };
            pruneDefaultPrompt("coolauxv_prompt_trans", getDefaultActionPromptById("translate"), "coolauxv_append_trans");
            pruneDefaultPrompt("coolauxv_prompt_explain", getDefaultActionPromptById("explain"), "coolauxv_append_explain");
            pruneDefaultPrompt("coolauxv_prompt_vision", DEFAULT_PROMPT_VISION, "coolauxv_append_vision");
            pruneDefaultPrompt("coolauxv_prompt_chat", DEFAULT_PROMPT_CONTINUOUS_CHAT, "coolauxv_append_chat");
            if (Object.prototype.hasOwnProperty.call(next, "coolauxv_use_new_screenshot")) {
                const val = next.coolauxv_use_new_screenshot;
                if (val === "v1" || val === false) {
                    delete next.coolauxv_use_new_screenshot;
                }
            }
            if (Object.prototype.hasOwnProperty.call(next, ACTION_TEMPLATE_STORAGE_KEY)) {
                const rawActionList = next[ACTION_TEMPLATE_STORAGE_KEY];
                if (Array.isArray(rawActionList) && rawActionList.every((item) => typeof item === "string")) {
                    const cleaned = rawActionList.map((item) => String(item || "").trim()).filter(Boolean);
                    if (cleaned.length) next[ACTION_TEMPLATE_STORAGE_KEY] = cleaned;
                    else delete next[ACTION_TEMPLATE_STORAGE_KEY];
                } else {
                    const parsedActions = deserializeActionTemplateList(rawActionList).templates;
                    if (parsedActions.length) {
                        next[ACTION_TEMPLATE_STORAGE_KEY] = serializeActionTemplateList(
                            parsedActions.map((tpl) => compactActionTemplate(tpl))
                        );
                    } else {
                        delete next[ACTION_TEMPLATE_STORAGE_KEY];
                    }
                }
            }
            return next;
        };

        const snapshotConfig = () => {
            const data = {};
            CONFIG_KEYS.forEach((key) => {
                const value = GM_getValue(key);
                if (value !== undefined) {
                    data[key] = value;
                }
            });
            return data;
        };

        const applyConfigSnapshot = (data) => {
            const payload = data && typeof data === "object" ? Object.assign({}, data) : {};
            if (Array.isArray(payload[PROVIDER_TEMPLATE_STORAGE_KEY])) {
                payload[PROVIDER_TEMPLATE_STORAGE_KEY] = payload[PROVIDER_TEMPLATE_STORAGE_KEY]
                    .map((tpl) => mergeProviderDefaults(tpl));
            }
            if (Object.prototype.hasOwnProperty.call(payload, ACTION_TEMPLATE_STORAGE_KEY)) {
                const rawActionList = payload[ACTION_TEMPLATE_STORAGE_KEY];
                if (Array.isArray(rawActionList) && rawActionList.every((item) => typeof item === "string")) {
                    const cleaned = rawActionList.map((item) => String(item || "").trim()).filter(Boolean);
                    if (cleaned.length) {
                        payload[ACTION_TEMPLATE_STORAGE_KEY] = cleaned;
                    } else {
                        delete payload[ACTION_TEMPLATE_STORAGE_KEY];
                    }
                } else {
                    const parsedActions = deserializeActionTemplateList(rawActionList).templates
                        .map((tpl) => mergeActionDefaults(tpl))
                        .filter(Boolean);
                    if (parsedActions.length) {
                        payload[ACTION_TEMPLATE_STORAGE_KEY] = serializeActionTemplateList(parsedActions);
                    } else {
                        delete payload[ACTION_TEMPLATE_STORAGE_KEY];
                    }
                }
            }
            let importedChatQueue = null;
            if (Object.prototype.hasOwnProperty.call(payload, CHAT_QUEUE_STORAGE_KEY)) {
                importedChatQueue = normalizeChatQueueList(payload[CHAT_QUEUE_STORAGE_KEY]);
            }
            CONFIG_KEYS.forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(payload, key)) {
                    const value = payload[key];
                    if (isEmptyValue(value)) {
                        GM_deleteValue(key);
                    } else {
                        GM_setValue(key, value);
                    }
                } else {
                    GM_deleteValue(key);
                }
            });
            if (importedChatQueue !== null) {
                if (importedChatQueue.length) {
                    savePersistentChatQueue(importedChatQueue);
                } else {
                    GM_deleteValue(CHAT_QUEUE_STORAGE_KEY);
                }
                chatBackgroundQueue = importedChatQueue.slice(0, CHAT_QUEUE_MAX_SIZE);
                chatQueuePersistBootstrapped = true;
            }
            providerTemplatesCache = null;
            actionTemplatesCache = null;
            migrateLegacyProviderSettings(loadProviderTemplates());
            const resolvedActionId = resolveActionTemplateId(
                payload.coolauxv_selection_icon_action || GM_getValue("coolauxv_selection_icon_action", DEFAULT_SELECTION_ICON_ACTION),
                loadActionTemplates()
            );
            GM_setValue("coolauxv_selection_icon_action", resolvedActionId);
            if (payload && payload.coolauxv_cnb_repo) {
                const templates = getProviderTemplates();
                const tpl = templates.find((item) => item.id === "cnb");
                if (tpl) {
                    tpl.customFields = normalizeCustomFields(tpl.customFields);
                    if (!Object.prototype.hasOwnProperty.call(tpl.customFields, "repo")) {
                        tpl.customFields.repo = payload.coolauxv_cnb_repo;
                        saveProviderTemplates(templates);
                    }
                }
            }
            sanitizeMaskedCustomFields(getProviderTemplates());
            LEGACY_CONFIG_KEYS.forEach((key) => GM_deleteValue(key));
        };
        sanitizeMaskedCustomFields(migrateLegacyProviderSettings(loadProviderTemplates()));

        radioBtns.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    saveConfig("coolauxv_log_level", e.target.value);
                }
            });
        });
        const noneLogRadio = Array.from(radioBtns).find((radio) => radio.value === "none");
        if (noneLogRadio) {
            noneLogRadio.addEventListener("click", () => {
                showModal("提示", "反馈bug需启用详细日志");
            });
        }

        const saveConfig = (key, value) => {
            const val = value.trim();
            if (val) GM_setValue(key, val);
            else GM_deleteValue(key);
            if (!val && key === "coolauxv_zhipu_api_key") {
                GM_deleteValue("coolauxv_api_key");
            }
        };
        const clearLegacyProviderValueIfNeeded = (providerId, field, value) => {
            const trimmed = String(value === undefined || value === null ? "" : value).trim();
            if (field === "apiKey" && !trimmed) {
                if (providerId === "zhipu") {
                    GM_deleteValue("coolauxv_zhipu_api_key");
                    GM_deleteValue("coolauxv_api_key");
                } else if (providerId === "openai") {
                    GM_deleteValue("coolauxv_openai_api_key");
                } else if (providerId === "cnb") {
                    GM_deleteValue("coolauxv_cnb_api_key");
                }
                return;
            }
            if (providerId === "cnb" && field === "customFields.repo" && !trimmed) {
                GM_deleteValue("coolauxv_cnb_repo");
            }
        };
        const providerSectionStates = new Map();
        let isProviderBatchMode = false;
        const selectedProviderIds = new Set();
        const actionSectionStates = new Map();
        let isActionBatchMode = false;
        const selectedActionIds = new Set();
        let draggingProviderId = "";
        let draggingActionId = "";
        let providerDragArmedId = "";
        let actionDragArmedId = "";

        const escapeAttr = (value) => String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        const escapeText = (value) => String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        const formatTemplateJson = (value) => {
            try {
                return JSON.stringify(value || {}, null, 2);
            } catch (e) {
                return "{}";
            }
        };

        const parseTemplateJson = (text) => {
            try {
                return JSON.parse(text);
            } catch (e) {
                return null;
            }
        };

        const reorderListById = (list, dragId, targetId) => {
            if (!Array.isArray(list) || !dragId || !targetId || dragId === targetId) return list;
            const fromIdx = list.findIndex((item) => item && item.id === dragId);
            const toIdx = list.findIndex((item) => item && item.id === targetId);
            if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return list;
            const next = list.slice();
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            return next;
        };

        const captureSortPositions = (container, selector, getId) => {
            const map = new Map();
            if (!container) return map;
            container.querySelectorAll(selector).forEach((item) => {
                const id = getId(item);
                if (!id) return;
                map.set(id, item.getBoundingClientRect().top);
            });
            return map;
        };

        const animateSortReflow = (container, selector, getId, beforeMap) => {
            if (!container || !beforeMap || !beforeMap.size) return;
            container.querySelectorAll(selector).forEach((item) => {
                if (item.classList.contains("coolauxv-dragging")) return;
                const id = getId(item);
                if (!id) return;
                const fromTop = beforeMap.get(id);
                if (fromTop === undefined) return;
                const toTop = item.getBoundingClientRect().top;
                const deltaY = fromTop - toTop;
                if (Math.abs(deltaY) < 0.5) return;
                if (typeof item.animate === "function") {
                    item.animate(
                        [
                            { transform: `translateY(${deltaY}px)` },
                            { transform: "translateY(0)" }
                        ],
                        { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }
                    );
                    return;
                }
                item.style.transition = "none";
                item.style.transform = `translateY(${deltaY}px)`;
                void item.offsetHeight;
                item.style.transition = "transform 180ms cubic-bezier(0.2, 0, 0, 1)";
                item.style.transform = "translateY(0)";
                window.setTimeout(() => {
                    item.style.transition = "";
                    item.style.transform = "";
                }, 200);
            });
        };

        const reorderTemplatesByOrderedIds = (templates, orderedIds) => {
            if (!Array.isArray(templates) || !Array.isArray(orderedIds) || !orderedIds.length) return templates;
            const tplMap = new Map();
            templates.forEach((tpl) => {
                if (tpl && tpl.id) tplMap.set(tpl.id, tpl);
            });
            const next = [];
            const used = new Set();
            orderedIds.forEach((id) => {
                if (!id || used.has(id)) return;
                const tpl = tplMap.get(id);
                if (!tpl) return;
                next.push(tpl);
                used.add(id);
            });
            templates.forEach((tpl) => {
                if (!tpl || !tpl.id || used.has(tpl.id)) return;
                next.push(tpl);
            });
            return next;
        };

        const defaultBodyTemplateForType = (type) => {
            if (type === "openai-responses") {
                return { model: "{{model}}", stream: true, input: "{{messages}}" };
            }
            if (type === "chat-parts") {
                return { model: "{{model}}", id: "{{requestId}}", messages: "{{messages}}", trigger: "{{trigger}}" };
            }
            if (type === "chat-no-history") {
                return {
                    conversationId: "{{conversationId}}",
                    content: "{{latestUserText}}",
                    model: "{{model}}"
                };
            }
            if (type === "ollama") {
                return { model: "{{model}}", stream: true, messages: "{{messages}}" };
            }
            return { model: "{{model}}", stream: true, messages: "{{messages}}" };
        };

        const isSectionExpanded = (section) => {
            if (!section) return false;
            if (section.dataset && section.dataset.expanding === "true") return true;
            return section.style.display !== "none" && !section.classList.contains("coolauxv-collapsed");
        };

        const setSectionStateInstant = (section, expanded) => {
            if (!section) return;
            if (expanded) {
                section.dataset.expanding = "";
                resetCollapsedBoxStyles(section);
                section.style.display = "block";
                section.classList.remove("coolauxv-collapsed");
                section.style.height = "";
                section.style.maxHeight = "none";
                section.style.opacity = "1";
                section.style.transform = "translateY(0)";
            } else {
                section.dataset.expanding = "";
                applyCollapsedBoxStyles(section);
                section.style.display = "none";
                section.classList.add("coolauxv-collapsed");
                section.style.height = "0px";
                section.style.maxHeight = "0px";
                section.style.opacity = "0";
                section.style.transform = "translateY(-4px)";
            }
        };

        const setSectionAnimatedVisibility = (section, visible) => {
            if (!section) return;
            if (visible) {
                if (isSectionExpanded(section)) return;
                section.dataset.expanding = "true";
                resetCollapsedBoxStyles(section);
                section.style.display = "block";
                section.classList.add("coolauxv-collapsed");
                section.style.height = "0px";
                section.style.maxHeight = "0px";
                section.style.opacity = "0";
                section.style.transform = "translateY(-4px)";
                requestAnimationFrame(() => {
                    const targetHeight = Math.max(section.getBoundingClientRect().height, section.scrollHeight, 1);
                    section.style.height = `${targetHeight}px`;
                    section.style.maxHeight = `${targetHeight}px`;
                    section.classList.remove("coolauxv-collapsed");
                    section.style.opacity = "1";
                    section.style.transform = "translateY(0)";
                    let timeoutId = 0;
                    const onEnd = (e) => {
                        if (e.propertyName !== "max-height") return;
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                            timeoutId = 0;
                        }
                        if (!section.classList.contains("coolauxv-collapsed")) {
                            section.style.height = "";
                            section.style.maxHeight = "none";
                            resetCollapsedBoxStyles(section);
                        }
                        section.dataset.expanding = "";
                        section.removeEventListener("transitionend", onEnd);
                    };
                    section.addEventListener("transitionend", onEnd);
                    timeoutId = window.setTimeout(() => {
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                            timeoutId = 0;
                        }
                        if (!section.classList.contains("coolauxv-collapsed")) {
                            section.style.height = "";
                            section.style.maxHeight = "none";
                            resetCollapsedBoxStyles(section);
                        }
                        section.dataset.expanding = "";
                        section.removeEventListener("transitionend", onEnd);
                    }, 320);
                });
                return;
            }

            if (section.style.display === "none") return;
            section.dataset.expanding = "";
            resetCollapsedBoxStyles(section);
            const currentHeight = Math.max(section.getBoundingClientRect().height, section.scrollHeight, 1);
            section.style.height = `${currentHeight}px`;
            section.style.maxHeight = `${currentHeight}px`;
            void section.offsetHeight;
            section.classList.add("coolauxv-collapsed");
            section.style.height = "0px";
            section.style.maxHeight = "0px";
            section.style.opacity = "0";
            section.style.transform = "translateY(-4px)";
            let timeoutId = 0;
            const onEnd = (e) => {
                if (e.propertyName !== "max-height") return;
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = 0;
                }
                if (section.classList.contains("coolauxv-collapsed")) {
                    applyCollapsedBoxStyles(section);
                    section.style.display = "none";
                }
                section.removeEventListener("transitionend", onEnd);
            };
            section.addEventListener("transitionend", onEnd);
            timeoutId = window.setTimeout(() => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = 0;
                }
                if (section.classList.contains("coolauxv-collapsed")) {
                    applyCollapsedBoxStyles(section);
                    section.style.display = "none";
                }
                section.removeEventListener("transitionend", onEnd);
            }, 320);
        };

        const updateProviderToggleLabels = () => {
            if (!providerSectionsContainer) return;
            const sections = Array.from(providerSectionsContainer.querySelectorAll("[data-provider-section]"));
            sections.forEach((section) => {
                const providerId = section.dataset.providerSection;
                const toggle = providerSectionsContainer.querySelector(`[data-provider-toggle="${providerId}"]`);
                if (toggle) toggle.textContent = isSectionExpanded(section) ? "收起" : "展开";
            });
            if (!btnToggleProviderAll) return;
            if (!sections.length) return;
            const allExpanded = sections.every((section) => isSectionExpanded(section));
            btnToggleProviderAll.textContent = allExpanded ? "收起全部" : "展开全部";
        };

        const ensureProviderSectionStates = (templates, defaultProviderId) => {
            templates.forEach((tpl) => {
                if (!providerSectionStates.has(tpl.id)) {
                    providerSectionStates.set(tpl.id, tpl.id === defaultProviderId);
                }
            });
            Array.from(providerSectionStates.keys()).forEach((id) => {
                if (!templates.some((tpl) => tpl.id === id)) {
                    providerSectionStates.delete(id);
                }
            });
        };

        const applyProviderSectionStates = () => {
            if (!providerSectionsContainer) return;
            providerSectionsContainer.querySelectorAll("[data-provider-section]").forEach((section) => {
                const providerId = section.dataset.providerSection;
                const expanded = providerSectionStates.get(providerId);
                setSectionStateInstant(section, !!expanded);
            });
            updateProviderToggleLabels();
        };

        const updateBatchModeUI = () => {
            if (settingsRoot) {
                settingsRoot.classList.toggle("coolauxv-batch-mode", isProviderBatchMode);
            }
            if (btnProviderBatch) {
                const enableAnim = isBasicAnimEnabled();
                btnProviderBatch.classList.toggle("coolauxv-batch-toggle-active", isProviderBatchMode);
                btnProviderBatch.classList.toggle("coolauxv-no-anim", !enableAnim);
                const textEl = btnProviderBatch.querySelector("[data-batch-toggle-text]");
                if (textEl) {
                    textEl.textContent = isProviderBatchMode ? "完成批量" : "批量";
                } else {
                    btnProviderBatch.textContent = isProviderBatchMode ? "完成批量" : "批量";
                }
            }
            if (!providerSectionsContainer) return;
            providerSectionsContainer.querySelectorAll(".coolauxv-provider-select").forEach((checkbox) => {
                checkbox.checked = selectedProviderIds.has(checkbox.dataset.providerId);
            });
            providerSectionsContainer.querySelectorAll("[data-sort-kind=\"provider\"]").forEach((item) => {
                item.draggable = !!isProviderBatchMode;
                const handle = item.querySelector("[data-sort-handle=\"provider\"]");
                if (handle) handle.draggable = !!isProviderBatchMode;
                if (!isProviderBatchMode) {
                    item.classList.remove("coolauxv-dragging", "coolauxv-drag-over");
                }
            });
            if (!isProviderBatchMode) {
                draggingProviderId = "";
                providerDragArmedId = "";
            }
        };

        const openProviderModal = (options = {}) => {
            const mode = options.mode === "edit" ? "edit" : "add";
            const templates = getProviderTemplates();
            const existing = mode === "edit"
                ? templates.find((tpl) => tpl.id === options.providerId)
                : null;
            const baseTemplate = existing ? cloneDeep(existing) : {
                id: "",
                label: "",
                type: "chat-completions",
                baseUrl: "",
                apiKey: "",
                apiKeyPlaceholder: "",
                keyLink: "",
                keyLinkTitle: DEFAULT_KEY_LINK_TITLE,
                roles: { system: "system", user: "user", assistant: "assistant" },
                headersTemplate: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer {{apiKey}}"
                },
                bodyTemplate: defaultBodyTemplateForType("chat-completions"),
                stream: {
                    parser: "chat-completions",
                    deltaPath: "choices.0.delta.content",
                    reasoningPath: "",
                    sessionIdPath: "",
                    sessionIdKey: DEFAULT_PROVIDER_SESSION_FIELD_KEY,
                    reasoningTag: ""
                },
                supportsVision: false,
                supportsContinuousChat: true,
                modelGroups: [{ id: "general", label: "通用模型", type: "text", models: [] }],
                display: Object.assign({}, DEFAULT_DISPLAY_FIELDS),
                customFields: {}
            };
            const displayState = Object.assign({}, DEFAULT_DISPLAY_FIELDS, baseTemplate.display || {});
            let modelGroups = normalizeModelGroups(baseTemplate);
            const customFieldsSeed = normalizeCustomFields(baseTemplate.customFields);
            const customFieldMetaSeed = normalizeCustomFieldMeta(baseTemplate.customFieldMeta || baseTemplate.customFields, customFieldsSeed, baseTemplate.display || {});
            if (baseTemplate.repo && !Object.prototype.hasOwnProperty.call(customFieldsSeed, "repo")) {
                customFieldsSeed.repo = String(baseTemplate.repo || "");
            }
            if (baseTemplate.id) {
                const secrets = getProviderSecretFields(baseTemplate.id);
                Object.keys(customFieldsSeed).forEach((key) => {
                    if (customFieldMetaSeed[key] && customFieldMetaSeed[key].masked) {
                        if (Object.prototype.hasOwnProperty.call(secrets, key)) {
                            customFieldsSeed[key] = secrets[key];
                        }
                    }
                });
            }
            let customFieldList = Object.keys(customFieldsSeed).map((key) => ({
                key: key,
                value: customFieldsSeed[key],
                display: customFieldMetaSeed[key] ? !!customFieldMetaSeed[key].display : true,
                masked: customFieldMetaSeed[key] ? !!customFieldMetaSeed[key].masked : false
            }));

            const existingOverlay = document.getElementById("coolauxv-provider-modal-overlay");
            if (existingOverlay && existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay);
            }

            const overlay = document.createElement("div");
            overlay.id = "coolauxv-provider-modal-overlay";
            Object.assign(overlay.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                background: "rgba(0, 0, 0, 0.5)",
                zIndex: "2147483661",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backdropFilter: "blur(4px)",
                opacity: "0",
                transition: "opacity 0.2s"
            });

            const box = document.createElement("div");
            Object.assign(box.style, {
                background: "#fff",
                width: "540px",
                maxWidth: "92%",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                padding: "18px",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                transform: "scale(0.96)",
                transition: "transform 0.2s",
                overflow: "hidden"
            });

            const titleText = mode === "edit" ? "⚙️ 高级选项" : "➕ 新增提供商";
            const submitText = mode === "edit" ? "保存修改" : "保存";
            const displayCheck = (key) => displayState[key] ? "checked" : "";
            const idReadonly = "";
            const headersJson = formatTemplateJson(baseTemplate.headersTemplate);
            const bodyJson = formatTemplateJson(baseTemplate.bodyTemplate);
            const deltaPathVal = baseTemplate.stream && baseTemplate.stream.deltaPath ? baseTemplate.stream.deltaPath : "choices.0.delta.content";
            const reasoningPathVal = baseTemplate.stream && baseTemplate.stream.reasoningPath ? baseTemplate.stream.reasoningPath : "";
            const sessionIdPathVal = baseTemplate.stream && baseTemplate.stream.sessionIdPath ? baseTemplate.stream.sessionIdPath : "";
            const sessionIdKeyVal = baseTemplate.stream && baseTemplate.stream.sessionIdKey
                ? baseTemplate.stream.sessionIdKey
                : DEFAULT_PROVIDER_SESSION_FIELD_KEY;
            const reasoningTagVal = baseTemplate.stream && baseTemplate.stream.reasoningTag
                ? String(baseTemplate.stream.reasoningTag).trim().toLowerCase()
                : "";

            box.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
                    <div style="font-size:18px; font-weight:800; color:#a516e8;">${titleText}</div>
                    <button type="button" id="coolauxv-provider-modal-close" class="coolauxv-ctrl-btn" title="关闭">×</button>
                </div>
                <div style="display:flex; gap:8px; margin-bottom:10px;">
                    <button type="button" id="coolauxv-provider-mode-manual" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">手动填写</button>
                    <button type="button" id="coolauxv-provider-mode-base64" class="coolauxv-action-btn" style="flex:1;">Base64 导入</button>
                </div>
                <div id="coolauxv-provider-form-body" style="flex:1; overflow-y:auto; padding-right:4px;">
                    <div id="coolauxv-provider-form-manual" style="display:flex; flex-direction:column; gap:10px;">
                        <div style="font-size:12px; font-weight:700; color:#666;">基础信息</div>
                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">显示名称 ({{providerLabel}})
                            <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                <input type="checkbox" data-display-key="label" ${displayCheck("label")}> 默认展示
                            </label>
                        </div>
                        <input type="text" id="coolauxv-provider-form-label" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="例如：MyProvider" value="${escapeAttr(baseTemplate.label)}">

                        <div class="coolauxv-sub-label">Provider ID (唯一, {{providerId}})</div>
                        <input type="text" id="coolauxv-provider-form-id" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="例如：my-provider" value="${escapeAttr(baseTemplate.id)}" ${idReadonly}>
                        <div id="coolauxv-provider-id-warning" style="display:none; margin-top:-4px; font-size:12px; color:#dc2626;">Provider ID 已存在，请更换其他 ID。</div>

                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">Base URL ({{baseUrl}}，支持 {{key_name}})
                            <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                <input type="checkbox" data-display-key="baseUrl" ${displayCheck("baseUrl")}> 默认展示
                            </label>
                        </div>
                        <input type="text" id="coolauxv-provider-form-base-url" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="https://api.example.com/v1/chat/completions" value="${escapeAttr(baseTemplate.baseUrl)}">

                        <div style="font-size:12px; font-weight:700; color:#666; margin-top:2px;">鉴权与链接</div>
                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">API KEY ({{apiKey}})
                            <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                <input type="checkbox" data-display-key="apiKey" ${displayCheck("apiKey")}> 默认展示
                            </label>
                        </div>
                        <div style="font-size:11px; color:#888; margin-bottom:8px;">API KEY 请在主界面填写。</div>

                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">API KEY Placeholder ({{apiKeyPlaceholder}})
                            <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                <input type="checkbox" data-display-key="apiKeyPlaceholder" ${displayCheck("apiKeyPlaceholder")}> 默认展示
                            </label>
                        </div>
                        <input type="text" id="coolauxv-provider-form-api-key-placeholder" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="默认占位符" value="${escapeAttr(baseTemplate.apiKeyPlaceholder || "")}">

                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">KEY 获取链接 ({{keyLink}})
                            <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                <input type="checkbox" data-display-key="keyLink" ${displayCheck("keyLink")}> 默认展示
                            </label>
                        </div>
                        <input type="text" id="coolauxv-provider-form-key-link" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="https://..." value="${escapeAttr(baseTemplate.keyLink || "")}">
                        <div class="coolauxv-sub-label">获取 KEY 按钮提示 (title, {{keyLinkTitle}})</div>
                        <input type="text" id="coolauxv-provider-form-key-link-title" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="${DEFAULT_KEY_LINK_TITLE}" value="${escapeAttr(baseTemplate.keyLinkTitle || DEFAULT_KEY_LINK_TITLE)}">

                        <div style="font-size:12px; font-weight:700; color:#666; margin-top:2px;">协议与角色</div>
                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">协议类型 ({{providerType}})
                            <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                <input type="checkbox" data-display-key="type" ${displayCheck("type")}> 默认展示
                            </label>
                        </div>
                        <select id="coolauxv-provider-form-type" class="coolauxv-setting-input coolauxv-fixed-input">
                            <option value="chat-completions" ${baseTemplate.type === "chat-completions" ? "selected" : ""}>Chat Completions</option>
                            <option value="chat-no-history" ${baseTemplate.type === "chat-no-history" ? "selected" : ""}>No-History Chat</option>
                            <option value="ollama" ${baseTemplate.type === "ollama" ? "selected" : ""}>Ollama</option>
                            <option value="chat-parts" ${baseTemplate.type === "chat-parts" ? "selected" : ""}>Chat Parts</option>
                            <option value="openai-responses" ${baseTemplate.type === "openai-responses" ? "selected" : ""}>OpenAI Responses</option>
                        </select>

                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">支持识图 ({{supportsVision}})
                            <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                <input type="checkbox" data-display-key="supportsVision" ${displayCheck("supportsVision")}> 默认展示
                            </label>
                        </div>
                        <label class="coolauxv-toggle-label" style="width:auto; background:none; padding:0; border:none;">
                            <input type="checkbox" id="coolauxv-provider-form-vision" ${baseTemplate.supportsVision ? "checked" : ""}> 允许识图
                        </label>

                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">连续对话 ({{supportsContinuousChat}})
                            <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                <input type="checkbox" data-display-key="supportsContinuousChat" ${displayCheck("supportsContinuousChat")}> 默认展示
                            </label>
                        </div>
                        <label class="coolauxv-toggle-label" style="width:auto; background:none; padding:0; border:none;">
                            <input type="checkbox" id="coolauxv-provider-form-continuous-chat" ${baseTemplate.supportsContinuousChat === false ? "" : "checked"}> 允许连续对话
                        </label>

                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">角色名 ({{roleSystem}} / {{roleUser}} / {{roleAssistant}})
                            <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                <input type="checkbox" data-display-key="roles" ${displayCheck("roles")}> 默认展示
                            </label>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <input type="text" id="coolauxv-provider-form-role-system" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="system" value="${escapeAttr(baseTemplate.roles.system)}">
                            <input type="text" id="coolauxv-provider-form-role-user" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="user" value="${escapeAttr(baseTemplate.roles.user)}">
                            <input type="text" id="coolauxv-provider-form-role-assistant" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="assistant" value="${escapeAttr(baseTemplate.roles.assistant)}">
                        </div>

                        <div id="coolauxv-provider-stream-section">
                            <div style="font-size:12px; font-weight:700; color:#666; margin-top:2px;">流式解析</div>
                            <div class="coolauxv-sub-label coolauxv-sub-label-inline">响应解析 ({{deltaPath}} / {{reasoningPath}} / {{sessionIdPath}} / {{sessionIdKey}} / {{reasoningTag}})
                                <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                    <input type="checkbox" data-display-key="streamDelta" ${displayCheck("streamDelta")}> Delta 默认展示
                                </label>
                                <label class="coolauxv-toggle-label" style="margin-left:6px; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                    <input type="checkbox" data-display-key="streamReasoning" ${displayCheck("streamReasoning")}> 推理 默认展示
                                </label>
                                <label class="coolauxv-toggle-label" style="margin-left:6px; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                    <input type="checkbox" data-display-key="streamSession" ${displayCheck("streamSession")}> 会话ID 默认展示
                                </label>
                                <label class="coolauxv-toggle-label" style="margin-left:6px; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                    <input type="checkbox" data-display-key="streamReasoningTag" ${displayCheck("streamReasoningTag")}> 标签推理 默认展示
                                </label>
                            </div>
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                <input type="text" id="coolauxv-provider-form-delta-path" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="choices.0.delta.content" value="${escapeAttr(deltaPathVal)}">
                                <input type="text" id="coolauxv-provider-form-reasoning-path" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="choices.0.delta.reasoning_content" value="${escapeAttr(reasoningPathVal)}">
                            </div>
                            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
                                <input type="text" id="coolauxv-provider-form-session-id-path" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="conversationId" value="${escapeAttr(sessionIdPathVal)}">
                                <input type="text" id="coolauxv-provider-form-session-id-key" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="conversationId" value="${escapeAttr(sessionIdKeyVal)}">
                            </div>
                            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
                                <input type="text" id="coolauxv-provider-form-reasoning-tag" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="think（可选）" value="${escapeAttr(reasoningTagVal)}">
                            </div>
                            <div id="coolauxv-provider-stream-tip" style="display:none; font-size:11px; color:#999; margin-top:4px;">
                                Chat Parts 不需要配置 Delta/推理路径
                            </div>
                        </div>

                        <div style="font-size:12px; font-weight:700; color:#666; margin-top:2px;">模板</div>
                        <div style="font-size:11px; color:#888;">内置变量：{{model}} / {{messages}} / {{latestUserText}} / {{latestUserInputText}} / {{latestSystemPrompt}} / {{conversationId}} / {{requestId}} / {{sessionId}} / {{trigger}}</div>
                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">请求头模板 (JSON, {{headersTemplate}})
                            <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                <input type="checkbox" data-display-key="headersTemplate" ${displayCheck("headersTemplate")}> 默认展示
                            </label>
                        </div>
                        <textarea id="coolauxv-provider-form-headers" class="coolauxv-setting-input coolauxv-resizable-input" rows="4">${escapeText(headersJson)}</textarea>

                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">请求体模板 (JSON, {{bodyTemplate}})
                            <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                <input type="checkbox" data-display-key="bodyTemplate" ${displayCheck("bodyTemplate")}> 默认展示
                            </label>
                        </div>
                        <textarea id="coolauxv-provider-form-body-template" class="coolauxv-setting-input coolauxv-resizable-input" rows="4">${escapeText(bodyJson)}</textarea>

                        <div style="font-size:12px; font-weight:700; color:#666; margin-top:2px;">模型与自定义字段</div>
                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">模型配置 ({{modelGroups}})
                            <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                <input type="checkbox" data-display-key="modelGroups" ${displayCheck("modelGroups")}> 默认展示
                            </label>
                        </div>
                        <div id="coolauxv-provider-form-model-groups"></div>
                        <button type="button" id="coolauxv-provider-add-group" class="coolauxv-action-btn" style="margin-top:6px;">➕ 添加分类</button>
                        <div class="coolauxv-sub-label coolauxv-sub-label-inline">自定义字段 (key => {{key}})</div>
                        <div id="coolauxv-provider-form-custom-fields"></div>
                        <button type="button" id="coolauxv-provider-add-custom-field" class="coolauxv-action-btn" style="margin-top:6px;">➕ 添加字段</button>
                        <div style="font-size:11px; color:#888;">可在请求头/请求体/Base URL 中使用 {{key}}。未打码字段可在此处填写，打码字段请在提供商列表中填写。</div>
                    </div>

                    <div id="coolauxv-provider-form-base64" style="display:none;">
                        <div class="coolauxv-sub-label">Base64 文本</div>
                        <textarea id="coolauxv-provider-form-base64-input" class="coolauxv-setting-input coolauxv-resizable-input" rows="5" placeholder="粘贴分享/导出的 Base64..."></textarea>
                        <div style="font-size:11px; color:#888; margin-top:6px;">支持分享导出的文本、数组或单个提供商对象。</div>
                    </div>
                </div>
                <div style="display:flex; gap:10px; margin-top:12px;">
                    <button type="button" id="coolauxv-provider-modal-cancel" class="coolauxv-action-btn" style="flex:1;">取消</button>
                    <button type="button" id="coolauxv-provider-modal-submit" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">${submitText}</button>
                </div>
            `;

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => {
                overlay.style.opacity = "1";
                box.style.transform = "scale(1)";
            });

            const closeModal = () => {
                overlay.style.opacity = "0";
                box.style.transform = "scale(0.96)";
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 200);
            };

            const btnManual = box.querySelector("#coolauxv-provider-mode-manual");
            const btnBase64 = box.querySelector("#coolauxv-provider-mode-base64");
            const manualSection = box.querySelector("#coolauxv-provider-form-manual");
            const base64Section = box.querySelector("#coolauxv-provider-form-base64");
            const labelInput = box.querySelector("#coolauxv-provider-form-label");
            const idInput = box.querySelector("#coolauxv-provider-form-id");
            const idWarning = box.querySelector("#coolauxv-provider-id-warning");
            const typeInput = box.querySelector("#coolauxv-provider-form-type");
            const headersInput = box.querySelector("#coolauxv-provider-form-headers");
            const bodyInput = box.querySelector("#coolauxv-provider-form-body-template");
            const streamSection = box.querySelector("#coolauxv-provider-stream-section");
            const streamTip = box.querySelector("#coolauxv-provider-stream-tip");
            const closeBtn = box.querySelector("#coolauxv-provider-modal-close");
            const cancelBtn = box.querySelector("#coolauxv-provider-modal-cancel");
            const submitBtn = box.querySelector("#coolauxv-provider-modal-submit");
            const base64Input = box.querySelector("#coolauxv-provider-form-base64-input");
            const modelGroupContainer = box.querySelector("#coolauxv-provider-form-model-groups");
            const addGroupBtn = box.querySelector("#coolauxv-provider-add-group");
            const customFieldContainer = box.querySelector("#coolauxv-provider-form-custom-fields");
            const addCustomFieldBtn = box.querySelector("#coolauxv-provider-add-custom-field");

            let modeTab = "manual";
            let idTouched = false;

            const isDuplicateProviderId = (candidateId) => {
                if (!candidateId) return false;
                return templates.some((tpl) => tpl.id === candidateId && (!existing || tpl.id !== existing.id));
            };

            const updateProviderIdState = () => {
                if (!idInput || !submitBtn || !idWarning) return;
                if (modeTab !== "manual") {
                    idWarning.style.display = "none";
                    submitBtn.disabled = false;
                    return;
                }
                const candidateId = normalizeProviderId(idInput.value || "");
                const duplicated = isDuplicateProviderId(candidateId);
                idWarning.style.display = duplicated ? "block" : "none";
                submitBtn.disabled = duplicated;
            };

            const setMode = (nextMode) => {
                modeTab = nextMode;
                if (manualSection) manualSection.style.display = modeTab === "manual" ? "block" : "none";
                if (base64Section) base64Section.style.display = modeTab === "base64" ? "block" : "none";
                if (btnManual) btnManual.classList.toggle("coolauxv-btn-primary", modeTab === "manual");
                if (btnBase64) btnBase64.classList.toggle("coolauxv-btn-primary", modeTab === "base64");
                updateProviderIdState();
            };

            const setStreamSectionDisabled = (disabled) => {
                if (!streamSection) return;
                streamSection.style.opacity = disabled ? "0.5" : "1";
                streamSection.style.pointerEvents = disabled ? "none" : "auto";
                streamSection.querySelectorAll("input, textarea, select").forEach((el) => {
                    el.disabled = disabled;
                });
                if (streamTip) streamTip.style.display = disabled ? "block" : "none";
            };

            const refreshStreamSection = () => {
                const isChatParts = !!(typeInput && typeInput.value === "chat-parts");
                setStreamSectionDisabled(isChatParts);
            };

            setMode("manual");
            refreshStreamSection();

            if (labelInput && idInput && mode !== "edit") {
                labelInput.addEventListener("input", () => {
                    if (idTouched) return;
                    const normalized = normalizeProviderId(labelInput.value);
                    if (normalized) idInput.value = normalized;
                    updateProviderIdState();
                });
                idInput.addEventListener("input", () => {
                    idTouched = true;
                    updateProviderIdState();
                });
            } else if (idInput) {
                idInput.addEventListener("input", updateProviderIdState);
            }

            if (typeInput) {
                typeInput.addEventListener("change", () => {
                    if (bodyInput) {
                        const nextType = normalizeProviderType(typeInput.value);
                        bodyInput.value = JSON.stringify(defaultBodyTemplateForType(nextType), null, 2);
                    }
                    refreshStreamSection();
                });
            }

            const renderModelGroups = () => {
                if (!modelGroupContainer) return;
                modelGroupContainer.innerHTML = modelGroups.map((group, groupIndex) => {
                    const modelsHtml = (group.models || []).map((model, modelIndex) => `
                        <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;" data-group-index="${groupIndex}" data-model-index="${modelIndex}">
                            <input type="text" class="coolauxv-setting-input coolauxv-fixed-input" style="flex:1;" data-field="model.id" placeholder="名称" value="${escapeAttr(model.id || model.name || "")}">
                            <input type="text" class="coolauxv-setting-input coolauxv-fixed-input" style="flex:1;" data-field="model.class" placeholder="子类别" value="${escapeAttr(model.class || "")}">
                            <input type="text" class="coolauxv-setting-input coolauxv-fixed-input" style="flex:1;" data-field="model.tag" placeholder="Tag" value="${escapeAttr(model.tag || "")}">
                            <button type="button" class="coolauxv-action-btn" data-action="remove-model" style="padding:4px 8px;">×</button>
                        </div>
                    `).join("");
                    const typeSelected = group.type === "vision" ? "vision" : "text";
                    return `
                        <div style="border:1px solid #eee; border-radius:8px; padding:8px; margin-bottom:10px;" data-group-index="${groupIndex}">
                            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                                <input type="text" class="coolauxv-setting-input coolauxv-fixed-input" style="flex:1;" data-field="label" placeholder="分类名称" value="${escapeAttr(group.label || "")}">
                                <select class="coolauxv-setting-input coolauxv-fixed-input" data-field="type" style="min-width:140px;">
                                    <option value="text" ${typeSelected === "text" ? "selected" : ""}>通用模型</option>
                                    <option value="vision" ${typeSelected === "vision" ? "selected" : ""}>视觉模型</option>
                                </select>
                                <button type="button" class="coolauxv-action-btn" data-action="remove-group" style="padding:4px 8px;">删除分类</button>
                            </div>
                            <div style="font-size:11px; color:#888; margin-top:6px;">默认模型为该分类的第一项</div>
                            <div style="margin-top:6px;">
                                ${modelsHtml || `<div style="font-size:12px; color:#999;">暂无模型，请添加</div>`}
                            </div>
                            <button type="button" class="coolauxv-action-btn" data-action="add-model" style="margin-top:6px; padding:4px 8px;">➕ 添加模型</button>
                        </div>
                    `;
                }).join("");
            };

            const renderCustomFields = () => {
                if (!customFieldContainer) return;
                if (!customFieldList.length) {
                    customFieldContainer.innerHTML = `<div style="font-size:12px; color:#999;">暂无自定义字段</div>`;
                    return;
                }
                customFieldContainer.innerHTML = customFieldList.map((field, idx) => `
                    <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:6px;" data-custom-index="${idx}">
                        <input type="text" class="coolauxv-setting-input coolauxv-fixed-input" style="flex:1; min-width:160px;" data-field="custom.key" placeholder="字段名 (key)" value="${escapeAttr(field.key || "")}">
                        <input type="${field.masked ? "password" : "text"}" class="coolauxv-setting-input coolauxv-fixed-input ${field.masked ? "coolauxv-read-only" : ""}" style="flex:1; min-width:160px;" data-field="custom.value" placeholder="${field.masked ? "已打码" : "字段值"}" value="${escapeAttr(field.value || "")}" ${field.masked ? "disabled" : ""}>
                        <label class="coolauxv-toggle-label" style="width:auto; background:none; padding:0; border:none;">
                            <input type="checkbox" data-field="custom.display" ${field.display ? "checked" : ""}> 默认展示
                        </label>
                        <label class="coolauxv-toggle-label" style="width:auto; background:none; padding:0; border:none;">
                            <input type="checkbox" data-field="custom.masked" ${field.masked ? "checked" : ""}> 打码
                        </label>
                        <button type="button" class="coolauxv-action-btn" data-action="remove-custom" style="padding:4px 8px;">×</button>
                    </div>
                `).join("");
            };

            if (addGroupBtn) {
                addGroupBtn.onclick = () => {
                    modelGroups.push({ label: "通用模型", type: "text", models: [] });
                    renderModelGroups();
                };
            }

            if (addCustomFieldBtn) {
                addCustomFieldBtn.onclick = () => {
                    customFieldList.push({ key: "", value: "", display: true, masked: false });
                    renderCustomFields();
                };
            }

            if (modelGroupContainer) {
                modelGroupContainer.addEventListener("click", (e) => {
                    const target = e.target;
                    if (!target) return;
                    const action = target.dataset.action;
                    if (!action) return;
                    const groupEl = target.closest("[data-group-index]");
                    if (!groupEl) return;
                    const groupIndex = Number(groupEl.dataset.groupIndex);
                    const group = modelGroups[groupIndex];
                    if (!group) return;
                    if (action === "add-model") {
                        group.models = group.models || [];
                        group.models.push({ id: "", class: "", tag: "" });
                        renderModelGroups();
                    } else if (action === "remove-group") {
                        modelGroups.splice(groupIndex, 1);
                        if (!modelGroups.length) {
                            modelGroups.push({ label: "通用模型", type: "text", models: [] });
                        }
                        renderModelGroups();
                    } else if (action === "remove-model") {
                        const modelEl = target.closest("[data-model-index]");
                        if (!modelEl) return;
                        const modelIndex = Number(modelEl.dataset.modelIndex);
                        if (!Number.isFinite(modelIndex)) return;
                        group.models = group.models || [];
                        group.models.splice(modelIndex, 1);
                        renderModelGroups();
                    }
                });

                modelGroupContainer.addEventListener("input", (e) => {
                    const target = e.target;
                    if (!target || !target.dataset) return;
                    const field = target.dataset.field;
                    if (!field) return;
                    const groupEl = target.closest("[data-group-index]");
                    if (!groupEl) return;
                    const groupIndex = Number(groupEl.dataset.groupIndex);
                    const group = modelGroups[groupIndex];
                    if (!group) return;
                    if (field === "label") {
                        group.label = target.value;
                        return;
                    }
                    if (field === "type") {
                        group.type = target.value === "vision" ? "vision" : "text";
                        return;
                    }
                    if (field.startsWith("model.")) {
                        const modelEl = target.closest("[data-model-index]");
                        if (!modelEl) return;
                        const modelIndex = Number(modelEl.dataset.modelIndex);
                        if (!Number.isFinite(modelIndex)) return;
                        group.models = group.models || [];
                        const model = group.models[modelIndex];
                        if (!model) return;
                        const key = field.split(".")[1];
                        if (key === "id") model.id = target.value;
                        if (key === "class") model.class = target.value;
                        if (key === "tag") model.tag = target.value;
                    }
                });
            }

            if (customFieldContainer) {
                customFieldContainer.addEventListener("click", (e) => {
                    const target = e.target;
                    if (!target) return;
                    const action = target.dataset.action;
                    if (action !== "remove-custom") return;
                    const row = target.closest("[data-custom-index]");
                    if (!row) return;
                    const index = Number(row.dataset.customIndex);
                    if (!Number.isFinite(index)) return;
                    customFieldList.splice(index, 1);
                    renderCustomFields();
                });

                customFieldContainer.addEventListener("input", (e) => {
                    const target = e.target;
                    if (!target || !target.dataset) return;
                    const field = target.dataset.field;
                    if (!field) return;
                    const row = target.closest("[data-custom-index]");
                    if (!row) return;
                    const index = Number(row.dataset.customIndex);
                    if (!Number.isFinite(index)) return;
                    const item = customFieldList[index];
                    if (!item) return;
                    if (field === "custom.key") item.key = target.value;
                    if (field === "custom.value") item.value = target.value;
                    if (field === "custom.display") item.display = target.checked;
                    if (field === "custom.masked") {
                        item.masked = target.checked;
                        renderCustomFields();
                    }
                });
            }

            renderModelGroups();
            renderCustomFields();

            if (btnManual) btnManual.onclick = () => setMode("manual");
            if (btnBase64) btnBase64.onclick = () => setMode("base64");
            if (closeBtn) closeBtn.onclick = closeModal;
            if (cancelBtn) cancelBtn.onclick = closeModal;
            overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

            const buildDisplayState = () => {
                const display = Object.assign({}, displayState);
                box.querySelectorAll("[data-display-key]").forEach((input) => {
                    const key = input.dataset.displayKey;
                    if (!key) return;
                    display[key] = !!input.checked;
                });
                return display;
            };

            const buildModelGroupsPayload = () => {
                let groups = modelGroups.map((group, idx) => {
                    const label = String(group.label || "").trim() || `模型分类${idx + 1}`;
                    const type = group.type === "vision" ? "vision" : "text";
                    const models = (group.models || []).map(normalizeModelItem).filter(Boolean);
                    let selectedModel = String(group.selectedModel || "").trim();
                    if ((!selectedModel || !models.some((m) => m.id === selectedModel)) && models.length) {
                        selectedModel = models[0].id;
                    }
                    return {
                        id: normalizeProviderId(group.id || label),
                        label: label,
                        type: type,
                        models: models,
                        selectedModel: selectedModel
                    };
                }).filter(Boolean);
                if (!groups.length) {
                    groups = [{ id: "general", label: "通用模型", type: "text", models: [], selectedModel: "" }];
                }
                return groups;
            };

            const buildCustomFieldsPayload = () => {
                const output = {};
                customFieldList.forEach((item) => {
                    const key = normalizeTemplateKey(item.key);
                    if (!key) return;
                    output[key] = String(item.value !== undefined ? item.value : "");
                });
                return output;
            };

            const buildCustomFieldMetaPayload = () => {
                const output = {};
                customFieldList.forEach((item) => {
                    const key = normalizeTemplateKey(item.key);
                    if (!key) return;
                    output[key] = {
                        display: !!item.display,
                        masked: !!item.masked
                    };
                });
                return output;
            };

            if (submitBtn) {
                submitBtn.onclick = () => {
                    if (modeTab === "base64") {
                        const raw = (base64Input && base64Input.value || "").trim();
                        if (!raw) {
                            alert("请先粘贴 Base64 文本。");
                            return;
                        }
                        let imported = null;
                        try {
                            const decoded = decodeBase64(raw);
                            const payload = JSON.parse(decoded);
                            if (payload && Array.isArray(payload.providers)) {
                                imported = payload.providers;
                            } else if (Array.isArray(payload)) {
                                imported = payload;
                            } else if (payload && typeof payload === "object") {
                                imported = [payload];
                            }
                        } catch (e) {
                            imported = null;
                        }
                        if (!imported) {
                            alert("Base64 解析失败，请检查内容。");
                            return;
                        }
                        const merged = imported.map((item) => mergeProviderDefaults(item));
                        const cleaned = pruneEmptyValues(merged);
                        const nextTemplates = getProviderTemplates().concat(cleaned);
                        saveProviderTemplates(nextTemplates);
                        sanitizeMaskedCustomFields(getProviderTemplates());
                        renderProviderUI();
                        closeModal();
                        return;
                    }

                    const candidateId = normalizeProviderId((idInput && idInput.value || "").trim());
                    if (isDuplicateProviderId(candidateId)) {
                        alert("Provider ID 已存在，请更换其他 ID。");
                        updateProviderIdState();
                        return;
                    }

                    const label = (labelInput && labelInput.value || "").trim();
                    const idValue = (idInput && idInput.value || "").trim();
                    const baseUrl = (box.querySelector("#coolauxv-provider-form-base-url") || {}).value || "";
                    const apiKeyPlaceholder = (box.querySelector("#coolauxv-provider-form-api-key-placeholder") || {}).value || "";
                    const keyLink = (box.querySelector("#coolauxv-provider-form-key-link") || {}).value || "";
                    const keyLinkTitle = (box.querySelector("#coolauxv-provider-form-key-link-title") || {}).value || "";
                    const type = normalizeProviderType(typeInput && typeInput.value);
                    const supportsVision = !!(box.querySelector("#coolauxv-provider-form-vision") || {}).checked;
                    const supportsContinuousChat = !!(box.querySelector("#coolauxv-provider-form-continuous-chat") || {}).checked;
                    const roleSystem = (box.querySelector("#coolauxv-provider-form-role-system") || {}).value || "system";
                    const roleUser = (box.querySelector("#coolauxv-provider-form-role-user") || {}).value || "user";
                    const roleAssistant = (box.querySelector("#coolauxv-provider-form-role-assistant") || {}).value || "assistant";
                    const deltaPath = (box.querySelector("#coolauxv-provider-form-delta-path") || {}).value || "";
                    const reasoningPath = (box.querySelector("#coolauxv-provider-form-reasoning-path") || {}).value || "";
                    const sessionIdPath = (box.querySelector("#coolauxv-provider-form-session-id-path") || {}).value || "";
                    const sessionIdKey = (box.querySelector("#coolauxv-provider-form-session-id-key") || {}).value || DEFAULT_PROVIDER_SESSION_FIELD_KEY;
                    const reasoningTag = (box.querySelector("#coolauxv-provider-form-reasoning-tag") || {}).value || "";
                    const headersParsed = parseTemplateJson(headersInput ? headersInput.value.trim() : "");
                    const bodyParsed = parseTemplateJson(bodyInput ? bodyInput.value.trim() : "");

                    if (!headersParsed || !bodyParsed) {
                        alert("JSON 解析失败，请检查请求头或请求体格式。");
                        return;
                    }

                    const display = buildDisplayState();
                    const groups = buildModelGroupsPayload();
                    let customFields = buildCustomFieldsPayload();
                    const customFieldMeta = buildCustomFieldMetaPayload();
                    const apiKeyValue = existing ? existing.apiKey : "";
                    const normalizedId = normalizeProviderId(idValue || "");
                    const generatedId = normalizeProviderId(label || `provider-${Date.now().toString(36)}`);
                    const finalId = normalizedId || (existing && existing.id ? existing.id : generatedId);
                    const finalLabel = label || finalId || "Provider";
                    const prevMeta = existing ? getCustomFieldMetaMap(existing) : {};
                    const prevId = existing ? existing.id : "";
                    const prevSecrets = prevId ? getProviderSecretFields(prevId) : {};
                    const nextSecrets = {};
                    const nextCustomFields = {};
                    Object.keys(customFields).forEach((key) => {
                        const meta = customFieldMeta[key] || { display: true, masked: false };
                        const wasMasked = prevMeta[key] ? !!prevMeta[key].masked : false;
                        const inputValue = customFields[key];
                        const hasInputValue = inputValue !== undefined && inputValue !== null && String(inputValue) !== "";
                        const source = meta.masked
                            ? (hasInputValue ? inputValue : (wasMasked ? prevSecrets[key] : inputValue))
                            : inputValue;
                        if (meta.masked) {
                            if (source !== undefined && source !== null && String(source)) {
                                nextSecrets[key] = String(source);
                            }
                            nextCustomFields[key] = "";
                        } else {
                            nextCustomFields[key] = source !== undefined && source !== null ? String(source) : "";
                        }
                    });
                    setProviderSecretFields(finalId, nextSecrets);
                    if (prevId && prevId !== finalId) {
                        clearProviderSecretFields(prevId);
                    }
                    customFields = nextCustomFields;

                    if (prevId && prevId !== finalId) {
                        const defaultProvider = GM_getValue("coolauxv_default_provider", DEFAULT_PROVIDER);
                        if (defaultProvider === prevId) GM_setValue("coolauxv_default_provider", finalId);
                        const modelProvider = GM_getValue("coolauxv_model_provider", DEFAULT_MODEL_PROVIDER);
                        if (modelProvider === prevId) GM_setValue("coolauxv_model_provider", finalId);
                        if (selectedProviderIds.has(prevId)) {
                            selectedProviderIds.delete(prevId);
                            selectedProviderIds.add(finalId);
                        }
                        if (providerSectionStates.has(prevId)) {
                            const prevState = providerSectionStates.get(prevId);
                            providerSectionStates.delete(prevId);
                            providerSectionStates.set(finalId, prevState);
                        }
                    }

                    const template = ensureProviderTemplate({
                        id: finalId,
                        label: finalLabel,
                        type: type,
                        baseUrl: String(baseUrl || "").trim(),
                        apiKey: apiKeyValue,
                        apiKeyPlaceholder: String(apiKeyPlaceholder || "").trim(),
                        keyLink: String(keyLink || "").trim(),
                        keyLinkTitle: String(keyLinkTitle || "").trim() || DEFAULT_KEY_LINK_TITLE,
                        roles: { system: roleSystem, user: roleUser, assistant: roleAssistant },
                        headersTemplate: headersParsed,
                        bodyTemplate: bodyParsed,
                        stream: {
                            parser: type === "chat-no-history" ? "chat-completions" : type,
                            deltaPath: String(deltaPath || "").trim(),
                            reasoningPath: String(reasoningPath || "").trim(),
                            sessionIdPath: String(sessionIdPath || "").trim(),
                            sessionIdKey: normalizeTemplateKey(sessionIdKey || DEFAULT_PROVIDER_SESSION_FIELD_KEY) || DEFAULT_PROVIDER_SESSION_FIELD_KEY,
                            reasoningTag: String(reasoningTag || "").trim().toLowerCase()
                        },
                        supportsVision: supportsVision,
                        supportsContinuousChat: supportsContinuousChat,
                        modelGroups: groups,
                        display: display,
                        customFields: customFields,
                        customFieldMeta: customFieldMeta
                    });

                    if (!template) {
                        alert("提供商信息无效，请检查必填项。");
                        return;
                    }

                    const nextTemplates = existing
                        ? templates.map((tpl) => tpl.id === existing.id ? template : tpl)
                        : templates.concat(template);

                    saveProviderTemplates(nextTemplates);
                    renderProviderUI();
                    closeModal();
                };
            }
        };
        const renderProviderRadioGroup = (templates, currentProviderId) => {
            if (!providerRadioGroup) return;
            providerRadioGroup.innerHTML = templates.map((provider) => {
                const isChecked = provider.id === currentProviderId ? "checked" : "";
                const providerContext = buildTemplateContext(provider, { apiKey: provider.apiKey || "" });
                const resolvedProviderLabel = applyTemplateString(provider.label || provider.id || "", providerContext);
                return `
                    <label class="coolauxv-radio-label">
                        <input type="radio" name="coolauxv_provider_radio" value="${provider.id}" ${isChecked}>
                        <span class="coolauxv-radio-text">${escapeAttr(resolvedProviderLabel || provider.label)}</span>
                    </label>
                `;
            }).join("");
        };

        const renderProviderSections = (templates) => {
            if (!providerSectionsContainer) return;
            providerSectionsContainer.innerHTML = templates.map((provider) => {
                const sectionId = `coolauxv-provider-section-${provider.id}`;
                const keyInputId = `coolauxv-provider-key-${provider.id}`;
                const typeLabel = getProviderTypeLabel(provider.type);
                const headersJson = formatTemplateJson(provider.headersTemplate);
                const bodyJson = formatTemplateJson(provider.bodyTemplate);
                const display = Object.assign({}, DEFAULT_DISPLAY_FIELDS, provider.display || {});
                const providerContext = buildTemplateContext(provider, { apiKey: provider.apiKey || "" });
                const resolvedProviderLabel = applyTemplateString(provider.label || provider.id || "", providerContext);
                const resolvedKeyLink = applyTemplateString(provider.keyLink || "", providerContext);
                const resolvedKeyLinkTitle = applyTemplateString(provider.keyLinkTitle || DEFAULT_KEY_LINK_TITLE, providerContext);
                let fieldsHtml = "";

                if (display.apiKey) {
                    fieldsHtml += `
                        <div class="coolauxv-sub-label">API KEY (apiKey)</div>
                        <input type="password" id="${keyInputId}" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-clearable="true" data-provider-id="${provider.id}" data-provider-field="apiKey" placeholder="${escapeAttr(provider.apiKeyPlaceholder || "")}" value="${escapeAttr(provider.apiKey)}">
                    `;
                }

                if (display.baseUrl) {
                    fieldsHtml += `
                        <div class="coolauxv-sub-label">Base URL (支持 {{自定义字段}})</div>
                        <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="baseUrl" data-rerender="true" value="${escapeAttr(provider.baseUrl)}">
                    `;
                }

                if (display.label) {
                    fieldsHtml += `
                        <div class="coolauxv-sub-label">显示名称</div>
                        <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="label" value="${escapeAttr(provider.label)}">
                    `;
                }

                if (display.apiKeyPlaceholder) {
                    fieldsHtml += `
                        <div class="coolauxv-sub-label">API KEY Placeholder</div>
                        <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="apiKeyPlaceholder" value="${escapeAttr(provider.apiKeyPlaceholder || "")}">
                    `;
                }

                if (display.keyLink) {
                    fieldsHtml += `
                        <div class="coolauxv-sub-label">KEY 获取链接</div>
                        <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="keyLink" value="${escapeAttr(provider.keyLink || "")}">
                    `;
                }

                const customKeys = Object.keys(provider.customFields || {});
                if (customKeys.length) {
                    const customMeta = getCustomFieldMetaMap(provider);
                    const customValues = getTemplateCustomFields(provider);
                    const visibleKeys = customKeys.filter((key) => (customMeta[key] ? customMeta[key].display : true));
                    if (!visibleKeys.length) {
                        fieldsHtml += `
                            <div class="coolauxv-sub-label">自定义字段 (key => {{key}})</div>
                            <div style="font-size:12px; color:#999;">暂无自定义字段，请使用高级选项添加。</div>
                        `;
                    } else {
                        const hasMasked = visibleKeys.some((key) => customMeta[key] && customMeta[key].masked);
                        const toggleText = hasMasked ? "👁️ 显示" : "";
                        const toggleHtml = hasMasked
                            ? `<span class="coolauxv-link-btn" data-action="toggle-custom-fields" data-provider-id="${provider.id}" style="margin-left:auto; cursor:pointer; user-select:none;">${toggleText}</span>`
                            : "";
                        fieldsHtml += `
                            <div class="coolauxv-sub-label coolauxv-sub-label-inline">
                                <span>自定义字段 (key => {{key}})</span>
                                ${toggleHtml}
                            </div>
                        `;
                        visibleKeys.forEach((key, idx) => {
                            const value = customValues ? customValues[key] : "";
                            const safeKey = normalizeProviderId(key) || `custom-${idx}`;
                            const customInputId = `coolauxv-provider-custom-${provider.id}-${safeKey}-${idx}`;
                            const isMasked = customMeta[key] ? !!customMeta[key].masked : false;
                            const inputType = isMasked ? "password" : "text";
                            fieldsHtml += `
                                <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                                    <input type="text" class="coolauxv-setting-input coolauxv-fixed-input" style="flex:1;" value="${escapeAttr(key)}" disabled>
                                    <input type="${inputType}" id="${customInputId}" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" style="flex:1;" data-custom-mask="${isMasked ? "true" : "false"}" data-provider-id="${provider.id}" data-provider-field="customFields.${escapeAttr(key)}" value="${escapeAttr(value || "")}">
                                </div>
                            `;
                        });
                    }
                }

                if (display.roles) {
                    fieldsHtml += `
                        <div class="coolauxv-sub-label">角色名 (System / User / Assistant)</div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="roles.system" placeholder="system" value="${escapeAttr(provider.roles.system)}">
                            <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="roles.user" placeholder="user" value="${escapeAttr(provider.roles.user)}">
                            <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="roles.assistant" placeholder="assistant" value="${escapeAttr(provider.roles.assistant)}">
                        </div>
                    `;
                }

                if (display.type || display.supportsVision || display.supportsContinuousChat) {
                    fieldsHtml += `
                        <div class="coolauxv-sub-label">协议类型</div>
                        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                            ${display.type ? `
                                <select class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="type" data-rerender="true">
                                    <option value="chat-completions" ${provider.type === "chat-completions" ? "selected" : ""}>Chat Completions</option>
                                    <option value="chat-no-history" ${provider.type === "chat-no-history" ? "selected" : ""}>No-History Chat</option>
                                    <option value="ollama" ${provider.type === "ollama" ? "selected" : ""}>Ollama</option>
                                    <option value="chat-parts" ${provider.type === "chat-parts" ? "selected" : ""}>Chat Parts</option>
                                    <option value="openai-responses" ${provider.type === "openai-responses" ? "selected" : ""}>OpenAI Responses</option>
                                </select>
                            ` : ""}
                            ${display.supportsVision ? `
                                <label class="coolauxv-toggle-label" style="width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                    <input type="checkbox" data-provider-id="${provider.id}" data-provider-field="supportsVision" ${provider.supportsVision ? "checked" : ""}>支持识图
                                </label>
                            ` : ""}
                            ${display.supportsContinuousChat ? `
                                <label class="coolauxv-toggle-label" style="width:auto; background:none; padding:0; border:none; font-weight:normal;">
                                    <input type="checkbox" data-provider-id="${provider.id}" data-provider-field="supportsContinuousChat" ${provider.supportsContinuousChat === false ? "" : "checked"}>连续对话
                                </label>
                            ` : ""}
                            <span style="font-size:11px; color:#888;">当前: ${typeLabel}</span>
                        </div>
                    `;
                }

                if (isChatCompletionsLikeProviderType(provider.type) && (display.streamDelta || display.streamReasoning || display.streamSession || display.streamReasoningTag)) {
                    fieldsHtml += `
                        <div class="coolauxv-sub-label">响应解析 (Delta / 推理 / 会话ID / 标签推理)</div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            ${display.streamDelta ? `
                                <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="stream.deltaPath" placeholder="choices.0.delta.content" value="${escapeAttr(provider.stream.deltaPath)}">
                            ` : ""}
                            ${display.streamReasoning ? `
                                <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="stream.reasoningPath" placeholder="choices.0.delta.reasoning_content" value="${escapeAttr(provider.stream.reasoningPath || "")}">
                            ` : ""}
                            ${display.streamSession ? `
                                <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="stream.sessionIdPath" placeholder="conversationId" value="${escapeAttr(provider.stream.sessionIdPath || "")}">
                                <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="stream.sessionIdKey" placeholder="conversationId" value="${escapeAttr(provider.stream.sessionIdKey || DEFAULT_PROVIDER_SESSION_FIELD_KEY)}">
                            ` : ""}
                            ${display.streamReasoningTag ? `
                                <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-provider-id="${provider.id}" data-provider-field="stream.reasoningTag" placeholder="think（可选）" value="${escapeAttr(provider.stream.reasoningTag || "")}">
                            ` : ""}
                        </div>
                    `;
                }

                if (display.headersTemplate) {
                    fieldsHtml += `
                        <div class="coolauxv-sub-label">请求头模板 (JSON)</div>
                        <textarea class="coolauxv-setting-input coolauxv-resizable-input coolauxv-provider-input coolauxv-provider-json" data-provider-id="${provider.id}" data-provider-field="headersTemplate">${escapeText(headersJson)}</textarea>
                    `;
                }

                if (display.bodyTemplate) {
                    fieldsHtml += `
                        <div class="coolauxv-sub-label">请求体模板 (JSON)</div>
                        <textarea class="coolauxv-setting-input coolauxv-resizable-input coolauxv-provider-input coolauxv-provider-json" data-provider-id="${provider.id}" data-provider-field="bodyTemplate">${escapeText(bodyJson)}</textarea>
                    `;
                }

                if (!fieldsHtml.trim()) {
                    fieldsHtml = `<div style="font-size:12px; color:#999;">暂无默认展示项，请点击高级选项配置。</div>`;
                }
                const fieldBlock = `<div style="display:flex; flex-direction:column; gap:8px;">${fieldsHtml}</div>`;
                return `
                    <div class="coolauxv-setting-group coolauxv-sort-item" data-provider-id="${provider.id}" data-sort-kind="provider" draggable="false">
                        <label class="coolauxv-setting-label">
                            <span class="coolauxv-sort-handle coolauxv-provider-sort-handle" data-sort-handle="provider" title="批量模式下拖动排序">⠿</span>
                            <span class="coolauxv-provider-checkbox">
                                <input type="checkbox" class="coolauxv-provider-select" data-provider-id="${provider.id}">
                            </span>
                            <span class="coolauxv-provider-title">${escapeAttr(resolvedProviderLabel || provider.label)}</span>
                            <span class="coolauxv-provider-subtitle">提供商</span>
                            <span class="coolauxv-link-btn" data-provider-toggle="${provider.id}" style="margin-left:auto; cursor:pointer; user-select:none;">收起</span>
                            <span class="coolauxv-link-btn" data-action="edit-provider" data-provider-id="${provider.id}" style="cursor:pointer; user-select:none;">⚙️ 高级选项</span>
                            ${display.apiKey ? `<span class="coolauxv-link-btn" data-action="toggle-key" data-target="${keyInputId}" style="cursor:pointer; user-select:none;">👁️ 显示</span>` : ""}
                            ${resolvedKeyLink ? `<a href="${resolvedKeyLink}" target="_blank" class="coolauxv-link-btn" title="${escapeAttr(resolvedKeyLinkTitle)}">🔑 获取KEY</a>` : ""}
                        </label>
                        <div id="${sectionId}" class="coolauxv-collapse-section" data-provider-section="${provider.id}">
                            ${fieldBlock}
                        </div>
                    </div>
                `;
            }).join("");
        };

        const renderModelProviderSelect = (templates, fallbackProviderId) => {
            if (!inputModelProvider) return "";
            const selected = resolveProviderId(GM_getValue("coolauxv_model_provider", fallbackProviderId), templates);
            inputModelProvider.innerHTML = templates.map((provider) => {
                const providerContext = buildTemplateContext(provider, { apiKey: provider.apiKey || "" });
                const resolvedProviderLabel = applyTemplateString(provider.label || provider.id || "", providerContext);
                return `<option value="${provider.id}">${escapeAttr(resolvedProviderLabel || provider.label)}</option>`;
            }).join("");
            inputModelProvider.value = selected;
            if (selected !== GM_getValue("coolauxv_model_provider", "")) {
                GM_setValue("coolauxv_model_provider", selected);
            }
            return selected;
        };

        const renderModelSections = (templates, selectedProviderId) => {
            if (!modelSectionsContainer) return;
            modelSectionsContainer.innerHTML = templates.map((provider) => {
                const isVisible = provider.id === selectedProviderId;
                const groups = Array.isArray(provider.modelGroups) ? provider.modelGroups : [];
                const showModels = provider.display ? provider.display.modelGroups !== false : true;
                const providerContext = buildTemplateContext(provider, { apiKey: provider.apiKey || "" });
                const resolvedProviderLabel = applyTemplateString(provider.label || provider.id || "", providerContext);
                const groupBlocks = showModels
                    ? groups.map((group) => {
                        const selectedModel = group.selectedModel || (group.models && group.models[0] ? (group.models[0].id || group.models[0].name || "") : "");
                        const groupButtons = buildModelButtonsHTML(group, provider.id);
                        const typeLabel = group.type === "vision" ? "视觉模型" : "通用模型";
                        return `
                            <div class="coolauxv-setting-group">
                                <label class="coolauxv-setting-label">
                                    ${escapeAttr(resolvedProviderLabel || provider.label)} · ${escapeAttr(group.label)}
                                    <span class="coolauxv-sub-label" style="margin:0 0 0 6px;">${typeLabel} · model</span>
                                </label>
                                <input type="text" class="coolauxv-setting-input coolauxv-fixed-input coolauxv-provider-input" data-clearable="true" data-provider-id="${provider.id}" data-group-id="${group.id}" data-group-field="selectedModel" placeholder="默认: ${escapeAttr(selectedModel)}" value="${escapeAttr(selectedModel)}">
                                ${groupButtons}
                            </div>
                        `;
                    }).join("")
                    : `
                        <div class="coolauxv-setting-group">
                            <label class="coolauxv-setting-label">模型配置已隐藏</label>
                            <div style="font-size:12px; color:#999;">可在高级选项中开启“默认展示”。</div>
                        </div>
                    `;

                return `
                    <div class="coolauxv-model-provider-section${isVisible ? " coolauxv-model-visible" : ""}" data-model-provider-section="${provider.id}">
                        ${groupBlocks}
                    </div>
                `;
            }).join("");
        };

        const setModelSectionAnimatedVisibility = (section, visible) => {
            if (!section) return;
            if (visible) {
                if (section.classList.contains("coolauxv-model-visible") && section.style.display !== "none") return;
                section.style.display = "block";
                section.style.pointerEvents = "auto";
                section.style.maxHeight = "0px";
                section.style.opacity = "0";
                section.style.transform = "translateY(-4px)";
                section.classList.add("coolauxv-model-visible");
                requestAnimationFrame(() => {
                    const targetHeight = section.scrollHeight;
                    section.style.opacity = "1";
                    section.style.transform = "translateY(0)";
                    if (targetHeight <= 0) {
                        section.style.maxHeight = "none";
                        return;
                    }
                    section.style.maxHeight = `${targetHeight}px`;
                    const onEnd = (e) => {
                        if (e.propertyName !== "max-height") return;
                        if (section.classList.contains("coolauxv-model-visible")) {
                            section.style.maxHeight = "none";
                        }
                        section.removeEventListener("transitionend", onEnd);
                    };
                    section.addEventListener("transitionend", onEnd);
                });
                return;
            }
            if (!section.classList.contains("coolauxv-model-visible")) return;
            if (section.style.maxHeight === "none") {
                section.style.maxHeight = `${section.scrollHeight}px`;
            }
            void section.offsetHeight;
            section.classList.remove("coolauxv-model-visible");
            section.style.maxHeight = "0px";
            section.style.opacity = "0";
            section.style.transform = "translateY(-4px)";
            section.style.pointerEvents = "none";
            const onEnd = (e) => {
                if (e.propertyName !== "max-height") return;
                if (!section.classList.contains("coolauxv-model-visible")) {
                    section.style.display = "none";
                }
                section.removeEventListener("transitionend", onEnd);
            };
            section.addEventListener("transitionend", onEnd);
        };

        const setModelSectionStateInstant = (section, visible) => {
            if (!section) return;
            if (visible) {
                section.style.display = "block";
                section.classList.add("coolauxv-model-visible");
                section.style.maxHeight = "none";
                section.style.opacity = "1";
                section.style.transform = "translateY(0)";
                section.style.pointerEvents = "auto";
                return;
            }
            section.classList.remove("coolauxv-model-visible");
            section.style.maxHeight = "0px";
            section.style.opacity = "0";
            section.style.transform = "translateY(-4px)";
            section.style.pointerEvents = "none";
            section.style.display = "none";
        };

        const applyModelProviderUI = (providerId, instant = false) => {
            if (!modelSectionsContainer) return;
            modelSectionsContainer.querySelectorAll("[data-model-provider-section]").forEach((section) => {
                const sectionId = section.dataset.modelProviderSection;
                if (instant) {
                    setModelSectionStateInstant(section, sectionId === providerId);
                } else {
                    setModelSectionAnimatedVisibility(section, sectionId === providerId);
                }
            });
        };

        const attachProviderClearButtons = () => {
            if (!providerSectionsContainer) return;
            providerSectionsContainer.querySelectorAll("[data-clearable=\"true\"]").forEach((input) => attachClearButton(input));
            if (modelSectionsContainer) {
                modelSectionsContainer.querySelectorAll("[data-clearable=\"true\"]").forEach((input) => attachClearButton(input));
            }
        };

        const renderProviderUI = () => {
            let templates = getProviderTemplates();
            let templatesChanged = false;
            templates.forEach((tpl) => {
                if (!Array.isArray(tpl.modelGroups) || !tpl.modelGroups.length) {
                    tpl.modelGroups = normalizeModelGroups(tpl);
                    templatesChanged = true;
                }
            });
            if (templatesChanged) {
                templates = saveProviderTemplates(templates);
            }
            const defaultProviderId = resolveProviderId(GM_getValue("coolauxv_default_provider", DEFAULT_PROVIDER), templates);
            if (defaultProviderId !== GM_getValue("coolauxv_default_provider", "")) {
                GM_setValue("coolauxv_default_provider", defaultProviderId);
            }
            ensureProviderSectionStates(templates, defaultProviderId);
            renderProviderRadioGroup(templates, defaultProviderId);
            renderProviderSections(templates);
            const selectedModelProvider = renderModelProviderSelect(templates, defaultProviderId);
            renderModelSections(templates, selectedModelProvider);
            applyModelProviderUI(selectedModelProvider, true);
            applyProviderSectionStates();
            updateProviderToggleLabels();
            updateBatchModeUI();
            syncAllClearButtons();
            attachProviderClearButtons();
            if (GM_getValue("coolauxv_enable_blur_glass", DEFAULT_ENABLE_BLUR_GLASS)) {
                const modelBtns = popup.querySelectorAll(".coolauxv-model-btn");
                modelBtns.forEach((btn) => btn.classList.add("coolauxv-blur-glass-style-btn"));
            }
            updateProviderFeatureVisibility();
        };

        const getActionStyleTokens = (colorValue) => {
            const rgb = parseColorToRgb(colorValue) || { r: 249, g: 250, b: 251 };
            const luma = getColorLuma(rgb);
            const text = luma > 0.45 ? "#111827" : "#f9fafb";
            const borderRgb = mixRgbColor(rgb, { r: 17, g: 24, b: 39 }, luma > 0.45 ? 0.2 : 0.35);
            const hoverRgb = mixRgbColor(rgb, luma > 0.45 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, luma > 0.45 ? 0.12 : 0.08);
            const borderHoverRgb = mixRgbColor(borderRgb, luma > 0.45 ? { r: 17, g: 24, b: 39 } : { r: 255, g: 255, b: 255 }, 0.2);
            return {
                bg: rgbToCss(rgb),
                fg: text,
                border: rgbToCss(borderRgb),
                hoverBg: rgbToCss(hoverRgb),
                hoverBorder: rgbToCss(borderHoverRgb)
            };
        };

        const renderMainActionButtons = () => {
            const container = popup.querySelector("#coolauxv-main-action-buttons");
            if (!container) return;
            const templates = getActionTemplates();
            const totalWeight = templates.reduce((sum, tpl) => sum + normalizeActionWeight(tpl.weight), 0);
            container.style.setProperty("--coolauxv-main-action-total-weight", String(Math.max(0.2, totalWeight || 1)));
            container.innerHTML = templates.map((tpl) => {
                const styles = getActionStyleTokens(tpl.color);
                const weight = normalizeActionWeight(tpl.weight);
                const buttonId = tpl.id === "translate"
                    ? "coolauxv-btn-trans"
                    : (tpl.id === "explain" ? "coolauxv-btn-explain" : "");
                const idAttr = buttonId ? `id="${buttonId}"` : "";
                return `
                    <button ${idAttr}
                        class="coolauxv-action-btn coolauxv-main-action-btn"
                        data-action-id="${escapeAttr(tpl.id)}"
                        title="${escapeAttr(tpl.systemPrompt || "")}"
                        style="--coolauxv-action-bg:${escapeAttr(styles.bg)}; --coolauxv-action-fg:${escapeAttr(styles.fg)}; --coolauxv-action-border:${escapeAttr(styles.border)}; --coolauxv-action-bg-hover:${escapeAttr(styles.hoverBg)}; --coolauxv-action-border-hover:${escapeAttr(styles.hoverBorder)}; --coolauxv-action-weight:${escapeAttr(String(weight))};">
                        ${escapeAttr(tpl.label || tpl.id)}
                    </button>
                `;
            }).join("");
        };

        const renderSelectionActionRadioGroup = () => {
            if (!selectionActionRadioGroup) return;
            const templates = getActionTemplates();
            const selectedAction = resolveActionTemplateId(getSelectionIconAction(), templates);
            selectionActionRadioGroup.innerHTML = templates.map((tpl) => `
                <label class="coolauxv-radio-label">
                    <input type="radio" name="coolauxv_selection_icon_action_radio_dynamic" value="${escapeAttr(tpl.id)}" ${tpl.id === selectedAction ? "checked" : ""}>
                    <span class="coolauxv-radio-text">${escapeAttr(tpl.label || tpl.id)}</span>
                </label>
            `).join("");
        };

        const encodeActionTemplateBase64 = (template) => {
            if (!template) return "";
            const compacted = compactActionTemplate(template);
            const payload = buildShareTemplateWithHashedId(compacted, "action");
            return encodeBase64(JSON.stringify(pruneEmptyValues(payload)));
        };

        const parseActionImportPayload = (base64Input) => {
            const raw = String(base64Input || "").trim();
            if (!raw) return [];
            try {
                const parsed = JSON.parse(decodeBase64(raw.replace(/\s+/g, "")));
                let list = [];
                if (Array.isArray(parsed)) {
                    list = parsed;
                } else if (parsed && typeof parsed === "object") {
                    if (Array.isArray(parsed.actions)) {
                        list = parsed.actions;
                    } else {
                        list = [parsed];
                    }
                }
                return normalizeActionTemplates(list.map((item) => mergeActionDefaults(item)).filter(Boolean));
            } catch (e) {
                return [];
            }
        };

        const openActionColorPickerModal = (initialColor, onConfirm) => {
            const rgbSeed = parseColorToRgb(initialColor) || { r: 109, g: 40, b: 217 };
            let rgb = { r: rgbSeed.r, g: rgbSeed.g, b: rgbSeed.b };
            let hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
            let mode = "hsl";
            const existing = document.getElementById("coolauxv-action-color-modal-overlay");
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

            const overlay = document.createElement("div");
            overlay.id = "coolauxv-action-color-modal-overlay";
            Object.assign(overlay.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                background: "rgba(0, 0, 0, 0.5)",
                zIndex: "2147483663",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backdropFilter: "blur(4px)"
            });

            const box = document.createElement("div");
            Object.assign(box.style, {
                background: "#fff",
                width: "460px",
                maxWidth: "92vw",
                borderRadius: "12px",
                padding: "16px",
                boxShadow: "0 12px 32px rgba(0,0,0,0.28)"
            });

            box.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                    <div style="font-size:16px; font-weight:700; color:#a516e8;">🎨 按钮颜色</div>
                    <button type="button" id="coolauxv-action-color-close" class="coolauxv-ctrl-btn">×</button>
                </div>
                <div style="display:flex; gap:8px; margin-bottom:10px;">
                    <button type="button" id="coolauxv-action-color-mode-hsl" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">HSL 调色盘</button>
                    <button type="button" id="coolauxv-action-color-mode-rgb" class="coolauxv-action-btn" style="flex:1;">RGB 调色盘</button>
                </div>
                <div id="coolauxv-action-color-preview" style="height:38px; border-radius:8px; border:1px solid #e5e7eb; margin-bottom:10px;"></div>
                <div id="coolauxv-action-color-hsl-panel" style="display:flex; flex-direction:column; gap:8px;">
                    <label>H <input type="range" id="coolauxv-action-h" min="0" max="360" step="1" style="width:100%;"></label>
                    <label>S <input type="range" id="coolauxv-action-s" min="0" max="100" step="1" style="width:100%;"></label>
                    <label>L <input type="range" id="coolauxv-action-l" min="0" max="100" step="1" style="width:100%;"></label>
                </div>
                <div id="coolauxv-action-color-rgb-panel" style="display:none; flex-direction:column; gap:8px;">
                    <label>R <input type="range" id="coolauxv-action-r" min="0" max="255" step="1" style="width:100%;"></label>
                    <label>G <input type="range" id="coolauxv-action-g" min="0" max="255" step="1" style="width:100%;"></label>
                    <label>B <input type="range" id="coolauxv-action-b" min="0" max="255" step="1" style="width:100%;"></label>
                </div>
                <div style="margin-top:10px;">
                    <div class="coolauxv-sub-label">手动输入 (HSL 或 RGB)</div>
                    <input type="text" id="coolauxv-action-color-manual" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="例如: hsl(271, 69%, 50%) 或 rgb(109, 40, 217)">
                </div>
                <div style="display:flex; gap:8px; margin-top:12px;">
                    <button type="button" id="coolauxv-action-color-cancel" class="coolauxv-action-btn" style="flex:1;">取消</button>
                    <button type="button" id="coolauxv-action-color-submit" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">确认</button>
                </div>
            `;

            overlay.appendChild(box);
            document.body.appendChild(overlay);

            const btnModeHsl = box.querySelector("#coolauxv-action-color-mode-hsl");
            const btnModeRgb = box.querySelector("#coolauxv-action-color-mode-rgb");
            const panelHsl = box.querySelector("#coolauxv-action-color-hsl-panel");
            const panelRgb = box.querySelector("#coolauxv-action-color-rgb-panel");
            const preview = box.querySelector("#coolauxv-action-color-preview");
            const manualInput = box.querySelector("#coolauxv-action-color-manual");
            const closeBtn = box.querySelector("#coolauxv-action-color-close");
            const cancelBtn = box.querySelector("#coolauxv-action-color-cancel");
            const submitBtn = box.querySelector("#coolauxv-action-color-submit");
            const hInput = box.querySelector("#coolauxv-action-h");
            const sInput = box.querySelector("#coolauxv-action-s");
            const lInput = box.querySelector("#coolauxv-action-l");
            const rInput = box.querySelector("#coolauxv-action-r");
            const gInput = box.querySelector("#coolauxv-action-g");
            const bInput = box.querySelector("#coolauxv-action-b");

            const setMode = (nextMode) => {
                mode = nextMode === "rgb" ? "rgb" : "hsl";
                panelHsl.style.display = mode === "hsl" ? "flex" : "none";
                panelRgb.style.display = mode === "rgb" ? "flex" : "none";
                btnModeHsl.classList.toggle("coolauxv-btn-primary", mode === "hsl");
                btnModeRgb.classList.toggle("coolauxv-btn-primary", mode === "rgb");
                if (manualInput) {
                    manualInput.value = mode === "hsl" ? hslToCss(hsl) : rgbToCss(rgb);
                }
            };

            const syncPreview = () => {
                if (preview) preview.style.background = rgbToCss(rgb);
                if (hInput) hInput.value = String(hsl.h);
                if (sInput) sInput.value = String(hsl.s);
                if (lInput) lInput.value = String(hsl.l);
                if (rInput) rInput.value = String(rgb.r);
                if (gInput) gInput.value = String(rgb.g);
                if (bInput) bInput.value = String(rgb.b);
                if (manualInput) {
                    manualInput.value = mode === "hsl" ? hslToCss(hsl) : rgbToCss(rgb);
                }
            };

            const applyRgb = (nextRgb) => {
                rgb = {
                    r: Math.round(clampColorValue(nextRgb.r, 0, 255)),
                    g: Math.round(clampColorValue(nextRgb.g, 0, 255)),
                    b: Math.round(clampColorValue(nextRgb.b, 0, 255))
                };
                hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
                syncPreview();
            };

            const closeModal = () => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            };

            if (btnModeHsl) btnModeHsl.addEventListener("click", () => setMode("hsl"));
            if (btnModeRgb) btnModeRgb.addEventListener("click", () => setMode("rgb"));
            if (hInput) hInput.addEventListener("input", () => applyRgb(hslToRgb(hInput.value, sInput.value, lInput.value)));
            if (sInput) sInput.addEventListener("input", () => applyRgb(hslToRgb(hInput.value, sInput.value, lInput.value)));
            if (lInput) lInput.addEventListener("input", () => applyRgb(hslToRgb(hInput.value, sInput.value, lInput.value)));
            if (rInput) rInput.addEventListener("input", () => applyRgb({ r: rInput.value, g: gInput.value, b: bInput.value }));
            if (gInput) gInput.addEventListener("input", () => applyRgb({ r: rInput.value, g: gInput.value, b: bInput.value }));
            if (bInput) bInput.addEventListener("input", () => applyRgb({ r: rInput.value, g: gInput.value, b: bInput.value }));
            if (manualInput) {
                manualInput.addEventListener("change", () => {
                    const parsed = parseColorToRgb(manualInput.value);
                    if (!parsed) {
                        alert("颜色格式无效，请输入 HSL 或 RGB。");
                        syncPreview();
                        return;
                    }
                    applyRgb(parsed);
                });
            }
            if (submitBtn) {
                submitBtn.addEventListener("click", () => {
                    const value = mode === "hsl" ? hslToCss(hsl) : rgbToCss(rgb);
                    if (typeof onConfirm === "function") onConfirm(value);
                    closeModal();
                });
            }
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeModal();
            });

            setMode("hsl");
            syncPreview();
        };

        const openActionModal = (options = {}) => {
            const mode = options.mode === "edit" ? "edit" : "add";
            const templates = getActionTemplates();
            const existing = mode === "edit"
                ? templates.find((item) => item.id === options.actionId)
                : null;
            const baseAction = existing
                ? cloneDeep(existing)
                : {
                    id: "",
                    label: "",
                    systemPrompt: "",
                    color: hashStringToActionColor("new-action"),
                    weight: 1,
                    visionPromptOrder: "after"
                };

            const existingOverlay = document.getElementById("coolauxv-action-modal-overlay");
            if (existingOverlay && existingOverlay.parentNode) existingOverlay.parentNode.removeChild(existingOverlay);

            const overlay = document.createElement("div");
            overlay.id = "coolauxv-action-modal-overlay";
            Object.assign(overlay.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                background: "rgba(0,0,0,0.5)",
                zIndex: "2147483662",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backdropFilter: "blur(4px)"
            });

            const box = document.createElement("div");
            Object.assign(box.style, {
                background: "#fff",
                width: "520px",
                maxWidth: "92%",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                padding: "18px",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)"
            });

            const titleText = mode === "edit" ? "⚙️ 编辑按钮" : "➕ 新增按钮";
            const submitText = mode === "edit" ? "保存修改" : "保存";
            const readonly = mode === "edit" ? "readonly" : "";
            box.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
                    <div style="font-size:18px; font-weight:800; color:#a516e8;">${titleText}</div>
                    <button type="button" id="coolauxv-action-modal-close" class="coolauxv-ctrl-btn">×</button>
                </div>
                <div style="display:flex; gap:8px; margin-bottom:10px;">
                    <button type="button" id="coolauxv-action-mode-manual" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">手动填写</button>
                    <button type="button" id="coolauxv-action-mode-base64" class="coolauxv-action-btn" style="flex:1;">Base64 导入</button>
                </div>
                <div id="coolauxv-action-manual-section" style="display:flex; flex-direction:column; gap:8px; overflow:auto;">
                    <div class="coolauxv-sub-label">按钮文本</div>
                    <input type="text" id="coolauxv-action-form-label" class="coolauxv-setting-input coolauxv-fixed-input" value="${escapeAttr(baseAction.label)}" placeholder="例如：总结">
                    <div class="coolauxv-sub-label">按钮 ID（唯一）</div>
                    <input type="text" id="coolauxv-action-form-id" class="coolauxv-setting-input coolauxv-fixed-input" value="${escapeAttr(baseAction.id)}" ${readonly} placeholder="例如：summarize">
                    <div class="coolauxv-sub-label">System 提示词</div>
                    <textarea id="coolauxv-action-form-prompt" class="coolauxv-setting-input coolauxv-resizable-input" rows="5">${escapeText(baseAction.systemPrompt || "")}</textarea>
                    <div class="coolauxv-sub-label">按钮权重（主界面宽度占比，默认 1）</div>
                    <input type="number" id="coolauxv-action-form-weight" class="coolauxv-setting-input coolauxv-fixed-input" min="0.2" max="12" step="0.1" value="${escapeAttr(String(normalizeActionWeight(baseAction.weight)))}">
                    <div class="coolauxv-sub-label">按钮颜色（HSL 或 RGB）</div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input type="text" id="coolauxv-action-form-color" class="coolauxv-setting-input coolauxv-fixed-input" value="${escapeAttr(baseAction.color || "")}" placeholder="rgb(109, 40, 217)">
                        <button type="button" id="coolauxv-action-form-pick-color" class="coolauxv-action-btn">🎨 选色</button>
                    </div>
                    <div class="coolauxv-sub-label">视觉模式拼接顺序</div>
                    <select id="coolauxv-action-form-vision-order" class="coolauxv-setting-input coolauxv-fixed-input">
                        <option value="after" ${baseAction.visionPromptOrder !== "before" ? "selected" : ""}>System + 识图提示词</option>
                        <option value="before" ${baseAction.visionPromptOrder === "before" ? "selected" : ""}>识图提示词 + System</option>
                    </select>
                </div>
                <div id="coolauxv-action-base64-section" style="display:none;">
                    <div class="coolauxv-sub-label">Base64 文本</div>
                    <textarea id="coolauxv-action-form-base64" class="coolauxv-setting-input coolauxv-resizable-input" rows="5" placeholder="粘贴单个按钮配置或批量分享文本..."></textarea>
                </div>
                <div style="display:flex; gap:10px; margin-top:12px;">
                    <button type="button" id="coolauxv-action-modal-cancel" class="coolauxv-action-btn" style="flex:1;">取消</button>
                    <button type="button" id="coolauxv-action-modal-submit" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">${submitText}</button>
                </div>
            `;
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            const btnManual = box.querySelector("#coolauxv-action-mode-manual");
            const btnBase64 = box.querySelector("#coolauxv-action-mode-base64");
            const manualSection = box.querySelector("#coolauxv-action-manual-section");
            const base64Section = box.querySelector("#coolauxv-action-base64-section");
            const closeBtn = box.querySelector("#coolauxv-action-modal-close");
            const cancelBtn = box.querySelector("#coolauxv-action-modal-cancel");
            const submitBtn = box.querySelector("#coolauxv-action-modal-submit");
            const inputLabel = box.querySelector("#coolauxv-action-form-label");
            const inputId = box.querySelector("#coolauxv-action-form-id");
            const inputPrompt = box.querySelector("#coolauxv-action-form-prompt");
            const inputWeight = box.querySelector("#coolauxv-action-form-weight");
            const inputColor = box.querySelector("#coolauxv-action-form-color");
            const inputVisionOrder = box.querySelector("#coolauxv-action-form-vision-order");
            const inputBase64 = box.querySelector("#coolauxv-action-form-base64");
            const btnPickColor = box.querySelector("#coolauxv-action-form-pick-color");
            let activeTab = "manual";
            let isColorDirty = mode === "edit";

            const closeModal = () => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            };
            const setTab = (tab) => {
                activeTab = tab === "base64" ? "base64" : "manual";
                manualSection.style.display = activeTab === "manual" ? "flex" : "none";
                base64Section.style.display = activeTab === "base64" ? "block" : "none";
                btnManual.classList.toggle("coolauxv-btn-primary", activeTab === "manual");
                btnBase64.classList.toggle("coolauxv-btn-primary", activeTab === "base64");
            };

            if (btnManual) btnManual.addEventListener("click", () => setTab("manual"));
            if (btnBase64) btnBase64.addEventListener("click", () => setTab("base64"));
            const getActionSeedForColor = () => {
                const seedId = String((inputId && inputId.value) || "").trim();
                const seedLabel = String((inputLabel && inputLabel.value) || "").trim();
                const seedPrompt = String((inputPrompt && inputPrompt.value) || "").trim();
                return [seedId, seedLabel, seedPrompt].filter(Boolean).join("|");
            };
            const syncAutoColor = () => {
                if (isColorDirty || !inputColor) return;
                inputColor.value = hashStringToActionColor(getActionSeedForColor());
            };
            if (inputLabel) inputLabel.addEventListener("input", syncAutoColor);
            if (inputId) inputId.addEventListener("input", syncAutoColor);
            if (inputPrompt) inputPrompt.addEventListener("input", syncAutoColor);
            if (btnPickColor && inputColor) {
                btnPickColor.addEventListener("click", () => {
                    openActionColorPickerModal(inputColor.value, (nextColor) => {
                        isColorDirty = true;
                        inputColor.value = nextColor;
                    });
                });
            }
            if (inputColor) {
                inputColor.addEventListener("input", () => {
                    isColorDirty = true;
                });
            }
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeModal();
            });
            syncAutoColor();

            if (submitBtn) {
                submitBtn.addEventListener("click", () => {
                    if (activeTab === "base64") {
                        const imported = parseActionImportPayload(inputBase64 ? inputBase64.value : "");
                        if (!imported.length) {
                            alert("Base64 内容无效。");
                            return;
                        }
                        let nextTemplates = getActionTemplates().slice();
                        if (mode === "edit" && existing) {
                            const first = imported[0];
                            first.id = existing.id;
                            nextTemplates = nextTemplates.map((item) => item.id === existing.id ? first : item);
                        } else {
                            imported.forEach((item) => {
                                if (nextTemplates.some((tpl) => tpl.id === item.id)) {
                                    const nextId = `${item.id}-${Date.now().toString(36)}`;
                                    item.id = normalizeActionId(nextId);
                                }
                                nextTemplates.push(item);
                            });
                        }
                        saveActionTemplates(nextTemplates);
                        renderActionUI();
                        closeModal();
                        return;
                    }

                    const label = String((inputLabel && inputLabel.value) || "").trim();
                    const rawId = String((inputId && inputId.value) || "").trim();
                    const normalizedId = normalizeActionId(rawId || label);
                    const promptText = String((inputPrompt && inputPrompt.value) || "").trim();
                    const weight = normalizeActionWeight((inputWeight && inputWeight.value) || 1);
                    const colorText = String((inputColor && inputColor.value) || "").trim();
                    const visionOrder = normalizeActionVisionPromptOrder((inputVisionOrder && inputVisionOrder.value) || "after");
                    if (!normalizedId) {
                        alert("按钮 ID 不能为空。");
                        return;
                    }
                    if (!promptText) {
                        alert("System 提示词不能为空。");
                        return;
                    }
                    const normalizedColor = normalizeColorValue(colorText, hashStringToActionColor([normalizedId, label, promptText].filter(Boolean).join("|")));
                    const nextTemplate = ensureActionTemplate({
                        id: normalizedId,
                        label: label || normalizedId,
                        systemPrompt: promptText,
                        weight: weight,
                        color: normalizedColor,
                        visionPromptOrder: visionOrder
                    });
                    if (!nextTemplate) {
                        alert("按钮配置无效，请检查输入。");
                        return;
                    }

                    let nextTemplates = getActionTemplates().slice();
                    if (mode === "edit" && existing) {
                        nextTemplate.id = existing.id;
                        nextTemplates = nextTemplates.map((item) => item.id === existing.id ? nextTemplate : item);
                    } else {
                        if (nextTemplates.some((item) => item.id === nextTemplate.id)) {
                            alert("按钮 ID 已存在，请更换。");
                            return;
                        }
                        nextTemplates.push(nextTemplate);
                    }
                    saveActionTemplates(nextTemplates);
                    renderActionUI();
                    closeModal();
                });
            }
            setTab("manual");
        };

        const ensureActionSectionStates = (templates) => {
            templates.forEach((tpl) => {
                if (!actionSectionStates.has(tpl.id)) {
                    actionSectionStates.set(tpl.id, false);
                }
            });
            Array.from(actionSectionStates.keys()).forEach((id) => {
                if (!templates.some((tpl) => tpl.id === id)) actionSectionStates.delete(id);
            });
        };

        const updateActionToggleLabels = () => {
            if (!actionSectionsContainer) return;
            const sections = Array.from(actionSectionsContainer.querySelectorAll("[data-action-section]"));
            sections.forEach((section) => {
                const actionId = section.dataset.actionSection;
                const toggle = actionSectionsContainer.querySelector(`[data-action-toggle="${actionId}"]`);
                if (toggle) toggle.textContent = isSectionExpanded(section) ? "收起" : "展开";
            });
            if (!btnToggleActionAll || !sections.length) return;
            const allExpanded = sections.every((section) => isSectionExpanded(section));
            btnToggleActionAll.textContent = allExpanded ? "收起全部" : "展开全部";
        };

        const applyActionSectionStates = () => {
            if (!actionSectionsContainer) return;
            actionSectionsContainer.querySelectorAll("[data-action-section]").forEach((section) => {
                const actionId = section.dataset.actionSection;
                const expanded = actionSectionStates.get(actionId);
                setSectionStateInstant(section, !!expanded);
            });
            updateActionToggleLabels();
        };

        const updateActionBatchModeUI = () => {
            if (settingsRoot) {
                settingsRoot.classList.toggle("coolauxv-action-batch-mode", isActionBatchMode);
            }
            if (btnActionBatch) {
                const enableAnim = isBasicAnimEnabled();
                btnActionBatch.classList.toggle("coolauxv-batch-toggle-active", isActionBatchMode);
                btnActionBatch.classList.toggle("coolauxv-no-anim", !enableAnim);
                const textEl = btnActionBatch.querySelector("[data-batch-toggle-text]");
                if (textEl) textEl.textContent = isActionBatchMode ? "完成批量" : "批量";
            }
            if (!actionSectionsContainer) return;
            actionSectionsContainer.querySelectorAll(".coolauxv-action-select").forEach((checkbox) => {
                checkbox.checked = selectedActionIds.has(checkbox.dataset.actionId);
            });
            actionSectionsContainer.querySelectorAll("[data-sort-kind=\"action\"]").forEach((item) => {
                item.draggable = !!isActionBatchMode;
                const handle = item.querySelector("[data-sort-handle=\"action\"]");
                if (handle) handle.draggable = !!isActionBatchMode;
                if (!isActionBatchMode) {
                    item.classList.remove("coolauxv-dragging", "coolauxv-drag-over");
                }
            });
            if (!isActionBatchMode) {
                draggingActionId = "";
                actionDragArmedId = "";
            }
        };

        const renderActionSections = (templates) => {
            if (!actionSectionsContainer) return;
            actionSectionsContainer.innerHTML = templates.map((tpl) => {
                const styles = getActionStyleTokens(tpl.color);
                const sectionId = `coolauxv-action-section-${tpl.id}`;
                return `
                    <div class="coolauxv-setting-group coolauxv-sort-item" data-action-id="${escapeAttr(tpl.id)}" data-sort-kind="action" draggable="false">
                        <label class="coolauxv-setting-label">
                            <span class="coolauxv-sort-handle coolauxv-action-sort-handle" data-sort-handle="action" title="批量模式下拖动排序">⠿</span>
                            <span class="coolauxv-action-checkbox">
                                <input type="checkbox" class="coolauxv-action-select" data-action-id="${escapeAttr(tpl.id)}">
                            </span>
                            <span class="coolauxv-provider-title">${escapeAttr(tpl.label || tpl.id)}</span>
                            <span class="coolauxv-provider-subtitle">按钮模块</span>
                            <span class="coolauxv-link-btn" data-action-toggle="${escapeAttr(tpl.id)}" style="margin-left:auto; cursor:pointer; user-select:none;">收起</span>
                            <span class="coolauxv-link-btn" data-action="edit-action" data-action-id="${escapeAttr(tpl.id)}" style="cursor:pointer; user-select:none;">⚙️ 编辑</span>
                            <span class="coolauxv-link-btn" data-action="share-action" data-action-id="${escapeAttr(tpl.id)}" style="cursor:pointer; user-select:none;">🔗 分享</span>
                        </label>
                        <div id="${sectionId}" class="coolauxv-collapse-section" data-action-section="${escapeAttr(tpl.id)}">
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                <div class="coolauxv-sub-label">按钮文本</div>
                                <input type="text" class="coolauxv-setting-input coolauxv-fixed-input" data-action-id="${escapeAttr(tpl.id)}" data-action-field="label" value="${escapeAttr(tpl.label || "")}">
                                <div class="coolauxv-sub-label">System 提示词</div>
                                <textarea class="coolauxv-setting-input coolauxv-resizable-input" rows="4" data-action-id="${escapeAttr(tpl.id)}" data-action-field="systemPrompt">${escapeText(tpl.systemPrompt || "")}</textarea>
                                <div class="coolauxv-sub-label">按钮权重（主界面宽度占比）</div>
                                <input type="number" class="coolauxv-setting-input coolauxv-fixed-input" min="0.2" max="12" step="0.1" data-action-id="${escapeAttr(tpl.id)}" data-action-field="weight" value="${escapeAttr(String(normalizeActionWeight(tpl.weight)))}">
                                <div class="coolauxv-sub-label">按钮颜色</div>
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <input type="text" class="coolauxv-setting-input coolauxv-fixed-input" data-action-id="${escapeAttr(tpl.id)}" data-action-field="color" value="${escapeAttr(tpl.color || "")}">
                                    <button type="button" class="coolauxv-action-btn" data-action="pick-color" data-action-id="${escapeAttr(tpl.id)}">🎨</button>
                                    <span style="width:30px; height:30px; border-radius:8px; border:1px solid #e5e7eb; background:${escapeAttr(styles.bg)};"></span>
                                </div>
                                <div class="coolauxv-sub-label">视觉模式拼接顺序</div>
                                <select class="coolauxv-setting-input coolauxv-fixed-input" data-action-id="${escapeAttr(tpl.id)}" data-action-field="visionPromptOrder">
                                    <option value="after" ${tpl.visionPromptOrder !== "before" ? "selected" : ""}>System + 识图提示词</option>
                                    <option value="before" ${tpl.visionPromptOrder === "before" ? "selected" : ""}>识图提示词 + System</option>
                                </select>
                            </div>
                        </div>
                    </div>
                `;
            }).join("");
        };

        const renderActionUI = () => {
            const templates = getActionTemplates();
            if (!templates.length) {
                saveActionTemplates(getDefaultActionTemplates());
            }
            const latestTemplates = getActionTemplates();
            const resolvedDefault = resolveActionTemplateId(GM_getValue("coolauxv_selection_icon_action", DEFAULT_SELECTION_ICON_ACTION), latestTemplates);
            if (resolvedDefault !== GM_getValue("coolauxv_selection_icon_action", "")) {
                GM_setValue("coolauxv_selection_icon_action", resolvedDefault);
            }
            ensureActionSectionStates(latestTemplates);
            renderActionSections(latestTemplates);
            applyActionSectionStates();
            updateActionBatchModeUI();
            renderMainActionButtons();
            renderSelectionActionRadioGroup();
        };

        renderProviderUI();
        renderActionUI();

        if (providerRadioGroup) {
            providerRadioGroup.addEventListener("change", (e) => {
                const target = e.target;
                if (!target || target.name !== "coolauxv_provider_radio") return;
                if (!target.checked) return;
                const templates = getProviderTemplates();
                const providerId = resolveProviderId(target.value, templates);
                GM_setValue("coolauxv_default_provider", providerId);
                if (inputModelProvider) {
                    inputModelProvider.value = providerId;
                    GM_setValue("coolauxv_model_provider", providerId);
                    applyModelProviderUI(providerId);
                }
                syncChatProvider(providerId);
                updateProviderFeatureVisibility();
                const expandedCount = Array.from(providerSectionStates.values()).filter(Boolean).length;
                providerSectionStates.forEach((_, id) => {
                    if (id === providerId) providerSectionStates.set(id, true);
                    else if (expandedCount <= 1) providerSectionStates.set(id, false);
                });
                if (providerSectionsContainer) {
                    providerSectionsContainer.querySelectorAll("[data-provider-section]").forEach((section) => {
                        const sectionId = section.dataset.providerSection;
                        const targetOpen = providerSectionStates.get(sectionId);
                        setSectionAnimatedVisibility(section, !!targetOpen);
                    });
                    updateProviderToggleLabels();
                }
            });
        }

        if (providerSectionsContainer) {
            const clearProviderDragVisual = () => {
                providerSectionsContainer.querySelectorAll("[data-sort-kind=\"provider\"]").forEach((item) => {
                    item.classList.remove("coolauxv-dragging", "coolauxv-drag-over");
                });
            };
            providerSectionsContainer.addEventListener("pointerdown", (e) => {
                const targetEl = e.target instanceof Element ? e.target : null;
                const handle = targetEl ? targetEl.closest("[data-sort-handle=\"provider\"]") : null;
                const item = targetEl ? targetEl.closest("[data-sort-kind=\"provider\"]") : null;
                if (!isProviderBatchMode || !handle || !item) {
                    providerDragArmedId = "";
                    return;
                }
                providerDragArmedId = item.dataset.providerId || "";
            });
            providerSectionsContainer.addEventListener("pointerup", () => {
                providerDragArmedId = "";
            });
            providerSectionsContainer.addEventListener("pointercancel", () => {
                providerDragArmedId = "";
            });
            providerSectionsContainer.addEventListener("dragstart", (e) => {
                const targetEl = e.target instanceof Element ? e.target : null;
                const item = targetEl ? targetEl.closest("[data-sort-kind=\"provider\"]") : null;
                if (!isProviderBatchMode || !item) {
                    e.preventDefault();
                    return;
                }
                const providerId = item.dataset.providerId;
                if (!providerId || providerDragArmedId !== providerId) {
                    e.preventDefault();
                    return;
                }
                providerDragArmedId = "";
                draggingProviderId = providerId;
                clearProviderDragVisual();
                item.classList.add("coolauxv-dragging");
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", providerId);
                }
            });
            providerSectionsContainer.addEventListener("dragover", (e) => {
                if (!isProviderBatchMode || !draggingProviderId) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                const targetEl = e.target instanceof Element ? e.target : null;
                const overItem = targetEl ? targetEl.closest("[data-sort-kind=\"provider\"]") : null;
                if (!overItem) return;
                const overId = overItem.dataset.providerId;
                if (!overId) return;
                providerSectionsContainer.querySelectorAll("[data-sort-kind=\"provider\"].coolauxv-drag-over").forEach((item) => {
                    if (item !== overItem) item.classList.remove("coolauxv-drag-over");
                });
                overItem.classList.add("coolauxv-drag-over");
                if (overId === draggingProviderId) return;
                const dragItem = Array.from(providerSectionsContainer.querySelectorAll("[data-sort-kind=\"provider\"]"))
                    .find((item) => item.dataset.providerId === draggingProviderId);
                if (!dragItem || dragItem === overItem) return;
                const rect = overItem.getBoundingClientRect();
                const shouldInsertBefore = e.clientY < (rect.top + rect.height / 2);
                const noPositionChange = shouldInsertBefore
                    ? dragItem.nextElementSibling === overItem
                    : overItem.nextElementSibling === dragItem;
                if (noPositionChange) return;
                const beforeMap = captureSortPositions(
                    providerSectionsContainer,
                    "[data-sort-kind=\"provider\"]",
                    (item) => item.dataset.providerId || ""
                );
                if (shouldInsertBefore) {
                    providerSectionsContainer.insertBefore(dragItem, overItem);
                } else {
                    providerSectionsContainer.insertBefore(dragItem, overItem.nextElementSibling);
                }
                animateSortReflow(
                    providerSectionsContainer,
                    "[data-sort-kind=\"provider\"]",
                    (item) => item.dataset.providerId || "",
                    beforeMap
                );
            });
            providerSectionsContainer.addEventListener("dragleave", (e) => {
                const targetEl = e.target instanceof Element ? e.target : null;
                const item = targetEl ? targetEl.closest("[data-sort-kind=\"provider\"]") : null;
                if (!item) return;
                const related = e.relatedTarget instanceof Element ? e.relatedTarget : null;
                if (related && item.contains(related)) return;
                item.classList.remove("coolauxv-drag-over");
            });
            providerSectionsContainer.addEventListener("drop", (e) => {
                if (!isProviderBatchMode || !draggingProviderId) return;
                e.preventDefault();
                clearProviderDragVisual();
                draggingProviderId = "";
                providerDragArmedId = "";
                const orderedIds = Array.from(providerSectionsContainer.querySelectorAll("[data-sort-kind=\"provider\"]"))
                    .map((item) => item.dataset.providerId || "")
                    .filter(Boolean);
                if (!orderedIds.length) return;
                const nextTemplates = reorderTemplatesByOrderedIds(getProviderTemplates(), orderedIds);
                saveProviderTemplates(nextTemplates);
                renderProviderUI();
            });
            providerSectionsContainer.addEventListener("dragend", () => {
                draggingProviderId = "";
                providerDragArmedId = "";
                clearProviderDragVisual();
            });
            providerSectionsContainer.addEventListener("click", (e) => {
                const target = e.target;
                if (!target) return;
                const action = target.dataset.action;
                if (action === "toggle-key") {
                    const inputId = target.dataset.target;
                    const input = inputId ? popup.querySelector(`#${inputId}`) : null;
                    if (!input) return;
                    if (input.type === "password") {
                        input.type = "text";
                        target.innerText = "🔒 隐藏";
                    } else {
                        input.type = "password";
                        target.innerText = "👁️ 显示";
                    }
                    return;
                }
                if (action === "toggle-custom-fields") {
                    const providerId = target.dataset.providerId;
                    if (!providerId) return;
                    const inputs = providerSectionsContainer.querySelectorAll(`[data-provider-id="${providerId}"][data-custom-mask="true"]`);
                    if (!inputs.length) return;
                    const shouldShow = Array.from(inputs).some((input) => input.type === "password");
                    inputs.forEach((input) => {
                        input.type = shouldShow ? "text" : "password";
                    });
                    target.innerText = shouldShow ? "🔒 隐藏" : "👁️ 显示";
                    return;
                }
                if (action === "edit-provider") {
                    const providerId = target.dataset.providerId;
                    if (!providerId) return;
                    openProviderModal({ mode: "edit", providerId: providerId });
                    return;
                }
                const toggleId = target.dataset.providerToggle;
                if (toggleId) {
                    const section = providerSectionsContainer.querySelector(`[data-provider-section="${toggleId}"]`);
                    if (!section) return;
                    const shouldExpand = !isSectionExpanded(section);
                    providerSectionStates.set(toggleId, shouldExpand);
                    setSectionAnimatedVisibility(section, shouldExpand);
                    updateProviderToggleLabels();
                }
            });

            providerSectionsContainer.addEventListener("change", (e) => {
                const target = e.target;
                if (!target) return;
                if (target.classList.contains("coolauxv-provider-select")) {
                    const providerId = target.dataset.providerId;
                    if (!providerId) return;
                    if (target.checked) selectedProviderIds.add(providerId);
                    else selectedProviderIds.delete(providerId);
                    return;
                }
                const providerId = target.dataset.providerId;
                const field = target.dataset.providerField;
                if (!providerId || !field) return;
                const templates = getProviderTemplates();
                const tpl = templates.find((item) => item.id === providerId);
                if (!tpl) return;

                if (field === "type") {
                    const previousType = tpl.type;
                    const nextType = normalizeProviderType(target.value);
                    tpl.type = nextType;
                    tpl.stream.parser = nextType === "chat-no-history" ? "chat-completions" : nextType;
                    if (isChatCompletionsLikeProviderType(nextType) && !tpl.stream.deltaPath) {
                        tpl.stream.deltaPath = getDefaultDeltaPathByType(nextType);
                    }
                    if (previousType !== nextType) {
                        const defaultBody = defaultBodyTemplateForType(previousType);
                        if (JSON.stringify(tpl.bodyTemplate || {}) === JSON.stringify(defaultBody)) {
                            tpl.bodyTemplate = defaultBodyTemplateForType(nextType);
                        }
                    }
                    saveProviderTemplates(templates);
                    renderProviderUI();
                    return;
                }

                if (target.classList.contains("coolauxv-provider-json")) {
                    const parsed = parseTemplateJson(target.value.trim());
                    if (!parsed) {
                        alert("JSON 解析失败，请检查格式。");
                        renderProviderUI();
                        return;
                    }
                    if (field === "headersTemplate") tpl.headersTemplate = parsed;
                    if (field === "bodyTemplate") tpl.bodyTemplate = parsed;
                    saveProviderTemplates(templates);
                    return;
                }

                if (field === "supportsVision") {
                    tpl.supportsVision = target.checked;
                    saveProviderTemplates(templates);
                    updateProviderFeatureVisibility();
                    renderProviderUI();
                    return;
                }
                if (field === "supportsContinuousChat") {
                    tpl.supportsContinuousChat = target.checked;
                    saveProviderTemplates(templates);
                    updateProviderFeatureVisibility();
                    renderProviderUI();
                    return;
                }

                if (field === "label") {
                    tpl.label = target.value.trim() || tpl.id;
                    saveProviderTemplates(templates);
                    renderProviderUI();
                    return;
                }

                if (field === "baseUrl") {
                    tpl.baseUrl = target.value.trim();
                    saveProviderTemplates(templates);
                    renderProviderUI();
                    return;
                }

                if (field.startsWith("roles.")) {
                    const roleKey = field.split(".")[1];
                    tpl.roles[roleKey] = target.value.trim() || roleKey;
                    saveProviderTemplates(templates);
                    return;
                }

                if (field.startsWith("stream.")) {
                    const streamKey = field.split(".")[1];
                    const rawValue = target.value.trim();
                    if (streamKey === "sessionIdKey") {
                        tpl.stream[streamKey] = normalizeTemplateKey(rawValue) || DEFAULT_PROVIDER_SESSION_FIELD_KEY;
                    } else if (streamKey === "reasoningTag") {
                        tpl.stream[streamKey] = rawValue.toLowerCase();
                    } else {
                        tpl.stream[streamKey] = rawValue;
                    }
                    saveProviderTemplates(templates);
                    return;
                }

                if (field.startsWith("customFields.")) {
                    const key = field.split(".").slice(1).join(".");
                    const meta = getCustomFieldMetaMap(tpl);
                    const isMasked = meta[key] ? !!meta[key].masked : false;
                    if (isMasked) {
                        updateProviderSecretField(tpl.id, key, target.value);
                        tpl.customFields = normalizeCustomFields(tpl.customFields);
                        if (!Object.prototype.hasOwnProperty.call(tpl.customFields, key)) {
                            tpl.customFields[key] = "";
                        } else if (tpl.customFields[key] !== "") {
                            tpl.customFields[key] = "";
                        }
                        saveProviderTemplates(templates);
                        return;
                    }
                    updateProviderSecretField(tpl.id, key, "");
                    tpl.customFields = normalizeCustomFields(tpl.customFields);
                    tpl.customFields[key] = target.value;
                    clearLegacyProviderValueIfNeeded(tpl.id, `customFields.${key}`, target.value);
                    saveProviderTemplates(templates);
                    return;
                }

                tpl[field] = target.value;
                clearLegacyProviderValueIfNeeded(tpl.id, field, target.value);
                saveProviderTemplates(templates);
            });

            providerSectionsContainer.addEventListener("input", (e) => {
                const target = e.target;
                if (!target || !target.dataset) return;
                const providerId = target.dataset.providerId;
                const field = target.dataset.providerField;
                if (!providerId || !field) return;
                if (target.classList.contains("coolauxv-provider-json")) return;
                const templates = getProviderTemplates();
                const tpl = templates.find((item) => item.id === providerId);
                if (!tpl) return;
                if (field === "label" || field === "baseUrl" || field === "type") return;
                if (field === "supportsVision" || field === "supportsContinuousChat") return;
                if (field.startsWith("roles.")) {
                    const roleKey = field.split(".")[1];
                    tpl.roles[roleKey] = target.value.trim();
                    saveProviderTemplates(templates);
                    return;
                }
                if (field.startsWith("stream.")) {
                    const streamKey = field.split(".")[1];
                    tpl.stream[streamKey] = target.value.trim();
                    saveProviderTemplates(templates);
                    return;
                }
                if (field.startsWith("customFields.")) {
                    const key = field.split(".").slice(1).join(".");
                    const meta = getCustomFieldMetaMap(tpl);
                    const isMasked = meta[key] ? !!meta[key].masked : false;
                    if (isMasked) {
                        updateProviderSecretField(tpl.id, key, target.value);
                        tpl.customFields = normalizeCustomFields(tpl.customFields);
                        if (!Object.prototype.hasOwnProperty.call(tpl.customFields, key)) {
                            tpl.customFields[key] = "";
                        } else if (tpl.customFields[key] !== "") {
                            tpl.customFields[key] = "";
                        }
                        saveProviderTemplates(templates);
                        return;
                    }
                    updateProviderSecretField(tpl.id, key, "");
                    tpl.customFields = normalizeCustomFields(tpl.customFields);
                    tpl.customFields[key] = target.value;
                    clearLegacyProviderValueIfNeeded(tpl.id, `customFields.${key}`, target.value);
                    saveProviderTemplates(templates);
                    return;
                }
                tpl[field] = target.value;
                clearLegacyProviderValueIfNeeded(tpl.id, field, target.value);
                saveProviderTemplates(templates);
            });
        }

        if (selectionActionRadioGroup) {
            selectionActionRadioGroup.addEventListener("change", (e) => {
                const target = e.target;
                if (!target || target.name !== "coolauxv_selection_icon_action_radio_dynamic") return;
                if (!target.checked) return;
                const actionId = resolveActionTemplateId(target.value, getActionTemplates());
                GM_setValue("coolauxv_selection_icon_action", actionId);
            });
        }

        if (actionSectionsContainer) {
            const clearActionDragVisual = () => {
                actionSectionsContainer.querySelectorAll("[data-sort-kind=\"action\"]").forEach((item) => {
                    item.classList.remove("coolauxv-dragging", "coolauxv-drag-over");
                });
            };
            actionSectionsContainer.addEventListener("pointerdown", (e) => {
                const targetEl = e.target instanceof Element ? e.target : null;
                const handle = targetEl ? targetEl.closest("[data-sort-handle=\"action\"]") : null;
                const item = targetEl ? targetEl.closest("[data-sort-kind=\"action\"]") : null;
                if (!isActionBatchMode || !handle || !item) {
                    actionDragArmedId = "";
                    return;
                }
                actionDragArmedId = item.dataset.actionId || "";
            });
            actionSectionsContainer.addEventListener("pointerup", () => {
                actionDragArmedId = "";
            });
            actionSectionsContainer.addEventListener("pointercancel", () => {
                actionDragArmedId = "";
            });
            actionSectionsContainer.addEventListener("dragstart", (e) => {
                const targetEl = e.target instanceof Element ? e.target : null;
                const item = targetEl ? targetEl.closest("[data-sort-kind=\"action\"]") : null;
                if (!isActionBatchMode || !item) {
                    e.preventDefault();
                    return;
                }
                const actionId = item.dataset.actionId;
                if (!actionId || actionDragArmedId !== actionId) {
                    e.preventDefault();
                    return;
                }
                actionDragArmedId = "";
                draggingActionId = actionId;
                clearActionDragVisual();
                item.classList.add("coolauxv-dragging");
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", actionId);
                }
            });
            actionSectionsContainer.addEventListener("dragover", (e) => {
                if (!isActionBatchMode || !draggingActionId) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                const targetEl = e.target instanceof Element ? e.target : null;
                const overItem = targetEl ? targetEl.closest("[data-sort-kind=\"action\"]") : null;
                if (!overItem) return;
                const overId = overItem.dataset.actionId;
                if (!overId) return;
                actionSectionsContainer.querySelectorAll("[data-sort-kind=\"action\"].coolauxv-drag-over").forEach((item) => {
                    if (item !== overItem) item.classList.remove("coolauxv-drag-over");
                });
                overItem.classList.add("coolauxv-drag-over");
                if (overId === draggingActionId) return;
                const dragItem = Array.from(actionSectionsContainer.querySelectorAll("[data-sort-kind=\"action\"]"))
                    .find((item) => item.dataset.actionId === draggingActionId);
                if (!dragItem || dragItem === overItem) return;
                const rect = overItem.getBoundingClientRect();
                const shouldInsertBefore = e.clientY < (rect.top + rect.height / 2);
                const noPositionChange = shouldInsertBefore
                    ? dragItem.nextElementSibling === overItem
                    : overItem.nextElementSibling === dragItem;
                if (noPositionChange) return;
                const beforeMap = captureSortPositions(
                    actionSectionsContainer,
                    "[data-sort-kind=\"action\"]",
                    (item) => item.dataset.actionId || ""
                );
                if (shouldInsertBefore) {
                    actionSectionsContainer.insertBefore(dragItem, overItem);
                } else {
                    actionSectionsContainer.insertBefore(dragItem, overItem.nextElementSibling);
                }
                animateSortReflow(
                    actionSectionsContainer,
                    "[data-sort-kind=\"action\"]",
                    (item) => item.dataset.actionId || "",
                    beforeMap
                );
            });
            actionSectionsContainer.addEventListener("dragleave", (e) => {
                const targetEl = e.target instanceof Element ? e.target : null;
                const item = targetEl ? targetEl.closest("[data-sort-kind=\"action\"]") : null;
                if (!item) return;
                const related = e.relatedTarget instanceof Element ? e.relatedTarget : null;
                if (related && item.contains(related)) return;
                item.classList.remove("coolauxv-drag-over");
            });
            actionSectionsContainer.addEventListener("drop", (e) => {
                if (!isActionBatchMode || !draggingActionId) return;
                e.preventDefault();
                clearActionDragVisual();
                draggingActionId = "";
                actionDragArmedId = "";
                const orderedIds = Array.from(actionSectionsContainer.querySelectorAll("[data-sort-kind=\"action\"]"))
                    .map((item) => item.dataset.actionId || "")
                    .filter(Boolean);
                if (!orderedIds.length) return;
                const nextTemplates = reorderTemplatesByOrderedIds(getActionTemplates(), orderedIds);
                saveActionTemplates(nextTemplates);
                renderActionUI();
            });
            actionSectionsContainer.addEventListener("dragend", () => {
                draggingActionId = "";
                actionDragArmedId = "";
                clearActionDragVisual();
            });
            actionSectionsContainer.addEventListener("click", (e) => {
                const target = e.target;
                if (!target) return;
                const actionType = target.dataset.action;
                if (actionType === "edit-action") {
                    const actionId = target.dataset.actionId;
                    if (!actionId) return;
                    openActionModal({ mode: "edit", actionId: actionId });
                    return;
                }
                if (actionType === "share-action") {
                    const actionId = target.dataset.actionId;
                    if (!actionId) return;
                    const tpl = getActionTemplates().find((item) => item.id === actionId);
                    if (!tpl) return;
                    const payload = encodeActionTemplateBase64(tpl);
                    if (!payload) {
                        alert("分享失败，请稍后重试。");
                        return;
                    }
                    if (typeof GM_setClipboard !== "undefined") {
                        GM_setClipboard(payload, "text");
                        alert("按钮配置已复制到剪贴板。");
                    } else {
                        prompt("按钮配置已生成，请复制：", payload);
                    }
                    return;
                }
                if (actionType === "pick-color") {
                    const actionId = target.dataset.actionId;
                    if (!actionId) return;
                    const input = actionSectionsContainer.querySelector(`[data-action-id="${actionId}"][data-action-field="color"]`);
                    if (!input) return;
                    openActionColorPickerModal(input.value, (nextColor) => {
                        input.value = nextColor;
                        input.dispatchEvent(new Event("change", { bubbles: true }));
                    });
                    return;
                }
                const toggleId = target.dataset.actionToggle;
                if (toggleId) {
                    const section = actionSectionsContainer.querySelector(`[data-action-section="${toggleId}"]`);
                    if (!section) return;
                    const shouldExpand = !isSectionExpanded(section);
                    actionSectionStates.set(toggleId, shouldExpand);
                    setSectionAnimatedVisibility(section, shouldExpand);
                    updateActionToggleLabels();
                }
            });

            actionSectionsContainer.addEventListener("change", (e) => {
                const target = e.target;
                if (!target) return;
                if (target.classList.contains("coolauxv-action-select")) {
                    const actionId = target.dataset.actionId;
                    if (!actionId) return;
                    if (target.checked) selectedActionIds.add(actionId);
                    else selectedActionIds.delete(actionId);
                    return;
                }
                const actionId = target.dataset.actionId;
                const field = target.dataset.actionField;
                if (!actionId || !field) return;
                const templates = getActionTemplates();
                const tpl = templates.find((item) => item.id === actionId);
                if (!tpl) return;

                if (field === "color") {
                    const parsed = parseColorToRgb(target.value);
                    if (!parsed) {
                        alert("颜色格式无效，请输入 HSL 或 RGB。");
                        renderActionUI();
                        return;
                    }
                    tpl.color = rgbToCss(parsed);
                    saveActionTemplates(templates);
                    renderActionUI();
                    return;
                }
                if (field === "visionPromptOrder") {
                    tpl.visionPromptOrder = normalizeActionVisionPromptOrder(target.value);
                    saveActionTemplates(templates);
                    return;
                }
                if (field === "weight") {
                    tpl.weight = normalizeActionWeight(target.value);
                    saveActionTemplates(templates);
                    renderActionUI();
                    return;
                }
                if (field === "label") {
                    tpl.label = String(target.value || "").trim() || tpl.id;
                    saveActionTemplates(templates);
                    renderActionUI();
                    return;
                }
                if (field === "systemPrompt") {
                    tpl.systemPrompt = String(target.value || "").trim();
                    if (!tpl.systemPrompt) {
                        tpl.systemPrompt = getDefaultActionPromptById(tpl.id);
                    }
                    saveActionTemplates(templates);
                    renderActionUI();
                    return;
                }
            });
        }

        if (modelSectionsContainer) {
            modelSectionsContainer.addEventListener("click", (e) => {
                const btn = e.target.closest(".coolauxv-model-btn");
                if (!btn) return;
                const providerId = btn.dataset.providerId;
                const groupId = btn.dataset.groupId;
                const value = btn.dataset.val;
                if (!providerId || !groupId || !value) return;
                const templates = getProviderTemplates();
                const tpl = templates.find((item) => item.id === providerId);
                if (!tpl) return;
                const group = tpl.modelGroups.find((item) => item.id === groupId);
                if (!group) return;
                group.selectedModel = value;
                saveProviderTemplates(templates);
                const input = modelSectionsContainer.querySelector(`[data-provider-id="${providerId}"][data-group-id="${groupId}"][data-group-field="selectedModel"]`);
                if (input) {
                    input.value = value;
                    if (typeof input._coolauxvSyncClear === "function") input._coolauxvSyncClear();
                }
            });

            modelSectionsContainer.addEventListener("input", (e) => {
                const target = e.target;
                if (!target || !target.dataset) return;
                const providerId = target.dataset.providerId;
                const groupId = target.dataset.groupId;
                const field = target.dataset.groupField;
                if (!providerId || !groupId || field !== "selectedModel") return;
                const templates = getProviderTemplates();
                const tpl = templates.find((item) => item.id === providerId);
                if (!tpl) return;
                const group = tpl.modelGroups.find((item) => item.id === groupId);
                if (!group) return;
                group.selectedModel = target.value.trim();
                saveProviderTemplates(templates);
            });
        }

        if (btnProviderAdd) {
            btnProviderAdd.addEventListener("click", () => {
                openProviderModal({ mode: "add" });
            });
        }

        if (btnProviderBatch) {
            btnProviderBatch.addEventListener("click", () => {
                isProviderBatchMode = !isProviderBatchMode;
                if (!isProviderBatchMode) {
                    selectedProviderIds.clear();
                }
                updateBatchModeUI();
            });
        }

        if (btnProviderShare) {
            btnProviderShare.addEventListener("click", () => {
                if (!selectedProviderIds.size) {
                    alert("请先选择要分享的提供商。");
                    return;
                }
                const includePrivacy = confirm("分享配置是否包含隐私信息（如 API KEY、打码字段）？\n确定=包含，取消=不包含");
                const secrets = loadProviderSecretStore();
                const usedProviderShareIds = new Set();
                const templates = getProviderTemplates()
                    .filter((tpl) => selectedProviderIds.has(tpl.id))
                    .map((tpl, index) => {
                        const clone = cloneDeep(tpl);
                        if (!includePrivacy) {
                            clone.apiKey = "";
                        }
                        if (clone.customFields) {
                            const meta = getCustomFieldMetaMap(clone);
                            const secretValues = secrets[clone.id] && typeof secrets[clone.id] === "object" ? secrets[clone.id] : {};
                            Object.keys(clone.customFields).forEach((key) => {
                                if (meta[key] && meta[key].masked) {
                                    if (includePrivacy) {
                                        const secretVal = secretValues[key];
                                        clone.customFields[key] = secretVal !== undefined && secretVal !== null
                                            ? String(secretVal)
                                            : "";
                                    } else {
                                        clone.customFields[key] = "";
                                    }
                                }
                            });
                        }
                        const compacted = compactProviderTemplate(clone);
                        return buildShareTemplateWithHashedId(compacted, "provider", String(index), usedProviderShareIds);
                    });
                const sharePayload = pruneEmptyValues({ version: PROVIDER_SHARE_VERSION, providers: templates });
                const payload = encodeBase64(JSON.stringify(sharePayload));
                if (!payload) {
                    alert("分享失败，请稍后重试。");
                    return;
                }
                if (typeof GM_setClipboard !== "undefined") {
                    GM_setClipboard(payload, "text");
                    alert("已生成分享文本并复制到剪贴板。");
                } else {
                    prompt("分享文本已生成，请复制：", payload);
                }
            });
        }

        if (btnProviderBatchDelete) {
            btnProviderBatchDelete.addEventListener("click", () => {
                if (!selectedProviderIds.size) {
                    alert("请先选择要删除的提供商。");
                    return;
                }
                if (!confirm("确定要删除选中的提供商吗？")) return;
                let templates = getProviderTemplates().filter((tpl) => !selectedProviderIds.has(tpl.id));
                if (!templates.length) {
                    templates = getDefaultProviderTemplates();
                }
                saveProviderTemplates(templates);
                selectedProviderIds.forEach((providerId) => clearProviderSecretFields(providerId));
                selectedProviderIds.clear();
                renderProviderUI();
            });
        }

        if (btnToggleProviderAll) {
            btnToggleProviderAll.addEventListener("click", () => {
                if (!providerSectionsContainer) return;
                const sections = Array.from(providerSectionsContainer.querySelectorAll("[data-provider-section]"));
                if (!sections.length) return;
                const allExpanded = sections.every((section) => isSectionExpanded(section));
                sections.forEach((section) => {
                    const providerId = section.dataset.providerSection;
                    const nextState = !allExpanded;
                    providerSectionStates.set(providerId, nextState);
                    setSectionAnimatedVisibility(section, nextState);
                });
                updateProviderToggleLabels();
            });
        }

        if (btnActionAdd) {
            btnActionAdd.addEventListener("click", () => {
                openActionModal({ mode: "add" });
            });
        }

        if (btnActionReset) {
            btnActionReset.addEventListener("click", () => {
                const ok = confirm("确定要重置主界面按钮模块吗？\n这会覆盖你当前的按钮自定义配置。");
                if (!ok) return;
                saveActionTemplates(getDefaultActionTemplates());
                selectedActionIds.clear();
                isActionBatchMode = false;
                renderActionUI();
            });
        }

        if (btnActionBatch) {
            btnActionBatch.addEventListener("click", () => {
                isActionBatchMode = !isActionBatchMode;
                if (!isActionBatchMode) selectedActionIds.clear();
                updateActionBatchModeUI();
            });
        }

        if (btnActionShare) {
            btnActionShare.addEventListener("click", () => {
                if (!selectedActionIds.size) {
                    alert("请先选择要分享的按钮。");
                    return;
                }
                const usedActionShareIds = new Set();
                const templates = getActionTemplates()
                    .filter((tpl) => selectedActionIds.has(tpl.id))
                    .map((tpl, index) => {
                        const compacted = compactActionTemplate(tpl);
                        return buildShareTemplateWithHashedId(compacted, "action", String(index), usedActionShareIds);
                    });
                const payload = encodeBase64(JSON.stringify(pruneEmptyValues({ version: ACTION_SHARE_VERSION, actions: templates })));
                if (!payload) {
                    alert("分享失败，请稍后重试。");
                    return;
                }
                if (typeof GM_setClipboard !== "undefined") {
                    GM_setClipboard(payload, "text");
                    alert("已生成分享文本并复制到剪贴板。");
                } else {
                    prompt("分享文本已生成，请复制：", payload);
                }
            });
        }

        if (btnActionBatchDelete) {
            btnActionBatchDelete.addEventListener("click", () => {
                if (!selectedActionIds.size) {
                    alert("请先选择要删除的按钮。");
                    return;
                }
                if (!confirm("确定要删除选中的按钮吗？")) return;
                let templates = getActionTemplates().filter((tpl) => !selectedActionIds.has(tpl.id));
                if (!templates.length) templates = getDefaultActionTemplates();
                saveActionTemplates(templates);
                selectedActionIds.clear();
                renderActionUI();
            });
        }

        if (btnToggleActionAll) {
            btnToggleActionAll.addEventListener("click", () => {
                if (!actionSectionsContainer) return;
                const sections = Array.from(actionSectionsContainer.querySelectorAll("[data-action-section]"));
                if (!sections.length) return;
                const allExpanded = sections.every((section) => isSectionExpanded(section));
                sections.forEach((section) => {
                    const actionId = section.dataset.actionSection;
                    const nextState = !allExpanded;
                    actionSectionStates.set(actionId, nextState);
                    setSectionAnimatedVisibility(section, nextState);
                });
                updateActionToggleLabels();
            });
        }

        if (inputModelProvider) {
            inputModelProvider.addEventListener("change", (e) => {
                const templates = getProviderTemplates();
                const providerId = resolveProviderId(e.target.value || DEFAULT_MODEL_PROVIDER, templates);
                GM_setValue("coolauxv_model_provider", providerId);
                applyModelProviderUI(providerId);
            });
        }

        const syncContinuousChatPromptSectionVisibility = (enabled) => {
            if (!continuousChatPromptSection) return;
            const shouldShow = enabled !== undefined
                ? !!enabled
                : (inputContinuousChat
                    ? !!inputContinuousChat.checked
                    : !!GM_getValue("coolauxv_enable_continuous_chat", DEFAULT_ENABLE_CONTINUOUS_CHAT));
            if (isBasicAnimEnabled()) {
                setSectionAnimatedVisibility(continuousChatPromptSection, shouldShow);
            } else {
                setSectionStateInstant(continuousChatPromptSection, shouldShow);
            }
        };

        const toggleContinuousChat = () => {
            updateProviderFeatureVisibility();
            syncContinuousChatPromptSectionVisibility();
        };

        const applyBasicAnimSetting = (enabled) => {
            if (!popup) return;
            popup.classList.toggle("coolauxv-basic-anim-off", !enabled);
            // 重新同步折叠区状态，保证关闭基础动画时立即生效
            updateChatCollapseUI();
            updateTopSectionCollapseUI();
            setReasoningAnimatedVisibility(hasReasoning && isShowReasoning);
            syncContinuousChatPromptSectionVisibility();
        };

        const finalizeChatBodyExpand = () => {
            if (!chatBody || isChatCollapsed) return;
            chatBody.style.maxHeight = "none";
            chatBody.style.overflow = "visible";
        };

        const syncChatBodyHeight = () => {
            if (!chatBody || isChatCollapsed) return;
            if (chatBody.style.maxHeight === "none") return;
            chatBody.style.maxHeight = `${chatBody.scrollHeight}px`;
        };

        const finalizeTopSectionExpand = () => {
            if (!topSection || isTopSectionCollapsed) return;
            topSection.style.maxHeight = "none";
            topSection.style.overflow = "visible";
        };

        const syncTopSectionHeight = () => {
            if (!topSection || isTopSectionCollapsed) return;
            if (topSection.style.maxHeight === "none") return;
            topSection.style.maxHeight = `${topSection.scrollHeight}px`;
        };

        let isTopSectionHoverPreviewing = false;
        let topSectionHoverLeaveTimer = 0;
        const clearTopSectionHoverLeaveTimer = () => {
            if (topSectionHoverLeaveTimer) {
                clearTimeout(topSectionHoverLeaveTimer);
                topSectionHoverLeaveTimer = 0;
            }
        };
        const scheduleTopSectionHoverLeave = () => {
            clearTopSectionHoverLeaveTimer();
            topSectionHoverLeaveTimer = window.setTimeout(() => {
                topSectionHoverLeaveTimer = 0;
                if (!isTopSectionCollapsed || !isTopSectionHoverPreviewing) return;
                stopTopSectionHoverPreview();
            }, 50);
        };

        const startTopSectionHoverPreview = () => {
            if (!topSection || !isTopSectionCollapsed) return;
            if (isTopSectionHoverPreviewing) return;
            clearTopSectionHoverLeaveTimer();
            isTopSectionHoverPreviewing = true;
            if (!isBasicAnimEnabled()) {
                topSection.style.overflow = "visible";
                topSection.classList.remove("coolauxv-top-collapsed");
                topSection.style.maxHeight = "none";
                return;
            }
            topSection.style.overflow = "hidden";
            topSection.classList.remove("coolauxv-top-collapsed");
            topSection.style.maxHeight = "0px";
            requestAnimationFrame(() => {
                if (!isTopSectionHoverPreviewing || !isTopSectionCollapsed) return;
                topSection.style.maxHeight = `${topSection.scrollHeight}px`;
                let expandTimeoutId = 0;
                const onExpandEnd = (e) => {
                    if (e.propertyName !== "max-height") return;
                    cleanupExpand();
                    if (isTopSectionHoverPreviewing && isTopSectionCollapsed) {
                        topSection.style.maxHeight = "none";
                        topSection.style.overflow = "visible";
                    }
                };
                const cleanupExpand = () => {
                    if (expandTimeoutId) {
                        clearTimeout(expandTimeoutId);
                        expandTimeoutId = 0;
                    }
                    topSection.removeEventListener("transitionend", onExpandEnd);
                };
                topSection.addEventListener("transitionend", onExpandEnd);
                expandTimeoutId = window.setTimeout(() => {
                    cleanupExpand();
                    if (isTopSectionHoverPreviewing && isTopSectionCollapsed) {
                        topSection.style.maxHeight = "none";
                        topSection.style.overflow = "visible";
                    }
                }, 320);
            });
        };

        const stopTopSectionHoverPreview = () => {
            if (!topSection || !isTopSectionHoverPreviewing) return;
            clearTopSectionHoverLeaveTimer();
            isTopSectionHoverPreviewing = false;
            topSection.style.overflow = "hidden";
            if (topSection.style.maxHeight === "none") {
                topSection.style.maxHeight = `${topSection.scrollHeight}px`;
            }
            void topSection.offsetHeight;
            topSection.classList.add("coolauxv-top-collapsed");
            topSection.style.maxHeight = "0px";
        };

        const stopTopSectionHoverPreviewIfPointerOutside = (clientX, clientY) => {
            if (!topSection || !isTopSectionCollapsed || !isTopSectionHoverPreviewing) return;
            const isInsideRect = (rect) => (
                clientX >= rect.left &&
                clientX <= rect.right &&
                clientY >= rect.top &&
                clientY <= rect.bottom
            );
            const isInsideElement = (el) => !!(el && isInsideRect(el.getBoundingClientRect()));
            const insideTopSection = isInsideElement(topSection);
            const insideHeaderBar = isInsideElement(headerBar);
            if (!insideTopSection && !insideHeaderBar) {
                scheduleTopSectionHoverLeave();
                return;
            }
            clearTopSectionHoverLeaveTimer();
        };

        updateTopSectionCollapseUI = () => {
            if (!topSection || !topSectionToggleBtn) return;
            clearTopSectionHoverLeaveTimer();
            if (isTopSectionHoverPreviewing) {
                isTopSectionHoverPreviewing = false;
            }

            topSectionToggleBtn.textContent = isTopSectionCollapsed ? "展开" : "收起";
            if (!isBasicAnimEnabled()) {
                topSection.classList.toggle("coolauxv-top-collapsed", isTopSectionCollapsed);
                if (isTopSectionCollapsed) {
                    topSection.style.overflow = "hidden";
                    topSection.style.maxHeight = "0px";
                } else {
                    topSection.style.overflow = "visible";
                    topSection.style.maxHeight = "none";
                }
                return;
            }
            topSection.classList.toggle("coolauxv-top-collapsed", isTopSectionCollapsed);
            if (isTopSectionCollapsed) {
                topSection.style.overflow = "hidden";
                if (topSection.style.maxHeight === "none") {
                    topSection.style.maxHeight = `${topSection.scrollHeight}px`;
                    void topSection.offsetHeight;
                }
                topSection.style.maxHeight = "0px";
            } else {
                const isFlexible = topSection.style.maxHeight === "none";
                if (isFlexible) {
                    topSection.style.overflow = "visible";
                } else {
                    topSection.style.overflow = "hidden";
                    syncTopSectionHeight();
                    let expandTimeoutId = 0;
                    const onExpandEnd = (e) => {
                        if (e.propertyName !== "max-height") return;
                        cleanupExpand();
                        finalizeTopSectionExpand();
                    };
                    const cleanupExpand = () => {
                        if (expandTimeoutId) {
                            clearTimeout(expandTimeoutId);
                            expandTimeoutId = 0;
                        }
                        topSection.removeEventListener("transitionend", onExpandEnd);
                    };
                    topSection.addEventListener("transitionend", onExpandEnd);
                    expandTimeoutId = window.setTimeout(() => {
                        cleanupExpand();
                        finalizeTopSectionExpand();
                    }, 320);
                }
            }
        };

        updateChatCollapseUI = () => {
            if (!chatBody || !chatToggleBtn || !chatBar) return;
            const resultDiv = popup.querySelector("#coolauxv-result");
            const wasNearBottom = resultDiv
                ? (resultDiv.scrollHeight - resultDiv.scrollTop - resultDiv.clientHeight <= 30)
                : false;
            const pinnedScrollTop = resultDiv ? resultDiv.scrollTop : 0;

            chatToggleBtn.textContent = isChatCollapsed ? "展开" : "收起";
            chatBar.classList.toggle("coolauxv-chat-collapsed", isChatCollapsed);
            if (!isBasicAnimEnabled()) {
                if (isChatCollapsed) {
                    chatBody.style.overflow = "hidden";
                    chatBody.style.maxHeight = "0px";
                } else {
                    chatBody.style.overflow = "visible";
                    chatBody.style.maxHeight = "none";
                }
                if (resultDiv && wasNearBottom) {
                    requestAnimationFrame(() => {
                        resultDiv.scrollTop = resultDiv.scrollHeight;
                    });
                } else if (resultDiv) {
                    resultDiv.scrollTop = Math.min(pinnedScrollTop, resultDiv.scrollHeight);
                }
                return;
            }
            if (isChatCollapsed) {
                chatBody.style.overflow = "hidden";
                if (chatBody.style.maxHeight === "none") {
                    chatBody.style.maxHeight = `${chatBody.scrollHeight}px`;
                    void chatBody.offsetHeight;
                }
                chatBody.style.maxHeight = "0px";
            } else {
                const isFlexible = chatBody.style.maxHeight === "none";
                if (isFlexible) {
                    chatBody.style.overflow = "visible";
                } else {
                    chatBody.style.overflow = "hidden";
                    syncChatBodyHeight();
                    let expandTimeoutId = 0;
                    const onExpandEnd = (e) => {
                        if (e.propertyName !== "max-height") return;
                        cleanupExpand();
                        finalizeChatBodyExpand();
                    };
                    const cleanupExpand = () => {
                        if (expandTimeoutId) {
                            clearTimeout(expandTimeoutId);
                            expandTimeoutId = 0;
                        }
                        chatBody.removeEventListener("transitionend", onExpandEnd);
                    };
                    chatBody.addEventListener("transitionend", onExpandEnd);
                    expandTimeoutId = window.setTimeout(() => {
                        cleanupExpand();
                        finalizeChatBodyExpand();
                    }, 320);
                }
            }

            if (resultDiv && wasNearBottom) {
                const scrollIfPinned = () => {
                    if (Math.abs(resultDiv.scrollTop - pinnedScrollTop) > 2) return;
                    resultDiv.scrollTop = resultDiv.scrollHeight;
                };
                let timeoutId = 0;
                const onEnd = (e) => {
                    if (e.propertyName !== "max-height") return;
                    cleanup();
                    scrollIfPinned();
                };
                const cleanup = () => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = 0;
                    }
                    chatBody.removeEventListener("transitionend", onEnd);
                };
                chatBody.addEventListener("transitionend", onEnd);
                timeoutId = window.setTimeout(() => {
                    cleanup();
                    scrollIfPinned();
                }, 320);
            }
            updateResultScrollBottomButton();
        };

        if (chatToggleBtn) {
            chatToggleBtn.onclick = () => {
                isChatCollapsed = !isChatCollapsed;
                updateChatCollapseUI();
            };
        }

        if (topSectionToggleBtn) {
            topSectionToggleBtn.onclick = () => {
                isTopSectionCollapsed = !isTopSectionCollapsed;
                updateTopSectionCollapseUI();
            };
            topSectionToggleBtn.addEventListener("mouseenter", () => {
                if (!isTopSectionCollapsed) return;
                startTopSectionHoverPreview();
            });
            document.addEventListener("mousemove", (e) => {
                stopTopSectionHoverPreviewIfPointerOutside(e.clientX, e.clientY);
            });
            window.addEventListener("mouseout", (e) => {
                if (e.relatedTarget) return;
                if (!isTopSectionCollapsed) return;
                stopTopSectionHoverPreview();
            });
            window.addEventListener("blur", () => {
                if (!isTopSectionCollapsed) return;
                stopTopSectionHoverPreview();
            });
        }

        if (chatInput && chatBody) {
            if (typeof ResizeObserver !== "undefined") {
                const chatInputObserver = new ResizeObserver(() => {
                    syncChatBodyHeight();
                    syncTopSectionHeight();
                });
                chatInputObserver.observe(chatInput);
            } else {
                const onChatInputResize = () => {
                    requestAnimationFrame(() => {
                        syncChatBodyHeight();
                        syncTopSectionHeight();
                    });
                };
                chatInput.addEventListener("input", onChatInputResize);
                chatInput.addEventListener("mouseup", onChatInputResize);
            }
        }

        const loadConfig = () => {
            providerTemplatesCache = null;
            actionTemplatesCache = null;
            renderProviderUI();
            renderActionUI();

            if (inputWidth) inputWidth.value = GM_getValue("coolauxv_win_width", "");
            if (inputHeight) inputHeight.value = GM_getValue("coolauxv_win_height", "");

            const currentLevel = GM_getValue("coolauxv_log_level", DEFAULT_LOG_LEVEL);
            const targetRadio = popup.querySelector(`input[name="coolauxv_log_level_radio"][value="${currentLevel}"]`);
            if (targetRadio) targetRadio.checked = true;
            renderSelectionActionRadioGroup();

            if (inputBlurGlass) {
                inputBlurGlass.checked = GM_getValue("coolauxv_enable_blur_glass", DEFAULT_ENABLE_BLUR_GLASS);
            }
            if (inputPersistentBall) {
                inputPersistentBall.checked = GM_getValue("coolauxv_persistent_ball", false);
            }
            if (inputDraggableBall) {
                inputDraggableBall.checked = GM_getValue("coolauxv_draggable_ball", false);
            }
            if (inputNewScreenshot) {
                let val = GM_getValue("coolauxv_use_new_screenshot", DEFAULT_USE_NEW_SCREENSHOT);
                if (val === true) val = "v2";
                if (val === false) val = "v1";
                inputNewScreenshot.value = val;
            }
            const basicAnimEnabled = GM_getValue("coolauxv_enable_basic_anim", DEFAULT_ENABLE_BASIC_ANIM);
            const minimizeAnimRaw = GM_getValue("coolauxv_enable_minimize_anim", DEFAULT_ENABLE_MINIMIZE_ANIM);
            const minimizeAnimEnabled = basicAnimEnabled ? minimizeAnimRaw : false;
            if (!basicAnimEnabled && minimizeAnimRaw) {
                GM_setValue("coolauxv_enable_minimize_anim", false);
            }
            if (inputBasicAnim) inputBasicAnim.checked = basicAnimEnabled;
            if (inputMinimizeAnim) {
                inputMinimizeAnim.checked = minimizeAnimEnabled;
                inputMinimizeAnim.disabled = false;
            }
            if (inputAnimSpeed) {
                const raw = GM_getValue("coolauxv_anim_speed", DEFAULT_ANIM_SPEED);
                inputAnimSpeed.value = raw ? String(raw) : String(DEFAULT_ANIM_SPEED);
            }
            const continuousChatEnabled = GM_getValue("coolauxv_enable_continuous_chat", DEFAULT_ENABLE_CONTINUOUS_CHAT);
            if (inputContinuousChat) inputContinuousChat.checked = continuousChatEnabled;
            syncContinuousChatPromptSectionVisibility(continuousChatEnabled);
            if (inputPromptContinuousChat) inputPromptContinuousChat.value = GM_getValue("coolauxv_prompt_chat", "");
            if (inputAppendContinuousChat) inputAppendContinuousChat.checked = GM_getValue("coolauxv_append_chat", false);
            if (inputChatHistoryPersist) inputChatHistoryPersist.checked = GM_getValue("coolauxv_chat_history_persist", DEFAULT_CHAT_HISTORY_PERSIST);
            if (inputChatEnterSend) inputChatEnterSend.checked = GM_getValue("coolauxv_chat_enter_send", DEFAULT_CHAT_ENTER_SEND);

            syncAllClearButtons();
        };

        const refreshConfigUI = () => {
            loadConfig();
            if (inputBlurGlass) {
                const enabled = GM_getValue("coolauxv_enable_blur_glass", DEFAULT_ENABLE_BLUR_GLASS);
                inputBlurGlass.checked = enabled;
                toggleBlurGlass(enabled);
            }
            if (inputPersistentBall) inputPersistentBall.checked = GM_getValue("coolauxv_persistent_ball", false);
            if (inputDraggableBall) inputDraggableBall.checked = GM_getValue("coolauxv_draggable_ball", false);
            if (inputNewScreenshot) {
                let val = GM_getValue("coolauxv_use_new_screenshot", DEFAULT_USE_NEW_SCREENSHOT);
                if (val === true) val = "v2";
                if (val === false) val = "v1";
                inputNewScreenshot.value = val;
            }
            const basicAnimEnabled = GM_getValue("coolauxv_enable_basic_anim", DEFAULT_ENABLE_BASIC_ANIM);
            const minimizeAnimRaw = GM_getValue("coolauxv_enable_minimize_anim", DEFAULT_ENABLE_MINIMIZE_ANIM);
            const minimizeAnimEnabled = basicAnimEnabled ? minimizeAnimRaw : false;
            if (!basicAnimEnabled && minimizeAnimRaw) {
                GM_setValue("coolauxv_enable_minimize_anim", false);
            }
            if (inputBasicAnim) {
                inputBasicAnim.checked = basicAnimEnabled;
                applyBasicAnimSetting(basicAnimEnabled);
            }
            if (inputMinimizeAnim) {
                inputMinimizeAnim.checked = minimizeAnimEnabled;
                inputMinimizeAnim.disabled = false;
            }
            if (inputAnimSpeed) {
                const raw = GM_getValue("coolauxv_anim_speed", DEFAULT_ANIM_SPEED);
                inputAnimSpeed.value = raw ? String(raw) : String(DEFAULT_ANIM_SPEED);
            }
            if (inputContinuousChat) {
                const enabled = GM_getValue("coolauxv_enable_continuous_chat", DEFAULT_ENABLE_CONTINUOUS_CHAT);
                inputContinuousChat.checked = enabled;
                toggleContinuousChat();
            }
            if (inputChatHistoryPersist) {
                const persistEnabled = GM_getValue("coolauxv_chat_history_persist", DEFAULT_CHAT_HISTORY_PERSIST);
                inputChatHistoryPersist.checked = persistEnabled;
            }
            if (inputChatEnterSend) {
                inputChatEnterSend.checked = GM_getValue("coolauxv_chat_enter_send", DEFAULT_CHAT_ENTER_SEND);
            }
            renderSelectionActionRadioGroup();
            renderMainActionButtons();
        };

        const buildExportSnapshot = (includePrivacy, includeChatRecords) => {
            const snapshot = snapshotConfig();
            if (includeChatRecords) {
                const queueSnapshot = mergeChatQueueLists(
                    normalizeChatQueueList(chatBackgroundQueue),
                    loadPersistentChatQueue()
                ).slice(0, CHAT_QUEUE_MAX_SIZE);
                if (queueSnapshot.length) {
                    snapshot[CHAT_QUEUE_STORAGE_KEY] = queueSnapshot;
                } else {
                    delete snapshot[CHAT_QUEUE_STORAGE_KEY];
                }
            } else {
                delete snapshot[CHAT_QUEUE_STORAGE_KEY];
            }
            const rawTemplates = snapshot[PROVIDER_TEMPLATE_STORAGE_KEY];
            const rawActionTemplates = snapshot[ACTION_TEMPLATE_STORAGE_KEY];
            if (Array.isArray(rawActionTemplates) && rawActionTemplates.every((item) => typeof item === "string")) {
                const cleaned = rawActionTemplates.map((item) => String(item || "").trim()).filter(Boolean);
                if (cleaned.length) snapshot[ACTION_TEMPLATE_STORAGE_KEY] = cleaned;
                else delete snapshot[ACTION_TEMPLATE_STORAGE_KEY];
            } else if (rawActionTemplates !== undefined) {
                const parsedActions = deserializeActionTemplateList(rawActionTemplates).templates;
                if (parsedActions.length) {
                    snapshot[ACTION_TEMPLATE_STORAGE_KEY] = serializeActionTemplateList(parsedActions);
                } else {
                    delete snapshot[ACTION_TEMPLATE_STORAGE_KEY];
                }
            }
            if (!Array.isArray(rawTemplates)) return snapshot;
            const secrets = loadProviderSecretStore();
            const templates = normalizeProviderTemplates(rawTemplates);
            snapshot[PROVIDER_TEMPLATE_STORAGE_KEY] = templates.map((tpl) => {
                const clone = cloneDeep(tpl);
                if (!includePrivacy) {
                    clone.apiKey = "";
                }
                const meta = getCustomFieldMetaMap(clone);
                const keys = Object.keys(clone.customFields || {});
                keys.forEach((key) => {
                    if (meta[key] && meta[key].masked) {
                        if (includePrivacy) {
                            const secretVal = secrets[clone.id] && secrets[clone.id][key];
                            const fallbackVal = clone.customFields[key];
                            clone.customFields[key] = secretVal !== undefined && secretVal !== null
                                ? String(secretVal)
                                : (fallbackVal !== undefined && fallbackVal !== null ? String(fallbackVal) : "");
                        } else {
                            clone.customFields[key] = "";
                        }
                    }
                });
                return clone;
            });
            return snapshot;
        };

        const openConfigExportOptionsModal = (onSubmit) => {
            const existingOverlay = document.getElementById("coolauxv-config-export-modal-overlay");
            if (existingOverlay && existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay);
            }

            const overlay = document.createElement("div");
            overlay.id = "coolauxv-config-export-modal-overlay";
            Object.assign(overlay.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                background: "rgba(0, 0, 0, 0.5)",
                zIndex: "2147483661",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backdropFilter: "blur(4px)",
                opacity: "0",
                transition: "opacity 0.2s"
            });

            const box = document.createElement("div");
            Object.assign(box.style, {
                background: "#fff",
                width: "480px",
                maxWidth: "92%",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                padding: "18px",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                transform: "scale(0.96)",
                transition: "transform 0.2s",
                overflow: "hidden"
            });

            box.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
                    <div style="font-size:18px; font-weight:800; color:#a516e8;">⬇️ 导出配置</div>
                    <button type="button" id="coolauxv-config-export-modal-close" class="coolauxv-ctrl-btn" title="关闭">×</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px; flex:1;">
                    <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; color:#333;">
                        <input type="checkbox" id="coolauxv-config-export-include-privacy" checked style="margin-top:2px;">
                        <span>敏感信息（API Key、打码字段等）</span>
                    </label>
                    <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; color:#333;">
                        <input type="checkbox" id="coolauxv-config-export-include-chat-records" style="margin-top:2px;">
                        <span>所有聊天记录（后台已保存会话）</span>
                    </label>
                    <div style="font-size:11px; color:#888; line-height:1.5;">
                        未勾选敏感信息时，会自动清空 Key 等隐私字段。
                    </div>
                </div>
                <div style="display:flex; gap:10px; margin-top:12px;">
                    <button type="button" id="coolauxv-config-export-cancel" class="coolauxv-action-btn" style="flex:1;">取消</button>
                    <button type="button" id="coolauxv-config-export-submit" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">导出</button>
                </div>
            `;

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => {
                overlay.style.opacity = "1";
                box.style.transform = "scale(1)";
            });

            const closeModal = () => {
                document.removeEventListener("keydown", onEsc);
                overlay.style.opacity = "0";
                box.style.transform = "scale(0.96)";
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 200);
            };

            const onEsc = (e) => {
                if (e.key === "Escape") closeModal();
            };
            document.addEventListener("keydown", onEsc);

            const privacyCheckbox = box.querySelector("#coolauxv-config-export-include-privacy");
            const chatRecordsCheckbox = box.querySelector("#coolauxv-config-export-include-chat-records");
            const submitBtn = box.querySelector("#coolauxv-config-export-submit");
            const closeBtn = box.querySelector("#coolauxv-config-export-modal-close");
            const cancelBtn = box.querySelector("#coolauxv-config-export-cancel");

            if (submitBtn) {
                submitBtn.addEventListener("click", () => {
                    const includePrivacy = !!(privacyCheckbox && privacyCheckbox.checked);
                    const includeChatRecords = !!(chatRecordsCheckbox && chatRecordsCheckbox.checked);
                    closeModal();
                    if (typeof onSubmit === "function") {
                        onSubmit({ includePrivacy: includePrivacy, includeChatRecords: includeChatRecords });
                    }
                });
            }
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeModal();
            });
        };

        const openConfigExportPayloadModal = (payload) => {
            const existingOverlay = document.getElementById("coolauxv-config-export-payload-modal-overlay");
            if (existingOverlay && existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay);
            }

            const overlay = document.createElement("div");
            overlay.id = "coolauxv-config-export-payload-modal-overlay";
            Object.assign(overlay.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                background: "rgba(0, 0, 0, 0.5)",
                zIndex: "2147483661",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backdropFilter: "blur(4px)",
                opacity: "0",
                transition: "opacity 0.2s"
            });

            const box = document.createElement("div");
            Object.assign(box.style, {
                background: "#fff",
                width: "560px",
                maxWidth: "92%",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                padding: "18px",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                transform: "scale(0.96)",
                transition: "transform 0.2s",
                overflow: "hidden"
            });

            box.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
                    <div style="font-size:18px; font-weight:800; color:#a516e8;">📋 手动复制配置</div>
                    <button type="button" id="coolauxv-config-export-payload-close" class="coolauxv-ctrl-btn" title="关闭">×</button>
                </div>
                <div style="font-size:12px; color:#666; margin-bottom:8px;">剪贴板写入失败，请手动复制以下 Base64 文本。</div>
                <textarea id="coolauxv-config-export-payload-input" class="coolauxv-setting-input coolauxv-resizable-input" rows="6" readonly></textarea>
                <div style="display:flex; gap:10px; margin-top:12px;">
                    <button type="button" id="coolauxv-config-export-payload-copy" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">复制</button>
                    <button type="button" id="coolauxv-config-export-payload-ok" class="coolauxv-action-btn" style="flex:1;">关闭</button>
                </div>
            `;

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => {
                overlay.style.opacity = "1";
                box.style.transform = "scale(1)";
            });

            const closeModal = () => {
                document.removeEventListener("keydown", onEsc);
                overlay.style.opacity = "0";
                box.style.transform = "scale(0.96)";
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 200);
            };
            const onEsc = (e) => {
                if (e.key === "Escape") closeModal();
            };
            document.addEventListener("keydown", onEsc);

            const inputEl = box.querySelector("#coolauxv-config-export-payload-input");
            const copyBtn = box.querySelector("#coolauxv-config-export-payload-copy");
            const closeBtn = box.querySelector("#coolauxv-config-export-payload-close");
            const okBtn = box.querySelector("#coolauxv-config-export-payload-ok");

            if (inputEl) {
                inputEl.value = payload;
                setTimeout(() => {
                    inputEl.focus();
                    inputEl.select();
                }, 0);
            }
            if (copyBtn) {
                copyBtn.addEventListener("click", () => {
                    if (typeof GM_setClipboard !== "undefined") {
                        GM_setClipboard(payload, "text");
                        showModal("导出成功", "配置已导出并复制到剪贴板。");
                        closeModal();
                        return;
                    }
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(payload)
                            .then(() => {
                                showModal("导出成功", "配置已导出并复制到剪贴板。");
                                closeModal();
                            })
                            .catch(() => {
                                if (inputEl) {
                                    inputEl.focus();
                                    inputEl.select();
                                }
                            });
                        return;
                    }
                    if (inputEl) {
                        inputEl.focus();
                        inputEl.select();
                    }
                });
            }
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            if (okBtn) okBtn.addEventListener("click", closeModal);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeModal();
            });
        };

        const exportConfig = () => {
            openConfigExportOptionsModal(({ includePrivacy, includeChatRecords }) => {
                const snapshot = buildExportSnapshot(includePrivacy, includeChatRecords);
                if (Array.isArray(snapshot[PROVIDER_TEMPLATE_STORAGE_KEY])) {
                    snapshot[PROVIDER_TEMPLATE_STORAGE_KEY] = snapshot[PROVIDER_TEMPLATE_STORAGE_KEY]
                        .map((tpl) => compactProviderTemplate(tpl));
                }
                if (Array.isArray(snapshot[ACTION_TEMPLATE_STORAGE_KEY])) {
                    const cleaned = snapshot[ACTION_TEMPLATE_STORAGE_KEY].map((item) => String(item || "").trim()).filter(Boolean);
                    if (cleaned.length) snapshot[ACTION_TEMPLATE_STORAGE_KEY] = cleaned;
                    else delete snapshot[ACTION_TEMPLATE_STORAGE_KEY];
                }
                const compacted = pruneEmptyValues(compactConfigSnapshot(snapshot));
                const payload = encodeBase64(JSON.stringify(compacted));
                if (!payload) {
                    showModal("导出失败", "导出失败，请稍后重试。");
                    return;
                }
                if (typeof GM_setClipboard !== "undefined") {
                    GM_setClipboard(payload, "text");
                    showModal("导出成功", "配置已导出并复制到剪贴板。");
                    return;
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(payload)
                        .then(() => showModal("导出成功", "配置已导出并复制到剪贴板。"))
                        .catch(() => {
                            openConfigExportPayloadModal(payload);
                        });
                    return;
                }
                openConfigExportPayloadModal(payload);
            });
        };

        const openConfigImportModal = (onSubmit) => {
            const existingOverlay = document.getElementById("coolauxv-config-import-modal-overlay");
            if (existingOverlay && existingOverlay.parentNode) {
                existingOverlay.parentNode.removeChild(existingOverlay);
            }

            const overlay = document.createElement("div");
            overlay.id = "coolauxv-config-import-modal-overlay";
            Object.assign(overlay.style, {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                background: "rgba(0, 0, 0, 0.5)",
                zIndex: "2147483661",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backdropFilter: "blur(4px)",
                opacity: "0",
                transition: "opacity 0.2s"
            });

            const box = document.createElement("div");
            Object.assign(box.style, {
                background: "#fff",
                width: "540px",
                maxWidth: "92%",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                padding: "18px",
                borderRadius: "12px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                transform: "scale(0.96)",
                transition: "transform 0.2s",
                overflow: "hidden"
            });

            box.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
                    <div style="font-size:18px; font-weight:800; color:#a516e8;">⬆️ 恢复配置</div>
                    <button type="button" id="coolauxv-config-import-modal-close" class="coolauxv-ctrl-btn" title="关闭">×</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; flex:1;">
                    <div class="coolauxv-sub-label">请粘贴配置 Base64 文本</div>
                    <textarea id="coolauxv-config-import-input" class="coolauxv-setting-input coolauxv-resizable-input" rows="5" placeholder="粘贴导出的 Base64..."></textarea>
                    <div style="font-size:11px; color:#888;">支持完整配置导出文本。</div>
                </div>
                <div style="display:flex; gap:10px; margin-top:12px;">
                    <button type="button" id="coolauxv-config-import-cancel" class="coolauxv-action-btn" style="flex:1;">取消</button>
                    <button type="button" id="coolauxv-config-import-submit" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">恢复</button>
                </div>
            `;

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => {
                overlay.style.opacity = "1";
                box.style.transform = "scale(1)";
            });

            const closeModal = () => {
                document.removeEventListener("keydown", onEsc);
                overlay.style.opacity = "0";
                box.style.transform = "scale(0.96)";
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 200);
            };

            const onEsc = (e) => {
                if (e.key === "Escape") closeModal();
            };
            document.addEventListener("keydown", onEsc);

            const inputEl = box.querySelector("#coolauxv-config-import-input");
            const submitBtn = box.querySelector("#coolauxv-config-import-submit");
            const closeBtn = box.querySelector("#coolauxv-config-import-modal-close");
            const cancelBtn = box.querySelector("#coolauxv-config-import-cancel");
            if (inputEl) setTimeout(() => inputEl.focus(), 0);

            if (submitBtn) {
                submitBtn.addEventListener("click", () => {
                    const text = inputEl ? String(inputEl.value || "").trim() : "";
                    closeModal();
                    if (text && typeof onSubmit === "function") onSubmit(text);
                });
            }
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeModal();
            });
        };

        const importConfig = () => {
            openConfigImportModal((input) => {
                let parsed = null;
                try {
                    const decoded = decodeBase64(input);
                    parsed = JSON.parse(decoded);
                } catch (e) {
                    alert("配置格式无效，请确认 Base64 内容正确。");
                    return;
                }
                if (!parsed || typeof parsed !== "object") {
                    alert("配置内容无效，请确认 Base64 内容正确。");
                    return;
                }
                const cleaned = pruneEmptyValues(parsed);
                applyConfigSnapshot(cleaned);
                refreshConfigUI();
                alert("配置已恢复。");
            });
        };

        if (exportBtn) exportBtn.onclick = exportConfig;
        if (importBtn) importBtn.onclick = importConfig;

        if (resetBtn) resetBtn.onclick = () => {
            if (confirm("确定要重置所有配置吗？\n所有自定义设置将恢复为默认值。")) {
                clearAllStoredKeys();
                GM_deleteValue("coolauxv_installed_version"); // 重置更新状态
                saveProviderTemplates(getDefaultProviderTemplates());
                saveActionTemplates(getDefaultActionTemplates());
                refreshConfigUI();
                alert("配置已重置。");
            }
        };

        if (inputWidth) inputWidth.addEventListener("input", (e) => saveConfig("coolauxv_win_width", e.target.value));
        if (inputHeight) inputHeight.addEventListener("input", (e) => saveConfig("coolauxv_win_height", e.target.value));
        if (inputContinuousChat) {
            inputContinuousChat.addEventListener("change", (e) => {
                const enabled = e.target.checked;
                GM_setValue("coolauxv_enable_continuous_chat", enabled);
                toggleContinuousChat();
            });
        }
        if (inputPromptContinuousChat) {
            inputPromptContinuousChat.addEventListener("input", (e) => {
                saveConfig("coolauxv_prompt_chat", e.target.value);
            });
        }
        if (inputAppendContinuousChat) {
            inputAppendContinuousChat.addEventListener("change", (e) => {
                GM_setValue("coolauxv_append_chat", !!e.target.checked);
            });
        }
        if (inputChatHistoryPersist) {
            inputChatHistoryPersist.addEventListener("change", (e) => {
                const enabled = e.target.checked;
                GM_setValue("coolauxv_chat_history_persist", enabled);
                updateProviderFeatureVisibility();
            });
        }
        if (btnClearChatPersist) {
            btnClearChatPersist.addEventListener("click", () => {
                if (!confirm("确定要清空所有持久化聊天记录吗？")) return;
                if (!confirm("该操作不可恢复。是否继续？")) return;
                GM_deleteValue(CHAT_QUEUE_STORAGE_KEY);
                chatBackgroundQueue = [];
                chatQueuePersistBootstrapped = true;
                alert("已清空持久化聊天记录。");
            });
        }
        if (btnManageChatPersist) {
            btnManageChatPersist.addEventListener("click", () => {
                openChatHistoryManager();
            });
        }
        if (inputChatEnterSend) {
            inputChatEnterSend.addEventListener("change", (e) => {
                const enabled = e.target.checked;
                GM_setValue("coolauxv_chat_enter_send", enabled);
                if (enabled) {
                    showModal("输入体验已变更", "已开启“回车键发送消息”：\nEnter 发送消息，Shift+Enter 换行。\n\n触屏用户注意：没外接键盘会导致无法正常换行。");
                }
            });
        }
        if (inputBasicAnim) {
            inputBasicAnim.addEventListener("change", (e) => {
                const enabled = e.target.checked;
                GM_setValue("coolauxv_enable_basic_anim", enabled);
                if (!enabled) {
                    GM_setValue("coolauxv_enable_minimize_anim", false);
                    if (inputMinimizeAnim) inputMinimizeAnim.checked = false;
                }
                applyBasicAnimSetting(enabled);
            });
        }
        if (inputMinimizeAnim) {
            inputMinimizeAnim.addEventListener("change", (e) => {
                const enabled = e.target.checked;
                GM_setValue("coolauxv_enable_minimize_anim", enabled);
                if (enabled && inputBasicAnim && !inputBasicAnim.checked) {
                    inputBasicAnim.checked = true;
                    GM_setValue("coolauxv_enable_basic_anim", true);
                    applyBasicAnimSetting(true);
                }
            });
        }
        if (inputAnimSpeed) {
            inputAnimSpeed.addEventListener("change", () => {
                const val = Number.parseFloat(inputAnimSpeed.value);
                if (!Number.isFinite(val) || val <= 0) {
                    inputAnimSpeed.value = String(DEFAULT_ANIM_SPEED);
                    GM_deleteValue("coolauxv_anim_speed");
                    return;
                }
                const clamped = Math.max(0.3, Math.min(3, val));
                inputAnimSpeed.value = String(clamped);
                if (clamped === DEFAULT_ANIM_SPEED) {
                    GM_deleteValue("coolauxv_anim_speed");
                } else {
                    GM_setValue("coolauxv_anim_speed", clamped);
                }
            });
        }

        const toggleBlurGlass = (enabled) => {
            // 主窗口
            if (enabled) popup.classList.add("coolauxv-blur-glass-enabled");
            else popup.classList.remove("coolauxv-blur-glass-enabled");

            // Loading 提示
            const toast = document.getElementById("coolauxv-loading-toast");
            if (toast) {
                if (enabled) toast.classList.add("coolauxv-blur-glass-style");
                else toast.classList.remove("coolauxv-blur-glass-style");
            }

            // 模型选择按钮
            const modelBtns = popup.querySelectorAll(".coolauxv-model-btn");
            modelBtns.forEach(btn => {
                if (enabled) btn.classList.add("coolauxv-blur-glass-style-btn");
                else btn.classList.remove("coolauxv-blur-glass-style-btn");
            });
        };

        // 功能1：打开网络链接
        if (btnPdfLink && inputPdfUrl) {
            btnPdfLink.onclick = () => {
                const url = inputPdfUrl.value.trim();
                if (!url) return alert("请先输入链接");
                window.open(`https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(url)}`, '_blank');
            };
        }

        // 功能2：在线加载本地文件 (跨窗口通信版)
        // 修正后的“在线加载本地文件”逻辑 (极速发送端)
        if (btnPdfLocalOnline && inputPdfFile) {
            btnPdfLocalOnline.onclick = () => inputPdfFile.click();

            inputPdfFile.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                inputPdfFile.value = '';

                const originalBtnText = "🚀 在线加载本地文件";
                let buffer = null;
                let isViewerReady = false;
                let isSent = false;
                let readyTimeoutId = null;

                const viewerWin = window.open("https://mozilla.github.io/pdf.js/web/viewer.html?file=", "_blank");
                if (!viewerWin) {
                    alert("请允许弹窗");
                    btnPdfLocalOnline.innerText = originalBtnText;
                    return;
                }

                const cleanup = () => {
                    window.removeEventListener("message", msgHandler);
                    if (readyTimeoutId) {
                        clearTimeout(readyTimeoutId);
                        readyTimeoutId = null;
                    }
                };

                const trySend = () => {
                    if (isSent || !buffer || !isViewerReady) return;
                    isSent = true;
                    btnPdfLocalOnline.innerText = "⚡ 数据发送中...";
                    viewerWin.postMessage({ type: "OPEN_PDF_BLOB", buffer: buffer }, "*", [buffer]);
                    btnPdfLocalOnline.innerText = "⚡ 数据已发送";
                };

                const startReadyTimeout = () => {
                    if (readyTimeoutId) return;
                    readyTimeoutId = setTimeout(() => {
                        if (!isSent) {
                            cleanup();
                            btnPdfLocalOnline.innerText = "❌ 连接超时";
                            setTimeout(() => btnPdfLocalOnline.innerText = originalBtnText, 2000);
                        }
                    }, 8000);
                };

                const msgHandler = (event) => {
                    if (event.source !== viewerWin) return;
                    if (event.data && event.data.type === "PDF_I_AM_READY") {
                        isViewerReady = true;
                        if (readyTimeoutId) {
                            clearTimeout(readyTimeoutId);
                            readyTimeoutId = null;
                        }
                        trySend();
                    }
                    if (event.data && event.data.type === "PDF_OPENED_ACK") {
                        cleanup();
                        btnPdfLocalOnline.innerText = "✅ 完成";
                        setTimeout(() => btnPdfLocalOnline.innerText = originalBtnText, 2000);
                    }
                };

                window.addEventListener("message", msgHandler);

                const reader = new FileReader();
                btnPdfLocalOnline.innerText = "读取文件中...";
                reader.onload = (evt) => {
                    buffer = evt.target.result;
                    if (!isViewerReady) {
                        btnPdfLocalOnline.innerText = "等待新窗口...";
                        startReadyTimeout();
                    }
                    trySend();
                };
                reader.onerror = () => {
                    cleanup();
                    btnPdfLocalOnline.innerText = "❌ 读取失败";
                    setTimeout(() => btnPdfLocalOnline.innerText = originalBtnText, 2000);
                };
                reader.readAsArrayBuffer(file);
            };
        }



        // 流体玻璃
        if (inputBlurGlass) {
            inputBlurGlass.addEventListener("change", (e) => {
                const enabled = e.target.checked;
                GM_setValue("coolauxv_enable_blur_glass", enabled); // 保存到全局变量
                if (enabled) {
                    showModal(
                        "⚠️ 兼容性警告",
                        "⚠️ 如遇性能或兼容性问题请关闭此选项。"
                    );
                }
                toggleBlurGlass(enabled); // 实时应用效果
            });
        }

        // 常驻悬浮球
        if (inputPersistentBall) {
            inputPersistentBall.addEventListener("change", (e) => {
                const enabled = e.target.checked;
                GM_setValue("coolauxv_persistent_ball", enabled);

                // 实时生效逻辑：
                // 如果开启常驻，且主窗口是关闭状态，则立即显示悬浮球
                // 如果关闭常驻，且主窗口是关闭状态，则立即隐藏悬浮球
                // (注：如果主窗口是打开状态，悬浮球本就应该隐藏，不受此影响，等窗口关闭时再判断)
                if (popup.style.display !== "flex") {
                    floatBall.style.display = enabled ? "block" : "none";
                }
            });
        }

        // 可拖动悬浮球
        if (inputDraggableBall) {
            inputDraggableBall.addEventListener("change", (e) => {
                const enabled = e.target.checked;
                GM_setValue("coolauxv_draggable_ball", enabled);
                // 实时更新 initUI 作用域中的变量
                // 注意：由于 isBallDraggable 是在 initUI 中定义的局部变量，
                // 这里的修改无法直接生效，除非我们将变量提升，或者用一种简单的 hack：
                // 更好的方式是：在 onBallDown 函数里直接读 Checkbox 的状态或 GM_getValue
            });
        }

        // 实验性截屏算法
        if (inputNewScreenshot) {
            inputNewScreenshot.addEventListener("change", (e) => {
                const val = e.target.value;
                GM_setValue("coolauxv_use_new_screenshot", val);
                if (val === "v2") {
                    showModal("⚠️ 实验性功能警告", "在装有 Canvas Blocker 类插件的浏览器或 Brave 等带指纹屏蔽功能的浏览器上，旧截屏算法可能存在错位问题。此选项旨在尝试解决此类错误，但可能存在性能和兼容性问题（网页无响应、获取到的界面全是条纹等），如遇兼容性问题请授权访问 Canvas 信息，或关闭对应浏览器插件。");
                }
                if (val === "v3") {
                    showModal("⚠️ 实验性功能警告", "⚠️ Android没法用这个功能属正常情况，用不了别报bug。⚠️\n\nv3 模式调用浏览器【屏幕共享】接口。点击识屏后，请在浏览器弹窗中选择【当前标签页】或【整个屏幕】。\n\n优点：所见即所得，完美还原渲染。\n缺点：每次都需要手动点击授权。");
                }
            });
        }

        toggleBlurGlass(GM_getValue("coolauxv_enable_blur_glass", DEFAULT_ENABLE_BLUR_GLASS));
        toggleContinuousChat();
        updateChatCollapseUI();
        updateTopSectionCollapseUI();
    }

    const getProviderTemplateSafe = (providerId) => {
        const templates = getProviderTemplates();
        const resolvedId = resolveProviderId(providerId, templates);
        return templates.find((tpl) => tpl.id === resolvedId) || templates[0] || null;
    };

    const getProviderLabel = (providerId) => {
        const tpl = getProviderTemplateSafe(providerId);
        if (!tpl) return providerId;
        const context = buildTemplateContext(tpl, { apiKey: tpl.apiKey || "" });
        const resolved = applyTemplateString(tpl.label || tpl.id || "", context).trim();
        return resolved || tpl.label || providerId;
    };

    const getProviderKeyLink = (providerId) => {
        const tpl = getProviderTemplateSafe(providerId);
        if (!tpl || !tpl.keyLink) return "";
        const context = buildTemplateContext(tpl, { apiKey: tpl.apiKey || "" });
        return applyTemplateString(tpl.keyLink, context).trim();
    };

    const isProviderSupportsVision = (providerId) => {
        const tpl = getProviderTemplateSafe(providerId);
        return !!(tpl && tpl.supportsVision);
    };

    const isProviderSupportsContinuousChat = (providerId) => {
        const tpl = getProviderTemplateSafe(providerId);
        return tpl ? tpl.supportsContinuousChat !== false : true;
    };

    const isContinuousChatEnabled = (providerId) => {
        const enabled = GM_getValue("coolauxv_enable_continuous_chat", DEFAULT_ENABLE_CONTINUOUS_CHAT);
        if (!enabled) return false;
        const resolvedId = resolveProviderId(providerId || GM_getValue("coolauxv_default_provider", DEFAULT_PROVIDER), getProviderTemplates());
        return isProviderSupportsContinuousChat(resolvedId);
    };

    function updateProviderFeatureVisibility() {
        if (!popup) return;
        const providerId = resolveProviderId(GM_getValue("coolauxv_default_provider", DEFAULT_PROVIDER), getProviderTemplates());
        const supportsVision = isProviderSupportsVision(providerId);
        const supportsContinuousChat = isProviderSupportsContinuousChat(providerId);

        const btnShotMain = popup.querySelector("#coolauxv-btn-screenshot");
        const btnShotChat = popup.querySelector("#coolauxv-btn-screenshot-chat");
        const btnMainImageFile = popup.querySelector("#coolauxv-btn-image-file");
        const btnMainClear = popup.querySelector("#coolauxv-btn-clear-shot");
        const btnChatImageFile = popup.querySelector("#coolauxv-btn-chat-image-file");
        const btnPreview = popup.querySelector("#coolauxv-btn-preview");
        const btnChatPreview = popup.querySelector("#coolauxv-btn-preview-chat");
        const btnChatClear = popup.querySelector("#coolauxv-btn-clear-chat-shot");

        const setDisplay = (el, show, defaultDisplay) => {
            if (!el) return;
            el.style.display = show ? (defaultDisplay || "") : "none";
        };

        setDisplay(btnShotMain, supportsVision);
        setDisplay(btnShotChat, supportsVision);
        setDisplay(btnMainImageFile, supportsVision);
        setDisplay(btnChatImageFile, supportsVision);

        if (!supportsVision) {
            capturedImageBase64 = "";
            chatCapturedImageBase64 = "";
            setAnimatedVisibility(btnPreview, false);
            setAnimatedVisibility(btnMainClear, false);
            setAnimatedVisibility(btnChatPreview, false);
            setAnimatedVisibility(btnChatClear, false);
        } else {
            setAnimatedVisibility(btnPreview, !!capturedImageBase64);
            setAnimatedVisibility(btnMainClear, !!capturedImageBase64);
            setAnimatedVisibility(btnChatPreview, !!chatCapturedImageBase64);
            setAnimatedVisibility(btnChatClear, !!chatCapturedImageBase64);
        }

        const chatBar = popup.querySelector("#coolauxv-chat-bar");
        const btnChatHistory = popup.querySelector("#coolauxv-chat-history-btn");
        if (chatBar) {
            const shouldShowChat = GM_getValue("coolauxv_enable_continuous_chat", DEFAULT_ENABLE_CONTINUOUS_CHAT) && supportsContinuousChat;
            const persistEnabled = GM_getValue("coolauxv_chat_history_persist", DEFAULT_CHAT_HISTORY_PERSIST);
            chatBar.style.display = shouldShowChat ? "flex" : "none";
            if (btnChatHistory) {
                btnChatHistory.style.display = shouldShowChat && persistEnabled ? "inline-block" : "none";
            }
            if (!shouldShowChat) {
                isChatCollapsed = true;
            }
            updateChatCollapseUI();
        }
    }

    const readImageFileAsDataUrl = (file) => new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error("empty file"));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(new Error("read image failed"));
        reader.readAsDataURL(file);
    });

    const applyMainImageCapture = (dataUrl) => {
        const imageUrl = String(dataUrl || "").trim();
        if (!imageUrl) return false;
        const providerId = resolveProviderId(GM_getValue("coolauxv_default_provider", DEFAULT_PROVIDER), getProviderTemplates());
        if (!isProviderSupportsVision(providerId)) {
            alert("当前提供商不支持识图，无法插入图片。");
            return false;
        }
        capturedImageBase64 = imageUrl;
        const btnPreview = popup ? popup.querySelector("#coolauxv-btn-preview") : null;
        const btnMainClear = popup ? popup.querySelector("#coolauxv-btn-clear-shot") : null;
        setAnimatedVisibility(btnPreview, true);
        setAnimatedVisibility(btnMainClear, true);
        const input = popup ? popup.querySelector("#coolauxv-input") : null;
        if (input && !input.value.trim()) {
            const config = getActiveConfig();
            input.value = config.promptVision || "";
        }
        return true;
    };

    const loadMainImageFromFile = async (file) => {
        if (!file) return false;
        if (!String(file.type || "").startsWith("image/")) {
            alert("仅支持图片文件。");
            return false;
        }
        try {
            const dataUrl = await readImageFileAsDataUrl(file);
            if (!dataUrl) {
                alert("读取图片失败，请重试。");
                return false;
            }
            return applyMainImageCapture(dataUrl);
        } catch (e) {
            alert("读取图片失败，请重试。");
            return false;
        }
    };

    const applyChatImageCapture = (dataUrl) => {
        const imageUrl = String(dataUrl || "").trim();
        if (!imageUrl) return false;
        const providerId = resolveProviderId(GM_getValue("coolauxv_default_provider", DEFAULT_PROVIDER), getProviderTemplates());
        if (!isProviderSupportsVision(providerId)) {
            alert("当前提供商不支持识图，无法插入图片。");
            return false;
        }
        chatCapturedImageBase64 = imageUrl;
        const btnChatPreview = popup ? popup.querySelector("#coolauxv-btn-preview-chat") : null;
        const btnChatClear = popup ? popup.querySelector("#coolauxv-btn-clear-chat-shot") : null;
        setAnimatedVisibility(btnChatPreview, true);
        setAnimatedVisibility(btnChatClear, true);
        return true;
    };

    const loadChatImageFromFile = async (file) => {
        if (!file) return false;
        if (!String(file.type || "").startsWith("image/")) {
            alert("仅支持图片文件。");
            return false;
        }
        try {
            const dataUrl = await readImageFileAsDataUrl(file);
            if (!dataUrl) {
                alert("读取图片失败，请重试。");
                return false;
            }
            return applyChatImageCapture(dataUrl);
        } catch (e) {
            alert("读取图片失败，请重试。");
            return false;
        }
    };

    const applyTemplateString = (value, context) => {
        return String(value).replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (match, key) => {
            if (!Object.prototype.hasOwnProperty.call(context, key)) return "";
            const replacement = context[key];
            return replacement === undefined || replacement === null ? "" : String(replacement);
        });
    };

    const applyTemplateValue = (value, context) => {
        if (Array.isArray(value)) return value.map((item) => applyTemplateValue(item, context));
        if (value && typeof value === "object") {
            const output = {};
            Object.keys(value).forEach((key) => {
                output[key] = applyTemplateValue(value[key], context);
            });
            return output;
        }
        if (typeof value === "string") {
            const exact = value.match(/^{{\s*([a-zA-Z0-9_.-]+)\s*}}$/);
            if (exact && Object.prototype.hasOwnProperty.call(context, exact[1])) {
                return context[exact[1]];
            }
            return applyTemplateString(value, context);
        }
        return value;
    };

    const buildTemplateContext = (template, extra) => {
        const custom = getTemplateCustomFields(template);
        const roles = template && template.roles ? template.roles : {};
        const stream = template && template.stream ? template.stream : {};
        const defaults = {
            providerId: template && template.id ? String(template.id) : "",
            providerLabel: template && template.label ? String(template.label) : "",
            providerType: normalizeProviderType(template && template.type ? template.type : ""),
            baseUrl: template && template.baseUrl ? String(template.baseUrl) : "",
            apiKey: template && template.apiKey ? String(template.apiKey) : "",
            apiKeyPlaceholder: template && template.apiKeyPlaceholder ? String(template.apiKeyPlaceholder) : "",
            keyLink: template && template.keyLink ? String(template.keyLink) : "",
            keyLinkTitle: template && template.keyLinkTitle ? String(template.keyLinkTitle) : "",
            headersTemplate: template && template.headersTemplate ? template.headersTemplate : {},
            bodyTemplate: template && template.bodyTemplate ? template.bodyTemplate : {},
            modelGroups: template && Array.isArray(template.modelGroups) ? template.modelGroups : [],
            roleSystem: roles.system ? String(roles.system) : "system",
            roleUser: roles.user ? String(roles.user) : "user",
            roleAssistant: roles.assistant ? String(roles.assistant) : "assistant",
            streamParser: stream.parser ? String(stream.parser) : "",
            deltaPath: stream.deltaPath ? String(stream.deltaPath) : "",
            reasoningPath: stream.reasoningPath ? String(stream.reasoningPath) : "",
            sessionIdPath: stream.sessionIdPath ? String(stream.sessionIdPath) : "",
            sessionIdKey: stream.sessionIdKey ? String(stream.sessionIdKey) : DEFAULT_PROVIDER_SESSION_FIELD_KEY,
            reasoningTag: stream.reasoningTag ? String(stream.reasoningTag) : "",
            supportsVision: !!(template && template.supportsVision),
            supportsContinuousChat: template ? template.supportsContinuousChat !== false : true
        };
        return Object.assign({}, defaults, custom, extra || {});
    };

    const extractTemplateKeys = (value) => {
        const set = new Set();
        const str = String(value || "");
        str.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, key) => {
            set.add(key);
            return "";
        });
        return Array.from(set);
    };

    const buildProviderUrl = (template) => {
        if (!template || !template.baseUrl) return "";
        const context = buildTemplateContext(template, { apiKey: template.apiKey || "" });
        return applyTemplateString(template.baseUrl, context);
    };

    const shouldForceGMRequestForUrl = (url) => {
        if (typeof GM_xmlhttpRequest !== "function") return false;
        if (typeof location === "undefined" || location.protocol !== "https:") return false;
        try {
            const parsed = new URL(String(url || ""), location.href);
            return parsed.protocol === "http:";
        } catch (err) {
            return false;
        }
    };

    const buildProviderHeaders = (template, context) => {
        if (!template) return { "Content-Type": "application/json" };
        const headers = applyTemplateValue(template.headersTemplate || {}, buildTemplateContext(template, context || {}));
        const cleaned = {};
        Object.keys(headers || {}).forEach((key) => {
            const value = headers[key];
            if (value === undefined || value === null) return;
            const str = String(value).trim();
            if (!str) return;
            cleaned[key] = str;
        });
        return cleaned;
    };

    const isMissingProviderConfig = (template) => {
        if (!template || !template.baseUrl) return true;
        const context = buildTemplateContext(template, { apiKey: template.apiKey || "" });
        const missingKeys = extractTemplateKeys(template.baseUrl).filter((key) => {
            if (!Object.prototype.hasOwnProperty.call(context, key)) return true;
            return String(context[key] || "").trim() === "";
        });
        if (missingKeys.length) return true;
        return false;
    };

    function getActiveConfig() {
        const templates = getProviderTemplates();
        const actionTemplates = getActionTemplates();
        const translateAction = actionTemplates.find((item) => item.id === "translate");
        const explainAction = actionTemplates.find((item) => item.id === "explain");
        const providerId = resolveProviderId(GM_getValue("coolauxv_default_provider", DEFAULT_PROVIDER), templates);
        const provider = getProviderTemplateSafe(providerId);
        const groups = provider && Array.isArray(provider.modelGroups) ? provider.modelGroups : [];
        const textGroup = groups.find((group) => group.type !== "vision") || groups[0];
        const visionGroup = groups.find((group) => group.type === "vision");
        const resolveGroupModel = (group) => {
            if (!group) return "";
            if (group.selectedModel) return group.selectedModel;
            const first = Array.isArray(group.models) && group.models.length ? group.models[0] : null;
            return first ? (first.id || first.name || "") : "";
        };
        const modelName = resolveGroupModel(textGroup);
        const modelVision = provider && provider.supportsVision
            ? (resolveGroupModel(visionGroup) || modelName)
            : modelName;

        return {
            provider: providerId,
            template: provider,
            apiKey: provider ? provider.apiKey : "",
            modelName: modelName,
            modelVision: modelVision,
            supportsVision: !!(provider && provider.supportsVision),
            supportsContinuousChat: provider ? provider.supportsContinuousChat !== false : true,
            promptTrans: translateAction ? translateAction.systemPrompt : getDefaultActionPromptById("translate"),
            promptExplain: explainAction ? explainAction.systemPrompt : getDefaultActionPromptById("explain"),
            promptVision: buildLegacyPromptWithAppend("coolauxv_prompt_vision", "coolauxv_append_vision", DEFAULT_PROMPT_VISION),
            promptContinuousChat: buildLegacyPromptWithAppend("coolauxv_prompt_chat", "coolauxv_append_chat", DEFAULT_PROMPT_CONTINUOUS_CHAT)
        };
    }

    function buildChatCompletionContent(text, imageBase64) {
        if (imageBase64) {
            return [
                { type: "image_url", image_url: { url: imageBase64 } },
                { type: "text", text: text || "" }
            ];
        }
        return text || "";
    }

    function buildOpenaiResponsesInputContent(text, imageBase64) {
        const content = [];
        if (imageBase64) {
            content.push({ type: "input_image", image_url: imageBase64 });
        }
        if (text) {
            content.push({ type: "input_text", text: text });
        }
        return content;
    }

    function buildOpenaiResponsesAssistantContent(text) {
        if (!text) return [];
        return [{ type: "output_text", text: text }];
    }

    function buildChatPartsContent(text) {
        const parts = [];
        if (text) {
            parts.push({ type: "text", text: text });
        }
        return parts;
    }

    function resolveProviderRoleName(template, roleKey, fallbackRole) {
        const roleContext = buildTemplateContext(template, { apiKey: template && template.apiKey ? template.apiKey : "" });
        const rawRole = template && template.roles && template.roles[roleKey] ? template.roles[roleKey] : fallbackRole;
        return applyTemplateString(rawRole, roleContext).trim() || fallbackRole;
    }

    function buildProviderMessage(template, roleKey, text, imageBase64) {
        if (!template) return null;
        const role = resolveProviderRoleName(template, roleKey, roleKey);
        if (template.type === "openai-responses") {
            const content = roleKey === "assistant"
                ? buildOpenaiResponsesAssistantContent(text)
                : buildOpenaiResponsesInputContent(text, imageBase64);
            if (!content.length) return null;
            return { role: role, content: content };
        }
        if (template.type === "chat-parts") {
            const parts = buildChatPartsContent(text);
            if (!parts.length) return null;
            return { role: role, parts: parts, id: generateMessageId() };
        }
        const content = buildChatCompletionContent(text, imageBase64);
        if (content === "") return null;
        return { role: role, content: content };
    }

    function extractPlainTextFromProviderMessage(message) {
        if (!message || typeof message !== "object") return "";
        if (typeof message.content === "string") return message.content;
        if (Array.isArray(message.content)) {
            let text = "";
            message.content.forEach((part) => {
                if (!part || typeof part !== "object") return;
                if (typeof part.text === "string") {
                    text += part.text;
                }
            });
            if (text) return text;
        }
        if (Array.isArray(message.parts)) {
            let text = "";
            message.parts.forEach((part) => {
                if (!part || typeof part !== "object") return;
                if (typeof part.text === "string") {
                    text += part.text;
                }
            });
            if (text) return text;
        }
        return "";
    }

    function getLatestUserTextFromMessages(template, messages) {
        if (!Array.isArray(messages) || !messages.length) return "";
        const userRole = resolveProviderRoleName(template, "user", "user");
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (!message || typeof message !== "object") continue;
            const role = String(message.role || "").trim();
            if (role !== userRole && role !== "user") continue;
            const text = extractPlainTextFromProviderMessage(message);
            if (text) return text;
        }
        return "";
    }

    function getSystemPromptTextFromMessages(template, messages) {
        if (!Array.isArray(messages) || !messages.length) return "";
        const systemRole = resolveProviderRoleName(template, "system", "system");
        const chunks = [];
        messages.forEach((message) => {
            if (!message || typeof message !== "object") return;
            const role = String(message.role || "").trim();
            if (role !== systemRole && role !== "system") return;
            const text = extractPlainTextFromProviderMessage(message);
            if (text) chunks.push(text);
        });
        return chunks.join("\n\n").trim();
    }

    function formatNoHistoryContent(systemPrompt, userInput) {
        const sys = String(systemPrompt || "").trim();
        const user = String(userInput || "").trim();
        if (sys && user) return `system:${sys}\nuser:${user}`;
        if (sys) return `system:${sys}`;
        if (user) return `user:${user}`;
        return "";
    }

    function buildProviderPayload(template, model, messages) {
        if (!template) return {};
        const normalizedType = normalizeProviderType(template.type);
        const fallback = normalizedType === "openai-responses"
            ? { model: "{{model}}", stream: true, input: "{{messages}}" }
            : (normalizedType === "chat-parts"
                ? { model: "{{model}}", id: "{{requestId}}", messages: "{{messages}}", trigger: "{{trigger}}" }
                : (normalizedType === "chat-no-history"
                    ? { conversationId: "{{conversationId}}", content: "{{latestUserText}}", model: "{{model}}" }
                    : { model: "{{model}}", stream: true, messages: "{{messages}}" }));
        const bodyTemplate = template.bodyTemplate && typeof template.bodyTemplate === "object"
            ? template.bodyTemplate
            : fallback;
        const providerRuntimeFields = getProviderRuntimeFields(template.id);
        const latestUserInputText = getLatestUserTextFromMessages(template, messages);
        const latestSystemPromptText = getSystemPromptTextFromMessages(template, messages);
        const latestUserText = normalizedType === "chat-no-history"
            ? formatNoHistoryContent(latestSystemPromptText, latestUserInputText)
            : latestUserInputText;
        const noHistoryMessages = latestUserInputText
            ? [buildProviderMessage(template, "user", latestUserInputText, "")].filter(Boolean)
            : [];
        const payloadMessages = normalizedType === "chat-no-history" ? noHistoryMessages : messages;
        const payloadInput = normalizedType === "chat-no-history" ? latestUserText : payloadMessages;
        const customFields = getTemplateCustomFields(template);
        const trigger = Object.prototype.hasOwnProperty.call(customFields, "trigger")
            ? customFields.trigger
            : "submit-message";
        return applyTemplateValue(bodyTemplate, buildTemplateContext(template, Object.assign({}, providerRuntimeFields, {
            model: model,
            messages: payloadMessages,
            input: payloadInput,
            stream: true,
            apiKey: template.apiKey || "",
            requestId: generateRequestId(),
            trigger: trigger,
            sessionId: chatSessionId || "",
            latestUserText: latestUserText,
            latestUserInputText: latestUserInputText,
            latestSystemPrompt: latestSystemPromptText,
            latestUserMessage: noHistoryMessages[0] || null,
            latestUserMessages: noHistoryMessages,
            conversationId: providerRuntimeFields[DEFAULT_PROVIDER_SESSION_FIELD_KEY] || "",
            providerRuntimeFields: providerRuntimeFields
        })));
    }

    function resolveTemplateStreamConfig(template) {
        const streamCfg = template && template.stream && typeof template.stream === "object"
            ? template.stream
            : {};
        const context = buildTemplateContext(template, { apiKey: template && template.apiKey ? template.apiKey : "" });
        return {
            parser: String(streamCfg.parser || ""),
            deltaPath: applyTemplateString(String(streamCfg.deltaPath || ""), context).trim(),
            reasoningPath: applyTemplateString(String(streamCfg.reasoningPath || ""), context).trim(),
            sessionIdPath: applyTemplateString(String(streamCfg.sessionIdPath || ""), context).trim(),
            sessionIdKey: applyTemplateString(String(streamCfg.sessionIdKey || DEFAULT_PROVIDER_SESSION_FIELD_KEY), context).trim(),
            reasoningTag: applyTemplateString(String(streamCfg.reasoningTag || ""), context).trim().toLowerCase()
        };
    }

    function flushThinkTagStreamCarry() {
        if (!streamThinkTagCarry) return { reasoning: "", content: "" };
        const carry = streamThinkTagCarry;
        streamThinkTagCarry = "";
        if (streamThinkTagInReasoning) {
            return { reasoning: carry, content: "" };
        }
        return { reasoning: "", content: carry };
    }

    function getTagPrefixCarryLength(text, tag) {
        const maxLen = Math.min(tag.length - 1, text.length);
        for (let len = maxLen; len > 0; len -= 1) {
            if (text.endsWith(tag.slice(0, len))) return len;
        }
        return 0;
    }

    function splitThinkTaggedChunk(rawChunk) {
        const THINK_OPEN_VARIANTS = ["<think>", "\\u003cthink\\u003e", "&lt;think&gt;"];
        const THINK_CLOSE_VARIANTS = ["</think>", "\\u003c/think\\u003e", "&lt;/think&gt;"];
        const findEarliestTagMatch = (input, tagVariants) => {
            const lower = input.toLowerCase();
            let matchedIndex = -1;
            let matchedLen = 0;
            for (let i = 0; i < tagVariants.length; i += 1) {
                const tag = tagVariants[i];
                const idx = lower.indexOf(tag);
                if (idx < 0) continue;
                if (matchedIndex === -1 || idx < matchedIndex) {
                    matchedIndex = idx;
                    matchedLen = tag.length;
                }
            }
            return { index: matchedIndex, length: matchedLen };
        };
        const getMaxTagPrefixCarryLength = (input, tagVariants) => {
            let maxCarry = 0;
            for (let i = 0; i < tagVariants.length; i += 1) {
                const carryLen = getTagPrefixCarryLength(input, tagVariants[i]);
                if (carryLen > maxCarry) maxCarry = carryLen;
            }
            return maxCarry;
        };
        let text = `${streamThinkTagCarry}${String(rawChunk === undefined || rawChunk === null ? "" : rawChunk)}`;
        streamThinkTagCarry = "";
        let reasoning = "";
        let content = "";

        while (text) {
            if (streamThinkTagInReasoning) {
                const closeMatch = findEarliestTagMatch(text, THINK_CLOSE_VARIANTS);
                if (closeMatch.index >= 0) {
                    reasoning += text.slice(0, closeMatch.index);
                    text = text.slice(closeMatch.index + closeMatch.length);
                    streamThinkTagInReasoning = false;
                    continue;
                }
                const carryLen = getMaxTagPrefixCarryLength(text, THINK_CLOSE_VARIANTS);
                const stableText = text.slice(0, text.length - carryLen);
                reasoning += stableText;
                streamThinkTagCarry = text.slice(text.length - carryLen);
                text = "";
                continue;
            }
            const openMatch = findEarliestTagMatch(text, THINK_OPEN_VARIANTS);
            if (openMatch.index >= 0) {
                content += text.slice(0, openMatch.index);
                text = text.slice(openMatch.index + openMatch.length);
                streamThinkTagInReasoning = true;
                continue;
            }
            const carryLen = getMaxTagPrefixCarryLength(text, THINK_OPEN_VARIANTS);
            const stableText = text.slice(0, text.length - carryLen);
            content += stableText;
            streamThinkTagCarry = text.slice(text.length - carryLen);
            text = "";
        }

        return { reasoning: reasoning, content: content };
    }

    function appendReasoningChunk(reasoningChunk) {
        if (reasoningChunk === undefined || reasoningChunk === null) return;
        const text = String(reasoningChunk);
        if (!text) return;
        if (!hasReasoning) {
            hasReasoning = true;
            Logger.info("检测到推理流，自动展开推理框");
            setReasoningVisibility(true);
        }
        streamReasoningBuffer += text;
    }

    function appendContentChunk(contentChunk, isChatMode) {
        if (contentChunk === undefined || contentChunk === null) return;
        const text = String(contentChunk);
        if (!text) return;
        const isFirstContentChunk = isChatMode ? chatAssistantBuffer.length === 0 : streamTextBuffer.length === 0;
        if (isFirstContentChunk && hasReasoning) {
            Logger.info("推理结束，正文开始，自动收起推理框");
            setReasoningVisibility(false);
        }
        if (isChatMode) {
            chatAssistantBuffer += text;
            updateChatStreamText();
            return;
        }
        streamTextBuffer += text;
    }

    function appendTaggedContentChunk(template, rawChunk, isChatMode) {
        if (rawChunk === undefined || rawChunk === null) return;
        const tagged = parseContentChunkByReasoningTag(template, rawChunk);
        if (tagged.reasoning) appendReasoningChunk(tagged.reasoning);
        if (tagged.content) appendContentChunk(tagged.content, isChatMode);
    }

    function captureProviderRuntimeFieldsFromChunk(template, data) {
        if (!template || !data || typeof data !== "object") return;
        const streamCfg = resolveTemplateStreamConfig(template);
        const sessionPath = String(streamCfg.sessionIdPath || "").trim();
        if (!sessionPath) return;
        const sessionKey = normalizeTemplateKey(streamCfg.sessionIdKey || DEFAULT_PROVIDER_SESSION_FIELD_KEY) || DEFAULT_PROVIDER_SESSION_FIELD_KEY;
        const extracted = getValueByPath(data, sessionPath);
        if (extracted === undefined || extracted === null) return;
        setProviderRuntimeFieldValue(template.id, sessionKey, extracted, { persistQueue: streamMode === "chat" });
    }

    function parseContentChunkByReasoningTag(template, rawChunk) {
        const streamCfg = resolveTemplateStreamConfig(template);
        const reasoningTag = streamCfg && streamCfg.reasoningTag ? String(streamCfg.reasoningTag).trim().toLowerCase() : "";
        const rawText = rawChunk === undefined || rawChunk === null ? "" : String(rawChunk);
        const parser = streamCfg && streamCfg.parser ? String(streamCfg.parser).trim().toLowerCase() : "";
        const lowerText = rawText.toLowerCase();
        const hasThinkToken = lowerText.includes("<think>")
            || lowerText.includes("\\u003cthink\\u003e")
            || lowerText.includes("&lt;think&gt;")
            || !!streamThinkTagCarry
            || streamThinkTagInReasoning;
        const shouldUseThinkTag = reasoningTag === "think" || (!reasoningTag && (parser === "ollama" || hasThinkToken));
        if (!shouldUseThinkTag) {
            return { reasoning: "", content: rawText };
        }
        return splitThinkTaggedChunk(rawText);
    }

    function applyFallbackTextWithReasoningTag(template, fallbackText, isChatMode) {
        const rawText = fallbackText === undefined || fallbackText === null ? "" : String(fallbackText);
        if (!rawText) return;
        appendTaggedContentChunk(template, rawText, isChatMode);
    }

    function flushReasoningTagRemainderToBuffers(isChatMode) {
        const remainder = flushThinkTagStreamCarry();
        if (remainder.reasoning) appendReasoningChunk(remainder.reasoning);
        if (remainder.content) appendContentChunk(remainder.content, isChatMode);
    }

    function buildTextPayload(template, model, systemPrompt, text) {
        const messages = [
            buildProviderMessage(template, "system", systemPrompt, ""),
            buildProviderMessage(template, "user", text, "")
        ].filter(Boolean);
        return buildProviderPayload(template, model, messages);
    }

    function buildVisionPayload(template, model, textPrompt, imageBase64) {
        const messages = [
            buildProviderMessage(template, "user", textPrompt, imageBase64)
        ].filter(Boolean);
        return buildProviderPayload(template, model, messages);
    }

    function buildChatPayload(template, model, messages) {
        return buildProviderPayload(template, model, messages);
    }

    function generateChatRecordId() {
        return `rec-${generateMessageId()}`;
    }

    function ensureChatRecordId(record) {
        if (!record || typeof record !== "object") return "";
        const existing = String(record.recordId || "").trim();
        if (existing) return existing;
        const nextId = generateChatRecordId();
        record.recordId = nextId;
        return nextId;
    }

    function appendChatHistoryRecord(role, text, imageBase64, meta = {}) {
        if (!role) return;
        chatHistoryRecords.push({
            recordId: typeof meta.recordId === "string" ? meta.recordId : generateChatRecordId(),
            role: role,
            text: text || "",
            imageBase64: imageBase64 || "",
            displayText: typeof meta.displayText === "string" ? meta.displayText : "",
            turnId: typeof meta.turnId === "string" ? meta.turnId : "",
            assistantLabel: typeof meta.assistantLabel === "string" ? meta.assistantLabel : "",
            localOnly: !!meta.localOnly
        });
    }

    function resolveChatRecordMessage(record, template, options = {}) {
        const preferImageOnlyForMixed = !!(options && options.preferImageOnlyForMixed);
        if (!record || !template) return null;
        if (record.localOnly) return null;
        if (record.role !== "user") {
            return {
                role: record.role,
                text: record.text || "",
                imageBase64: ""
            };
        }
        const hasImage = !!record.imageBase64;
        if (!hasImage) {
            return {
                role: "user",
                text: record.text || "",
                imageBase64: ""
            };
        }
        if (template.supportsVision) {
            const hasMixedTextImage = !!String(record.displayText || "").trim();
            const textForVision = (preferImageOnlyForMixed && hasMixedTextImage) ? "" : (record.text || "");
            return {
                role: "user",
                text: textForVision,
                imageBase64: record.imageBase64
            };
        }
        const textOnly = String(record.displayText || "").trim();
        if (!textOnly) return null;
        return {
            role: "user",
            text: textOnly,
            imageBase64: ""
        };
    }

    function buildChatMessagesForProvider(providerId, options = {}) {
        const template = getProviderTemplateSafe(providerId);
        if (!template) return [];
        const messages = [];
        if (template && template.type === "chat-parts") {
            const systemTexts = [];
            chatHistoryRecords.forEach((record) => {
                ensureChatRecordId(record);
                if (record.role === "system") {
                    if (record.text) systemTexts.push(record.text);
                    return;
                }
                const normalized = resolveChatRecordMessage(record, template, options);
                if (!normalized) return;
                const message = buildProviderMessage(template, normalized.role, normalized.text, normalized.imageBase64);
                if (message) messages.push(message);
            });
            if (systemTexts.length) {
                const systemMessage = buildProviderMessage(template, "system", systemTexts.join("\n\n"), "");
                if (systemMessage) messages.unshift(systemMessage);
            }
            return messages;
        }
        chatHistoryRecords.forEach((record) => {
            ensureChatRecordId(record);
            const normalized = resolveChatRecordMessage(record, template, options);
            if (!normalized) return;
            const message = buildProviderMessage(template, normalized.role, normalized.text, normalized.imageBase64);
            if (message) messages.push(message);
        });
        return messages;
    }

    function syncChatProvider(providerId) {
        if (!chatSessionStarted) return;
        const targetProvider = resolveProviderId(providerId || DEFAULT_PROVIDER, getProviderTemplates());
        if (chatProvider === targetProvider && chatMessages.length) return;
        const switchedProvider = !!chatProvider && chatProvider !== targetProvider;
        chatProvider = targetProvider;
        chatMessages = buildChatMessagesForProvider(targetProvider, { preferImageOnlyForMixed: switchedProvider });
    }

    function formatChatUserBlock(userText, imageId, isFirst, turnId, recordId) {
        const safeText = userText ? userText : (imageId ? "（仅识屏）" : "");
        const refreshBtn = turnId
            ? ` <button type="button" class="coolauxv-chat-refresh-btn" data-chat-turn-id="${turnId}" title="重新生成本轮输出">↻ 重新回答</button>`
            : "";
        const editBtn = recordId
            ? ` <button type="button" class="coolauxv-chat-edit-btn" data-chat-record-id="${recordId}" title="编辑该条用户消息">✎ 编辑</button>`
            : "";
        const deleteBtn = recordId
            ? ` <button type="button" class="coolauxv-chat-delete-btn" data-chat-record-id="${recordId}" title="删除该条用户消息">🗑 删除</button>`
            : "";
        const stripMediaBtn = (recordId && imageId)
            ? ` <button type="button" class="coolauxv-chat-strip-media-btn" data-chat-record-id="${recordId}" title="仅删除该条消息中的图片">🧹 删图片</button>`
            : "";
        let block = "";
        if (!isFirst) block += "\n\n<div class=\"coolauxv-chat-turn-divider\" aria-hidden=\"true\"></div>\n\n";
        block += `**👤 用户：**${refreshBtn}${editBtn}${deleteBtn}${stripMediaBtn}\n${safeText}\n`;
        if (imageId) {
            block += `\n<button type="button" class="coolauxv-chat-preview-btn" data-chat-img-id="${imageId}">🔍 预览识屏</button>\n`;
        }
        return block;
    }

    function formatChatModelLabel(provider, modelName) {
        const providerLabel = getProviderLabel(provider);
        const modelLabel = modelName ? String(modelName).trim() : "";
        if (!providerLabel && !modelLabel) return "";
        if (modelLabel) return `${providerLabel} ${modelLabel}`.trim();
        return providerLabel;
    }

    function getChatAssistantPrefix(label, recordId) {
        const info = label || chatAssistantLabel;
        const suffix = info ? ` (${info})` : "";
        const editBtn = recordId
            ? ` <button type="button" class="coolauxv-chat-edit-btn" data-chat-record-id="${recordId}" title="编辑该条 AI 消息">✎ 编辑</button>`
            : "";
        const deleteBtn = recordId
            ? ` <button type="button" class="coolauxv-chat-delete-btn" data-chat-record-id="${recordId}" title="删除该条 AI 消息">🗑 删除</button>`
            : "";
        return `\n\n**🤖 AI${suffix}：**${editBtn}${deleteBtn}\n`;
    }
    function getChatAssistantThinkingPrefix(label) {
        return `${getChatAssistantPrefix(label)}<span style="color:#888; display:inline-flex; align-items:center; gap:6px;">⏳ <span class="coolauxv-pulse">AI 思考中...</span></span>\n`;
    }

    function buildChatAssistantBlock(text, label, recordId) {
        return getChatAssistantPrefix(label, recordId) + (text || "");
    }

    function generateChatTurnId() {
        return `turn-${generateMessageId()}`;
    }

    function updateChatEditModeUI() {
        if (!popup) return;
        const btnChatSend = popup.querySelector("#coolauxv-btn-chat-send");
        const btnChatEditCancel = popup.querySelector("#coolauxv-btn-chat-edit-cancel");
        const isEditing = !!chatEditingRecordId;
        if (btnChatSend) {
            btnChatSend.textContent = isEditing ? "确认编辑" : "发送";
            btnChatSend.title = isEditing
                ? (chatEditingRole === "user" ? "确认编辑并重新生成本轮" : "确认编辑消息")
                : "发送";
        }
        if (btnChatEditCancel) {
            setAnimatedVisibility(btnChatEditCancel, isEditing);
        }
    }

    function exitChatEditMode() {
        chatEditingTurnId = "";
        chatEditingRecordId = "";
        chatEditingRole = "";
        updateChatEditModeUI();
    }

    function enterChatEditMode(recordId) {
        if (!recordId || !popup) return;
        if (isRendering) {
            alert("当前正在生成内容，请稍候再试。");
            return;
        }
        startChatSessionIfNeeded();
        const targetRecord = chatHistoryRecords.find((record) => ensureChatRecordId(record) === recordId);
        if (!targetRecord) {
            alert("未找到对应的连续对话消息，无法编辑。");
            return;
        }
        const chatInput = popup.querySelector("#coolauxv-chat-input");
        if (!chatInput) return;

        chatEditingRecordId = recordId;
        chatEditingRole = targetRecord.role || "";
        chatEditingTurnId = targetRecord.role === "user" ? (targetRecord.turnId || "") : "";
        updateChatEditModeUI();

        const imageBase64 = targetRecord.imageBase64 || "";
        const inputText = targetRecord.role === "assistant"
            ? (targetRecord.text || "")
            : (targetRecord.displayText
                ? targetRecord.displayText
                : (imageBase64 ? "" : (targetRecord.text || "")));
        chatInput.value = inputText;
        chatCapturedImageBase64 = targetRecord.role === "user" ? imageBase64 : "";

        const btnChatPreview = popup.querySelector("#coolauxv-btn-preview-chat");
        const btnChatClear = popup.querySelector("#coolauxv-btn-clear-chat-shot");
        const showImageTools = targetRecord.role === "user" && !!imageBase64;
        setAnimatedVisibility(btnChatPreview, showImageTools);
        setAnimatedVisibility(btnChatClear, showImageTools);

        chatInput.focus();
        try {
            chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
        } catch (e) { }
    }

    function applyChatHistoryMutation() {
        rebuildChatDisplayFromHistory(chatAssistantLabel);
        const config = getActiveConfig();
        const provider = resolveProviderId((chatProvider || config.provider || DEFAULT_PROVIDER), getProviderTemplates());
        chatProvider = provider;
        chatMessages = buildChatMessagesForProvider(provider);
        renderContent();
        queueCurrentChatSessionToBackground();
    }

    function deleteChatRecord(recordId) {
        if (!recordId) return;
        if (isRendering) {
            alert("当前正在生成内容，请稍候再试。");
            return;
        }
        startChatSessionIfNeeded();
        const targetIndex = chatHistoryRecords.findIndex((record) => ensureChatRecordId(record) === recordId);
        if (targetIndex < 0) {
            alert("未找到对应的连续对话消息，无法删除。");
            return;
        }
        const targetRecord = chatHistoryRecords[targetIndex];
        const roleLabel = targetRecord.role === "assistant" ? "AI" : (targetRecord.role === "system" ? "系统" : "用户");
        if (!confirm(`确定删除这条${roleLabel}消息吗？`)) return;
        chatHistoryRecords.splice(targetIndex, 1);
        if (chatEditingRecordId === recordId) {
            exitChatEditMode();
            const chatInput = popup.querySelector("#coolauxv-chat-input");
            if (chatInput) chatInput.value = "";
            chatCapturedImageBase64 = "";
            const btnChatPreview = popup.querySelector("#coolauxv-btn-preview-chat");
            const btnChatClear = popup.querySelector("#coolauxv-btn-clear-chat-shot");
            setAnimatedVisibility(btnChatPreview, false);
            setAnimatedVisibility(btnChatClear, false);
        }
        applyChatHistoryMutation();
    }

    function stripChatRecordMedia(recordId) {
        if (!recordId) return;
        if (isRendering) {
            alert("当前正在生成内容，请稍候再试。");
            return;
        }
        startChatSessionIfNeeded();
        const targetRecord = chatHistoryRecords.find((record) => ensureChatRecordId(record) === recordId);
        if (!targetRecord || targetRecord.role !== "user") {
            alert("仅支持删除用户消息中的图片。");
            return;
        }
        if (!targetRecord.imageBase64) return;
        const textOnly = String(targetRecord.displayText || "").trim();
        if (!textOnly) {
            deleteChatRecord(recordId);
            return;
        }
        targetRecord.imageBase64 = "";
        targetRecord.displayText = textOnly;
        targetRecord.text = textOnly;
        if (chatEditingRecordId === recordId) {
            chatCapturedImageBase64 = "";
            const btnChatPreview = popup.querySelector("#coolauxv-btn-preview-chat");
            const btnChatClear = popup.querySelector("#coolauxv-btn-clear-chat-shot");
            setAnimatedVisibility(btnChatPreview, false);
            setAnimatedVisibility(btnChatClear, false);
        }
        applyChatHistoryMutation();
    }

    async function confirmChatEditSend() {
        if (!chatEditingRecordId) return false;
        if (!popup) return true;
        const chatInput = popup.querySelector("#coolauxv-chat-input");
        if (!chatInput) return true;

        startChatSessionIfNeeded();
        const targetIndex = chatHistoryRecords.findIndex((record) => ensureChatRecordId(record) === chatEditingRecordId);
        if (targetIndex < 0) {
            alert("未找到对应的连续对话消息，无法编辑。");
            exitChatEditMode();
            return true;
        }
        const targetRecord = chatHistoryRecords[targetIndex];
        const role = targetRecord.role;

        if (role === "assistant") {
            const aiText = chatInput.value.trim();
            if (!aiText) {
                showChatInlineNotice("⚠️ AI 消息不能为空。");
                return true;
            }
            clearChatInlineNotice();
            targetRecord.text = aiText;
            targetRecord.imageBase64 = "";
            targetRecord.displayText = "";
            exitChatEditMode();
            applyChatHistoryMutation();
            return true;
        }

        const userText = chatInput.value.trim();
        const imageBase64 = chatCapturedImageBase64 || "";
        const hasImage = !!imageBase64;
        if (!userText && !hasImage) {
            showChatInlineNotice("⚠️ 请输入内容或识屏。");
            return true;
        }
        clearChatInlineNotice();

        const config = getActiveConfig();
        const turnId = targetRecord.turnId || chatEditingTurnId || generateChatTurnId();
        targetRecord.turnId = turnId;
        targetRecord.imageBase64 = imageBase64;
        targetRecord.displayText = userText || (hasImage ? "（仅识屏）" : "");
        targetRecord.text = userText || (hasImage ? config.promptVision : "");

        exitChatEditMode();
        await regenerateChatTurn(turnId);
        return true;
    }

    function rebuildChatDisplayFromHistory(fallbackAssistantLabel) {
        const defaultAssistantLabel = fallbackAssistantLabel || chatAssistantLabel;
        chatDisplayBuffer = "";
        chatImageStore = {};
        chatImageCounter = 0;

        chatHistoryRecords.forEach((record) => {
            if (!record || !record.role) return;
            const recordId = ensureChatRecordId(record);
            if (record.role === "user") {
                const isFirstRenderedUser = chatDisplayBuffer.length === 0;
                const turnId = record.turnId || generateChatTurnId();
                record.turnId = turnId;
                let imageId = null;
                if (record.imageBase64) {
                    imageId = `chat-img-${++chatImageCounter}`;
                    chatImageStore[imageId] = record.imageBase64;
                }
                const displayText = record.displayText
                    ? record.displayText
                    : (record.text || (imageId ? "（仅识屏）" : ""));
                chatDisplayBuffer += formatChatUserBlock(displayText, imageId, chatDisplayBuffer.length === 0, turnId, recordId);
                return;
            }
            if (record.role === "assistant") {
                const assistantLabel = record.assistantLabel || defaultAssistantLabel;
                const assistantBlock = buildChatAssistantBlock(record.text || "", assistantLabel, recordId);
                if (chatDisplayBuffer) {
                    chatDisplayBuffer += assistantBlock;
                } else {
                    chatDisplayBuffer = assistantBlock.replace(/^\n+/, "");
                }
            }
        });
        chatAssistantBuffer = "";
        chatPendingAssistantPrefix = "";
        streamTextBuffer = chatDisplayBuffer;
        lastRenderedText = "";
    }

    async function regenerateChatTurn(turnId) {
        if (!turnId) return;
        if (!popup) return;
        if (isRendering) {
            alert("当前正在生成内容，请稍候再试。");
            return;
        }
        if (chatEditingRecordId) {
            exitChatEditMode();
        }
        startChatSessionIfNeeded();

        const targetIndex = chatHistoryRecords.findIndex((record) => record.role === "user" && record.turnId === turnId);
        if (targetIndex < 0) {
            alert("未找到对应的连续对话轮次，无法刷新。");
            return;
        }

        const targetRecord = chatHistoryRecords[targetIndex];
        const replayImageBase64 = targetRecord.imageBase64 || "";
        const replayDisplayText = targetRecord.displayText
            ? targetRecord.displayText
            : (replayImageBase64 ? "" : (targetRecord.text || ""));

        chatHistoryRecords = chatHistoryRecords.slice(0, targetIndex);
        rebuildChatDisplayFromHistory(chatAssistantLabel);

        const config = getActiveConfig();
        const provider = config.provider;
        chatProvider = resolveProviderId(provider || DEFAULT_PROVIDER, getProviderTemplates());
        chatMessages = buildChatMessagesForProvider(chatProvider);
        renderContent();

        const chatInput = popup.querySelector("#coolauxv-chat-input");
        if (!chatInput) return;
        chatInput.value = replayDisplayText || "";
        chatCapturedImageBase64 = replayImageBase64;
        const btnChatPreview = popup.querySelector("#coolauxv-btn-preview-chat");
        const btnChatClear = popup.querySelector("#coolauxv-btn-clear-chat-shot");
        setAnimatedVisibility(btnChatPreview, !!replayImageBase64);
        setAnimatedVisibility(btnChatClear, !!replayImageBase64);

        await doChatSend();
    }

    function recordHistoryEntry(entry) {
        if (!entry) return;
        const output = (entry.assistantText || "").trim();
        if (!output) return;
        historyRecords.push(entry);
    }

    function startChatSessionIfNeeded() {
        if (chatSessionStarted) return;
        chatSessionStarted = true;
        chatSessionId = generateRequestId();
        chatProviderRuntimeState = {};
        chatMessages = [];
        chatDisplayBuffer = "";
        chatImageStore = {};
        chatImageCounter = 0;
        const config = getActiveConfig();
        const provider = config.provider;
        chatHistoryRecords = [];
        const baseChatLabel = formatChatModelLabel(provider, config.modelVision);
        chatAssistantLabel = baseChatLabel;

        historyRecords.forEach((entry) => {
            if (entry.systemPrompt) appendChatHistoryRecord("system", entry.systemPrompt, "");
            const displayText = entry.userDisplayText ? entry.userDisplayText : (entry.imageBase64 ? "" : (entry.userContentText || ""));
            const turnId = generateChatTurnId();
            if (entry.userContentText || entry.imageBase64) {
                appendChatHistoryRecord("user", entry.userContentText, entry.imageBase64, {
                    displayText: displayText,
                    turnId: turnId
                });
            }
            if (entry.assistantText) {
                const entryLabel = (entry && entry.provider && entry.model)
                    ? formatChatModelLabel(entry.provider, entry.model)
                    : baseChatLabel;
                appendChatHistoryRecord("assistant", entry.assistantText, "", { assistantLabel: entryLabel });
            }
        });

        rebuildChatDisplayFromHistory(baseChatLabel);

        chatSystemPrompt = (config.promptContinuousChat || "").trim();
        if (chatSystemPrompt) {
            appendChatHistoryRecord("system", chatSystemPrompt, "");
        }
        chatMessages = buildChatMessagesForProvider(provider);
        chatProvider = provider;
    }

    function updateChatStreamText() {
        if (chatAssistantBuffer) {
            streamTextBuffer = chatDisplayBuffer + getChatAssistantPrefix(chatAssistantLabel) + chatAssistantBuffer;
        } else {
            streamTextBuffer = chatDisplayBuffer + chatPendingAssistantPrefix;
        }
    }

    function collapseChatIfEnabled() {
        if (!popup) return;
        const enabled = isContinuousChatEnabled();
        if (!enabled) return;
        const chatBar = popup.querySelector("#coolauxv-chat-bar");
        if (!chatBar || chatBar.style.display === "none") return;
        if (isChatCollapsed) return;
        isChatCollapsed = true;
        updateChatCollapseUI();
    }

    function collapseTopSectionIfExpanded() {
        if (!popup) return;
        const topSection = popup.querySelector("#coolauxv-main-top-section");
        if (!topSection) return;
        if (isTopSectionCollapsed) return;
        isTopSectionCollapsed = true;
        updateTopSectionCollapseUI();
    }

    function autoExpandChatIfEnabled(actionToken) {
        if (!popup) return;
        if (typeof actionToken === "number" && actionToken !== activeActionToken) return;
        const enabled = isContinuousChatEnabled();
        if (!enabled) return;
        const chatBar = popup.querySelector("#coolauxv-chat-bar");
        if (!chatBar || chatBar.style.display === "none") return;
        if (!isChatCollapsed) return;
        isChatCollapsed = false;
        updateChatCollapseUI();
    }

    function finalizeChatResponse(actionToken) {
        if (!chatSessionStarted) return;
        flushReasoningTagRemainderToBuffers(true);
        if (chatAssistantBuffer) {
            const config = getActiveConfig();
            const provider = config.provider;
            logAiResponse(provider, config.modelVision, "chat", chatAssistantBuffer);
            const assistantMessage = buildProviderMessage(config.template, "assistant", chatAssistantBuffer, "");
            if (assistantMessage) chatMessages.push(assistantMessage);
            const assistantRecordId = generateChatRecordId();
            appendChatHistoryRecord("assistant", chatAssistantBuffer, "", {
                assistantLabel: chatAssistantLabel,
                recordId: assistantRecordId
            });
            chatDisplayBuffer += buildChatAssistantBlock(chatAssistantBuffer, chatAssistantLabel, assistantRecordId);
        }
        chatAssistantBuffer = "";
        chatPendingAssistantPrefix = "";
        streamTextBuffer = chatDisplayBuffer;
        lastRenderedText = "";
        renderContent();
        queueCurrentChatSessionToBackground();
        autoExpandChatIfEnabled(actionToken);
    }

    function hasChatOutput() {
        if (!chatSessionStarted) return false;
        if (chatAssistantBuffer && chatAssistantBuffer.trim()) return true;
        return chatDisplayBuffer.includes("**🤖 AI");
    }

    function shouldSuppressResultError() {
        return hasChatOutput();
    }

    function clearChatInlineNotice() {
        if (chatInlineNoticeTimer) {
            clearTimeout(chatInlineNoticeTimer);
            chatInlineNoticeTimer = null;
        }
        if (!popup) return;
        const notice = popup.querySelector("#coolauxv-chat-inline-notice");
        if (!notice) return;
        setAnimatedVisibility(notice, false);
    }

    function showChatInlineNotice(message, options = {}) {
        if (!popup) return;
        const chatBody = popup.querySelector("#coolauxv-chat-body");
        if (!chatBody) return;

        const { autoHideMs = 2800 } = options;
        let notice = popup.querySelector("#coolauxv-chat-inline-notice");
        if (!notice) {
            notice = document.createElement("div");
            notice.id = "coolauxv-chat-inline-notice";
            notice.className = "coolauxv-animated-visibility";
            notice.style.display = "none";
            notice.innerHTML = `
                <span id="coolauxv-chat-inline-notice-text"></span>
                <button type="button" id="coolauxv-chat-inline-notice-close" title="关闭提示">×</button>
            `;
            chatBody.appendChild(notice);
            const closeBtn = notice.querySelector("#coolauxv-chat-inline-notice-close");
            if (closeBtn) closeBtn.addEventListener("click", clearChatInlineNotice);
        }

        const textEl = notice.querySelector("#coolauxv-chat-inline-notice-text");
        if (textEl) textEl.textContent = message || "请输入内容。";

        if (chatInlineNoticeTimer) clearTimeout(chatInlineNoticeTimer);
        chatInlineNoticeTimer = null;
        setAnimatedVisibility(notice, true);
        if (autoHideMs > 0) {
            chatInlineNoticeTimer = setTimeout(() => {
                clearChatInlineNotice();
            }, autoHideMs);
        }
    }

    function appendChatError(message, options = {}) {
        const { allowHtml = false } = options;
        startChatSessionIfNeeded();
        const safeMessage = message || "请求失败";
        const htmlMessage = allowHtml ? normalizeHtmlForMarkdown(safeMessage) : safeMessage;
        const errorContent = allowHtml ? htmlMessage : `<span style="color:red">${safeMessage}</span>`;
        const assistantRecordId = generateChatRecordId();
        const assistantBlock = buildChatAssistantBlock(errorContent, chatAssistantLabel, assistantRecordId);
        if (chatDisplayBuffer) {
            chatDisplayBuffer += assistantBlock;
        } else {
            chatDisplayBuffer = assistantBlock.replace(/^\n+/, "");
        }
        const historyText = allowHtml ? htmlMessage : errorContent;
        appendChatHistoryRecord("assistant", historyText, "", {
            assistantLabel: chatAssistantLabel,
            recordId: assistantRecordId,
            localOnly: true
        });
        streamTextBuffer = chatDisplayBuffer;
        lastRenderedText = "";
        renderContent();
        queueCurrentChatSessionToBackground();
    }

    function normalizeHtmlForMarkdown(html) {
        if (!html) return "";
        const lines = String(html).replace(/\r/g, "").split("\n");
        let inPre = false;
        const normalized = lines.map((line) => {
            const output = inPre ? line : line.replace(/^\s+/, "");
            if (!inPre && line.includes("<pre")) inPre = true;
            if (inPre && line.includes("</pre>")) inPre = false;
            return output;
        });
        return normalized.join("\n").trim();
    }

    function clearChatSessionState() {
        clearChatInlineNotice();
        clearMermaidSvgCache();
        chatMessages = [];
        chatHistoryRecords = [];
        chatDisplayBuffer = "";
        chatSessionStarted = false;
        chatSessionId = "";
        chatProviderRuntimeState = {};
        chatImageStore = {};
        chatImageCounter = 0;
        chatAssistantBuffer = "";
        chatPendingAssistantPrefix = "";
        chatProvider = "";
        chatSystemPrompt = "";
        chatEditingTurnId = "";
        chatEditingRecordId = "";
        chatEditingRole = "";
        streamMode = "single";
        streamTextBuffer = "";
        lastRenderedText = "";
        updateChatEditModeUI();
    }

    function clearConversationState() {
        clearChatInlineNotice();
        clearMermaidSvgCache();
        historyRecords = [];
        chatMessages = [];
        chatHistoryRecords = [];
        chatDisplayBuffer = "";
        chatSessionStarted = false;
        chatSessionId = "";
        chatProviderRuntimeState = {};
        chatImageStore = {};
        chatImageCounter = 0;
        chatAssistantBuffer = "";
        chatPendingAssistantPrefix = "";
        chatProvider = "";
        chatSystemPrompt = "";
        chatEditingTurnId = "";
        chatEditingRecordId = "";
        chatEditingRole = "";
        streamMode = "single";
        streamTextBuffer = "";
        streamReasoningBuffer = "";
        lastRenderedText = "";
        lastRenderedReasoning = "";
        hasReasoning = false;

        const resultDiv = popup.querySelector("#coolauxv-result");
        const reasoningDiv = popup.querySelector("#coolauxv-reasoning-box");
        const reasoningWrapper = popup.querySelector("#coolauxv-reasoning-wrapper");
        const reasoningToggle = popup.querySelector("#coolauxv-reasoning-toggle-container");
        const separator = popup.querySelector("#coolauxv-separator");

        if (resultDiv) resultDiv.innerHTML = "";
        if (reasoningDiv) reasoningDiv.innerHTML = "";
        if (reasoningWrapper) reasoningWrapper.style.display = "none";
        if (reasoningToggle) reasoningToggle.style.display = "none";
        if (separator) separator.style.display = "none";
        updateChatEditModeUI();
    }

    // --- 4. 核心功能 ---
    function resetPopupState() {
        const cfgW = GM_getValue("coolauxv_win_width");
        const cfgH = GM_getValue("coolauxv_win_height");

        // 重置推理框高度为 50%
        const reasoningWrapper = popup.querySelector("#coolauxv-reasoning-wrapper");
        if (reasoningWrapper) {
            reasoningWrapper.style.height = "50%";
            reasoningWrapper.dataset.lastHeight = "";
        }


        if (window.innerWidth < 600) {
            popup.style.width = "92vw";
            popup.style.height = cfgH ? cfgH : DEFAULT_WIN_HEIGHT;
            popup.style.top = "50%";
            popup.style.left = "50%";
            popup.style.transform = "translate(-50%, -50%)";
        } else {
            popup.style.width = cfgW ? cfgW : DEFAULT_WIN_WIDTH;
            popup.style.height = cfgH ? cfgH : DEFAULT_WIN_HEIGHT;
            popup.style.top = "50%";
            popup.style.left = "50%";
            popup.style.transform = "translate(-50%, -50%)";
        }
    }

    function resetMainViewLayoutBySettings() {
        setViewImmediate("main");
        isTopSectionCollapsed = false;
        updateTopSectionCollapseUI();

        const continuousChatEnabled = GM_getValue("coolauxv_enable_continuous_chat", DEFAULT_ENABLE_CONTINUOUS_CHAT);
        const chatBar = popup.querySelector("#coolauxv-chat-bar");
        if (chatBar) {
            chatBar.style.display = continuousChatEnabled ? "flex" : "none";
        }
        const btnChatHistory = popup.querySelector("#coolauxv-chat-history-btn");
        if (btnChatHistory) {
            const persistEnabled = GM_getValue("coolauxv_chat_history_persist", DEFAULT_CHAT_HISTORY_PERSIST);
            btnChatHistory.style.display = continuousChatEnabled && persistEnabled ? "inline-block" : "none";
        }
        isChatCollapsed = !continuousChatEnabled;
        updateChatCollapseUI();
    }

    function updateScroll(element, newContentHTML, isRaw) {
        const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 30;

        if (isRaw) {
            element.innerText = newContentHTML;
        } else {
            try {
                // === 核心渲染逻辑 ===
                const mermaidBlocks = [];
                const mermaidProtectedText = String(newContentHTML || "").replace(/```[ \t]*mermaid(?:[^\n\r]*)\r?\n([\s\S]*?)```/gi, (match, code) => {
                    const normalizedCode = normalizeMermaidCode(code);
                    if (!normalizedCode) return match;
                    mermaidBlocks.push({ code: normalizedCode });
                    return `MERMAIDBLOCK${mermaidBlocks.length - 1}END`;
                });

                // 1. 数学公式保护 (Math Protection)
                // 使用纯字母数字的占位符 (如 KATEXBLOCK0END)，避免 Markdown 解析器将其识别为粗体/斜体
                const mathBlocks = [];
                let protectedText = mermaidProtectedText
                    // 保护 $$...$$ 和 \[...\] (块级公式，支持换行)
                    .replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g, (match) => {
                        mathBlocks.push(match);
                        return `KATEXBLOCK${mathBlocks.length - 1}END`;
                    })
                    // 保护 \(...\) (行内公式)
                    .replace(/(\\\([\s\S]*?\\\))/g, (match) => {
                        mathBlocks.push(match);
                        return `KATEXBLOCK${mathBlocks.length - 1}END`;
                    })
                    // 保护 $...$ (行内公式)
                    // (?!\s) 和 (?<!\s) 用于防止匹配货币符号 (例如: $100 vs $200)
                    .replace(/(\$(?!\s)[^$\n]+?(?<!\s)\$)/g, (match) => {
                        mathBlocks.push(match);
                        return `KATEXBLOCK${mathBlocks.length - 1}END`;
                    });

                // 2. Markdown 解析
                let htmlContent = marked.parse(protectedText, {
                    gfm: true,
                    breaks: true
                });

                // 3. 还原数学公式
                // 查找刚才生成的纯文本占位符，替换回原始 LaTeX 代码
                htmlContent = htmlContent.replace(/KATEXBLOCK(\d+)END/g, (match, index) => {
                    return mathBlocks[index];
                });

                // 4. Mermaid 代码块替换（仅已闭合 fenced block）
                htmlContent = htmlContent.replace(/MERMAIDBLOCK(\d+)END/g, (match, index) => {
                    const block = mermaidBlocks[Number(index)];
                    if (!block) return match;
                    const fallbackHtml = `<pre><code class="language-mermaid">${escapeHTML(block.code)}</code></pre>`;
                    const cachedSvg = getCachedMermaidSvg(block.code);
                    if (cachedSvg) {
                        return `<div class="coolauxv-mermaid-rendered">${cachedSvg}</div>`;
                    }
                    if (!isMermaidRenderFailed(block.code)) {
                        ensureMermaidSvgCached(block.code).then((svgText) => {
                            if (!svgText || !popup || !popup.isConnected) return;
                            renderContent();
                        });
                    }
                    return `<div class="coolauxv-mermaid-fallback">${fallbackHtml}</div>`;
                });

                element.innerHTML = htmlContent;

                // 5. KaTeX 公式渲染
                if (typeof renderMathInElement !== 'undefined') {
                    renderMathInElement(element, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '\\[', right: '\\]', display: true },
                            { left: '$', right: '$', display: false },
                            { left: '\\(', right: '\\)', display: false }
                        ],
                        throwOnError: false,
                        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"]
                    });
                }
            } catch (e) {
                Logger.error("Render Error:", e);
                element.innerText = newContentHTML;
            }
        }

        if (isNearBottom || newContentHTML.length < 50) element.scrollTop = element.scrollHeight;
    }


    function renderContent() {
        const resultDiv = popup.querySelector("#coolauxv-result");
        const reasoningDiv = popup.querySelector("#coolauxv-reasoning-box");
        const reasoningWrapper = popup.querySelector("#coolauxv-reasoning-wrapper");
        const separator = popup.querySelector("#coolauxv-separator");
        const reasoningToggle = popup.querySelector("#coolauxv-reasoning-toggle-container");

        if (!resultDiv) return;

        // 1. 处理推理框显示逻辑
        if (hasReasoning) {
            reasoningToggle.style.display = "flex";
            if (isShowReasoning) {
                setReasoningAnimatedVisibility(true);
                separator.style.display = "flex";
                ensureReasoningHeight();
            } else {
                setReasoningAnimatedVisibility(false);
                separator.style.display = "none";
            }
        } else {
            reasoningToggle.style.display = "none";
            setReasoningAnimatedVisibility(false);
            separator.style.display = "none";
        }

        // 2. 渲染推理内容
        if (hasReasoning && isShowReasoning) {
            reasoningDiv.className = isShowRaw ? "coolauxv-scroll-box coolauxv-raw-text" : "coolauxv-scroll-box coolauxv-markdown";
            updateScroll(reasoningDiv, streamReasoningBuffer, isShowRaw);
        }

        // 3. 渲染结果内容
        // 只有当有实际文本内容时，才更新结果框
        if (streamTextBuffer) {
            resultDiv.className = isShowRaw ? "coolauxv-scroll-box coolauxv-raw-text" : "coolauxv-scroll-box coolauxv-markdown";
            updateScroll(resultDiv, streamTextBuffer, isShowRaw);
        }
        // 如果文本缓冲区为空（说明正在推理，或正在等待网络响应），则保留“AI 思考中...”的提示
        else {
            if (isRendering && !resultDiv.innerHTML.includes("AI 思考中")) {
                resultDiv.innerHTML = "<span style='color:#888'>⏳ AI 思考中...</span>";
            }
        }
        updateResultScrollBottomButton();
    }

    function scrollResultToBottom(smooth = false) {
        if (!popup) return;
        const resultDiv = popup.querySelector("#coolauxv-result");
        if (!resultDiv) return;
        if (smooth && typeof resultDiv.scrollTo === "function") {
            resultDiv.scrollTo({ top: resultDiv.scrollHeight, behavior: "smooth" });
            return;
        }
        resultDiv.scrollTop = resultDiv.scrollHeight;
    }

    function updateResultScrollBottomButton() {
        if (!popup) return;
        const resultDiv = popup.querySelector("#coolauxv-result");
        const btnScrollBottom = popup.querySelector("#coolauxv-btn-scroll-bottom");
        if (!resultDiv || !btnScrollBottom) return;
        const canScroll = resultDiv.scrollHeight - resultDiv.clientHeight > 8;
        const isNearBottom = resultDiv.scrollHeight - resultDiv.scrollTop - resultDiv.clientHeight <= 30;
        const shouldShow = canScroll && !isNearBottom;
        if (!isBasicAnimEnabled()) {
            btnScrollBottom.classList.toggle("coolauxv-visible", shouldShow);
            btnScrollBottom.style.display = shouldShow ? "flex" : "none";
            return;
        }
        setAnimatedVisibility(btnScrollBottom, shouldShow);
    }

    function startRenderLoop() {
        if (isRendering) return;
        isRendering = true;
        updateInterruptButtons();
        const loop = () => {
            if (!isRendering) return;
            if (streamTextBuffer !== lastRenderedText || streamReasoningBuffer !== lastRenderedReasoning) {
                renderContent();
                lastRenderedText = streamTextBuffer;
                lastRenderedReasoning = streamReasoningBuffer;
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    function stopRenderLoop() {
        isRendering = false;
        updateInterruptButtons();
        renderContent();
    }

    const MAIN_BUTTON_ADV_ANIM_IDS = new Set([
        "coolauxv-btn-stop",
        "coolauxv-btn-preview",
        "coolauxv-btn-clear-shot",
        "coolauxv-btn-scroll-bottom"
    ]);

    function shouldAnimateButtonVisibility(element) {
        if (!element) return false;
        if (!isBasicAnimEnabled()) return false;
        if (MAIN_BUTTON_ADV_ANIM_IDS.has(element.id)) {
            return isMinimizeAnimEnabled();
        }
        return true;
    }

    function setAnimatedVisibility(element, visible) {
        if (!element) return;
        const animateEnabled = shouldAnimateButtonVisibility(element);
        const isVisible = element.classList.contains("coolauxv-visible");
        if (visible) {
            if (isVisible) return;
            element.style.display = "flex";
            if (!animateEnabled) {
                element.classList.add("coolauxv-visible");
                return;
            }
            void element.offsetWidth;
            element.classList.add("coolauxv-visible");
            return;
        }

        if (!isVisible && element.style.display === "none") return;
        if (!animateEnabled) {
            element.classList.remove("coolauxv-visible");
            element.style.display = "none";
            return;
        }
        element.classList.remove("coolauxv-visible");
        const onEnd = (e) => {
            if (e.propertyName !== "opacity") return;
            if (!element.classList.contains("coolauxv-visible")) {
                element.style.display = "none";
            }
            element.removeEventListener("transitionend", onEnd);
        };
        element.addEventListener("transitionend", onEnd);
        setTimeout(() => {
            if (!element.classList.contains("coolauxv-visible")) {
                element.style.display = "none";
            }
        }, 260);
    }

    function forceHideAnimatedElement(element) {
        if (!element) return;
        element.classList.remove("coolauxv-visible");
        element.style.display = "none";
    }

    function applyCollapsedBoxStyles(element) {
        if (!element) return;
        element.style.height = "0px";
        element.style.paddingTop = "0px";
        element.style.paddingBottom = "0px";
        element.style.marginTop = "0px";
        element.style.marginBottom = "0px";
        element.style.borderTopWidth = "0px";
        element.style.borderBottomWidth = "0px";
    }

    function resetCollapsedBoxStyles(element) {
        if (!element) return;
        element.style.height = "";
        element.style.paddingTop = "";
        element.style.paddingBottom = "";
        element.style.marginTop = "";
        element.style.marginBottom = "";
        element.style.borderTopWidth = "";
        element.style.borderBottomWidth = "";
    }

    function updateInterruptButtons() {
        if (!popup) return;
        const btnStop = popup.querySelector("#coolauxv-btn-stop");
        const btnChatStop = popup.querySelector("#coolauxv-btn-chat-stop");
        const visible = !!isRendering;
        if (btnStop) setAnimatedVisibility(btnStop, visible);
        if (btnChatStop) setAnimatedVisibility(btnChatStop, visible);
    }

    function setCollapseAnimatedVisibility(section, visible) {
        if (!section) return;
        if (visible) {
            if (!section.classList.contains("coolauxv-collapsed")) return;
            resetCollapsedBoxStyles(section);
            section.style.display = "block";
            section.classList.add("coolauxv-collapsed");
            section.style.maxHeight = "0px";
            section.style.opacity = "0";
            section.style.transform = "translateY(-4px)";
            requestAnimationFrame(() => {
                const targetHeight = section.scrollHeight;
                section.style.maxHeight = `${targetHeight}px`;
                section.classList.remove("coolauxv-collapsed");
                section.style.opacity = "1";
                section.style.transform = "translateY(0)";
                const onEnd = (e) => {
                    if (e.propertyName !== "max-height") return;
                    if (!section.classList.contains("coolauxv-collapsed")) {
                        section.style.maxHeight = "none";
                        resetCollapsedBoxStyles(section);
                    }
                    section.removeEventListener("transitionend", onEnd);
                };
                section.addEventListener("transitionend", onEnd);
            });
            return;
        }

        if (section.style.display === "none") return;
        resetCollapsedBoxStyles(section);
        if (section.style.maxHeight === "none") {
            section.style.maxHeight = `${section.scrollHeight}px`;
        }
        void section.offsetHeight;
        section.classList.add("coolauxv-collapsed");
        section.style.maxHeight = "0px";
        section.style.opacity = "0";
        section.style.transform = "translateY(-4px)";
        const onEnd = (e) => {
            if (e.propertyName !== "max-height") return;
            if (section.classList.contains("coolauxv-collapsed")) {
                applyCollapsedBoxStyles(section);
                section.style.display = "none";
            }
            section.removeEventListener("transitionend", onEnd);
        };
        section.addEventListener("transitionend", onEnd);
    }

    function resolveReasoningTargetHeight(reasoningWrapper) {
        const container = popup.querySelector("#coolauxv-content-container");
        if (container && container.clientHeight) {
            const halfHeight = Math.round(container.clientHeight * 0.5);
            if (halfHeight > 0) return `${halfHeight}px`;
        }
        if (popup.clientHeight) {
            const halfHeight = Math.round(popup.clientHeight * 0.5);
            if (halfHeight > 0) return `${halfHeight}px`;
        }
        if (window.innerHeight) {
            const halfHeight = Math.round(window.innerHeight * 0.5);
            if (halfHeight > 0) return `${halfHeight}px`;
        }
        const height = reasoningWrapper.getBoundingClientRect().height || reasoningWrapper.scrollHeight;
        return `${height || 120}px`;
    }

    function ensureReasoningHeight() {
        if (!popup || !hasReasoning || !isShowReasoning) return;
        const reasoningWrapper = popup.querySelector("#coolauxv-reasoning-wrapper");
        if (!reasoningWrapper) return;
        if (reasoningWrapper.style.display === "none") return;
        const currentHeight = reasoningWrapper.getBoundingClientRect().height;
        if (currentHeight > 0) return;
        const targetHeight = resolveReasoningTargetHeight(reasoningWrapper);
        reasoningWrapper.style.height = "50%";
        reasoningWrapper.style.maxHeight = targetHeight;
        reasoningWrapper.dataset.lastHeight = "";
    }

    function setReasoningAnimatedVisibility(visible) {
        const reasoningWrapper = popup.querySelector("#coolauxv-reasoning-wrapper");
        if (!reasoningWrapper) return;
        const isCollapsed = reasoningWrapper.classList.contains("coolauxv-reasoning-collapsed");
        if (!isBasicAnimEnabled()) {
            reasoningWrapper.dataset.lastHeight = "";
            if (visible) {
                resetCollapsedBoxStyles(reasoningWrapper);
                if (reasoningWrapper.style.display !== "flex") {
                    reasoningWrapper.style.display = "flex";
                }
                reasoningWrapper.style.height = "50%";
                const targetHeight = resolveReasoningTargetHeight(reasoningWrapper);
                reasoningWrapper.style.maxHeight = targetHeight;
                reasoningWrapper.classList.remove("coolauxv-reasoning-collapsed");
                ensureReasoningHeight();
            } else {
                reasoningWrapper.classList.add("coolauxv-reasoning-collapsed");
                reasoningWrapper.style.maxHeight = "0px";
                applyCollapsedBoxStyles(reasoningWrapper);
                reasoningWrapper.style.display = "none";
            }
            return;
        }

        if (visible) {
            const currentHeight = reasoningWrapper.getBoundingClientRect().height;
            if (!isCollapsed && reasoningWrapper.style.display === "flex" && currentHeight > 0) return;
            resetCollapsedBoxStyles(reasoningWrapper);
            if (reasoningWrapper.style.display !== "flex") {
                reasoningWrapper.style.display = "flex";
            }
            let targetHeight = resolveReasoningTargetHeight(reasoningWrapper);
            if (parseFloat(targetHeight) <= 0) targetHeight = "120px";
            reasoningWrapper.style.height = "50%";
            reasoningWrapper.dataset.lastHeight = "";
            reasoningWrapper.style.maxHeight = "0px";
            reasoningWrapper.classList.add("coolauxv-reasoning-collapsed");
            requestAnimationFrame(() => {
                reasoningWrapper.style.maxHeight = targetHeight;
                reasoningWrapper.classList.remove("coolauxv-reasoning-collapsed");
                requestAnimationFrame(() => ensureReasoningHeight());
            });
            return;
        }

        reasoningWrapper.dataset.lastHeight = "";
        reasoningWrapper.classList.add("coolauxv-reasoning-collapsed");
        reasoningWrapper.style.maxHeight = "0px";
        const onEnd = (e) => {
            if (e.propertyName !== "max-height") return;
            if (reasoningWrapper.classList.contains("coolauxv-reasoning-collapsed")) {
                applyCollapsedBoxStyles(reasoningWrapper);
                reasoningWrapper.style.display = "none";
            }
            reasoningWrapper.removeEventListener("transitionend", onEnd);
        };
        reasoningWrapper.addEventListener("transitionend", onEnd);
    }
    const performMinimizeWindow = () => {
        popup.style.display = "none";
        floatBall.style.display = "block";
    };

    function minimizeWindow() {
        if (isPopupAnimating) return;
        const enableMinAnim = isMinimizeAnimEnabled();
        floatBall.style.display = "block";
        if (enableMinAnim) {
            animatePopupToFloatBall(() => {
                performMinimizeWindow();
            });
            return;
        }
        performMinimizeWindow();
    }

    const performCloseWindow = () => {
        popup.style.display = "none";

        // 1. 清空输入框文本
        const input = popup.querySelector("#coolauxv-input");
        if (input) input.value = "";
        const chatInput = popup.querySelector("#coolauxv-chat-input");
        if (chatInput) chatInput.value = "";

        // 2. 清空识屏数据
        capturedImageBase64 = "";
        chatCapturedImageBase64 = "";

        // 3. 隐藏预览按钮
        const btnPreview = popup.querySelector("#coolauxv-btn-preview");
        setAnimatedVisibility(btnPreview, false);
        const btnMainClear = popup.querySelector("#coolauxv-btn-clear-shot");
        setAnimatedVisibility(btnMainClear, false);
        const btnChatPreview = popup.querySelector("#coolauxv-btn-preview-chat");
        setAnimatedVisibility(btnChatPreview, false);
        const btnChatClear = popup.querySelector("#coolauxv-btn-clear-chat-shot");
        setAnimatedVisibility(btnChatClear, false);
        popup.querySelectorAll(".coolauxv-animated-visibility").forEach((el) => forceHideAnimatedElement(el));

        // 4. 清空输出区
        const resultDiv = popup.querySelector("#coolauxv-result");
        if (resultDiv) resultDiv.innerHTML = "";
        const reasoningDiv = popup.querySelector("#coolauxv-reasoning-box");
        if (reasoningDiv) reasoningDiv.innerHTML = "";

        // 5. 重置主页布局（与“译”悬浮球激活逻辑复用）
        resetMainViewLayoutBySettings();

        queueCurrentChatSessionToBackground();
        clearConversationState();

        // --- 悬浮球常驻逻辑 ---
        const isPersistent = GM_getValue("coolauxv_persistent_ball", false);
        if (isPersistent) {
            floatBall.style.display = "block";
        } else {
            floatBall.style.display = "none";
        }
    };

    function closeWindow() {
        if (isPopupAnimating) return;
        interruptActiveOutput({ discard: true });
        const enableMinAnim = isMinimizeAnimEnabled();
        if (enableMinAnim) {
            animatePopupSlideOutDown(() => {
                performCloseWindow();
            });
            return;
        }
        performCloseWindow();
    }

    const performQuit = () => {
        popup.style.display = "none";
        floatBall.style.display = "none";
        cursorBtn.style.display = "none";
        isQuitted = true;
    };

    function quitScript() {
        if (!confirm("确定要退出吗？")) return;
        if (isPopupAnimating) return;
        const enableMinAnim = isMinimizeAnimEnabled();
        if (enableMinAnim) {
            animatePopupScaleOut(() => {
                performQuit();
            });
            return;
        }
        performQuit();
    }

    function bindEvents() {
        const minBtn = popup.querySelector("#coolauxv-min");
        const closeBtn = popup.querySelector("#coolauxv-close");
        const quitBtn = popup.querySelector("#coolauxv-quit");
        const rawToggle = popup.querySelector("#coolauxv-raw-toggle");
        const reasoningToggle = popup.querySelector("#coolauxv-reasoning-toggle");
        const mainActionButtons = popup.querySelector("#coolauxv-main-action-buttons");
        const btnStop = popup.querySelector("#coolauxv-btn-stop");
        const btnChatHistory = popup.querySelector("#coolauxv-chat-history-btn");
        const btnChatSend = popup.querySelector("#coolauxv-btn-chat-send");
        const btnChatStop = popup.querySelector("#coolauxv-btn-chat-stop");
        const btnChatEditCancel = popup.querySelector("#coolauxv-btn-chat-edit-cancel");
        const btnScrollBottom = popup.querySelector("#coolauxv-btn-scroll-bottom");
        const btnMainImageFile = popup.querySelector("#coolauxv-btn-image-file");
        const inputMainImageFile = popup.querySelector("#coolauxv-input-image-file");
        const btnChatImageFile = popup.querySelector("#coolauxv-btn-chat-image-file");
        const inputChatImageFile = popup.querySelector("#coolauxv-input-chat-image-file");
        const chatInput = popup.querySelector("#coolauxv-chat-input");
        const resultScrollDiv = popup.querySelector("#coolauxv-result");

        if (minBtn) minBtn.onclick = minimizeWindow;
        if (closeBtn) closeBtn.onclick = closeWindow;
        if (quitBtn) quitBtn.onclick = quitScript;

        if (rawToggle) rawToggle.onchange = (e) => {
            isShowRaw = e.target.checked;
            lastRenderedText = ""; lastRenderedReasoning = "";
            renderContent();
        };

        if (reasoningToggle) reasoningToggle.onchange = (e) => {
            isShowReasoning = e.target.checked;
            renderContent();

            // 新增需求：非输出状态下，联动连续对话框的收起与展开
            if (!isRendering) {
                const chatBar = popup.querySelector("#coolauxv-chat-bar");
                // 仅当连续对话功能启用且显示时才执行
                if (chatBar && chatBar.style.display !== "none") {
                    if (isShowReasoning) {
                        // 展开推理 -> 收起连续对话
                        if (!isChatCollapsed) {
                            isChatCollapsed = true;
                            updateChatCollapseUI();
                        }
                    } else {
                        // 收起推理 -> 展开连续对话
                        if (isChatCollapsed) {
                            isChatCollapsed = false;
                            updateChatCollapseUI();
                        }
                    }
                }
            }
        };

        if (mainActionButtons) {
            mainActionButtons.addEventListener("click", (e) => {
                const btn = e.target.closest("[data-action-id]");
                if (!btn) return;
                const actionId = btn.dataset.actionId;
                if (!actionId) return;
                doAction(actionId);
            });
        }
        if (btnStop) btnStop.onclick = () => interruptActiveOutput();
        if (btnChatHistory) btnChatHistory.onclick = () => openChatHistoryManager();
        if (btnChatSend) btnChatSend.onclick = () => doChatSend();
        if (btnChatStop) btnChatStop.onclick = () => interruptActiveOutput();
        if (btnScrollBottom) btnScrollBottom.onclick = () => scrollResultToBottom(true);
        if (btnChatEditCancel) btnChatEditCancel.onclick = () => {
            exitChatEditMode();
        };
        if (resultScrollDiv) {
            resultScrollDiv.addEventListener("scroll", () => updateResultScrollBottomButton());
            updateResultScrollBottomButton();
        }
        if (btnMainImageFile && inputMainImageFile) {
            btnMainImageFile.onclick = () => {
                inputMainImageFile.value = "";
                inputMainImageFile.click();
            };
            inputMainImageFile.addEventListener("change", async () => {
                const file = inputMainImageFile.files && inputMainImageFile.files[0] ? inputMainImageFile.files[0] : null;
                if (!file) return;
                await loadMainImageFromFile(file);
            });
        }
        if (btnChatImageFile && inputChatImageFile) {
            btnChatImageFile.onclick = () => {
                inputChatImageFile.value = "";
                inputChatImageFile.click();
            };
            inputChatImageFile.addEventListener("change", async () => {
                const file = inputChatImageFile.files && inputChatImageFile.files[0] ? inputChatImageFile.files[0] : null;
                if (!file) return;
                await loadChatImageFromFile(file);
            });
        }
        if (chatInput) {
            chatInput.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                if (e.shiftKey) return;
                if (e.isComposing || e.keyCode === 229) return;
                const enterSendEnabled = GM_getValue("coolauxv_chat_enter_send", DEFAULT_CHAT_ENTER_SEND);
                if (!enterSendEnabled) return;
                e.preventDefault();
                doChatSend();
            });
            chatInput.addEventListener("paste", async (e) => {
                const clipboard = e.clipboardData;
                if (!clipboard || !clipboard.items) return;
                const items = Array.from(clipboard.items);
                const imageItem = items.find((item) => item && item.kind === "file" && String(item.type || "").startsWith("image/"));
                if (!imageItem) return;
                const file = imageItem.getAsFile();
                if (!file) return;
                e.preventDefault();
                await loadChatImageFromFile(file);
            });
        }
        updateChatEditModeUI();
        updateInterruptButtons();

        const resultDiv = popup.querySelector("#coolauxv-result");
        const previewOverlay = document.querySelector("#coolauxv-img-preview-overlay");
        const previewImg = document.querySelector("#coolauxv-img-preview-el");
        if (resultDiv && previewOverlay && previewImg) {
            const tryOpenMermaidPreviewFromEvent = (event, suppressNextOverlayClick) => {
                const target = event && event.target;
                if (!target || typeof target.closest !== "function") return false;
                const mermaidSvg = target.closest(".coolauxv-mermaid-rendered svg");
                if (!mermaidSvg) return false;
                openMermaidPreview(mermaidSvg, suppressNextOverlayClick);
                return true;
            };

            resultDiv.addEventListener("pointerdown", (e) => {
                if (e.button !== 0) return;
                if (tryOpenMermaidPreviewFromEvent(e, true)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }, { capture: true });

            resultDiv.addEventListener("click", (e) => {
                if (tryOpenMermaidPreviewFromEvent(e, false)) {
                    e.preventDefault();
                    return;
                }
                const toggleBtn = e.target.closest("[data-action=\"toggle-error-detail\"]");
                if (toggleBtn) {
                    const container = toggleBtn.closest(".coolauxv-error-detail");
                    const detailBody = container ? container.querySelector(".coolauxv-error-detail-body") : null;
                    if (!detailBody) return;
                    const shouldExpand = detailBody.classList.contains("coolauxv-collapsed");
                    setCollapseAnimatedVisibility(detailBody, shouldExpand);
                    toggleBtn.textContent = shouldExpand ? "收起原始错误信息" : "查看原始错误信息";
                    return;
                }
                const refreshBtn = e.target.closest(".coolauxv-chat-refresh-btn");
                if (refreshBtn) {
                    const turnId = refreshBtn.dataset.chatTurnId || "";
                    regenerateChatTurn(turnId);
                    return;
                }
                const editBtn = e.target.closest(".coolauxv-chat-edit-btn");
                if (editBtn) {
                    const recordId = editBtn.dataset.chatRecordId || "";
                    if (recordId) {
                        enterChatEditMode(recordId);
                    } else {
                        const turnId = editBtn.dataset.chatTurnId || "";
                        const fallbackRecord = chatHistoryRecords.find((record) => record.role === "user" && record.turnId === turnId);
                        if (fallbackRecord) enterChatEditMode(ensureChatRecordId(fallbackRecord));
                    }
                    return;
                }
                const deleteBtn = e.target.closest(".coolauxv-chat-delete-btn");
                if (deleteBtn) {
                    const recordId = deleteBtn.dataset.chatRecordId || "";
                    deleteChatRecord(recordId);
                    return;
                }
                const stripMediaBtn = e.target.closest(".coolauxv-chat-strip-media-btn");
                if (stripMediaBtn) {
                    const recordId = stripMediaBtn.dataset.chatRecordId || "";
                    stripChatRecordMedia(recordId);
                    return;
                }
                const btn = e.target.closest(".coolauxv-chat-preview-btn");
                if (!btn) return;
                const imgId = btn.dataset.chatImgId;
                const imgSrc = chatImageStore[imgId];
                if (imgSrc) {
                    previewImg.src = imgSrc;
                    previewOverlay.style.display = "flex";
                }
            });
        }

        const checkActive = () => !isQuitted && !isWindowDragging && !isSplitterDragging && !isPopupAnimating;

        const unifiedHandler = (e) => {
            if (!checkActive()) return;

            // 排除与插件窗口自身的交互
            // 注意：selectionchange 事件通常没有具体的 target 或 target 为 document，所以跳过检查
            if (e.type !== 'selectionchange' && e.target && (popup.contains(e.target) || cursorBtn.contains(e.target))) {
                return;
            }

            // 防抖处理：清除之前的定时器，重新计时
            if (selectionTimer) clearTimeout(selectionTimer);

            selectionTimer = setTimeout(() => {
                if (!isQuitted) updateIconPosition();
            }, 300); // 300ms 延时，确保移动端选区UI渲染完成
        };

        // 监听所有可能导致选区变化或交互结束的事件
        const eventTypes = [
            'mouseup',       // 鼠标松开
            'touchend',      // 触摸结束
            'touchcancel',   // 触摸取消（意外中断）
            'pointerup',     // 指针设备松开（兼容性更好）
            'keyup',         // 键盘按键松开（如 Shift+方向键选文）
            'selectionchange', // 标准选区改变事件
            'contextmenu',   // 右键/长按菜单（关键：移动端长按常触发此事件）
            'click'          // 点击（用于处理点击空白处取消选区的情况）Our
        ];

        eventTypes.forEach(evt => {
            document.addEventListener(evt, unifiedHandler);
        });

        window.addEventListener("scroll", () => { if (cursorBtn.style.display === 'flex') cursorBtn.style.display = 'none'; });
        // --- 标签页激活时同步悬浮球状态 ---
        document.addEventListener("visibilitychange", () => {
            // 当标签页变为可见时
            if (!document.hidden && !isQuitted) {
                const isPersistent = GM_getValue("coolauxv_persistent_ball", false);
                const isPopupVisible = popup.style.display === "flex";

                // 只有当主窗口没打开时，才根据设置决定悬浮球是否显示
                // 如果主窗口开着，悬浮球本就该隐藏，不用管
                if (!isPopupVisible) {
                    floatBall.style.display = isPersistent ? "block" : "none";
                }
            }
        });
    }

    function bindInputCtrlEvents() {
        const btnClear = popup.querySelector("#coolauxv-btn-input-clear");
        const btnPaste = popup.querySelector("#coolauxv-btn-input-paste");
        const input = popup.querySelector("#coolauxv-input");

        if (btnClear) {
            btnClear.onclick = () => {
                input.value = "";
                input.focus();
            };
        }

        if (btnPaste) {
            btnPaste.onclick = async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        input.value = text;
                        input.focus();
                    }
                } catch (e) {
                    alert("无法读取剪贴板，请检查浏览器权限或手动粘贴。");
                }
            };
        }

        if (input) {
            input.addEventListener("paste", async (e) => {
                const clipboard = e.clipboardData;
                if (!clipboard || !clipboard.items) return;
                const items = Array.from(clipboard.items);
                const imageItem = items.find((item) => item && item.kind === "file" && String(item.type || "").startsWith("image/"));
                if (!imageItem) return;
                const file = imageItem.getAsFile();
                if (!file) return;
                e.preventDefault();
                await loadMainImageFromFile(file);
            });
        }
    }

    function bindCopyEvents() {
        const copyBtns = popup.querySelectorAll(".coolauxv-copy-btn");
        const clearBtn = popup.querySelector("#coolauxv-clear-result");
        if (clearBtn) {
            clearBtn.onclick = () => {
                streamTextBuffer = "";
                lastRenderedText = "";
                const resultDiv = popup.querySelector("#coolauxv-result");
                if (resultDiv) resultDiv.innerHTML = "";
            };
        }
        copyBtns.forEach(btn => {
            if (!btn.dataset.type) return;
            btn.onclick = async () => {
                const type = btn.dataset.type;
                let textToCopy = "";
                if (type === "reasoning") textToCopy = streamReasoningBuffer;
                else if (type === "result") textToCopy = streamTextBuffer;

                if (!textToCopy) return;

                try {
                    if (typeof GM_setClipboard !== 'undefined') {
                        GM_setClipboard(textToCopy, "text");
                    } else {
                        await navigator.clipboard.writeText(textToCopy);
                    }

                    const originalText = btn.innerText;
                    btn.innerText = "✅";
                    setTimeout(() => { btn.innerText = originalText; }, 1500);
                } catch (e) {
                    Logger.error("复制失败", e);
                    btn.innerText = "❌";
                    setTimeout(() => { btn.innerText = "📋"; }, 1500);
                }
            };
        });
    }

    function updateIconPosition() {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        const input = popup.querySelector("#coolauxv-input");

        if (document.activeElement && document.activeElement === input) {
            cursorBtn.style.display = "none";
            return;
        }

        if (text === lastSelectionText && isIconDismissed) {
            cursorBtn.style.display = "none";
            return;
        }

        if (text !== lastSelectionText) {
            isIconDismissed = false;
        }

        if (!text) {
            cursorBtn.style.display = "none";
            return;
        }

        const anchor = selection.anchorNode;
        if (anchor) {
            const validNode = anchor.nodeType === 3 ? anchor.parentNode : anchor;
            if (popup.contains(validNode) || cursorBtn.contains(validNode)) {
                return;
            }
        }

        currentSelection = text;
        lastSelectionText = text;

        try {
            if (selection.rangeCount === 0) return;
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            if (rect.width === 0 && rect.height === 0) return;

            let top = window.scrollY + rect.bottom + 12;
            let left = window.scrollX + rect.right - 20;

            if (left > window.innerWidth - 60) left = window.innerWidth - 60;
            if (left < 10) left = 10;

            cursorBtn.style.top = `${top}px`;
            cursorBtn.style.left = `${left}px`;
            cursorBtn.style.display = "flex";
        } catch (e) { }
    }

    function initDragAndResize() {
        const header = popup.querySelector("#coolauxv-header");
        const resizeHandle = popup.querySelector("#coolauxv-resize-handle");

        if (!header || !resizeHandle) return;

        let dragStartX, dragStartY;
        const startDrag = (clientX, clientY) => {
            isWindowDragging = true;
            if (popup.style.transform) { const rect = popup.getBoundingClientRect(); popup.style.transform = "none"; popup.style.left = rect.left + "px"; popup.style.top = rect.top + "px"; }
            dragStartX = clientX - popup.offsetLeft; dragStartY = clientY - popup.offsetTop;
        };
        header.addEventListener("mousedown", (e) => { if (!e.target.closest('.coolauxv-ctrl-btn') && !e.target.closest('label') && !e.target.closest('[data-no-drag=\"true\"]')) startDrag(e.clientX, e.clientY); });
        header.addEventListener("touchstart", (e) => { if (!e.target.closest('.coolauxv-ctrl-btn') && !e.target.closest('label') && !e.target.closest('[data-no-drag=\"true\"]')) { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); } });

        let isResizing = false; let resizeStartX, resizeStartY, startWidth, startHeight;
        const startResize = (clientX, clientY) => { isResizing = true; isWindowDragging = true; resizeStartX = clientX; resizeStartY = clientY; startWidth = popup.offsetWidth; startHeight = popup.offsetHeight; };
        resizeHandle.addEventListener("mousedown", (e) => { e.stopPropagation(); e.preventDefault(); startResize(e.clientX, e.clientY); });
        resizeHandle.addEventListener("touchstart", (e) => { e.stopPropagation(); e.preventDefault(); startResize(e.touches[0].clientX, e.touches[0].clientY); });

        const onMove = (clientX, clientY) => {
            if (isWindowDragging && !isResizing) {
                let newLeft = clientX - dragStartX;
                let newTop = clientY - dragStartY;

                if (newTop < 0) newTop = 0;

                if (newTop > window.innerHeight - 30) newTop = window.innerHeight - 30;
                if (newLeft < 30 - popup.offsetWidth) newLeft = 30 - popup.offsetWidth;
                if (newLeft > window.innerWidth - 30) newLeft = window.innerWidth - 30;

                popup.style.left = newLeft + "px";
                popup.style.top = newTop + "px";
            }
            if (isResizing) {
                popup.style.width = (startWidth + (clientX - resizeStartX)) + "px";
                popup.style.height = (startHeight + (clientY - resizeStartY)) + "px";
            }
        };
        const onEnd = () => { setTimeout(() => { isWindowDragging = false; isResizing = false; }, 50); };
        document.addEventListener("mousemove", (e) => { if (isWindowDragging || isResizing) { e.preventDefault(); onMove(e.clientX, e.clientY); } });
        document.addEventListener("mouseup", onEnd);
        document.addEventListener("touchmove", (e) => { if (isWindowDragging || isResizing) { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
        document.addEventListener("touchend", onEnd);
    }

    function initSplitter() {
        const separator = popup.querySelector("#coolauxv-separator");
        const reasoningWrapper = popup.querySelector("#coolauxv-reasoning-wrapper");
        const container = popup.querySelector("#coolauxv-content-container"); // 获取父容器用于计算动态高度

        if (!separator || !reasoningWrapper || !container) return;

        let startY, startHeight;

        const onSplitterDown = (clientY) => {
            isSplitterDragging = true;
            startY = clientY;
            startHeight = reasoningWrapper.offsetHeight;
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none'; // 防止拖拽时选中文字
        };

        const onSplitterMove = (clientY) => {
            if (!isSplitterDragging) return;

            // 动态计算高度限制
            const containerHeight = container.clientHeight;
            const separatorHeight = separator.offsetHeight;

            let newHeight = startHeight + (clientY - startY);

            // 限制范围：
            // 最小：0 (允许完全收起至顶部)
            // 最大：容器高度 - 分隔条高度 (允许完全拉到底部)
            const maxLimit = containerHeight - separatorHeight;

            newHeight = Math.max(0, Math.min(maxLimit, newHeight));

            reasoningWrapper.style.height = newHeight + "px";
            if (!reasoningWrapper.classList.contains("coolauxv-reasoning-collapsed")) {
                reasoningWrapper.style.maxHeight = `${newHeight}px`;
            }
        };

        const onSplitterUp = () => {
            if (isSplitterDragging) {
                isSplitterDragging = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };

        separator.addEventListener("mousedown", (e) => { e.preventDefault(); onSplitterDown(e.clientY); });
        separator.addEventListener("touchstart", (e) => { e.preventDefault(); onSplitterDown(e.touches[0].clientY); });
        document.addEventListener("mousemove", (e) => { if (isSplitterDragging) { e.preventDefault(); onSplitterMove(e.clientY); } });
        document.addEventListener("touchmove", (e) => { if (isSplitterDragging) { e.preventDefault(); onSplitterMove(e.touches[0].clientY); } });
        document.addEventListener("mouseup", onSplitterUp);
        document.addEventListener("touchend", onSplitterUp);
    }

    // ============================
    // 通用弹窗组件 (H1标题 + 完整 Markdown 层级支持)
    // ============================
    function showModal(title, content) {
        if (!title && !content) {
            Logger.warn("[CoolAuxv] showModal: Title and content cannot both be empty.");
            return;
        }

        const existing = document.getElementById("coolauxv-modal-overlay");
        if (existing) document.body.removeChild(existing);

        const overlay = document.createElement("div");
        overlay.id = "coolauxv-modal-overlay";
        Object.assign(overlay.style, {
            position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
            background: "rgba(0, 0, 0, 0.5)", zIndex: "2147483660",
            display: "flex", justifyContent: "center", alignItems: "center",
            backdropFilter: "blur(4px)", opacity: "0", transition: "opacity 0.3s"
        });

        // --- 内容处理 ---
        let renderedBody = "";
        if (content) {
            let str = String(content);
            // 智能去缩进
            const lines = str.split('\n');
            while (lines.length && !lines[0].trim()) lines.shift();
            while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
            if (lines.length > 0) {
                const minIndent = lines.reduce((min, line) => {
                    if (!line.trim()) return min;
                    const indent = line.match(/^\s*/)[0].length;
                    return indent < min ? indent : min;
                }, Infinity);
                if (minIndent !== Infinity && minIndent > 0) {
                    str = lines.map(line => line.length >= minIndent ? line.slice(minIndent) : line).join('\n');
                } else {
                    str = lines.join('\n');
                }
            }

            // Markdown 渲染
            if (typeof marked !== 'undefined') {
                try {
                    renderedBody = marked.parse(str, { gfm: true, breaks: true });
                } catch (e) {
                    const escapeHTML = (s) => s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
                    renderedBody = `<div style="white-space: pre-wrap; word-break: break-word;">${escapeHTML(str)}</div>`;
                }
            } else {
                const escapeHTML = (s) => s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
                renderedBody = `<div style="white-space: pre-wrap; word-break: break-word;">${escapeHTML(str)}</div>`;
            }
        }

        // --- 构建 DOM ---
        // 使用 flex 布局确保长内容可滚动
        // 注入局部 <style> 确保 Markdown 标题 (h1-h6) 样式正确
        let innerHTML = `
            <div id="coolauxv-modal-box" style="user-select: none; background: white; width: 450px; max-width: 90%; max-height: 85vh; display: flex; flex-direction: column; padding: 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); transform: scale(0.9); transition: transform 0.3s; text-align: left !important; color:#333;">
                <style>
                    /* 局部样式：确保弹窗内 Markdown 标题层级分明，不被全局样式重置 */
                    .coolauxv-markdown-body h1 { font-size: 1.6em; margin: 0.6em 0 0.4em 0; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; font-weight: bold; }
                    .coolauxv-markdown-body h2 { font-size: 1.4em; margin: 0.8em 0 0.4em 0; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; font-weight: bold; }
                    .coolauxv-markdown-body h3 { font-size: 1.25em; margin: 0.8em 0 0.4em 0; font-weight: bold; }
                    .coolauxv-markdown-body h4 { font-size: 1.1em; margin: 0.8em 0 0.4em 0; font-weight: bold; }
                    .coolauxv-markdown-body h5 { font-size: 1em; margin: 1em 0 0.2em 0; font-weight: bold; color: #555; }
                    .coolauxv-markdown-body h6 { font-size: 0.9em; margin: 1em 0 0.2em 0; font-weight: bold; color: #777; }
                    .coolauxv-markdown-body p { margin: 0.5em 0; line-height: 1.6; }
                    .coolauxv-markdown-body ul, .coolauxv-markdown-body ol { padding-left: 20px; margin: 0.5em 0; }
                    .coolauxv-markdown-body li { margin: 0.3em 0; }
                    .coolauxv-markdown-body code { background: #f0f0f0; padding: 2px 4px; border-radius: 4px; font-family: monospace; color: #c0392b; }
                </style>
        `;

        if (title) {
            // 弹窗主标题：使用 H1，字号加大
            innerHTML += `<h1 style="margin:0 0 10px 0; font-size: 22px; color:#a516e8; border-bottom:1px solid #eee; padding-bottom:10px; flex-shrink: 0; line-height: 1.3;">${title}</h1>`;
        }

        if (renderedBody) {
            // 内容区域：支持滚动，字号适中
            innerHTML += `<div class="coolauxv-markdown-body" style="font-size:14px; color:#444; overflow-y: auto; flex: 1; padding-right: 5px;">${renderedBody}</div>`;
        }

        innerHTML += `<button id="coolauxv-modal-close" style="background: #a516e8; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 15px; width: 100%; flex-shrink: 0;">确定</button>`;
        innerHTML += `</div>`;

        overlay.innerHTML = innerHTML;
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.style.opacity = "1";
            const box = overlay.querySelector("#coolauxv-modal-box");
            if (box) box.style.transform = "scale(1)";
        }, 10);

        const closeModal = () => {
            overlay.style.opacity = "0";
            setTimeout(() => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 300);
        };

        const closeBtn = document.getElementById("coolauxv-modal-close");
        if (closeBtn) closeBtn.onclick = closeModal;
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
    }

    // 版本检测与日志弹窗逻辑 (使用通用弹窗)
    function checkUpdateAndShowChangelog() {
        const currentVer = getScriptVersion();
        const lastVer = GM_getValue("coolauxv_installed_version", "0.0");

        if (currentVer && currentVer !== lastVer) {
            showModal(`🎉 更新日志 ${currentVer}`, LATEST_CHANGELOG);
            GM_setValue("coolauxv_installed_version", currentVer);
        }
    }

    // ========================================================================
    // 网络引擎 (Stream)
    // ========================================================================
    async function doAction(actionId) {
        const input = popup.querySelector("#coolauxv-input");
        if (!input) return;
        const actionTemplate = getActionTemplateById(actionId);
        const resolvedActionId = actionTemplate ? actionTemplate.id : resolveActionTemplateId(actionId, getActionTemplates());

        // 检查是否有截图缓存
        if (capturedImageBase64) {
            doImageAnalysis(resolvedActionId);
            return;
        }

        if (historyRecords.length || chatSessionStarted || chatDisplayBuffer) {
            clearConversationState();
        }

        const text = input.value.trim();
        const resultDiv = popup.querySelector("#coolauxv-result");
        const config = getActiveConfig();
        const provider = config.provider;
        const providerTemplate = config.template;
        streamMode = "single";

        if (isMissingProviderConfig(providerTemplate)) {
            if (!shouldSuppressResultError()) {
                showNoKeyError(popup.querySelector("#coolauxv-result"), provider);
            }
            return;
        }

        if (!text) {
            if (resultDiv && !shouldSuppressResultError()) {
                resultDiv.innerHTML = "<span style='color:#e65100; font-weight:bold;'>⚠️ 请不要操作空文本...</span>";
            }
            return;
        }

        collapseChatIfEnabled();
        const actionToken = ++activeActionToken;

        const reasoningDiv = popup.querySelector("#coolauxv-reasoning-box");
        const reasoningWrapper = popup.querySelector("#coolauxv-reasoning-wrapper");
        const reasoningToggle = popup.querySelector("#coolauxv-reasoning-toggle-container");

        streamTextBuffer = ""; streamReasoningBuffer = ""; lastRenderedText = ""; lastRenderedReasoning = ""; hasReasoning = false;
        resetStreamParsingState();
        resultDiv.innerHTML = "<span style='color:#888'>⏳ AI 思考中...</span>";
        reasoningDiv.innerHTML = ""; reasoningWrapper.style.display = "none"; reasoningToggle.style.display = "none";

        if (abortController) abortController.abort();
        if (gmRequest && gmRequest.abort) gmRequest.abort();

        const url = buildProviderUrl(providerTemplate);
        const systemPrompt = actionTemplate
            ? actionTemplate.systemPrompt
            : (resolvedActionId === "explain" ? config.promptExplain : config.promptTrans);
        const historyEntry = {
            systemPrompt: systemPrompt,
            userContentText: text,
            userDisplayText: text,
            imageBase64: "",
            assistantText: "",
            provider: provider,
            model: config.modelName
        };

        const payload = buildTextPayload(providerTemplate, config.modelName, systemPrompt, text);

        // 序列化并打印请求体 (JSON)
        const requestBody = JSON.stringify(payload);
        Logger.debug(`🚀 [${provider} Request Data]`, requestBody);

        const headers = buildProviderHeaders(providerTemplate, { apiKey: config.apiKey });
        const shouldForceGmXhr = shouldForceGMRequestForUrl(url);

        // 策略 A: Fetch
        if (!shouldForceGmXhr) {
            try {
                Logger.info(`Fetch ${provider} Model: ${config.modelName}`);
                abortController = new AbortController();
                const response = await fetch(url, {
                    method: "POST",
                    headers: headers,
                    body: requestBody, // 使用已序列化的字符串
                    signal: abortController.signal
                });

                if (!response.ok) {
                    if (response.status === 429) {
                        let apiErr = null;
                        try {
                            const errJson = await response.json();
                            logAiRawResponse(provider, config.modelName, resolvedActionId, errJson);
                            apiErr = parseApiError(errJson);
                        } catch (e) { }
                        if (!shouldSuppressResultError()) {
                            resultDiv.innerHTML = (apiErr && isQuotaError(apiErr))
                                ? getQuotaErrorHTML(provider, apiErr.message)
                                : get429ErrorHTML();
                        }
                        autoExpandChatIfEnabled(actionToken);
                        return;
                    }
                    let rawText = "";
                    try {
                        rawText = await response.text();
                    } catch (e) { }
                    logAiRawResponse(provider, config.modelName, resolvedActionId, rawText);
                    if (response.status === 401 || response.status === 403) throw new Error("AUTH_INVALID");
                    throw new Error(`HTTP ${response.status}`);
                }

                startRenderLoop();

                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let buffer = "";
                let rawText = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    rawText += chunk;
                    buffer += chunk;
                    const lines = buffer.split(/\r?\n/);
                    buffer = lines.pop();
                    for (const line of lines) processStreamLine(providerTemplate, line);
                }
                if (ignoreIncomingOutput) {
                    stopRenderLoop();
                    return;
                }
                if (buffer && buffer.trim()) {
                    processStreamLine(providerTemplate, buffer);
                }
                flushReasoningTagRemainderToBuffers(false);
                if (!streamTextBuffer.trim() && !streamReasoningBuffer.trim()) {
                    const fallback = extractNonStreamResult(providerTemplate, rawText);
                    if (fallback && fallback.error) {
                        stopRenderLoop();
                        if (!shouldSuppressResultError()) {
                            resultDiv.innerHTML = buildApiErrorHtml(provider, fallback.error);
                        }
                        autoExpandChatIfEnabled(actionToken);
                        return;
                    }
                    if (fallback && fallback.text) {
                        applyFallbackTextWithReasoningTag(providerTemplate, fallback.text, false);
                        renderContent();
                    }
                }
                stopRenderLoop();
                historyEntry.assistantText = streamTextBuffer;
                logAiResponse(provider, config.modelName, resolvedActionId, streamTextBuffer);
                recordHistoryEntry(historyEntry);
                autoExpandChatIfEnabled(actionToken);
                return;

            } catch (err) {
                Logger.warn("Fetch 失败/跨域，准备降级。", err);
                if (err.message === "AUTH_INVALID") {
                    if (!shouldSuppressResultError()) {
                        showInvalidKeyError(resultDiv, provider);
                    }
                    autoExpandChatIfEnabled(actionToken);
                    return;
                }
                if (err.name === 'AbortError') return;
            }
        } else {
            Logger.info("检测到 HTTPS 页面调用 HTTP Provider，跳过 Fetch，直接使用 GM_xmlhttpRequest。");
        }

        // 策略 B: GM_xmlhttpRequest
        Logger.info(`GM_xmlhttpRequest ${provider} Model: ${config.modelName}`);
        Logger.debug("GM request context (single action)", buildRequestDebugMeta(url, {
            provider: provider,
            model: config.modelName,
            actionId: resolvedActionId
        }));

        let gmStreamBuffer = "";
        let gmRawText = "";
        let isStreamModeActive = false;
        const isMixedProtocolRequest = shouldForceGMRequestForUrl(url);
        const gmRequestAttempts = isMixedProtocolRequest
            ? [
                { streamMode: "progress", fetchMode: false, label: "onprogress-xhr" },
                { streamMode: "progress", fetchMode: true, label: "onprogress-fetch" },
                { streamMode: "stream", fetchMode: true, label: "stream-fetch" }
            ]
            : [
                { streamMode: "stream", fetchMode: true, label: "stream-fetch" },
                { streamMode: "progress", fetchMode: false, label: "onprogress-xhr" }
            ];
        let gmAttemptIndex = 0;
        let gmProgressOffset = 0;

        const flushSingleActionStreamChunk = (chunkText) => {
            if (!chunkText) return;
            gmRawText += chunkText;
            gmStreamBuffer += chunkText;
            const lines = gmStreamBuffer.split(/\r?\n/);
            gmStreamBuffer = lines.pop();
            for (const line of lines) processStreamLine(providerTemplate, line);
        };

        const finalizeSingleActionStream = () => {
            if (ignoreIncomingOutput) {
                stopRenderLoop();
                return;
            }
            if (gmStreamBuffer && gmStreamBuffer.trim()) {
                processStreamLine(providerTemplate, gmStreamBuffer);
            }
            flushReasoningTagRemainderToBuffers(false);
            if (!streamTextBuffer.trim() && !streamReasoningBuffer.trim()) {
                const fallback = extractNonStreamResult(providerTemplate, gmRawText);
                if (fallback && fallback.error) {
                    handleApiError(provider, fallback.error);
                    return;
                }
                if (fallback && fallback.text) {
                    applyFallbackTextWithReasoningTag(providerTemplate, fallback.text, false);
                    renderContent();
                }
            }
            stopRenderLoop();
            historyEntry.assistantText = streamTextBuffer;
            logAiResponse(provider, config.modelName, resolvedActionId, streamTextBuffer);
            recordHistoryEntry(historyEntry);
            autoExpandChatIfEnabled(actionToken);
        };

        const getCurrentSingleActionAttempt = () => gmRequestAttempts[Math.min(gmAttemptIndex, gmRequestAttempts.length - 1)];

        const canRetrySingleActionGmRequest = () => {
            if (gmAttemptIndex >= gmRequestAttempts.length - 1) return false;
            if (streamTextBuffer.length > 0 || streamReasoningBuffer.length > 0) return false;
            if (gmRawText.trim()) return false;
            return true;
        };

        const retrySingleActionGmRequest = (reasonLabel, err) => {
            if (!canRetrySingleActionGmRequest()) return false;
            const currentAttempt = getCurrentSingleActionAttempt();
            gmAttemptIndex += 1;
            const nextAttempt = getCurrentSingleActionAttempt();
            gmProgressOffset = 0;
            gmStreamBuffer = "";
            gmRawText = "";
            isStreamModeActive = false;
            Logger.warn(
                `GM ${reasonLabel}，切换重试策略（single action）：${currentAttempt.label} -> ${nextAttempt.label}`,
                err ? buildErrorDebugInfo(err) : {}
            );
            startSingleActionGmRequest();
            return true;
        };

        const startSingleActionGmRequest = () => {
            const currentAttempt = getCurrentSingleActionAttempt();
            const currentUseProgressStreamMode = currentAttempt.streamMode === "progress";
            Logger.info(`GM 请求尝试 ${gmAttemptIndex + 1}/${gmRequestAttempts.length}（single action）：${currentAttempt.label}`);
            if (currentUseProgressStreamMode && isMixedProtocolRequest) {
                Logger.info("使用 GM onprogress 流式模式（兼容 HTTPS 页面 -> HTTP Provider）。");
            }
            const requestOptions = {
                method: "POST", url: url,
                headers: headers,
                data: requestBody, // 使用已序列化的字符串
                responseType: currentUseProgressStreamMode ? "" : "stream",
                timeout: 600000,

                onloadstart: (res) => {
                    Logger.debug("GM onloadstart (single action)", {
                        status: res && res.status,
                        statusText: res && res.statusText,
                        finalUrl: res && res.finalUrl,
                        hasStreamReader: !!(res && res.response && res.response.getReader),
                        mode: currentAttempt.label
                    });
                    if (currentUseProgressStreamMode) {
                        isStreamModeActive = true;
                        startRenderLoop();
                        return;
                    }
                    if (res.response && res.response.getReader) {
                        isStreamModeActive = true;
                        startRenderLoop();

                        const reader = res.response.getReader();
                        const decoder = new TextDecoder("utf-8");

                        (async function readStream() {
                            try {
                                while (true) {
                                    const { done, value } = await reader.read();
                                    if (done) break;
                                    const chunk = decoder.decode(value, { stream: true });
                                    flushSingleActionStreamChunk(chunk);
                                }
                            } catch (e) {
                                Logger.error("Stream Read Error:", e);
                            } finally {
                                finalizeSingleActionStream();
                            }
                        })();
                    }
                },

                onprogress: (res) => {
                    if (!currentUseProgressStreamMode || ignoreIncomingOutput) return;
                    const text = res && typeof res.responseText === "string" ? res.responseText : "";
                    if (!text) return;
                    if (text.length < gmProgressOffset) {
                        gmProgressOffset = 0;
                    }
                    const chunk = text.slice(gmProgressOffset);
                    gmProgressOffset = text.length;
                    flushSingleActionStreamChunk(chunk);
                },

                onload: (res) => {
                    if (ignoreIncomingOutput) return;
                    Logger.debug("GM onload (single action)", {
                        status: res && res.status,
                        statusText: res && res.statusText,
                        finalUrl: res && res.finalUrl,
                        responseTextLength: res && typeof res.responseText === "string" ? res.responseText.length : 0,
                        streamed: isStreamModeActive,
                        mode: currentAttempt.label
                    });
                    if (currentUseProgressStreamMode) {
                        const fullText = res && typeof res.responseText === "string" ? res.responseText : "";
                        if (fullText.length > gmProgressOffset) {
                            flushSingleActionStreamChunk(fullText.slice(gmProgressOffset));
                            gmProgressOffset = fullText.length;
                        }
                        if (res.status && res.status !== 200) {
                            stopRenderLoop();
                            const apiErr = parseApiError(fullText);
                            const err = apiErr || { type: "http_error", message: `HTTP ${res.status}`, raw: fullText, rawText: fullText };
                            if (!shouldSuppressResultError()) {
                                resultDiv.innerHTML = buildApiErrorHtml(provider, err);
                            }
                            autoExpandChatIfEnabled(actionToken);
                            return;
                        }
                        finalizeSingleActionStream();
                        return;
                    }
                    if (!isStreamModeActive) {
                        stopRenderLoop();

                        if (res.status === 429) {
                            const resultDiv = popup.querySelector("#coolauxv-result");
                            logAiRawResponse(provider, config.modelName, resolvedActionId, res.responseText);
                            const apiErr = parseApiError(res.responseText);
                            if (resultDiv && !shouldSuppressResultError()) {
                                resultDiv.innerHTML = (apiErr && isQuotaError(apiErr))
                                    ? getQuotaErrorHTML(provider, apiErr.message)
                                    : get429ErrorHTML();
                            }
                            autoExpandChatIfEnabled(actionToken);
                            return;
                        }

                        const fullText = res.responseText || (typeof res.response === 'string' ? res.response : "");
                        logAiRawResponse(provider, config.modelName, resolvedActionId, fullText);

                        if (res.status === 401 || res.status === 403) {
                            if (!shouldSuppressResultError()) {
                                showInvalidKeyError(resultDiv, provider);
                            }
                            autoExpandChatIfEnabled(actionToken);
                            return;
                        }

                        if (res.status !== 200) {
                            const apiErr = parseApiError(fullText);
                            const err = apiErr || { type: "http_error", message: `HTTP ${res.status}`, raw: fullText, rawText: fullText };
                            if (!shouldSuppressResultError()) {
                                resultDiv.innerHTML = buildApiErrorHtml(provider, err);
                            }
                            autoExpandChatIfEnabled(actionToken);
                            return;
                        }
                        if (fullText) {
                            const lines = fullText.split(/\r?\n/);
                            for (const line of lines) processStreamLine(providerTemplate, line);
                            flushReasoningTagRemainderToBuffers(false);
                            if (!streamTextBuffer.trim() && !streamReasoningBuffer.trim()) {
                                const fallback = extractNonStreamResult(providerTemplate, fullText);
                                if (fallback && fallback.error) {
                                    if (!shouldSuppressResultError()) {
                                        resultDiv.innerHTML = buildApiErrorHtml(provider, fallback.error);
                                    }
                                    autoExpandChatIfEnabled(actionToken);
                                    return;
                                }
                                if (fallback && fallback.text) {
                                    applyFallbackTextWithReasoningTag(providerTemplate, fallback.text, false);
                                }
                            }
                            renderContent();
                            historyEntry.assistantText = streamTextBuffer;
                            logAiResponse(provider, config.modelName, resolvedActionId, streamTextBuffer);
                            recordHistoryEntry(historyEntry);
                            autoExpandChatIfEnabled(actionToken);
                        } else {
                            resultDiv.innerHTML += "<br><small style='color:red'>(流式兼容失败，请检查网络)</small>";
                            autoExpandChatIfEnabled(actionToken);
                        }
                    }
                },

                onerror: (e) => {
                    if (ignoreIncomingOutput) return;
                    Logger.error("GM onerror (single action)", buildErrorDebugInfo(e));
                    if (retrySingleActionGmRequest("onerror", e)) return;
                    stopRenderLoop();
                    if (streamTextBuffer.length > 0 || streamReasoningBuffer.length > 0) {
                        resultDiv.innerHTML += "<br><br><span style='color:red; font-size:12px; font-weight:bold;'>[网络连接中断，但已保留现有内容]</span>";
                    } else {
                        resultDiv.innerHTML = buildNetworkFailureHtml(provider, url, e);
                    }
                    autoExpandChatIfEnabled(actionToken);
                },

                ontimeout: () => {
                    if (ignoreIncomingOutput) return;
                    Logger.error("GM ontimeout (single action)", buildRequestDebugMeta(url, {
                        provider: provider,
                        model: config.modelName,
                        actionId: resolvedActionId,
                        mode: currentAttempt.label
                    }));
                    if (retrySingleActionGmRequest("ontimeout", { status: 408, statusText: "timeout" })) return;
                    stopRenderLoop();
                    if (streamTextBuffer.length > 0) {
                        resultDiv.innerHTML += "<br><span style='color:red'>[请求超时，已保留内容]</span>";
                    } else {
                        resultDiv.innerHTML = "<span style='color:red'>请求超时 (Timeout)</span>";
                    }
                    autoExpandChatIfEnabled(actionToken);
                }
            };
            if (typeof currentAttempt.fetchMode === "boolean") {
                requestOptions.fetch = currentAttempt.fetchMode;
            }
            gmRequest = GM_xmlhttpRequest(requestOptions);
        };

        startSingleActionGmRequest();
    }


    // 控制推理框的 展开(true) / 收起(false)
    function setReasoningVisibility(visible) {
        // 如果当前状态已经是目标状态，则忽略（避免重复渲染）
        if (isShowReasoning === visible) return;

        isShowReasoning = visible;

        // 同步 UI 上复选框的勾选状态
        const toggle = popup.querySelector("#coolauxv-reasoning-toggle");
        if (toggle) toggle.checked = visible;

        // 立即触发渲染，更新 DOM 显示
        renderContent();
    }

    function resetStreamParsingState() {
        streamErrorHandled = false;
        openaiStreamHasDelta = false;
        openaiStreamHasFull = false;
        chatPartsStreamHasDelta = false;
        chatPartsStreamHasFull = false;
        ignoreIncomingOutput = false;
        streamThinkTagCarry = "";
        streamThinkTagInReasoning = false;
    }

    function abortActiveStream() {
        if (abortController) abortController.abort();
        if (gmRequest && gmRequest.abort) gmRequest.abort();
    }

    function interruptActiveOutput(options = {}) {
        const discard = !!(options && options.discard);
        const hasPendingRequest = !!abortController || !!(gmRequest && gmRequest.abort);
        if (!isRendering && !hasPendingRequest) return;
        ignoreIncomingOutput = true;
        streamErrorHandled = true;
        const actionToken = activeActionToken;
        activeActionToken += 1;
        abortActiveStream();
        if (!discard && streamMode === "chat" && isRendering) {
            finalizeChatResponse(actionToken);
        }
        if (discard) {
            streamTextBuffer = "";
            streamReasoningBuffer = "";
            chatAssistantBuffer = "";
            openaiStreamHasDelta = false;
            openaiStreamHasFull = false;
            chatPartsStreamHasDelta = false;
            chatPartsStreamHasFull = false;
        }
        stopRenderLoop();
    }

    function escapeHTML(str) {
        return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    function parseApiError(payload) {
        if (!payload) return null;
        let data = payload;
        let rawText = "";
        if (typeof payload === "string") {
            rawText = payload.trim();
            try {
                data = JSON.parse(payload);
            } catch (e) {
                return null;
            }
        }
        if (!data || typeof data !== "object") return null;
        if (data.error) {
            const err = data.error || {};
            return {
                type: err.type || err.code || data.code || "",
                message: err.message || err.msg || data.message || data.msg || "",
                raw: data,
                rawText: rawText
            };
        }
        if (data.msg && data.code) {
            return { type: data.code, message: data.msg, raw: data, rawText: rawText };
        }
        if (data.errcode !== undefined || data.errno !== undefined || data.error_code !== undefined || data.errorCode !== undefined) {
            const errType = data.errcode !== undefined ? data.errcode
                : (data.errno !== undefined ? data.errno
                    : (data.error_code !== undefined ? data.error_code : data.errorCode));
            const errMessage = data.errmsg || data.message || data.msg || "";
            return { type: errType, message: errMessage, raw: data, rawText: rawText };
        }
        return null;
    }

    function isQuotaError(err) {
        if (!err) return false;
        const type = String(err.type || "").toLowerCase();
        const message = String(err.message || "").toLowerCase();
        return type === "insufficient_quota"
            || message.includes("insufficient_quota")
            || message.includes("exceeded your current quota");
    }

    function isAuthError(err) {
        if (!err) return false;
        const type = String(err.type || "").toLowerCase();
        const message = String(err.message || "").toLowerCase();
        if (!type && !message) return false;
        return type.includes("invalid_api_key")
            || type.includes("invalid_key")
            || type.includes("authentication")
            || type.includes("unauthorized")
            || type.includes("forbidden")
            || type.includes("permission")
            || message.includes("invalid api key")
            || message.includes("invalid key")
            || message.includes("api key") && (message.includes("invalid") || message.includes("missing") || message.includes("expired"))
            || message.includes("unauthorized")
            || message.includes("authentication")
            || message.includes("forbidden")
            || message.includes("permission denied");
    }

    function formatApiErrorDetails(err) {
        if (!err) return "";
        if (typeof err.rawText === "string" && err.rawText.trim()) return err.rawText.trim();
        if (typeof err.raw === "string" && err.raw.trim()) return err.raw.trim();
        if (err.raw !== undefined) {
            try {
                return JSON.stringify(err.raw, null, 2);
            } catch (e) {
                return String(err.raw);
            }
        }
        if (err.message) return String(err.message);
        return "";
    }

    function getUnknownApiErrorHTML(provider, err) {
        const label = getProviderLabel(provider);
        const detail = formatApiErrorDetails(err);
        const detailBlock = detail
            ? `
                <div class="coolauxv-error-detail" style="margin-top:6px;">
                    <button type="button" class="coolauxv-error-detail-toggle" data-action="toggle-error-detail">查看原始错误信息</button>
                    <div class="coolauxv-error-detail-body coolauxv-collapsed" style="display:none;">
                        <pre class="coolauxv-error-detail-pre">${escapeHTML(detail)}</pre>
                    </div>
                </div>
            `
            : "";
        return `
            <div style="border: 1px solid #fcd34d; background-color: #fffbeb; padding: 10px; border-radius: 6px; margin-top: 5px;">
                <div style="display:flex; align-items:center; color: #b45309; font-weight: bold; margin-bottom: 5px;">
                    <span style="font-size:18px; margin-right:6px;">⚠️</span> ${label} 请求失败
                </div>
                <div style="font-size: 13px; color: #666; line-height: 1.5;">
                    请检查模型提供商的 API KEY / Base URL / 自定义字段 / 模型配置是否填写正确。<br>
                    若该接口不需要 API KEY，可忽略此提示。
                </div>
                ${detailBlock}
            </div>
        `;
    }

    function buildApiErrorHtml(provider, err) {
        const message = err && err.message ? err.message : "";
        if (isQuotaError(err)) return getQuotaErrorHTML(provider, message);
        if (isAuthError(err)) return getInvalidKeyErrorHTML(provider);
        return getUnknownApiErrorHTML(provider, err);
    }

    function logAiResponse(provider, model, mode, text) {
        const output = (text || "").trim();
        if (!output) return;
        const label = [provider, model, mode].filter(Boolean).join("/");
        const prefix = label ? `AI Response (${label})` : "AI Response";
        Logger.info(prefix, output);
    }

    function formatRawLogPayload(raw) {
        if (raw === undefined || raw === null) return "";
        if (typeof raw === "string") return raw;
        try {
            return JSON.stringify(raw);
        } catch (e) {
            return String(raw);
        }
    }

    function logAiRawResponse(provider, model, mode, raw) {
        const output = formatRawLogPayload(raw);
        if (!output.trim()) return;
        const label = [provider, model, mode].filter(Boolean).join("/");
        const prefix = label ? `AI Raw Response (${label})` : "AI Raw Response";
        Logger.debug(prefix, output);
    }

    function buildRequestDebugMeta(url, extra = {}) {
        let targetProtocol = "";
        let targetHost = "";
        let targetPath = "";
        try {
            const parsed = new URL(String(url || ""), location.href);
            targetProtocol = parsed.protocol || "";
            targetHost = parsed.host || "";
            targetPath = parsed.pathname || "";
        } catch (e) { }
        return Object.assign({
            pageProtocol: typeof location !== "undefined" ? location.protocol : "",
            targetProtocol: targetProtocol,
            targetHost: targetHost,
            targetPath: targetPath,
            hasGMXmlhttpRequest: typeof GM_xmlhttpRequest === "function"
        }, extra || {});
    }

    function buildErrorDebugInfo(err) {
        if (!err) return { raw: "" };
        const info = {
            type: err.type || "",
            name: err.name || "",
            message: err.message || ""
        };
        if (typeof err.status !== "undefined") info.status = err.status;
        if (typeof err.statusText !== "undefined") info.statusText = err.statusText;
        if (typeof err.readyState !== "undefined") info.readyState = err.readyState;
        if (typeof err.responseText === "string") info.responseTextLength = err.responseText.length;
        if (typeof err.finalUrl === "string") info.finalUrl = err.finalUrl;
        try {
            info.raw = String(err);
        } catch (e) {
            info.raw = "";
        }
        return info;
    }

    function buildNetworkFailureHtml(provider, requestUrl, err) {
        const info = buildErrorDebugInfo(err);
        let targetProtocol = "";
        let targetHost = "";
        try {
            const parsed = new URL(String(requestUrl || ""), location.href);
            targetProtocol = parsed.protocol || "";
            targetHost = parsed.host || "";
        } catch (e) { }

        const lower = `${info.message || ""} ${info.statusText || ""} ${info.type || ""} ${info.name || ""} ${info.raw || ""}`.toLowerCase();
        const isHttpsPage = typeof location !== "undefined" && location.protocol === "https:";
        const statusNumber = Number(info.status);
        const hasStatusNumber = Number.isFinite(statusNumber);
        const isNetworkLike = lower.includes("networkerror")
            || lower.includes("failed to fetch")
            || lower.includes("network request failed")
            || (hasStatusNumber && (statusNumber === 0 || statusNumber === 408));
        const isHttpProviderOnHttpsPage = isHttpsPage && targetProtocol === "http:";
        const isTlsLikely = targetProtocol === "https:" && (isNetworkLike || lower.includes("ssl") || lower.includes("tls") || lower.includes("cert"));

        let summary = "网络请求失败";
        let advice = "请检查 Provider 的 Base URL、网络连通性和防火墙设置。";

        if (isHttpProviderOnHttpsPage) {
            summary = "HTTPS 页面访问 HTTP Provider 失败";
            advice = "浏览器或脚本管理器可能拦截了混合协议请求。请优先改用 HTTPS Provider；若必须使用 HTTP，请检查脚本管理器是否允许不安全请求/混合内容，或用本地反向代理把 HTTP 转为 HTTPS。";
        } else if (isTlsLikely) {
            summary = "HTTPS Provider 握手失败";
            advice = "常见原因是证书过期/证书链异常/系统时间不正确。请先修复证书，或在受控内网中临时改为 HTTP 地址。";
        } else if (hasStatusNumber && statusNumber === 408) {
            summary = "网络请求超时";
            advice = "请确认 Provider 在线且响应正常，再重试。";
        }

        const detailParts = [];
        if (hasStatusNumber) detailParts.push(`status=${statusNumber}`);
        if (info.statusText) detailParts.push(`statusText=${info.statusText}`);
        if (info.message) detailParts.push(`message=${info.message}`);
        if (targetHost) detailParts.push(`target=${targetHost}`);
        const detail = detailParts.join(" | ");
        const detailHtml = detail
            ? `<div style="font-size:12px; color:#8a6d3b; margin-top:6px; word-break:break-word;">${escapeHTML(detail)}</div>`
            : "";

        return `
            <div style="border: 1px solid #fcd34d; background-color: #fffbeb; padding: 10px; border-radius: 6px; margin-top: 5px;">
                <div style="display:flex; align-items:center; color: #b45309; font-weight: bold; margin-bottom: 5px;">
                    <span style="font-size:18px; margin-right:6px;">⚠️</span> ${escapeHTML(getProviderLabel(provider))}：${summary}
                </div>
                <div style="font-size: 13px; color: #666; line-height: 1.5;">
                    ${advice}
                </div>
                ${detailHtml}
            </div>
        `;
    }

    function logAiRawStreamLine(template, line) {
        const output = formatRawLogPayload(line);
        if (!output.trim()) return;
        const providerId = template && template.id ? template.id : "provider";
        const label = [providerId, streamMode].filter(Boolean).join("/");
        const prefix = label ? `AI Raw Stream (${label})` : "AI Raw Stream";
        Logger.debug(prefix, output);
    }

    function handleApiError(provider, err) {
        if (!err || streamErrorHandled) return false;
        streamErrorHandled = true;
        Logger.error("API Error:", err);
        const resultDiv = popup ? popup.querySelector("#coolauxv-result") : null;
        const rawMessage = err.message || (err.type !== undefined ? String(err.type) : "Unknown error");
        const html = buildApiErrorHtml(provider, err);

        if (streamMode === "chat") {
            appendChatError(html, { allowHtml: true, recordAsAssistant: true, recordContent: rawMessage });
        } else if (resultDiv && !shouldSuppressResultError()) {
            resultDiv.innerHTML = html;
        }

        abortActiveStream();
        stopRenderLoop();
        return true;
    }

    const getValueByPath = (obj, path) => {
        if (!obj || !path) return undefined;
        return path.split(".").reduce((acc, key) => {
            if (acc === undefined || acc === null) return undefined;
            if (!key) return acc;
            if (/^\d+$/.test(key)) {
                return acc[Number(key)];
            }
            return acc[key];
        }, obj);
    };

    function processChatCompletionsStreamLine(template, line) {
        line = line.trim();
        if (!line) return;
        if (streamErrorHandled) return;
        const providerId = template ? template.id : "provider";
        if (!line.startsWith("data:")) {
            if (line.startsWith("{")) {
                const apiErr = parseApiError(line);
                if (apiErr && handleApiError(providerId, apiErr)) return;
                const fullText = extractChatCompletionsOutputText(line);
                if (fullText) {
                    const isChatMode = streamMode === "chat";
                    appendTaggedContentChunk(template, fullText, isChatMode);
                } else {
                    handleApiError(providerId, { type: "unknown", message: "", raw: line, rawText: line });
                }
            }
            return;
        }
        const jsonStr = line.slice(5).trim();
        if (jsonStr === "[DONE]") return;
        try {
            const data = JSON.parse(jsonStr);
            const apiErr = parseApiError(data);
            if (apiErr && handleApiError(providerId, apiErr)) return;
            captureProviderRuntimeFieldsFromChunk(template, data);
            const isChatMode = streamMode === "chat";
            const streamCfg = resolveTemplateStreamConfig(template);
            const reasoningPath = streamCfg.reasoningPath || "";
            const contentPath = streamCfg.deltaPath || "choices.0.delta.content";
            const reasoningChunk = reasoningPath ? getValueByPath(data, reasoningPath) : "";
            const contentChunk = getValueByPath(data, contentPath);
            const normalizedContentType = String(data.contentType || "").trim();
            if (reasoningChunk) appendReasoningChunk(reasoningChunk);

            if (contentChunk !== undefined && contentChunk !== null) {
                const contentText = String(contentChunk);
                const isDoneChunk = normalizedContentType === "1002" && contentText.trim().toLowerCase() === "[done]";
                if (!isDoneChunk) {
                    appendTaggedContentChunk(template, contentText, isChatMode);
                }
            }
        } catch (e) {
            Logger.debug("JSON Parse Error (Ignore)", line);
        }
    }

    function extractOpenaiOutputText(payload) {
        let data = payload;
        if (typeof payload === "string") {
            try {
                data = JSON.parse(payload);
            } catch (e) {
                return "";
            }
        }
        if (!data || typeof data !== "object") return "";
        if (typeof data.output_text === "string") return data.output_text;
        if (!Array.isArray(data.output)) return "";
        let text = "";
        data.output.forEach((item) => {
            if (!item || item.type !== "message" || !Array.isArray(item.content)) return;
            item.content.forEach((block) => {
                if (block && block.type === "output_text" && block.text) {
                    text += block.text;
                }
            });
        });
        return text;
    }

    function extractChatCompletionsOutputText(payload) {
        let data = payload;
        if (typeof payload === "string") {
            try {
                data = JSON.parse(payload);
            } catch (e) {
                return "";
            }
        }
        if (!data || typeof data !== "object") return "";
        const choice = Array.isArray(data.choices) ? data.choices[0] : null;
        if (!choice) return "";
        if (choice.message && typeof choice.message.content === "string") return choice.message.content;
        if (choice.delta && typeof choice.delta.content === "string") return choice.delta.content;
        if (typeof choice.text === "string") return choice.text;
        return "";
    }

    function extractChatPartsTextFromMessage(message) {
        if (!message || typeof message !== "object") return "";
        if (Array.isArray(message.parts)) {
            let text = "";
            message.parts.forEach((part) => {
                if (!part || typeof part !== "object") return;
                if (typeof part.text === "string" && (part.type === "text" || part.type === "output_text" || !part.type)) {
                    text += part.text;
                }
            });
            return text;
        }
        if (typeof message.content === "string") return message.content;
        return "";
    }

    function extractChatPartsOutputText(payload) {
        let data = payload;
        if (typeof payload === "string") {
            try {
                data = JSON.parse(payload);
            } catch (e) {
                return "";
            }
        }
        if (!data || typeof data !== "object") return "";
        if (data.message) {
            return extractChatPartsTextFromMessage(data.message);
        }
        if (Array.isArray(data.messages)) {
            for (let i = data.messages.length - 1; i >= 0; i--) {
                const msg = data.messages[i];
                if (!msg || typeof msg !== "object") continue;
                if (!msg.role || msg.role === "assistant") {
                    const text = extractChatPartsTextFromMessage(msg);
                    if (text) return text;
                }
            }
            for (let i = data.messages.length - 1; i >= 0; i--) {
                const text = extractChatPartsTextFromMessage(data.messages[i]);
                if (text) return text;
            }
        }
        return "";
    }

    function stripResponseStats(rawText) {
        if (typeof rawText !== "string") return "";
        return rawText.replace(/<\|stats\|>[\s\S]*?<\|\/stats\|>\s*%?/g, "").trim();
    }

    function normalizeNonStreamText(rawText) {
        if (rawText === null || rawText === undefined) return "";
        return stripResponseStats(String(rawText));
    }

    function extractNonStreamResult(template, payload) {
        if (payload === null || payload === undefined) return null;
        let data = payload;
        if (typeof payload === "string") {
            const trimmed = payload.trim();
            if (!trimmed) return null;
            const cleaned = stripResponseStats(trimmed);
            try {
                data = JSON.parse(cleaned || trimmed);
            } catch (e) {
                return cleaned ? { text: cleaned } : null;
            }
        }
        if (!data || typeof data !== "object") return null;
        const apiErr = parseApiError(data);
        if (apiErr) return { error: apiErr };

        const parser = template && template.stream ? template.stream.parser : "";
        if (parser === "openai-responses") {
            const text = normalizeNonStreamText(extractOpenaiOutputText(data));
            if (text) return { text };
        }
        if (parser === "chat-parts") {
            const text = normalizeNonStreamText(extractChatPartsOutputText(data));
            if (text) return { text };
        }
        if (parser === "ollama") {
            const resolvedStream = resolveTemplateStreamConfig(template);
            const contentPath = resolvedStream.deltaPath || "message.content";
            const candidate = getValueByPath(data, contentPath);
            if (typeof candidate === "string" && candidate) {
                const text = normalizeNonStreamText(candidate);
                if (text) return { text };
            }
        }

        let text = "";
        if (Array.isArray(data.choices) && data.choices.length) {
            const choice = data.choices[0] || {};
            if (choice.message && typeof choice.message.content === "string") {
                text = choice.message.content;
            } else if (typeof choice.text === "string") {
                text = choice.text;
            }
        }

        if (!text) {
            const resolvedStream = resolveTemplateStreamConfig(template);
            const deltaPath = resolvedStream.deltaPath || "";
            if (deltaPath && deltaPath.includes(".delta.")) {
                const fullPath = deltaPath.replace(".delta.", ".message.");
                const candidate = getValueByPath(data, fullPath);
                if (typeof candidate === "string") {
                    text = candidate;
                }
            }
        }

        if (!text && typeof data.output_text === "string") text = data.output_text;
        if (!text && typeof data.result === "string") text = data.result;
        if (!text && data.message && typeof data.message === "object" && typeof data.message.content === "string") text = data.message.content;
        if (!text && typeof data.message === "string") text = data.message;
        if (!text && typeof data.content === "string" && String(data.contentType || "").trim() !== "1002") text = data.content;
        if (!text && typeof data.text === "string") text = data.text;

        const normalizedText = normalizeNonStreamText(text);
        return normalizedText ? { text: normalizedText } : null;
    }

    function processChatPartsStreamLine(template, line) {
        line = line.trim();
        if (!line) return;
        if (streamErrorHandled) return;
        const providerId = template ? template.id : "provider";
        let jsonStr = "";
        if (line.startsWith("data:")) {
            jsonStr = line.slice(5).trim();
        } else if (line.startsWith("{")) {
            jsonStr = line;
        } else {
            return;
        }
        if (!jsonStr || jsonStr === "[DONE]") return;
        try {
            const data = JSON.parse(jsonStr);
            const apiErr = parseApiError(data);
            if (apiErr && handleApiError(providerId, apiErr)) return;
            const isChatMode = streamMode === "chat";
            if (data && typeof data === "object" && data.type === "text-delta" && typeof data.delta === "string") {
                if (data.delta) {
                    chatPartsStreamHasDelta = true;
                    appendTaggedContentChunk(template, data.delta, isChatMode);
                }
                return;
            }
            if (data && typeof data === "object" && data.type === "text" && typeof data.text === "string") {
                if (chatPartsStreamHasDelta || chatPartsStreamHasFull) return;
                const text = data.text;
                if (text) {
                    appendTaggedContentChunk(template, text, isChatMode);
                    chatPartsStreamHasFull = true;
                }
                return;
            }
            if (chatPartsStreamHasDelta || chatPartsStreamHasFull) return;
            const fullText = extractChatPartsOutputText(data);
            if (fullText) {
                appendTaggedContentChunk(template, fullText, isChatMode);
                chatPartsStreamHasFull = true;
            }
        } catch (e) {
            Logger.debug("Chat Parts JSON Parse Error (Ignore)", line);
        }
    }

    function processOpenaiStreamLine(template, line) {
        line = line.trim();
        if (!line) return;
        if (streamErrorHandled) return;
        const providerId = template ? template.id : "openai";
        if (!line.startsWith("data:")) {
            if (line.startsWith("{")) {
                const apiErr = parseApiError(line);
                if (apiErr && handleApiError(providerId, apiErr)) return;
                const fullText = extractOpenaiOutputText(line);
                if (fullText) {
                    const isChatMode = streamMode === "chat";
                    appendTaggedContentChunk(template, fullText, isChatMode);
                    openaiStreamHasFull = true;
                } else {
                    handleApiError(providerId, { type: "unknown", message: "", raw: line, rawText: line });
                }
            }
            return;
        }
        const jsonStr = line.slice(5).trim();
        if (jsonStr === "[DONE]") return;
        try {
            const data = JSON.parse(jsonStr);
            const apiErr = parseApiError(data);
            if (apiErr && handleApiError(providerId, apiErr)) return;
            if (data.type === "response.output_text.delta") {
                const delta = data.delta || "";
                if (!delta) return;
                openaiStreamHasDelta = true;
                const isChatMode = streamMode === "chat";
                appendTaggedContentChunk(template, delta, isChatMode);
            } else if (data.type === "response.output_text.done" && data.text) {
                if (openaiStreamHasDelta || openaiStreamHasFull) return;
                const isChatMode = streamMode === "chat";
                appendTaggedContentChunk(template, data.text, isChatMode);
                openaiStreamHasFull = true;
            } else if (data.type === "response.completed" && data.response) {
                if (openaiStreamHasDelta || openaiStreamHasFull) return;
                const fullText = extractOpenaiOutputText(data.response);
                if (fullText) {
                    const isChatMode = streamMode === "chat";
                    appendTaggedContentChunk(template, fullText, isChatMode);
                    openaiStreamHasFull = true;
                }
            }
        } catch (e) {
            Logger.debug("OpenAI JSON Parse Error (Ignore)", line);
        }
    }

    function processOllamaStreamLine(template, line) {
        line = line.trim();
        if (!line) return;
        if (streamErrorHandled) return;
        const providerId = template ? template.id : "ollama";
        let jsonStr = "";
        if (line.startsWith("data:")) {
            jsonStr = line.slice(5).trim();
        } else if (line.startsWith("{")) {
            jsonStr = line;
        } else {
            return;
        }
        if (!jsonStr || jsonStr === "[DONE]") return;
        try {
            const data = JSON.parse(jsonStr);
            const apiErr = parseApiError(data);
            if (apiErr && handleApiError(providerId, apiErr)) return;
            captureProviderRuntimeFieldsFromChunk(template, data);

            const streamCfg = resolveTemplateStreamConfig(template);
            const reasoningPath = streamCfg.reasoningPath || "";
            const contentPath = streamCfg.deltaPath || "message.content";
            const isChatMode = streamMode === "chat";
            const reasoningChunk = reasoningPath ? getValueByPath(data, reasoningPath) : "";
            let contentChunk = getValueByPath(data, contentPath);

            if ((contentChunk === undefined || contentChunk === null) && typeof data.response === "string") {
                contentChunk = data.response;
            }
            if (reasoningChunk) appendReasoningChunk(reasoningChunk);
            if (contentChunk !== undefined && contentChunk !== null) {
                appendTaggedContentChunk(template, String(contentChunk), isChatMode);
            }
        } catch (e) {
            Logger.debug("Ollama JSON Parse Error (Ignore)", line);
        }
    }

    function processStreamLine(template, line) {
        if (ignoreIncomingOutput) return;
        logAiRawStreamLine(template, line);
        const parser = template && template.stream ? template.stream.parser : "";
        if (parser === "openai-responses") {
            processOpenaiStreamLine(template, line);
            return;
        }
        if (parser === "chat-parts") {
            processChatPartsStreamLine(template, line);
            return;
        }
        if (parser === "ollama") {
            processOllamaStreamLine(template, line);
            return;
        }
        processChatCompletionsStreamLine(template, line);
    }

    // ========================================================================
    // 截图与视觉分析模块
    // ========================================================================

    let capturedImageBase64 = ""; // 存储截图 Base64
    let isSelecting = false;
    let startX, startY;

    function initScreenshotEvents() {
        let fullScreenCanvas = null;
        let bgDataUrl = "";
        let isSelecting = false;
        let startX, startY;
        let algoVer = "v1";
        let activeScreenshotTarget = "main";

        // ============================================
        // DOM 元素获取
        // ============================================
        const btnShotMain = popup.querySelector("#coolauxv-btn-screenshot");
        const btnShotChat = popup.querySelector("#coolauxv-btn-screenshot-chat");
        const btnChatPreview = popup.querySelector("#coolauxv-btn-preview-chat");
        const btnChatClear = popup.querySelector("#coolauxv-btn-clear-chat-shot");
        const overlay = document.querySelector("#coolauxv-screenshot-overlay");
        const selectionBox = document.querySelector("#coolauxv-selection-box");
        const toolbar = document.querySelector("#coolauxv-screenshot-toolbar");
        const btnOk = document.querySelector("#coolauxv-shot-ok");
        const btnCancel = document.querySelector("#coolauxv-shot-cancel");
        const loadingToast = document.querySelector("#coolauxv-loading-toast");

        if ((!btnShotMain && !btnShotChat) || !overlay) return;

        const stopProp = (e) => e.stopPropagation();
        ['mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(evt => {
            toolbar.addEventListener(evt, stopProp);
        });

        // ============================================
        // 1. 点击截图按钮 (入口)
        // ============================================
        const startScreenshot = async (target) => {
            activeScreenshotTarget = target;
            let cfgVer = GM_getValue("coolauxv_use_new_screenshot", DEFAULT_USE_NEW_SCREENSHOT);
            if (cfgVer === true) cfgVer = "v2";
            if (cfgVer === false) cfgVer = "v1";
            algoVer = cfgVer;

            popup.style.display = "none";

            // 立即显示遮罩层（透明），用于抢占鼠标焦点，防止光标穿透到网页文本上
            overlay.style.display = "block";
            overlay.style.backgroundColor = "transparent";
            overlay.style.backgroundImage = "none";
            overlay.style.cursor = "wait"; // 立即变成转圈
            document.body.style.cursor = "wait";

            if (loadingToast) {
                loadingToast.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                        <div class="coolauxv-pulse" style="font-size:24px;">📸</div>
                        <div>${algoVer === 'v3' ? '请在浏览器弹窗中<br>允许“共享此标签页”' : '正在初始化识屏...'}</div>
                    </div>
                `;
                loadingToast.style.display = "flex";
            }

            setTimeout(async () => {
                try {
                    selectionBox.style.display = "none";
                    toolbar.style.display = "none";
                    document.body.style.overflow = "hidden";

                    // --- v3: 原生屏幕共享 API ---
                    if (algoVer === "v3") {
                        try {
                            // 1. 发起屏幕共享请求
                            const stream = await navigator.mediaDevices.getDisplayMedia({
                                video: { cursor: "never" },
                                audio: false
                            });

                            // [核心修复] 获取流成功后，立即隐藏提示弹窗，防止被截进去
                            if (loadingToast) loadingToast.style.display = "none";

                            // [核心修复] 必须等待一小会儿(如200ms)，确保：
                            // 1. DOM 隐藏动作完成渲染
                            // 2. 视频流更新了这一帧（去除了弹窗的画面）
                            await new Promise(resolve => setTimeout(resolve, 200));

                            // 2. 从流中捕获一帧
                            const video = document.createElement("video");
                            video.srcObject = stream;
                            await video.play();

                            fullScreenCanvas = document.createElement("canvas");
                            fullScreenCanvas.width = video.videoWidth;
                            fullScreenCanvas.height = video.videoHeight;
                            const ctx = fullScreenCanvas.getContext("2d");
                            ctx.drawImage(video, 0, 0);

                            // 停止共享
                            stream.getTracks().forEach(track => track.stop());
                            video.srcObject = null;

                            bgDataUrl = fullScreenCanvas.toDataURL("image/jpeg", 0.9);

                            // 设置 Overlay
                            overlay.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${bgDataUrl})`;
                            overlay.style.backgroundPosition = "center";
                            overlay.style.backgroundRepeat = "no-repeat";
                            overlay.style.backgroundSize = "contain";
                            overlay.style.backgroundColor = "rgba(0,0,0,0.8)";

                        } catch (err) {
                            Logger.warn("v3 screen share error:", err);

                            // 先恢复界面状态
                            resetScreenshotUI();
                            popup.style.display = "flex";

                            // 判断错误类型并弹窗提示
                            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                                // 用户点击了“取消”或“禁止”
                                showModal(
                                    "⚠️ 授权被拒绝",
                                    "您取消了屏幕共享授权，v3 识屏模式无法工作。\n\n请重新点击识屏，并在浏览器弹窗中选择 **“当前标签页”** 后点击 **“允许”**。"
                                );
                            } else {
                                // 其他未知错误 (如环境不支持、浏览器策略限制等)
                                showModal(
                                    "❌ 识屏启动失败",
                                    `# ❌ v3 识屏启动失败\n⚠️ Android没法用这个功能属正常情况，用不了别报bug。⚠️\n建议尝试 v1 或 v2 模式，或根据下方指引修改浏览器权限设置。\n由于浏览器安全策略限制，**屏幕共享 (v3) 仅支持 HTTPS 网站**。在 HTTP 网站上，浏览器会强制禁用该接口。\n## 💡 解决方法 (手动开启)\n如果您必须在此网站使用 v3 模式，请尝试以下操作：
                                        **1. Chromium 类浏览器（Edge/Brave 等）：**
                                        *   地址栏输入：\`chrome://flags/#unsafely-treat-insecure-origin-as-secure\`
                                        *   找到该项，设置为 **Enabled**。
                                        *   在下方文本框输入本站地址：\`${window.location.origin}\`
                                        *   点击 **Relaunch** 重启浏览器。
                                        *
                                        **2. Firefox 浏览器：**
                                        *   地址栏输入：\`about:config\`，搜索 \`media.devices.insecure.enabled\`。
                                        *   将其切换为 **true**。
                                        *
                                        **3. 快速替代方案：**
                                        *   点击顶部 **⚙️ 设置** -> **实验性功能**，将截屏算法切换为 **v1** 或 **v2**。
                                        ---
                                        错误详情: \`${err.message || err.name}\`
                                    `
                                );
                            }
                            return;
                        }

                    }

                    // --- v2: html2canvas 全屏 ---
                    else if (algoVer === "v2") {
                        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
                        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
                        fullScreenCanvas = await html2canvas(document.documentElement, {
                            x: scrollLeft, y: scrollTop,
                            width: window.innerWidth, height: window.innerHeight,
                            scrollX: 0, scrollY: 0,
                            useCORS: true, scale: window.devicePixelRatio, allowTaint: false, logging: false,
                            ignoreElements: (element) => {
                                const id = element.id;
                                return id === "coolauxv-screenshot-overlay" ||
                                    id === "coolauxv-translate-popup" ||
                                    id === "coolauxv-translate-icon" ||
                                    id === "coolauxv-img-preview-overlay" ||
                                    id === "coolauxv-mermaid-preview-overlay" ||
                                    id === "coolauxv-loading-toast";
                            }
                        });

                        bgDataUrl = fullScreenCanvas.toDataURL();

                        // [v2 旧版样式逻辑]
                        overlay.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${bgDataUrl})`;
                        overlay.style.backgroundPosition = "0 0";
                        overlay.style.backgroundRepeat = "no-repeat";
                        overlay.style.backgroundSize = "100% 100%";
                        overlay.style.backgroundColor = "transparent";
                    }

                    // --- v1: 旧版 ---
                    else {
                        overlay.style.backgroundImage = "none";
                        overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
                    }

                    overlay.style.cursor = "crosshair";
                    document.body.style.cursor = "crosshair";

                } catch (err) {
                    Logger.error("识屏初始化失败:", err);
                    alert("识屏初始化失败: " + err.message);
                    resetScreenshotUI();
                    popup.style.display = "flex";
                } finally {
                    if (loadingToast) loadingToast.style.display = "none";
                }
            }, 100);
        };

        if (btnShotMain) btnShotMain.onclick = () => startScreenshot("main");
        if (btnShotChat) btnShotChat.onclick = () => startScreenshot("chat");

        // ============================================
        // 2. 选区交互
        // ============================================
        const getClientPos = (e) => {
            if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        };

        const onStart = (e) => {
            if (e.type === 'mousedown' && e.button !== 0) return;
            if (e.cancelable) e.preventDefault();
            isSelecting = true;

            const pos = getClientPos(e);
            startX = pos.x; startY = pos.y;

            if (algoVer === "v2" || algoVer === "v3") {
                overlay.style.backgroundImage = `url(${bgDataUrl})`;
            } else {
                overlay.style.backgroundColor = "transparent";
            }

            selectionBox.style.background = "transparent";
            selectionBox.style.boxShadow = "0 0 0 9999px rgba(0, 0, 0, 0.5)";

            selectionBox.style.left = startX + "px";
            selectionBox.style.top = startY + "px";
            selectionBox.style.width = "0px";
            selectionBox.style.height = "0px";
            selectionBox.style.display = "block";
            toolbar.style.display = "none";
        };

        const onMove = (e) => {
            if (!isSelecting) return;
            if (e.cancelable) e.preventDefault();
            const pos = getClientPos(e);
            const w = Math.abs(pos.x - startX);
            const h = Math.abs(pos.y - startY);
            const l = Math.min(pos.x, startX);
            const t = Math.min(pos.y, startY);
            selectionBox.style.left = l + "px";
            selectionBox.style.top = t + "px";
            selectionBox.style.width = w + "px";
            selectionBox.style.height = h + "px";
        };

        const onEnd = () => {
            if (!isSelecting) return;
            isSelecting = false;

            const rect = selectionBox.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) {
                selectionBox.style.display = "none";
                if (algoVer === "v2" || algoVer === "v3") {
                    overlay.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${bgDataUrl})`;
                } else {
                    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
                }
                return;
            }

            toolbar.style.display = "flex";
            let t = rect.bottom + 10; let l = rect.right - 100;
            if (t > window.innerHeight - 50) t = rect.top - 45;
            if (l < 10) l = 10;
            toolbar.style.top = t + "px"; toolbar.style.left = l + "px";
        };

        overlay.addEventListener("mousedown", onStart);
        overlay.addEventListener("touchstart", onStart, { passive: false });
        overlay.addEventListener("mousemove", onMove);
        overlay.addEventListener("touchmove", onMove, { passive: false });
        overlay.addEventListener("mouseup", onEnd);
        overlay.addEventListener("touchend", onEnd);

        // ============================================
        // 3. 确定 / 取消 (核心算法升级)
        // ============================================
        btnOk.onclick = (e) => {
            if (e) e.stopPropagation();
            if (selectionBox.style.display === "none") return;

            const rect = selectionBox.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const originalText = btnOk.innerText;

            btnOk.innerText = "处理中...";
            btnOk.style.opacity = "0.7";
            btnOk.style.cursor = "wait";

            setTimeout(async () => {
                try {
                    let newCaptured = "";
                    // --- 裁剪逻辑 (v2 / v3) ---
                    if (algoVer === "v2") {
                        if (!fullScreenCanvas) throw new Error("Canvas丢失");
                        const cropCanvas = document.createElement("canvas");
                        cropCanvas.width = rect.width * dpr;
                        cropCanvas.height = rect.height * dpr;
                        const ctx = cropCanvas.getContext("2d");
                        ctx.drawImage(
                            fullScreenCanvas,
                            rect.left * dpr, rect.top * dpr, cropCanvas.width, cropCanvas.height,
                            0, 0, cropCanvas.width, cropCanvas.height
                        );
                        newCaptured = cropCanvas.toDataURL("image/jpeg", 0.8);
                    }
                    // --- 裁剪逻辑 (v3) ---
                    else if (algoVer === "v3") {
                        if (!fullScreenCanvas) throw new Error("Canvas丢失");

                        const cropCanvas = document.createElement("canvas");
                        // 目标尺寸：物理像素
                        cropCanvas.width = rect.width * dpr;
                        cropCanvas.height = rect.height * dpr;
                        const ctx = cropCanvas.getContext("2d");

                        // 1. 获取视口和图片尺寸
                        const viewW = window.innerWidth;
                        const viewH = window.innerHeight;
                        const imgW = fullScreenCanvas.width;
                        const imgH = fullScreenCanvas.height;

                        // 2. 计算 CSS 中 background-size: contain 后的实际渲染尺寸
                        // contain 逻辑：取宽高缩放比中较小的那个
                        const scale = Math.min(viewW / imgW, viewH / imgH);

                        const renderedW = imgW * scale;
                        const renderedH = imgH * scale;

                        // 3. 计算居中导致的偏移量 (Black Bars)
                        const offsetX = (viewW - renderedW) / 2;
                        const offsetY = (viewH - renderedH) / 2;

                        // 4. 坐标映射: 屏幕坐标 -> 图片内部相对坐标 -> 原始 Canvas 坐标
                        // rect.left 是相对于视口的坐标
                        // 减去 offsetX 得到相对于渲染图片的坐标
                        // 除以 scale (或乘以 imgW/renderedW) 还原为原始 Canvas 坐标

                        let sourceX = (rect.left - offsetX) / scale;
                        let sourceY = (rect.top - offsetY) / scale;
                        let sourceW = rect.width / scale;
                        let sourceH = rect.height / scale;

                        // 5. 边界保护 (防止选区画到了黑边上导致报错或黑图)
                        // 虽然 Canvas drawImage 允许源坐标越界(不报错但空白)，但为了严谨最好限制
                        // 简单的处理交给 drawImage 自身即可，它会自动忽略越界部分

                        ctx.drawImage(
                            fullScreenCanvas,
                            sourceX, sourceY, sourceW, sourceH,
                            0, 0, cropCanvas.width, cropCanvas.height
                        );

                        newCaptured = cropCanvas.toDataURL("image/jpeg", 0.8);
                    }
                    // --- 裁剪逻辑 (v1) ---
                    else {
                        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                        const canvas = await html2canvas(document.documentElement, {
                            x: rect.left + scrollLeft,
                            y: rect.top + scrollTop,
                            width: rect.width,
                            height: rect.height,
                            scrollX: 0, scrollY: 0,
                            useCORS: true, allowTaint: false, logging: false, scale: dpr,
                            ignoreElements: (el) => {
                                const id = el.id;
                                return id === "coolauxv-screenshot-overlay" ||
                                    id === "coolauxv-translate-popup" ||
                                    id === "coolauxv-translate-icon" ||
                                    id === "coolauxv-img-preview-overlay" ||
                                    id === "coolauxv-mermaid-preview-overlay" ||
                                    id === "coolauxv-loading-toast";
                            }
                        });
                        newCaptured = canvas.toDataURL("image/jpeg", 0.8);
                    }

                    if (activeScreenshotTarget === "chat") {
                        chatCapturedImageBase64 = newCaptured;
                        setAnimatedVisibility(btnChatPreview, true);
                        setAnimatedVisibility(btnChatClear, true);
                        resetScreenshotUI();
                        popup.style.display = "flex";
                        return;
                    }

                    capturedImageBase64 = newCaptured;
                    const btnPreview = popup.querySelector("#coolauxv-btn-preview");
                    const btnMainClear = popup.querySelector("#coolauxv-btn-clear-shot");
                    setAnimatedVisibility(btnPreview, true);
                    setAnimatedVisibility(btnMainClear, true);
                    resetScreenshotUI();
                    popup.style.display = "flex";

                    const input = popup.querySelector("#coolauxv-input");
                    const config = getActiveConfig();
                    if (!input.value.trim()) input.value = config.promptVision;
                    doImageAnalysis('vision');

                } catch (err) {
                    Logger.error("截图处理失败:", err);
                    alert("截图失败: " + err.message);
                    resetScreenshotUI();
                    popup.style.display = "flex";
                } finally {
                    btnOk.innerText = originalText;
                    btnOk.style.opacity = "1";
                    btnOk.style.cursor = "pointer";
                }
            }, 50);
        };

        btnCancel.onclick = (e) => {
            if (e) e.stopPropagation();
            resetScreenshotUI();
            popup.style.display = "flex";
        };

        function resetScreenshotUI() {
            overlay.style.display = "none";
            overlay.style.backgroundImage = "none";
            overlay.style.backgroundColor = "transparent";
            overlay.style.cursor = "";
            selectionBox.style.display = "none";
            toolbar.style.display = "none";
            document.body.style.overflow = "";
            document.body.style.cursor = "";
            isSelecting = false;
            fullScreenCanvas = null;
            bgDataUrl = "";
            if (loadingToast) loadingToast.style.display = "none";
        }

        const onKeyDown = (e) => {
            if (overlay.style.display === "block") {
                if (e.key === "Escape") {
                    e.preventDefault(); e.stopPropagation();
                    btnCancel.click();
                }
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault(); e.stopPropagation();
                    if (selectionBox.style.display === "block") {
                        btnOk.click();
                    }
                }
            }
        };
        document.addEventListener("keydown", onKeyDown);
    }


    // 执行视觉分析 API 请求
    async function doImageAnalysis(actionId = "vision") {
        if (!capturedImageBase64) {
            alert("未获取到图片数据");
            return;
        }

        if (historyRecords.length || chatSessionStarted || chatDisplayBuffer) {
            clearConversationState();
        }

        const config = getActiveConfig();
        const provider = config.provider;
        const input = popup.querySelector("#coolauxv-input");
        const resultDiv = popup.querySelector("#coolauxv-result");
        const reasoningDiv = popup.querySelector("#coolauxv-reasoning-box");
        const reasoningWrapper = popup.querySelector("#coolauxv-reasoning-wrapper");
        streamMode = "single";

        const providerTemplate = config.template;
        if (!providerTemplate || !providerTemplate.supportsVision) {
            if (resultDiv) {
                resultDiv.innerHTML = "<span style='color:#e65100; font-weight:bold;'>⚠️ 当前提供商未启用识图能力，请在设置中开启。</span>";
            }
            return;
        }

        let textPrompt = "";
        const userText = input.value.trim();
        const imageBase64 = capturedImageBase64;
        const actionTemplate = actionId === "vision" ? null : getActionTemplateById(actionId);
        const resolvedActionId = actionTemplate
            ? actionTemplate.id
            : (actionId === "vision" ? "vision" : resolveActionTemplateId(actionId, getActionTemplates()));

        // --- 核心逻辑：Prompt 拼接 ---
        if (userText) {
            // 如果用户输入不为空，无论什么模式，都只用用户输入
            textPrompt = userText;
            Logger.info("Vision Action: User Input Only");
        } else {
            if (resolvedActionId === "vision") {
                textPrompt = config.promptVision;
                Logger.info("Vision Action: General Analysis");
            } else {
                const systemPrompt = actionTemplate
                    ? actionTemplate.systemPrompt
                    : (resolvedActionId === "explain" ? config.promptExplain : config.promptTrans);
                const order = actionTemplate
                    ? normalizeActionVisionPromptOrder(actionTemplate.visionPromptOrder)
                    : (resolvedActionId === "explain" ? "before" : "after");
                textPrompt = order === "before"
                    ? `${config.promptVision}\n\n${systemPrompt}`
                    : `${systemPrompt}\n\n${config.promptVision}`;
                Logger.info(`Vision Action: ${resolvedActionId} (${order === "before" ? "Vision + System" : "System + Vision"})`);
            }
        }

        const historyEntry = {
            systemPrompt: "",
            userContentText: textPrompt,
            userDisplayText: userText,
            imageBase64: imageBase64,
            assistantText: "",
            provider: provider,
            model: config.modelVision
        };

        if (isMissingProviderConfig(providerTemplate)) {
            if (!shouldSuppressResultError()) {
                showNoKeyError(resultDiv, provider);
            }
            return;
        }

        collapseChatIfEnabled();
        const actionToken = ++activeActionToken;

        streamTextBuffer = ""; streamReasoningBuffer = ""; lastRenderedText = ""; lastRenderedReasoning = ""; hasReasoning = false;
        resetStreamParsingState();

        // 设置 Loading
        const loadingHTML = "<span style='color:#888; display:flex; align-items:center; gap:6px;'>⏳ <span class='coolauxv-pulse'>AI 思考中...</span></span>";
        resultDiv.innerHTML = loadingHTML;
        reasoningDiv.innerHTML = loadingHTML;

        const hasReasoningSupport = !!(providerTemplate && providerTemplate.stream && providerTemplate.stream.reasoningPath);
        if (!hasReasoningSupport) {
            if (reasoningWrapper) reasoningWrapper.style.display = "none";
            const reasoningToggle = popup.querySelector("#coolauxv-reasoning-toggle-container");
            if (reasoningToggle) reasoningToggle.style.display = "none";
            const separator = popup.querySelector("#coolauxv-separator");
            if (separator) separator.style.display = "none";
        } else {
            // 强制显示推理框
            setReasoningAnimatedVisibility(true);
            popup.querySelector("#coolauxv-reasoning-toggle-container").style.display = "flex";
            popup.querySelector("#coolauxv-separator").style.display = "flex";
        }

        const url = buildProviderUrl(providerTemplate);

        const payload = buildVisionPayload(providerTemplate, config.modelVision, textPrompt, imageBase64);

        // 打印 JSON 请求体
        const requestBody = JSON.stringify(payload);
        Logger.debug(`📸 [${provider} Vision Request]`, requestBody);

        const headers = buildProviderHeaders(providerTemplate, { apiKey: config.apiKey });

        if (abortController) abortController.abort();
        if (gmRequest && gmRequest.abort) gmRequest.abort();

        Logger.info(`Starting Vision API Request (${resolvedActionId})...`);
        Logger.debug("GM request context (vision)", buildRequestDebugMeta(url, {
            provider: provider,
            model: config.modelVision,
            actionId: resolvedActionId
        }));

        gmRequest = GM_xmlhttpRequest({
            method: "POST",
            url: url,
            headers: headers,
            data: requestBody,
            responseType: 'stream',
            timeout: 120000,

            onloadstart: (res) => {
                Logger.debug("GM onloadstart (vision)", {
                    status: res && res.status,
                    statusText: res && res.statusText,
                    finalUrl: res && res.finalUrl,
                    hasStreamReader: !!(res && res.response && res.response.getReader)
                });
                if (res.response && res.response.getReader) {
                    startRenderLoop();
                    const reader = res.response.getReader();
                    const decoder = new TextDecoder("utf-8");
                    let buffer = "";
                    let rawText = "";

                    (async function readStream() {
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                const chunk = decoder.decode(value, { stream: true });
                                rawText += chunk;
                                buffer += chunk;
                                const lines = buffer.split(/\r?\n/);
                                buffer = lines.pop();
                                for (const line of lines) processStreamLine(providerTemplate, line);
                            }
                        } catch (e) {
                            Logger.error("Stream Error", e);
                            if (!ignoreIncomingOutput) {
                                resultDiv.innerHTML += `<br><span style='color:red'>流读取错误: ${e.message}</span>`;
                            }
                        } finally {
                            if (ignoreIncomingOutput) {
                                stopRenderLoop();
                                return;
                            }
                            if (buffer && buffer.trim()) {
                                processStreamLine(providerTemplate, buffer);
                            }
                            flushReasoningTagRemainderToBuffers(false);
                            if (!streamTextBuffer.trim() && !streamReasoningBuffer.trim()) {
                                const fallback = extractNonStreamResult(providerTemplate, rawText);
                                if (fallback && fallback.error) {
                                    handleApiError(provider, fallback.error);
                                    return;
                                }
                                if (fallback && fallback.text) {
                                    applyFallbackTextWithReasoningTag(providerTemplate, fallback.text, false);
                                    renderContent();
                                }
                            }
                            stopRenderLoop();
                            historyEntry.assistantText = streamTextBuffer;
                            logAiResponse(provider, config.modelVision, resolvedActionId, streamTextBuffer);
                            recordHistoryEntry(historyEntry);
                            autoExpandChatIfEnabled(actionToken);
                        }
                    })();
                }
            },
            onload: (res) => {
                if (ignoreIncomingOutput) return;
                Logger.debug("GM onload (vision)", {
                    status: res && res.status,
                    statusText: res && res.statusText,
                    finalUrl: res && res.finalUrl,
                    responseTextLength: res && typeof res.responseText === "string" ? res.responseText.length : 0
                });
                logAiRawResponse(provider, config.modelVision, resolvedActionId, res.responseText);
                if (res.status === 429) {
                    stopRenderLoop();
                    if (!shouldSuppressResultError()) {
                        const apiErr = parseApiError(res.responseText);
                        resultDiv.innerHTML = (apiErr && isQuotaError(apiErr))
                            ? getQuotaErrorHTML(provider, apiErr.message)
                            : get429ErrorHTML();
                    }
                    reasoningWrapper.style.display = "none";
                    autoExpandChatIfEnabled(actionToken);
                    return;
                }

                if (res.status === 401 || res.status === 403) {
                    stopRenderLoop();
                    if (!shouldSuppressResultError()) {
                        showInvalidKeyError(resultDiv, provider);
                    }
                    if (reasoningWrapper) reasoningWrapper.style.display = "none";
                    autoExpandChatIfEnabled(actionToken);
                    return;
                }

                if (res.status !== 200) {
                    stopRenderLoop();
                    const apiErr = parseApiError(res.responseText);
                    const err = apiErr || { type: "http_error", message: `HTTP ${res.status}`, raw: res.responseText, rawText: res.responseText };
                    if (!shouldSuppressResultError()) {
                        resultDiv.innerHTML = buildApiErrorHtml(provider, err);
                    }
                    autoExpandChatIfEnabled(actionToken);
                }
            },
            onerror: (e) => {
                if (ignoreIncomingOutput) return;
                Logger.error("GM onerror (vision)", buildErrorDebugInfo(e));
                stopRenderLoop();
                resultDiv.innerHTML = buildNetworkFailureHtml(provider, url, e);
                autoExpandChatIfEnabled(actionToken);
            }
        });
    }

    async function doChatSend() {
        const chatInput = popup.querySelector("#coolauxv-chat-input");
        const resultDiv = popup.querySelector("#coolauxv-result");
        if (!chatInput || !resultDiv) return;

        if (chatEditingRecordId) {
            const handled = await confirmChatEditSend();
            if (handled) return;
        }

        const userText = chatInput.value.trim();
        const hasImage = !!chatCapturedImageBase64;

        if (!userText && !hasImage) {
            showChatInlineNotice("⚠️ 请输入内容或识屏。");
            return;
        }
        clearChatInlineNotice();

        const config = getActiveConfig();
        const provider = config.provider;
        const providerTemplate = config.template;
        startChatSessionIfNeeded();
        syncChatProvider(provider);
        chatAssistantLabel = formatChatModelLabel(provider, config.modelVision);
        if (isMissingProviderConfig(providerTemplate)) {
            appendChatError(getNoKeyErrorHTML(provider), { allowHtml: true });
            return;
        }

        collapseChatIfEnabled();
        collapseTopSectionIfExpanded();
        const actionToken = ++activeActionToken;

        const imageId = hasImage ? `chat-img-${++chatImageCounter}` : null;
        if (imageId) chatImageStore[imageId] = chatCapturedImageBase64;

        const displayText = userText || (imageId ? "（仅识屏）" : "");
        const turnId = generateChatTurnId();
        const userRecordId = generateChatRecordId();
        chatDisplayBuffer += formatChatUserBlock(displayText, imageId, chatDisplayBuffer.length === 0, turnId, userRecordId);
        chatAssistantLabel = formatChatModelLabel(provider, config.modelVision);
        chatPendingAssistantPrefix = getChatAssistantThinkingPrefix(chatAssistantLabel);
        chatAssistantBuffer = "";
        updateChatStreamText();
        lastRenderedText = "";
        renderContent();

        const messageText = userText || (hasImage ? config.promptVision : "");
        appendChatHistoryRecord("user", messageText, hasImage ? chatCapturedImageBase64 : "", {
            displayText: displayText,
            turnId: turnId,
            recordId: userRecordId
        });
        const userMessage = buildProviderMessage(providerTemplate, "user", messageText, hasImage ? chatCapturedImageBase64 : "");
        if (userMessage) chatMessages.push(userMessage);
        queueCurrentChatSessionToBackground();

        chatInput.value = "";
        chatCapturedImageBase64 = "";
        const btnChatPreview = popup.querySelector("#coolauxv-btn-preview-chat");
        setAnimatedVisibility(btnChatPreview, false);
        const btnChatClear = popup.querySelector("#coolauxv-btn-clear-chat-shot");
        setAnimatedVisibility(btnChatClear, false);

        streamReasoningBuffer = "";
        lastRenderedReasoning = "";
        hasReasoning = false;
        resetStreamParsingState();

        const reasoningDiv = popup.querySelector("#coolauxv-reasoning-box");
        const reasoningWrapper = popup.querySelector("#coolauxv-reasoning-wrapper");
        const reasoningToggle = popup.querySelector("#coolauxv-reasoning-toggle-container");
        const separator = popup.querySelector("#coolauxv-separator");
        if (reasoningDiv) reasoningDiv.innerHTML = "";
        if (reasoningWrapper) reasoningWrapper.style.display = "none";
        if (reasoningToggle) reasoningToggle.style.display = "none";
        if (separator) separator.style.display = "none";

        if (abortController) abortController.abort();
        if (gmRequest && gmRequest.abort) gmRequest.abort();

        streamMode = "chat";

        const url = buildProviderUrl(providerTemplate);
        const payload = buildChatPayload(providerTemplate, config.modelVision, chatMessages);

        const requestBody = JSON.stringify(payload);
        Logger.debug(`💬 [${provider} Chat Request]`, requestBody);

        const headers = buildProviderHeaders(providerTemplate, { apiKey: config.apiKey });
        const shouldForceGmXhr = shouldForceGMRequestForUrl(url);

        // 策略 A: Fetch (优先，避免缺少 @connect 时无法访问)
        if (!shouldForceGmXhr) {
            try {
                Logger.info(`Fetch ${provider} Chat Model: ${config.modelVision}`);
                abortController = new AbortController();
                const response = await fetch(url, {
                    method: "POST",
                    headers: headers,
                    body: requestBody,
                    signal: abortController.signal
                });

                if (!response.ok) {
                    stopRenderLoop();
                    finalizeChatResponse(actionToken);
                    if (response.status === 429) {
                        let apiErr = null;
                        try {
                            const errJson = await response.json();
                            logAiRawResponse(provider, config.modelVision, "chat", errJson);
                            apiErr = parseApiError(errJson);
                        } catch (e) { }
                        const html = (apiErr && isQuotaError(apiErr))
                            ? getQuotaErrorHTML(provider, apiErr.message)
                            : get429ErrorHTML();
                        appendChatError(html, { allowHtml: true, recordAsAssistant: true });
                        return;
                    }
                    if (response.status === 401 || response.status === 403) {
                        let rawText = "";
                        try {
                            rawText = await response.text();
                        } catch (e) { }
                        logAiRawResponse(provider, config.modelVision, "chat", rawText);
                        appendChatError(getInvalidKeyErrorHTML(provider), { allowHtml: true });
                        return;
                    }
                    let rawText = "";
                    try {
                        rawText = await response.text();
                    } catch (e) { }
                    logAiRawResponse(provider, config.modelVision, "chat", rawText);
                    const apiErr = parseApiError(rawText);
                    const err = apiErr || { type: "http_error", message: `HTTP ${response.status}`, raw: rawText, rawText: rawText };
                    appendChatError(buildApiErrorHtml(provider, err), { allowHtml: true });
                    return;
                }

                startRenderLoop();
                let rawText = "";
                if (response.body && response.body.getReader) {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder("utf-8");
                    let buffer = "";
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });
                        rawText += chunk;
                        buffer += chunk;
                        const lines = buffer.split(/\r?\n/);
                        buffer = lines.pop();
                        for (const line of lines) processStreamLine(providerTemplate, line);
                    }
                    if (ignoreIncomingOutput) {
                        stopRenderLoop();
                        return;
                    }
                    if (buffer && buffer.trim()) {
                        processStreamLine(providerTemplate, buffer);
                    }
                    flushReasoningTagRemainderToBuffers(true);
                } else {
                    const fullText = await response.text();
                    rawText = fullText || "";
                    if (fullText) {
                        const lines = fullText.split(/\r?\n/);
                        for (const line of lines) processStreamLine(providerTemplate, line);
                    }
                    flushReasoningTagRemainderToBuffers(true);
                }
                if (!chatAssistantBuffer.trim()) {
                    const fallback = extractNonStreamResult(providerTemplate, rawText);
                    if (fallback && fallback.error) {
                        stopRenderLoop();
                        finalizeChatResponse(actionToken);
                        appendChatError(buildApiErrorHtml(provider, fallback.error), { allowHtml: true });
                        return;
                    }
                    if (fallback && fallback.text) {
                        applyFallbackTextWithReasoningTag(providerTemplate, fallback.text, true);
                        updateChatStreamText();
                        renderContent();
                    }
                }
                stopRenderLoop();
                finalizeChatResponse(actionToken);
                return;
            } catch (err) {
                Logger.warn("Chat Fetch 失败/跨域，准备降级。", err);
                if (err.name === 'AbortError') return;
            }
        } else {
            Logger.info("检测到 HTTPS 页面调用 HTTP Provider，聊天请求跳过 Fetch，直接使用 GM_xmlhttpRequest。");
        }

        let chatStreamActive = false;
        const isMixedProtocolChatRequest = shouldForceGMRequestForUrl(url);
        const chatGmRequestAttempts = isMixedProtocolChatRequest
            ? [
                { streamMode: "progress", fetchMode: false, label: "onprogress-xhr" },
                { streamMode: "progress", fetchMode: true, label: "onprogress-fetch" },
                { streamMode: "stream", fetchMode: true, label: "stream-fetch" }
            ]
            : [
                { streamMode: "stream", fetchMode: true, label: "stream-fetch" },
                { streamMode: "progress", fetchMode: false, label: "onprogress-xhr" }
            ];
        let chatGmAttemptIndex = 0;
        let chatProgressOffset = 0;
        let chatRawText = "";
        let chatBuffer = "";

        const flushChatStreamChunk = (chunkText) => {
            if (!chunkText) return;
            chatRawText += chunkText;
            chatBuffer += chunkText;
            const lines = chatBuffer.split(/\r?\n/);
            chatBuffer = lines.pop();
            for (const line of lines) processStreamLine(providerTemplate, line);
        };

        const finalizeChatStream = (actionTokenValue, streamErr) => {
            if (ignoreIncomingOutput) {
                stopRenderLoop();
                return;
            }
            if (chatBuffer && chatBuffer.trim()) {
                processStreamLine(providerTemplate, chatBuffer);
            }
            flushReasoningTagRemainderToBuffers(true);
            if (!chatAssistantBuffer.trim()) {
                const fallback = extractNonStreamResult(providerTemplate, chatRawText);
                if (fallback && fallback.error) {
                    handleApiError(provider, fallback.error);
                    return;
                }
                if (fallback && fallback.text) {
                    applyFallbackTextWithReasoningTag(providerTemplate, fallback.text, true);
                    updateChatStreamText();
                    renderContent();
                }
            }
            stopRenderLoop();
            finalizeChatResponse(actionTokenValue);
            if (streamErr) appendChatError(streamErr);
        };

        Logger.debug("GM request context (chat)", buildRequestDebugMeta(url, {
            provider: provider,
            model: config.modelVision,
            mode: "chat"
        }));

        const getCurrentChatAttempt = () => chatGmRequestAttempts[Math.min(chatGmAttemptIndex, chatGmRequestAttempts.length - 1)];

        const canRetryChatGmRequest = () => {
            if (chatGmAttemptIndex >= chatGmRequestAttempts.length - 1) return false;
            if (chatAssistantBuffer.trim()) return false;
            if (streamReasoningBuffer.trim()) return false;
            if (chatRawText.trim()) return false;
            return true;
        };

        const retryChatGmRequest = (reasonLabel, err) => {
            if (!canRetryChatGmRequest()) return false;
            const currentAttempt = getCurrentChatAttempt();
            chatGmAttemptIndex += 1;
            const nextAttempt = getCurrentChatAttempt();
            chatProgressOffset = 0;
            chatRawText = "";
            chatBuffer = "";
            chatStreamActive = false;
            Logger.warn(
                `Chat GM ${reasonLabel}，切换重试策略：${currentAttempt.label} -> ${nextAttempt.label}`,
                err ? buildErrorDebugInfo(err) : {}
            );
            startChatGmRequest();
            return true;
        };

        const startChatGmRequest = () => {
            const currentAttempt = getCurrentChatAttempt();
            const currentUseProgressStreamMode = currentAttempt.streamMode === "progress";
            Logger.info(`GM 请求尝试 ${chatGmAttemptIndex + 1}/${chatGmRequestAttempts.length}（chat）：${currentAttempt.label}`);
            if (currentUseProgressStreamMode && isMixedProtocolChatRequest) {
                Logger.info("Chat 使用 GM onprogress 流式模式（兼容 HTTPS 页面 -> HTTP Provider）。");
            }

            const requestOptions = {
                method: "POST",
                url: url,
                headers: headers,
                data: requestBody,
                responseType: currentUseProgressStreamMode ? "" : "stream",
                timeout: 600000,

                onloadstart: (res) => {
                    Logger.debug("GM onloadstart (chat)", {
                        status: res && res.status,
                        statusText: res && res.statusText,
                        finalUrl: res && res.finalUrl,
                        hasStreamReader: !!(res && res.response && res.response.getReader),
                        mode: currentAttempt.label
                    });
                    if (currentUseProgressStreamMode) {
                        chatStreamActive = true;
                        startRenderLoop();
                        return;
                    }
                    if (res.response && res.response.getReader) {
                        chatStreamActive = true;
                        startRenderLoop();
                        const reader = res.response.getReader();
                        const decoder = new TextDecoder("utf-8");

                        (async function readStream() {
                            let streamErr = "";
                            try {
                                while (true) {
                                    const { done, value } = await reader.read();
                                    if (done) break;
                                    const chunk = decoder.decode(value, { stream: true });
                                    flushChatStreamChunk(chunk);
                                }
                            } catch (e) {
                                Logger.error("Chat Stream Error", e);
                                streamErr = `流读取错误: ${e.message}`;
                            } finally {
                                finalizeChatStream(actionToken, streamErr);
                            }
                        })();
                    }
                },

                onprogress: (res) => {
                    if (!currentUseProgressStreamMode || ignoreIncomingOutput) return;
                    const text = res && typeof res.responseText === "string" ? res.responseText : "";
                    if (!text) return;
                    if (text.length < chatProgressOffset) {
                        chatProgressOffset = 0;
                    }
                    const chunk = text.slice(chatProgressOffset);
                    chatProgressOffset = text.length;
                    flushChatStreamChunk(chunk);
                },
                onload: (res) => {
                    if (ignoreIncomingOutput) return;
                    Logger.debug("GM onload (chat)", {
                        status: res && res.status,
                        statusText: res && res.statusText,
                        finalUrl: res && res.finalUrl,
                        responseTextLength: res && typeof res.responseText === "string" ? res.responseText.length : 0,
                        streamed: chatStreamActive,
                        mode: currentAttempt.label
                    });
                    if (currentUseProgressStreamMode) {
                        const fullText = res && typeof res.responseText === "string" ? res.responseText : "";
                        if (fullText.length > chatProgressOffset) {
                            flushChatStreamChunk(fullText.slice(chatProgressOffset));
                            chatProgressOffset = fullText.length;
                        }
                        if (res.status && res.status !== 200) {
                            stopRenderLoop();
                            finalizeChatResponse(actionToken);
                            logAiRawResponse(provider, config.modelVision, "chat", fullText);
                            const apiErr = parseApiError(fullText);
                            const err = apiErr || { type: "http_error", message: `HTTP ${res.status}`, raw: fullText, rawText: fullText };
                            appendChatError(buildApiErrorHtml(provider, err), { allowHtml: true });
                            return;
                        }
                        finalizeChatStream(actionToken, "");
                        return;
                    }
                    if (chatStreamActive) {
                        if (streamErrorHandled) return;
                        if (res.status === 200) return;
                        logAiRawResponse(provider, config.modelVision, "chat", res.responseText);
                        const apiErr = parseApiError(res.responseText);
                        const err = apiErr || { type: "http_error", message: `HTTP ${res.status}`, raw: res.responseText, rawText: res.responseText };
                        streamErrorHandled = true;
                        stopRenderLoop();
                        finalizeChatResponse(actionToken);
                        appendChatError(buildApiErrorHtml(provider, err), { allowHtml: true });
                        return;
                    }
                    if (res.status === 429) {
                        stopRenderLoop();
                        finalizeChatResponse(actionToken);
                        logAiRawResponse(provider, config.modelVision, "chat", res.responseText);
                        const apiErr = parseApiError(res.responseText);
                        const html = (apiErr && isQuotaError(apiErr))
                            ? getQuotaErrorHTML(provider, apiErr.message)
                            : get429ErrorHTML();
                        appendChatError(html, { allowHtml: true, recordAsAssistant: true });
                        return;
                    }
                    if (res.status === 401 || res.status === 403) {
                        stopRenderLoop();
                        finalizeChatResponse(actionToken);
                        logAiRawResponse(provider, config.modelVision, "chat", res.responseText);
                        appendChatError(getInvalidKeyErrorHTML(provider), { allowHtml: true });
                        return;
                    }
                    if (res.status !== 200) {
                        stopRenderLoop();
                        finalizeChatResponse(actionToken);
                        logAiRawResponse(provider, config.modelVision, "chat", res.responseText);
                        const apiErr = parseApiError(res.responseText);
                        const err = apiErr || { type: "http_error", message: `HTTP ${res.status}`, raw: res.responseText, rawText: res.responseText };
                        appendChatError(buildApiErrorHtml(provider, err), { allowHtml: true });
                    }
                },
                onerror: (e) => {
                    if (ignoreIncomingOutput) return;
                    if (streamErrorHandled) return;
                    Logger.error("GM onerror (chat)", buildErrorDebugInfo(e));
                    if (retryChatGmRequest("onerror", e)) return;
                    stopRenderLoop();
                    finalizeChatResponse(actionToken);
                    appendChatError(buildNetworkFailureHtml(provider, url, e), { allowHtml: true });
                },
                ontimeout: () => {
                    if (ignoreIncomingOutput) return;
                    if (streamErrorHandled) return;
                    Logger.error("GM ontimeout (chat)", buildRequestDebugMeta(url, {
                        provider: provider,
                        model: config.modelVision,
                        mode: `chat/${currentAttempt.label}`
                    }));
                    if (retryChatGmRequest("ontimeout", { status: 408, statusText: "timeout" })) return;
                    stopRenderLoop();
                    finalizeChatResponse(actionToken);
                    appendChatError("请求超时 (Timeout)");
                }
            };
            if (typeof currentAttempt.fetchMode === "boolean") {
                requestOptions.fetch = currentAttempt.fetchMode;
            }
            gmRequest = GM_xmlhttpRequest(requestOptions);
        };

        startChatGmRequest();
    }

    function getNoKeyErrorHTML(provider) {
        const label = getProviderLabel(provider);
        const link = getProviderKeyLink(provider);
        const tpl = getProviderTemplateSafe(provider);
        const missingUrl = !tpl || !String(tpl.baseUrl || "").trim();
        const missingItems = [];
        if (missingUrl) {
            missingItems.push("Base URL");
        } else {
            const context = buildTemplateContext(tpl, { apiKey: tpl.apiKey || "" });
            const unresolved = extractTemplateKeys(tpl.baseUrl || "").filter((key) => {
                if (!Object.prototype.hasOwnProperty.call(context, key)) return true;
                return String(context[key] || "").trim() === "";
            });
            if (unresolved.length) {
                missingItems.push(`自定义字段 ${unresolved.join(", ")}`);
            }
        }
        const missingLabel = missingItems.length ? missingItems.join(" 与 ") : "配置";
        const needsApiKey = tpl && JSON.stringify(tpl.headersTemplate || {}).includes("{{apiKey}}");
        const showKeyLink = needsApiKey && tpl && !String(tpl.apiKey || "").trim();
        return `
            <div style="color:#e65100; font-weight:bold; padding:10px;">⚠️ 请配置 ${missingLabel}</div>
            <div style="font-size:13px; color:#555; padding:0 10px;">
            您尚未配置必要参数，无法使用该提供商。<br><br>
            1. 点击顶部 <span style="background:#f0f0f0; border-radius:4px; padding:0 4px;">⚙️ 设置</span> 图标。<br>
            ${link && showKeyLink ? `2. 点击 <a href="${link}" target="_blank" style="color:#3b82f6;">获取 KEY</a> 去 ${label} 平台申请。<br>` : ""}
            3. 将参数填入设置框并保存。
            </div>
        `;
    }

    function showNoKeyError(container, provider) {
        if (container) container.innerHTML = getNoKeyErrorHTML(provider);
    }

    function getInvalidKeyErrorHTML(provider) {
        const label = getProviderLabel(provider);
        const link = getProviderKeyLink(provider);
        const linkHtml = link ? `<a href="${link}" target="_blank" style="color:#3b82f6;">获取 KEY</a>` : "获取 KEY";
        return `
            <div style="color:#d32f2f; font-weight:bold; padding:10px;">🚫 API KEY 无效</div>
            <div style="font-size:13px; color:#555; padding:0 10px;">
            您配置的 API Key 无法通过验证 (Error 401/403)。<br><br>
            可能的原因：<br>
            1. Key 已过期或被撤销。<br>
            2. 复制时多复制了空格。<br>
            3. 账户余额不足。<br><br>
            请检查设置或重新 ${linkHtml}（${label}）。
            </div>
        `;
    }

    function showInvalidKeyError(container, provider) {
        if (container) container.innerHTML = getInvalidKeyErrorHTML(provider);
    }

    function getQuotaErrorHTML(provider, message) {
        const label = getProviderLabel(provider);
        const detail = message ? `<div style="font-size:12px; color:#999; margin-top:6px;">${escapeHTML(message)}</div>` : "";
        return `
            <div style="border: 1px solid #f5c6cb; background-color: #fff5f5; padding: 10px; border-radius: 6px; margin-top: 5px;">
                <div style="display:flex; align-items:center; color: #b71c1c; font-weight: bold; margin-bottom: 5px;">
                    <span style="font-size:18px; margin-right:6px;">⛔</span> ${label} 额度不足 (insufficient_quota)
                </div>
                <div style="font-size: 13px; color: #666; line-height: 1.5;">
                    当前账户额度不足或已用尽。解决方案：更换模型或增加额度。<br>
                    <span style="font-size:12px; color:#999;">(Suggestion: switch model or add quota)</span>
                </div>
                ${detail}
            </div>
        `;
    }

    function get429ErrorHTML() {
        return `
            <div style="border: 1px solid #ffcc00; background-color: #fffbe6; padding: 10px; border-radius: 6px; margin-top: 5px;">
                <div style="display:flex; align-items:center; color: #d48806; font-weight: bold; margin-bottom: 5px;">
                    <span style="font-size:18px; margin-right:6px;">⚠️</span> 调用速度过快 (Error 429)
                </div>
                <div style="font-size: 13px; color: #666; line-height: 1.5;">
                    API 请求频率超过限制。请稍作休息，或者检查您的并发请求数量。<br>
                    <span style="font-size:12px; color:#999;">(Suggestions: Reduce request frequency)</span>
                </div>
            </div>
        `;
    }

    const startMain = () => {
        if (extensionDetected) {
            requestBridgeCleanup();
            return;
        }
        uiStarted = true;
        initPdfjsCustomScaleEnhancer();
        ensureStyles();
        initPdfReceiver();
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI);
        else initUI();
    };

    setupBridgeServer();
    startMainTimer = setTimeout(() => {
        if (!extensionDetected) {
            startMain();
        }
    }, BRIDGE_DETECT_TIMEOUT_MS);

})();
