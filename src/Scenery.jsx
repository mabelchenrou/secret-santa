import React from "react";

// 純裝飾用的插畫：燈串、雪地小鎮、禮物。全部是 SVG，不需要另外放圖片檔。

const BULBS = ["#c8414b", "#79b8a6", "#f2a7a5", "#e8b65a"];

// 掛在頁面最上方的燈串
export function Lights({ count = 11 }) {
  const w = 400, sag = 16;
  const y = (x) => 6 + sag * Math.sin((Math.PI * x) / w);
  const bulbs = Array.from({ length: count }, (_, i) => {
    const x = ((i + 0.5) * w) / count;
    return { x, y: y(x), c: BULBS[i % BULBS.length] };
  });
  return <svg className="lights" viewBox="0 0 400 44" preserveAspectRatio="none" aria-hidden="true">
    <path d={`M0 6 Q200 ${6 + sag * 2} 400 6`} fill="none" stroke="#1d4a3c" strokeWidth="1.4" />
    {bulbs.map((b, i) => <g key={i} transform={`translate(${b.x} ${b.y}) rotate(${(i % 2 ? 1 : -1) * 8})`}>
      <rect x="-2.6" y="0" width="5.2" height="4" rx="1" fill="#1d4a3c" />
      <path d="M-4.2 4 C-5 10 -3 15.5 0 15.5 C3 15.5 5 10 4.2 4 Z" fill={b.c} />
      <ellipse cx="-1.4" cy="8" rx="1" ry="2.4" fill="#fff" opacity=".55" />
    </g>)}
  </svg>;
}

function Tree({ x, base, h, tone = "#2f6b5c", dark = "#1d4a3c" }) {
  const w = h * 0.62;
  const tiers = [0, 0.3, 0.56];
  return <g>
    <rect x={x - h * 0.05} y={base - h * 0.12} width={h * 0.1} height={h * 0.14} fill="#7a3a33" />
    {tiers.map((t, i) => {
      const top = base - h + t * h * 0.9;
      const bot = top + h * 0.48;
      const half = (w / 2) * (0.62 + i * 0.19);
      return <g key={i}>
        <path d={`M${x} ${top} L${x + half} ${bot} Q${x} ${bot + 4} ${x - half} ${bot} Z`} fill={i === 2 ? dark : tone} />
        <path d={`M${x} ${top} L${x + half * 0.35} ${top + h * 0.15} Q${x} ${top + h * 0.2} ${x - half * 0.35} ${top + h * 0.15} Z`} fill="#fffaf9" />
      </g>;
    })}
  </g>;
}

function House({ x, base, w, h, wall, roof }) {
  const roofH = w * 0.55;
  const top = base - h;
  return <g>
    <rect x={x} y={top} width={w} height={h} fill={wall} />
    <rect x={x + w * 0.62} y={top - roofH * 0.85} width={w * 0.13} height={roofH * 0.6} fill={roof} />
    <path d={`M${x - w * 0.12} ${top + 2} L${x + w / 2} ${top - roofH} L${x + w * 1.12} ${top + 2} Z`} fill={roof} />
    <path d={`M${x - w * 0.14} ${top + 3} L${x + w / 2} ${top - roofH - 2} L${x + w * 1.14} ${top + 3}
      Q${x + w * 0.95} ${top + 7} ${x + w * 0.8} ${top + 1} Q${x + w * 0.6} ${top + 8} ${x + w * 0.45} ${top}
      Q${x + w * 0.25} ${top + 7} ${x + w * 0.1} ${top + 1} Q${x} ${top + 7} ${x - w * 0.14} ${top + 3} Z`} fill="#fffaf9" />
    <rect x={x + w * 0.18} y={top + h * 0.28} width={w * 0.22} height={w * 0.22} rx="1" fill="#1d4a3c" />
    <rect x={x + w * 0.6} y={top + h * 0.28} width={w * 0.22} height={w * 0.22} rx="1" fill="#f6d27e" />
    <path d={`M${x + w * 0.38} ${base} V${base - h * 0.34} Q${x + w / 2} ${base - h * 0.44} ${x + w * 0.62} ${base - h * 0.34} V${base} Z`} fill={roof} />
  </g>;
}

function Present({ x, base, s, box, ribbon }) {
  return <g>
    <rect x={x} y={base - s} width={s} height={s} rx="1.5" fill={box} />
    <rect x={x + s * 0.42} y={base - s} width={s * 0.16} height={s} fill={ribbon} />
    <rect x={x - 1} y={base - s} width={s + 2} height={s * 0.22} rx="1" fill={box} opacity=".85" />
    <path d={`M${x + s / 2} ${base - s} c-${s * 0.3} -${s * 0.35} -${s * 0.45} -${s * 0.05} 0 0 c${s * 0.3} -${s * 0.35} ${s * 0.45} -${s * 0.05} 0 0`} fill="none" stroke={ribbon} strokeWidth="2.2" />
  </g>;
}

const FLAKES = [[22, 18], [70, 44], [118, 12], [160, 52], [214, 24], [262, 48], [310, 16], [356, 40], [384, 70], [40, 80], [190, 84], [336, 92]];

// 首頁的雪地小鎮
export function Village() {
  return <svg className="village" viewBox="0 40 400 140" aria-hidden="true">
    {FLAKES.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 ? 1.6 : 2.4} fill="#fff" opacity=".9" />)}
    <path d="M0 120 Q70 82 150 110 T300 96 T400 104 V190 H0 Z" fill="#f4c9c6" />
    <Tree x={30} base={120} h={52} tone="#4f9c88" dark="#2f6b5c" />
    <Tree x={372} base={108} h={58} tone="#4f9c88" dark="#2f6b5c" />
    <path d="M0 140 Q90 108 190 130 T400 122 V190 H0 Z" fill="#f9dedb" />
    <House x={74} base={142} w={38} h={36} wall="#e98c8f" roof="#8f2f3a" />
    <House x={128} base={136} w={30} h={30} wall="#f6b7b3" roof="#b1424c" />
    <Tree x={176} base={140} h={60} />
    <House x={238} base={134} w={34} h={34} wall="#e98c8f" roof="#8f2f3a" />
    <House x={286} base={138} w={28} h={28} wall="#f6b7b3" roof="#1d4a3c" />
    <Tree x={334} base={140} h={46} />
    <Tree x={210} base={140} h={38} tone="#4f9c88" dark="#2f6b5c" />
    <path d="M0 158 Q110 138 220 156 T400 150 V190 H0 Z" fill="#fffaf9" />
    <Present x={108} base={170} s={20} box="#c8414b" ribbon="#f6d27e" />
    <Present x={130} base={170} s={14} box="#79b8a6" ribbon="#c8414b" />
    <Present x={262} base={168} s={17} box="#f2a7a5" ribbon="#1d4a3c" />
    <Present x={282} base={168} s={12} box="#1d4a3c" ribbon="#f2a7a5" />
  </svg>;
}

// 活動頁上方的小雪坡
export function Hills() {
  return <svg className="hills" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 34 Q80 8 170 28 T400 20 V60 H0 Z" fill="#f4c9c6" />
    <path d="M0 46 Q120 24 230 42 T400 38 V60 H0 Z" fill="#fffaf9" />
  </svg>;
}
