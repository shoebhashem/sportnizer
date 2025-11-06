import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Group Invitation Functions
export { generateShareableInvite } from './invitations/generateShareableInvite';
export { getInvitationDetails } from './invitations/getInvitationDetails';
export { processInvitation } from './invitations/processInvitation';
export { respondToInvitation } from './invitations/respondToInvitation';
export { sendGroupInvitation } from './invitations/sendGroupInvitation';

// Guardian Invitation Functions
export { getGuardianInvitationDetails } from './invitations/getGuardianInvitationDetails';
export { processGuardianInvitation } from './invitations/processGuardianInvitation';
export { sendGuardianInvitations } from './invitations/sendGuardianInvitations';

// Auth Functions
export { createUserAccount } from './auth/createUserAccount';
export { getUserProfile } from './auth/getUserProfile';
export { resendVerificationEmail } from './auth/resendVerificationEmail';
export { sendEmailVerification } from './auth/sendEmailVerification';
export { verifyEmail } from './auth/verifyEmail';

// Member Management Functions
export { addMemberToClub } from './members/addMemberToClub';
export { addMemberToGroup } from './members/addMemberToGroup';
export { orchestrateMembershipOperation } from './members/orchestrateMembershipOperation';
export { updateUserClubInfo } from './members/updateUserClubInfo';
export { updateUserGroupInfo } from './members/updateUserGroupInfo';

// Club and Group Creation Functions
export { createNewClub } from './clubs/createNewClub';
export { createNewGroup } from './groups/createNewGroup';

