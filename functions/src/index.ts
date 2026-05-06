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

// Account Security Functions
export { requestEmailChange } from "./auth/requestEmailChange";
export { requestPasswordReset } from "./auth/requestPasswordReset";
export { resetPassword } from "./auth/resetPassword";
export { revokeUserTokens } from "./auth/revokeUserTokens";
export { verifyEmailChange } from "./auth/verifyEmailChange";

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
export { uploadGroupPicture } from "./groups/uploadGroupPicture";

// Event Management Functions (Atomic)
export { cancelEvent } from "./events/cancelEvent";
export { createEvent } from "./events/createEvent";
export { createRecurringEvent } from "./events/createRecurringEvent";
export { deleteEvent } from "./events/deleteEvent";
export { editRecurringEvent } from "./events/editRecurringEvent";
export { getEvent } from "./events/getEvent";
export { updateEvent } from "./events/updateEvent";

// Event Management V2 Functions (Enhanced with notifications & statistics)
export { cleanupOldStatistics } from "./events/cleanupOldStatistics";
export { createEventV2 } from "./events/createEventV2";
export { getStatistics } from "./events/getStatistics";
export { recordAttendance } from "./events/recordAttendance";
export { syncEventRecipients } from "./events/syncEventRecipients";
export { updateEventResponse } from "./events/updateEventResponse";
export { updateStatistics } from "./events/updateStatistics";

// Member Management Functions (Atomic - Direct Member Operations)
export { addGuardianToYouth } from "./members/addGuardianToYouth";
export { addMemberToClub } from "./members/addMemberToClub";
export { addMemberToGroup } from "./members/addMemberToGroup";
export { addMemberToSubGroup } from "./members/addMemberToSubGroup";
export { checkExistingYouthByNameAndDob } from "./members/checkExistingYouthByNameAndDob";
export { checkMembership } from "./members/checkMembership";
export { createYouthMemberDocument } from "./members/createYouthMemberDocument";
export { removeClubAdmin } from "./members/removeClubAdmin";
export { removeGuardianFromYouth } from "./members/removeGuardianFromYouth";
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
export { updateGuardianContactInfo } from "./members/updateGuardianContactInfo";
export { updateGuardianDependentClubRemoval } from "./members/updateGuardianDependentClubRemoval";
export { updateYouthProfile } from "./members/updateYouthProfile";

// User Document Update Functions (Atomic)
export { updateGuardianDependentAccess } from "./members/updateGuardianDependentAccess";
export { updateUserClubInfo } from "./members/updateUserClubInfo";
export { updateUserGroupInfo } from "./members/updateUserGroupInfo";
export { deleteUserAccount } from "./users/deleteUserAccount";
export { markUserInactive } from "./users/markUserInactive";
export { updateUserClubRemoval } from "./users/updateUserClubRemoval";
export { updateUserGroupRemoval } from "./users/updateUserGroupRemoval";

// Member Orchestration Functions (Service Layer)
// TODO: Add orchestration functions here when implemented

// Invitation Functions (Atomic)
export { respondToEmailInvite } from "./invitations/respondToEmailInvite";
export { sendGroupInvitation } from "./invitations/sendGroupInvitation";
export {
    markInvitationUsed,
    updateInvitation
} from "./invitations/updateInvitation";
export { validateInvitationToken } from "./invitations/validateInvitationToken";

// Notification Functions (Atomic)
export { createNotification } from "./notifications/createNotification";

// ✅ Legacy HTTP endpoint functions and unused helpers have been removed
// Current invitation workflow uses: sendGroupInvitation, respondToEmailInvite, updateInvitation, validateInvitationToken
// markInvitationUsed is kept for backwards compatibility (delegates to updateInvitation "delete" action)

// Utility Functions
export { backfillFlatArraysCallable as backfillFlatArrays } from "./utils/backfillFlatArrays";
export { fixEmptyUserDocument } from "./utils/fixEmptyUserDocument";

// Profile Picture Functions
export { onProfilePictureResized } from "./profile/onProfilePictureResized";
export { uploadOwnProfilePicture } from "./profile/uploadOwnProfilePicture";
export { uploadProfilePictureForMember } from "./profile/uploadProfilePictureForMember";

// Scheduled Functions
export { cleanupDeletedEntities } from "./scheduled/cleanupDeletedEntities";
export { cleanupOldEvents } from "./scheduled/cleanupOldEvents";

// Admin/Development Functions
export { devForceCleanup } from "./admin/devForceCleanup";

// Stripe Connect Functions (Account Management)
export { checkStripeAccountStatus } from "./stripe/checkStripeAccountStatus";
export { createCheckoutSession } from "./stripe/createCheckoutSession";
export { createStripeConnectedAccount } from "./stripe/createStripeConnectedAccount";
export { createStripeOnboardingLink } from "./stripe/createStripeOnboardingLink";
export { resetPaymentSetup } from "./stripe/resetPaymentSetup";
export {
    stripeConnectWebhookHandler,
    stripeWebhookHandler
} from "./stripe/stripeWebhookHandler";

// Platform Subscription Functions (Club subscriptions to Clubnizer)
export { createCustomerPortalSession } from "./subscriptions/createCustomerPortalSession";
export { createSubscriptionCheckout } from "./subscriptions/createSubscriptionCheckout";
export { getSubscriptionStatus } from "./subscriptions/getSubscriptionStatus";
export { subscriptionWebhookHandler } from "./subscriptions/subscriptionWebhookHandler";
export { updateSubscription } from "./subscriptions/updateSubscription";

// Payment Functions (Membership Fees)
export { createMembershipFee } from "./payments/createMembershipFee";
export { deleteMembershipFee } from "./payments/deleteMembershipFee";
export { getMembershipFees } from "./payments/getMembershipFees";
export { getUserPendingPayments } from "./payments/getUserPendingPayments";
export { updateMembershipFee } from "./payments/updateMembershipFee";

// Accounting Functions
export {
    createCustomFeeCategory,
    deleteCustomFeeCategory, getChartOfAccounts,
    updateChartAccount
} from "./accounting/chartOfAccounts";
export { exportAccountingData } from "./accounting/exportAccountingData";
export { getAccountingData } from "./accounting/getAccountingData";

// News Functions
export { addNewsComment } from "./news/addNewsComment";
export { createNews } from "./news/createNews";
export { deleteNewsComment } from "./news/deleteNewsComment";

// Legal Functions
export { getLegalConfig, recordLegalAcceptance } from "./legal/legalFunctions";

// LOK-stöd / RF Integration Functions
export {
    getPersonnummerStatus,
    removePersonnummer,
    storePersonnummer
} from "./lok/encryptPersonnummer";
export { generateKommunExport } from "./lok/kommunExport";
export {
    deleteLokReport,
    generateLokReport,
    getLokReport,
    listLokReports
} from "./lok/lokReportService";
export {
    checkRfApiStatus,
    submitLokReportToRf,
    updateClubRfSettings
} from "./lok/rfApiService";

