import { httpsCallable } from 'firebase/functions';
import { getCurrentUser } from './authService';
import { functions } from './firebase';

export interface GuardianInvitationRequest {
  groupId: string;
  selectedMemberIds: string[];
  guardianEmails: string[];
}

export interface GuardianInvitationResult {
  memberId: string;
  memberName?: string;
  success: boolean;
  invitationToken?: string;
  guardianEmails?: string[];
  error?: string;
}

export interface GuardianInvitationResponse {
  success: boolean;
  results: GuardianInvitationResult[];
  error?: string;
}

/**
 * Send guardian invitation emails for selected members
 */
export const sendGuardianInvitations = async (
  request: GuardianInvitationRequest
): Promise<GuardianInvitationResponse> => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return { 
        success: false, 
        results: [],
        error: 'No authenticated user' 
      };
    }

    const sendInvitations = httpsCallable<GuardianInvitationRequest, GuardianInvitationResponse>(
      functions, 
      'sendGuardianInvitations'
    );

    const result = await sendInvitations(request);
    return result.data;

  } catch (error: any) {
    console.error('Error sending guardian invitations:', error);
    return { 
      success: false, 
      results: [],
      error: error.message || 'Failed to send guardian invitations' 
    };
  }
};

/**
 * Get guardian invitation details by token
 */
export const getGuardianInvitationDetails = async (token: string) => {
  try {
    const response = await fetch(
      `https://europe-north1-sportnizer.cloudfunctions.net/getGuardianInvitationDetails?token=${token}`
    );
    
    const data = await response.json();
    return data;

  } catch (error: any) {
    console.error('Error getting guardian invitation details:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to get invitation details' 
    };
  }
};

/**
 * Process guardian invitation (confirm participation)
 */
export const processGuardianInvitation = async (invitationData: {
  invitationToken: string;
  guardianEmail: string;
  guardianName: string;
  guardianPhone?: string;
  relationship: 'mother' | 'father' | 'guardian';
}) => {
  try {
    const response = await fetch(
      'https://europe-north1-sportnizer.cloudfunctions.net/processGuardianInvitation',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invitationData),
      }
    );
    
    const data = await response.json();
    return data;

  } catch (error: any) {
    console.error('Error processing guardian invitation:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to process invitation' 
    };
  }
};
