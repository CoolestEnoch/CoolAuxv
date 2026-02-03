(() => {
  if (globalThis.__coolauxv_gm_polyfill) {
    return;
  }
  globalThis.__coolauxv_gm_polyfill = true;

  globalThis.unsafeWindow = window;
  const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };
  let currentLogLevel = "none";

  const shouldLog = (level) => {
    const currentVal = LOG_LEVELS[currentLogLevel] ?? LOG_LEVELS.none;
    const targetVal = LOG_LEVELS[level] ?? LOG_LEVELS.debug;
    return targetVal >= currentVal;
  };

  const log = (level, ...args) => {
    if (!shouldLog(level)) {
      return;
    }
    const fn = console[level] || console.log;
    fn("[CoolAuxv]", ...args);
  };

  const syncLogLevel = () => {
    if (!globalThis.chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }
    chrome.storage.local.get(["coolauxv_log_level"], (items) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        return;
      }
      const level = items && items.coolauxv_log_level;
      if (level && LOG_LEVELS[level] !== undefined) {
        currentLogLevel = level;
      } else {
        currentLogLevel = "none";
      }
    });
  };

  if (globalThis.chrome && chrome.storage && chrome.storage.local) {
    syncLogLevel();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.coolauxv_log_level) {
        const nextVal = changes.coolauxv_log_level.newValue;
        if (nextVal && LOG_LEVELS[nextVal] !== undefined) {
          currentLogLevel = nextVal;
        } else {
          currentLogLevel = "none";
        }
      }
    });
  }

  const BRIDGE_SOURCE_EXT = "coolauxv-extension";
  const BRIDGE_SOURCE_US = "coolauxv-userscript";
  const BRIDGE_PING_TYPE = "coolauxv_bridge_ping";
  const BRIDGE_READY_TYPE = "coolauxv_bridge_ready";
  const BRIDGE_REQUEST_TYPE = "coolauxv_bridge_request";
  const BRIDGE_RESPONSE_TYPE = "coolauxv_bridge_response";
  const BRIDGE_ENABLED = false;
  const BRIDGE_HANDSHAKE_TIMEOUT_MS = 800;
  const BRIDGE_PING_INTERVAL_MS = 200;
  const BRIDGE_PING_MAX_DURATION_MS = 10000;
  const BRIDGE_REQUEST_TIMEOUT_MS = 4000;

  const gmStore = {};
  let gmStorageBackend = "memory";
  let bridgeToken = null;
  let bridgeNonce = null;
  let bridgeReady = false;
  let bridgeActivationPromise = null;
  let storageReadyResolve = null;
  let bridgeHandshakePromise = null;
  let bridgeHandshakeResolve = null;
  const pendingBridgeRequests = new Map();
  let bridgeRequestCounter = 0;
  let bridgePingIntervalId = null;
  let bridgePingStopTimerId = null;

  const isCoolauxvKey = (key) => typeof key === "string";

  globalThis.__coolauxv_storage_ready = new Promise((resolve) => {
    storageReadyResolve = resolve;
  });

  const resourceText = {
    katexCSS: '@font-face{font-family:KaTeX_AMS;font-style:normal;font-weight:400;src:url(fonts/KaTeX_AMS-Regular.woff2) format("woff2"),url(fonts/KaTeX_AMS-Regular.woff) format("woff"),url(fonts/KaTeX_AMS-Regular.ttf) format("truetype")}@font-face{font-family:KaTeX_Caligraphic;font-style:normal;font-weight:700;src:url(fonts/KaTeX_Caligraphic-Bold.woff2) format("woff2"),url(fonts/KaTeX_Caligraphic-Bold.woff) format("woff"),url(fonts/KaTeX_Caligraphic-Bold.ttf) format("truetype")}@font-face{font-family:KaTeX_Caligraphic;font-style:normal;font-weight:400;src:url(fonts/KaTeX_Caligraphic-Regular.woff2) format("woff2"),url(fonts/KaTeX_Caligraphic-Regular.woff) format("woff"),url(fonts/KaTeX_Caligraphic-Regular.ttf) format("truetype")}@font-face{font-family:KaTeX_Fraktur;font-style:normal;font-weight:700;src:url(fonts/KaTeX_Fraktur-Bold.woff2) format("woff2"),url(fonts/KaTeX_Fraktur-Bold.woff) format("woff"),url(fonts/KaTeX_Fraktur-Bold.ttf) format("truetype")}@font-face{font-family:KaTeX_Fraktur;font-style:normal;font-weight:400;src:url(fonts/KaTeX_Fraktur-Regular.woff2) format("woff2"),url(fonts/KaTeX_Fraktur-Regular.woff) format("woff"),url(fonts/KaTeX_Fraktur-Regular.ttf) format("truetype")}@font-face{font-family:KaTeX_Main;font-style:normal;font-weight:700;src:url(fonts/KaTeX_Main-Bold.woff2) format("woff2"),url(fonts/KaTeX_Main-Bold.woff) format("woff"),url(fonts/KaTeX_Main-Bold.ttf) format("truetype")}@font-face{font-family:KaTeX_Main;font-style:italic;font-weight:700;src:url(fonts/KaTeX_Main-BoldItalic.woff2) format("woff2"),url(fonts/KaTeX_Main-BoldItalic.woff) format("woff"),url(fonts/KaTeX_Main-BoldItalic.ttf) format("truetype")}@font-face{font-family:KaTeX_Main;font-style:italic;font-weight:400;src:url(fonts/KaTeX_Main-Italic.woff2) format("woff2"),url(fonts/KaTeX_Main-Italic.woff) format("woff"),url(fonts/KaTeX_Main-Italic.ttf) format("truetype")}@font-face{font-family:KaTeX_Main;font-style:normal;font-weight:400;src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2"),url(fonts/KaTeX_Main-Regular.woff) format("woff"),url(fonts/KaTeX_Main-Regular.ttf) format("truetype")}@font-face{font-family:KaTeX_Math;font-style:italic;font-weight:700;src:url(fonts/KaTeX_Math-BoldItalic.woff2) format("woff2"),url(fonts/KaTeX_Math-BoldItalic.woff) format("woff"),url(fonts/KaTeX_Math-BoldItalic.ttf) format("truetype")}@font-face{font-family:KaTeX_Math;font-style:italic;font-weight:400;src:url(fonts/KaTeX_Math-Italic.woff2) format("woff2"),url(fonts/KaTeX_Math-Italic.woff) format("woff"),url(fonts/KaTeX_Math-Italic.ttf) format("truetype")}@font-face{font-family:"KaTeX_SansSerif";font-style:normal;font-weight:700;src:url(fonts/KaTeX_SansSerif-Bold.woff2) format("woff2"),url(fonts/KaTeX_SansSerif-Bold.woff) format("woff"),url(fonts/KaTeX_SansSerif-Bold.ttf) format("truetype")}@font-face{font-family:"KaTeX_SansSerif";font-style:italic;font-weight:400;src:url(fonts/KaTeX_SansSerif-Italic.woff2) format("woff2"),url(fonts/KaTeX_SansSerif-Italic.woff) format("woff"),url(fonts/KaTeX_SansSerif-Italic.ttf) format("truetype")}@font-face{font-family:"KaTeX_SansSerif";font-style:normal;font-weight:400;src:url(fonts/KaTeX_SansSerif-Regular.woff2) format("woff2"),url(fonts/KaTeX_SansSerif-Regular.woff) format("woff"),url(fonts/KaTeX_SansSerif-Regular.ttf) format("truetype")}@font-face{font-family:KaTeX_Script;font-style:normal;font-weight:400;src:url(fonts/KaTeX_Script-Regular.woff2) format("woff2"),url(fonts/KaTeX_Script-Regular.woff) format("woff"),url(fonts/KaTeX_Script-Regular.ttf) format("truetype")}@font-face{font-family:KaTeX_Size1;font-style:normal;font-weight:400;src:url(fonts/KaTeX_Size1-Regular.woff2) format("woff2"),url(fonts/KaTeX_Size1-Regular.woff) format("woff"),url(fonts/KaTeX_Size1-Regular.ttf) format("truetype")}@font-face{font-family:KaTeX_Size2;font-style:normal;font-weight:400;src:url(fonts/KaTeX_Size2-Regular.woff2) format("woff2"),url(fonts/KaTeX_Size2-Regular.woff) format("woff"),url(fonts/KaTeX_Size2-Regular.ttf) format("truetype")}@font-face{font-family:KaTeX_Size3;font-style:normal;font-weight:400;src:url(fonts/KaTeX_Size3-Regular.woff2) format("woff2"),url(fonts/KaTeX_Size3-Regular.woff) format("woff"),url(fonts/KaTeX_Size3-Regular.ttf) format("truetype")}@font-face{font-family:KaTeX_Size4;font-style:normal;font-weight:400;src:url(fonts/KaTeX_Size4-Regular.woff2) format("woff2"),url(fonts/KaTeX_Size4-Regular.woff) format("woff"),url(fonts/KaTeX_Size4-Regular.ttf) format("truetype")}@font-face{font-family:KaTeX_Typewriter;font-style:normal;font-weight:400;src:url(fonts/KaTeX_Typewriter-Regular.woff2) format("woff2"),url(fonts/KaTeX_Typewriter-Regular.woff) format("woff"),url(fonts/KaTeX_Typewriter-Regular.ttf) format("truetype")}.katex{font:normal 1.21em KaTeX_Main,Times New Roman,serif;line-height:1.2;text-indent:0;text-rendering:auto}.katex *{-ms-high-contrast-adjust:none!important;border-color:currentColor}.katex .katex-version:after{content:"0.16.11"}.katex .katex-mathml{clip:rect(1px,1px,1px,1px);border:0;height:1px;overflow:hidden;padding:0;position:absolute;width:1px}.katex .katex-html>.newline{display:block}.katex .base{position:relative;white-space:nowrap;width:-webkit-min-content;width:-moz-min-content;width:min-content}.katex .base,.katex .strut{display:inline-block}.katex .textbf{font-weight:700}.katex .textit{font-style:italic}.katex .textrm{font-family:KaTeX_Main}.katex .textsf{font-family:KaTeX_SansSerif}.katex .texttt{font-family:KaTeX_Typewriter}.katex .mathnormal{font-family:KaTeX_Math;font-style:italic}.katex .mathit{font-family:KaTeX_Main;font-style:italic}.katex .mathrm{font-style:normal}.katex .mathbf{font-family:KaTeX_Main;font-weight:700}.katex .boldsymbol{font-family:KaTeX_Math;font-style:italic;font-weight:700}.katex .amsrm,.katex .mathbb,.katex .textbb{font-family:KaTeX_AMS}.katex .mathcal{font-family:KaTeX_Caligraphic}.katex .mathfrak,.katex .textfrak{font-family:KaTeX_Fraktur}.katex .mathboldfrak,.katex .textboldfrak{font-family:KaTeX_Fraktur;font-weight:700}.katex .mathtt{font-family:KaTeX_Typewriter}.katex .mathscr,.katex .textscr{font-family:KaTeX_Script}.katex .mathsf,.katex .textsf{font-family:KaTeX_SansSerif}.katex .mathboldsf,.katex .textboldsf{font-family:KaTeX_SansSerif;font-weight:700}.katex .mathitsf,.katex .textitsf{font-family:KaTeX_SansSerif;font-style:italic}.katex .mainrm{font-family:KaTeX_Main;font-style:normal}.katex .vlist-t{border-collapse:collapse;display:inline-table;table-layout:fixed}.katex .vlist-r{display:table-row}.katex .vlist{display:table-cell;position:relative;vertical-align:bottom}.katex .vlist>span{display:block;height:0;position:relative}.katex .vlist>span>span{display:inline-block}.katex .vlist>span>.pstrut{overflow:hidden;width:0}.katex .vlist-t2{margin-right:-2px}.katex .vlist-s{display:table-cell;font-size:1px;min-width:2px;vertical-align:bottom;width:2px}.katex .vbox{align-items:baseline;display:inline-flex;flex-direction:column}.katex .hbox{width:100%}.katex .hbox,.katex .thinbox{display:inline-flex;flex-direction:row}.katex .thinbox{max-width:0;width:0}.katex .msupsub{text-align:left}.katex .mfrac>span>span{text-align:center}.katex .mfrac .frac-line{border-bottom-style:solid;display:inline-block;width:100%}.katex .hdashline,.katex .hline,.katex .mfrac .frac-line,.katex .overline .overline-line,.katex .rule,.katex .underline .underline-line{min-height:1px}.katex .mspace{display:inline-block}.katex .clap,.katex .llap,.katex .rlap{position:relative;width:0}.katex .clap>.inner,.katex .llap>.inner,.katex .rlap>.inner{position:absolute}.katex .clap>.fix,.katex .llap>.fix,.katex .rlap>.fix{display:inline-block}.katex .llap>.inner{right:0}.katex .clap>.inner,.katex .rlap>.inner{left:0}.katex .clap>.inner>span{margin-left:-50%;margin-right:50%}.katex .rule{border:0 solid;display:inline-block;position:relative}.katex .hline,.katex .overline .overline-line,.katex .underline .underline-line{border-bottom-style:solid;display:inline-block;width:100%}.katex .hdashline{border-bottom-style:dashed;display:inline-block;width:100%}.katex .sqrt>.root{margin-left:.2777777778em;margin-right:-.5555555556em}.katex .fontsize-ensurer.reset-size1.size1,.katex .sizing.reset-size1.size1{font-size:1em}.katex .fontsize-ensurer.reset-size1.size2,.katex .sizing.reset-size1.size2{font-size:1.2em}.katex .fontsize-ensurer.reset-size1.size3,.katex .sizing.reset-size1.size3{font-size:1.4em}.katex .fontsize-ensurer.reset-size1.size4,.katex .sizing.reset-size1.size4{font-size:1.6em}.katex .fontsize-ensurer.reset-size1.size5,.katex .sizing.reset-size1.size5{font-size:1.8em}.katex .fontsize-ensurer.reset-size1.size6,.katex .sizing.reset-size1.size6{font-size:2em}.katex .fontsize-ensurer.reset-size1.size7,.katex .sizing.reset-size1.size7{font-size:2.4em}.katex .fontsize-ensurer.reset-size1.size8,.katex .sizing.reset-size1.size8{font-size:2.88em}.katex .fontsize-ensurer.reset-size1.size9,.katex .sizing.reset-size1.size9{font-size:3.456em}.katex .fontsize-ensurer.reset-size1.size10,.katex .sizing.reset-size1.size10{font-size:4.148em}.katex .fontsize-ensurer.reset-size1.size11,.katex .sizing.reset-size1.size11{font-size:4.976em}.katex .fontsize-ensurer.reset-size2.size1,.katex .sizing.reset-size2.size1{font-size:.8333333333em}.katex .fontsize-ensurer.reset-size2.size2,.katex .sizing.reset-size2.size2{font-size:1em}.katex .fontsize-ensurer.reset-size2.size3,.katex .sizing.reset-size2.size3{font-size:1.1666666667em}.katex .fontsize-ensurer.reset-size2.size4,.katex .sizing.reset-size2.size4{font-size:1.3333333333em}.katex .fontsize-ensurer.reset-size2.size5,.katex .sizing.reset-size2.size5{font-size:1.5em}.katex .fontsize-ensurer.reset-size2.size6,.katex .sizing.reset-size2.size6{font-size:1.6666666667em}.katex .fontsize-ensurer.reset-size2.size7,.katex .sizing.reset-size2.size7{font-size:2em}.katex .fontsize-ensurer.reset-size2.size8,.katex .sizing.reset-size2.size8{font-size:2.4em}.katex .fontsize-ensurer.reset-size2.size9,.katex .sizing.reset-size2.size9{font-size:2.88em}.katex .fontsize-ensurer.reset-size2.size10,.katex .sizing.reset-size2.size10{font-size:3.4566666667em}.katex .fontsize-ensurer.reset-size2.size11,.katex .sizing.reset-size2.size11{font-size:4.1466666667em}.katex .fontsize-ensurer.reset-size3.size1,.katex .sizing.reset-size3.size1{font-size:.7142857143em}.katex .fontsize-ensurer.reset-size3.size2,.katex .sizing.reset-size3.size2{font-size:.8571428571em}.katex .fontsize-ensurer.reset-size3.size3,.katex .sizing.reset-size3.size3{font-size:1em}.katex .fontsize-ensurer.reset-size3.size4,.katex .sizing.reset-size3.size4{font-size:1.1428571429em}.katex .fontsize-ensurer.reset-size3.size5,.katex .sizing.reset-size3.size5{font-size:1.2857142857em}.katex .fontsize-ensurer.reset-size3.size6,.katex .sizing.reset-size3.size6{font-size:1.4285714286em}.katex .fontsize-ensurer.reset-size3.size7,.katex .sizing.reset-size3.size7{font-size:1.7142857143em}.katex .fontsize-ensurer.reset-size3.size8,.katex .sizing.reset-size3.size8{font-size:2.0571428571em}.katex .fontsize-ensurer.reset-size3.size9,.katex .sizing.reset-size3.size9{font-size:2.4685714286em}.katex .fontsize-ensurer.reset-size3.size10,.katex .sizing.reset-size3.size10{font-size:2.9628571429em}.katex .fontsize-ensurer.reset-size3.size11,.katex .sizing.reset-size3.size11{font-size:3.5542857143em}.katex .fontsize-ensurer.reset-size4.size1,.katex .sizing.reset-size4.size1{font-size:.625em}.katex .fontsize-ensurer.reset-size4.size2,.katex .sizing.reset-size4.size2{font-size:.75em}.katex .fontsize-ensurer.reset-size4.size3,.katex .sizing.reset-size4.size3{font-size:.875em}.katex .fontsize-ensurer.reset-size4.size4,.katex .sizing.reset-size4.size4{font-size:1em}.katex .fontsize-ensurer.reset-size4.size5,.katex .sizing.reset-size4.size5{font-size:1.125em}.katex .fontsize-ensurer.reset-size4.size6,.katex .sizing.reset-size4.size6{font-size:1.25em}.katex .fontsize-ensurer.reset-size4.size7,.katex .sizing.reset-size4.size7{font-size:1.5em}.katex .fontsize-ensurer.reset-size4.size8,.katex .sizing.reset-size4.size8{font-size:1.8em}.katex .fontsize-ensurer.reset-size4.size9,.katex .sizing.reset-size4.size9{font-size:2.16em}.katex .fontsize-ensurer.reset-size4.size10,.katex .sizing.reset-size4.size10{font-size:2.5925em}.katex .fontsize-ensurer.reset-size4.size11,.katex .sizing.reset-size4.size11{font-size:3.11em}.katex .fontsize-ensurer.reset-size5.size1,.katex .sizing.reset-size5.size1{font-size:.5555555556em}.katex .fontsize-ensurer.reset-size5.size2,.katex .sizing.reset-size5.size2{font-size:.6666666667em}.katex .fontsize-ensurer.reset-size5.size3,.katex .sizing.reset-size5.size3{font-size:.7777777778em}.katex .fontsize-ensurer.reset-size5.size4,.katex .sizing.reset-size5.size4{font-size:.8888888889em}.katex .fontsize-ensurer.reset-size5.size5,.katex .sizing.reset-size5.size5{font-size:1em}.katex .fontsize-ensurer.reset-size5.size6,.katex .sizing.reset-size5.size6{font-size:1.1111111111em}.katex .fontsize-ensurer.reset-size5.size7,.katex .sizing.reset-size5.size7{font-size:1.3333333333em}.katex .fontsize-ensurer.reset-size5.size8,.katex .sizing.reset-size5.size8{font-size:1.6em}.katex .fontsize-ensurer.reset-size5.size9,.katex .sizing.reset-size5.size9{font-size:1.92em}.katex .fontsize-ensurer.reset-size5.size10,.katex .sizing.reset-size5.size10{font-size:2.3044444444em}.katex .fontsize-ensurer.reset-size5.size11,.katex .sizing.reset-size5.size11{font-size:2.7644444444em}.katex .fontsize-ensurer.reset-size6.size1,.katex .sizing.reset-size6.size1{font-size:.5em}.katex .fontsize-ensurer.reset-size6.size2,.katex .sizing.reset-size6.size2{font-size:.6em}.katex .fontsize-ensurer.reset-size6.size3,.katex .sizing.reset-size6.size3{font-size:.7em}.katex .fontsize-ensurer.reset-size6.size4,.katex .sizing.reset-size6.size4{font-size:.8em}.katex .fontsize-ensurer.reset-size6.size5,.katex .sizing.reset-size6.size5{font-size:.9em}.katex .fontsize-ensurer.reset-size6.size6,.katex .sizing.reset-size6.size6{font-size:1em}.katex .fontsize-ensurer.reset-size6.size7,.katex .sizing.reset-size6.size7{font-size:1.2em}.katex .fontsize-ensurer.reset-size6.size8,.katex .sizing.reset-size6.size8{font-size:1.44em}.katex .fontsize-ensurer.reset-size6.size9,.katex .sizing.reset-size6.size9{font-size:1.728em}.katex .fontsize-ensurer.reset-size6.size10,.katex .sizing.reset-size6.size10{font-size:2.074em}.katex .fontsize-ensurer.reset-size6.size11,.katex .sizing.reset-size6.size11{font-size:2.488em}.katex .fontsize-ensurer.reset-size7.size1,.katex .sizing.reset-size7.size1{font-size:.4166666667em}.katex .fontsize-ensurer.reset-size7.size2,.katex .sizing.reset-size7.size2{font-size:.5em}.katex .fontsize-ensurer.reset-size7.size3,.katex .sizing.reset-size7.size3{font-size:.5833333333em}.katex .fontsize-ensurer.reset-size7.size4,.katex .sizing.reset-size7.size4{font-size:.6666666667em}.katex .fontsize-ensurer.reset-size7.size5,.katex .sizing.reset-size7.size5{font-size:.75em}.katex .fontsize-ensurer.reset-size7.size6,.katex .sizing.reset-size7.size6{font-size:.8333333333em}.katex .fontsize-ensurer.reset-size7.size7,.katex .sizing.reset-size7.size7{font-size:1em}.katex .fontsize-ensurer.reset-size7.size8,.katex .sizing.reset-size7.size8{font-size:1.2em}.katex .fontsize-ensurer.reset-size7.size9,.katex .sizing.reset-size7.size9{font-size:1.44em}.katex .fontsize-ensurer.reset-size7.size10,.katex .sizing.reset-size7.size10{font-size:1.7283333333em}.katex .fontsize-ensurer.reset-size7.size11,.katex .sizing.reset-size7.size11{font-size:2.0733333333em}.katex .fontsize-ensurer.reset-size8.size1,.katex .sizing.reset-size8.size1{font-size:.3472222222em}.katex .fontsize-ensurer.reset-size8.size2,.katex .sizing.reset-size8.size2{font-size:.4166666667em}.katex .fontsize-ensurer.reset-size8.size3,.katex .sizing.reset-size8.size3{font-size:.4861111111em}.katex .fontsize-ensurer.reset-size8.size4,.katex .sizing.reset-size8.size4{font-size:.5555555556em}.katex .fontsize-ensurer.reset-size8.size5,.katex .sizing.reset-size8.size5{font-size:.625em}.katex .fontsize-ensurer.reset-size8.size6,.katex .sizing.reset-size8.size6{font-size:.6944444444em}.katex .fontsize-ensurer.reset-size8.size7,.katex .sizing.reset-size8.size7{font-size:.8333333333em}.katex .fontsize-ensurer.reset-size8.size8,.katex .sizing.reset-size8.size8{font-size:1em}.katex .fontsize-ensurer.reset-size8.size9,.katex .sizing.reset-size8.size9{font-size:1.2em}.katex .fontsize-ensurer.reset-size8.size10,.katex .sizing.reset-size8.size10{font-size:1.4402777778em}.katex .fontsize-ensurer.reset-size8.size11,.katex .sizing.reset-size8.size11{font-size:1.7277777778em}.katex .fontsize-ensurer.reset-size9.size1,.katex .sizing.reset-size9.size1{font-size:.2893518519em}.katex .fontsize-ensurer.reset-size9.size2,.katex .sizing.reset-size9.size2{font-size:.3472222222em}.katex .fontsize-ensurer.reset-size9.size3,.katex .sizing.reset-size9.size3{font-size:.4050925926em}.katex .fontsize-ensurer.reset-size9.size4,.katex .sizing.reset-size9.size4{font-size:.462962963em}.katex .fontsize-ensurer.reset-size9.size5,.katex .sizing.reset-size9.size5{font-size:.5208333333em}.katex .fontsize-ensurer.reset-size9.size6,.katex .sizing.reset-size9.size6{font-size:.5787037037em}.katex .fontsize-ensurer.reset-size9.size7,.katex .sizing.reset-size9.size7{font-size:.6944444444em}.katex .fontsize-ensurer.reset-size9.size8,.katex .sizing.reset-size9.size8{font-size:.8333333333em}.katex .fontsize-ensurer.reset-size9.size9,.katex .sizing.reset-size9.size9{font-size:1em}.katex .fontsize-ensurer.reset-size9.size10,.katex .sizing.reset-size9.size10{font-size:1.2002314815em}.katex .fontsize-ensurer.reset-size9.size11,.katex .sizing.reset-size9.size11{font-size:1.4398148148em}.katex .fontsize-ensurer.reset-size10.size1,.katex .sizing.reset-size10.size1{font-size:.2410800386em}.katex .fontsize-ensurer.reset-size10.size2,.katex .sizing.reset-size10.size2{font-size:.2892960463em}.katex .fontsize-ensurer.reset-size10.size3,.katex .sizing.reset-size10.size3{font-size:.337512054em}.katex .fontsize-ensurer.reset-size10.size4,.katex .sizing.reset-size10.size4{font-size:.3857280617em}.katex .fontsize-ensurer.reset-size10.size5,.katex .sizing.reset-size10.size5{font-size:.4339440694em}.katex .fontsize-ensurer.reset-size10.size6,.katex .sizing.reset-size10.size6{font-size:.4821600771em}.katex .fontsize-ensurer.reset-size10.size7,.katex .sizing.reset-size10.size7{font-size:.5785920926em}.katex .fontsize-ensurer.reset-size10.size8,.katex .sizing.reset-size10.size8{font-size:.6943105111em}.katex .fontsize-ensurer.reset-size10.size9,.katex .sizing.reset-size10.size9{font-size:.8331726133em}.katex .fontsize-ensurer.reset-size10.size10,.katex .sizing.reset-size10.size10{font-size:1em}.katex .fontsize-ensurer.reset-size10.size11,.katex .sizing.reset-size10.size11{font-size:1.1996142719em}.katex .fontsize-ensurer.reset-size11.size1,.katex .sizing.reset-size11.size1{font-size:.2009646302em}.katex .fontsize-ensurer.reset-size11.size2,.katex .sizing.reset-size11.size2{font-size:.2411575563em}.katex .fontsize-ensurer.reset-size11.size3,.katex .sizing.reset-size11.size3{font-size:.2813504823em}.katex .fontsize-ensurer.reset-size11.size4,.katex .sizing.reset-size11.size4{font-size:.3215434084em}.katex .fontsize-ensurer.reset-size11.size5,.katex .sizing.reset-size11.size5{font-size:.3617363344em}.katex .fontsize-ensurer.reset-size11.size6,.katex .sizing.reset-size11.size6{font-size:.4019292605em}.katex .fontsize-ensurer.reset-size11.size7,.katex .sizing.reset-size11.size7{font-size:.4823151125em}.katex .fontsize-ensurer.reset-size11.size8,.katex .sizing.reset-size11.size8{font-size:.578778135em}.katex .fontsize-ensurer.reset-size11.size9,.katex .sizing.reset-size11.size9{font-size:.6945337621em}.katex .fontsize-ensurer.reset-size11.size10,.katex .sizing.reset-size11.size10{font-size:.8336012862em}.katex .fontsize-ensurer.reset-size11.size11,.katex .sizing.reset-size11.size11{font-size:1em}.katex .delimsizing.size1{font-family:KaTeX_Size1}.katex .delimsizing.size2{font-family:KaTeX_Size2}.katex .delimsizing.size3{font-family:KaTeX_Size3}.katex .delimsizing.size4{font-family:KaTeX_Size4}.katex .delimsizing.mult .delim-size1>span{font-family:KaTeX_Size1}.katex .delimsizing.mult .delim-size4>span{font-family:KaTeX_Size4}.katex .nulldelimiter{display:inline-block;width:.12em}.katex .delimcenter,.katex .op-symbol{position:relative}.katex .op-symbol.small-op{font-family:KaTeX_Size1}.katex .op-symbol.large-op{font-family:KaTeX_Size2}.katex .accent>.vlist-t,.katex .op-limits>.vlist-t{text-align:center}.katex .accent .accent-body{position:relative}.katex .accent .accent-body:not(.accent-full){width:0}.katex .overlay{display:block}.katex .mtable .vertical-separator{display:inline-block;min-width:1px}.katex .mtable .arraycolsep{display:inline-block}.katex .mtable .col-align-c>.vlist-t{text-align:center}.katex .mtable .col-align-l>.vlist-t{text-align:left}.katex .mtable .col-align-r>.vlist-t{text-align:right}.katex .svg-align{text-align:left}.katex svg{fill:currentColor;stroke:currentColor;fill-rule:nonzero;fill-opacity:1;stroke-width:1;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;stroke-opacity:1;display:block;height:inherit;position:absolute;width:100%}.katex svg path{stroke:none}.katex img{border-style:none;max-height:none;max-width:none;min-height:0;min-width:0}.katex .stretchy{display:block;overflow:hidden;position:relative;width:100%}.katex .stretchy:after,.katex .stretchy:before{content:""}.katex .hide-tail{overflow:hidden;position:relative;width:100%}.katex .halfarrow-left{left:0;overflow:hidden;position:absolute;width:50.2%}.katex .halfarrow-right{overflow:hidden;position:absolute;right:0;width:50.2%}.katex .brace-left{left:0;overflow:hidden;position:absolute;width:25.1%}.katex .brace-center{left:25%;overflow:hidden;position:absolute;width:50%}.katex .brace-right{overflow:hidden;position:absolute;right:0;width:25.1%}.katex .x-arrow-pad{padding:0 .5em}.katex .cd-arrow-pad{padding:0 .55556em 0 .27778em}.katex .mover,.katex .munder,.katex .x-arrow{text-align:center}.katex .boxpad{padding:0 .3em}.katex .fbox,.katex .fcolorbox{border:.04em solid;box-sizing:border-box}.katex .cancel-pad{padding:0 .2em}.katex .cancel-lap{margin-left:-.2em;margin-right:-.2em}.katex .sout{border-bottom-style:solid;border-bottom-width:.08em}.katex .angl{border-right:.049em solid;border-top:.049em solid;box-sizing:border-box;margin-right:.03889em}.katex .anglpad{padding:0 .03889em}.katex .eqn-num:before{content:"(" counter(katexEqnNo) ")";counter-increment:katexEqnNo}.katex .mml-eqn-num:before{content:"(" counter(mmlEqnNo) ")";counter-increment:mmlEqnNo}.katex .mtr-glue{width:50%}.katex .cd-vert-arrow{display:inline-block;position:relative}.katex .cd-label-left{display:inline-block;position:absolute;right:calc(50% + .3em);text-align:left}.katex .cd-label-right{display:inline-block;left:calc(50% + .3em);position:absolute;text-align:right}.katex-display{display:block;margin:1em 0;text-align:center}.katex-display>.katex{display:block;text-align:center;white-space:nowrap}.katex-display>.katex>.katex-html{display:block;position:relative}.katex-display>.katex>.katex-html>.tag{position:absolute;right:0}.katex-display.leqno>.katex>.katex-html>.tag{left:0;right:auto}.katex-display.fleqn>.katex{padding-left:2em;text-align:left}body{counter-reset:katexEqnNo mmlEqnNo}\n'
  };

  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  function postBridgeMessage(payload) {
    window.postMessage({ source: BRIDGE_SOURCE_EXT, ...payload }, "*");
  }

  function resolveBridgeRequest(id, ok, value, error) {
    const pending = pendingBridgeRequests.get(id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeoutId);
    pendingBridgeRequests.delete(id);
    if (ok) {
      pending.resolve(value);
      return;
    }
    pending.reject(new Error(error || "bridge error"));
  }

  function applyStoreDump(dump) {
    Object.keys(gmStore).forEach((key) => {
      delete gmStore[key];
    });
    if (!dump || typeof dump !== "object") {
      return;
    }
    Object.keys(dump).forEach((key) => {
      if (isCoolauxvKey(key)) {
        gmStore[key] = dump[key];
      }
    });
  }

  function requestBridge(action, payload = {}) {
    if (!bridgeReady || !bridgeToken) {
      return Promise.reject(new Error("bridge not ready"));
    }
    const id = `${Date.now()}-${bridgeRequestCounter++}`;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingBridgeRequests.delete(id);
        reject(new Error("bridge timeout"));
      }, BRIDGE_REQUEST_TIMEOUT_MS);
      pendingBridgeRequests.set(id, { resolve, reject, timeoutId });
      postBridgeMessage({
        type: BRIDGE_REQUEST_TYPE,
        id,
        action,
        token: bridgeToken,
        ...payload
      });
    });
  }

  function setChromeStorageValue(key, value) {
    if (!isCoolauxvKey(key)) {
      return;
    }
    if (!globalThis.chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }
    const payload = {};
    payload[key] = value;
    chrome.storage.local.set(payload);
  }

  function removeChromeStorageKey(key) {
    if (!isCoolauxvKey(key)) {
      return;
    }
    if (!globalThis.chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }
    chrome.storage.local.remove([key]);
  }

  function loadFromChromeStorage() {
    return new Promise((resolve) => {
      if (!globalThis.chrome || !chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }
      chrome.storage.local.get(null, (items) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn("CoolAuxv chrome storage read failed", chrome.runtime.lastError);
          resolve();
          return;
        }
        applyStoreDump(items);
        resolve();
      });
    });
  }

  function syncChromeStorage(values) {
    return new Promise((resolve) => {
      if (!globalThis.chrome || !chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }
      chrome.storage.local.get(null, (items) => {
        const payload = {};
        const removeKeys = [];
        const keepKeys = new Set();
        Object.keys(values || {}).forEach((key) => {
          if (isCoolauxvKey(key)) {
            payload[key] = values[key];
            keepKeys.add(key);
          }
        });
        Object.keys(items || {}).forEach((key) => {
          if (isCoolauxvKey(key) && !keepKeys.has(key)) {
            removeKeys.push(key);
          }
        });
        const finish = () => resolve();
        const afterRemove = () => chrome.storage.local.set(payload, finish);
        if (removeKeys.length) {
          chrome.storage.local.remove(removeKeys, afterRemove);
          return;
        }
        chrome.storage.local.set(payload, finish);
      });
    });
  }

  async function loadFromBridge() {
    const dump = await requestBridge("dump");
    applyStoreDump(dump);
  }

  async function pushStoreToBridge(values) {
    const entries = Object.entries(values || {}).filter(([key]) => isCoolauxvKey(key));
    for (const [key, value] of entries) {
      await requestBridge("set", { key, value });
    }
  }

  async function switchToBridge() {
    if (!bridgeReady || !bridgeToken) {
      return;
    }
    if (bridgeActivationPromise) {
      return bridgeActivationPromise;
    }
    bridgeActivationPromise = (async () => {
      gmStorageBackend = "bridge";
      let dump = null;
      try {
        dump = await requestBridge("dump");
      } catch (err) {
        console.warn("CoolAuxv bridge dump failed", err);
        await syncChromeStorage(gmStore);
        return;
      }
      const dumpKeys = dump && typeof dump === "object" ? Object.keys(dump) : [];
      if (dumpKeys.length > 0) {
        applyStoreDump(dump);
      } else if (Object.keys(gmStore).length > 0) {
        await pushStoreToBridge(gmStore);
      }
      await syncChromeStorage(gmStore);
    })().catch((err) => {
      console.warn("CoolAuxv bridge switch failed", err);
    });
    return bridgeActivationPromise;
  }

  function handleBridgeMessage(event) {
    if (event.source !== window) {
      return;
    }
    const data = event.data;
    if (!data || data.source !== BRIDGE_SOURCE_US) {
      return;
    }
    if (data.type === BRIDGE_READY_TYPE) {
      if (bridgeNonce && data.nonce && data.nonce !== bridgeNonce) {
        return;
      }
      bridgeToken = data.token || bridgeToken;
      bridgeReady = !!bridgeToken;
      if (bridgeHandshakeResolve) {
        bridgeHandshakeResolve(true);
      }
      stopBridgePing();
      return;
    }
    if (data.type === BRIDGE_RESPONSE_TYPE) {
      resolveBridgeRequest(data.id, data.ok, data.value, data.error);
    }
  }

  function stopBridgePing() {
    if (bridgePingIntervalId) {
      clearInterval(bridgePingIntervalId);
      bridgePingIntervalId = null;
    }
    if (bridgePingStopTimerId) {
      clearTimeout(bridgePingStopTimerId);
      bridgePingStopTimerId = null;
    }
  }

  function startBridgePing(nonce) {
    if (bridgePingIntervalId) {
      return;
    }
    const ping = () => {
      postBridgeMessage({ type: BRIDGE_PING_TYPE, nonce });
    };
    bridgePingIntervalId = setInterval(ping, BRIDGE_PING_INTERVAL_MS);
    bridgePingStopTimerId = setTimeout(() => {
      stopBridgePing();
    }, BRIDGE_PING_MAX_DURATION_MS);
    ping();
  }

  function waitForBridge() {
    if (!BRIDGE_ENABLED) {
      startBridgePing(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
      return Promise.resolve(false);
    }
    if (bridgeReady) {
      return Promise.resolve(true);
    }
    if (bridgeHandshakePromise) {
      return bridgeHandshakePromise;
    }
    bridgeNonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    bridgeHandshakePromise = new Promise((resolve) => {
      bridgeHandshakeResolve = resolve;
    });
    startBridgePing(bridgeNonce);
    const timeoutId = setTimeout(() => {
      if (bridgeHandshakeResolve) {
        bridgeHandshakeResolve(false);
      }
    }, BRIDGE_HANDSHAKE_TIMEOUT_MS);
    bridgeHandshakePromise.then((result) => {
      clearTimeout(timeoutId);
      bridgeHandshakePromise = null;
      bridgeHandshakeResolve = null;
      if (result) {
        stopBridgePing();
      }
    });
    return bridgeHandshakePromise;
  }

  async function initStorage() {
    try {
      gmStorageBackend = "chrome";
      await loadFromChromeStorage();
    } catch (err) {
      console.warn("CoolAuxv storage init failed", err);
      gmStorageBackend = "memory";
    }
    if (storageReadyResolve) {
      storageReadyResolve();
    }
    waitForBridge();
  }

  window.addEventListener("message", handleBridgeMessage);
  initStorage();

  const GM_addStyle = (cssText) => {
    if (!cssText) {
      return null;
    }
    const style = document.createElement("style");
    style.textContent = cssText;
    (document.head || document.documentElement).appendChild(style);
    return style;
  };

  const GM_getValue = (key, defaultValue) => {
    return hasOwn(gmStore, key) ? gmStore[key] : defaultValue;
  };

  const GM_setValue = (key, value) => {
    gmStore[key] = value;
    if (gmStorageBackend !== "memory") {
      setChromeStorageValue(key, value);
    }
  };

  const GM_deleteValue = (key) => {
    delete gmStore[key];
    if (gmStorageBackend !== "memory") {
      removeChromeStorageKey(key);
    }
  };

  const GM_listValues = () => Object.keys(gmStore);

  const fallbackCopy = (text) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("Clipboard fallback failed", err);
    }
    textarea.remove();
  };

  const GM_setClipboard = (text) => {
    const value = text == null ? "" : String(text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).catch(() => fallbackCopy(value));
      return;
    }
    fallbackCopy(value);
  };

  const GM_getResourceText = (name) => {
    return resourceText[name] || "";
  };

  const headersToString = (headers) => {
    const lines = [];
    headers.forEach((value, key) => {
      lines.push(`${key}: ${value}`);
    });
    return lines.join("\\r\\n");
  };

  const GM_xmlhttpRequestWithFetch = (options) => {
    const opts = options || {};
    const controller = new AbortController();
    let timeoutId = null;
    let completed = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    if (opts.timeout) {
      timeoutId = setTimeout(() => {
        if (completed) {
          return;
        }
        completed = true;
        controller.abort();
        if (opts.ontimeout) {
          opts.ontimeout({ status: 0, statusText: "timeout" });
        }
      }, opts.timeout);
    }

    fetch(opts.url, {
      method: opts.method || "GET",
      headers: opts.headers || {},
      body: opts.data,
      signal: controller.signal,
      credentials: "omit"
    }).then(async (response) => {
      if (completed) {
        return;
      }
      const base = {
        status: response.status,
        statusText: response.statusText,
        responseHeaders: headersToString(response.headers),
        finalUrl: response.url
      };

      if (opts.responseType === "stream" && response.body) {
        const streams = response.body.tee();
        const streamForScript = streams[0];
        const streamForLoad = streams[1];

        const startRes = {
          ...base,
          response: streamForScript
        };
        if (opts.onloadstart) {
          opts.onloadstart(startRes);
        }
        if (opts.onload) {
          const text = await new Response(streamForLoad).text();
          opts.onload({
            ...base,
            response: streamForScript,
            responseText: text
          });
        }
        completed = true;
        cleanup();
        return;
      }

      let data = "";
      if (opts.responseType === "arraybuffer") {
        data = await response.arrayBuffer();
      } else if (opts.responseType === "blob") {
        data = await response.blob();
      } else if (opts.responseType === "json") {
        data = await response.json();
      } else {
        data = await response.text();
      }

      const res = {
        ...base,
        response: data,
        responseText: typeof data === "string" ? data : ""
      };

      if (opts.onloadstart) {
        opts.onloadstart(res);
      }
      if (opts.onload) {
        opts.onload(res);
      }
      completed = true;
      cleanup();
    }).catch((err) => {
      if (completed) {
        return;
      }
      completed = true;
      cleanup();
      if (err && err.name === "AbortError") {
        return;
      }
      if (opts.onerror) {
        opts.onerror(err);
      }
    });

    return {
      abort: () => {
        if (completed) {
          return;
        }
        completed = true;
        cleanup();
        controller.abort();
      }
    };
  };

  const GM_xmlhttpRequestViaBackground = (options) => {
    const opts = options || {};
    const responseType = opts.responseType || "";
    const port = chrome.runtime.connect({ name: "coolauxv-gm-xhr" });
    let completed = false;
    let timeoutId = null;
    let responseBase = null;
    let streamController = null;
    let streamQueue = [];
    let streamClosed = false;
    let stream = null;
    let responseText = "";
    const decoder = responseType === "stream" && typeof TextDecoder !== "undefined"
      ? new TextDecoder("utf-8")
      : null;
    const encoder = responseType === "stream" && typeof TextEncoder !== "undefined"
      ? new TextEncoder()
      : null;
    let chunkCount = 0;
    let chunkBytes = 0;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (port) {
        try {
          port.disconnect();
        } catch (e) {
          // ignore
        }
      }
    };

    const fail = (err) => {
      if (completed) {
        return;
      }
      completed = true;
      cleanup();
      if (opts.onerror) {
        opts.onerror(err);
      }
    };

    const ensureStream = () => {
      if (stream) {
        return stream;
      }
      stream = new ReadableStream({
        start(controller) {
          streamController = controller;
          if (streamQueue.length) {
            streamQueue.forEach((chunk) => controller.enqueue(chunk));
            streamQueue = [];
          }
          if (streamClosed) {
            controller.close();
          }
        },
        cancel() {
          if (port) {
            try {
              port.postMessage({ type: "abort" });
            } catch (e) {
              // ignore
            }
          }
        }
      });
      return stream;
    };

    if (opts.timeout) {
      timeoutId = setTimeout(() => {
        if (completed) {
          return;
        }
        completed = true;
        if (port) {
          try {
            port.postMessage({ type: "abort" });
          } catch (e) {
            // ignore
          }
        }
        cleanup();
        if (opts.ontimeout) {
          opts.ontimeout({ status: 0, statusText: "timeout" });
        }
      }, opts.timeout);
    }

    port.onMessage.addListener((msg) => {
      if (!msg || completed) {
        return;
      }
      if (msg.type === "start") {
        responseBase = {
          status: msg.status || 0,
          statusText: msg.statusText || "",
          responseHeaders: msg.responseHeaders || "",
          finalUrl: msg.finalUrl || opts.url || ""
        };
        if (responseType === "stream") {
          const res = {
            ...responseBase,
            response: ensureStream()
          };
          if (opts.onloadstart) {
            opts.onloadstart(res);
          }
        }
        return;
      }

      if (msg.type === "chunk" && responseType === "stream") {
        let chunk = null;
        if (typeof msg.chunkText === "string") {
          if (msg.chunkText) {
            responseText += msg.chunkText;
            chunk = encoder ? encoder.encode(msg.chunkText) : new TextEncoder().encode(msg.chunkText);
          }
        } else if (msg.chunk) {
          chunk = new Uint8Array(msg.chunk);
          if (decoder) {
            responseText += decoder.decode(chunk, { stream: true });
          }
        }
        if (chunk) {
          chunkCount += 1;
          chunkBytes += chunk.length;
          log("debug", "GM chunk", chunk.length);
          if (streamController) {
            streamController.enqueue(chunk);
          } else {
            streamQueue.push(chunk);
          }
        }
        return;
      }

      if (msg.type === "end" && responseType === "stream") {
        streamClosed = true;
        if (streamController) {
          streamController.close();
        }
        if (decoder) {
          responseText += decoder.decode();
        }
        log("debug", "GM stream end", { chunkCount, chunkBytes, responseTextLength: responseText.length });
        if (opts.onload) {
          const res = {
            ...(responseBase || { status: 0, statusText: "" }),
            response: stream || ensureStream(),
            responseText: responseText
          };
          opts.onload(res);
        }
        completed = true;
        cleanup();
        return;
      }

      if (msg.type === "load") {
        const base = {
          status: msg.status || 0,
          statusText: msg.statusText || "",
          responseHeaders: msg.responseHeaders || "",
          finalUrl: msg.finalUrl || opts.url || ""
        };
        let data = msg.data;
        if (msg.responseType === "blob") {
          data = new Blob([msg.data || new ArrayBuffer(0)], { type: msg.blobType || "" });
        }
        const res = {
          ...base,
          response: data,
          responseText: typeof data === "string" ? data : ""
        };
        if (opts.onloadstart) {
          opts.onloadstart(res);
        }
        if (opts.onload) {
          opts.onload(res);
        }
        completed = true;
        cleanup();
        return;
      }

      if (msg.type === "error") {
        const err = new Error(msg.message || "GM_xmlhttpRequest error");
        if (msg.name) {
          err.name = msg.name;
        }
        fail(err);
      }
    });

    port.onDisconnect.addListener(() => {
      if (completed) {
        return;
      }
      fail(new Error("GM_xmlhttpRequest disconnected"));
    });

    try {
      port.postMessage({
        type: "request",
        url: opts.url,
        method: opts.method || "GET",
        headers: opts.headers || {},
        data: opts.data,
        responseType: responseType
      });
    } catch (err) {
      fail(err);
    }

    return {
      abort: () => {
        if (completed) {
          return;
        }
        completed = true;
        if (port) {
          try {
            port.postMessage({ type: "abort" });
          } catch (e) {
            // ignore
          }
        }
        cleanup();
      }
    };
  };

  const GM_xmlhttpRequest = (options) => {
    const opts = options || {};
    if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.connect) {
      return GM_xmlhttpRequestWithFetch(opts);
    }
    try {
      return GM_xmlhttpRequestViaBackground(opts);
    } catch (err) {
      return GM_xmlhttpRequestWithFetch(opts);
    }
  };

  globalThis.GM_addStyle = GM_addStyle;
  globalThis.GM_getValue = GM_getValue;
  globalThis.GM_setValue = GM_setValue;
  globalThis.GM_deleteValue = GM_deleteValue;
  globalThis.GM_listValues = GM_listValues;
  globalThis.GM_setClipboard = GM_setClipboard;
  globalThis.GM_getResourceText = GM_getResourceText;
  globalThis.GM_xmlhttpRequest = GM_xmlhttpRequest;
})();
