'use server';

import {
  createPromotionAction as createPromotionActionImpl,
  disablePromotionAction as disablePromotionActionImpl,
  enablePromotionAction as enablePromotionActionImpl,
  listPromotions as listPromotionsImpl,
  searchPromotionOptionsAction as searchPromotionOptionsActionImpl,
} from './billing-admin/promotions';
export type { AdminPromotionRow, ListPromotionsResult } from './billing-admin/promotions';
import {
  createPendingGrantAction as createPendingGrantActionImpl,
  disablePendingGrantAction as disablePendingGrantActionImpl,
  enablePendingGrantAction as enablePendingGrantActionImpl,
  searchPendingGrantOptionsAction as searchPendingGrantOptionsActionImpl,
} from './billing-admin/pending-grants';
import {
  extendOverrideAction as extendOverrideActionImpl,
  grantOverrideAction as grantOverrideActionImpl,
  revokeOverrideAction as revokeOverrideActionImpl,
} from './billing-admin/overrides';
import {
  lookupBillingUserAction as lookupBillingUserActionImpl,
  searchUserEmailOptionsAction as searchUserEmailOptionsActionImpl,
} from './billing-admin/lookup';

export async function createPromotionAction(
  ...args: Parameters<typeof createPromotionActionImpl>
): ReturnType<typeof createPromotionActionImpl> {
  return createPromotionActionImpl(...args);
}

export async function disablePromotionAction(
  ...args: Parameters<typeof disablePromotionActionImpl>
): ReturnType<typeof disablePromotionActionImpl> {
  return disablePromotionActionImpl(...args);
}

export async function enablePromotionAction(
  ...args: Parameters<typeof enablePromotionActionImpl>
): ReturnType<typeof enablePromotionActionImpl> {
  return enablePromotionActionImpl(...args);
}

export async function listPromotions(
  ...args: Parameters<typeof listPromotionsImpl>
): ReturnType<typeof listPromotionsImpl> {
  return listPromotionsImpl(...args);
}

export async function searchPromotionOptionsAction(
  ...args: Parameters<typeof searchPromotionOptionsActionImpl>
): ReturnType<typeof searchPromotionOptionsActionImpl> {
  return searchPromotionOptionsActionImpl(...args);
}

export async function createPendingGrantAction(
  ...args: Parameters<typeof createPendingGrantActionImpl>
): ReturnType<typeof createPendingGrantActionImpl> {
  return createPendingGrantActionImpl(...args);
}

export async function disablePendingGrantAction(
  ...args: Parameters<typeof disablePendingGrantActionImpl>
): ReturnType<typeof disablePendingGrantActionImpl> {
  return disablePendingGrantActionImpl(...args);
}

export async function enablePendingGrantAction(
  ...args: Parameters<typeof enablePendingGrantActionImpl>
): ReturnType<typeof enablePendingGrantActionImpl> {
  return enablePendingGrantActionImpl(...args);
}

export async function searchPendingGrantOptionsAction(
  ...args: Parameters<typeof searchPendingGrantOptionsActionImpl>
): ReturnType<typeof searchPendingGrantOptionsActionImpl> {
  return searchPendingGrantOptionsActionImpl(...args);
}

export async function extendOverrideAction(
  ...args: Parameters<typeof extendOverrideActionImpl>
): ReturnType<typeof extendOverrideActionImpl> {
  return extendOverrideActionImpl(...args);
}

export async function grantOverrideAction(
  ...args: Parameters<typeof grantOverrideActionImpl>
): ReturnType<typeof grantOverrideActionImpl> {
  return grantOverrideActionImpl(...args);
}

export async function revokeOverrideAction(
  ...args: Parameters<typeof revokeOverrideActionImpl>
): ReturnType<typeof revokeOverrideActionImpl> {
  return revokeOverrideActionImpl(...args);
}

export async function lookupBillingUserAction(
  ...args: Parameters<typeof lookupBillingUserActionImpl>
): ReturnType<typeof lookupBillingUserActionImpl> {
  return lookupBillingUserActionImpl(...args);
}

export async function searchUserEmailOptionsAction(
  ...args: Parameters<typeof searchUserEmailOptionsActionImpl>
): ReturnType<typeof searchUserEmailOptionsActionImpl> {
  return searchUserEmailOptionsActionImpl(...args);
}
