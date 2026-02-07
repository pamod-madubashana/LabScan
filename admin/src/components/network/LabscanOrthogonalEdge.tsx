import { memo } from "react";
import type { EdgeProps } from "reactflow";

type OrthogonalEdgeData = {
  laneOffset?: number;
  dimmed?: boolean;
  highlighted?: boolean;
  method?: "evidence" | "heuristic" | "manual";
  markerLabel?: string;
};

function LabscanOrthogonalEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  data,
}: EdgeProps<OrthogonalEdgeData>) {
  const laneOffset = Math.max(-48, Math.min(48, data?.laneOffset ?? 0));
  const trunkX = (sourceX + targetX) / 2 + laneOffset;
  const path = `M ${sourceX} ${sourceY} L ${trunkX} ${sourceY} L ${trunkX} ${targetY} L ${targetX} ${targetY}`;

  const isHeuristic = data?.method === "heuristic";
  const dimmed = Boolean(data?.dimmed);
  const highlighted = Boolean(data?.highlighted);
  const stroke = (style?.stroke as string) ?? (isHeuristic ? "#f59e0b" : "#8fe4ee");
  const strokeWidth = Number(style?.strokeWidth ?? (highlighted ? 4.6 : 3.2));
  const strokeOpacity = Number(style?.strokeOpacity ?? (dimmed ? 0.18 : highlighted ? 0.96 : 0.88));

  const capDx = targetX > trunkX ? -5 : 5;

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: style?.filter as string | undefined }}
      />
      <circle
        cx={targetX + capDx}
        cy={targetY}
        r={highlighted ? 2.9 : 2.3}
        fill={stroke}
        fillOpacity={dimmed ? 0.25 : highlighted ? 0.95 : 0.75}
      />
      {data?.markerLabel && (
        <text
          x={sourceX + (trunkX - sourceX) * 0.35}
          y={sourceY - 5}
          fontSize={9}
          fill={dimmed ? "rgba(148,163,184,0.5)" : "rgba(226,232,240,0.85)"}
          textAnchor="middle"
        >
          {data.markerLabel}
        </text>
      )}
    </g>
  );
}

export const LabscanOrthogonalEdge = memo(LabscanOrthogonalEdgeComponent);
