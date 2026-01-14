// ==UserScript==
// @name         CoolAuxv 网页翻译与阅读助手
// @namespace    http://tampermonkey.net/
// @version      9.8
// @description  使用智谱API的网页翻译与解读工具，支持多种语言模型和推理模型，提供丰富的配置选项，优化阅读体验。
// @changelog    1.尝试适配高斯模糊背景效果
// @author       github@CoolestEnoch
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @connect      open.bigmodel.cn
// @license      GPL-3.0
// @downloadURL  https://github.com/CoolestEnoch/CoolAuxv/raw/refs/heads/main/translator.user.js
// ==/UserScript==


(function () {
    'use strict';

    // ========================================================================
    // 全局配置与常量
    // ========================================================================

    // 第一排：语言模型 (Language Models)
    const CHAT_MODELS = [
        { id: "glm-4-flash", tag: "免费" },
        { id: "glm-4-flash-250414", tag: "免费" },
    ];

    // 第二排：推理模型 (Reasoning Models)
    const REASONING_MODELS = [
        { id: "glm-4.5-flash", tag: "免费" },
        { id: "glm-z1-flash", tag: "免费" },
        { id: "glm-4.7", tag: "付费" },
        { id: "deepseek-r1", tag: "付费" },
    ];

    const LOG_PRESETS = ["debug", "info", "warn", "error", "none"];

    const DEFAULT_API_KEY = "1145141919810哼哼啊啊啊啊啊";
    // 默认模型取语言模型数组的第一个
    const DEFAULT_MODEL_NAME = CHAT_MODELS[0].id;
    const DEFAULT_LOG_LEVEL = "debug";

    const DEFAULT_WIN_WIDTH = "480px";
    const DEFAULT_WIN_HEIGHT = "480px";

    const DEFAULT_SHOW_RAW = false;
    const DEFAULT_SHOW_REASONING = true;
    const DEFAULT_ENABLE_BLUR = false; // 默认关闭模糊


    const DEFAULT_PROMPT_TRANSLATE = "你是一个翻译引擎。将用户输入直接翻译成中文。如果输入是中文则译为英文。不要输出任何多余的解释。";
    const DEFAULT_PROMPT_EXPLAIN = "用户输入文本后，先翻译全文：若非中文译成中文，若是中文译成英文，为英文简写用括号标注完整写法。用户是这个领域的新手，你是这个领域的资深专家兼大师，然后详细解读：用通俗中文解释所有专业概念，每个概念解释前先明确标注原术语（英文简写需同时给出全称）。解读要详细全面，涵盖定义、背景、原理、应用和意义。输出为排版丰富的Markdown，除翻译外全文都用中文回答，不允许把全文都放在codeblock里。";

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
    }
    #coolauxv-translate-popup * { box-sizing: border-box; outline: none; }

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

    /* 复选框强力修复 */
    .coolauxv-toggle-label {
        font-size: 12px; display: flex; align-items: center; cursor: pointer;
        background: #e9ecef; padding: 2px 6px; border-radius: 4px; color: #666;
        margin-right: 6px; user-select: none; white-space: nowrap;
        height: auto !important; line-height: normal !important;
        width: auto !important;
    }
    .coolauxv-toggle-label:hover { background: #dee2e6; }
    
    /* 核心修复：防止宿主 CSS 破坏 Checkbox */
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
        
        /* 核心修复：强制占满整行，防止被网站 CSS 挤压导致文字换行 */
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
        display: inline-flex !important; /* 核心修复：强制内联弹性布局，防止被宿主 block 撑满整行 */
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
        background: #eeffff; color: #0066ff; border: 1px solid #b3e0ff;
        padding: 4px 10px; border-radius: 8px; cursor: pointer; user-select: none;
        min-width: 80px; transition: background 0.2s;
        text-align: center !important;
    }
    .coolauxv-model-btn:hover { background: #d6f5ff; }
    .coolauxv-model-name { font-size: 12px; font-weight: bold; }
    .coolauxv-model-tag { font-size: 10px; color: #5599ff; margin-top: 1px; }

    .coolauxv-tag-btn {
        font-size: 11px; background: #f3f4f6; color: #333; border: 1px solid #ddd;
        padding: 2px 8px; border-radius: 10px; cursor: pointer; user-select: none;
    }
    .coolauxv-tag-btn:hover { background: #e5e7eb; }
    .coolauxv-sub-label { font-size: 11px; color: #888; width: 100%; margin: 8px 0 4px 0; font-weight: normal; text-align: left !important; }

    .coolauxv-back-btn { margin-top: 20px; padding: 10px; background: #f3f4f6; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-weight: bold; text-align: center !important; color: #555; }
    .coolauxv-reset-btn { margin-top: 10px; padding: 10px; background: #fff0f0; border: 1px solid #ffcccc; border-radius: 6px; cursor: pointer; font-weight: bold; text-align: center !important; color: #d32f2f; }

    /* 推理框与结果框 */
    .coolauxv-box-wrapper { position: relative; width: 100%; display: flex; flex-direction: column; overflow: hidden; }

    #coolauxv-reasoning-wrapper {
        background-color: #f8f9fa; flex-shrink: 0;
        border-bottom: 1px dashed #ddd; display: none; height: 120px;
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

    .coolauxv-input-ctrl-btn {
        cursor: pointer; color: #bbb; font-size: 13px; padding: 3px;
        text-align: center; line-height: 1; transition: color 0.2s;
    }
    .coolauxv-input-ctrl-btn:hover { color: #3b82f6; background: #f0f7ff; border-radius: 4px; }

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
        text-decoration: none; color: #24292f; background-color: #f6f8fa;
        border: 1px solid rgba(27,31,36,0.15); padding: 6px 14px;
        border-radius: 6px; font-weight: 600; font-size: 13px;
        transition: 0.2s; margin-top: 5px; cursor: pointer;
        font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
    }
    .coolauxv-github-btn:hover { background-color: #f3f4f6; text-decoration: none; border-color: rgba(27,31,36,0.15); }
    .coolauxv-github-btn svg { fill: currentColor; margin-right: 6px; }

    /* ============================
    背景模糊 (Glass Effect)
    ============================ */
    
    /* 1. 主窗口：液态光泽 + 智能文字阴影 */
    .coolauxv-blur-enabled {
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

    /* 必须重置输入框/代码块内的文字阴影，否则正文会变糊 */
    .coolauxv-blur-enabled input, 
    .coolauxv-blur-enabled textarea,
    .coolauxv-blur-enabled .coolauxv-scroll-box,
    .coolauxv-blur-enabled pre,
    .coolauxv-blur-enabled code {
        text-shadow: none !important;
    }

    /* 2. 标题栏 & 设置页容器：全透明，透出底层的玻璃感 */
    .coolauxv-blur-enabled #coolauxv-header,
    .coolauxv-blur-enabled #coolauxv-settings-view {
        background: transparent !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.3) !important;
    }

    /* 3. 首页输入框：高对比度 + 气泡感 */
    .coolauxv-blur-enabled #coolauxv-input {
        background-color: rgba(255, 255, 255, 0.75) !important; /* 提升不透明度保可读性 */
        border: 1px solid rgba(255, 255, 255, 0.6) !important;
        box-shadow: inset 0 1px 4px rgba(0,0,0,0.05); /* 轻微内凹 */
        color: #000 !important;
    }
    .coolauxv-blur-enabled #coolauxv-input:focus {
        background-color: rgba(255, 255, 255, 0.95) !important; /* 聚焦时几乎不透明 */
        box-shadow: 0 0 8px rgba(255,255,255,0.8) !important;
    }

    /* 4. 设置页面的输入框：液态玻璃风格 */
    .coolauxv-blur-enabled .coolauxv-setting-input {
        background-color: rgba(255, 255, 255, 0.6) !important; /* 半透明白 */
        border: 1px solid rgba(255, 255, 255, 0.5) !important;
        transition: all 0.2s;
    }
    .coolauxv-blur-enabled .coolauxv-setting-input:focus {
        background-color: rgba(255, 255, 255, 0.9) !important;
        border-color: #3b82f6 !important;
    }

    /* 5. 结果显示区：为了看清大段文字，背景设为“雾白” */
    .coolauxv-blur-enabled #coolauxv-content-container {
        background: transparent !important;
        border: 1px solid rgba(255, 255, 255, 0.4) !important;
    }
    
    .coolauxv-blur-enabled #coolauxv-reasoning-wrapper {
        background-color: rgba(248, 249, 250, 0.7) !important; /* 思考区：70% 灰白 */
        border-bottom: 1px dashed rgba(0, 0, 0, 0.1) !important;
    }

    .coolauxv-blur-enabled #coolauxv-result-wrapper {
        background-color: rgba(255, 255, 255, 0.75) !important; /* 结果区：75% 纯白 */
    }

    /* 6. 按钮定制：半透明磨砂 */
    /* 翻译按钮 (灰色系) */
    .coolauxv-blur-enabled #coolauxv-btn-trans {
        background: rgba(243, 244, 246, 0.65) !important;
        border: 1px solid rgba(255, 255, 255, 0.6) !important;
        backdrop-filter: blur(4px);
    }
    .coolauxv-blur-enabled #coolauxv-btn-trans:hover {
        background: rgba(243, 244, 246, 0.9) !important;
    }

    /* 解读按钮 (紫色系) */
    .coolauxv-blur-enabled #coolauxv-btn-explain {
        background: rgba(165, 22, 232, 0.75) !important; /* 紫色半透明 */
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.3) !important;
        box-shadow: 0 4px 12px rgba(165, 22, 232, 0.25);
    }
    .coolauxv-blur-enabled #coolauxv-btn-explain:hover {
        background: rgba(165, 22, 232, 0.9) !important;
    }

    /* 7. 分隔条 */
    .coolauxv-blur-enabled #coolauxv-separator {
        background: rgba(255, 255, 255, 0.5) !important;
    }



    `;

    GM_addStyle(styles);

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

    let lastRenderedText = "";
    let lastRenderedReasoning = "";
    let isRendering = false;

    let selectionTimer = null;
    let isWindowDragging = false;
    let isSplitterDragging = false;

    function initUI() {
        try {
            cursorBtn = document.createElement("div");
            cursorBtn.id = "coolauxv-translate-icon";
            cursorBtn.innerText = "译";
            Object.assign(cursorBtn.style, { display: "none", position: "absolute" });

            const onIconClick = (e) => {
                if (isQuitted) return;
                e.preventDefault(); e.stopPropagation();

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
                }

                const mainView = popup.querySelector("#coolauxv-main-view");
                const settingsView = popup.querySelector("#coolauxv-settings-view");
                if (mainView) mainView.style.display = "flex";
                if (settingsView) settingsView.style.display = "none";

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
                fontWeight: "bold", fontSize: "18px"
            });
            floatBall.onclick = () => { if (isQuitted) return; floatBall.style.display = "none"; resetPopupState(); popup.style.display = "flex"; };
            document.body.appendChild(floatBall);

            popup = document.createElement("div");
            popup.id = "coolauxv-translate-popup";
            // 初始化背景模糊状态
            if (GM_getValue("coolauxv_enable_blur", DEFAULT_ENABLE_BLUR)) {
                popup.classList.add("coolauxv-blur-enabled");
            }
            Object.assign(popup.style, {
                display: "none", flexDirection: "column", position: "fixed",
                zIndex: "2147483646",
                background: "white", boxShadow: "0 0 50px rgba(0,0,0,0.5)",
                borderRadius: "12px", border: "1px solid #e0e0e0", overflow: "hidden"
            });
            resetPopupState();

            // 生成模型按钮 HTML
            const generateModelBtns = (models) => {
                return models.map(m => `
                    <div class="coolauxv-model-btn" data-field="coolauxv_model_name" data-val="${m.id}">
                        <span class="coolauxv-model-name">${m.id}</span>
                        <span class="coolauxv-model-tag">${m.tag}</span>
                    </div>
                `).join("");
            };

            const chatBtnsHTML = generateModelBtns(CHAT_MODELS);
            const reasoningBtnsHTML = generateModelBtns(REASONING_MODELS);

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
                     <button id="coolauxv-btn-trans" style="flex:1; background:#f3f4f6; border:1px solid #ddd; padding:10px; border-radius:6px; font-weight:bold; cursor: pointer;">翻译</button>
                     <button id="coolauxv-btn-explain" style="flex:1; background:#a516e8; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor: pointer;">解读</button>
                  </div>
                  <div id="coolauxv-content-container">
                      <div id="coolauxv-reasoning-wrapper" class="coolauxv-box-wrapper">
                          <span class="coolauxv-copy-btn" data-type="reasoning" title="复制思考过程">📋</span>
                          <div id="coolauxv-reasoning-box" class="coolauxv-scroll-box"></div>
                      </div>

                      <div id="coolauxv-separator" title="拖动调整高度"></div>

                      <div id="coolauxv-result-wrapper" class="coolauxv-box-wrapper" style="flex:1;">
                          <span class="coolauxv-copy-btn" data-type="result" title="复制结果">📋</span>
                          <div id="coolauxv-result" class="coolauxv-scroll-box"></div>
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
                        <!-- 显隐按钮：margin-left: auto 会把它和后面的按钮一起推到最右边 -->
                        <span id="coolauxv-btn-toggle-key" class="coolauxv-link-btn" style="margin-left:auto; cursor:pointer; user-select:none;">👁️ 显示</span>
                        <a href="https://bigmodel.cn/usercenter/proj-mgmt/apikeys" target="_blank" class="coolauxv-link-btn" title="打开智谱平台获取Key">🔑 获取KEY</a>
                    </label>
                    <!-- 默认 type 改为 password 以保护隐私 -->
                    <input type="password" id="coolauxv-cfg-key" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="${DEFAULT_API_KEY}">
                </div>

                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">
                        模型类型 (Model)
                        <!-- 价格跳转按钮 -->
                        <a href="https://bigmodel.cn/pricing" target="_blank" class="coolauxv-link-btn" title="当前界面收录情况有时效性，点击查看最新定价">💵 查看最新定价</a>
                    </label>
                    <input type="text" id="coolauxv-cfg-model" class="coolauxv-setting-input coolauxv-fixed-input" placeholder="默认: ${DEFAULT_MODEL_NAME}">

                    <!-- 双排显示 -->
                    <div class="coolauxv-sub-label">语言模型 (快)</div>
                    <div class="coolauxv-tag-container">${chatBtnsHTML}</div>

                    <div class="coolauxv-sub-label">推理模型 (准)</div>
                    <div class="coolauxv-tag-container">${reasoningBtnsHTML}</div>
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
                    <label class="coolauxv-setting-label">翻译提示词</label>
                    <textarea id="coolauxv-cfg-prompt-trans" class="coolauxv-setting-input coolauxv-resizable-input" rows="3" placeholder="默认提示词..."></textarea>
                </div>

                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">解读提示词</label>
                    <textarea id="coolauxv-cfg-prompt-explain" class="coolauxv-setting-input coolauxv-resizable-input" rows="3" placeholder="默认提示词..."></textarea>
                </div>

                <div class="coolauxv-setting-group">
                    <label class="coolauxv-setting-label">杂项 (Miscellaneous)</label>
                    <label class="coolauxv-toggle-label" style="width:auto; background:none; padding:0; border:none;">
                        <input type="checkbox" id="coolauxv-cfg-blur"> 开启窗口背景模糊 (Glass Effect)
                    </label>
                </div>

                <div class="coolauxv-reset-btn" id="coolauxv-cfg-reset">⚠️ 重置所有配置</div>
            </div>

            <div id="coolauxv-resize-handle"><svg id="coolauxv-resize-icon" viewBox="0 0 10 10"><path d="M10 10 L10 2 L2 10 Z" /></svg></div>
            `;
            document.body.appendChild(popup);

            setTimeout(() => {
                bindEvents();
                bindInputCtrlEvents();
                bindCopyEvents();
                initSettingsLogic();
                initDragAndResize();
                initSplitter();
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

        // --- 切换逻辑核心修改 ---
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

        // --- 下面是通用的配置加载与保存逻辑（保持不变）---

        const clearableInputs = [
            "coolauxv-cfg-key", "coolauxv-cfg-model", "coolauxv-cfg-width", "coolauxv-cfg-height",
            "coolauxv-cfg-prompt-trans", "coolauxv-cfg-prompt-explain"
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
        const inputWidth = popup.querySelector("#coolauxv-cfg-width");
        const inputHeight = popup.querySelector("#coolauxv-cfg-height");
        const inputPromptTrans = popup.querySelector("#coolauxv-cfg-prompt-trans");
        const inputPromptExplain = popup.querySelector("#coolauxv-cfg-prompt-explain");
        const inputBlur = popup.querySelector("#coolauxv-cfg-blur");
        const modelBtns = popup.querySelectorAll(".coolauxv-model-btn");
        const radioBtns = popup.querySelectorAll('input[name="coolauxv_log_level_radio"]');

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

        const loadConfig = () => {
            if (inputKey) inputKey.value = GM_getValue("coolauxv_api_key", "");
            if (inputModel) inputModel.value = GM_getValue("coolauxv_model_name", "");
            if (inputWidth) inputWidth.value = GM_getValue("coolauxv_win_width", "");
            if (inputHeight) inputHeight.value = GM_getValue("coolauxv_win_height", "");
            if (inputPromptTrans) inputPromptTrans.value = GM_getValue("coolauxv_prompt_trans", "");
            if (inputPromptExplain) inputPromptExplain.value = GM_getValue("coolauxv_prompt_explain", "");

            const currentLevel = GM_getValue("coolauxv_log_level", "debug"); // 这里的默认值要与常量一致
            const targetRadio = popup.querySelector(`input[name="coolauxv_log_level_radio"][value="${currentLevel}"]`);
            if (targetRadio) targetRadio.checked = true;

            if (inputBlur) {
                inputBlur.checked = GM_getValue("coolauxv_enable_blur", DEFAULT_ENABLE_BLUR);
            }
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
                GM_deleteValue("coolauxv_enable_blur");
                loadConfig();
                // 重置 Radio
                const defaultRadio = popup.querySelector(`input[name="coolauxv_log_level_radio"][value="debug"]`);
                if (defaultRadio) defaultRadio.checked = true;
                if (inputBlur) {
                    inputBlur.checked = DEFAULT_ENABLE_BLUR;
                    toggleBlur(DEFAULT_ENABLE_BLUR);
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

        const toggleBlur = (enabled) => {
            if (enabled) popup.classList.add("coolauxv-blur-enabled");
            else popup.classList.remove("coolauxv-blur-enabled");
        };

        if (inputBlur) {
            inputBlur.addEventListener("change", (e) => {
                const enabled = e.target.checked;
                GM_setValue("coolauxv_enable_blur", enabled); // 保存到全局变量
                toggleBlur(enabled); // 实时应用效果
            });
        }

        modelBtns.forEach(btn => {
            btn.onclick = () => {
                const val = btn.dataset.val;
                if (inputModel) {
                    inputModel.value = val;
                    inputModel.dispatchEvent(new Event('input'));
                }
            };
        });
    }


    function getActiveConfig() {
        return {
            apiKey: GM_getValue("coolauxv_api_key") || DEFAULT_API_KEY,
            modelName: GM_getValue("coolauxv_model_name") || DEFAULT_MODEL_NAME,
            promptTrans: GM_getValue("coolauxv_prompt_trans") || DEFAULT_PROMPT_TRANSLATE,
            promptExplain: GM_getValue("coolauxv_prompt_explain") || DEFAULT_PROMPT_EXPLAIN
        };
    }

    // --- 4. 核心功能 ---
    function resetPopupState() {
        const cfgW = GM_getValue("coolauxv_win_width");
        const cfgH = GM_getValue("coolauxv_win_height");

        // 重置推理框高度为 50%
        const reasoningWrapper = popup.querySelector("#coolauxv-reasoning-wrapper");
        if (reasoningWrapper) reasoningWrapper.style.height = "50%";


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
            try { element.innerHTML = marked.parse(newContentHTML); }
            catch (e) { element.innerText = newContentHTML; }
        }
        if (isNearBottom || newContentHTML.length < 50) element.scrollTop = element.scrollHeight;
    }

    // 专门用于程序化控制推理框显隐的函数
    function setReasoningVisibility(visible) {
        isShowReasoning = visible; // 更新内部状态

        // 同步 UI 上的复选框状态
        const toggle = popup.querySelector("#coolauxv-reasoning-toggle");
        if (toggle) toggle.checked = visible;

        // 立即触发一次渲染，避免视觉延迟
        renderContent();
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
                reasoningWrapper.style.display = "flex";
                separator.style.display = "flex";
            } else {
                reasoningWrapper.style.display = "none";
                separator.style.display = "none";
            }
        } else {
            reasoningToggle.style.display = "none";
            reasoningWrapper.style.display = "none";
            separator.style.display = "none";
        }

        // 2. 渲染推理内容
        if (hasReasoning && isShowReasoning) {
            reasoningDiv.className = isShowRaw ? "coolauxv-scroll-box coolauxv-raw-text" : "coolauxv-scroll-box coolauxv-markdown";
            updateScroll(reasoningDiv, streamReasoningBuffer, isShowRaw);
        }

        // 3. 渲染结果内容 (核心修改点)
        // 只有当有实际文本内容时，才更新结果框
        if (streamTextBuffer) {
            resultDiv.className = isShowRaw ? "coolauxv-scroll-box coolauxv-raw-text" : "coolauxv-scroll-box coolauxv-markdown";
            updateScroll(resultDiv, streamTextBuffer, isShowRaw);
        }
        // 如果文本缓冲区为空（说明正在推理，或正在等待网络响应），则保留“AI 思考中...”的提示
        else {
            if (!resultDiv.innerHTML.includes("AI 思考中")) {
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
    function minimizeWindow() { popup.style.display = "none"; floatBall.style.display = "block"; }
    function closeWindow() { popup.style.display = "none"; floatBall.style.display = "none"; }
    function quitScript() { if (confirm("确定要退出吗？")) { popup.style.display = "none"; floatBall.style.display = "none"; cursorBtn.style.display = "none"; isQuitted = true; } }

    function bindEvents() {
        const minBtn = popup.querySelector("#coolauxv-min");
        const closeBtn = popup.querySelector("#coolauxv-close");
        const quitBtn = popup.querySelector("#coolauxv-quit");
        const rawToggle = popup.querySelector("#coolauxv-raw-toggle");
        const reasoningToggle = popup.querySelector("#coolauxv-reasoning-toggle");
        const btnTrans = popup.querySelector("#coolauxv-btn-trans");
        const btnExplain = popup.querySelector("#coolauxv-btn-explain");

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
        copyBtns.forEach(btn => {
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


    // ========================================================================
    // 网络引擎 (Stream)
    // ========================================================================

    async function doAction(mode) {
        const input = popup.querySelector("#coolauxv-input");
        if (!input) return;
        const text = input.value.trim();
        // 获取结果显示框
        const resultDiv = popup.querySelector("#coolauxv-result");

        const config = getActiveConfig();

        // 检测API合法性并拦截
        if (config.apiKey === DEFAULT_API_KEY || !config.apiKey) {
            showNoKeyError(popup.querySelector("#coolauxv-result"));
            return;
        }

        // 检测空输入并拦截
        if (!text) {
            if (resultDiv) {
                // 显示橙色警告文本
                resultDiv.innerHTML = "<span style='color:#e65100; font-weight:bold;'>⚠️ 请不要操作空文本...</span>";
            }
            return;
        }

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
        const payload = {
            model: config.modelName,
            stream: true,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }]
        };

        // 策略 A: Fetch
        try {
            Logger.info(`Fetch Model: ${config.modelName}`);
            abortController = new AbortController();
            const response = await fetch(url, {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
                body: JSON.stringify(payload), signal: abortController.signal
            });

            if (!response.ok) {
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
            return;

        } catch (err) {
            Logger.warn("Fetch 失败/跨域，准备降级。", err);
            if (err.message === "AUTH_INVALID") { showInvalidKeyError(resultDiv); return; }
            if (err.name === 'AbortError') return;
        }

        // 策略 B: GM_xmlhttpRequest
        Logger.info(`GM_xmlhttpRequest Model: ${config.modelName}`);

        let gmStreamBuffer = "";
        let isStreamModeActive = false;

        gmRequest = GM_xmlhttpRequest({
            method: "POST", url: url,
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
            data: JSON.stringify(payload),
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
                        }
                    })();
                }
            },

            onload: (res) => {
                if (!isStreamModeActive) {
                    stopRenderLoop();
                    const fullText = res.responseText || (typeof res.response === 'string' ? res.response : "");

                    if (res.status === 401 || res.status === 403) {
                        showInvalidKeyError(resultDiv);
                        return;
                    }

                    if (res.status !== 200) {
                        let gmErrMsg = `HTTP ${res.status}`;
                        try { const d = JSON.parse(fullText); if (d.error) gmErrMsg = `API Error: ${d.error.message}`; } catch (e) { }
                        resultDiv.innerHTML = `<span style='color:red'>${gmErrMsg}</span>`;
                        return;
                    }
                    if (fullText) {
                        const lines = fullText.split(/\r?\n/);
                        for (const line of lines) processLine(line);
                        renderContent();
                    } else {
                        resultDiv.innerHTML += "<br><small style='color:red'>(流式兼容失败，请检查网络)</small>";
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
            },

            ontimeout: () => {
                stopRenderLoop();
                if (streamTextBuffer.length > 0) {
                    resultDiv.innerHTML += "<br><span style='color:red'>[请求超时，已保留内容]</span>";
                } else {
                    resultDiv.innerHTML = "<span style='color:red'>请求超时 (Timeout)</span>";
                }
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

        // 每次自动展开时，重置高度为 50%
        if (visible) {
            const reasoningWrapper = popup.querySelector("#coolauxv-reasoning-wrapper");
            if (reasoningWrapper) reasoningWrapper.style.height = "50%";
        }

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
                    if (streamTextBuffer.length === 0 && hasReasoning) {
                        Logger.info("推理结束，正文开始，自动收起推理框");
                        setReasoningVisibility(false);
                    }
                    streamTextBuffer += delta.content;
                }
            } catch (e) {
                Logger.debug("JSON Parse Error (Ignore)", line);
            }
        }
    }

    function showNoKeyError(container) {
        if (container) container.innerHTML = `
            <div style="color:#e65100; font-weight:bold; padding:10px;">⚠️ 请配置 API KEY</div>
            <div style="font-size:13px; color:#555; padding:0 10px;">
            您尚未配置 API Key，无法使用翻译功能。<br><br>
            1. 点击顶部 <span style="background:#f0f0f0; border-radius:4px; padding:0 4px;">⚙️ 设置</span> 图标。<br>
            2. 点击 <a href="https://bigmodel.cn/usercenter/proj-mgmt/apikeys" target="_blank" style="color:#3b82f6;">获取 KEY</a> 去智谱平台申请。<br>
            3. 将申请到的 Key 填入设置框并保存。
            </div>
        `;
    }

    function showInvalidKeyError(container) {
        if (container) container.innerHTML = `
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

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI);
    else initUI();

})();
