export interface UnconfirmedChild {
  id: string;
  name: string;
  email: string;
  dateOfBirth?: Date;
  addedAt: Date;
  guardianId: string;
}

export interface GuardianConfirmationInvitation {
  id: string;
  childId: string;
  childName: string;
  guardianEmail: string;
  invitedBy: string;
  invitedAt: Date;
  status: 'pending' | 'accepted' | 'declined';
}

export interface GuardianInvitationRequest {
  childId: string;
  guardianEmail: string;
  guardianName?: string;
}

export interface GuardianInvitationResult {
  success: boolean;
  invitationId?: string;
  message: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface GuardianInvitationResponse {
  invitationId: string;
  response: 'accepted' | 'declined';
  guardianProfile?: {
    firstName: string;
    lastName: string;
    phoneNumber?: string;
  };
}
