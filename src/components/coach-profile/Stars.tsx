import { IconStar } from "@/components/icons";

/**
 * Five stars filled to `rating`, to the nearest half, so a 4.5 average shows four and a half
 * stars rather than rounding up to five. Screen readers get the number instead.
 */
export default function Stars({ rating, size = "h-4 w-4", label }: { rating: number; size?: string; label: string }) {
  const halves = Math.round(rating * 2) / 2;
  return (
    <>
      <span className="flex text-gold" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => {
          const fill = Math.min(1, Math.max(0, halves - i));
          return (
            <span key={i} className={`relative ${size}`}>
              <IconStar className={`absolute inset-0 ${size} opacity-25`} />
              {fill > 0 && (
                <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                  <IconStar className={size} />
                </span>
              )}
            </span>
          );
        })}
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}
