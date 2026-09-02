'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_FACTS, interpolate, type Facts } from '../interpolate';

const FactsContext = createContext<Facts>({ ...DEFAULT_FACTS });

export const FactsProvider = FactsContext.Provider;

/** The facts in scope (DEFAULT_FACTS outside a GuideRenderer). */
export function useFacts(): Facts {
  return useContext(FactsContext);
}

/** `interpolate` bound to the facts in scope. */
export function useInterpolate(): (text: string) => string {
  const facts = useFacts();
  return (text: string) => interpolate(text, facts);
}
