'use client';

import { InfoBox, type InfoBoxVariant } from '@/components/UI';
import type { CalloutVariant } from '../types';
import { Inline } from './inline';

const VARIANT: Record<CalloutVariant, InfoBoxVariant> = { info: 'blue', warning: 'warning', success: 'emerald', error: 'error' };

/** Wraps InfoBox; `md` is inline markdown, `title` plain text. */
export function Callout({ variant, title, md }: { variant: CalloutVariant; title?: string; md: string }) {
  return (
    <InfoBox variant={VARIANT[variant]} title={title} className="text-[12px] p-3 leading-relaxed max-w-3xl" role={variant === 'error' ? 'alert' : undefined}>
      <Inline md={md} />
    </InfoBox>
  );
}
