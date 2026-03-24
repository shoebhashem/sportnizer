// /services/onboarding/types.ts — Core types for the onboarding system

/**
 * All possible user roles, ordered from highest to lowest privilege.
 */
export type OnboardingRole =
  | "club-admin"
  | "admin"
  | "coach"
  | "guardian"
  | "player"
  | "player-underage"
  | "member"
  | "none";

/** Hierarchy order for role comparison (lower index = higher privilege). */
export const ROLE_HIERARCHY: OnboardingRole[] = [
  "club-admin",
  "admin",
  "coach",
  "guardian",
  "player",
  "player-underage",
  "member",
  "none",
];

// ---------------------------------------------------------------------------
// Tooltip / CoachMark definitions
// ---------------------------------------------------------------------------

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export interface TooltipDefinition {
  /** Unique ID persisted in seen-tooltips set */
  id: string;
  /** i18n key for tooltip title */
  titleKey: string;
  /** i18n key for tooltip body */
  bodyKey: string;
  /** Which screen/route this tooltip is relevant to */
  screen: string;
  /** Roles that should see this tooltip */
  roles: OnboardingRole[];
  /** Preferred placement */
  placement?: TooltipPlacement;
  /** Feature key that must NOT have been seen before */
  featureKey?: string;
}

// ---------------------------------------------------------------------------
// Persisted state
// ---------------------------------------------------------------------------

export interface OnboardingState {
  /** Set of tooltip IDs the user has dismissed */
  tooltipsSeen: string[];
  /** Set of feature keys the user has interacted with */
  featuresSeen: string[];
  /** Timestamp of last state update */
  updatedAt: number;
}

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  tooltipsSeen: [],
  featuresSeen: [],
  updatedAt: 0,
};
