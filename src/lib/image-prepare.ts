/**
 * Prepare a product photo for upload without loading multi‑MB base64 into React state.
 * Uses object URL → canvas resize → compact JPEG data URL for the API only.
 */

const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.78;
const MAX_OUTPUT_BYTES = 450_000;

export type PreparedImage = {
  /** Short blob: URL for <img> (revoke when removed). */
  previewUrl: string;
  /** Compact data URL for API upload. */
  uploadDataUrl: string;
};

export async function prepareProductImage(file: File): Promise<PreparedImage> {
  if (
    !file.type.startsWith("image/") &&
    !/\.(jpe?g|png|webp|gif)$/i.test(file.name)
  ) {
    throw new Error(`${file.name} is not a supported image`);
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(`${file.name} is over 12 MB`);
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const bitmap = await loadDrawable(objectUrl, file);
    const { w, h } = fitSize(bitmap.width, bitmap.height, MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    freeDrawable(bitmap);

    let quality = JPEG_QUALITY;
    let blob = await canvasToBlob(canvas, quality);
    while (blob.size > MAX_OUTPUT_BYTES && quality > 0.4) {
      quality -= 0.12;
      blob = await canvasToBlob(canvas, quality);
    }
    if (blob.size > MAX_OUTPUT_BYTES * 1.5) {
      const canvas2 = document.createElement("canvas");
      canvas2.width = Math.max(1, Math.round(w * 0.6));
      canvas2.height = Math.max(1, Math.round(h * 0.6));
      const ctx2 = canvas2.getContext("2d");
      if (!ctx2) throw new Error("Canvas unavailable");
      ctx2.drawImage(canvas, 0, 0, canvas2.width, canvas2.height);
      blob = await canvasToBlob(canvas2, 0.65);
    }

    const uploadDataUrl = await blobToDataUrl(blob);
    const previewUrl = URL.createObjectURL(blob);
    return { previewUrl, uploadDataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Back-compat: returns only upload data URL. */
export async function prepareProductImageDataUrl(file: File): Promise<string> {
  const prepared = await prepareProductImage(file);
  URL.revokeObjectURL(prepared.previewUrl);
  return prepared.uploadDataUrl;
}

function fitSize(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  };
}

type Drawable = HTMLImageElement | ImageBitmap;

async function loadDrawable(url: string, file: File): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  return loadHtmlImage(url);
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = url;
  });
}

function freeDrawable(d: Drawable) {
  if (typeof ImageBitmap !== "undefined" && d instanceof ImageBitmap) {
    d.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Could not encode image"));
      },
      "image/jpeg",
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string" && r.startsWith("data:")) resolve(r);
      else reject(new Error("Could not encode image"));
    };
    reader.onerror = () => reject(new Error("Could not encode image"));
    reader.readAsDataURL(blob);
  });
}
