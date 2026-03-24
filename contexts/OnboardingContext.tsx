// /contexts/OnboardingContext.tsx - Lightweight onboarding state & role detection
//
// Provides feature-seen tracking, tooltip management, and role detection.
// Used by FeatureHighlight, ScreenTooltipManager, and useOnboardingFeatureTracker.

import {
  getActiveClubIds,
  getHighestRole,
} from "@/utils/permissionHelpers";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useUser } from "./UserContext";

import {
  getTooltipsForScreen,
  INITIAL_ONBOARDING_STATE,
  loadOnboardingState,
  saveOnboardingState,
  type OnboardingRole,
  type OnboardingState,
  type TooltipDefinition,
} from "@/services/onboarding";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface OnboardingContextValue {
  isLoading: boolean;
  currentRole: OnboardingRole;
  getTooltips: (screen: string) => TooltipDefinition[];
  dismissTooltip: (tooltipId: string) => void;
  markFeatureSeen: (featureKey: string) => void;
  hasSeenFeature: (featureKey: string) => boolean;
  resetOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userProfile } = useUser();
  const uid = userProfile?.uid ?? null;

  const [state, setState] = useState<OnboardingState>(INITIAL_ONBOARDING_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const loadedUidRef = useRef<string | null>(null);

  // Derive the current highest role from userProfile
  const currentRole: OnboardingRole = useMemo(() => {
    if (!userProfile) return "none";
    const clubIds = getActiveClubIds(userProfile);
    if (clubIds.length === 0) return "none";

    let highest: OnboardingRole = "none";
    const hierarchy: OnboardingRole[] = [
      "club-admin", "admin", "coach", "guardian",
      "player", "player-underage", "member",
    ];

    for (const clubId of clubIds) {
      const role = getHighestRole(userProfile, clubId) as OnboardingRole | null;
      if (role) {
        const currentIdx = hierarchy.indexOf(highest);
        const newIdx = hierarchy.indexOf(role);
        if (newIdx !== -1 && (currentIdx === -1 || newIdx < currentIdx)) {
          highest = role;
        }
      }
    }
    return highest;
  }, [userProfile]);

  // Load persisted state when uid changes
  useEffect(() => {
    if (!uid) {
      setState(INITIAL_ONBOARDING_STATE);
      loadedUidRef.current = null;
      setIsLoading(false);
      return;
    }
    if (loadedUidRef.current === uid) return;
    let cancelled = false;
    setIsLoading(true);
    loadOnboardingState(uid).then((loaded) => {
      if (cancelled) return;
      setState(loaded);
      loadedUidRef.current = uid;
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [uid]);

  // Auto-persist on state changes (debounced)
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!uid || isLoading) return;
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      saveOnboardingState(uid, state);
    }, 500);
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    };
  }, [state, uid, isLoading]);

  // Actions
  const dismissTooltip = useCallback((tooltipId: string) => {
    setState((prev) => {
      if (prev.tooltipsSeen.includes(tooltipId)) return prev;
      return { ...prev, tooltipsSeen: [...prev.tooltipsSeen, tooltipId] };
    });
  }, []);

  const markFeatureSeen = useCallback((featureKey: string) => {
    setState((prev) => {
      if (prev.featuresSeen.includes(featureKey)) return prev;
      return { ...prev, featuresSeen: [...prev.featuresSeen, featureKey] };
    });
  }, []);

  const hasSeenFeature = useCallback(
    (featureKey: string) => state.featuresSeen.includes(featureKey),
    [state.featuresSeen],
  );

  const resetOnboarding = useCallback(() => {
    setState({ ...INITIAL_ONBOARDING_STATE });
    if (uid) saveOnboardingState(uid, INITIAL_ONBOARDING_STATE);
  }, [uid]);

  // Derived
  const getTooltips = useCallback(
    (screen: string) =>
      getTooltipsForScreen(screen, currentRole, state.tooltipsSeen, state.featuresSeen),
    [currentRole, state.tooltipsSeen, state.featuresSeen],
  );

  const value: OnboardingContextValue = useMemo(
    () => ({ isLoading, currentRole, getTooltips, dismissTooltip, markFeatureSeen, hasSeenFeature, resetOnboarding }),
    [isLoading, currentRole, getTooltips, dismissTooltip, markFeatureSeen, hasSeenFeature, resetOnboarding],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within <OnboardingProvider>");
  return ctx;
}
