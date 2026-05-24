// ClubMembership and GroupMembership now fetched via versioning services

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  phoneNumber?: string | null;
  dateOfBirth?: Date | null;
  emailVerified?: boolean; // Custom email verification status
  personalNumber?: PersonalNumber | null; // Swedish personnummer for LOK-stöd (encrypted)
  // Updated to new access-based structure
  clubAccess: ClubAccess[];
  // Subscription limits (usage tracking)
  activeClubsAsAdmin?: number; // Count of clubs where user is admin with isActive=true
  maxClubsAsAdmin?: number; // Maximum clubs user can be admin of (default: 1)
  groupsCreated?: number;
  events: EventInvitation[];
  eventsResponses: any[]; // TODO: Define proper EventResponses type
  verificationStatus?: "pending" | "verified" | "rejected";
  createdAt?: Date;
  lastActive?: Date;
  version?: number; // Version for cache optimization
  // Youth member relationships
  dependents?: DependentInfo[]; // For guardians - list of youth members they manage
  guardians?: GuardianInfo[]; // For youth members - list of guardians
  // Legal acceptance tracking
  legalAcceptance?: {
    termsVersion: string;
    privacyVersion: string;
    acceptedAt: Date;
    acceptanceMethod: string;
  };

  // ---------------------------------------------------------------------------
  // Flat role arrays — used by Firestore security rules for cheap permission
  // checks (1 cached read on /users/{uid}).  Maintained in sync with clubAccess
  // by every Cloud Function that writes clubAccess / groupAccess.
  // ---------------------------------------------------------------------------
  adminOfClubs?: string[]; // clubIds where role === "club-admin"
  memberOfClubs?: string[]; // clubIds where role === "member"
  adminOfGroups?: string[]; // groupIds where roles includes "admin"
  coachOfGroups?: string[]; // groupIds where roles includes "coach"
  memberOfGroups?: string[]; // ALL groupIds the user has any role in
  guardianOfGroups?: string[]; // groupIds where roles includes "guardian"

  // ---------------------------------------------------------------------------
  // RF (Riksidrottsförbundet) — resolved lazily at LOK submission time, not onboarding.
  // ---------------------------------------------------------------------------
  rfPersonId?: string; // RF universal person UUID (one per person across all Swedish sports)

  // ---------------------------------------------------------------------------
  // Platform admin — set manually in Firestore; gates RF integration toggle.
  // ---------------------------------------------------------------------------
  platformAdmin?: boolean; // Only Clubnizer staff. Allows enabling RF integration for clubs.
}

// Dependent (youth member) info stored in guardian's document
export interface DependentInfo {
  uid: string; // Youth member's UID
  childName: string;
  relationship: string;
  addedAt: Date;
  clubAccess?: ClubAccess[]; // Youth's club and group access (synced from youth's profile)
}

// Guardian info stored in youth member's document
export interface GuardianInfo {
  uid: string; // Guardian's UID
  name: string;
  email: string;
  phoneNumber?: string;
  relationship: string;
  addedAt: Date;
}

// New access interfaces for user document
export interface ClubAccess {
  clubId: string;
  clubName: string;
  role: "club-admin" | "member"; // role in the club - matches ARCHITECTURE.md
  joinedAt: Date;
  lastModifiedAt: Date;
  isActive?: boolean; // false when club is soft-deleted
  deletionScheduledAt?: Date; // when permanent deletion will occur
  groupAccess?: GroupAccess[]; // nested group access within this club
}

export interface GroupAccess {
  groupId: string;
  groupName: string;
  roles: string[]; // roles in the group (e.g., ['player', 'coach', 'admin', 'guardian'])
  joinedAt: Date;
  lastModifiedAt: Date;
  isActive?: boolean; // false when group is soft-deleted
  deletionScheduledAt?: Date; // when permanent deletion will occur
}

export interface EventInvitation {
  eventId: string;
  response: "not replied" | "accepted" | "declined";
  invitedAt?: Date;
  respondedAt?: Date;
}

export interface ProfilePictureUploadResult {
  success: boolean;
  photoURL?: string;
  error?: string;
}

// --- RF Integration Types (Swedish LOK-stöd) ---

// Personnummer stored encrypted on user document
export interface PersonalNumber {
  encrypted: string; // AES-256 encrypted personnummer (YYYYMMDDXXXX)
  birthDate: string; // First 8 digits for display — less sensitive than last 4 (e.g. "19850112")
  providedAt: Date; // When first provided
  updatedAt?: Date; // When last modified (undefined if never edited)
  consentAt: Date; // When explicit LOK consent was given
  consentVersion: string; // e.g. "LOK_CONSENT_2026.1"
}

// RF integration config on club document
export interface RfIntegration {
  organizationNumber: string; // Swedish org.nr (XXXXXX-XXXX)
  rfOrganizationId?: string; // RF förenings-ID (from IdrottOnline)
  districtId?: string; // Specialdistriktsförbund (SDF)
  municipality?: string; // Kommun — needed for LOK & kommun reporting
  integrationEnabled: boolean; // Whether RF direct API submission is active for this club
  lastSyncAt?: Date; // Last successful API sync
  integrationStatus?: "pending" | "active" | "error";
  // Phase 1: feature flag audit trail — who enabled it and when
  setupStatus?:
    | "not-configured"
    | "configured"
    | "pending-idrottonline-approval"
    | "active";
  enabledByRole?: "platform-admin" | "club-admin"; // who toggled integrationEnabled
  enabledAt?: Date; // when integrationEnabled was last set to true
  enabledBy?: string; // uid of the user who last toggled integrationEnabled
}

// LOK reporting metadata on event document
export interface LokReporting {
  eligible: boolean; // Is this a LOK-eligible activity?
  durationMinutes?: number; // Calculated/stored activity duration
  reportedAt?: Date; // When submitted to RF
  reportingPeriod?: string; // e.g. "2026-H1" or "2026-H2"
  reportId?: string; // Reference to lokReports/{id}
}

// LOK report snapshot — top-level collection
export interface LokReport {
  clubId: string;
  clubName: string;
  organizationNumber: string; // Snapshot of club org.nr at report time
  period: string; // "2026-H1" or "2026-H2"
  periodStart: Date;
  periodEnd: Date;
  status: "draft" | "submitted" | "accepted" | "rejected";
  totalActivities: number;
  totalParticipants: number; // Unique participants
  totalLeaders: number; // Unique leaders
  activities: LokReportActivity[];
  submittedAt?: Date;
  submittedBy?: string;
  rfReceiptId?: string; // RF API response ID
  rfErrors?: string[]; // Validation errors from RF
  createdAt: Date;
  lastUpdatedAt: Date;
}

// Activity entry within a LOK report snapshot
export interface LokReportActivity {
  eventId: string; // Reference to source event
  date: Date;
  durationMinutes: number;
  activityType: string; // e.g. "training", "match"
  sport: string; // From group's sport field
  groupId: string;
  groupName: string;
  participants: LokParticipant[];
  participantCount: number;
}

// Participant entry within a LOK report activity
export interface LokParticipant {
  userId: string;
  personalNumber: string; // Decrypted personnummer for RF submission
  role: "participant" | "leader";
  ageAtActivity: number; // Calculated from personnummer
}
