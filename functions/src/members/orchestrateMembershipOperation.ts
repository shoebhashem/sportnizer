import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { MembershipOperationRequest, MembershipOperationResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';
import { executeOrchestratorOperations } from './orchestratorCore';

export const orchestrateMembershipOperation = onCall(
  {
    region: config.region,
  },
  async (request): Promise<MembershipOperationResponse> => {
    try {
      const { operations, uid }: MembershipOperationRequest = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['operations', 'uid']);

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      console.log(`Orchestrating membership operations for user ${uid}:`, operations);

      // Use the shared orchestrator core function
      const result = await executeOrchestratorOperations(request.data);
      return result;

    } catch (error) {
      console.error('Error in orchestrateMembershipOperation:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to complete membership operations');
    }
  }
);
