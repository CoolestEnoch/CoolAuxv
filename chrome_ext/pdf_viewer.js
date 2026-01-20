(() => {
  const statusEl = document.getElementById("coolauxv-pdf-status");
  const titleEl = document.getElementById("coolauxv-pdf-title");
  const container = document.getElementById("viewerContainer");
  const viewer = document.getElementById("viewer");

  const setStatus = (text, isError) => {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = text || "";
    statusEl.style.color = isError ? "#fca5a5" : "#fbbf24";
  };

  const params = new URLSearchParams(location.search);
  const fileParam = params.get("file");
  if (!fileParam) {
    setStatus("缺少 PDF 地址", true);
    return;
  }

  const pdfUrl = fileParam;
  if (titleEl) {
    titleEl.textContent = pdfUrl;
    titleEl.title = pdfUrl;
  }

  if (!viewer || !container || !window.pdfjsLib || !window.pdfjsViewer) {
    setStatus("PDF 组件未加载", true);
    return;
  }

  if (pdfjsLib.FeatureTest) {
    try {
      Object.defineProperty(pdfjsLib.FeatureTest, "isEvalSupported", {
        value: false,
        configurable: true
      });
    } catch (err) {
      // Ignore override failures.
    }
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.js");

  const eventBus = new pdfjsViewer.EventBus();
  const linkService = new pdfjsViewer.PDFLinkService({ eventBus });

  const pdfViewer = new pdfjsViewer.PDFViewer({
    container,
    viewer,
    eventBus,
    linkService,
    textLayerMode: 2,
    annotationMode: 2,
    enableScripting: false
  });

  linkService.setViewer(pdfViewer);

  eventBus.on("pagesinit", () => {
    pdfViewer.currentScaleValue = "page-width";
  });

  const tryLoadDocument = async () => {
    setStatus("加载中...");
    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.arrayBuffer();
      return pdfjsLib.getDocument({ data, isEvalSupported: false });
    } catch (err) {
      return pdfjsLib.getDocument({ url: pdfUrl, isEvalSupported: false });
    }
  };

  tryLoadDocument()
    .then((task) => task.promise)
    .then((pdfDoc) => {
      pdfViewer.setDocument(pdfDoc);
      linkService.setDocument(pdfDoc, null);
      setStatus("");
    })
    .catch((err) => {
      setStatus(`加载失败: ${err && err.message ? err.message : err}`, true);
    });
})();
