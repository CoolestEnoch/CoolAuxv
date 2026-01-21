// ==UserScript==
// @name         CoolAuxv 网页翻译与阅读助手
// @namespace    https://github.com/CoolestEnoch/CoolAuxv
// @version      v13.1
// @description  使用不同提供商的网页翻译与解读工具，支持多种语言模型和推理模型，提供丰富的配置选项，优化阅读体验。
// @changelog    [v13.1 更新日志] 回答时会显示模型提供商和类型了。支持 OpenAI 模型、聊天中动态切换模型与提供商（共享聊天记录）。
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
// @resource     katexCSS https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css
// @connect      open.bigmodel.cn
// @connect      api.openai.com
// @license      GPL-3.0
// @downloadURL  https://github.com/CoolestEnoch/CoolAuxv/raw/refs/heads/main/translator.user.js
// @updateURL    https://github.com/CoolestEnoch/CoolAuxv/raw/refs/heads/main/translator.meta.js
// ==/UserScript==
