export interface GroupSettingsLoadingStateInput {
  hasGroup: boolean;
  loadingTimedOut: boolean;
}

export function shouldShowGroupSettingsLoading({
  hasGroup,
  loadingTimedOut,
}: GroupSettingsLoadingStateInput): boolean {
  if (loadingTimedOut) return false;
  if (hasGroup) return false;
  return true;
}
