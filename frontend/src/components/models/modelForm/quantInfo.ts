/**
 * Quantization quality/speed information.
 * Higher quality = more bits, better output, but larger size and slower.
 * Higher speed = faster inference, but may sacrifice quality.
 */
export interface QuantInfo {
  quality: number;  // 1-5 scale
  speed: number;    // 1-5 scale
  bits: string;     // Approximate bits per weight
  description: string;
  color: string;    // Tailwind color for badge
}

const QUANT_INFO: Record<string, QuantInfo> = {
  // Full precision
  'F32': { quality: 5, speed: 1, bits: '32', description: 'Full precision - maximum quality, very large', color: 'purple' },
  'F16': { quality: 5, speed: 2, bits: '16', description: 'Half precision - excellent quality, large size', color: 'purple' },
  'BF16': { quality: 5, speed: 2, bits: '16', description: 'Brain float - excellent for training models', color: 'purple' },

  // 8-bit quantization
  'Q8_0': { quality: 5, speed: 3, bits: '8', description: 'Best quantized quality, ~2x smaller than F16', color: 'emerald' },
  'Q8_1': { quality: 5, speed: 3, bits: '8', description: 'Similar to Q8_0 with different rounding', color: 'emerald' },

  // 6-bit quantization
  'Q6_K': { quality: 4, speed: 3, bits: '6.5', description: 'Very high quality, good balance', color: 'cyan' },

  // 5-bit quantization
  'Q5_K_M': { quality: 4, speed: 4, bits: '5.5', description: 'Great quality/size balance - popular choice', color: 'cyan' },
  'Q5_K_S': { quality: 4, speed: 4, bits: '5.5', description: 'Slightly smaller than Q5_K_M', color: 'cyan' },
  'Q5_K_L': { quality: 4, speed: 4, bits: '5.5', description: 'Slightly larger than Q5_K_M', color: 'cyan' },
  'Q5_K': { quality: 4, speed: 4, bits: '5.5', description: 'Good quality 5-bit quantization', color: 'cyan' },
  'Q5_0': { quality: 4, speed: 4, bits: '5', description: 'Basic 5-bit quantization', color: 'cyan' },
  'Q5_1': { quality: 4, speed: 4, bits: '5', description: 'Alternative 5-bit quantization', color: 'cyan' },

  // 4-bit quantization
  'Q4_K_M': { quality: 3, speed: 5, bits: '4.5', description: 'Best 4-bit quality - recommended for VRAM constrained', color: 'amber' },
  'Q4_K_S': { quality: 3, speed: 5, bits: '4.5', description: 'Smaller than Q4_K_M, slightly lower quality', color: 'amber' },
  'Q4_K_L': { quality: 3, speed: 5, bits: '4.5', description: 'Larger than Q4_K_M', color: 'amber' },
  'Q4_K': { quality: 3, speed: 5, bits: '4.5', description: 'Good 4-bit quantization', color: 'amber' },
  'Q4_0': { quality: 3, speed: 5, bits: '4', description: 'Basic 4-bit, fast but lower quality', color: 'amber' },
  'Q4_1': { quality: 3, speed: 5, bits: '4', description: 'Alternative 4-bit quantization', color: 'amber' },

  // 3-bit and lower (aggressive quantization)
  'Q3_K_M': { quality: 2, speed: 5, bits: '3.5', description: 'Aggressive - noticeable quality loss', color: 'orange' },
  'Q3_K_S': { quality: 2, speed: 5, bits: '3.5', description: 'Very aggressive quantization', color: 'orange' },
  'Q3_K_L': { quality: 2, speed: 5, bits: '3.5', description: 'Slightly better Q3 variant', color: 'orange' },
  'Q2_K': { quality: 1, speed: 5, bits: '2.5', description: 'Extreme quantization - significant quality loss', color: 'red' },

  // iQuants (importance-weighted)
  'IQ4_XS': { quality: 3, speed: 5, bits: '4.25', description: 'Importance-weighted 4-bit, better quality/size', color: 'blue' },
  'IQ4_NL': { quality: 3, speed: 5, bits: '4.5', description: 'Non-linear importance-weighted 4-bit', color: 'blue' },
  'IQ3_XXS': { quality: 2, speed: 5, bits: '3.0', description: 'Smallest iQuant, aggressive', color: 'orange' },
  'IQ3_XS': { quality: 2, speed: 5, bits: '3.3', description: 'Very small iQuant', color: 'orange' },
  'IQ2_XXS': { quality: 1, speed: 5, bits: '2.0', description: 'Extreme iQuant - experimental', color: 'red' },
};

/** Exact match first, then normalized (uppercase, dashes -> underscores). */
export function getQuantInfo(quantType: string): QuantInfo | null {
  const exact = QUANT_INFO[quantType];
  if (exact) return exact;
  const normalized = quantType.toUpperCase().replace(/-/g, '_');
  return QUANT_INFO[normalized] ?? null;
}
