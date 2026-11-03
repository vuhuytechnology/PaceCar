const BASE = "/api";

const isHeicFile = (file) =>
  /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]/i.test(file.type);

async function prepareUploads(form) {
  const entries = Array.from(form.entries());
  if (
    !entries.some(
      ([, value]) => typeof value !== "string" && isHeicFile(value),
    )
  )
    return form;

  const { heicTo } = await import("heic-to/csp");
  const prepared = new FormData();
  for (const [name, value] of entries) {
    if (typeof value === "string" || !isHeicFile(value)) {
      prepared.append(name, value);
      continue;
    }

    let converted;
    try {
      converted = await heicTo({
        blob: value,
        type: "image/jpeg",
        quality: 0.9,
      });
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : "";
      throw new Error(
        `Không thể chuyển ảnh HEIC/HEIF "${value.name}" sang JPEG${detail}`,
        { cause: error },
      );
    }
    if (!(converted instanceof Blob))
      throw new Error(`Không thể chuyển ảnh "${value.name}" sang JPEG`);

    const filename = /\.(heic|heif)$/i.test(value.name)
      ? value.name.replace(/\.(heic|heif)$/i, ".jpg")
      : `${value.name || "image"}.jpg`;
    prepared.append(
      name,
      new File([converted], filename, {
        type: "image/jpeg",
        lastModified: value.lastModified,
      }),
    );
  }
  return prepared;
}

function redirectToLogin() {
  localStorage.removeItem("pacecar-user");
  localStorage.removeItem("pacecar-token");
  if (location.pathname === "/login") return;
  const next = `${location.pathname}${location.search}${location.hash}`;
  location.assign(`/login?next=${encodeURIComponent(next)}`);
}

async function responseError(response) {
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) redirectToLogin();
  const error = new Error(payload.message || `API lỗi ${response.status}`);
  error.status = response.status;
  error.details = payload.errors || payload.fields || [];
  error.code = payload.code;
  error.email = payload.email;
  return error;
}

export async function api(path, options = {}) {
  const body =
    options.body instanceof FormData
      ? await prepareUploads(options.body)
      : options.body;
  let r;
  try {
    const token = localStorage.getItem("pacecar-token");
    const isForm = body instanceof FormData;
    r = await fetch(BASE + path, {
      ...options,
      body,
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Dịch vụ đang tạm gián đoạn. Vui lòng thử lại sau ít phút.",
    );
  }
  if (!r.ok) {
    if (r.status === 401 && path.startsWith("/auth/login")) {
      const payload = await r.json().catch(() => ({}));
      const error = new Error(payload.message || "Đăng nhập không thành công");
      error.status = r.status;
      throw error;
    }
    throw await responseError(r);
  }
  return r.status === 204 ? null : r.json();
}

export async function apiBlob(path) {
  let response;
  try {
    const token = localStorage.getItem("pacecar-token");
    const requestPath = path.startsWith("/api/") ? path.slice(4) : path;
    response = await fetch(BASE + requestPath, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new Error("Không kết nối được backend để tải tệp.");
  }
  if (!response.ok) throw await responseError(response);
  return response.blob();
}
export async function upload(path, files) {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return api(path, { method: "POST", body: form });
}
export const money = (n) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n || 0);
export const date = (v) =>
  v ? new Intl.DateTimeFormat("vi-VN").format(new Date(v)) : "";
export const dateTime = (v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v || "")
    ? date(v)
    : v
      ? new Intl.DateTimeFormat("vi-VN", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(v))
      : "";
