(function () {
  "use strict";

  const EMERALD_SRC = "data:image/png;base64,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";

  function injectStyles() {
    if (document.querySelector("#emeraldIconPatchStyles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "emeraldIconPatchStyles";
    style.textContent = `
      .brand-mark.emerald-brand-mark {
        width: 54px !important;
        height: 54px !important;
        min-width: 54px !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        overflow: visible !important;
        padding: 0 !important;
      }
      .brand-mark.emerald-brand-mark::before,
      .brand-mark.emerald-brand-mark::after {
        display: none !important;
      }
      .brand-emerald-image {
        width: 50px !important;
        height: 50px !important;
        max-width: none !important;
        max-height: none !important;
        image-rendering: pixelated;
        object-fit: contain;
        display: block;
        filter: drop-shadow(0 0 7px rgba(34, 245, 127, .2));
      }
      body.sidebar-collapsed .brand-mark.emerald-brand-mark {
        width: 56px !important;
        height: 56px !important;
        min-width: 56px !important;
      }
      body.sidebar-collapsed .brand-emerald-image {
        width: 52px !important;
        height: 52px !important;
      }
    `;
    document.head.appendChild(style);
  }

  function applyIcon() {
    const mark = document.querySelector(".brand-mark");
    if (!mark) {
      return;
    }
    const currentImage = mark.querySelector(".brand-emerald-image");
    if (mark.dataset.emeraldApplied === "true" && currentImage?.getAttribute("src") === EMERALD_SRC) {
      return;
    }
    mark.classList.add("emerald-brand-mark");
    mark.innerHTML = `<img class="brand-emerald-image" src="${EMERALD_SRC}" alt="">`;
    mark.dataset.emeraldApplied = "true";
  }

  function applyAll() {
    injectStyles();
    applyIcon();
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyAll();
    setInterval(applyAll, 1000);
  });
}());
