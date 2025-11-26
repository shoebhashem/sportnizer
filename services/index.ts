// /services/index.ts - Central exports for new thin services
// These services orchestrate calls to atomic Firebase Functions

export { clubService } from './club';
export { eventService } from './event';
export { groupService } from './group';
export { memberService } from './member';

// Orchestrating services - coordinate multiple atomic functions
export * from './orchestration';

// Read-only member fetching services
export { fetchClubMembers, getClubMemberCount } from './fetchClubMembers';
export {
    fetchEventMembers, getAcceptedMembers,
    getDeclinedMembers, getEventResponseStats, getPendingMembers
} from './fetchEventMembers';
export { fetchGroupMembers, fetchSubGroupMembers, getGroupMemberCount } from './fetchGroupMembers';

// User access permissions service
export {
    canUserManageGroup, fetchUserAccess, fetchUserProfile, getUserAccessSummary, getUserAdminClubs, hasUserGroupRole, isUserClubAdmin
} from './fetchUserAccess';

// Keep existing essential services
export { signInUser, signOutUser, signUpUser } from './auth/authService';

// Export types
export * from './types';
