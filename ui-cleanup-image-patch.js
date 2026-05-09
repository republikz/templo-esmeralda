(function () {
  "use strict";

  const UPLOADS = {
    roomImageUpload: { hiddenId: "roomImageData", previewId: "roomImagePreview", maxSize: 1400 },
    npcImageUpload: { hiddenId: "npcImage", previewId: "npcImagePreview", maxSize: 1100 },
    campfireHeroImageUpload: { hiddenId: "campfireHeroImage", previewId: "campfireHeroImagePreview", maxSize: 1100 }
  };

  let uploadBound = false;

  function injectStyles() {
    if (document.querySelector("#uiCleanupImagePatchStyles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "uiCleanupImagePatchStyles";
    style.textContent = `
      .image-preview { min-height: 0; overflow: hidden; }
      .image-preview img,
      .room-card > img,
      .room-card .room-image img,
      .room-image img,
      .npc-card img,
      .npc-image img,
      .hero-avatar img,
      .dash-hero-avatar img {
        width: 100% !important;
        height: 100% !important;
        display: block !important;
        object-fit: cover !important;
        object-position: center center !important;
      }
      .image-preview img {
        max-height: 260px;
        aspect-ratio: 16 / 9;
        border-radius: 8px;
        border: 1px solid rgba(231, 197, 123, .28);
        background: rgba(0, 0, 0, .22);
      }
      .room-card > img,
      .room-card .room-image,
      .room-image {
        width: 100%;
        aspect-ratio: 16 / 9;
        max-height: 260px;
        overflow: hidden;
        border-radius: 8px;
        background: linear-gradient(145deg, rgba(41, 34, 21, .86), rgba(8, 11, 10, .96));
      }
      .npc-card .npc-image,
      .npc-image {
        aspect-ratio: 4 / 5;
        min-height: 220px;
        overflow: hidden;
        border-radius: 8px;
        background: linear-gradient(145deg, rgba(41, 34, 21, .86), rgba(8, 11, 10, .96));
      }
      .hero-avatar,
      .dash-hero-avatar {
        overflow: hidden;
        flex: 0 0 auto;
      }
      .hero-avatar img,
      .dash-hero-avatar img { transform: scale(1.015); }
      img[data-image-error="true"] { display: none !important; }
      .upload-polish-note {
        margin-top: 8px;
        color: rgba(255, 247, 224, .62);
        font-size: .82rem;
      }
      @media (max-width: 720px) {
        .room-card > img,
        .room-card .room-image,
        .room-image,
        .image-preview img { max-height: 220px; }
        .npc-card .npc-image,
        .npc-image { min-height: 180px; }
      }
    `;
    document.head.appendChild(style);
  }

  function notify(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });
  }

  async function compressImage(file, maxSize) {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);
    const longest = Math.max(image.naturalWidth, image.naturalHeight) || maxSize;
    const scale = Math.min(1, maxSize / longest);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#10130f";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", 0.84);
  }

  function renderPreview(previewId, dataUrl) {
    const preview = document.querySelector(`#${previewId}`);
    if (!preview) {
      return;
    }
    preview.innerHTML = dataUrl
      ? `<img src="${dataUrl}" alt="Prévia da imagem" loading="lazy" decoding="async">`
      : "";
  }

  function bindUploads() {
    if (uploadBound) {
      return;
    }
    uploadBound = true;
    document.addEventListener("change", async (event) => {
      const input = event.target;
      const config = UPLOADS[input?.id];
      if (!config || !input.files || !input.files[0]) {
        return;
      }
      event.stopImmediatePropagation();
      const file = input.files[0];
      if (!file.type.startsWith("image/")) {
        notify("Escolha um arquivo de imagem.");
        input.value = "";
        return;
      }
      try {
        input.disabled = true;
        const compressed = await compressImage(file, config.maxSize);
        const hidden = document.querySelector(`#${config.hiddenId}`);
        if (hidden) {
          hidden.value = compressed;
          hidden.dispatchEvent(new Event("input", { bubbles: true }));
        }
        renderPreview(config.previewId, compressed);
        notify("Imagem preparada para salvar.");
      } catch (error) {
        console.error("Falha ao preparar imagem", error);
        notify("Não consegui preparar essa imagem. Tente outro arquivo.");
      } finally {
        input.disabled = false;
      }
    }, true);
  }

  function polishImages(root = document) {
    root.querySelectorAll("img:not([data-polished='true'])").forEach((image) => {
      image.dataset.polished = "true";
      if (!image.hasAttribute("loading")) {
        image.setAttribute("loading", "lazy");
      }
      if (!image.hasAttribute("decoding")) {
        image.setAttribute("decoding", "async");
      }
      image.addEventListener("error", () => {
        image.dataset.imageError = "true";
      }, { once: true });
    });
  }

  function addUploadNotes() {
    Object.keys(UPLOADS).forEach((id) => {
      const input = document.querySelector(`#${id}`);
      const label = input?.closest("label");
      if (!label || label.querySelector(".upload-polish-note")) {
        return;
      }
      const note = document.createElement("small");
      note.className = "upload-polish-note";
      note.textContent = "A imagem será ajustada automaticamente para caber no card.";
      label.appendChild(note);
    });
  }

  function applyAll(root = document) {
    injectStyles();
    bindUploads();
    polishImages(root);
    addUploadNotes();
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyAll();
    setTimeout(applyAll, 500);
  });
  window.addEventListener("hashchange", () => setTimeout(applyAll, 150));
}());
