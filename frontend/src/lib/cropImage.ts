export type PixelCrop = { x: number; y: number; width: number; height: number };

/** Crops `src` to the given pixel area and returns a downscaled image Blob. */
export async function getCroppedBlob(
  src: string,
  crop: PixelCrop,
  maxDim = 512,
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't read that image."));
    el.src = src;
  });

  const scale = Math.min(1, maxDim / Math.max(crop.width, crop.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.width * scale);
  canvas.height = Math.round(crop.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images.");
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't export the image."))),
      "image/webp",
      0.9,
    ),
  );
}