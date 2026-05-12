/**
 * Club Permissions Types
 *
 * Defines the extensible per-club role-visibility configuration stored at
 * `clubs/{clubId}/settings/permissions` in Firestore.
 *
 * Design principles:
 * - Domain-namespaced: each feature area (events, news, …) has its own sub-object
 * - Backward-compatible: missing fields always fall back to DEFAULT_PERMISSIONS
 * - Extensible: add new domains without breaking existing clubs
 */

/** Controls which roles see all items in a domain beyond their own invitations */
export interface DomainVisibility {
  /** Club admins see all items club-wide */
  clubAdmin: boolean;
  /** Group admins see all items in groups they administer */
  groupAdmin: boolean;
  /** Group coaches see all items in groups they coach */
  coach: boolean;
}

export interface EventsPermissions {
  visibility: DomainVisibility;
}

export interface NewsPermissions {
  visibility: DomainVisibility;
}

/** Top-level permissions document shape (clubs/{clubId}/settings/permissions) */
export interface ClubPermissions {
  events?: Partial<EventsPermissions>;
  news?: Partial<NewsPermissions>;
  /** Reserved for future domains */
  members?: Record<string, unknown>;
  fees?: Record<string, unknown>;
  updatedAt?: any;
  updatedBy?: string;
}

/**
 * Default permissions applied when a club has no settings document or a
 * specific field is missing. Club admins and group admins can see all events;
 * coaches cannot (toggle off by default).
 */
export const DEFAULT_PERMISSIONS: {
  events: EventsPermissions;
  news: NewsPermissions;
  members: Record<string, unknown>;
  fees: Record<string, unknown>;
} = {
  events: {
    visibility: {
      clubAdmin: true,
      groupAdmin: true,
      coach: false,
    },
  },
  news: {
    visibility: {
      clubAdmin: true,
      groupAdmin: true,
      coach: false,
    },
  },
  members: {},
  fees: {},
};

/** Resolve effective permissions for a club, merging with defaults */
export function resolveClubPermissions(
  stored: ClubPermissions | undefined | null,
): typeof DEFAULT_PERMISSIONS {
  return {
    events: {
      visibility: {
        ...DEFAULT_PERMISSIONS.events.visibility,
        ...stored?.events?.visibility,
      },
    },
    news: {
      visibility: {
        ...DEFAULT_PERMISSIONS.news.visibility,
        ...stored?.news?.visibility,
      },
    },
    members: stored?.members ?? {},
    fees: stored?.fees ?? {},
  };
}
