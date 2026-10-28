const BASE = "/api";

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
  let r;
  try {
    const token = localStorage.getItem("pacecar-token");
    const isForm = options.body instanceof FormData;
    r = await fetch(BASE + path, {
      ...options,
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
