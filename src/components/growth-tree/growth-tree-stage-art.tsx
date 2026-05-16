"use client";

import { TreeStageId } from "@/lib/growth-tree/tree-progress";

type GrowthTreeStageArtProps = {
  stageId: TreeStageId;
  label: string;
};

type LeafProps = {
  x: number;
  y: number;
  size: number;
  rotate: number;
  tone?: "light" | "mid" | "deep";
};

type CoinProps = {
  cx: number;
  cy: number;
  r: number;
};

export function GrowthTreeStageArt({ stageId, label }: GrowthTreeStageArtProps) {
  return (
    <svg className="growth-tree-stage-svg" viewBox="0 0 280 220" fill="none" aria-labelledby="growth-tree-stage-title" role="img">
      <title id="growth-tree-stage-title">{label} growth stage</title>
      <defs>
        <linearGradient id="growth-coin-top" x1="54" x2="218" y1="142" y2="191" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff29a" />
          <stop offset="0.2" stopColor="#f6b41c" />
          <stop offset="0.42" stopColor="#fff4a8" />
          <stop offset="0.64" stopColor="#f0a312" />
          <stop offset="1" stopColor="#b76b05" />
        </linearGradient>
        <linearGradient id="growth-coin-side" x1="55" x2="220" y1="164" y2="204" gradientUnits="userSpaceOnUse">
          <stop stopColor="#b96d06" />
          <stop offset="0.18" stopColor="#f0a514" />
          <stop offset="0.36" stopColor="#ffd966" />
          <stop offset="0.58" stopColor="#d98205" />
          <stop offset="0.78" stopColor="#ffc13b" />
          <stop offset="1" stopColor="#8f4d03" />
        </linearGradient>
        <radialGradient id="growth-coin-face" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(142 159) rotate(90) scale(32 74)">
          <stop stopColor="#fff2a5" />
          <stop offset="0.62" stopColor="#f6b221" />
          <stop offset="1" stopColor="#d88105" />
        </radialGradient>
        <linearGradient id="growth-trunk" x1="121" x2="153" y1="70" y2="178" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9a5b14" />
          <stop offset="0.48" stopColor="#7c430e" />
          <stop offset="1" stopColor="#4f2a0a" />
        </linearGradient>
        <linearGradient id="growth-stem" x1="128" x2="145" y1="78" y2="172" gradientUnits="userSpaceOnUse">
          <stop stopColor="#69a51e" />
          <stop offset="1" stopColor="#2f6617" />
        </linearGradient>
        <linearGradient id="growth-leaf-light" x1="88" x2="180" y1="44" y2="139" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d8ef3a" />
          <stop offset="0.45" stopColor="#97cf25" />
          <stop offset="1" stopColor="#3f8519" />
        </linearGradient>
        <linearGradient id="growth-leaf-mid" x1="80" x2="210" y1="58" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#bde237" />
          <stop offset="0.48" stopColor="#74ad22" />
          <stop offset="1" stopColor="#286512" />
        </linearGradient>
        <linearGradient id="growth-leaf-deep" x1="80" x2="214" y1="52" y2="164" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8fc51e" />
          <stop offset="0.5" stopColor="#4e8b15" />
          <stop offset="1" stopColor="#17460c" />
        </linearGradient>
        <filter id="growth-soft-shadow" x="-20%" y="-20%" width="140%" height="150%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="#4d2b05" floodOpacity="0.28" />
        </filter>
      </defs>

      <StageArtwork stageId={stageId} />
    </svg>
  );
}

function StageArtwork({ stageId }: { stageId: TreeStageId }) {
  switch (stageId) {
    case "sapling":
      return <LargerSproutStage />;
    case "young_tree":
      return <GrowingPlantStage />;
    case "mature_tree":
      return <LeafyYoungTreeStage />;
    case "large_tree":
      return <MatureMoneyTreeStage />;
    case "seedling":
    default:
      return <SproutStage />;
  }
}

function CoinStack({
  layers,
  topY,
  width,
}: {
  layers: number;
  topY: number;
  width: number;
}) {
  const cx = 140;
  const rx = width / 2;
  const ry = width * 0.14;
  const layerHeight = 13;
  const sideTop = topY + 2;
  const bottomY = sideTop + layers * layerHeight;

  return (
    <g filter="url(#growth-soft-shadow)">
      <ellipse cx={cx} cy={bottomY + 7} rx={rx * 0.94} ry={ry * 0.58} fill="#3d2204" opacity="0.24" />
      {Array.from({ length: layers }).map((_, index) => {
        const y = sideTop + index * layerHeight;
        return (
          <g key={index}>
            <path d={`M${cx - rx} ${y} Q${cx} ${y + ry} ${cx + rx} ${y} L${cx + rx} ${y + layerHeight} Q${cx} ${y + layerHeight + ry} ${cx - rx} ${y + layerHeight} Z`} fill="url(#growth-coin-side)" />
            <path d={`M${cx - rx + 7} ${y + 2} Q${cx} ${y + ry - 2} ${cx + rx - 7} ${y + 2}`} stroke="#ffe37a" strokeWidth="2.5" opacity="0.78" />
            <path d={`M${cx - rx} ${y + layerHeight - 1} Q${cx} ${y + layerHeight + ry} ${cx + rx} ${y + layerHeight - 1}`} stroke="#6e3900" strokeWidth="2.4" opacity="0.58" />
          </g>
        );
      })}
      <ellipse cx={cx} cy={topY} rx={rx} ry={ry} fill="url(#growth-coin-top)" stroke="#b46602" strokeWidth="2.4" />
      <ellipse cx={cx} cy={topY} rx={rx * 0.72} ry={ry * 0.63} fill="url(#growth-coin-face)" stroke="#fff3a6" strokeWidth="2.5" />
      <ellipse cx={cx} cy={topY} rx={rx * 0.52} ry={ry * 0.43} fill="none" stroke="#a45b00" strokeWidth="2.2" opacity="0.7" />
      <text x={cx} y={topY + 8} textAnchor="middle" fontSize={Math.max(20, width * 0.17)} fontWeight="900" fill="#a95d00" stroke="#fff3a0" strokeWidth="1.2">$</text>
    </g>
  );
}

