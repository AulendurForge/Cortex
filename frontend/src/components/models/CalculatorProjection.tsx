'use client';

import React from 'react';
import { Badge, Card } from '@/components/UI';
import { bytesToGiB, type MemoryBreakdown } from '@/lib/model-math';
import { cn } from '@/lib/cn';

/** Per-GPU fit projection cards for the resource calculator. */
export function CalculatorProjection({ perGpu }: { perGpu: MemoryBreakdown['perGpu'] }) {
  return (
    <Card className="p-3 bg-white/[0.02] border-white/5 space-y-2">
      {perGpu.map((p) => (
        <div key={p.index} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase font-black text-white/40">GPU {p.index}</span>
            <Badge className={!p.vramKnown ? 'bg-white/10 text-white/60 border-white/10' : p.fits ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}>
              {!p.vramKnown ? 'CAPACITY UNKNOWN' : p.fits ? 'FITS' : 'OVERFLOW'}
            </Badge>
          </div>
          <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div
              className={cn('h-full transition-all duration-1000', p.fits ? 'bg-gradient-to-r from-indigo-500 to-purple-500' : 'bg-red-500')}
              style={{ width: `${p.vramKnown && p.vramTotalBytes ? Math.min(100, (p.totalBytes / p.vramTotalBytes) * 100) : 0}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-white/40">
            <span>Weights: {bytesToGiB(p.weightsBytes).toFixed(1)}G</span>
            <span>KV: {bytesToGiB(p.kvBytes).toFixed(1)}G</span>
          </div>
        </div>
      ))}
    </Card>
  );
}
