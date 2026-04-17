/**
 * Simple module-level store for passing selected member IDs
 * back from select-event-members screen via router.back().
 *
 * Usage:
 * - select-event-members: call setSelectedMemberIds() before router.back()
 * - create-news / create-event: call consumeSelectedMemberIds() on focus
 */

let _selectedMemberIds: string[] | null = null;

export function setSelectedMemberIds(ids: string[]): void {
  _selectedMemberIds = ids;
}

/**
 * Reads and clears the stored member IDs in one call.
 * Returns null if nothing was stored.
 */
export function consumeSelectedMemberIds(): string[] | null {
  const ids = _selectedMemberIds;
  _selectedMemberIds = null;
  return ids;
}
