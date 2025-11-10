import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { config } from '../utils/config';

interface UpdateUserEventsInfoResponse {
  success: boolean;
  updated: number;
  failed: string[];
  useBatchProcessing: boolean;
  message: string;
}

export const updateUserEventsInfo = onCall(
  {
    region: config.region,
    enforceAppCheck: true,
  },
  async (request): Promise<UpdateUserEventsInfoResponse> => {
    const { userIds, eventData, operation } = request.data;
    const { auth } = request;

    console.log(`updateUserEventsInfo called with operation: ${operation}`);
    console.log(`Event: ${eventData.eventId}, Users: ${userIds.length}`);

    // Validate authentication
    if (!auth?.uid) {
      console.error('updateUserEventsInfo: No authenticated user');
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    // Validate input
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new HttpsError('invalid-argument', 'userIds must be a non-empty array');
    }

    if (!eventData || !eventData.eventId || !eventData.clubId) {
      throw new HttpsError('invalid-argument', 'eventData must include eventId and clubId');
    }

    if (!['add', 'remove'].includes(operation)) {
      throw new HttpsError('invalid-argument', 'operation must be "add" or "remove"');
    }

    const db = getFirestore();
    const batchLimit = 500; // Firestore batch limit
    const largeBatchThreshold = 100; // Threshold for considering background processing
    
    let updatedCount = 0;
    let failedUsers: string[] = [];
    const useBatchProcessing = userIds.length <= largeBatchThreshold;

    try {
      if (useBatchProcessing) {
        // Use batch writes for smaller user sets (≤100 users)
        console.log('Using batch processing for user updates');
        
        // Process in chunks of batch limit
        for (let i = 0; i < userIds.length; i += batchLimit) {
          const chunk = userIds.slice(i, i + batchLimit);
          const batch = db.batch();
          
          for (const userId of chunk) {
            try {
              const userRef = db.collection('users').doc(userId);
              
              if (operation === 'add') {
                // Add event invitation to user's eventsInvited array
                const eventInvitation = {
                  eventId: eventData.eventId,
                  clubId: eventData.clubId,
                  title: eventData.title,
                  startTime: new Date(eventData.startTime),
                  eventType: eventData.eventType,
                  invitedAt: FieldValue.serverTimestamp(),
                  response: null, // Will be updated when user responds
                  respondedAt: null
                };

                batch.update(userRef, {
                  eventsInvited: FieldValue.arrayUnion(eventInvitation)
                });
              } else {
                // Remove event from user's eventsInvited array
                // Note: This is more complex with Firestore arrays, we'll need to read-modify-write
                // For now, we'll handle this in individual updates to avoid complexity
                console.log(`Batch removal not implemented for user ${userId}, skipping`);
                failedUsers.push(userId);
                continue;
              }
              
              console.log(`Added user ${userId} to batch for ${operation} operation`);
            } catch (error) {
              console.error(`Error preparing batch update for user ${userId}:`, error);
              failedUsers.push(userId);
            }
          }
          
          // Execute batch
          try {
            await batch.commit();
            updatedCount += (chunk.length - failedUsers.length);
            console.log(`Batch ${Math.floor(i / batchLimit) + 1} committed successfully`);
          } catch (error) {
            console.error(`Error committing batch ${Math.floor(i / batchLimit) + 1}:`, error);
            // Add all users in this batch to failed list
            failedUsers.push(...chunk);
          }
        }
      } else {
        // Use individual updates for larger user sets or complex operations
        console.log('Using individual updates for user processing');
        
        const updatePromises = userIds.map(async (userId) => {
          try {
            const userRef = db.collection('users').doc(userId);
            const userDoc = await userRef.get();
            
            if (!userDoc.exists) {
              console.error(`User ${userId} does not exist`);
              failedUsers.push(userId);
              return;
            }

            const userData = userDoc.data();
            let eventsInvited = userData?.eventsInvited || [];

            if (operation === 'add') {
              // Check if event already exists in user's invitations
              const existingIndex = eventsInvited.findIndex((event: any) => event.eventId === eventData.eventId);
              
              if (existingIndex === -1) {
                // Add new event invitation
                const eventInvitation = {
                  eventId: eventData.eventId,
                  clubId: eventData.clubId,
                  title: eventData.title,
                  startTime: new Date(eventData.startTime),
                  eventType: eventData.eventType,
                  invitedAt: new Date(),
                  response: null,
                  respondedAt: null
                };

                eventsInvited.push(eventInvitation);
                
                await userRef.update({
                  eventsInvited: eventsInvited
                });
                
                console.log(`Added event invitation for user ${userId}`);
              } else {
                console.log(`Event ${eventData.eventId} already exists for user ${userId}`);
              }
            } else {
              // Remove event from user's invitations
              const filteredEvents = eventsInvited.filter((event: any) => event.eventId !== eventData.eventId);
              
              if (filteredEvents.length !== eventsInvited.length) {
                await userRef.update({
                  eventsInvited: filteredEvents
                });
                console.log(`Removed event invitation for user ${userId}`);
              } else {
                console.log(`Event ${eventData.eventId} not found for user ${userId}`);
              }
            }
            
            updatedCount++;
          } catch (error) {
            console.error(`Error updating user ${userId}:`, error);
            failedUsers.push(userId);
          }
        });

        // Execute all updates
        await Promise.all(updatePromises);
      }

      const response: UpdateUserEventsInfoResponse = {
        success: failedUsers.length === 0,
        updated: updatedCount,
        failed: failedUsers,
        useBatchProcessing,
        message: `${operation} operation completed. ${updatedCount} users updated, ${failedUsers.length} failed.`
      };

      console.log('updateUserEventsInfo completed:', response);
      return response;

    } catch (error) {
      console.error('updateUserEventsInfo error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpsError('internal', `Failed to update user events info: ${errorMessage}`);
    }
  }
);
