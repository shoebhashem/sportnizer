import { shouldShowManageGroupLoading } from "../../utils/manageGroupScreenState";

describe("manage-group screen loading state", () => {
  it("shows loading while context is loading and group is not resolved", () => {
    const result = shouldShowManageGroupLoading({
      hasGroup: false,
      memberCount: 0,
      isGroupDataLoading: true,
      loadingTimedOut: false,
    });

    expect(result).toBe(true);
  });

  it("stops loading after timeout when group is still unresolved", () => {
    const result = shouldShowManageGroupLoading({
      hasGroup: false,
      memberCount: 0,
      isGroupDataLoading: true,
      loadingTimedOut: true,
    });

    expect(result).toBe(false);
  });

  it("does not show loading when group is available", () => {
    const result = shouldShowManageGroupLoading({
      hasGroup: true,
      memberCount: 0,
      isGroupDataLoading: true,
      loadingTimedOut: false,
    });

    expect(result).toBe(false);
  });

  it("does not show loading when members are available even without group doc", () => {
    const result = shouldShowManageGroupLoading({
      hasGroup: false,
      memberCount: 5,
      isGroupDataLoading: false,
      loadingTimedOut: false,
    });

    expect(result).toBe(false);
  });
});
