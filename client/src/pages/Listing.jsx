import React, { useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Car,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  FileCheck2,
  FileText,
  ImagePlus,
  Pause,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { api, apiBlob, money, upload } from "../services/api";
import {
  Button,
  DashboardShell,
  EmptyState,
  ErrorState,
  Modal,
  PageHead,
  PageLoading,
  useToast,
} from "../components/UI";

const initial = {
  name: "",
  brand: "",
  model: "",
  year: new Date().getFullYear(),
  licensePlate: "",
  color: "",
  location: "Hà Nội",
  description: "",
  seats: 5,
  transmission: "Tự động",
  fuel: "Xăng",
  type: "Sedan",
  selfDriveAvailable: true,
  withDriverAvailable: false,
  pricePerDay: 700000,
  deposit: 5000000,
  minRentalDays: 1,
  maxRentalDays: 30,
  photos: [],
  documents: [],
  amenities: [],
  rules: {
    mileageLimit: 300,
    lateFeePerHour: 120000,
    noSmoking: true,
    petsAllowed: false,
  },
  deliveryOptions: {
    ownerDelivery: true,
    pickupAtCar: true,
    deliveryFee: 150000,
  },
};
const steps = [
  "Nhận diện xe",
  "Thông số",
  "Giá & quy định",
  "Ảnh & giấy tờ",
  "Xem lại",
];
const amenities = [
  "Camera hành trình",
  "Bluetooth",
  "GPS",
  "Ghế trẻ em",
  "Cảm biến lùi",
  "ETC",
  "Sạc điện thoại",
  "Camera 360",
];
export function ListingStatus({ status }) {
  const colors = {
    Draft: "bg-slate-100 text-slate-700",
    "Pending Review": "bg-amber-50 text-amber-700",
    Published: "bg-emerald-50 text-emerald-700",
    Rejected: "bg-red-50 text-red-700",
    Paused: "bg-blue-50 text-blue-700",
  };
  const labels = {
    Draft: "Bản nháp",
    "Pending Review": "Chờ duyệt",
    Published: "Đang công khai",
    Rejected: "Bị từ chối",
    Paused: "Đã tạm dừng",
  };
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${colors[status] || colors.Draft}`}
    >
      {labels[status] || status}
    </span>
  );
}
function Field({ label, required, children, hint }) {
  const generatedId = useId();
  const controlId = children?.props?.id || `listing-${generatedId}`;
  const hintId = `${controlId}-hint`;
  const control = React.isValidElement(children)
    ? React.cloneElement(children, {
        id: controlId,
        "aria-required": required || undefined,
        "aria-describedby": hint
          ? [children.props["aria-describedby"], hintId]
              .filter(Boolean)
              .join(" ")
          : children.props["aria-describedby"],
      })
    : children;
  return (
    <div>
      <label className="label" htmlFor={controlId}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-slate-400">
          {hint}
        </p>
      )}
    </div>
  );
}

function validateListingStep(form, step) {
  if (step === 0) {
    const errors = [];
    for (const [key, label] of [
      ["name", "Tên hiển thị"],
      ["brand", "Hãng xe"],
      ["model", "Dòng xe"],
      ["licensePlate", "Biển số"],
      ["location", "điểm bàn giao mặc định"],
    ])
      if (!String(form[key] || "").trim())
        errors.push(`Vui lòng nhập ${label}`);
    if (
      !Number.isInteger(Number(form.year)) ||
      Number(form.year) < 1990 ||
      Number(form.year) > new Date().getFullYear() + 1
    )
      errors.push("Năm sản xuất không hợp lệ");
    if (String(form.description || "").trim().length < 20)
      errors.push("Mô tả xe cần ít nhất 20 ký tự");
    return errors;
  }
  if (step === 1 && !form.selfDriveAvailable && !form.withDriverAvailable)
    return ["Chọn ít nhất một hình thức cho thuê"];
  if (step === 2) {
    const errors = [];
    if (!Number.isFinite(Number(form.pricePerDay)) || form.pricePerDay < 100000)
      errors.push("Giá thuê tối thiểu là 100.000đ/ngày");
    if (!Number.isFinite(Number(form.deposit)) || form.deposit < 0)
      errors.push("Tiền cọc không hợp lệ");
    if (
      !Number.isInteger(Number(form.minRentalDays)) ||
      !Number.isInteger(Number(form.maxRentalDays)) ||
      Number(form.minRentalDays) < 1 ||
      Number(form.maxRentalDays) < Number(form.minRentalDays)
    )
      errors.push("Khoảng ngày thuê không hợp lệ");
    if (
      form.deliveryOptions.ownerDelivery &&
      (!Number.isFinite(Number(form.deliveryOptions.deliveryFee)) ||
        Number(form.deliveryOptions.deliveryFee) < 0)
    )
      errors.push("Phí giao xe không hợp lệ");
    return errors;
  }
  if (step === 3) {
    const errors = [];
    if (form.photos.length < 3) errors.push("Cần tải lên ít nhất 3 ảnh xe");
    if (form.photos.length > 10) errors.push("Chỉ được tải lên tối đa 10 ảnh");
    if (!form.documents.some((document) => document.type === "registration"))
      errors.push("Cần tải lên đăng ký xe");
    if (!form.documents.some((document) => document.type === "insurance"))
      errors.push("Cần tải lên bảo hiểm xe");
    return errors;
  }
  return [];
}

export function CarListingWizard() {
  const { id } = useParams(),
    nav = useNavigate(),
    toast = useToast(),
    { user } = useAuth();
  const [form, setForm] = useState(() => {
      try {
        return {
          ...initial,
          ...JSON.parse(localStorage.getItem("pacecar-listing-draft") || "{}"),
        };
      } catch {
        return initial;
      }
    }),
    [step, setStep] = useState(0),
    [loading, setLoading] = useState(!!id),
    [saving, setSaving] = useState(false),
    [uploading, setUploading] = useState(false),
    [errors, setErrors] = useState([]);
  useEffect(() => {
    if (id)
      api(`/cars/${id}`)
        .then((car) => {
          setForm({
            ...initial,
            ...car,
            rules: { ...initial.rules, ...car.rules },
            deliveryOptions: {
              ...initial.deliveryOptions,
              ...car.deliveryOptions,
            },
          });
          setLoading(false);
        })
        .catch((e) => {
          toast.error(e.message);
          nav("/owner/cars");
        });
  }, [id]);
  useEffect(() => {
    if (!id && form.listingStatus !== "Pending Review")
      localStorage.setItem("pacecar-listing-draft", JSON.stringify(form));
  }, [form, id]);
  const locked = form.listingStatus === "Pending Review";
  function goToStep(target) {
    for (let current = 0; current < target; current += 1) {
      const validationErrors = validateListingStep(form, current);
      if (validationErrors.length) {
        setStep(current);
        setErrors(validationErrors);
        return;
      }
    }
    setErrors([]);
    setStep(target);
  }
  const complete = useMemo(() => {
    const firstIncompleteStep = steps.findIndex(
      (_, index) => validateListingStep(form, index).length,
    );
    return Math.round(
      ((firstIncompleteStep < 0 ? steps.length : firstIncompleteStep) /
        steps.length) *
        100,
    );
  }, [form]);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  async function saveDraft(silent = false) {
    setSaving(true);
    setErrors([]);
    try {
      const payload = { ...form, submitForReview: false };
      const car = id
        ? await api(`/cars/${id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await api("/cars", { method: "POST", body: JSON.stringify(payload) });
      setForm(car);
      localStorage.removeItem("pacecar-listing-draft");
      if (!silent) toast.success("Đã lưu bản nháp");
      if (!id) nav(`/owner/cars/${car.id}/edit`, { replace: true });
      return car;
    } catch (e) {
      setErrors(e.details?.length ? e.details : [e.message]);
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function submit() {
    setSaving(true);
    setErrors([]);
    try {
      let car = id
        ? await api(`/cars/${id}`, {
            method: "PUT",
            body: JSON.stringify(form),
          })
        : await api("/cars", {
            method: "POST",
            body: JSON.stringify({ ...form, submitForReview: false }),
          });
      car = await api(`/cars/${car.id}/listing-status`, {
        method: "PUT",
        body: JSON.stringify({ status: "Pending Review" }),
      });
      localStorage.removeItem("pacecar-listing-draft");
      toast.success("Đã gửi tin cho PaceCar duyệt");
      nav("/owner/cars");
    } catch (e) {
      setErrors(e.details?.length ? e.details : [e.message]);
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function addPhotos(files) {
    if (!files.length) return;
    setUploading(true);
    try {
      const result = await upload("/uploads/cars", files);
      set(
        "photos",
        [...form.photos, ...result.files.map((f) => f.url)].slice(0, 10),
      );
      toast.success("Đã tải ảnh lên");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }
  async function addDocument(type, files) {
    if (!files.length) return;
    setUploading(true);
    try {
      const result = await upload("/uploads/documents", files);
      const file = result.files[0];
      set("documents", [
        ...form.documents.filter((d) => d.type !== type),
        { type, assetId: file.id, name: file.name, url: file.url },
      ]);
      toast.success("Đã tải giấy tờ an toàn");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }
  if (loading) return <PageLoading />;
  if (user.role !== "owner")
    return (
      <DashboardShell role={user.role}>
        <EmptyState
          title="Chỉ dành cho chủ xe"
          desc="Đăng nhập bằng tài khoản chủ xe để đăng tin."
        />
      </DashboardShell>
    );
  return (
    <DashboardShell role="owner">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/owner/cars"
          className="flex items-center gap-2 text-sm font-bold text-slate-500"
        >
          <ArrowLeft size={17} /> Xe của tôi
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            Hoàn thiện <b>{complete}%</b>
          </span>
          {form.listingStatus && <ListingStatus status={form.listingStatus} />}
        </div>
      </div>
      <PageHead
        eyebrow="Owner Listing Studio"
        title={id ? "Chỉnh sửa tin đăng" : "Đăng xe cho thuê"}
        desc="Thông tin đầy đủ giúp xe được duyệt nhanh và tạo niềm tin với người thuê."
      />
      {locked && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Clock3 className="mr-2 inline" />
          Tin đang được PaceCar kiểm duyệt. Bạn có thể xem nhưng chưa thể chỉnh
          sửa.
        </div>
      )}
      <div className="mb-8 flex overflow-x-auto pb-2">
        {steps.map((name, i) => (
          <button
            disabled={locked}
            onClick={() => goToStep(i)}
            className="flex min-w-[150px] items-center"
            key={name}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${step >= i ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"}`}
            >
              {step > i ? <Check size={16} /> : i + 1}
            </span>
            <span
              className={`ml-2 text-left text-xs font-bold ${step >= i ? "text-brand-700" : "text-slate-400"}`}
            >
              {name}
            </span>
            {i < steps.length - 1 && (
              <span className="mx-3 h-px flex-1 bg-slate-200" />
            )}
          </button>
        ))}
      </div>
      <fieldset
        disabled={locked || saving || uploading}
        className="card p-6 sm:p-8"
      >
        {step === 0 && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <h2 className="text-xl font-bold">Thông tin nhận diện</h2>
              <p className="mt-1 text-sm text-slate-500">
                Dữ liệu phải trùng khớp với đăng ký xe.
              </p>
            </div>
            <Field label="Tên hiển thị" required>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Toyota Vios 2023"
              />
            </Field>
            <Field
              label="Biển số"
              required
              hint="Biển số được che một phần trên trang công khai"
            >
              <input
                className="input uppercase"
                value={form.licensePlate}
                onChange={(e) =>
                  set("licensePlate", e.target.value.toUpperCase())
                }
                placeholder="30A-123.45"
              />
            </Field>
            <Field label="Hãng xe" required>
              <input
                className="input"
                value={form.brand}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="Toyota"
              />
            </Field>
            <Field label="Dòng xe" required>
              <input
                className="input"
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
                placeholder="Vios"
              />
            </Field>
            <Field label="Năm sản xuất" required>
              <input
                type="number"
                min="1990"
                max={new Date().getFullYear() + 1}
                className="input"
                value={form.year}
                onChange={(e) => set("year", +e.target.value)}
              />
            </Field>
            <Field label="Màu xe">
              <input
                className="input"
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                placeholder="Trắng ngọc trai"
              />
            </Field>
            <Field
              label="Điểm bàn giao mặc định"
              hint="Nhập địa chỉ hoặc mốc dễ tìm, ví dụ: Bến xe Yên Nghĩa, Hà Đông, Hà Nội."
              required
            >
              <input
                className="input"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Địa chỉ hoặc mốc bàn giao cụ thể"
              />
            </Field>
            <Field label="Mô tả xe" required>
              <textarea
                className="input"
                rows="4"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Tình trạng xe, lịch bảo dưỡng và điểm nổi bật..."
              />
            </Field>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <h2 className="text-xl font-bold">Thông số và tiện nghi</h2>
            </div>
            <Field label="Loại xe">
              <select
                className="input"
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
              >
                <option>Sedan</option>
                <option>SUV</option>
                <option>MPV</option>
                <option>Hatchback</option>
                <option>Pickup</option>
                <option>Van</option>
              </select>
            </Field>
            <Field label="Số chỗ">
              <select
                className="input"
                value={form.seats}
                onChange={(e) => set("seats", +e.target.value)}
              >
                {[4, 5, 7, 8, 16].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Hộp số">
              <select
                className="input"
                value={form.transmission}
                onChange={(e) => set("transmission", e.target.value)}
              >
                <option>Tự động</option>
                <option>Số sàn</option>
              </select>
            </Field>
            <Field label="Nhiên liệu">
              <select
                className="input"
                value={form.fuel}
                onChange={(e) => set("fuel", e.target.value)}
              >
                <option>Xăng</option>
                <option>Dầu</option>
                <option>Điện</option>
                <option>Hybrid</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <label className="label">Hình thức cho thuê</label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="rounded-xl border p-4">
                  <input
                    type="checkbox"
                    checked={form.selfDriveAvailable}
                    onChange={(e) =>
                      set("selfDriveAvailable", e.target.checked)
                    }
                    className="mr-2"
                  />
                  Tự lái
                </label>
                <label className="rounded-xl border p-4">
                  <input
                    type="checkbox"
                    checked={form.withDriverAvailable}
                    onChange={(e) =>
                      set("withDriverAvailable", e.target.checked)
                    }
                    className="mr-2"
                  />
                  Có tài xế
                </label>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="label">Tiện nghi</label>
              <div className="flex flex-wrap gap-2">
                {amenities.map((item) => (
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        "amenities",
                        form.amenities.includes(item)
                          ? form.amenities.filter((x) => x !== item)
                          : [...form.amenities, item],
                      )
                    }
                    className={`rounded-full border px-4 py-2 text-sm ${form.amenities.includes(item) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200"}`}
                    key={item}
                  >
                    {form.amenities.includes(item) ? "✓ " : ""}
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <h2 className="text-xl font-bold">Giá, cọc và quy định</h2>
            </div>
            <Field label="Giá thuê mỗi ngày" required>
              <input
                type="number"
                min="100000"
                step="50000"
                className="input"
                value={form.pricePerDay}
                onChange={(e) => set("pricePerDay", +e.target.value)}
              />
            </Field>
            <Field label="Tiền cọc hoàn lại" required>
              <input
                type="number"
                min="0"
                step="500000"
                className="input"
                value={form.deposit}
                onChange={(e) => set("deposit", +e.target.value)}
              />
            </Field>
            <Field label="Số ngày thuê tối thiểu">
              <input
                type="number"
                min="1"
                className="input"
                value={form.minRentalDays}
                onChange={(e) => set("minRentalDays", +e.target.value)}
              />
            </Field>
            <Field label="Số ngày thuê tối đa">
              <input
                type="number"
                min="1"
                className="input"
                value={form.maxRentalDays}
                onChange={(e) => set("maxRentalDays", +e.target.value)}
              />
            </Field>
            <Field label="Giới hạn km/ngày">
              <input
                type="number"
                className="input"
                value={form.rules.mileageLimit}
                onChange={(e) =>
                  set("rules", { ...form.rules, mileageLimit: +e.target.value })
                }
              />
            </Field>
            <Field label="Phí trả muộn/giờ">
              <input
                type="number"
                className="input"
                value={form.rules.lateFeePerHour}
                onChange={(e) =>
                  set("rules", {
                    ...form.rules,
                    lateFeePerHour: +e.target.value,
                  })
                }
              />
            </Field>
            <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
              <label className="rounded-xl border p-4">
                <input
                  type="checkbox"
                  checked={form.rules.noSmoking}
                  onChange={(e) =>
                    set("rules", { ...form.rules, noSmoking: e.target.checked })
                  }
                  className="mr-2"
                />
                Không hút thuốc
              </label>
              <label className="rounded-xl border p-4">
                <input
                  type="checkbox"
                  checked={form.rules.petsAllowed}
                  onChange={(e) =>
                    set("rules", {
                      ...form.rules,
                      petsAllowed: e.target.checked,
                    })
                  }
                  className="mr-2"
                />
                Cho phép thú cưng
              </label>
            </div>
            <div className="md:col-span-2">
              <Field
                label="Chính sách hủy / đổi lịch"
                hint="Hiển thị cho người thuê trước khi gửi yêu cầu. Để trống nếu chưa có."
              >
                <textarea
                  className="input"
                  rows="3"
                  maxLength={500}
                  value={form.cancellationPolicy || ""}
                  onChange={(e) => set("cancellationPolicy", e.target.value)}
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field
                label="Điều kiện hoàn / khấu trừ tiền cọc"
                hint="Thời hạn, phương thức hoàn cọc và các trường hợp khấu trừ."
              >
                <textarea
                  className="input"
                  rows="3"
                  maxLength={500}
                  value={form.depositRefundTerms || ""}
                  onChange={(e) => set("depositRefundTerms", e.target.value)}
                />
              </Field>
            </div>
            <div className="md:col-span-2 rounded-2xl border p-5">
              <h3 className="font-bold">Giao nhận và đặt nhanh</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="rounded-xl bg-slate-50 p-4">
                  <input
                    type="checkbox"
                    checked={form.deliveryOptions.ownerDelivery}
                    onChange={(e) =>
                      set("deliveryOptions", {
                        ...form.deliveryOptions,
                        ownerDelivery: e.target.checked,
                      })
                    }
                    className="mr-2"
                  />
                  Có giao xe tận nơi
                </label>
                <label className="rounded-xl bg-slate-50 p-4">
                  <input
                    type="checkbox"
                    checked={form.instantBooking}
                    onChange={(e) => set("instantBooking", e.target.checked)}
                    className="mr-2"
                  />
                  Cho phép đặt xe nhanh
                </label>
                {form.deliveryOptions.ownerDelivery && (
                  <Field label="Phí giao nhận">
                    <input
                      type="number"
                      className="input"
                      value={form.deliveryOptions.deliveryFee || 0}
                      onChange={(e) =>
                        set("deliveryOptions", {
                          ...form.deliveryOptions,
                          deliveryFee: +e.target.value,
                        })
                      }
                    />
                  </Field>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Đặt nhanh chỉ tự động chấp nhận người thuê đã xác thực, Trust
                Score tốt và không trùng lịch.
              </p>
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold">Ảnh xe và giấy tờ</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ảnh xe được công khai sau duyệt. Giấy tờ nằm trong kho private,
              chỉ bạn và admin được xem.
            </p>
            <div className="mt-6">
              <label className="label">Ảnh xe (3–10 ảnh) *</label>
              <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-6 text-brand-700">
                <ImagePlus />
                <b className="mt-2">
                  {uploading ? "Đang tải lên..." : "Chọn ảnh xe"}
                </b>
                <span className="text-xs">
                  JPG, PNG, WEBP · tối đa 5 MB/ảnh
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => addPhotos([...e.target.files])}
                />
              </label>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {form.photos.map((src, i) => (
                  <div className="group relative" key={src}>
                    <img
                      src={src}
                      alt={`${form.name || "Xe"} - ảnh ${i + 1}`}
                      loading="lazy"
                      className="h-28 w-full rounded-xl object-cover"
                    />
                    {i === 0 && (
                      <span className="absolute left-2 top-2 rounded bg-brand-600 px-2 py-1 text-[10px] text-white">
                        Ảnh bìa
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "photos",
                          form.photos.filter((x) => x !== src),
                        )
                      }
                      className="absolute right-2 top-2 rounded-lg bg-white/90 p-1 text-red-600"
                      aria-label={`Xóa ảnh xe thứ ${i + 1}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                ["registration", "Đăng ký xe"],
                ["insurance", "Bảo hiểm xe"],
              ].map(([type, label]) => {
                const doc = form.documents.find((d) => d.type === type);
                return (
                  <label
                    className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center ${doc ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}
                    key={type}
                  >
                    {doc ? (
                      <FileCheck2 className="mx-auto text-emerald-600" />
                    ) : (
                      <UploadCloud className="mx-auto text-slate-400" />
                    )}
                    <b className="mt-2 block">{label} *</b>
                    <span className="text-xs text-slate-500">
                      {doc ? doc.name : "Ảnh hoặc PDF · tối đa 8 MB"}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => addDocument(type, [...e.target.files])}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {step === 4 && (
          <div>
            <h2 className="text-xl font-bold">Kiểm tra trước khi gửi</h2>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-xs font-bold uppercase text-slate-400">Xe</p>
                <h3 className="mt-2 text-xl font-bold">
                  {form.name || "Chưa có tên"}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  {form.brand} {form.model} · {form.year} · {form.seats} chỗ
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {form.location} · {form.transmission} · {form.fuel}
                </p>
              </div>
              <div className="rounded-2xl bg-brand-50 p-5">
                <p className="text-xs font-bold uppercase text-brand-500">
                  Giá thuê
                </p>
                <p className="mt-2 text-2xl font-extrabold text-brand-700">
                  {money(form.pricePerDay)}
                  <span className="text-sm">/ngày</span>
                </p>
                <p className="mt-2 text-sm">Cọc: {money(form.deposit)}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                [
                  "Thông tin cơ bản",
                  !!(
                    form.name &&
                    form.brand &&
                    form.model &&
                    form.licensePlate
                  ),
                ],
                ["Ảnh xe", form.photos.length >= 3],
                [
                  "Đăng ký xe",
                  form.documents.some((d) => d.type === "registration"),
                ],
                [
                  "Bảo hiểm xe",
                  form.documents.some((d) => d.type === "insurance"),
                ],
              ].map(([label, ok]) => (
                <div
                  className={`rounded-xl p-4 text-sm font-semibold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                  key={label}
                >
                  {ok ? "✓" : "!"} {label}
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              <ShieldCheck className="mr-2 inline" />
              Bằng cách gửi duyệt, bạn xác nhận thông tin chính xác và có quyền
              hợp pháp cho thuê phương tiện.
            </div>
          </div>
        )}
      </fieldset>
      {errors.length > 0 && (
        <div
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          <b className="flex items-center gap-2">
            <AlertCircle size={18} /> Cần bổ sung
          </b>
          <ul className="mt-2 list-disc pl-5">
            {errors.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <Button
          variant="outline"
          disabled={step === 0 || locked}
          onClick={() => setStep(step - 1)}
        >
          <ArrowLeft size={17} /> Quay lại
        </Button>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={locked || saving}
            onClick={() => saveDraft()}
          >
            <Save size={17} />
            {saving ? "Đang lưu..." : "Lưu nháp"}
          </Button>
          {step < steps.length - 1 ? (
            <Button disabled={locked} onClick={() => goToStep(step + 1)}>
              Tiếp tục <ArrowRight size={17} />
            </Button>
          ) : (
            <Button disabled={locked || saving || uploading} onClick={submit}>
              <Send size={17} />
              {saving ? "Đang gửi..." : "Gửi PaceCar duyệt"}
            </Button>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

export function OwnerCarsPage() {
  const { user } = useAuth(),
    toast = useToast();
  const [items, setItems] = useState(null),
    [filter, setFilter] = useState(""),
    [confirm, setConfirm] = useState(null),
    [error, setError] = useState("");
  const load = () => {
    setError("");
    return api(
      `/owners/${user.id}/cars${filter ? `?status=${encodeURIComponent(filter)}` : ""}`,
    )
      .then(setItems)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, [filter]);
  async function status(car, status) {
    try {
      await api(`/cars/${car.id}/listing-status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      toast.success("Đã cập nhật tin đăng");
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }
  async function remove(car) {
    try {
      await api(`/cars/${car.id}`, { method: "DELETE" });
      toast.success("Đã xóa bản nháp");
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items) return <PageLoading />;
  return (
    <DashboardShell role="owner">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHead
          eyebrow="Owner Fleet"
          title="Xe và tin đăng của tôi"
          desc="Quản lý toàn bộ vòng đời tin: nháp, kiểm duyệt, công khai và tạm dừng."
        />
        <Button as={Link} to="/owner/cars/new">
          <Plus size={18} /> Đăng xe mới
        </Button>
      </div>
      <div className="card mb-6 flex flex-wrap gap-2 p-3">
        {["", "Draft", "Pending Review", "Published", "Paused", "Rejected"].map(
          (status) => (
            <button
              type="button"
              onClick={() => setFilter(status)}
              aria-pressed={filter === status}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${filter === status ? "bg-brand-600 text-white" : "hover:bg-slate-100"}`}
              key={status}
            >
              {status || "Tất cả"}
            </button>
          ),
        )}
      </div>
      {items.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {items.map((car) => (
            <article className="card overflow-hidden" key={car.id}>
              <div className="flex gap-4 p-5">
                <img
                  src={
                    car.imageUrl ||
                    car.photos?.[0] ||
                    "https://placehold.co/240x160?text=PaceCar"
                  }
                  alt={car.name ? `Xe ${car.name}` : "Ảnh xe trong bản nháp"}
                  loading="lazy"
                  className="h-28 w-40 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">
                      {car.name || "Bản nháp chưa đặt tên"}
                    </h3>
                    <ListingStatus status={car.listingStatus} />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {car.licensePlate || "Chưa có biển số"} ·{" "}
                    {car.location || "Chưa có khu vực"}
                  </p>
                  <p className="mt-2 font-bold text-brand-600">
                    {money(car.pricePerDay)}/ngày
                  </p>
                  {car.rejectionReason && (
                    <p className="mt-2 text-xs text-red-600">
                      Lý do: {car.rejectionReason}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t bg-slate-50 p-4">
                {["Draft", "Rejected"].includes(car.listingStatus) && (
                  <Button
                    as={Link}
                    to={`/owner/cars/${car.id}/edit`}
                    variant="outline"
                  >
                    Chỉnh sửa
                  </Button>
                )}
                {car.listingStatus === "Published" && (
                  <>
                    <Button as={Link} to={`/cars/${car.id}`} variant="outline">
                      <Eye size={16} /> Xem công khai
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setConfirm({ car, action: "pause" })}
                    >
                      <Pause size={16} /> Tạm dừng
                    </Button>
                  </>
                )}
                {car.listingStatus === "Paused" && (
                  <>
                    <Button
                      as={Link}
                      to={`/owner/cars/${car.id}/edit`}
                      variant="outline"
                    >
                      Chỉnh sửa
                    </Button>
                    <Button onClick={() => status(car, "Pending Review")}>
                      <Send size={16} /> Gửi duyệt lại
                    </Button>
                  </>
                )}
                {car.listingStatus === "Draft" && (
                  <Button onClick={() => status(car, "Pending Review")}>
                    <Send size={16} /> Gửi duyệt
                  </Button>
                )}
                {["Draft", "Rejected"].includes(car.listingStatus) && (
                  <Button
                    variant="danger"
                    onClick={() => setConfirm({ car, action: "delete" })}
                    aria-label={`Xóa bản nháp ${car.name || "chưa đặt tên"}`}
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={Car}
            title="Chưa có xe trong mục này"
            desc="Tạo tin đăng đầu tiên để bắt đầu cho thuê."
          />
        </div>
      )}
      <Modal
        open={!!confirm}
        title={
          confirm?.action === "delete" ? "Xóa bản nháp?" : "Tạm dừng tin đăng?"
        }
        onClose={() => setConfirm(null)}
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Hủy
            </Button>
            <Button
              variant={confirm?.action === "delete" ? "danger" : "primary"}
              onClick={() =>
                confirm?.action === "delete"
                  ? remove(confirm.car)
                  : status(confirm.car, "Paused")
              }
            >
              Xác nhận
            </Button>
          </>
        }
      >
        {confirm?.action === "delete"
          ? "Bản nháp sẽ bị xóa khỏi hệ thống."
          : "Xe sẽ biến mất khỏi kết quả tìm kiếm nhưng dữ liệu và lịch sử vẫn được giữ."}
      </Modal>
    </DashboardShell>
  );
}

export function AdminCarApprovals() {
  const toast = useToast();
  const [items, setItems] = useState(null),
    [filter, setFilter] = useState("Pending Review"),
    [review, setReview] = useState(null),
    [error, setError] = useState(""),
    [deciding, setDeciding] = useState(false),
    [assetBusy, setAssetBusy] = useState("");
  const load = () => {
    setError("");
    return api(`/admin/car-listings?status=${encodeURIComponent(filter)}`)
      .then(setItems)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, [filter]);
  async function decide(status) {
    if (!review || deciding) return;
    setDeciding(true);
    try {
      await api(`/cars/${review.car.id}/listing-status`, {
        method: "PUT",
        body: JSON.stringify({ status, reason: review.reason }),
      });
      toast.success(
        status === "Published"
          ? "Đã duyệt và công khai xe"
          : "Đã từ chối tin đăng",
      );
      setReview(null);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeciding(false);
    }
  }
  async function accessDocument(car, document, download = false) {
    const key = `${car.id}:${document.assetId}:${download ? "download" : "view"}`;
    setAssetBusy(key);
    try {
      const blob = await apiBlob(
        document.url || `/private-assets/${document.assetId}`,
      );
      const objectUrl = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = objectUrl;
      anchor.rel = "noopener noreferrer";
      if (download)
        anchor.download =
          document.name || `pacecar-document-${document.assetId}`;
      else anchor.target = "_blank";
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setAssetBusy("");
    }
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items) return <PageLoading />;
  return (
    <DashboardShell role="admin">
      <PageHead
        eyebrow="Marketplace Moderation"
        title="Duyệt tin đăng xe"
        desc="Chỉ tin đủ thông tin, ảnh và giấy tờ hợp lệ mới được xuất hiện công khai."
      />
      <div className="card mb-6 flex gap-2 p-3">
        {["Pending Review", "Published", "Rejected"].map((x) => (
          <button
            type="button"
            onClick={() => setFilter(x)}
            aria-pressed={filter === x}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${filter === x ? "bg-brand-600 text-white" : "hover:bg-slate-100"}`}
            key={x}
          >
            {x}
          </button>
        ))}
      </div>
      {items.length ? (
        <div className="space-y-5">
          {items.map((car) => (
            <article className="card p-5" key={car.id}>
              <div className="grid gap-5 md:grid-cols-[220px_1fr_auto]">
                <img
                  src={car.photos?.[0] || car.imageUrl}
                  alt={
                    car.name
                      ? `Xe ${car.name} chờ kiểm duyệt`
                      : "Xe chờ kiểm duyệt"
                  }
                  loading="lazy"
                  className="h-36 w-full rounded-xl object-cover"
                />
                <div>
                  <div className="flex flex-wrap gap-2">
                    <h3 className="text-lg font-bold">{car.name}</h3>
                    <ListingStatus status={car.listingStatus} />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {car.licensePlate} · {car.owner?.name} · Trust{" "}
                    {car.owner?.trustScore}
                  </p>
                  <p className="mt-2 text-sm">
                    {car.brand} {car.model} · {car.year} · {car.location}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded bg-slate-100 px-2 py-1">
                      {car.photos?.length || 0} ảnh
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-1">
                      {car.documents?.length || 0} giấy tờ
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-1">
                      {money(car.pricePerDay)}/ngày
                    </span>
                  </div>
                  {car.documents?.length > 0 && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Hồ sơ riêng tư — chỉ dành cho kiểm duyệt
                      </p>
                      <div className="mt-2 space-y-2">
                        {car.documents.map((document) => {
                          const viewKey = `${car.id}:${document.assetId}:view`;
                          const downloadKey = `${car.id}:${document.assetId}:download`;
                          return (
                            <div
                              key={document.assetId || document.url}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2"
                            >
                              <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                                {document.type === "registration"
                                  ? "Đăng ký xe"
                                  : document.type === "insurance"
                                    ? "Bảo hiểm xe"
                                    : document.name || "Giấy tờ xe"}
                              </span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={!!assetBusy}
                                  onClick={() => accessDocument(car, document)}
                                  className="rounded-lg border px-2.5 py-1 text-xs font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                                >
                                  {assetBusy === viewKey ? "Đang mở..." : "Xem"}
                                </button>
                                <button
                                  type="button"
                                  disabled={!!assetBusy}
                                  onClick={() =>
                                    accessDocument(car, document, true)
                                  }
                                  className="rounded-lg border px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-white disabled:opacity-50"
                                >
                                  {assetBusy === downloadKey
                                    ? "Đang tải..."
                                    : "Tải"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {car.listingStatus === "Pending Review" && (
                  <div className="flex flex-col gap-2">
                    <Button
                      disabled={deciding}
                      onClick={() => setReview({ car, reason: "" })}
                    >
                      <CheckCircle2 size={17} /> Duyệt
                    </Button>
                    <Button
                      variant="danger"
                      disabled={deciding}
                      onClick={() =>
                        setReview({ car, reason: "", reject: true })
                      }
                    >
                      Từ chối
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={FileText}
            title="Không có tin chờ xử lý"
            desc="Hàng đợi kiểm duyệt hiện đã trống."
          />
        </div>
      )}
      <Modal
        open={!!review}
        title={review?.reject ? "Từ chối tin đăng" : "Duyệt và công khai xe"}
        onClose={() => setReview(null)}
        actions={
          <>
            <Button
              variant="outline"
              disabled={deciding}
              onClick={() => setReview(null)}
            >
              Hủy
            </Button>
            <Button
              variant={review?.reject ? "danger" : "primary"}
              disabled={deciding || (review?.reject && !review?.reason.trim())}
              onClick={() => decide(review?.reject ? "Rejected" : "Published")}
            >
              {deciding
                ? "Đang cập nhật..."
                : review?.reject
                  ? "Xác nhận từ chối"
                  : "Duyệt & công khai"}
            </Button>
          </>
        }
      >
        {review?.reject ? (
          <>
            <label className="label" htmlFor="listing-rejection-reason">
              Lý do từ chối *
            </label>
            <textarea
              id="listing-rejection-reason"
              className="input"
              rows="4"
              value={review?.reason || ""}
              disabled={deciding}
              onChange={(e) => setReview({ ...review, reason: e.target.value })}
              placeholder="Nêu rõ nội dung chủ xe cần sửa..."
            />
          </>
        ) : (
          <div className="space-y-2">
            <p>
              Xe <b>{review?.car.name}</b> sẽ xuất hiện trên marketplace ngay
              sau khi duyệt.
            </p>
            <p className="text-emerald-700">
              ✓ Ảnh xe: {review?.car.photos?.length} · Giấy tờ:{" "}
              {review?.car.documents?.length}
            </p>
          </div>
        )}
      </Modal>
    </DashboardShell>
  );
}