function Leaf({ x, y, size, rotate, tone = "mid" }: LeafProps) {
  const fill =
    tone === "light"
      ? "url(#growth-leaf-light)"
      : tone === "deep"
        ? "url(#growth-leaf-deep)"
        : "url(#growth-leaf-mid)";

  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${size})`}>
      <path d="M0 0 C12 -20 34 -22 48 -7 C37 11 14 18 0 0Z" fill={fill} stroke="#2d690f" strokeWidth="1.8" />
      <path d="M5 -1 C17 -6 30 -8 43 -7" stroke="#c8ec4b" strokeWidth="1.3" strokeLinecap="round" opacity="0.72" />
      <path d="M19 -5 L25 -15 M25 -5 L35 -13 M24 0 L36 5" stroke="#5f9519" strokeWidth="0.9" strokeLinecap="round" opacity="0.62" />
    </g>
  );
}

function MoneyCoin({ cx, cy, r }: CoinProps) {
  return (
    <g filter="url(#growth-soft-shadow)">
      <circle cx={cx} cy={cy} r={r} fill="#d47a03" />
      <circle cx={cx - 2} cy={cy - 2} r={r * 0.86} fill="#ffb71c" stroke="#fff1a2" strokeWidth="2.3" />
      <circle cx={cx - 2} cy={cy - 2} r={r * 0.63} fill="#f9c52e" stroke="#a75a00" strokeWidth="1.7" opacity="0.92" />
      <text x={cx - 2} y={cy + r * 0.35} textAnchor="middle" fontSize={r * 1.25} fontWeight="900" fill="#a95d00" stroke="#fff3a4" strokeWidth="1">$</text>
    </g>
  );
}

function StemBase({ x = 140, y = 156, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-19 10 C-11 -1 9 -5 22 9 C10 17 -10 18 -19 10Z" fill="#6b3b08" />
      <path d="M-25 15 C-13 6 9 6 27 15 C10 21 -13 21 -25 15Z" fill="#9b610d" opacity="0.72" />
    </g>
  );
}

function SproutStage() {
  return (
    <g>
      <CoinStack layers={1} topY={172} width={150} />
      <StemBase y={159} scale={0.66} />
      <path d="M139 158 C137 143 138 129 140 115" stroke="url(#growth-stem)" strokeWidth="7" strokeLinecap="round" />
      <Leaf x={137} y={128} size={0.52} rotate={205} tone="light" />
      <Leaf x={143} y={126} size={0.54} rotate={330} tone="mid" />
    </g>
  );
}

function LargerSproutStage() {
  return (
    <g>
      <CoinStack layers={2} topY={162} width={164} />
      <StemBase y={151} scale={0.78} />
      <path d="M139 153 C139 131 140 107 143 87" stroke="url(#growth-stem)" strokeWidth="8" strokeLinecap="round" />
      <Leaf x={139} y={128} size={0.62} rotate={198} tone="light" />
      <Leaf x={144} y={125} size={0.62} rotate={336} tone="mid" />
      <Leaf x={139} y={101} size={0.64} rotate={218} tone="light" />
    </g>
  );
}

function GrowingPlantStage() {
  return (
    <g>
      <CoinStack layers={3} topY={154} width={172} />
      <StemBase y={144} scale={0.88} />
      <path d="M141 148 C140 121 142 92 146 63" stroke="url(#growth-stem)" strokeWidth="9" strokeLinecap="round" />
      <path d="M141 121 C127 107 114 101 99 98" stroke="url(#growth-stem)" strokeWidth="4" strokeLinecap="round" />
      <path d="M145 106 C160 91 176 85 194 84" stroke="url(#growth-stem)" strokeWidth="4" strokeLinecap="round" />
      <path d="M143 84 C132 73 123 67 109 64" stroke="url(#growth-stem)" strokeWidth="3.5" strokeLinecap="round" />
      <Leaf x={105} y={99} size={0.72} rotate={196} tone="mid" />
      <Leaf x={132} y={121} size={0.68} rotate={215} tone="light" />
      <Leaf x={156} y={105} size={0.7} rotate={334} tone="mid" />
      <Leaf x={183} y={86} size={0.69} rotate={343} tone="light" />
      <Leaf x={112} y={65} size={0.66} rotate={219} tone="light" />
      <Leaf x={147} y={65} size={0.72} rotate={300} tone="mid" />
    </g>
  );
}

function LeafyYoungTreeStage() {
  return (
    <g>
      <CoinStack layers={4} topY={150} width={178} />
      <StemBase y={143} scale={1.05} />
      <path d="M133 147 C132 122 135 93 145 63" stroke="url(#growth-trunk)" strokeWidth="18" strokeLinecap="round" />
      <path d="M146 137 C154 112 171 92 197 78" stroke="#6a3908" strokeWidth="7" strokeLinecap="round" />
      <path d="M136 128 C124 107 103 91 78 84" stroke="#6a3908" strokeWidth="7" strokeLinecap="round" />
      <path d="M133 144 C131 119 136 88 145 64" stroke="#c48120" strokeWidth="4" strokeLinecap="round" opacity="0.75" />
      <Leaf x={79} y={87} size={0.78} rotate={198} tone="deep" />
      <Leaf x={100} y={71} size={0.82} rotate={216} tone="mid" />
      <Leaf x={127} y={56} size={0.86} rotate={238} tone="light" />
      <Leaf x={151} y={63} size={0.9} rotate={300} tone="mid" />
      <Leaf x={180} y={79} size={0.86} rotate={325} tone="deep" />
      <Leaf x={202} y={99} size={0.78} rotate={342} tone="mid" />
      <Leaf x={91} y={117} size={0.78} rotate={188} tone="mid" />
      <Leaf x={122} y={117} size={0.86} rotate={214} tone="light" />
      <Leaf x={151} y={111} size={0.9} rotate={326} tone="light" />
      <Leaf x={181} y={121} size={0.78} rotate={342} tone="mid" />
      <Leaf x={113} y={141} size={0.72} rotate={201} tone="deep" />
      <Leaf x={151} y={139} size={0.76} rotate={332} tone="deep" />
    </g>
  );
}

function MatureMoneyTreeStage() {
  return (
    <g>
      <CoinStack layers={5} topY={148} width={182} />
      <StemBase y={141} scale={1.12} />
      <path d="M132 146 C131 121 134 88 146 48" stroke="url(#growth-trunk)" strokeWidth="22" strokeLinecap="round" />
      <path d="M145 136 C154 111 175 86 209 68" stroke="#693908" strokeWidth="8" strokeLinecap="round" />
      <path d="M136 130 C122 105 96 84 66 75" stroke="#693908" strokeWidth="8" strokeLinecap="round" />
      <path d="M138 104 C125 81 104 64 80 54" stroke="#75420b" strokeWidth="6" strokeLinecap="round" />
      <path d="M146 101 C164 77 187 58 219 51" stroke="#75420b" strokeWidth="6" strokeLinecap="round" />
      <path d="M132 144 C131 118 135 86 146 51" stroke="#c68120" strokeWidth="5" strokeLinecap="round" opacity="0.72" />
      <Leaf x={58} y={80} size={0.78} rotate={194} tone="deep" />
      <Leaf x={78} y={56} size={0.86} rotate={211} tone="mid" />
      <Leaf x={103} y={41} size={0.88} rotate={232} tone="light" />
      <Leaf x={132} y={35} size={0.94} rotate={262} tone="mid" />
      <Leaf x={164} y={41} size={0.92} rotate={304} tone="light" />
      <Leaf x={195} y={54} size={0.88} rotate={328} tone="mid" />
      <Leaf x={219} y={76} size={0.82} rotate={344} tone="deep" />
      <Leaf x={66} y={108} size={0.86} rotate={184} tone="mid" />
      <Leaf x={93} y={94} size={0.9} rotate={207} tone="light" />
      <Leaf x={121} y={82} size={0.96} rotate={229} tone="deep" />
      <Leaf x={150} y={82} size={1} rotate={315} tone="light" />
      <Leaf x={181} y={92} size={0.94} rotate={333} tone="mid" />
      <Leaf x={211} y={112} size={0.84} rotate={350} tone="deep" />
      <Leaf x={82} y={134} size={0.82} rotate={194} tone="deep" />
      <Leaf x={112} y={126} size={0.9} rotate={218} tone="mid" />
      <Leaf x={145} y={121} size={0.96} rotate={322} tone="light" />
      <Leaf x={178} y={130} size={0.86} rotate={340} tone="mid" />
      <Leaf x={141} y={57} size={0.78} rotate={280} tone="deep" />
      <MoneyCoin cx={108} cy={78} r={18} />
      <MoneyCoin cx={166} cy={67} r={18} />
      <MoneyCoin cx={199} cy={104} r={17} />
      <MoneyCoin cx={131} cy={115} r={17} />
      <MoneyCoin cx={77} cy={112} r={17} />
    </g>
  );
}
