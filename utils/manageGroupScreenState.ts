export interface ManageGroupLoadingStateInput {
  hasGroup: boolean;
  memberCount: number;
  isGroupDataLoading: boolean;
  loadingTimedOut: boolean;
}

export function shouldShowManageGroupLoading({
  hasGroup,
  memberCount,
  isGroupDataLoading,
  loadingTimedOut,
}: ManageGroupLoadingStateInput): boolean {
  if (loadingTimedOut) return false;
  if (hasGroup) return false;

  if (isGroupDataLoading) return true;

  return memberCount === 0;
}
