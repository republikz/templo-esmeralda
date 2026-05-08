(function () {
  "use strict";

  const EMERALD_SRC = "/templo-esmeralda-icon.png?v=1";

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
        filter: none !important;
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
