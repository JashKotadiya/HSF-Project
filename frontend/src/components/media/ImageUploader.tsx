"use client";

import { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import supabase from "@/lib/supabase";
import { getCroppedBlob, PixelCrop } from "@/lib/cropImage";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 5 * 1024 * 1024;

type Props = {
  bucket: "avatars" | "logos";
  userId: string;
  /** File name inside the user's folder, e.g. "avatar" or "logo". */
  objectName: string;
  currentUrl?: string | null;
  /** Called with the public URL after a successful upload. The parent saves it to the database. */
  onUploaded: (publicUrl: string) => void;
  label?: string;
  aspect?: number;
  shape?: "round" | "rect";
};

export default function ImageUploader({
  bucket,
  userId,
  objectName,
  currentUrl,
  onUploaded,
  label = "Upload image",
  aspect = 1,
  shape = "rect",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Free the temporary preview URL when the cropper closes.
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  const close = () => {
    setSrc(null);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    if (inputRef.current) inputRef.current.value = "";
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("Please choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError("That image is over 5 MB. Please choose a smaller one.");
      return;
    }
    setSrc(URL.createObjectURL(file));
  };

  const save = async () => {
    if (!src || !pixels) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await getCroppedBlob(src, pixels);
      const ext = blob.type === "image/png" ? "png" : "webp"; // some browsers can't encode webp
      const path = `${userId}/${objectName}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      // ?v= busts the cache because the path stays the same when the image is replaced.
      onUploaded(`${data.publicUrl}?v=${Date.now()}`);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const previewShape = shape === "round" ? "rounded-full" : "rounded-lg";

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-[#092130]">{label}</span>
      <div className="flex items-center gap-4">
        <div
          className={`flex h-20 w-20 items-center justify-center overflow-hidden border border-[#E2E8F0] bg-[#EDE9FF] ${previewShape}`}
        >
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-[#4A0E99]">No image</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-[#A792FF] px-4 py-2 text-sm font-semibold text-[#4A0E99] hover:bg-[#EDE9FF]"
        >
          {currentUrl ? "Change" : "Choose image"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          onChange={onPick}
          className="hidden"
        />
      </div>
      {error && !src && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {src && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Crop image"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="relative h-72 w-full overflow-hidden rounded-lg bg-[#1A1A1A]">
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                cropShape={shape === "round" ? "round" : "rect"}
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) => setPixels(areaPixels)}
              />
            </div>
            <label className="mt-4 block text-sm text-[#092130]">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="mt-1 w-full accent-[#4A0E99]"
              />
            </label>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-[#475569] hover:bg-[#F1F5F9]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || !pixels}
                className="rounded-lg bg-[#4A0E99] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3a0b78] disabled:opacity-60"
              >
                {busy ? "Uploading…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}