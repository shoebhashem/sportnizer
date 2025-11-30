import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Authentication Functions (DO NOT MODIFY)
export { createUserAccount } from './auth/createUserAccount';
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

// Invitation Functions (Existing - TODO: Review for atomic pattern)
export { generateShareableInvite } from './invitations/generateShareableInvite';
export { getGuardianInvitationDetails } from './invitations/getGuardianInvitationDetails';
export { getInvitationDetails } from './invitations/getInvitationDetails';
export { processGuardianInvitation } from './invitations/processGuardianInvitation';
export { processInvitation } from './invitations/processInvitation';
export { respondToInvitation } from './invitations/respondToInvitation';
export { sendGroupInvitation } from './invitations/sendGroupInvitation';
export { sendGuardianInvitations } from './invitations/sendGuardianInvitations';

// Utility Functions
export { fixEmptyUserDocument } from './utils/fixEmptyUserDocument';

