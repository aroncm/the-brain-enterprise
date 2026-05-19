import { teamLogoUrl } from "../lib/helpers";

export function TeamLogo({ abbr, size = 32 }: { abbr: string; size?: number }) {
  const src = teamLogoUrl(abbr);
  return (
    <span className="team-logo" style={{ width: size, height: size }}>
      {src ? <img src={src} alt={abbr} width={size} height={size} /> : <span>{abbr}</span>}
    </span>
  );
}
