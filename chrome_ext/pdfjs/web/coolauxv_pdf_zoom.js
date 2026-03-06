"use strict";

(function () {
  const INPUT_CONTAINER_ID = "coolauxvCustomScaleContainer";
  const INPUT_ID = "coolauxvCustomScaleInput";
  const SUFFIX_ID = "coolauxvCustomScaleSuffix";
  const MIN_PERCENT = 10;
  const MAX_PERCENT = 1000;

  let scaleEventBound = false;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const parsePercentInput = (raw) => {
    const text = String(raw || "").trim().replace(/%/g, "");
    if (!text) return NaN;
    const value = Number.parseFloat(text);
    if (!Number.isFinite(value)) return NaN;
    return value;
  };

  const getPdfViewer = () => {
    const app = window.PDFViewerApplication;
    if (!app || !app.pdfViewer) return null;
    return app.pdfViewer;
  };

  const getInputEl = () => document.getElementById(INPUT_ID);

  const syncInputWithCurrentScale = () => {
    const input = getInputEl();
    if (!input) return;
    const viewer = getPdfViewer();
    if (!viewer || !Number.isFinite(viewer.currentScale) || viewer.currentScale <= 0) return;
    const percent = Math.round(viewer.currentScale * 100);
    input.value = String(percent);
  };

  const applyCustomScale = (rawValue) => {
    const viewer = getPdfViewer();
    if (!viewer) return false;
    const parsed = parsePercentInput(rawValue);
    if (!Number.isFinite(parsed)) return false;
    const percent = clamp(parsed, MIN_PERCENT, MAX_PERCENT);
    viewer.currentScaleValue = String(percent / 100);
    const input = getInputEl();
    if (input) input.value = String(Math.round(percent));
    return true;
  };

  const bindScaleChangingEvent = () => {
    if (scaleEventBound) return;
    const app = window.PDFViewerApplication;
    if (!app || !app.eventBus) return;
    app.eventBus.on("scalechanging", () => {
      const input = getInputEl();
      if (!input || document.activeElement === input) return;
      syncInputWithCurrentScale();
    });
    scaleEventBound = true;
  };

  const ensureCustomScaleInput = () => {
    const scaleSelectContainer = document.getElementById("scaleSelectContainer");
    const scaleSelect = document.getElementById("scaleSelect");
    if (!scaleSelectContainer || !scaleSelect) return false;
    if (document.getElementById(INPUT_CONTAINER_ID)) return true;

    const container = document.createElement("span");
    container.id = INPUT_CONTAINER_ID;

    const input = document.createElement("input");
    input.id = INPUT_ID;
    input.className = "toolbarField";
    input.type = "text";
    input.inputMode = "decimal";
    input.placeholder = "100";
    input.title = "输入缩放百分比，按 Enter 应用";
    input.setAttribute("aria-label", "Custom zoom percentage");

    const suffix = document.createElement("span");
    suffix.id = SUFFIX_ID;
    suffix.textContent = "%";

    const commit = () => {
      if (!applyCustomScale(input.value)) {
        syncInputWithCurrentScale();
      }
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        syncInputWithCurrentScale();
        input.blur();
      }
    });
    input.addEventListener("blur", commit);

    scaleSelect.addEventListener("change", () => {
      setTimeout(syncInputWithCurrentScale, 0);
    });

    container.appendChild(input);
    container.appendChild(suffix);
    scaleSelectContainer.insertAdjacentElement("afterend", container);

    syncInputWithCurrentScale();
    return true;
  };

  const start = () => {
    const mounted = ensureCustomScaleInput();
    if (mounted) {
      bindScaleChangingEvent();
      syncInputWithCurrentScale();
    }
    return mounted;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      start();
    }, { once: true });
  } else {
    start();
  }

  let retries = 0;
  const timer = window.setInterval(() => {
    retries += 1;
    const mounted = start();
    if (mounted && scaleEventBound) {
      clearInterval(timer);
      return;
    }
    if (retries >= 120) {
      clearInterval(timer);
    }
  }, 500);
})();

