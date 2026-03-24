// /services/onboarding/onboardingStorage.ts — AsyncStorage persistence layer

import AsyncStorage from "@react-native-async-storage/async-storage";
import { INITIAL_ONBOARDING_STATE, type OnboardingState } from "./types";

const STORAGE_KEY = "@clubnizer_onboarding";

/**
 * Build a per-user storage key.
 * Keeping state user-scoped so multi-account devices work correctly.
 */
function userKey(uid: string): string {
  return `${STORAGE_KEY}_${uid}`;
}

/**
 * Load persisted onboarding state for a user.
 * Returns INITIAL_ONBOARDING_STATE if nothing is stored.
 */
export async function loadOnboardingState(
  uid: string,
): Promise<OnboardingState> {
  try {
    const raw = await AsyncStorage.getItem(userKey(uid));
    if (!raw) return { ...INITIAL_ONBOARDING_STATE };
    const parsed = JSON.parse(raw) as OnboardingState;
    // Merge with defaults in case we add new fields in future versions
    return {
      ...INITIAL_ONBOARDING_STATE,
      ...parsed,
    };
  } catch {
    return { ...INITIAL_ONBOARDING_STATE };
  }
}

/**
 * Persist onboarding state for a user.
 */
export async function saveOnboardingState(
  uid: string,
  state: OnboardingState,
): Promise<void> {
  try {
    const toSave: OnboardingState = {
      ...state,
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(userKey(uid), JSON.stringify(toSave));
  } catch {
    // Silently fail — onboarding is non-critical
    if (__DEV__) console.warn("[Onboarding] Failed to save state");
  }
}

/**
 * Clear onboarding state for a user (e.g., on account deletion).
 */
export async function clearOnboardingState(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(userKey(uid));
  } catch {
    // noop
  }
}
