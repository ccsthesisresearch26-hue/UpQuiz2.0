interface LogoProps {
  height?: number;
  className?: string;
}

/**
 * UpQuiz brand logo — retro bold style with white outline + colored dots.
 * Pass `height` to scale it; aspect ratio is preserved automatically.
 */
export default function Logo({ height = 48, className = '' }: LogoProps) {
  const vw = 270;
  const vh = 88;
  const width = (height / vh) * vw;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${vw} ${vh}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="UpQuiz"
    >
      {/* ── Dark shadow layer (offset down-right) ── */}
      <text
        x="137" y="59"
        fontFamily="'Fredoka One', 'Arial Black', Impact, sans-serif"
        fontSize="55"
        fontWeight="400"
        textAnchor="middle"
        fill="#1E0A4C"
        stroke="#1E0A4C"
        strokeWidth="14"
        paintOrder="stroke"
      >
        UPQUIZ
      </text>

      {/* ── Main text: purple fill + thick white stroke ── */}
      <text
        x="134" y="56"
        fontFamily="'Fredoka One', 'Arial Black', Impact, sans-serif"
        fontSize="55"
        fontWeight="400"
        textAnchor="middle"
        fill="#6D28D9"
        stroke="white"
        strokeWidth="10"
        paintOrder="stroke"
      >
        UPQUIZ
      </text>

      {/* ── Colored dots ── */}
      <rect x="112" y="67" width="13" height="13" rx="3.5" fill="#EC4899" />
      <rect x="128" y="67" width="13" height="13" rx="3.5" fill="#14B8A6" />
      <rect x="144" y="67" width="13" height="13" rx="3.5" fill="#818CF8" />
    </svg>
  );
}
