// /hooks/useOnboardingFeatureTracker.ts — Hook to track feature usage for onboarding
//
// Drop this into any screen/component to automatically mark a feature as seen
// when the component mounts or when a specific condition is met.
// This is the primary integration point for progressive onboarding.

import { useOnboarding } from "@/contexts/OnboardingContext";
import { useCallback, useEffect } from "react";

/**
 * Automatically marks a feature as seen when the component mounts.
 * Useful for "first time visiting a screen" tracking.
 *
 * @param featureKey - The feature key to mark (e.g., "payments-viewed")
 * @param options.enabled - Only track when true (default: true)
 */
export function useTrackFeatureOnMount(
  featureKey: string,
  options?: { enabled?: boolean },
) {
  const { markFeatureSeen, isLoading } = useOnboarding();
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!isLoading && enabled) {
      markFeatureSeen(featureKey);
    }
  }, [isLoading, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Returns a callback that marks a feature as seen when called.
 * Use this for action-based tracking (e.g., after creating an event).
 *
 * @param featureKey - The feature key to mark
 */
export function useTrackFeatureOnAction(featureKey: string) {
  const { markFeatureSeen } = useOnboarding();

  return useCallback(() => {
    markFeatureSeen(featureKey);
  }, [featureKey, markFeatureSeen]);
}

/**
 * Returns whether a feature has been seen.
 *
 * @param featureKey - The feature key to check
 */
export function useHasSeenFeature(featureKey: string): boolean {
  const { hasSeenFeature } = useOnboarding();
  return hasSeenFeature(featureKey);
}
