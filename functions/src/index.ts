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
export { getGroup } from './groups/getGroup';
export { getGroupMembers } from './groups/getGroupMembers';
export { updateGroup } from './groups/updateGroup';

// Event Management Functions (Atomic)
export { createEvent } from './events/createEvent';
export { deleteEvent } from './events/deleteEvent';
export { getEvent } from './events/getEvent';
export { updateEvent } from './events/updateEvent';

// Member Management Functions (Atomic - Direct Member Operations)
export { addMemberToClub } from './members/addMemberToClub';
export { addMemberToGroup } from './members/addMemberToGroup';
export { addMemberToSubGroup } from './members/addMemberToSubGroup';
export { removeMemberFromGroup } from './members/removeMemberFromGroup';
export { removeMemberFromSubGroup } from './members/removeMemberFromSubGroup';

// User Document Update Functions (Atomic)
export { updateUserAnnouncementInfo } from './members/updateUserAnnouncementInfo';
export { updateUserClubInfo } from './members/updateUserClubInfo';
export { updateUserEventInfo } from './members/updateUserEventInfo';
export { updateUserGroupInfo } from './members/updateUserGroupInfo';
export { updateUserPollInfo } from './members/updateUserPollInfo';

// Member Orchestration Functions (Service Layer)
// TODO: Add orchestration functions here when implemented

// Invitation Functions (Atomic)
export { addGroupInviteToUser } from './invitations/addGroupInviteToUser';
export { markInvitationUsed } from './invitations/markInvitationUsed';
export { processGuardianInvitation } from './invitations/processGuardianInvitation';
export { respondToEmailInvite } from './invitations/respondToEmailInvite';
export { respondToGroupInvite } from './invitations/respondToGroupInvite';
export { sendGroupInvitation } from './invitations/sendGroupInvitation';
export { validateInvitationToken } from './invitations/validateInvitationToken';

// Recipient Selection Functions (Atomic)
export { calculateRecipientCount } from './recipients/calculateRecipientCount';
export { validateRecipientSelection } from './recipients/validateRecipientSelection';

// ✅ Legacy HTTP endpoint functions have been archived
// New invitation workflow uses onCall functions: addGroupInviteToUser, respondToGroupInvite, respondToEmailInvite

// Utility Functions
export { fixEmptyUserDocument } from './utils/fixEmptyUserDocument';

