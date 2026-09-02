'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { safeCopyToClipboard } from '../lib/clipboard';

export type SeriesPoint = { ts: number; value: number };

/**
 * Time-series line chart. Geometry is computed in a 0..100 normalised space and the SVG is
 * stretched to its container, so pointer positions are converted with the element's real
 * width (not the viewBox) and overlays are positioned in percentages.
 */
export function LineChart({
  data,
  className = '',
  stroke = '#60a5fa',
  fill = 'none',
  yMaxPadding = 0.15,
  showAxes = true,
  showGrid = true,
  height = 220,
  valueSuffix = '',
  xLabel,
  yLabel,
  smooth = false,
  smoothAlpha = 0.25,
  paddingLeft = 8,
  paddingRight = 2,
  paddingTop = 8,
  paddingBottom = 14,
  thresholds,
  glow = true,
  yScale = 'linear',
  svgRefExternal,
  enableControls = false,
  filePrefix = 'chart',
  footerExtra,
  showScaleToggle = false,
  promQuery,
  showYTicks = true,
}: {
  data: SeriesPoint[];
  className?: string;
  stroke?: string;
  fill?: string;
  yMaxPadding?: number;
  showAxes?: boolean;
  showGrid?: boolean;
  height?: number;
  valueSuffix?: string;
  xLabel?: string;
  yLabel?: string;
  /** Exponential smoothing of the drawn line. Off by default: counts and latencies must not be blurred. */
  smooth?: boolean;
  smoothAlpha?: number;
  paddingLeft?: number; // percent of width (0..100)
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  thresholds?: { warn?: number; crit?: number };
  glow?: boolean;
  yScale?: 'linear' | 'log';
  svgRefExternal?: (el: SVGSVGElement | null) => void;
  enableControls?: boolean;
  filePrefix?: string;
  footerExtra?: React.ReactNode;
  showScaleToggle?: boolean;
  promQuery?: string;
  showYTicks?: boolean;
}) {
  const VIEW_W = 600;
  const glowId = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hasData = Array.isArray(data) && data.length > 0;

  const drawn = useMemo(() => (hasData && smooth ? applyEMA(data, smoothAlpha) : data ?? []), [data, hasData, smooth, smoothAlpha]);
  const minX = hasData ? Math.min(...data.map((d) => d.ts)) : 0;
  const maxX = hasData ? Math.max(...data.map((d) => d.ts)) : 1;
  const minY = 0;
  const rawMaxY = hasData ? Math.max(1, ...drawn.map((d) => d.value)) : 1;
  const maxY = rawMaxY + rawMaxY * yMaxPadding;

  // Interactive X-range (pan/zoom)
  const [range, setRange] = useState<[number, number]>([minX, maxX]);
  useEffect(() => { setRange([minX, maxX]); }, [minX, maxX]);
  const [scaleMode, setScaleMode] = useState<'linear' | 'log'>(yScale);
  useEffect(() => { setScaleMode(yScale); }, [yScale]);
  // hover as a 0..1 ratio of the element width (independent of the rendered size)
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  const x0 = paddingLeft;
  const x1 = 100 - paddingRight;
  const y0 = paddingTop;
  const y1 = 100 - paddingBottom;
  const span = range[1] - range[0] || 1;
  const toX = (v: number) => x0 + ((v - range[0]) / span) * (x1 - x0);
  const toY = (v: number) => {
    if (scaleMode === 'log') {
      const f = (val: number) => Math.log1p(Math.max(0, val - minY));
      const top = f(maxY - minY);
      const ratio = top > 0 ? f(v - minY) / top : 0;
      return y1 - ratio * (y1 - y0);
    }
    return y1 - ((v - minY) / (maxY - minY || 1)) * (y1 - y0);
  };
  const fromY = (t: number) => {
    // inverse of toY for grid tick labels (t = 0..1 from bottom)
    if (scaleMode === 'log') {
      const top = Math.log1p(maxY - minY);
      return minY + Math.expm1(t * top);
    }
    return minY + t * (maxY - minY);
  };

  const pathD = useMemo(
    () => drawn.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.ts).toFixed(2)} ${toY(p.value).toFixed(2)}`).join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawn, range, scaleMode, maxY],
  );

  const nearest = useMemo(() => {
    if (hoverRatio == null || !hasData) return null;
    const plotRatio = Math.max(0, Math.min(1, (hoverRatio * 100 - x0) / (x1 - x0)));
    const targetTs = range[0] + plotRatio * span;
    let bestIdx = 0;
    let bestDiff = Infinity;
    data.forEach((p, i) => {
      const d = Math.abs(p.ts - targetTs);
      if (d < bestDiff) { bestDiff = d; bestIdx = i; }
    });
    // tooltip shows the raw sample; the marker sits on the drawn (possibly smoothed) line
    return { raw: data[bestIdx]!, drawn: drawn[bestIdx] ?? data[bestIdx]! };
  }, [hoverRatio, hasData, data, drawn, range, span, x0, x1]);

  const gaps = useMemo(() => {
    if (drawn.length < 3) return [] as Array<[number, number]>;
    const dts: number[] = [];
    for (let i = 1; i < drawn.length; i++) dts.push(drawn[i]!.ts - drawn[i - 1]!.ts);
    dts.sort((a, b) => a - b);
    const med = dts[Math.floor(dts.length / 2)] ?? 0;
    const threshold = med * 3;
    const out: Array<[number, number]> = [];
    for (let i = 1; i < drawn.length; i++) {
      const dt = drawn[i]!.ts - drawn[i - 1]!.ts;
      if (dt > threshold) out.push([drawn[i - 1]!.ts, drawn[i]!.ts]);
    }
    return out;
  }, [drawn]);

  if (!hasData) {
    return <div className={cn('h-40 flex items-center justify-center text-white/60', className)}>No data</div>;
  }

  const latest = drawn[drawn.length - 1]!;
  const latestRaw = data[data.length - 1]!;
  const gridTicks = [0, 0.25, 0.5, 0.75, 1];
  const ratioFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0;
  };
  const lx = toX(latest.ts);
  const ly = toY(latest.value);

  return (
    <div className={cn('', className)}>
      <div className="relative select-none" style={{ height }}>
        <svg
          ref={(el) => { svgRef.current = el; if (svgRefExternal) svgRefExternal(el); }}
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${VIEW_W} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${yLabel ?? 'series'} chart, latest ${formatNum(latestRaw.value)}${valueSuffix}`}
          onMouseMove={(e) => setHoverRatio(ratioFromEvent(e))}
          onMouseLeave={() => setHoverRatio(null)}
          onWheel={(e) => {
            e.preventDefault();
            const factor = Math.exp(-e.deltaY * 0.001);
            const plotRatio = Math.max(0, Math.min(1, (ratioFromEvent(e) * 100 - x0) / (x1 - x0)));
            const mouseTs = range[0] + plotRatio * span;
            const newMin = mouseTs - (mouseTs - range[0]) * factor;
            const newMax = mouseTs + (range[1] - mouseTs) * factor;
            const minWidth = (maxX - minX) / 200;
            if (newMax - newMin < minWidth) return;
            setRange([Math.max(minX, newMin), Math.min(maxX, newMax)]);
          }}
          onDoubleClick={() => setRange([minX, maxX])}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const startX = e.clientX;
            const startRange: [number, number] = [range[0], range[1]];
            const onMove = (ev: MouseEvent) => {
              const dx = ev.clientX - startX;
              const dt = (dx / Math.max(1, rect.width)) * (startRange[1] - startRange[0]);
              let n0 = startRange[0] - dt;
              let n1 = startRange[1] - dt;
              const s = n1 - n0;
              if (n0 < minX) { n0 = minX; n1 = minX + s; }
              if (n1 > maxX) { n1 = maxX; n0 = maxX - s; }
              setRange([n0, n1]);
            };
            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        >
          <g transform={`scale(${VIEW_W / 100} ${height / 100})`}>
            {glow && (
              <defs>
                <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1.2" result="coloredBlur" />
                  <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
            )}
            {showGrid && gridTicks.map((t) => (
              <line key={t} x1={x0} x2={x1} y1={y0 + t * (y1 - y0)} y2={y0 + t * (y1 - y0)} stroke="var(--chart-grid)" strokeWidth={0.5} />
            ))}
            {showAxes && (
              <>
                <line x1={x0} x2={x1} y1={y1} y2={y1} stroke="var(--chart-axis)" strokeWidth={0.8} />
                <line x1={x0} x2={x0} y1={y0} y2={y1} stroke="var(--chart-axis)" strokeWidth={0.8} />
              </>
            )}
            {thresholds?.warn != null && <line x1={x0} x2={x1} y1={toY(thresholds.warn)} y2={toY(thresholds.warn)} stroke="#F59E0B" strokeOpacity={0.5} strokeDasharray="2 2" strokeWidth={0.8} />}
            {thresholds?.crit != null && <line x1={x0} x2={x1} y1={toY(thresholds.crit)} y2={toY(thresholds.crit)} stroke="#EF4444" strokeOpacity={0.6} strokeDasharray="2 2" strokeWidth={0.8} />}
            {gaps.map(([a, b], idx) => (
              <rect key={idx} x={toX(a)} y={y0} width={Math.max(0.5, toX(b) - toX(a))} height={y1 - y0} fill="white" opacity={0.05} />
            ))}
            <path d={pathD} stroke={stroke} strokeWidth={2} fill={fill} vectorEffect="non-scaling-stroke" filter={glow ? `url(#${glowId})` : undefined} />
            <circle cx={lx} cy={ly} r={1.2} fill={stroke} />
            {nearest && (
              <>
                <line x1={toX(nearest.raw.ts)} x2={toX(nearest.raw.ts)} y1={y0} y2={y1} stroke="var(--chart-axis)" strokeDasharray="1 1" strokeWidth={0.6} />
                <circle cx={toX(nearest.drawn.ts)} cy={toY(nearest.drawn.value)} r={1.4} fill={stroke} />
              </>
            )}
          </g>
          {/* Unscaled text overlays (percent of viewBox so they track the stretched SVG) */}
          {showYTicks && height >= 100 && [0.5, 1].map((t) => (
            <text key={t} x={(x0 / 100) * VIEW_W - 2} y={((y1 - t * (y1 - y0)) / 100) * height + 3} fontSize={9} textAnchor="end" fill="var(--chart-axis)" className="font-mono opacity-60">
              {formatNum(fromY(t))}
            </text>
          ))}
          {(() => {
            const anchor: 'start' | 'end' = lx > 85 ? 'end' : 'start';
            const textX = lx > 85 ? lx - 2 : lx + 2;
            const textY = Math.min(y1 - 2, Math.max(y0 + 10, ly));
            return (
              <g>
                <rect x={((lx > 85 ? textX - 12 : textX - 1) / 100) * VIEW_W} y={((textY - 5) / 100) * height} width={(14 / 100) * VIEW_W} height={(8 / 100) * height} rx={2} fill="rgba(0,0,0,0.6)" />
                <text x={(textX / 100) * VIEW_W} y={((textY + 1) / 100) * height} fontSize={10} fontWeight="bold" textAnchor={anchor} fill={stroke} className="font-mono">
                  {formatNum(latestRaw.value)}{valueSuffix}
                </text>
                {xLabel && <text x={(((x0 + x1) / 2) / 100) * VIEW_W} y={((y1 + 10) / 100) * height} fontSize={10} fontWeight="bold" textAnchor="middle" fill="var(--chart-axis)" className="uppercase tracking-widest opacity-50">{xLabel}</text>}
                {yLabel && <text x={((x0 + 1) / 100) * VIEW_W} y={((y0 + 6) / 100) * height} fontSize={10} fontWeight="bold" textAnchor="start" fill="var(--chart-axis)" className="uppercase tracking-widest opacity-50">{yLabel}</text>}
              </g>
            );
          })()}
        </svg>
        {enableControls && (
          <div className="absolute right-2 top-2 flex items-center gap-2">
            <button type="button" className="btn text-xs" onClick={() => setRange([minX, maxX])}>Reset</button>
          </div>
        )}
        {nearest && (
          <div
            className="absolute px-2 py-1 rounded border text-xs pointer-events-none"
            style={{
              left: `${Math.min(80, Math.max(1, toX(nearest.raw.ts) + 1))}%`,
              top: Math.max(4, (toY(nearest.drawn.value) / 100) * height - 28),
              background: 'var(--chart-tooltip-bg)',
              borderColor: 'var(--chart-tooltip-border)',
            }}
          >
            <div className="font-mono">{formatNum(nearest.raw.value)}{valueSuffix}</div>
            <div className="opacity-70">{new Date(nearest.raw.ts).toLocaleTimeString()}</div>
          </div>
        )}
      </div>
      {enableControls && (
        <div className="mt-1 flex items-center justify-end gap-2">
          {footerExtra}
          {showScaleToggle && <button type="button" className="btn text-xs" onClick={() => setScaleMode(scaleMode === 'log' ? 'linear' : 'log')}>{scaleMode === 'log' ? 'Linear' : 'Log'}</button>}
          {promQuery && <button type="button" className="btn text-xs" onClick={async () => { await safeCopyToClipboard(promQuery); }} title={promQuery}>Copy PromQL</button>}
          <button type="button" className="btn text-xs" onClick={() => exportPNG(svgRef.current, `${filePrefix}.png`)}>PNG</button>
          <button type="button" className="btn text-xs" onClick={() => exportCSV(data, [range[0], range[1]], `${filePrefix}.csv`)}>CSV</button>
        </div>
      )}
    </div>
  );
}

