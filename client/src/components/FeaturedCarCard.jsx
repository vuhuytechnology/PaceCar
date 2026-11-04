import { Heart } from "lucide-react";
import { Link } from "react-router-dom";
import { money } from "../services/api";

// Car card from the Figma Home page ("Xe nổi bật", node 2:2019).
export default function FeaturedCarCard({
  car,
  onFavorite,
  to,
  days,
  total,
  badges = [],
}) {
  const trustScore = car.owner?.trustScore ?? car.trustScore;
  const hasTrust =
    trustScore !== null &&
    trustScore !== undefined &&
    trustScore !== "" &&
    Number.isFinite(Number(trustScore));
  return (
    <article className="flex min-w-0 flex-col gap-3 overflow-clip rounded-[3px] border-[0.8px] border-[#d3d4d7] bg-white shadow-[2px_2px_8px_rgba(128,128,128,0.25)]">
      <div className="relative h-[220px] overflow-hidden bg-[#e9eef6]">
        <img
          src={
            car.photos?.[0] ||
            car.imageUrl ||
            "https://placehold.co/800x500?text=PaceCar"
          }
          alt={car.name ? `Xe ${car.name}` : "Xe cho thuê trên PaceCar"}
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = "/images/home-hero.jpg";
          }}
          className="h-full w-full object-cover"
        />
        {(car.verified || car.demoOnly || badges.length > 0) && (
          <div className="absolute bottom-[9px] left-2.5 flex gap-1.5">
            {car.demoOnly && (
              <span className="rounded-[2px] bg-amber-500 px-2 py-[5px] text-[9px] font-extrabold uppercase leading-[13.5px] text-white">
                Demo · chỉ trưng bày
              </span>
            )}
            {car.verified && (
              <span className="rounded-[2px] bg-[#0aa36e] px-2 py-[5px] text-[9px] font-extrabold uppercase leading-[13.5px] text-white">
                Đã xác thực
              </span>
            )}
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded-[2px] bg-white px-2 py-[5px] text-[9px] font-extrabold uppercase leading-[13.5px] text-pace-ink"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
        {onFavorite && (
          <button
            type="button"
            onClick={onFavorite}
            aria-pressed={Boolean(car.favorite)}
            aria-label={
              car.favorite
                ? `Bỏ ${car.name || "xe"} khỏi yêu thích`
                : `Lưu ${car.name || "xe"} vào yêu thích`
            }
            className="absolute right-[8px] top-[9px] grid size-[34px] place-items-center rounded-[2px] bg-white text-pace-ink transition hover:bg-pace-tab"
          >
            <Heart
              size={18}
              className={car.favorite ? "fill-red-500 text-red-500" : ""}
            />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-col gap-4">
          <div className="flex h-[30px] items-center justify-between gap-3">
            <h3 className="truncate font-display text-xl font-bold uppercase leading-[30px] text-pace-ink">
              {car.name}
            </h3>
            {car.reviewCount > 0 ? (
              <p className="shrink-0 text-xs leading-[16.5px] text-[#f0aa00]">
                ★ {car.rating}
              </p>
            ) : (
              <p className="shrink-0 text-xs leading-[16.5px] text-pace-muted">
                Chưa có đánh giá
              </p>
            )}
          </div>
          <p className="text-xs leading-[16.5px] text-pace-muted">
            {car.location} · {car.transmission}
          </p>
          <p
            className={`text-xs font-bold leading-[15px] ${hasTrust ? "text-[#0aa36e]" : "text-pace-muted"}`}
          >
            {hasTrust ? `✓ Trust ${Number(trustScore)}` : "Trust —"}
          </p>
          <div className="flex items-end justify-between">
            <p>
              <span className="font-display text-2xl font-bold leading-[33px] text-pace-blue">
                {money(car.pricePerDay)}
              </span>
              <span className="text-xs leading-[13.5px] text-pace-muted">
                /ngày
              </span>
            </p>
            <div className="text-right text-xs leading-[13.5px] text-pace-muted">
              {days ? (
                <>
                  <p>Tiền thuê tạm tính · {days} ngày</p>
                  {total != null && (
                    <p className="font-bold text-pace-ink">{money(total)}</p>
                  )}
                  <p className="ml-auto max-w-28 text-[10px] leading-4 text-pace-hint">
                    Chưa gồm bảo hiểm và phí dịch vụ
                  </p>
                </>
              ) : (
                <p>{car.seats} chỗ</p>
              )}
            </div>
          </div>
        </div>
        <Link
          to={to || `/cars/${car.id}`}
          className="flex h-10 min-h-[40px] w-full items-center justify-center rounded-[2px] border-[0.8px] border-transparent bg-pace-dark px-[18px] text-[11px] font-bold uppercase leading-[16.5px] tracking-[0.22px] text-white transition hover:bg-pace-blue"
        >
          Xem xe &amp; báo giá
        </Link>
      </div>
    </article>
  );
}
