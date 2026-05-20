import { signalClass } from "../lib/helpers";
import { pitchName } from "../lib/format";

type Props = {
  px: number | null | undefined;
  pz: number | null | undefined;
  pitchType: string | null | undefined;
  releaseSpeed: number | null | undefined;
  pitchNumber: number;
  status: string;
};

const ZONE_LEFT = -0.83;
const ZONE_RIGHT = 0.83;
const ZONE_BOT = 1.5;
const ZONE_TOP = 3.5;
const PAD = 0.6;

function toSvgX(px: number): number {
  const totalWidth = ZONE_RIGHT - ZONE_LEFT + PAD * 2;
  return ((px - ZONE_LEFT + PAD) / totalWidth) * 200;
}

function toSvgY(pz: number): number {
  const totalHeight = ZONE_TOP - ZONE_BOT + PAD * 2;
  return ((ZONE_TOP + PAD - pz) / totalHeight) * 240;
}

export function StrikeZone({ px, pz, pitchType, releaseSpeed, pitchNumber, status }: Props) {
  const zoneX1 = toSvgX(ZONE_LEFT);
  const zoneX2 = toSvgX(ZONE_RIGHT);
  const zoneY1 = toSvgY(ZONE_TOP);
  const zoneY2 = toSvgY(ZONE_BOT);
  const zoneW = zoneX2 - zoneX1;
  const zoneH = zoneY2 - zoneY1;

  const hasPitch = px != null && pz != null;
  const dotX = hasPitch ? toSvgX(px!) : 100;
  const dotY = hasPitch ? toSvgY(pz!) : 200;

  const statusCls = signalClass(status);

  return (
    <div className="strike-zone">
      <svg viewBox="0 0 200 240" className="strike-zone__svg">
        <rect
          x={zoneX1} y={zoneY1}
          width={zoneW} height={zoneH}
          fill="none"
          stroke="var(--navy)"
          strokeWidth="1.5"
          opacity="0.25"
        />
        {/* Zone grid lines */}
        <line x1={zoneX1 + zoneW / 3} y1={zoneY1} x2={zoneX1 + zoneW / 3} y2={zoneY1 + zoneH} stroke="var(--navy)" strokeWidth="0.5" opacity="0.12" />
        <line x1={zoneX1 + 2 * zoneW / 3} y1={zoneY1} x2={zoneX1 + 2 * zoneW / 3} y2={zoneY1 + zoneH} stroke="var(--navy)" strokeWidth="0.5" opacity="0.12" />
        <line x1={zoneX1} y1={zoneY1 + zoneH / 3} x2={zoneX1 + zoneW} y2={zoneY1 + zoneH / 3} stroke="var(--navy)" strokeWidth="0.5" opacity="0.12" />
        <line x1={zoneX1} y1={zoneY1 + 2 * zoneH / 3} x2={zoneX1 + zoneW} y2={zoneY1 + 2 * zoneH / 3} stroke="var(--navy)" strokeWidth="0.5" opacity="0.12" />

        {hasPitch && (
          <circle
            cx={dotX}
            cy={dotY}
            r="14"
            className={`strike-zone__dot strike-zone__dot--${statusCls}`}
          />
        )}
        {hasPitch && (
          <text
            x={dotX}
            y={dotY + 4}
            textAnchor="middle"
            className="strike-zone__label"
          >
            {pitchNumber}
          </text>
        )}
        {!hasPitch && (
          <text x="100" y="125" textAnchor="middle" className="strike-zone__no-data">
            No location
          </text>
        )}
      </svg>
      <div className="strike-zone__info">
        {pitchType && <span className="strike-zone__pitch-type">{pitchName(pitchType)}</span>}
        {releaseSpeed != null && <span className="strike-zone__speed">{releaseSpeed.toFixed(1)} mph</span>}
      </div>
    </div>
  );
}
