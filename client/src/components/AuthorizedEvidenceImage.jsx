import { useEffect, useState } from "react";

export default function AuthorizedEvidenceImage({ asset, alt }) {
  const id = typeof asset === "object" ? asset.id : asset;
  const source =
    typeof asset === "object" && asset.url
      ? asset.url
      : `/api/evidence-assets/${id}`;
  const [image, setImage] = useState({ url: "", error: "", loading: true });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setImage({ url: "", error: "", loading: true });

    async function loadImage() {
      try {
        const token = localStorage.getItem("pacecar-token");
        const response = await fetch(source, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || `Không tải được ảnh (HTTP ${response.status})`);
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error("Tệp ảnh rỗng");
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setImage({ url: objectUrl, error: "", loading: false });
      } catch (error) {
        if (active)
          setImage({
            url: "",
            error: error.message || "Không tải được ảnh",
            loading: false,
          });
      }
    }

    loadImage();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, retry]);

  if (image.url)
    return (
      <img
        src={image.url}
        alt={alt}
        className="h-36 w-full rounded-xl bg-slate-100 object-contain"
      />
    );
  if (image.loading)
    return (
      <div className="grid h-36 place-items-center rounded-xl bg-slate-100 text-xs text-slate-500">
        Đang tải ảnh...
      </div>
    );
  return (
    <div
      role="alert"
      className="grid h-36 place-items-center rounded-xl bg-red-50 p-3 text-center text-xs text-red-700"
    >
      <div>
        <p>{image.error}</p>
        <button
          type="button"
          onClick={() => setRetry((value) => value + 1)}
          className="mt-2 font-semibold underline"
        >
          Thử tải lại
        </button>
      </div>
    </div>
  );
}
