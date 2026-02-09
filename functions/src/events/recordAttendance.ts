import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { RecordAttendanceRequest, RecordAttendanceResponse } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

/**
 * Records actual attendance for an event (admin/coach only)
 * 
 * Features:
 * - Validates admin/coach permissions
 * - Records who attended and who didn't
 * - Updates responseSummary with attended count
 * - Marks event as completed
 * - Triggers statistics update (via updateStatistics function)
 * 
 * @param request - Attendance records data
 * @returns Promise with success status
 * 
 * @throws HttpsError('unauthenticated') - User not authenticated
 * @throws HttpsError('permission-denied') - User not admin/coach
 * @throws HttpsError('invalid-argument') - Missing required fields
 * @throws HttpsError('not-found') - Event not found
 * @throws HttpsError('failed-precondition') - Event not ready for attendance recording
 */
export const recordAttendance = onCall(
  { region: config.region },
  async (request): Promise<RecordAttendanceResponse> => {
    try {
      // ============================================================================
      // STEP 1: Authentication & Validation
      // ============================================================================
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const data: RecordAttendanceRequest = request.data;

      validateRequiredFields(data, ['eventId', 'clubId', 'attendanceRecords', 'recordedBy']);

      if (!Array.isArray(data.attendanceRecords) || data.attendanceRecords.length === 0) {
        throw new HttpsError(
          'invalid-argument',
          'attendanceRecords must be a non-empty array'
        );
      }

      const db = admin.firestore();
      const eventRef = db
        .collection('clubs')
        .doc(data.clubId)
        .collection('events')
        .doc(data.eventId);

      console.log(`📋 Recording attendance for event ${data.eventId} by user ${data.recordedBy}`);

      // ============================================================================
      // STEP 2: Permission Validation
      // ============================================================================
      const eventDoc = await eventRef.get();

      if (!eventDoc.exists) {
        throw new HttpsError('not-found', 'Event not found');
      }

      const eventData = eventDoc.data();

      // Verify event date has passed
      const eventEndDate = eventData?.endDate?.toDate();
      if (eventEndDate && eventEndDate > new Date()) {
        throw new HttpsError(
          'failed-precondition',
          'Cannot record attendance for future events'
        );
      }

      // Check user's permission based on event's target scope
      const targetScope = eventData?.targetScope;
      const userId = request.auth.uid;

      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      let hasPermission = false;

      if (targetScope.level === 'club') {
        // For club-level events, user must be club-admin
        const clubAccess = userData?.clubAccess?.find((ca: any) => ca.clubId === data.clubId);
        hasPermission = clubAccess?.role === 'club-admin';
      } else if (targetScope.level === 'group' || targetScope.level === 'subgroup') {
        // For group/subgroup events, user must be admin or coach
        const clubAccess = userData?.clubAccess?.find((ca: any) => ca.clubId === data.clubId);
        const groupAccess = clubAccess?.groups?.find((g: any) => g.groupId === targetScope.groupId);
        hasPermission = groupAccess?.roles?.includes('admin') || groupAccess?.roles?.includes('coach');
      }

      if (!hasPermission) {
        throw new HttpsError(
          'permission-denied',
          'Only admins and coaches can record attendance'
        );
      }

      // ============================================================================
      // STEP 3: Update Attendance Records Using Transaction
      // ============================================================================
      await db.runTransaction(async (transaction) => {
        const eventDocSnapshot = await transaction.get(eventRef);

        if (!eventDocSnapshot.exists) {
          throw new HttpsError('not-found', 'Event not found');
        }

        const currentEventData = eventDocSnapshot.data();
        
        if (!currentEventData) {
          throw new HttpsError('internal', 'Event data is missing');
        }
        
        const responses = currentEventData.responses || [];

        // Update attendance for each record
        let attendedCount = 0;

        data.attendanceRecords.forEach((record) => {
          const responseIndex = responses.findIndex((r: any) => r.userId === record.userId);

          if (responseIndex !== -1) {
            responses[responseIndex] = {
              ...responses[responseIndex],
              actualAttendance: record.attended,
              recordedBy: data.recordedBy,
              recordedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (record.attended) {
              attendedCount++;
            }
          }
        });

        // Update responseSummary with attended count
        const responseSummary = {
          ...currentEventData.responseSummary,
          attended: attendedCount,
        };

        // Update event document
        transaction.update(eventRef, {
          responses,
          responseSummary,
          status: 'completed',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`✅ Attendance recorded: ${attendedCount} attended`);
      });

      // ============================================================================
      // STEP 4: Trigger Statistics Update
      // ============================================================================
      // Note: This will be handled by the updateStatistics function
      // which can be called as a follow-up or triggered by a Cloud Function
      console.log(`🔔 Attendance recording complete - statistics update should be triggered`);

      // ============================================================================
      // STEP 5: Return Success Response
      // ============================================================================
      return {
        success: true,
        message: 'Attendance recorded successfully',
      };

    } catch (error: any) {
      console.error('❌ Error in recordAttendance:', error);

      // Re-throw HttpsError instances
      if (error instanceof HttpsError) {
        throw error;
      }

      // Wrap other errors
      throw new HttpsError(
        'internal',
        `Failed to record attendance: ${error.message}`
      );
    }
  }
);
