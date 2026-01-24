import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Authentication Functions (DO NOT MODIFY)
export { createUserAccount } from './auth/createUserAccount';
export { getUserByEmail } from './auth/getUserByEmail';
export { getUserProfile } from './auth/getUserProfile';
export { resendVerificationEmail } from './auth/resendVerificationEmail';
export { sendEmailVerification } from './auth/sendEmailVerification';
export { updateUserProfile } from './auth/updateUserProfile';
export { verifyEmail } from './auth/verifyEmail';

// Club Management Functions (Atomic)
export { createClub } from './clubs/createClub';
export { deleteClub } from './clubs/deleteClub';
export { getClub } from './clubs/getClub';
export { getClubMembers } from './clubs/getClubMembers';
export { updateClub } from './clubs/updateClub';

// Group Management Functions (Atomic)
export { createGroup } from './groups/createGroup';
export { createSubGroup } from './groups/createSubGroup';
export { deleteGroup } from './groups/deleteGroup';
export { deleteSubGroup } from './groups/deleteSubGroup';
export { getGroup } from './groups/getGroup';
export { getGroupMembers } from './groups/getGroupMembers';
export { getSubgroup } from './groups/getSubgroup';
export { getSubgroupMembers } from './groups/getSubgroupMembers';
export { getSubGroups } from './groups/getSubGroups';
export { updateGroup } from './groups/updateGroup';
export { updateSubGroup } from './groups/updateSubGroup';

// Event Management Functions (Atomic)
export { createEvent } from './events/createEvent';
export { deleteEvent } from './events/deleteEvent';
export { getEvent } from './events/getEvent';
export { updateEvent } from './events/updateEvent';

// Member Management Functions (Atomic - Direct Member Operations)
export { addMemberToClub } from './members/addMemberToClub';
export { addMemberToGroup } from './members/addMemberToGroup';
export { addMemberToSubGroup } from './members/addMemberToSubGroup';
export { checkMembership } from './members/checkMembership';
export { createYouthMemberDocument } from './members/createYouthMemberDocument';
export { removeMemberFromClub } from './members/removeMemberFromClub';
export { removeMemberFromGroup } from './members/removeMemberFromGroup';
export { removeMemberFromSubGroup } from './members/removeMemberFromSubGroup';
export { updateMemberRole } from './members/updateMemberRole';

// Member Status & Discovery Functions (Atomic)
export { checkAndMarkGuardianInactive } from './members/checkAndMarkGuardianInactive';
export { checkGuardianDependentStatus } from './members/checkGuardianDependentStatus';
export { getMemberGroupMemberships } from './members/getMemberGroupMemberships';
export { updateGuardianDependentClubRemoval } from './members/updateGuardianDependentClubRemoval';

// User Document Update Functions (Atomic)
export { updateGuardianDependentAccess } from './members/updateGuardianDependentAccess';
export { updateUserAnnouncementInfo } from './members/updateUserAnnouncementInfo';
export { updateUserClubInfo } from './members/updateUserClubInfo';
export { updateUserEventInfo } from './members/updateUserEventInfo';
export { updateUserGroupInfo } from './members/updateUserGroupInfo';
export { updateUserPollInfo } from './members/updateUserPollInfo';
export { markUserInactive } from './users/markUserInactive';
export { updateUserClubRemoval } from './users/updateUserClubRemoval';
export { updateUserGroupRemoval } from './users/updateUserGroupRemoval';

// Member Orchestration Functions (Service Layer)
// TODO: Add orchestration functions here when implemented

// Invitation Functions (Atomic)
export { markInvitationUsed } from './invitations/markInvitationUsed';
export { respondToEmailInvite } from './invitations/respondToEmailInvite';
export { sendGroupInvitation } from './invitations/sendGroupInvitation';
export { validateInvitationToken } from './invitations/validateInvitationToken';

// Notification Functions (Atomic)
export { createNotification } from './notifications/createNotification';

// Recipient Selection Functions (Atomic)
export { calculateRecipientCount } from './recipients/calculateRecipientCount';
export { validateRecipientSelection } from './recipients/validateRecipientSelection';

// ✅ Legacy HTTP endpoint functions and unused helpers have been removed
// Current invitation workflow uses: sendGroupInvitation, respondToEmailInvite, markInvitationUsed, validateInvitationToken

// Utility Functions
export { fixEmptyUserDocument } from './utils/fixEmptyUserDocument';

