import { shouldShowGroupSettingsLoading } from "../../utils/groupSettingsScreenState";

describe("group-settings screen loading state", () => {
  it("shows loading when group is not available and timeout has not elapsed", () => {
    const result = shouldShowGroupSettingsLoading({
      hasGroup: false,
      loadingTimedOut: false,
    });

    expect(result).toBe(true);
  });

  it("stops loading after timeout even when group is still unavailable", () => {
    const result = shouldShowGroupSettingsLoading({
      hasGroup: false,
      loadingTimedOut: true,
    });

    expect(result).toBe(false);
  });

  it("does not show loading when group is available", () => {
    const result = shouldShowGroupSettingsLoading({
      hasGroup: true,
      loadingTimedOut: false,
    });

    expect(result).toBe(false);
  });

  it("does not show loading when group is available even if timed out", () => {
    const result = shouldShowGroupSettingsLoading({
      hasGroup: true,
      loadingTimedOut: true,
    });

    expect(result).toBe(false);
  });
});
