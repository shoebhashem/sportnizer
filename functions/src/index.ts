import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();

// Authentication Functions (DO NOT MODIFY)
export { createUserAccount } from "./auth/createUserAccount";
export { getUserByEmail } from "./auth/getUserByEmail";
export { getUserProfile } from "./auth/getUserProfile";
export { resendVerificationEmail } from "./auth/resendVerificationEmail";
export { sendEmailVerification } from "./auth/sendEmailVerification";
export { updateUserProfile } from "./auth/updateUserProfile";
export { verifyEmail } from "./auth/verifyEmail";

// Club Management Functions (Atomic)
export { createClub } from "./clubs/createClub";
export { deleteClub } from "./clubs/deleteClub";
export { getClub } from "./clubs/getClub";
export { getClubMembers } from "./clubs/getClubMembers";
export { reactivateClub } from "./clubs/reactivateClub";
export { updateClub } from "./clubs/updateClub";
export { updateUserClubDeletion } from "./clubs/updateUserClubDeletion";
export { uploadClubLogo } from "./clubs/uploadClubLogo";

// Group Management Functions (Atomic)
export { createGroup } from "./groups/createGroup";
export { createSubGroup } from "./groups/createSubGroup";
export { deleteGroup } from "./groups/deleteGroup";
export { deleteSubGroup } from "./groups/deleteSubGroup";
export { getGroup } from "./groups/getGroup";
export { getGroupMembers } from "./groups/getGroupMembers";
export { getSubgroup } from "./groups/getSubgroup";
export { getSubgroupMembers } from "./groups/getSubgroupMembers";
export { getSubGroups } from "./groups/getSubGroups";
export { reactivateGroup } from "./groups/reactivateGroup";
export { updateGroup } from "./groups/updateGroup";
export { updateSubGroup } from "./groups/updateSubGroup";
export { updateUserGroupDeletion } from "./groups/updateUserGroupDeletion";

// Event Management Functions (Atomic)
export { createEvent } from "./events/createEvent";
export { deleteEvent } from "./events/deleteEvent";
export { getEvent } from "./events/getEvent";
export { updateEvent } from "./events/updateEvent";

// Event Management V2 Functions (Enhanced with notifications & statistics)
export { cleanupOldStatistics } from "./events/cleanupOldStatistics";
export { createEventV2 } from "./events/createEventV2";
export { getStatistics } from "./events/getStatistics";
export { recordAttendance } from "./events/recordAttendance";
export { updateEventResponse } from "./events/updateEventResponse";
export { updateStatistics } from "./events/updateStatistics";

// Member Management Functions (Atomic - Direct Member Operations)
export { addMemberToClub } from "./members/addMemberToClub";
export { addMemberToGroup } from "./members/addMemberToGroup";
export { addMemberToSubGroup } from "./members/addMemberToSubGroup";
export { checkMembership } from "./members/checkMembership";
export { createYouthMemberDocument } from "./members/createYouthMemberDocument";
export { removeMemberFromClub } from "./members/removeMemberFromClub";
export { removeMemberFromGroup } from "./members/removeMemberFromGroup";
export { removeMemberFromSubGroup } from "./members/removeMemberFromSubGroup";
export { updateClubMemberRole } from "./members/updateClubMemberRole";
export { updateMemberRole } from "./members/updateMemberRole";

// Member Status & Discovery Functions (Atomic)
export { checkAndMarkGuardianInactive } from "./members/checkAndMarkGuardianInactive";
export { checkGuardianDependentStatus } from "./members/checkGuardianDependentStatus";
export { getMemberContactDetails } from "./members/getMemberContactDetails";
export { getMemberGroupMemberships } from "./members/getMemberGroupMemberships";
export { updateGuardianDependentClubRemoval } from "./members/updateGuardianDependentClubRemoval";

// User Document Update Functions (Atomic)
export { updateGuardianDependentAccess } from "./members/updateGuardianDependentAccess";
export { updateUserAnnouncementInfo } from "./members/updateUserAnnouncementInfo";
export { updateUserClubInfo } from "./members/updateUserClubInfo";
export { updateUserEventInfo } from "./members/updateUserEventInfo";
export { updateUserGroupInfo } from "./members/updateUserGroupInfo";
export { updateUserPollInfo } from "./members/updateUserPollInfo";
export { markUserInactive } from "./users/markUserInactive";
export { updateUserClubRemoval } from "./users/updateUserClubRemoval";
export { updateUserGroupRemoval } from "./users/updateUserGroupRemoval";

// Member Orchestration Functions (Service Layer)
// TODO: Add orchestration functions here when implemented

// Invitation Functions (Atomic)
export { markInvitationUsed } from "./invitations/markInvitationUsed";
export { respondToEmailInvite } from "./invitations/respondToEmailInvite";
export { sendGroupInvitation } from "./invitations/sendGroupInvitation";
export { validateInvitationToken } from "./invitations/validateInvitationToken";

// Notification Functions (Atomic)
export { createNotification } from "./notifications/createNotification";

// ✅ Legacy HTTP endpoint functions and unused helpers have been removed
// Current invitation workflow uses: sendGroupInvitation, respondToEmailInvite, markInvitationUsed, validateInvitationToken

// Utility Functions
export { fixEmptyUserDocument } from "./utils/fixEmptyUserDocument";

// Profile Picture Functions
export { onProfilePictureResized } from "./profile/onProfilePictureResized";
export { uploadProfilePictureForMember } from "./profile/uploadProfilePictureForMember";

// Scheduled Functions
export { cleanupDeletedEntities } from "./scheduled/cleanupDeletedEntities";

// Admin/Development Functions
export { devForceCleanup } from "./admin/devForceCleanup";

// Stripe Connect Functions (Account Management)
export { checkStripeAccountStatus } from "./stripe/checkStripeAccountStatus";
export { createCheckoutSession } from "./stripe/createCheckoutSession";
export { createStripeConnectedAccount } from "./stripe/createStripeConnectedAccount";
export { createStripeOnboardingLink } from "./stripe/createStripeOnboardingLink";
export { resetPaymentSetup } from "./stripe/resetPaymentSetup";
export { stripeWebhookHandler } from "./stripe/stripeWebhookHandler";

// Platform Subscription Functions (Club subscriptions to Sportnizer)
export { createCustomerPortalSession } from "./subscriptions/createCustomerPortalSession";
export { createSubscriptionCheckout } from "./subscriptions/createSubscriptionCheckout";
export { getSubscriptionStatus } from "./subscriptions/getSubscriptionStatus";
export { subscriptionWebhookHandler } from "./subscriptions/subscriptionWebhookHandler";
export { updateSubscription } from "./subscriptions/updateSubscription";

// Payment Functions (Membership Fees)
export { createMembershipFee } from "./payments/createMembershipFee";
export { getMembershipFees } from "./payments/getMembershipFees";
export { getUserPendingPayments } from "./payments/getUserPendingPayments";

// News Functions
export { createNews } from "./news/createNews";

// Legal Functions
export { getLegalConfig, recordLegalAcceptance } from "./legal/legalFunctions";
