import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "./UI";
import {
  HANDOVER_POLICY,
  validateHandoverTimes,
} from "../services/rentalPolicy";

const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const totalMinutes = index * 30;
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return {
    value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    label: `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`,
  };
});

function formatDisplayDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function formatDisplayTime(value) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function DateTimeField({ label, value, onClick, isOpen, type }) {
  const text = type === "date" ? formatDisplayDate(value) : formatDisplayTime(value);
  const Icon = type === "date" ? CalendarDays : Clock3;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={`${label}: ${text}`}
      className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[2px] text-left text-xs font-bold leading-[18px] outline-none transition focus-visible:ring-2 focus-visible:ring-pace-blue/40 ${isOpen ? "text-pace-blue" : "text-pace-ink hover:text-pace-blue"}`}
    >
      {/* whitespace-nowrap, no truncate: the whole date / time is always visible */}
      <span className="whitespace-nowrap">{text}</span>
      <Icon size={14} className="shrink-0" aria-hidden="true" />
    </button>
  );
}

function DateTimePickerModal({
  month,
  selectedDate,
  onMonthChange,
  onSelectDate,
  onApply,
}) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const startGrid = new Date(monthStart);
  startGrid.setDate(startGrid.getDate() - startGrid.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const value = new Date(startGrid);
    value.setDate(startGrid.getDate() + index);
    return value;
  });

  return (
    <div className="absolute left-1/2 top-[calc(100%+10px)] z-30 w-[360px] -translate-x-1/2 rounded-[3px] border-[0.8px] border-pace-line bg-white p-3 shadow-[0_14px_30px_rgba(15,23,42,0.14)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4b5563]">
          Chọn ngày
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMonthChange(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-[#dfe3ea] text-lg text-[#111827]"
            aria-label="Tháng trước"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(1)}
            className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-[#dfe3ea] text-lg text-[#111827]"
            aria-label="Tháng sau"
          >
            →
          </button>
        </div>
      </div>
      <div className="mb-3 text-[18px] font-extrabold uppercase leading-[26px] tracking-[-0.55px] text-[#111827]">
        {`THÁNG ${month.getMonth() + 1}, ${month.getFullYear()}`}
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b7280]">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[13px] font-medium text-[#111827]">
        {days.map((cell) => {
          const key = formatLocalDateKey(cell);
          const isSelected = selectedDate && key === selectedDate;
          const isCurrentMonth = cell.getMonth() === month.getMonth();
          return (
            <button
              type="button"
              key={key}
              onClick={() => onSelectDate(key)}
              className={`flex h-8 w-8 items-center justify-center rounded-[4px] ${isSelected ? "bg-pace-blue text-white" : isCurrentMonth ? "hover:bg-[#f3f4f6]" : "text-[#cbd5e1]"}`}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onApply}
        className="mt-3 w-full rounded-[2px] bg-pace-blue px-4 py-3 text-xs font-bold uppercase tracking-[0.22px] text-white transition hover:brightness-110"
      >
        Xác nhận
      </button>
    </div>
  );
}

function TimePickerModal({ selectedTime, onSelectTime, onApply }) {
  // every 30 minutes from the first to the last supported handover time (06:00 to 22:00)
  const toMinutes = (value) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  const timeSlots = [];
  for (
    let t = toMinutes(HANDOVER_POLICY.supportedFrom);
    t <= toMinutes(HANDOVER_POLICY.supportedUntil);
    t += 30
  ) {
    timeSlots.push(
      `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
    );
  }

  return (
    <div className="absolute left-1/2 top-[calc(100%+10px)] z-30 w-[320px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-[3px] border-[0.8px] border-pace-line bg-white p-3 shadow-[0_14px_30px_rgba(15,23,42,0.14)]">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#4b5563]">
        Chọn giờ
      </div>
      <div className="grid max-h-[232px] grid-cols-4 gap-2 overflow-y-auto pr-1">
        {timeSlots.map((slot) => {
          const isSelected = selectedTime === slot;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onSelectTime(slot)}
              className={`rounded-[4px] border px-2 py-2 text-[12px] font-medium ${isSelected ? "border-pace-blue bg-pace-blue text-white" : "border-[#dfe3ea] bg-[#f8fafc] text-[#111827] hover:bg-[#eef2f7]"}`}
            >
              {slot}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onApply}
        className="mt-3 w-full rounded-[2px] bg-pace-blue px-4 py-3 text-xs font-bold uppercase tracking-[0.22px] text-white transition hover:brightness-110"
      >
        Xác nhận
      </button>
    </div>
  );
}

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isoDate = (offset = 0) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return formatLocalDate(date);
};
const locations = [
  "Hà Nội",
  "Hà Đông, Hà Nội",
  "Cầu Giấy, Hà Nội",
  "Mỹ Đình, Hà Nội",
  "Hòa Lạc, Hà Nội",
  "Tây Hồ, Hà Nội",
  "Long Biên, Hà Nội",
  "Hai Bà Trưng, Hà Nội",
  "Thanh Xuân, Hà Nội",
  "Gia Lâm, Hà Nội",
  "Hoàn Kiếm, Hà Nội",
  "Nội Bài, Hà Nội",
];
export default function SearchBar({ compact = false }) {
  const nav = useNavigate(),
    toast = useToast(),
    [params, setParams] = useSearchParams();
  const valuesFromParams = () => ({
    location: params.get("location") || "Hà Nội",
    destination: params.get("destination") || "",
    startDate: params.get("startDate") || isoDate(1),
    startTime: params.get("startTime") || "08:00",
    endDate: params.get("endDate") || isoDate(3),
    endTime: params.get("endTime") || "20:00",
    driverOption: params.get("driverOption") || "all",
  });
  const [form, setForm] = useState(valuesFromParams);
  const [picker, setPicker] = useState(null);
  const [pickerMonth, setPickerMonth] = useState(() => new Date(`${isoDate(1)}T12:00:00`));
  const relevantParams = useMemo(
    () =>
      [
        "location",
        "destination",
        "startDate",
        "startTime",
        "endDate",
        "endTime",
        "driverOption",
      ]
        .map((key) => params.get(key) || "")
        .join("|"),
    [params],
  );
  useEffect(() => {
    if (!compact) return;
    const next = new URLSearchParams(params);
    let changed = false;
    for (const [key, value] of Object.entries(form)) {
      if (!next.get(key)) {
        next.set(key, value);
        changed = true;
      }
    }
    if (changed) setParams(next, { replace: true });
  }, [compact, setParams]);
  useEffect(() => {
    setForm(valuesFromParams());
    // Unrelated filter parameters do not change this signature, so they cannot
    // overwrite dates a user is currently editing. Back/forward navigation can.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantParams]);
  function submit(e) {
    e.preventDefault();
    const start = new Date(`${form.startDate}T${form.startTime}:00`),
      end = new Date(`${form.endDate}T${form.endTime}:00`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      toast.error("Vui lòng chọn đủ ngày và giờ nhận, trả xe");
      return;
    }
    if (end <= start) {
      toast.error("Thời gian trả xe phải sau thời gian nhận xe");
      return;
    }
    const handoverError = validateHandoverTimes(form.startTime, form.endTime);
    if (handoverError) {
      toast.error(handoverError);
      return;
    }
    const next = compact ? new URLSearchParams(params) : new URLSearchParams();
    Object.entries(form).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    next.delete("page");
    nav(`/cars?${next}`);
  }
  const box =
    "flex min-w-0 flex-col gap-1.5 rounded-lg border-[0.8px] border-pace-line px-3.5 py-1 transition focus-within:border-pace-blue";
  const cap = "text-[9px] font-bold uppercase leading-[13.5px] text-[#6b6e75]";
  const val =
    "h-[18px] min-w-0 w-full bg-transparent p-0 text-xs font-bold leading-[18px] text-pace-ink outline-none placeholder:text-pace-ink";

  const openPicker = (field) => {
    const baseValue = form[field] || isoDate(1);
    setPicker(field);
    setPickerMonth(new Date(`${baseValue}T12:00:00`));
  };

  const closePicker = () => {
    setPicker(null);
  };

  const pickerProps = (field) => ({
    month: pickerMonth,
    selectedDate: form[field],
    onMonthChange: (delta) =>
      setPickerMonth(
        (current) =>
          new Date(current.getFullYear(), current.getMonth() + delta, 1),
      ),
    onApply: closePicker,
  });
  const timeProps = (field) => ({
    selectedTime: form[field],
    onSelectTime: (value) => {
      setForm((current) => ({ ...current, [field]: value }));
      closePicker();
    },
    onApply: closePicker,
  });

  return (
    <form
      onSubmit={submit}
      className={`flex w-full flex-col rounded-[3px] bg-white px-4 py-3.5 font-ui ${compact ? "drop-shadow-[0_14px_17px_rgba(0,0,0,0.14)]" : "drop-shadow-[0_16px_19px_rgba(8,14,73,0.28)]"}`}
    >
      <div
        className="flex h-[29px] gap-1.5"
        role="group"
        aria-label="Hình thức thuê xe"
      >
        {[
          ["all", "Tất cả"],
          ["self", "Tự lái"],
          ["driver", "Có tài xế"],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            onClick={() => setForm({ ...form, driverOption: value })}
            aria-pressed={form.driverOption === value}
            className={`rounded-[2px] px-3 py-[7px] text-[10px] font-bold uppercase leading-[15px] transition ${form.driverOption === value ? "bg-pace-dark text-white" : "text-pace-muted hover:bg-pace-tab"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid min-w-0 gap-[10px] pt-[10px] sm:grid-cols-2">
        <label className={box}>
          <span className={cap}>Khu vực nhận xe</span>
          <select
            className={val}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          >
            {!locations.includes(form.location) && (
              <option value={form.location}>{form.location}</option>
            )}
            {locations.map((location) => (
              <option key={location}>{location}</option>
            ))}
          </select>
          <span className="text-[9px] leading-[13.5px] text-pace-hint">
            Điểm hẹn cụ thể hiển thị trong trang xe
          </span>
        </label>
        <label className={box}>
          <span className={cap}>Điểm đến dự kiến</span>
          <input
            className={val}
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
            placeholder="Ví dụ: Hải Phòng"
          />
        </label>
        <div className={`${box} relative`} role="group" aria-label="Nhận xe">
          <span className={cap}>Nhận xe</span>
          <div className="flex min-w-0 items-center gap-6">
            <DateTimeField
              label="Ngày nhận xe"
              type="date"
              value={form.startDate}
              isOpen={picker === "startDate"}
              onClick={() => openPicker("startDate")}
            />
            <DateTimeField
              label="Giờ nhận xe"
              type="time"
              value={form.startTime}
              isOpen={picker === "startTime"}
              onClick={() => openPicker("startTime")}
            />
          </div>
          {picker === "startDate" && (
            <DateTimePickerModal
              {...pickerProps("startDate")}
              onSelectDate={(value) =>
                setForm((current) => {
                  const next = { ...current, startDate: value };
                  if (next.endDate < value) next.endDate = value;
                  return next;
                })
              }
            />
          )}
          {picker === "startTime" && <TimePickerModal {...timeProps("startTime")} />}
        </div>
        <div className={`${box} relative`} role="group" aria-label="Trả xe">
          <span className={cap}>Trả xe</span>
          <div className="flex min-w-0 items-center gap-6">
            <DateTimeField
              label="Ngày trả xe"
              type="date"
              value={form.endDate}
              isOpen={picker === "endDate"}
              onClick={() => openPicker("endDate")}
            />
            <DateTimeField
              label="Giờ trả xe"
              type="time"
              value={form.endTime}
              isOpen={picker === "endTime"}
              onClick={() => openPicker("endTime")}
            />
          </div>
          {picker === "endDate" && (
            <DateTimePickerModal
              {...pickerProps("endDate")}
              onSelectDate={(value) =>
                setForm((current) => ({ ...current, endDate: value }))
              }
            />
          )}
          {picker === "endTime" && <TimePickerModal {...timeProps("endTime")} />}
        </div>
        <button
          type="submit"
          className="flex h-10 min-h-[40px] items-center justify-center gap-2 rounded-[2px] border-[0.8px] border-transparent bg-pace-blue px-[18px] text-xs font-bold uppercase leading-[16.5px] tracking-[0.22px] text-white transition hover:border-pace-blue hover:bg-pace-tab hover:text-pace-blue sm:col-span-2"
        >
          <Search size={17} aria-hidden="true" />
          Tìm xe
        </button>
      </div>
      <p className="pt-[11px] text-[10px] leading-[15px] text-pace-hint">
        Bàn giao hỗ trợ {HANDOVER_POLICY.supportedFrom}–
        {HANDOVER_POLICY.supportedUntil}. Khung giờ tiêu chuẩn{" "}
        {HANDOVER_POLICY.standardFrom}–{HANDOVER_POLICY.standardUntil}; ngoài
        khung giờ này có phụ phí và được hiển thị trước khi đặt.
      </p>
    </form>
  );
}
