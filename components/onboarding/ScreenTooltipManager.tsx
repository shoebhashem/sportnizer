// /components/onboarding/ScreenTooltipManager.tsx — Auto-shows tooltips for a screen
//
// Drop this component onto any screen to automatically show relevant
// contextual tooltips based on the user's role and progress.
// Only shows ONE tooltip at a time, queued in order.

import { useOnboarding } from "@/contexts/OnboardingContext";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Tooltip } from "./Tooltip";

interface ScreenTooltipManagerProps {
  /** The screen name (must match the `screen` field in TooltipDefinitions) */
  screen: string;
  /** Delay before showing the first tooltip (ms). Default: 800 */
  delay?: number;
}

export function ScreenTooltipManager({
  screen,
  delay = 800,
}: ScreenTooltipManagerProps) {
  const { getTooltips, dismissTooltip, isLoading } = useOnboarding();
  const { t } = useTranslation("components");

  const tooltips = useMemo(() => getTooltips(screen), [getTooltips, screen]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [ready, setReady] = useState(false);

  // Delay before showing the first tooltip for a non-jarring experience
  useEffect(() => {
    if (isLoading || tooltips.length === 0) return;

    const timer = setTimeout(() => {
      setReady(true);
      setActiveIndex(0);
    }, delay);

    return () => clearTimeout(timer);
  }, [isLoading, tooltips.length, delay]);

  if (!ready || activeIndex < 0 || activeIndex >= tooltips.length) {
    return null;
  }

  const current = tooltips[activeIndex];

  return (
    <Tooltip
      visible
      title={t(current.titleKey)}
      body={t(current.bodyKey)}
      placement={current.placement}
      icon={undefined}
      onDismiss={() => {
        dismissTooltip(current.id);
        // Show next tooltip, or close
        if (activeIndex < tooltips.length - 1) {
          setActiveIndex(activeIndex + 1);
        } else {
          setActiveIndex(-1);
        }
      }}
    />
  );
}
