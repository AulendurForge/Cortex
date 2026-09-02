/**
 * Every guide tab that is content-as-data. Tabs still written as TSX live in
 * app/(admin)/guide/sections and are ported here one at a time.
 */
import type { GuideTab } from '../types';
import { gettingStarted, welcomeTab, firstModelTab, diagnosticsTab } from './gettingStarted';
import { aboutTab } from './about';

export { gettingStarted, welcomeTab, firstModelTab, diagnosticsTab, STARTER_MODELS, starterModelFacts, DIAGNOSTIC_CHECKS, TUTORIAL_HREF } from './gettingStarted';
export type { StarterModel, StarterModelId } from './gettingStarted';
export { aboutTab } from './about';

/** Flat list of all data-driven tabs (sub-tabs included) — what the content tests walk. */
export const ALL_GUIDE_TABS: GuideTab[] = [welcomeTab, firstModelTab, diagnosticsTab, aboutTab];

export const GUIDE_GROUPS = { gettingStarted };
