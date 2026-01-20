(() => {
  if (window.__coolauxv_pdf_bridge_installed) {
    return;
  }
  window.__coolauxv_pdf_bridge_installed = true;

  const waitForApp = () => new Promise((resolve) => {
    const check = () => {
      if (window.PDFViewerApplication && window.PDFViewerApplication.open) {
        resolve(window.PDFViewerApplication);
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });

  window.addEventListener("message", async (event) => {
    const data = event.data;
    if (!data || data.type !== "COOLAUXV_PDF_OPEN") {
      return;
    }
    if (event.source !== window) {
      return;
    }

    const requestId = data.requestId;
    let ok = false;
    let error = "";

    try {
      const app = await waitForApp();
      await app.open(data.payload);
      ok = true;
    } catch (err) {
      error = err && err.message ? err.message : String(err);
    }

    window.postMessage(
      {
        type: "COOLAUXV_PDF_OPEN_RESULT",
        requestId,
        ok,
        error
      },
      "*"
    );
  });
})();
