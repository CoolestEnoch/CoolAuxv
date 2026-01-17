// ==UserScript==
// @name         CoolAuxv 网页翻译与阅读助手
// @namespace    https://github.com/CoolestEnoch/CoolAuxv
// @version      v10.5
// @description  使用智谱API的网页翻译与解读工具，支持多种语言模型和推理模型，提供丰富的配置选项，优化阅读体验。
// @changelog    [v10.5 更新日志] 1.可以打开本地PDF文件了！
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
