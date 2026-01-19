// ==UserScript==
// @name         CoolAuxv 网页翻译与阅读助手
// @namespace    https://github.com/CoolestEnoch/CoolAuxv
// @version      v11.1
// @description  使用智谱API的网页翻译与解读工具，支持多种语言模型和推理模型，提供丰富的配置选项，优化阅读体验。
// @changelog    [v11.1 更新日志] 修复已知bug。
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
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js
// @resource     katexCSS https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css
// @connect      open.bigmodel.cn
// @license      GPL-3.0
// @downloadURL  https://github.com/CoolestEnoch/CoolAuxv/raw/refs/heads/main/translator.user.js
// @updateURL    https://github.com/CoolestEnoch/CoolAuxv/raw/refs/heads/main/translator.meta.js
// ==/UserScript==


(function () {
    'use strict';

    // ========================================================================
    // 全局配置与常量
    // ========================================================================

    // 文本模型 (整合了原来的 语言模型 和 推理模型)
    const TEXT_MODELS = [
        { id: "glm-4-flash", class: "语言模型", tag: "免费" },
        { id: "glm-4-flash-250414", class: "语言模型", tag: "免费" },
        { id: "glm-4v-flash", class: "通用模型", tag: "免费 | 多模态" },
        { id: "glm-4.5-flash", class: "推理模型", tag: "免费" },
        { id: "glm-z1-flash", class: "推理模型", tag: "免费" },
        { id: "glm-4.6v-flash", class: "推理模型", tag: "免费 | 多模态" },
        { id: "glm-4.1v-thinking-flash", class: "推理模型", tag: "免费 | 多模态" },
        { id: "glm-4.7", class: "推理模型", tag: "付费" },
        { id: "deepseek-r1", class: "推理模型", tag: "付费" },
    ];

    // 视觉模型 (添加 class 分类)
    const VISION_MODELS = [
        { id: "glm-4v-flash", class: "通用模型", tag: "免费 | 多模态" },
        { id: "glm-4.6v-flash", class: "推理模型", tag: "免费 | 多模态" },
        { id: "glm-4.1v-thinking-flash", class: "推理模型", tag: "免费 | 多模态" },
    ];

    const LOG_PRESETS = ["debug", "info", "warn", "error", "none"];

    const DEFAULT_API_KEY = "1145141919810哼哼啊啊啊啊啊";
    // 默认模型取语言模型数组的第一个
    const DEFAULT_MODEL_NAME = TEXT_MODELS[0].id;
    const DEFAULT_LOG_LEVEL = "none";

    const DEFAULT_VISION_MODEL = "glm-4v-flash";
    const DEFAULT_PROMPT_VISION = "请先详细描述这张图，然后再详细解读这张图。";
    const DEFAULT_ENABLE_CONTINUOUS_CHAT = false;
    const DEFAULT_PROMPT_CONTINUOUS_CHAT = "忽略之前给你的提示词，现在开始你是一个连续对话助手，要结合上下文用中文回答用户问题；如有图片，请结合图片内容回答；要听从用户指示。";

    const DEFAULT_WIN_WIDTH = "480px";
    const DEFAULT_WIN_HEIGHT = "480px";

    const DEFAULT_SHOW_RAW = false;
    const DEFAULT_SHOW_REASONING = true;
    const DEFAULT_ENABLE_BLUR_GLASS = false; // 默认关闭模糊
    const DEFAULT_USE_NEW_SCREENSHOT = "v1"; // 默认使用老逻辑截图


    const DEFAULT_PROMPT_TRANSLATE = "你是一个翻译引擎。将用户输入直接翻译成中文。如果输入是中文则译为英文。不要输出任何多余的解释。";
    const DEFAULT_PROMPT_EXPLAIN = "用户输入文本后，先翻译全文：若非中文译成中文，若是中文译成英文，为英文简写用括号标注完整写法。用户是这个领域的新手，你是这个领域的资深专家兼大师，然后详细解读：用通俗中文解释所有专业概念，每个概念解释前先明确标注原术语（英文简写需同时给出全称）,如果有公式，请用latex格式输出。解读要详细全面，涵盖定义、背景、原理、应用和意义。输出为排版丰富的Markdown，除翻译外全文都用中文回答，不允许把全文都放在codeblock里。";

    const LATEST_CHANGELOG = `
        v11.1 更新日志
        ## 🛠️ 大量错误修复
        *   修复连续对话在切换页面后上下文丢失的问题。
        *   修复推理区在折叠状态下偶发撑开布局的显示异常。
        *   修复识屏结果偶发不刷新与重复渲染的问题。
        *   修复翻译/解读结果过长时滚动条异常与跳动的问题。
        *   修复本地 PDF 打开时进度提示偶发不消失的问题。
        *   修复部分站点下注入样式冲突导致按钮错位的问题。
        *   修复配置项保存后偶发未生效的问题。
        *   修复快速连续点击触发多次请求导致的报错。
        *   修复低网速下请求超时提示不准确的问题。
        *   修复触屏设备没法点开右下角“智”悬浮球。
        *   修复若干控制台报错与边界条件崩溃。
    `;

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

        // 支持自定义 Tag，如果 tag 为空则使用默认值
        _print: (level, tag, args) => {
            if (Logger.shouldLog(level)) {
                // 如果没有传入 tag，则使用默认的
                const prefix = tag ? `[${tag}]` : `[CoolAuxv]`;
                const fn = console[level] || console.log;
                // 将 Tag 作为前缀添加到参数列表中
                fn(prefix, ...args);
            }
        },

        // 保持原有 API 兼容性：不传 Tag，内部默认使用[CoolAuxv]
        // 这样现有的 Logger.info("msg") 调用完全不受影响
        debug: (...args) => Logger._print('debug', null, args),
        info: (...args) => Logger._print('info', null, args),
        warn: (...args) => Logger._print('warn', null, args),
        error: (...args) => Logger._print('error', null, args),

        // 新代码如果需要自定义 Tag，调用这个方法
        // 用法: Logger.custom("自定义标签", "info", "消息内容...")
        custom: (tag, level, ...args) => Logger._print(level, tag, args)
    };

    // ========================================================================
    // 特殊逻辑：PDF.js Viewer 注入 (接收端 - 极速版)
    // ========================================================================
    if (location.href.includes("mozilla.github.io/pdf.js/web/viewer.html")) {
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
                    console.error(e);
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



    // --- 1. 样式注入 ---
    const styles = `
    /* ============================
       样式隔离与重置核心
       ============================ */
    #coolauxv-translate-popup {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #333;
      z-index: 2147483646 !important;
      max-width: 95vw !important; max-height: 90vh !important;
      min-width: 300px;
      min-height: 300px;
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
    #coolauxv-main-view {
        flex: 1; display: flex; flex-direction: column; overflow: hidden; width: 100%;
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
        flex: 1; display: none; flex-direction: column;
        padding: 15px; background: #fff; overflow-y: auto; width: 100%;
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

    .coolauxv-setting-input {
        width: 100%; padding: 8px; padding-right: 30px;
        border: 1px solid #ddd; border-radius: 6px;
        font-size: 13px; outline: none; transition: border 0.2s;
        font-family: inherit; text-align: left !important;
    }
    .coolauxv-setting-input:focus { border-color: #3b82f6; }

    .coolauxv-clear-icon {
        position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
        cursor: pointer; color: #ccc; font-weight: bold; font-size: 16px;
        line-height: 1; display: none;
    }
    .coolauxv-setting-input:not(:placeholder-shown) + .coolauxv-clear-icon { display: block; }

    .coolauxv-fixed-input { resize: none; }
    .coolauxv-read-only { background-color: #f9fafb; color: #666; cursor: default; }
    .coolauxv-resizable-input { resize: vertical; min-height: 60px; max-height: 300px; }

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
    #coolauxv-chat-toggle {
        cursor: pointer;
        font-size: 12px;
        color: #3b82f6;
        background: transparent;
        border: none;
        padding: 2px 6px;
        border-radius: 4px;
    }
    #coolauxv-chat-toggle:hover {
        background: #e0efff;
    }
    #coolauxv-chat-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
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
    #coolauxv-chat-input {
        width: 100%;
        min-height: 70px;
        max-height: 60vh;
        resize: vertical !important;
        overflow: auto;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 8px;
        font-size: 14px;
        box-sizing: border-box;
        font-family: inherit;
    }
    #coolauxv-chat-actions { display: flex; }
    #coolauxv-chat-actions > .coolauxv-action-btn { margin-right: 10px; }
    #coolauxv-chat-actions > .coolauxv-action-btn:last-child { margin-right: 0; }
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

    /* ============================
       统一按钮风格 (Action Buttons)
       ============================ */
    .coolauxv-action-btn {
        display: flex; align-items: center; justify-content: center;
        padding: 8px 12px; border-radius: 8px;
        cursor: pointer; user-select: none;
        font-size: 13px; font-weight: 600;
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

    /* 特定颜色的变种 (通过 style 覆盖，但保留 hover 动画) */
    .coolauxv-btn-primary { background: #e0f2fe; color: #0284c7; border-color: #bae6fd; }
    .coolauxv-btn-primary:hover { background: #bae6fd; }

    .coolauxv-btn-purple { background: #6d28d9; color: #fff; border-color: #5b21b6; }
    .coolauxv-btn-purple:hover { background: #5b21b6; }

    .coolauxv-btn-blue { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
    .coolauxv-btn-blue:hover { background: #bfdbfe; }

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
    .coolauxv-markdown code { background-color: #f3f4f6; color: #c2410c; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
    .coolauxv-markdown pre { background-color: #1f2937; color: #f9fafb; padding: 10px; border-radius: 6px; overflow-x: auto; margin: 10px 0; text-align: left !important; }
    .coolauxv-raw-text { white-space: pre-wrap; font-family: monospace; color: #444; }

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

    /* 3. 首页输入框：高对比度 + 气泡感 */
    .coolauxv-blur-glass-enabled #coolauxv-input {
        background-color: rgba(255, 255, 255, 0.75) !important;
        border: 1px solid rgba(255, 255, 255, 0.6) !important;
        box-shadow: inset 0 1px 4px rgba(0,0,0,0.05);
        color: #000 !important;
    }
    .coolauxv-blur-glass-enabled #coolauxv-input:focus {
        background-color: rgba(255, 255, 255, 0.95) !important;
        box-shadow: 0 0 8px rgba(255,255,255,0.8) !important;
    }

    /* 4. 设置页面的输入框：液态玻璃风格 */
    .coolauxv-blur-glass-enabled .coolauxv-setting-input {
        background-color: rgba(255, 255, 255, 0.6) !important;
        border: 1px solid rgba(255, 255, 255, 0.5) !important;
        transition: all 0.2s;
    }
    .coolauxv-blur-glass-enabled .coolauxv-setting-input:focus {
        background-color: rgba(255, 255, 255, 0.9) !important;
        border-color: #3b82f6 !important;
    }

    /* 5. 结果显示区：雾白背景 */
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

    /* 6. 功能按钮：半透明磨砂 */
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

    /* 7. 分隔条 */
    .coolauxv-blur-glass-enabled #coolauxv-separator {
        background: rgba(255, 255, 255, 0.5) !important;
    }

    /* 8. 模型按钮样式 (特定) */
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

    // --- 2. 状态变量 ---
    let popup, floatBall, cursorBtn;
    let currentSelection = "";
    let lastSelectionText = "";
    let isIconDismissed = false;

    let isShowRaw = DEFAULT_SHOW_RAW;
    let isShowReasoning = DEFAULT_SHOW_REASONING;
    let isQuitted = false;

    let abortController = null;
    let gmRequest = null;
    let streamTextBuffer = "";
    let streamReasoningBuffer = "";
    let hasReasoning = false;
    let streamMode = "single";

    let historyRecords = [];
    let chatMessages = [];
    let chatDisplayBuffer = "";
    let chatSessionStarted = false;
    let chatCapturedImageBase64 = "";
    let chatImageStore = {};
    let chatImageCounter = 0;
    let chatAssistantBuffer = "";
    let chatPendingAssistantPrefix = "";
    let isChatCollapsed = true;
    let updateChatCollapseUI = () => {};

    let lastRenderedText = "";
    let lastRenderedReasoning = "";
    let isRendering = false;

    let selectionTimer = null;
    let isWindowDragging = false;
    let isSplitterDragging = false;
    let activeActionToken = 0;

    function initUI() {
        try {
            cursorBtn = document.createElement("div");
            cursorBtn.id = "coolauxv-translate-icon";
            cursorBtn.innerText = "译";
            Object.assign(cursorBtn.style, { display: "none", position: "absolute" });

            const onIconClick = (e) => {
                if (isQuitted) return;
                e.preventDefault(); e.stopPropagation();

                // 每次点击浮窗图标（重新激活），清空截图和预览状态，回归文本模式
                capturedImageBase64 = "";
                const btnPreview = popup.querySelector("#coolauxv-btn-preview");
                if (btnPreview) btnPreview.style.display = "none";

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
                    popup.style.display = "flex";

                    checkUpdateAndShowChangelog();
                }

                const mainView = popup.querySelector("#coolauxv-main-view");
                const settingsView = popup.querySelector("#coolauxv-settings-view");
                if (mainView) mainView.style.display = "flex";
                if (settingsView) settingsView.style.display = "none";

                // 点击图标默认执行文本翻译
                doAction("translate");
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
                floatBall.style.display = "none";
                resetPopupState();
                popup.style.display = "flex";
                checkUpdateAndShowChangelog();
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
            Object.assign(popup.style, {
                display: "none", flexDirection: "column", position: "fixed",
                zIndex: "2147483646",
                background: "white", boxShadow: "0 0 50px rgba(0,0,0,0.5)",
                borderRadius: "12px", border: "1px solid #e0e0e0", overflow: "hidden"
            });
            resetPopupState();

            // 生成模型按钮 HTML (带字段区分)
            // 根据 tag 动态色系：色弱友好 + 与白底保持对比
            const stringToColorStyles = (str) => {
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    hash = str.charCodeAt(i) + ((hash << 5) - hash);
                }

                const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

                // 色弱友好调色板：避免大面积绿紫偏色，拉开色相与亮度差异
                const palette = [
                    { h: 210, s: 60, bgL: 88 }, // 蓝
                    { h: 30, s: 78, bgL: 90 },  // 橙
                    { h: 170, s: 55, bgL: 86 }, // 青绿
                    { h: 50, s: 82, bgL: 91 },  // 金黄
                    { h: 275, s: 55, bgL: 88 }, // 靛紫
                    { h: 330, s: 60, bgL: 89 }, // 品红
                    { h: 0, s: 68, bgL: 90 },   // 红
                    { h: 195, s: 70, bgL: 88 }, // 青蓝
                    { h: 240, s: 55, bgL: 87 }, // 靛蓝
                    { h: 15, s: 70, bgL: 89 },  // 朱橙
                    { h: 300, s: 58, bgL: 88 }, // 紫红
                    { h: 100, s: 50, bgL: 85 }  // 黄绿(偏黄，避免纯绿)
                ];

                const idx = Math.abs(hash) % palette.length;
                const base = palette[idx];
                const variant = Math.abs(hash >> 6) % 3; // 0..2
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

            const generateGroupedBtns = (models, fieldName) => {
                const groups = {};
                models.forEach(m => {
                    if (!groups[m.class]) groups[m.class] = [];
                    groups[m.class].push(m);
                });

                return Object.keys(groups).map(className => `
                    <div class="coolauxv-sub-label" style="font-size: 12px; color: #999; margin: 8px 0 4px 0;">${className}</div>
                    <div class="coolauxv-tag-container">
                                                ${groups[className].map(m => {
                    const c = stringToColorStyles(m.tag);
                    return `
                            <!--
                                样式逻辑：
                                1. 背景色极浅 (bg)
                                2. 边框很淡 (border)
                                3. 文字极深 (text) - 这会覆盖内部所有文字颜色
                            -->
                            <div class="coolauxv-model-btn" data-field="${fieldName}" data-val="${m.id}" data-tag="${m.tag}"
                                 style="background:${c.bg}; border: 1px solid ${c.border}; color:${c.text};">

                                <span class="coolauxv-model-name">${m.id}</span>

                                <!-- Tag 使用次级颜色，或者直接继承主色 -->
                                <span class="coolauxv-model-tag" style="color:${c.tag}">${m.tag}</span>
                            </div>
                            `;
                }).join("")}
                    </div>
                `).join("");
            };

            const textModelsHTML = generateGroupedBtns(TEXT_MODELS, "coolauxv_model_name");
            const visionModelsHTML = generateGroupedBtns(VISION_MODELS, "coolauxv_model_vision");

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
              <div style="display:flex; align-items:center; flex-wrap:wrap;">
                <span style="font-weight:800; color:#a516e8; margin-right:10px;">⚡ CoolAuxv</span>

                <span id="coolauxv-settings-btn" class="coolauxv-ctrl-btn" title="设置" style="font-size:16px;">⚙️</span>

                <label class="coolauxv-toggle-label" title="显示原文" style="margin-left:8px;">
                    <input type="checkbox" id="coolauxv-raw-toggle" ${DEFAULT_SHOW_RAW ? "checked" : ""}>原文
                </label>
                <label class="coolauxv-toggle-label" id="coolauxv-reasoning-toggle-container" style="display:none;" title="显示推理">
                    <input type="checkbox" id="coolauxv-reasoning-toggle" ${DEFAULT_SHOW_REASONING ? "checked" : ""}>显示推理
                </label>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                <span id="coolauxv-quit" class="coolauxv-ctrl-btn" title="退出">⏻</span>
                <span id="coolauxv-min" class="coolauxv-ctrl-btn" title="最小化">－</span>
                <span id="coolauxv-close" class="coolauxv-ctrl-btn" title="关闭">×</span>
              </div>
            </div>

            <!-- 主界面 -->
            <div id="coolauxv-main-view">
                <div style="padding:15px; flex:1; display:flex; flex-direction:column; overflow:hidden;">

                  <div style="position:relative; width:100%; margin-bottom:10px; flex-shrink:0;">
                      <textarea id="coolauxv-input" placeholder="输入内容..." style="width:100%; height:70px; border:1px solid #ddd; border-radius:8px; padding:8px 24px 8px 8px; box-sizing:border-box; font-size:14px; resize:none; font-family:inherit;"></textarea>
                      <div style="position:absolute; right:2px; top:0; bottom:0; display:flex; flex-direction:column; justify-content:center; gap:4px;">
                          <span id="coolauxv-btn-input-clear" class="coolauxv-input-ctrl-btn" title="清空">✕</span>
                          <span id="coolauxv-btn-input-paste" class="coolauxv-input-ctrl-btn" title="粘贴">📋</span>
                      </div>
                  </div>

                  <div style="display:flex; gap:10px; margin-bottom:10px; flex-shrink:0;">
                      <!-- 翻译按钮：默认灰色风格 -->
                      <button id="coolauxv-btn-trans" class="coolauxv-action-btn" style="flex:1;">翻译</button>

                      <!-- 解读按钮：紫色风格 -->
                      <button id="coolauxv-btn-explain" class="coolauxv-action-btn coolauxv-btn-purple" style="flex:1;">解读</button>

                      <!-- 识屏按钮：蓝色风格 -->
                      <button id="coolauxv-btn-screenshot" class="coolauxv-action-btn coolauxv-btn-blue" style="flex:0.4; white-space:nowrap;" title="截取屏幕并分析">📷 识屏</button>

                      <!-- 预览按钮：默认风格 -->
                      <button id="coolauxv-btn-preview" class="coolauxv-action-btn" style="display:none; flex:0.3; font-size:14px;" title="预览截图">🔍</button>
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
                          <div id="coolauxv-result" class="coolauxv-scroll-box"></div>
                      </div>
                  </div>

                  <div id="coolauxv-chat-bar">
                      <div id="coolauxv-chat-header">
                          <span>连续对话</span>
                          <button type="button" id="coolauxv-chat-toggle">收起</button>
                      </div>
                      <div id="coolauxv-chat-body">
                          <textarea id="coolauxv-chat-input" placeholder="连续对话输入..."></textarea>
                          <div id="coolauxv-chat-actions">
                              <button id="coolauxv-btn-screenshot-chat" class="coolauxv-action-btn coolauxv-btn-blue" style="flex:0.4; white-space:nowrap;" title="截取屏幕并分析">📷 识屏</button>
                              <button id="coolauxv-btn-preview-chat" class="coolauxv-action-btn coolauxv-animated-visibility" style="display:none; flex:0.3; font-size:14px;" title="预览截图">🔍</button>
                              <button id="coolauxv-btn-clear-chat-shot" class="coolauxv-action-btn coolauxv-animated-visibility" style="display:none; flex:0.3; font-size:14px;" title="清除识屏">🗑 清除</button>
                              <button id="coolauxv-btn-chat-send" class="coolauxv-action-btn coolauxv-btn-primary" style="flex:1;">发送</button>
                          </div>
                      </div>
                  </div>
                </div>
            </div>

            <!-- 设置界面 -->
            <div id="coolauxv-settings-view">
                <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">
                    ⚙️ 配置设置
                    <a href="https://github.com/CoolestEnoch/CoolAuxv" target="_blank" class="coolauxv-github-btn" title="查看源码与文档">
                        <svg height="16" width="16" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
                        CoolAuxv (GitHub)
                    </a>
                </h3>

                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">
                        API KEY
                        <span id="coolauxv-btn-toggle-key" class="coolauxv-link-btn" style="margin-left:auto; cursor:pointer; user-select:none;">👁️ 显示</span>
                        <a href="https://bigmodel.cn/usercenter/proj-mgmt/apikeys" target="_blank" class="coolauxv-link-btn" title="打开智谱平台获取Key">🔑 获取KEY</a>
                    </label>
                    <input type="password" id="coolauxv-cfg-key" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="${DEFAULT_API_KEY}">
                </div>

                <div class="coolauxv-setting-group">
                    <!-- 黑色大标题：文本模型 -->
                    <label class="coolauxv-setting-label">
                        文本模型 (Text Models)
                        <a href="https://bigmodel.cn/pricing" target="_blank" class="coolauxv-link-btn" title="查看定价">💵 定价</a>
                    </label>
                    <input type="text" id="coolauxv-cfg-model" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="默认: ${DEFAULT_MODEL_NAME}">

                    <!-- 插入自动生成的文本模型分组 (包含灰色小标题和按钮) -->
                    ${textModelsHTML}
                </div>

                <div class="coolauxv-setting-group">
                    <!-- 黑色大标题：视觉模型 -->
                    <label class="coolauxv-setting-label">视觉模型 (Vision Models)</label>
                    <input type="text" id="coolauxv-cfg-model-vision" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="默认: ${DEFAULT_VISION_MODEL}">

                    <!-- 插入自动生成的视觉模型分组 -->
                    ${visionModelsHTML}
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
                    <label class="coolauxv-setting-label">
                        翻译提示词
                        <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                            <input type="checkbox" id="coolauxv-cfg-append-trans"> 追加
                        </label>
                    </label>
                    <textarea id="coolauxv-cfg-prompt-trans" class="coolauxv-setting-input coolauxv-resizable-input" rows="3" placeholder="默认提示词..."></textarea>
                </div>

                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">
                        解读提示词
                        <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                            <input type="checkbox" id="coolauxv-cfg-append-explain"> 追加
                        </label>
                    </label>
                    <textarea id="coolauxv-cfg-prompt-explain" class="coolauxv-setting-input coolauxv-resizable-input" rows="3" placeholder="默认提示词..."></textarea>
                </div>

                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">
                        识图提示词
                        <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                            <input type="checkbox" id="coolauxv-cfg-append-vision"> 追加
                        </label>
                    </label>
                    <textarea id="coolauxv-cfg-prompt-vision" class="coolauxv-setting-input coolauxv-resizable-input" rows="3" placeholder="默认: ${DEFAULT_PROMPT_VISION}"></textarea>
                </div>

                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">
                        连续对话提示词
                        <label class="coolauxv-toggle-label" style="margin-left:auto; width:auto; background:none; padding:0; border:none; font-weight:normal;">
                            <input type="checkbox" id="coolauxv-cfg-append-chat"> 追加
                        </label>
                    </label>
                    <textarea id="coolauxv-cfg-prompt-chat" class="coolauxv-setting-input coolauxv-resizable-input" rows="3" placeholder="默认: ${DEFAULT_PROMPT_CONTINUOUS_CHAT}"></textarea>
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
                    <div style="display:flex; flex-wrap:wrap; gap:15px; align-items:center;">
                        <label class="coolauxv-toggle-label" style="width:auto; background:none; padding:0; border:none;">
                            <input type="checkbox" id="coolauxv-cfg-blur-glass"> 流体玻璃 (Blur Glass)
                        </label>
                        <label class="coolauxv-toggle-label" style="width:auto; background:none; padding:0; border:none;">
                            <input type="checkbox" id="coolauxv-cfg-persistent-ball"> 悬浮球常驻
                        </label>
                        <label class="coolauxv-toggle-label" style="width:auto; background:none; padding:0; border:none;">
                            <input type="checkbox" id="coolauxv-cfg-draggable-ball"> 悬浮球可拖动
                        </label>
                    </div>
                </div>

                <!-- 实验性功能 Group -->
                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label" style="color:#e65100;">🧪 实验性功能 (Experimental)</label>

                    <!-- 第一行：标签 + 下拉框 (Flex横向排列) -->
                    <div style="display:flex; align-items:center; gap:10px; margin-top:5px;">
                        <span style="font-size:13px; color:#555;">截屏算法版本</span>
                        <select id="coolauxv-cfg-new-screenshot" style="padding:4px 8px; border:1px solid #ddd; border-radius:4px; font-size:12px; background:#fff;">
                            <option value="v1">v1 (默认 - 旧算法)</option>
                            <option value="v2">v2 (html2canvas 全屏)</option>
                            <option value="v3">v3 (原生接口 - 屏幕共享)</option>
                        </select>
                    </div>

                    <!-- 第二行：提示文字 (独立div，Block纵向排列) -->
                    <div style="display:block; margin-top:6px; font-size:11px; color:#999; line-height:1.4;">
                        v1: 兼容性最好; v2: 修复错位; v3: 更通用，但Android可能不能用
                    </div>

                    <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
                        <label class="coolauxv-toggle-label" style="width:auto; background:none; padding:0; border:none;">
                            <input type="checkbox" id="coolauxv-cfg-continuous-chat"> 连续对话
                        </label>
                        <span style="font-size:11px; color:#999;">使用视觉模型</span>
                    </div>
                </div>


                <div class="coolauxv-reset-btn" id="coolauxv-cfg-reset">⚠️ 重置所有配置</div>
            </div>

            <div id="coolauxv-resize-handle"><svg id="coolauxv-resize-icon" viewBox="0 0 10 10"><path d="M10 10 L10 2 L2 10 Z" /></svg></div>
            `;
            document.body.appendChild(popup);

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
            console.error("初始化失败:", e);
        }
    }

    // --- 3. 设置逻辑 ---
    function initSettingsLogic() {
        const mainView = popup.querySelector("#coolauxv-main-view");
        const settingsView = popup.querySelector("#coolauxv-settings-view");
        const settingsBtn = popup.querySelector("#coolauxv-settings-btn");
        const resetBtn = popup.querySelector("#coolauxv-cfg-reset");

        if (!mainView || !settingsView) return;

        // --- 切换逻辑核心 ---
        if (settingsBtn) {
            settingsBtn.onclick = () => {
                // 如果设置界面正在显示，则切换回主界面
                if (settingsView.style.display === "flex") {
                    settingsView.style.display = "none";
                    mainView.style.display = "flex";
                }
                // 否则（在主界面），切换到设置界面
                else {
                    loadConfig(); // 进入设置时重新加载配置，确保显示最新值
                    mainView.style.display = "none";
                    settingsView.style.display = "flex";
                }
            };
        }

        // --- 通用的配置加载与保存逻辑 ---
        const clearableInputs = [
            "coolauxv-cfg-key", "coolauxv-cfg-model",
            "coolauxv-cfg-model-vision",
            "coolauxv-cfg-width", "coolauxv-cfg-height",
            "coolauxv-cfg-prompt-trans", "coolauxv-cfg-prompt-explain",
            "coolauxv-cfg-prompt-vision",
            "coolauxv-cfg-prompt-chat"
        ];
        clearableInputs.forEach(id => {
            const input = popup.querySelector(`#${id}`);
            if (input) {
                // 防止重复添加 wrapper (虽然 init 理论上只运行一次，但为了稳健性)
                if (input.parentNode.classList.contains("coolauxv-input-wrapper")) return;

                const wrapper = document.createElement("div");
                wrapper.className = "coolauxv-input-wrapper";
                input.parentNode.insertBefore(wrapper, input);
                wrapper.appendChild(input);

                const clearBtn = document.createElement("span");
                clearBtn.className = "coolauxv-clear-icon";
                clearBtn.innerText = "×";
                clearBtn.title = "清空配置";
                wrapper.appendChild(clearBtn);

                clearBtn.onclick = () => {
                    input.value = "";
                    input.dispatchEvent(new Event('input'));
                    input.focus();
                };
            }
        });

        const inputKey = popup.querySelector("#coolauxv-cfg-key");
        // API Key 显隐切换逻辑
        const btnToggleKey = popup.querySelector("#coolauxv-btn-toggle-key");
        if (inputKey && btnToggleKey) {
            btnToggleKey.onclick = () => {
                if (inputKey.type === "password") {
                    inputKey.type = "text";
                    btnToggleKey.innerText = "🔒 隐藏";
                } else {
                    inputKey.type = "password";
                    btnToggleKey.innerText = "👁️ 显示";
                }
            };
        }
        const inputModel = popup.querySelector("#coolauxv-cfg-model");
        const inputModelVision = popup.querySelector("#coolauxv-cfg-model-vision");
        const inputWidth = popup.querySelector("#coolauxv-cfg-width");
        const inputHeight = popup.querySelector("#coolauxv-cfg-height");
        const inputPromptTrans = popup.querySelector("#coolauxv-cfg-prompt-trans");
        const inputPromptExplain = popup.querySelector("#coolauxv-cfg-prompt-explain");
        const inputPromptVision = popup.querySelector("#coolauxv-cfg-prompt-vision");
        const inputPromptChat = popup.querySelector("#coolauxv-cfg-prompt-chat");
        const inputAppendTrans = popup.querySelector("#coolauxv-cfg-append-trans");
        const inputAppendExplain = popup.querySelector("#coolauxv-cfg-append-explain");
        const inputAppendVision = popup.querySelector("#coolauxv-cfg-append-vision");
        const inputAppendChat = popup.querySelector("#coolauxv-cfg-append-chat");
        const inputPdfUrl = popup.querySelector("#coolauxv-pdf-url");
        const btnClearPdf = popup.querySelector("#coolauxv-btn-clear-pdf");
        const btnPdfLink = popup.querySelector("#coolauxv-btn-pdf-link");
        const inputPdfFile = popup.querySelector("#coolauxv-input-pdf-file");
        const btnPdfLocalOnline = popup.querySelector("#coolauxv-btn-pdf-local-online");
        const inputBlurGlass = popup.querySelector("#coolauxv-cfg-blur-glass");
        const inputPersistentBall = popup.querySelector("#coolauxv-cfg-persistent-ball");
        const inputDraggableBall = popup.querySelector("#coolauxv-cfg-draggable-ball");
        const modelBtns = popup.querySelectorAll(".coolauxv-model-btn");
        const radioBtns = popup.querySelectorAll('input[name="coolauxv_log_level_radio"]');
        const inputNewScreenshot = popup.querySelector("#coolauxv-cfg-new-screenshot");
        const inputContinuousChat = popup.querySelector("#coolauxv-cfg-continuous-chat");
        const chatBar = popup.querySelector("#coolauxv-chat-bar");
        const chatBody = popup.querySelector("#coolauxv-chat-body");
        const chatToggleBtn = popup.querySelector("#coolauxv-chat-toggle");
        const chatInput = popup.querySelector("#coolauxv-chat-input");

        radioBtns.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    saveConfig("coolauxv_log_level", e.target.value);
                }
            });
        });

        const saveConfig = (key, value) => {
            const val = value.trim();
            if (val) GM_setValue(key, val);
            else GM_deleteValue(key);
        };

        const toggleContinuousChat = (enabled) => {
            if (!chatBar) return;
            chatBar.style.display = enabled ? "flex" : "none";
            if (enabled) {
                isChatCollapsed = true;
                requestAnimationFrame(() => updateChatCollapseUI());
            }
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

        updateChatCollapseUI = () => {
            if (!chatBody || !chatToggleBtn || !chatBar) return;
            const resultDiv = popup.querySelector("#coolauxv-result");
            const wasNearBottom = resultDiv
                ? (resultDiv.scrollHeight - resultDiv.scrollTop - resultDiv.clientHeight <= 30)
                : false;
            const pinnedScrollTop = resultDiv ? resultDiv.scrollTop : 0;

            chatToggleBtn.textContent = isChatCollapsed ? "展开" : "收起";
            chatBar.classList.toggle("coolauxv-chat-collapsed", isChatCollapsed);
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
        };

        if (chatToggleBtn) {
            chatToggleBtn.onclick = () => {
                isChatCollapsed = !isChatCollapsed;
                updateChatCollapseUI();
            };
        }

        if (chatInput && chatBody) {
            if (typeof ResizeObserver !== "undefined") {
                const chatInputObserver = new ResizeObserver(() => {
                    syncChatBodyHeight();
                });
                chatInputObserver.observe(chatInput);
            } else {
                const onChatInputResize = () => {
                    requestAnimationFrame(() => syncChatBodyHeight());
                };
                chatInput.addEventListener("input", onChatInputResize);
                chatInput.addEventListener("mouseup", onChatInputResize);
            }
        }

        const loadConfig = () => {
            if (inputKey) inputKey.value = GM_getValue("coolauxv_api_key", "");
            if (inputModel) inputModel.value = GM_getValue("coolauxv_model_name", "");
            if (inputWidth) inputWidth.value = GM_getValue("coolauxv_win_width", "");
            if (inputHeight) inputHeight.value = GM_getValue("coolauxv_win_height", "");
            if (inputPromptTrans) inputPromptTrans.value = GM_getValue("coolauxv_prompt_trans", "");
            if (inputPromptExplain) inputPromptExplain.value = GM_getValue("coolauxv_prompt_explain", "");
            if (inputPromptChat) inputPromptChat.value = GM_getValue("coolauxv_prompt_chat", "");
            if (inputAppendTrans) inputAppendTrans.checked = GM_getValue("coolauxv_append_trans", false);
            if (inputAppendExplain) inputAppendExplain.checked = GM_getValue("coolauxv_append_explain", false);
            if (inputAppendVision) inputAppendVision.checked = GM_getValue("coolauxv_append_vision", false);
            if (inputAppendChat) inputAppendChat.checked = GM_getValue("coolauxv_append_chat", false);

            const currentLevel = GM_getValue("coolauxv_log_level", DEFAULT_LOG_LEVEL); // 这里的默认值要与常量一致
            const targetRadio = popup.querySelector(`input[name="coolauxv_log_level_radio"][value="${currentLevel}"]`);
            if (targetRadio) targetRadio.checked = true;

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
                // 兼容旧版配置 (true->v2, false->v1)
                if (val === true) val = "v2";
                if (val === false) val = "v1";
                inputNewScreenshot.value = val;
            }
            if (inputModelVision) inputModelVision.value = GM_getValue("coolauxv_model_vision", "");
            if (inputPromptVision) inputPromptVision.value = GM_getValue("coolauxv_prompt_vision", "");
            if (inputContinuousChat) inputContinuousChat.checked = GM_getValue("coolauxv_enable_continuous_chat", DEFAULT_ENABLE_CONTINUOUS_CHAT);
        };

        if (resetBtn) resetBtn.onclick = () => {
            if (confirm("确定要重置所有配置吗？\n所有自定义设置将恢复为默认值。")) {
                GM_deleteValue("coolauxv_api_key");
                GM_deleteValue("coolauxv_model_name");
                GM_deleteValue("coolauxv_win_width");
                GM_deleteValue("coolauxv_win_height");
                GM_deleteValue("coolauxv_log_level");
                GM_deleteValue("coolauxv_prompt_trans");
                GM_deleteValue("coolauxv_prompt_explain");
                GM_deleteValue("coolauxv_prompt_chat");
                GM_deleteValue("coolauxv_model_vision");
                GM_deleteValue("coolauxv_prompt_vision");
                GM_deleteValue("coolauxv_append_trans");
                GM_deleteValue("coolauxv_append_explain");
                GM_deleteValue("coolauxv_append_vision");
                GM_deleteValue("coolauxv_append_chat");
                GM_deleteValue("coolauxv_use_new_screenshot");
                GM_deleteValue("coolauxv_enable_continuous_chat");
                GM_deleteValue("coolauxv_enable_blur_glass");
                GM_deleteValue("coolauxv_persistent_ball");
                GM_deleteValue("coolauxv_draggable_ball");
                GM_deleteValue("coolauxv_installed_version"); // 重置更新状态
                loadConfig();
                // 重置 Radio
                const defaultRadio = popup.querySelector(`input[name="coolauxv_log_level_radio"][value="${DEFAULT_LOG_LEVEL}"]`);
                if (defaultRadio) defaultRadio.checked = true;
                if (inputBlurGlass) {
                    inputBlurGlass.checked = DEFAULT_ENABLE_BLUR_GLASS;
                    toggleBlurGlass(DEFAULT_ENABLE_BLUR_GLASS);
                }
                if (inputPersistentBall) inputPersistentBall.checked = false;
                if (inputDraggableBall) inputDraggableBall.checked = false;
                // 重置 Checkbox 状态
                if (inputNewScreenshot) inputNewScreenshot.value = DEFAULT_USE_NEW_SCREENSHOT;
                if (inputAppendTrans) inputAppendTrans.checked = false;
                if (inputAppendExplain) inputAppendExplain.checked = false;
                if (inputAppendVision) inputAppendVision.checked = false;
                if (inputAppendChat) inputAppendChat.checked = false;
                if (inputContinuousChat) {
                    inputContinuousChat.checked = DEFAULT_ENABLE_CONTINUOUS_CHAT;
                    toggleContinuousChat(DEFAULT_ENABLE_CONTINUOUS_CHAT);
                }
                alert("配置已重置。");
            }
        };

        if (inputKey) inputKey.addEventListener("input", (e) => saveConfig("coolauxv_api_key", e.target.value));
        if (inputModel) inputModel.addEventListener("input", (e) => saveConfig("coolauxv_model_name", e.target.value));
        if (inputWidth) inputWidth.addEventListener("input", (e) => saveConfig("coolauxv_win_width", e.target.value));
        if (inputHeight) inputHeight.addEventListener("input", (e) => saveConfig("coolauxv_win_height", e.target.value));
        if (inputPromptTrans) inputPromptTrans.addEventListener("input", (e) => saveConfig("coolauxv_prompt_trans", e.target.value));
        if (inputPromptExplain) inputPromptExplain.addEventListener("input", (e) => saveConfig("coolauxv_prompt_explain", e.target.value));
        if (inputPromptChat) inputPromptChat.addEventListener("input", (e) => saveConfig("coolauxv_prompt_chat", e.target.value));
        if (inputModelVision) inputModelVision.addEventListener("input", (e) => saveConfig("coolauxv_model_vision", e.target.value));
        if (inputPromptVision) inputPromptVision.addEventListener("input", (e) => saveConfig("coolauxv_prompt_vision", e.target.value));
        if (inputAppendTrans) inputAppendTrans.addEventListener("change", (e) => GM_setValue("coolauxv_append_trans", e.target.checked));
        if (inputAppendExplain) inputAppendExplain.addEventListener("change", (e) => GM_setValue("coolauxv_append_explain", e.target.checked));
        if (inputAppendVision) inputAppendVision.addEventListener("change", (e) => GM_setValue("coolauxv_append_vision", e.target.checked));
        if (inputAppendChat) inputAppendChat.addEventListener("change", (e) => GM_setValue("coolauxv_append_chat", e.target.checked));
        if (inputContinuousChat) {
            inputContinuousChat.addEventListener("change", (e) => {
                const enabled = e.target.checked;
                GM_setValue("coolauxv_enable_continuous_chat", enabled);
                toggleContinuousChat(enabled);
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

        // pdf阅读器
        // UI 交互：清空按钮
        if (inputPdfUrl && btnClearPdf) {
            inputPdfUrl.addEventListener("input", () => btnClearPdf.style.display = inputPdfUrl.value ? "block" : "none");
            btnClearPdf.onclick = () => { inputPdfUrl.value = ""; btnClearPdf.style.display = "none"; inputPdfUrl.focus(); };
        }

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

        modelBtns.forEach(btn => {
            btn.onclick = () => {
                const val = btn.dataset.val;
                const field = btn.dataset.field;
                if (field === "coolauxv_model_name" && inputModel) {
                    inputModel.value = val;
                    inputModel.dispatchEvent(new Event('input'));
                } else if (field === "coolauxv_model_vision" && inputModelVision) {
                    inputModelVision.value = val;
                    inputModelVision.dispatchEvent(new Event('input'));
                }
            };
        });
        toggleBlurGlass(GM_getValue("coolauxv_enable_blur_glass", DEFAULT_ENABLE_BLUR_GLASS));
        toggleContinuousChat(GM_getValue("coolauxv_enable_continuous_chat", DEFAULT_ENABLE_CONTINUOUS_CHAT));
        updateChatCollapseUI();
    }

    function getActiveConfig() {
        // 辅助函数：处理提示词逻辑
        // 如果自定义为空 -> 用默认
        // 如果自定义不为空：
        //    -> 勾选了追加 -> 默认 + 换行 + 自定义
        //    -> 没勾选追加 -> 自定义
        const getFinalPrompt = (keyCustom, keyAppend, defaultText) => {
            const custom = GM_getValue(keyCustom, "").trim();
            const isAppend = GM_getValue(keyAppend, false);

            if (!custom) return defaultText;
            if (isAppend) return defaultText + "\n" + custom;
            return custom;
        };

        return {
            apiKey: GM_getValue("coolauxv_api_key") || DEFAULT_API_KEY,
            modelName: GM_getValue("coolauxv_model_name") || DEFAULT_MODEL_NAME,

            // 使用辅助函数生成最终提示词
            promptTrans: getFinalPrompt("coolauxv_prompt_trans", "coolauxv_append_trans", DEFAULT_PROMPT_TRANSLATE),
            promptExplain: getFinalPrompt("coolauxv_prompt_explain", "coolauxv_append_explain", DEFAULT_PROMPT_EXPLAIN),

            modelVision: GM_getValue("coolauxv_model_vision") || DEFAULT_VISION_MODEL,
            promptVision: getFinalPrompt("coolauxv_prompt_vision", "coolauxv_append_vision", DEFAULT_PROMPT_VISION),
            promptContinuousChat: getFinalPrompt("coolauxv_prompt_chat", "coolauxv_append_chat", DEFAULT_PROMPT_CONTINUOUS_CHAT)
        };
    }

    function buildUserMessageContent(text, imageBase64) {
        if (imageBase64) {
            return [
                { type: "image_url", image_url: { url: imageBase64 } },
                { type: "text", text: text || "" }
            ];
        }
        return text || "";
    }

    function formatChatUserBlock(userText, imageId, isFirst) {
        const safeText = userText ? userText : (imageId ? "（仅识屏）" : "");
        let block = "";
        if (!isFirst) block += "\n\n---\n\n";
        block += `**👤 用户：**\n${safeText}\n`;
        if (imageId) {
            block += `\n<button type="button" class="coolauxv-chat-preview-btn" data-chat-img-id="${imageId}">🔍 预览识屏</button>\n`;
        }
        return block;
    }

    function getChatAssistantPrefix() {
        return "\n\n**🤖 AI：**\n";
    }

    function buildChatAssistantBlock(text) {
        return getChatAssistantPrefix() + (text || "");
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
        chatMessages = [];
        chatDisplayBuffer = "";
        chatImageStore = {};
        chatImageCounter = 0;
        const config = getActiveConfig();

        historyRecords.forEach((entry) => {
            if (entry.systemPrompt) chatMessages.push({ role: "system", content: entry.systemPrompt });

            const userContent = buildUserMessageContent(entry.userContentText, entry.imageBase64);
            if (userContent !== "") chatMessages.push({ role: "user", content: userContent });
            if (entry.assistantText) chatMessages.push({ role: "assistant", content: entry.assistantText });

            let imageId = null;
            if (entry.imageBase64) {
                imageId = `chat-img-${++chatImageCounter}`;
                chatImageStore[imageId] = entry.imageBase64;
            }
            const displayText = entry.userDisplayText ? entry.userDisplayText : (entry.imageBase64 ? "" : (entry.userContentText || ""));
            const isFirst = chatDisplayBuffer.length === 0;
            chatDisplayBuffer += formatChatUserBlock(displayText, imageId, isFirst);
            if (entry.assistantText) {
                chatDisplayBuffer += buildChatAssistantBlock(entry.assistantText);
            }
        });

        const chatPrompt = (config.promptContinuousChat || "").trim();
        if (chatPrompt) {
            chatMessages.push({ role: "system", content: chatPrompt });
        }
    }

    function updateChatStreamText() {
        if (chatAssistantBuffer) {
            streamTextBuffer = chatDisplayBuffer + chatPendingAssistantPrefix + chatAssistantBuffer;
        } else {
            streamTextBuffer = chatDisplayBuffer;
        }
    }

    function collapseChatIfEnabled() {
        if (!popup) return;
        const enabled = GM_getValue("coolauxv_enable_continuous_chat", DEFAULT_ENABLE_CONTINUOUS_CHAT);
        if (!enabled) return;
        const chatBar = popup.querySelector("#coolauxv-chat-bar");
        if (!chatBar || chatBar.style.display === "none") return;
        if (isChatCollapsed) return;
        isChatCollapsed = true;
        updateChatCollapseUI();
    }

    function autoExpandChatIfEnabled(actionToken) {
        if (!popup) return;
        if (typeof actionToken === "number" && actionToken !== activeActionToken) return;
        const enabled = GM_getValue("coolauxv_enable_continuous_chat", DEFAULT_ENABLE_CONTINUOUS_CHAT);
        if (!enabled) return;
        const chatBar = popup.querySelector("#coolauxv-chat-bar");
        if (!chatBar || chatBar.style.display === "none") return;
        if (!isChatCollapsed) return;
        isChatCollapsed = false;
        updateChatCollapseUI();
    }

    function finalizeChatResponse(actionToken) {
        if (!chatSessionStarted) return;
        if (chatAssistantBuffer) {
            chatMessages.push({ role: "assistant", content: chatAssistantBuffer });
            chatDisplayBuffer += chatPendingAssistantPrefix + chatAssistantBuffer;
        }
        chatAssistantBuffer = "";
        chatPendingAssistantPrefix = "";
        streamTextBuffer = chatDisplayBuffer;
        lastRenderedText = "";
        renderContent();
        autoExpandChatIfEnabled(actionToken);
    }

    function hasChatOutput() {
        if (!chatSessionStarted) return false;
        if (chatAssistantBuffer && chatAssistantBuffer.trim()) return true;
        return chatDisplayBuffer.includes("**🤖 AI：**");
    }

    function shouldSuppressResultError() {
        return hasChatOutput();
    }

    const CHAT_429_HISTORY_TEXT = "429 Error Occured";

    function appendChatError(message, options = {}) {
        const { allowHtml = false, recordAsAssistant = false, recordContent = CHAT_429_HISTORY_TEXT } = options;
        startChatSessionIfNeeded();
        const safeMessage = message || "请求失败";
        const errorContent = allowHtml ? safeMessage : `<span style="color:red">${safeMessage}</span>`;
        const assistantBlock = buildChatAssistantBlock(errorContent);
        if (chatDisplayBuffer) {
            chatDisplayBuffer += assistantBlock;
        } else {
            chatDisplayBuffer = assistantBlock.replace(/^\n+/, "");
        }
        if (recordAsAssistant) {
            chatMessages.push({ role: "assistant", content: recordContent });
        }
        streamTextBuffer = chatDisplayBuffer;
        lastRenderedText = "";
        renderContent();
    }

    function clearChatSessionState() {
        chatMessages = [];
        chatDisplayBuffer = "";
        chatSessionStarted = false;
        chatImageStore = {};
        chatImageCounter = 0;
        chatAssistantBuffer = "";
        chatPendingAssistantPrefix = "";
        streamMode = "single";
        streamTextBuffer = "";
        lastRenderedText = "";
    }

    function clearConversationState() {
        historyRecords = [];
        chatMessages = [];
        chatDisplayBuffer = "";
        chatSessionStarted = false;
        chatImageStore = {};
        chatImageCounter = 0;
        chatAssistantBuffer = "";
        chatPendingAssistantPrefix = "";
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

    function updateScroll(element, newContentHTML, isRaw) {
        const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 30;

        if (isRaw) {
            element.innerText = newContentHTML;
        } else {
            try {
                // === 核心渲染逻辑 ===

                // 1. 数学公式保护 (Math Protection)
                // 使用纯字母数字的占位符 (如 KATEXBLOCK0END)，避免 Markdown 解析器将其识别为粗体/斜体
                const mathBlocks = [];
                let protectedText = newContentHTML
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

                element.innerHTML = htmlContent;

                // 4. KaTeX 公式渲染
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
                console.error("Render Error:", e);
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
    }

    function startRenderLoop() {
        if (isRendering) return;
        isRendering = true;
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

    function stopRenderLoop() { isRendering = false; renderContent(); }

    function setAnimatedVisibility(element, visible) {
        if (!element) return;
        const isVisible = element.classList.contains("coolauxv-visible");
        if (visible) {
            if (isVisible) return;
            element.style.display = "flex";
            void element.offsetWidth;
            element.classList.add("coolauxv-visible");
            return;
        }

        if (!isVisible && element.style.display === "none") return;
        element.classList.remove("coolauxv-visible");
        const onEnd = (e) => {
            if (e.propertyName !== "opacity") return;
            if (!element.classList.contains("coolauxv-visible")) {
                element.style.display = "none";
            }
            element.removeEventListener("transitionend", onEnd);
        };
        element.addEventListener("transitionend", onEnd);
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

        if (visible) {
            const currentHeight = reasoningWrapper.getBoundingClientRect().height;
            if (!isCollapsed && reasoningWrapper.style.display === "flex" && currentHeight > 0) return;
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
                reasoningWrapper.style.display = "none";
            }
            reasoningWrapper.removeEventListener("transitionend", onEnd);
        };
        reasoningWrapper.addEventListener("transitionend", onEnd);
    }
    function minimizeWindow() { popup.style.display = "none"; floatBall.style.display = "block"; }
    function closeWindow() {
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
        if (btnPreview) btnPreview.style.display = "none";
        const btnChatPreview = popup.querySelector("#coolauxv-btn-preview-chat");
        setAnimatedVisibility(btnChatPreview, false);
        const btnChatClear = popup.querySelector("#coolauxv-btn-clear-chat-shot");
        setAnimatedVisibility(btnChatClear, false);

        clearConversationState();

        // --- 悬浮球常驻逻辑 ---
        const isPersistent = GM_getValue("coolauxv_persistent_ball", false);
        if (isPersistent) {
            floatBall.style.display = "block";
        } else {
            floatBall.style.display = "none";
        }
    }

    function quitScript() { if (confirm("确定要退出吗？")) { popup.style.display = "none"; floatBall.style.display = "none"; cursorBtn.style.display = "none"; isQuitted = true; } }

    function bindEvents() {
        const minBtn = popup.querySelector("#coolauxv-min");
        const closeBtn = popup.querySelector("#coolauxv-close");
        const quitBtn = popup.querySelector("#coolauxv-quit");
        const rawToggle = popup.querySelector("#coolauxv-raw-toggle");
        const reasoningToggle = popup.querySelector("#coolauxv-reasoning-toggle");
        const btnTrans = popup.querySelector("#coolauxv-btn-trans");
        const btnExplain = popup.querySelector("#coolauxv-btn-explain");
        const btnChatSend = popup.querySelector("#coolauxv-btn-chat-send");

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
        };

        if (btnTrans) btnTrans.onclick = () => doAction("translate");
        if (btnExplain) btnExplain.onclick = () => doAction("explain");
        if (btnChatSend) btnChatSend.onclick = () => doChatSend();

        const resultDiv = popup.querySelector("#coolauxv-result");
        const previewOverlay = document.querySelector("#coolauxv-img-preview-overlay");
        const previewImg = document.querySelector("#coolauxv-img-preview-el");
        if (resultDiv && previewOverlay && previewImg) {
            resultDiv.addEventListener("click", (e) => {
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

        const checkActive = () => !isQuitted && !isWindowDragging && !isSplitterDragging;

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
                    console.error("复制失败", e);
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
        header.addEventListener("mousedown", (e) => { if (!e.target.closest('.coolauxv-ctrl-btn') && !e.target.closest('label')) startDrag(e.clientX, e.clientY); });
        header.addEventListener("touchstart", (e) => { if (!e.target.closest('.coolauxv-ctrl-btn') && !e.target.closest('label')) { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); } });

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
            console.warn("[CoolAuxv] showModal: Title and content cannot both be empty.");
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
        const currentVer = GM_info.script.version;
        const lastVer = GM_getValue("coolauxv_installed_version", "0.0");

        if (currentVer !== lastVer) {
            showModal(`🎉 更新日志 ${currentVer}`, LATEST_CHANGELOG);
            GM_setValue("coolauxv_installed_version", currentVer);
        }
    }

    // ========================================================================
    // 网络引擎 (Stream)
    // ========================================================================
    async function doAction(mode) {
        const input = popup.querySelector("#coolauxv-input");
        if (!input) return;

        // 检查是否有截图缓存
        if (capturedImageBase64) {
            doImageAnalysis(mode);
            return;
        }

        if (historyRecords.length || chatSessionStarted || chatDisplayBuffer) {
            clearConversationState();
        }

        const text = input.value.trim();
        const resultDiv = popup.querySelector("#coolauxv-result");
        const config = getActiveConfig();
        streamMode = "single";

        if (config.apiKey === DEFAULT_API_KEY || !config.apiKey) {
            if (!shouldSuppressResultError()) {
                showNoKeyError(popup.querySelector("#coolauxv-result"));
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
        resultDiv.innerHTML = "<span style='color:#888'>⏳ AI 思考中...</span>";
        reasoningDiv.innerHTML = ""; reasoningWrapper.style.display = "none"; reasoningToggle.style.display = "none";

        if (abortController) abortController.abort();
        if (gmRequest && gmRequest.abort) gmRequest.abort();

        const url = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
        const systemPrompt = mode === "explain" ? config.promptExplain : config.promptTrans;
        const historyEntry = {
            systemPrompt: systemPrompt,
            userContentText: text,
            userDisplayText: text,
            imageBase64: "",
            assistantText: ""
        };

        const payload = {
            model: config.modelName,
            stream: true,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }]
        };

        // 序列化并打印请求体 (JSON)
        const requestBody = JSON.stringify(payload);
        Logger.debug("🚀 [API Request Data]", requestBody);

        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`
        };

        // 策略 A: Fetch
        try {
            Logger.info(`Fetch Model: ${config.modelName}`);
            abortController = new AbortController();
            const response = await fetch(url, {
                method: "POST",
                headers: headers,
                body: requestBody, // 使用已序列化的字符串
                signal: abortController.signal
            });

            if (!response.ok) {
                if (response.status === 429) {
                    if (!shouldSuppressResultError()) {
                        resultDiv.innerHTML = get429ErrorHTML();
                    }
                    autoExpandChatIfEnabled(actionToken);
                    return;
                }
                if (response.status === 401 || response.status === 403) throw new Error("AUTH_INVALID");
                throw new Error(`HTTP ${response.status}`);
            }

            resultDiv.innerHTML = "";
            startRenderLoop();

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop();
                for (const line of lines) processLine(line);
            }
            stopRenderLoop();
            historyEntry.assistantText = streamTextBuffer;
            recordHistoryEntry(historyEntry);
            autoExpandChatIfEnabled(actionToken);
            return;

        } catch (err) {
            Logger.warn("Fetch 失败/跨域，准备降级。", err);
            if (err.message === "AUTH_INVALID") {
                if (!shouldSuppressResultError()) {
                    showInvalidKeyError(resultDiv);
                }
                autoExpandChatIfEnabled(actionToken);
                return;
            }
            if (err.name === 'AbortError') return;
        }

        // 策略 B: GM_xmlhttpRequest
        Logger.info(`GM_xmlhttpRequest Model: ${config.modelName}`);

        let gmStreamBuffer = "";
        let isStreamModeActive = false;

        gmRequest = GM_xmlhttpRequest({
            method: "POST", url: url,
            headers: headers,
            data: requestBody, // 使用已序列化的字符串
            responseType: 'stream',
            timeout: 600000,

            onloadstart: (res) => {
                if (res.response && res.response.getReader) {
                    isStreamModeActive = true;
                    resultDiv.innerHTML = "";
                    startRenderLoop();

                    const reader = res.response.getReader();
                    const decoder = new TextDecoder("utf-8");

                    (async function readStream() {
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                const chunk = decoder.decode(value, { stream: true });
                                gmStreamBuffer += chunk;
                                const lines = gmStreamBuffer.split(/\r?\n/);
                                gmStreamBuffer = lines.pop();
                                for (const line of lines) processLine(line);
                            }
                        } catch (e) {
                            Logger.error("Stream Read Error:", e);
                        } finally {
                            stopRenderLoop();
                            historyEntry.assistantText = streamTextBuffer;
                            recordHistoryEntry(historyEntry);
                            autoExpandChatIfEnabled(actionToken);
                        }
                    })();
                }
            },

            onload: (res) => {
                if (!isStreamModeActive) {
                    stopRenderLoop();

                    if (res.status === 429) {
                        const resultDiv = popup.querySelector("#coolauxv-result");
                        if (resultDiv && !shouldSuppressResultError()) {
                            resultDiv.innerHTML = get429ErrorHTML();
                        }
                        autoExpandChatIfEnabled(actionToken);
                        return;
                    }

                    const fullText = res.responseText || (typeof res.response === 'string' ? res.response : "");

                    if (res.status === 401 || res.status === 403) {
                        if (!shouldSuppressResultError()) {
                            showInvalidKeyError(resultDiv);
                        }
                        autoExpandChatIfEnabled(actionToken);
                        return;
                    }

                    if (res.status !== 200) {
                        let gmErrMsg = `HTTP ${res.status}`;
                        try { const d = JSON.parse(fullText); if (d.error) gmErrMsg = `API Error: ${d.error.message}`; } catch (e) { }
                        resultDiv.innerHTML = `<span style='color:red'>${gmErrMsg}</span>`;
                        autoExpandChatIfEnabled(actionToken);
                        return;
                    }
                    if (fullText) {
                        const lines = fullText.split(/\r?\n/);
                        for (const line of lines) processLine(line);
                        renderContent();
                        historyEntry.assistantText = streamTextBuffer;
                        recordHistoryEntry(historyEntry);
                        autoExpandChatIfEnabled(actionToken);
                    } else {
                        resultDiv.innerHTML += "<br><small style='color:red'>(流式兼容失败，请检查网络)</small>";
                        autoExpandChatIfEnabled(actionToken);
                    }
                }
            },

            onerror: (e) => {
                stopRenderLoop();
                if (streamTextBuffer.length > 0 || streamReasoningBuffer.length > 0) {
                    resultDiv.innerHTML += "<br><br><span style='color:red; font-size:12px; font-weight:bold;'>[网络连接中断，但已保留现有内容]</span>";
                } else {
                    resultDiv.innerHTML = "<span style='color:red'>网络连接彻底失败</span>";
                }
                autoExpandChatIfEnabled(actionToken);
            },

            ontimeout: () => {
                stopRenderLoop();
                if (streamTextBuffer.length > 0) {
                    resultDiv.innerHTML += "<br><span style='color:red'>[请求超时，已保留内容]</span>";
                } else {
                    resultDiv.innerHTML = "<span style='color:red'>请求超时 (Timeout)</span>";
                }
                autoExpandChatIfEnabled(actionToken);
            }
        });
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

    function processLine(line) {
        line = line.trim();
        if (!line) return;
        if (line.startsWith("data:")) {
            const jsonStr = line.slice(5).trim();
            if (jsonStr === "[DONE]") return;
            try {
                const data = JSON.parse(jsonStr);
                const delta = data.choices[0]?.delta;
                const isChatMode = streamMode === "chat";

                // --- 1. 处理推理内容 (自动展开逻辑) ---
                if (delta?.reasoning_content) {
                    // 回调时机 A：检测到首个推理包
                    // 如果 hasReasoning 为 false，说明这是本轮对话第一次收到推理内容
                    if (!hasReasoning) {
                        hasReasoning = true;
                        // 既然 API 返回了推理内容，说明这是推理模型，立即自动展开
                        Logger.info("检测到推理流，自动展开推理框");
                        setReasoningVisibility(true);
                    }
                    streamReasoningBuffer += delta.reasoning_content;
                }

                // --- 2. 处理正式结果 (自动收起逻辑) ---
                if (delta?.content) {
                    // 回调时机 B：检测到首个正文包
                    // 如果正文缓冲区长度为 0 (说明是正文的第一个字) 且之前有推理内容
                    const isFirstContentChunk = isChatMode ? chatAssistantBuffer.length === 0 : streamTextBuffer.length === 0;
                    if (isFirstContentChunk && hasReasoning) {
                        Logger.info("推理结束，正文开始，自动收起推理框");
                        setReasoningVisibility(false);
                    }
                    if (isChatMode) {
                        chatAssistantBuffer += delta.content;
                        updateChatStreamText();
                    } else {
                        streamTextBuffer += delta.content;
                    }
                }
            } catch (e) {
                Logger.debug("JSON Parse Error (Ignore)", line);
            }
        }
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
                            console.warn("v3 screen share error:", err);

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
                                        **1. Chrome / Edge 浏览器：**
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
                    console.error("识屏初始化失败:", err);
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
                    if (btnPreview) btnPreview.style.display = "inline-block";
                    resetScreenshotUI();
                    popup.style.display = "flex";

                    const input = popup.querySelector("#coolauxv-input");
                    const config = getActiveConfig();
                    if (!input.value.trim()) input.value = config.promptVision;
                    doImageAnalysis('vision');

                } catch (err) {
                    console.error("截图处理失败:", err);
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
    async function doImageAnalysis(mode = 'vision') {
        if (!capturedImageBase64) {
            alert("未获取到图片数据");
            return;
        }

        if (historyRecords.length || chatSessionStarted || chatDisplayBuffer) {
            clearConversationState();
        }

        const config = getActiveConfig();
        const input = popup.querySelector("#coolauxv-input");
        const resultDiv = popup.querySelector("#coolauxv-result");
        const reasoningDiv = popup.querySelector("#coolauxv-reasoning-box");
        const reasoningWrapper = popup.querySelector("#coolauxv-reasoning-wrapper");
        streamMode = "single";

        let textPrompt = "";
        const userText = input.value.trim();
        const imageBase64 = capturedImageBase64;

        // --- 核心逻辑：Prompt 拼接 ---
        if (userText) {
            // 如果用户输入不为空，无论什么模式，都只用用户输入
            textPrompt = userText;
            Logger.info("Vision Action: User Input Only");
        } else {
            // 用户输入为空，根据模式拼接提示词
            if (mode === 'translate') {
                // 翻译模式：识屏提示词 拼到 翻译提示词 后面 -> [Trans] + [Vision]
                textPrompt = `${config.promptTrans}\n\n${config.promptVision}`;
                Logger.info("Vision Action: Translate (Trans + Vision)");
            } else if (mode === 'explain') {
                // 解读模式：解读提示词 拼到 识屏提示词 后面 -> [Vision] + [Explain]
                textPrompt = `${config.promptVision}\n\n${config.promptExplain}`;
                Logger.info("Vision Action: Explain (Vision + Explain)");
            } else {
                // 识屏模式：默认识屏提示词
                textPrompt = config.promptVision;
                Logger.info("Vision Action: General Analysis");
            }
        }

        const historyEntry = {
            systemPrompt: "",
            userContentText: textPrompt,
            userDisplayText: userText,
            imageBase64: imageBase64,
            assistantText: ""
        };

        if (!config.apiKey || config.apiKey === DEFAULT_API_KEY) {
            if (!shouldSuppressResultError()) {
                showNoKeyError(resultDiv);
            }
            return;
        }

        collapseChatIfEnabled();
        const actionToken = ++activeActionToken;

        streamTextBuffer = ""; streamReasoningBuffer = ""; lastRenderedText = ""; lastRenderedReasoning = ""; hasReasoning = false;

        // 设置 Loading
        const loadingHTML = "<span style='color:#888; display:flex; align-items:center; gap:6px;'>⏳ <span class='coolauxv-pulse'>AI 思考中...</span></span>";
        resultDiv.innerHTML = loadingHTML;
        reasoningDiv.innerHTML = loadingHTML;

        // 强制显示推理框
        setReasoningAnimatedVisibility(true);
        popup.querySelector("#coolauxv-reasoning-toggle-container").style.display = "flex";
        popup.querySelector("#coolauxv-separator").style.display = "flex";

        const url = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

        const payload = {
            model: config.modelVision,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "image_url", image_url: { url: imageBase64 } },
                        { type: "text", text: textPrompt }
                    ]
                }
            ],
            stream: true
        };

        // 打印 JSON 请求体
        const requestBody = JSON.stringify(payload);
        Logger.debug("📸 [Vision API Data]", requestBody);

        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`
        };

        if (abortController) abortController.abort();
        if (gmRequest && gmRequest.abort) gmRequest.abort();

        Logger.info(`Starting Vision API Request (${mode})...`);

        gmRequest = GM_xmlhttpRequest({
            method: "POST",
            url: url,
            headers: headers,
            data: requestBody,
            responseType: 'stream',
            timeout: 120000,

            onloadstart: (res) => {
                if (res.response && res.response.getReader) {
                    resultDiv.innerHTML = "";
                    reasoningDiv.innerHTML = "";
                    startRenderLoop();
                    const reader = res.response.getReader();
                    const decoder = new TextDecoder("utf-8");
                    let buffer = "";

                    (async function readStream() {
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                const chunk = decoder.decode(value, { stream: true });
                                buffer += chunk;
                                const lines = buffer.split(/\r?\n/);
                                buffer = lines.pop();
                                for (const line of lines) processLine(line);
                            }
                        } catch (e) {
                            Logger.error("Stream Error", e);
                            resultDiv.innerHTML += `<br><span style='color:red'>流读取错误: ${e.message}</span>`;
                        } finally {
                            stopRenderLoop();
                            historyEntry.assistantText = streamTextBuffer;
                            recordHistoryEntry(historyEntry);
                            autoExpandChatIfEnabled(actionToken);
                        }
                    })();
                }
            },
            onload: (res) => {
                if (res.status === 429) {
                    stopRenderLoop();
                    if (!shouldSuppressResultError()) {
                        resultDiv.innerHTML = get429ErrorHTML();
                    }
                    reasoningWrapper.style.display = "none";
                    autoExpandChatIfEnabled(actionToken);
                    return;
                }

                if (res.status !== 200) {
                    stopRenderLoop();
                    Logger.error("API Error", res.responseText);
                    resultDiv.innerHTML = `<span style='color:red'>API Error ${res.status}: ${res.responseText}</span>`;
                    autoExpandChatIfEnabled(actionToken);
                }
            },
            onerror: (e) => {
                stopRenderLoop();
                resultDiv.innerHTML = "<span style='color:red'>网络连接失败</span>";
                autoExpandChatIfEnabled(actionToken);
            }
        });
    }

    async function doChatSend() {
        const chatInput = popup.querySelector("#coolauxv-chat-input");
        const resultDiv = popup.querySelector("#coolauxv-result");
        if (!chatInput || !resultDiv) return;

        const userText = chatInput.value.trim();
        const hasImage = !!chatCapturedImageBase64;

        if (!userText && !hasImage) {
            appendChatError("⚠️ 请输入内容或识屏。");
            return;
        }

        const config = getActiveConfig();
        if (config.apiKey === DEFAULT_API_KEY || !config.apiKey) {
            appendChatError(getNoKeyErrorHTML(), { allowHtml: true });
            return;
        }

        collapseChatIfEnabled();
        const actionToken = ++activeActionToken;

        startChatSessionIfNeeded();

        const imageId = hasImage ? `chat-img-${++chatImageCounter}` : null;
        if (imageId) chatImageStore[imageId] = chatCapturedImageBase64;

        const displayText = userText || (imageId ? "（仅识屏）" : "");
        chatDisplayBuffer += formatChatUserBlock(displayText, imageId, chatDisplayBuffer.length === 0);
        chatPendingAssistantPrefix = getChatAssistantPrefix();
        chatAssistantBuffer = "";
        updateChatStreamText();
        lastRenderedText = "";
        renderContent();

        const messageText = userText || (hasImage ? config.promptVision : "");
        const userMessageContent = buildUserMessageContent(messageText, hasImage ? chatCapturedImageBase64 : "");
        chatMessages.push({ role: "user", content: userMessageContent });

        chatInput.value = "";
        chatCapturedImageBase64 = "";
        const btnChatPreview = popup.querySelector("#coolauxv-btn-preview-chat");
        setAnimatedVisibility(btnChatPreview, false);
        const btnChatClear = popup.querySelector("#coolauxv-btn-clear-chat-shot");
        setAnimatedVisibility(btnChatClear, false);

        streamReasoningBuffer = "";
        lastRenderedReasoning = "";
        hasReasoning = false;

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

        const url = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
        const payload = {
            model: config.modelVision,
            stream: true,
            messages: chatMessages
        };

        const requestBody = JSON.stringify(payload);
        Logger.debug("💬 [Chat API Data]", requestBody);

        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`
        };

        gmRequest = GM_xmlhttpRequest({
            method: "POST",
            url: url,
            headers: headers,
            data: requestBody,
            responseType: 'stream',
            timeout: 600000,

            onloadstart: (res) => {
                if (res.response && res.response.getReader) {
                    startRenderLoop();
                    const reader = res.response.getReader();
                    const decoder = new TextDecoder("utf-8");
                    let buffer = "";

                    (async function readStream() {
                        let streamErr = "";
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                const chunk = decoder.decode(value, { stream: true });
                                buffer += chunk;
                                const lines = buffer.split(/\r?\n/);
                                buffer = lines.pop();
                                for (const line of lines) processLine(line);
                            }
                        } catch (e) {
                            Logger.error("Chat Stream Error", e);
                            streamErr = `流读取错误: ${e.message}`;
                        } finally {
                            stopRenderLoop();
                            finalizeChatResponse(actionToken);
                            if (streamErr) appendChatError(streamErr);
                        }
                    })();
                }
            },
            onload: (res) => {
                if (res.status === 429) {
                    stopRenderLoop();
                    finalizeChatResponse(actionToken);
                    appendChatError(get429ErrorHTML(), { allowHtml: true, recordAsAssistant: true });
                    return;
                }
                if (res.status === 401 || res.status === 403) {
                    stopRenderLoop();
                    finalizeChatResponse(actionToken);
                    appendChatError(getInvalidKeyErrorHTML(), { allowHtml: true });
                    return;
                }
                if (res.status !== 200) {
                    stopRenderLoop();
                    finalizeChatResponse(actionToken);
                    appendChatError(`API Error ${res.status}`);
                }
            },
            onerror: () => {
                stopRenderLoop();
                finalizeChatResponse(actionToken);
                appendChatError("网络连接失败");
            },
            ontimeout: () => {
                stopRenderLoop();
                finalizeChatResponse(actionToken);
                appendChatError("请求超时 (Timeout)");
            }
        });
    }

    function getNoKeyErrorHTML() {
        return `
            <div style="color:#e65100; font-weight:bold; padding:10px;">⚠️ 请配置 API KEY</div>
            <div style="font-size:13px; color:#555; padding:0 10px;">
            您尚未配置 API Key，无法使用翻译功能。<br><br>
            1. 点击顶部 <span style="background:#f0f0f0; border-radius:4px; padding:0 4px;">⚙️ 设置</span> 图标。<br>
            2. 点击 <a href="https://bigmodel.cn/usercenter/proj-mgmt/apikeys" target="_blank" style="color:#3b82f6;">获取 KEY</a> 去智谱平台申请。<br>
            3. 将申请到的 Key 填入设置框并保存。
            </div>
        `;
    }

    function showNoKeyError(container) {
        if (container) container.innerHTML = getNoKeyErrorHTML();
    }

    function getInvalidKeyErrorHTML() {
        return `
            <div style="color:#d32f2f; font-weight:bold; padding:10px;">🚫 API KEY 无效</div>
            <div style="font-size:13px; color:#555; padding:0 10px;">
            您配置的 API Key 无法通过验证 (Error 401/403)。<br><br>
            可能的原因：<br>
            1. Key 已过期或被撤销。<br>
            2. 复制时多复制了空格。<br>
            3. 账户余额不足。<br><br>
            请检查设置或重新 <a href="https://bigmodel.cn/usercenter/proj-mgmt/apikeys" target="_blank" style="color:#3b82f6;">获取 KEY</a>。
            </div>
        `;
    }

    function showInvalidKeyError(container) {
        if (container) container.innerHTML = getInvalidKeyErrorHTML();
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

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI);
    else initUI();

})();
