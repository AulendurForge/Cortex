/**
 * Every guide tab that is content-as-data. Tabs still written as TSX live in
 * app/(admin)/guide/sections and are ported here one at a time.
 */
import type { GuideTab } from '../types';
import { gettingStarted, welcomeTab, firstModelTab, diagnosticsTab } from './gettingStarted';
import { aboutTab } from './about';
import { apiKeysTab } from './apiKeys';
import { usageTab } from './usage';
import { chatTab } from './chat';
import { transferTab } from './transfer';
import { usersOrgsTab } from './usersOrgs';
import { manageModels } from './models';

export { gettingStarted, welcomeTab, firstModelTab, diagnosticsTab, STARTER_MODELS, starterModelFacts, DIAGNOSTIC_CHECKS, TUTORIAL_HREF } from './gettingStarted';
export type { StarterModel, StarterModelId } from './gettingStarted';
export { aboutTab } from './about';
export { apiKeysTab } from './apiKeys';
export { usageTab } from './usage';
export { chatTab } from './chat';
export { transferTab } from './transfer';
export { usersOrgsTab } from './usersOrgs';
export { manageModels, SPEC_FLAG_TIPS, VLLM_RECIPES_URL, overviewTab, enginesTab, addingTab, configTab, operationsTab, recipesTab, troubleshootingTab } from './models';

/** Flat list of all data-driven tabs (sub-tabs included) — what the content tests walk. */
export const ALL_GUIDE_TABS: GuideTab[] = [welcomeTab, firstModelTab, diagnosticsTab, aboutTab, apiKeysTab, usageTab, usersOrgsTab, chatTab, transferTab, ...manageModels.tabs];

export const GUIDE_GROUPS = { gettingStarted, manageModels };
