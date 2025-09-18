import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Validate required fields
 */
export const validateRequiredFields = (
  data: Record<string, any>,
  requiredFields: string[]
): void => {
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Missing required fields: ${missingFields.join(', ')}`
    );
  }
};

/**
 * Validate array field
 */
export const validateArrayField = (
  value: any,
  fieldName: string,
  minLength: number = 1
): void => {
  if (!value || !Array.isArray(value) || value.length < minLength) {
    throw new HttpsError(
      'invalid-argument',
      `${fieldName} must be a non-empty array`
    );
  }
};

/**
 * Validate email format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate invitation action
 */
export const validateInvitationAction = (action: string): void => {
  if (action !== 'accept' && action !== 'reject') {
    throw new HttpsError(
      'invalid-argument',
      'Action must be "accept" or "reject"'
    );
  }
};

/**
 * Check if invitation has expired
 */
export const isInvitationExpired = (expiresAt: any): boolean => {
  if (!expiresAt) return false;
  
  const now = new Date();
  const expiration = expiresAt.toDate ? expiresAt.toDate() : expiresAt;
  return now > expiration;
};

/**
 * Check if invitation is still valid
 */
export const validateInvitationStatus = (invitationData: any): void => {
  if (!invitationData) {
    throw new HttpsError('not-found', 'Invalid invitation data');
  }
  
  if (invitationData.used || invitationData.status !== 'pending') {
    throw new HttpsError(
      'invalid-argument',
      'This invitation has already been processed'
    );
  }
  
  if (isInvitationExpired(invitationData.expiresAt)) {
    throw new HttpsError('invalid-argument', 'This invitation has expired');
  }
};

/**
 * Validate email match with invitation
 */
export const validateEmailMatch = (
  invitationEmail: string,
  userEmail: string
): void => {
  if (invitationEmail !== userEmail.trim().toLowerCase()) {
    throw new HttpsError(
      'invalid-argument',
      'Email does not match the invitation'
    );
  }
};