export function BarChart({
  data,
  className = '',
  barColor = '#60a5fa',
  maxBars = 10,
}: {
  data: Array<{ label: string; value: number }>;
  className?: string;
  barColor?: string;
  maxBars?: number;
}) {
  const items = (data || []).slice(0, maxBars);
  const max = Math.max(1, ...items.map((d) => d.value));
  return (
    <div className={cn('space-y-2', className)}>
      {items.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <div className="w-40 truncate text-sm text-white/80" title={d.label}>{d.label}</div>
          <div className="flex-1 h-2 bg-white/10 rounded">
            <div className="h-2 rounded" style={{ width: `${(d.value / max) * 100}%`, backgroundColor: barColor }} aria-label={`${d.label}: ${d.value}`} />
          </div>
          <div className="w-16 text-right text-xs text-white/70 tabular-nums">{d.value.toLocaleString()}</div>
        </div>
      ))}
      {items.length === 0 && <div className="text-white/60 text-sm">No data</div>}
    </div>
  );
}

export function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  if (Math.abs(n) >= 10) return n.toFixed(0);
  if (n === 0) return '0';
  return n.toFixed(Math.abs(n) >= 1 ? 1 : 2);
}

export function applyEMA(series: SeriesPoint[], alpha: number): SeriesPoint[] {
  const a = Math.min(1, Math.max(0.01, alpha || 0.2));
  let prev = series[0]?.value ?? 0;
  return series.map((p) => {
    const v = a * p.value + (1 - a) * prev;
    prev = v;
    return { ts: p.ts, value: v };
  });
}

function exportPNG(svgEl: SVGSVGElement | null, filename: string) {
  if (!svgEl) return;
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const rect = svgEl.viewBox.baseVal;
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = filename;
      a.click();
    }
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function exportCSV(series: SeriesPoint[], range: [number, number], filename: string) {
  const rows = ['ts,value'];
  for (const p of series) {
    if (p.ts >= range[0] && p.ts <= range[1]) rows.push(`${Math.floor(p.ts)},${p.value}`);
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
