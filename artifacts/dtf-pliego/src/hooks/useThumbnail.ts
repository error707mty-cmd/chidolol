import { useEffect, useRef, useCallback } from "react";
import { PliegoImage, Pliego } from "@workspace/api-client-react";

const THUMB_W = 280;
const DEBOUNCE_MS = 3000;

async function generateThumbnail(
  pliego: Pliego,
  images: PliegoImage[]
): Promise<string | null> {
  try {
    const CM_TO_PX = 10;
    const scale = THUMB_W / (pliego.widthCm * CM_TO_PX);
    const thumbH = Math.round(pliego.heightCm * CM_TO_PX * scale);

    const canvas = document.createElement("canvas");
    canvas.width = THUMB_W;
    canvas.height = thumbH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, THUMB_W, thumbH);

    const sorted = [...images].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    for (const img of sorted) {
      const url = img.imageUrl;
      if (!url) continue;

      const imgEl = new Image();
      imgEl.crossOrigin = "anonymous";
      const absoluteUrl = url.startsWith("/") ? url : `/${url}`;
      imgEl.src = absoluteUrl;

      await new Promise<void>(resolve => {
        imgEl.onload = () => resolve();
        imgEl.onerror = () => resolve();
        setTimeout(resolve, 3000);
      });

      if (imgEl.naturalWidth === 0) continue;

      const x = img.xCm * CM_TO_PX * scale;
      const y = img.yCm * CM_TO_PX * scale;
      const w = img.widthCm * CM_TO_PX * scale;
      const h = img.heightCm * CM_TO_PX * scale;
      const rot = ((img.rotation ?? 0) * Math.PI) / 180;

      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(rot);
      ctx.drawImage(imgEl, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    return canvas.toDataURL("image/jpeg", 0.65);
  } catch {
    return null;
  }
}

export function useThumbnailSave(
  pliego: Pliego | null | undefined,
  images: PliegoImage[] | null | undefined,
  token: string | null
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imagesRef = useRef(images);
  const pliegoRef = useRef(pliego);

  imagesRef.current = images;
  pliegoRef.current = pliego;

  const saveThumbnail = useCallback(async () => {
    const p = pliegoRef.current;
    const imgs = imagesRef.current;
    if (!p || !token) return;

    const dataUrl = await generateThumbnail(p, imgs ?? []);
    if (!dataUrl) return;

    try {
      await fetch(`/api/pliegos/${p.id}/thumbnail`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ thumbnailDataUrl: dataUrl }),
      });
    } catch {
      /* non-critical */
    }
  }, [token]);

  useEffect(() => {
    if (!pliego?.id) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(saveThumbnail, DEBOUNCE_MS);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [pliego?.id, images?.length, images?.map(i => `${i.id}-${i.xCm}-${i.yCm}-${i.widthCm}`).join(","), saveThumbnail]);
}
