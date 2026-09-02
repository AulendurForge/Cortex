/**
 * ArchitectureCompatibility - Gap #11: GGUF Compatibility Matrix
 *
 * Displays architecture compatibility information for vLLM and llama.cpp engines.
 * Helps users understand what level of support their model architecture has.
 * The matrix and the name normalisation live in architectureCompatibility.ts.
 */

import React from 'react';
import { getArchCompatibility, type SupportLevel } from './architectureCompatibility';

/**
 * Get support level badge color
 */
function getSupportColor(level: SupportLevel): string {
  switch (level) {
    case 'full':
      return 'bg-green-500/10 text-green-300 border-green-500/20';
    case 'partial':
      return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
    case 'experimental':
      return 'bg-orange-500/10 text-orange-300 border-orange-500/20';
    case 'none':
      return 'bg-red-500/10 text-red-300 border-red-500/20';
    default:
      return 'bg-gray-500/10 text-gray-300 border-gray-500/20';
  }
}

/**
 * Get support level icon
 */
function getSupportIcon(level: SupportLevel): string {
  switch (level) {
    case 'full':
      return '✓';
    case 'partial':
      return '◐';
    case 'experimental':
      return '⚡';
    case 'none':
      return '✗';
    default:
      return '?';
  }
}

/**
 * Get support level label
 */
function getSupportLabel(level: SupportLevel): string {
  switch (level) {
    case 'full':
      return 'Full Support';
    case 'partial':
      return 'Partial';
    case 'experimental':
      return 'Experimental';
    case 'none':
      return 'Not Supported';
    default:
      return 'Unknown';
  }
}

interface ArchitectureCompatibilityBadgeProps {
  architecture: string | null | undefined;
  engine?: 'vllm' | 'llamacpp' | 'both';
  compact?: boolean;
}

/**
 * Display a compatibility badge for a specific architecture and engine
 */
export function ArchitectureCompatibilityBadge({ 
  architecture, 
  engine = 'both',
  compact = false 
}: ArchitectureCompatibilityBadgeProps) {
  if (!architecture) return null;
  
  const compat = getArchCompatibility(architecture);
  
  if (engine === 'both') {
    return (
      <div className="flex items-center gap-1.5">
        <span 
          className={`px-1.5 py-0.5 rounded border text-[10px] ${getSupportColor(compat.vllm)}`}
          title={`vLLM: ${getSupportLabel(compat.vllm)}${compat.notes ? ` - ${compat.notes}` : ''}`}
        >
          {getSupportIcon(compat.vllm)} vLLM
        </span>
        <span 
          className={`px-1.5 py-0.5 rounded border text-[10px] ${getSupportColor(compat.llamacpp)}`}
          title={`llama.cpp: ${getSupportLabel(compat.llamacpp)}${compat.notes ? ` - ${compat.notes}` : ''}`}
        >
          {getSupportIcon(compat.llamacpp)} llama.cpp
        </span>
      </div>
    );
  }
  
  const level = engine === 'vllm' ? compat.vllm : compat.llamacpp;
  const engineLabel = engine === 'vllm' ? 'vLLM' : 'llama.cpp';
  
  if (compact) {
    return (
      <span 
        className={`px-1.5 py-0.5 rounded border text-[10px] ${getSupportColor(level)}`}
        title={`${engineLabel}: ${getSupportLabel(level)}${compat.notes ? ` - ${compat.notes}` : ''}`}
      >
        {getSupportIcon(level)}
      </span>
    );
  }
  
  return (
    <span 
      className={`px-1.5 py-0.5 rounded border text-[10px] ${getSupportColor(level)}`}
      title={`${engineLabel}: ${getSupportLabel(level)}${compat.notes ? ` - ${compat.notes}` : ''}`}
    >
      {getSupportIcon(level)} {getSupportLabel(level)}
    </span>
  );
}

interface ArchitectureCompatibilityInfoProps {
  architecture: string | null | undefined;
  selectedEngine?: 'vllm' | 'llamacpp';
}

/**
 * Display compatibility info with warning if selected engine has issues
 */
export function ArchitectureCompatibilityInfo({ 
  architecture, 
  selectedEngine 
}: ArchitectureCompatibilityInfoProps) {
  if (!architecture) return null;
  
  const compat = getArchCompatibility(architecture);
  const selectedLevel = selectedEngine === 'vllm' ? compat.vllm : selectedEngine === 'llamacpp' ? compat.llamacpp : null;
  const otherEngine = selectedEngine === 'vllm' ? 'llamacpp' : 'vllm';
  const otherLevel = selectedEngine === 'vllm' ? compat.llamacpp : compat.vllm;
  
  // Show warning if selected engine has issues but other engine is better
  const showWarning = selectedEngine && (selectedLevel === 'none' || selectedLevel === 'partial' || selectedLevel === 'experimental') && 
                      (otherLevel === 'full' || (selectedLevel === 'none' && otherLevel !== 'none'));
  
  return (
    <div className="space-y-1">
      {/* Compatibility badges */}
      <ArchitectureCompatibilityBadge architecture={architecture} />
      
      {/* Warning message */}
      {showWarning && (
        <div className={`text-[11px] px-2 py-1 rounded border ${
          selectedLevel === 'none' 
            ? 'bg-red-500/10 text-red-300 border-red-500/20' 
            : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
        }`}>
          {selectedLevel === 'none' ? '⚠️' : '💡'} This architecture has {getSupportLabel(selectedLevel!).toLowerCase()} in {selectedEngine === 'vllm' ? 'vLLM' : 'llama.cpp'}
          {otherLevel === 'full' && `, but full support in ${otherEngine === 'vllm' ? 'vLLM' : 'llama.cpp'}`}.
          {compat.notes && ` Note: ${compat.notes}`}
        </div>
      )}
    </div>
  );
}

