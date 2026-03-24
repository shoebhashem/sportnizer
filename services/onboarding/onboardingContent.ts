// /services/onboarding/onboardingContent.ts — Tooltip definitions
//
// Centralised registry of contextual tooltips.
// Everything references i18n keys so it is fully translatable.

import type {
  OnboardingRole,
  TooltipDefinition,
} from "./types";

// ============================================================================
// CONTEXTUAL TOOLTIPS
// ============================================================================

export const TOOLTIP_DEFINITIONS: TooltipDefinition[] = [
  // ---- Attendance ----
  {
    id: "tooltip-attendance-first",
    titleKey: "onboarding.tooltips.attendance.title",
    bodyKey: "onboarding.tooltips.attendance.body",
    screen: "event-details",
    roles: ["club-admin", "admin", "coach"],
    placement: "bottom",
    featureKey: "attendance-recorded",
  },
  // ---- Payments / Fees ----
  {
    id: "tooltip-payments-first",
    titleKey: "onboarding.tooltips.payments.title",
    bodyKey: "onboarding.tooltips.payments.body",
    screen: "track-payments",
    roles: ["club-admin"],
    placement: "bottom",
    featureKey: "payments-viewed",
  },
  // ---- Create event ----
  {
    id: "tooltip-create-event",
    titleKey: "onboarding.tooltips.createEvent.title",
    bodyKey: "onboarding.tooltips.createEvent.body",
    screen: "events",
    roles: ["club-admin", "admin", "coach"],
    placement: "bottom",
    featureKey: "event-created",
  },
  // ---- Manage group ----
  {
    id: "tooltip-manage-group",
    titleKey: "onboarding.tooltips.manageGroup.title",
    bodyKey: "onboarding.tooltips.manageGroup.body",
    screen: "manage-group",
    roles: ["club-admin", "admin"],
    placement: "top",
    featureKey: "group-managed",
  },
  // ---- News ----
  {
    id: "tooltip-news-first",
    titleKey: "onboarding.tooltips.news.title",
    bodyKey: "onboarding.tooltips.news.body",
    screen: "news",
    roles: ["player", "player-underage", "guardian"],
    placement: "bottom",
    featureKey: "news-viewed",
  },
  // ---- Event response (player/guardian) ----
  {
    id: "tooltip-event-response",
    titleKey: "onboarding.tooltips.eventResponse.title",
    bodyKey: "onboarding.tooltips.eventResponse.body",
    screen: "event-details",
    roles: ["player", "player-underage", "guardian"],
    placement: "bottom",
    featureKey: "event-responded",
  },
  // ---- Statistics ----
  {
    id: "tooltip-statistics",
    titleKey: "onboarding.tooltips.statistics.title",
    bodyKey: "onboarding.tooltips.statistics.body",
    screen: "view-statistics",
    roles: ["club-admin", "admin", "coach"],
    placement: "top",
    featureKey: "statistics-viewed",
  },
  // ---- Create news ----
  {
    id: "tooltip-create-news",
    titleKey: "onboarding.tooltips.createNews.title",
    bodyKey: "onboarding.tooltips.createNews.body",
    screen: "news",
    roles: ["club-admin", "admin", "coach"],
    placement: "bottom",
    featureKey: "news-created",
  },
  // ---- Subgroups ----
  {
    id: "tooltip-subgroups",
    titleKey: "onboarding.tooltips.subgroups.title",
    bodyKey: "onboarding.tooltips.subgroups.body",
    screen: "manage-group",
    roles: ["club-admin", "admin", "coach"],
    placement: "bottom",
    featureKey: "subgroup-viewed",
  },
];

/**
 * Returns tooltip definitions for a given screen and role,
 * excluding already-seen tooltips.
 */
export function getTooltipsForScreen(
  screen: string,
  role: OnboardingRole,
  seenTooltips: string[],
  seenFeatures: string[],
): TooltipDefinition[] {
  return TOOLTIP_DEFINITIONS.filter((t) => {
    if (t.screen !== screen) return false;
    if (!t.roles.includes(role)) return false;
    if (seenTooltips.includes(t.id)) return false;
    if (t.featureKey && seenFeatures.includes(t.featureKey)) return false;
    return true;
  });
}
