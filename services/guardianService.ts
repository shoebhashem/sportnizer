import { addDoc, collection, doc, getDoc, getFirestore, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getCurrentUser } from './authService';

const db = getFirestore();

export interface UnconfirmedChild {
  name: string;
  birthDate?: string;
  confirmationSent: boolean;
  invitationCode?: string;
}

export interface GuardianConfirmationInvitation {
  groupId: string;
  groupName: string;
  childName: string;
  childBirthDate?: string;
  invitationCode: string;
  invitedBy: string;
  createdAt: any;
  expiresAt: any;
  status: 'pending' | 'confirmed' | 'expired';
}

// Send guardian confirmation links for selected children
export const sendGuardianConfirmationLinks = async (
  groupId: string, 
  selectedChildren: UnconfirmedChild[]
) => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return { success: false, error: { code: 'auth/no-user', message: 'No authenticated user' } };
    }

    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      return { success: false, error: { code: 'group/not-found', message: 'Group not found' } };
    }

    const groupData = groupDoc.data();
    const unconfirmedChildren = groupData.unconfirmedChildren || [];
    const invitations: GuardianConfirmationInvitation[] = [];

    // Create invitation for each selected child
    for (const child of selectedChildren) {
      const invitationCode = Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14); // Expires in 14 days

      const invitation: GuardianConfirmationInvitation = {
        groupId,
        groupName: groupData.name,
        childName: child.name,
        childBirthDate: child.birthDate,
        invitationCode,
        invitedBy: currentUser.uid,
        createdAt: serverTimestamp(),
        expiresAt,
        status: 'pending'
      };

      invitations.push(invitation);

      // Store invitation in Firestore
      await addDoc(collection(db, 'guardianConfirmationInvitations'), invitation);

      // Update child's confirmationSent status
      const childIndex = unconfirmedChildren.findIndex((c: UnconfirmedChild) => c.name === child.name);
      if (childIndex >= 0) {
        unconfirmedChildren[childIndex] = {
          ...unconfirmedChildren[childIndex],
          confirmationSent: true,
          invitationCode
        };
      }
    }

    // Update group with modified unconfirmedChildren
    await updateDoc(groupRef, {
      unconfirmedChildren
    });

    return { success: true, invitations };

  } catch (error: any) {
    console.error('Error sending guardian confirmation links:', error);
    return { 
      success: false, 
      error: {
        code: error.code || 'unknown',
        message: error.message || 'An error occurred while sending confirmation links'
      }
    };
  }
};

// Get guardian confirmation invitation by code
export const getGuardianConfirmationInvitation = async (invitationCode: string) => {
  try {
    const invitationsRef = collection(db, 'guardianConfirmationInvitations');
    // Note: In a real implementation, you would need to query by invitationCode
    // For now, this is a placeholder structure
    
    return { success: true, invitation: null };

  } catch (error: any) {
    console.error('Error getting guardian confirmation invitation:', error);
    return { 
      success: false, 
      error: {
        code: error.code || 'unknown',
        message: error.message || 'An error occurred while getting invitation'
      }
    };
  }
};
