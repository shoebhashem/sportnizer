import * as admin from 'firebase-admin';
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FunctionResponse, UpdateUserGroupInfoRequest } from '../types/interfaces';
import { config } from '../utils/config';
import { validateRequiredFields } from '../utils/validation';

export const updateUserGroupInfo = onCall(
  {
    region: config.region,
  },
  async (request): Promise<FunctionResponse> => {
    try {
      const { uid, clubId, groupInfo, roles, operation, updateClubMemberListRoles }: UpdateUserGroupInfoRequest & { updateClubMemberListRoles?: boolean } = request.data;

      // Validate required fields
      validateRequiredFields(request.data, ['uid', 'clubId', 'operation']);
      
      // Additional validation for operations
      if (operation === 'add') {
        if (!groupInfo || !roles) {
          throw new HttpsError('invalid-argument', 'For add operations, both groupInfo and roles are required');
        }
        validateRequiredFields(groupInfo, ['groupId', 'groupName', 'joinedAt']);
      } else if (operation === 'remove') {
        if (!groupInfo || !groupInfo.groupId) {
          throw new HttpsError('invalid-argument', 'For remove operations, groupInfo with groupId is required');
        }
      }

      // Verify the user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Get user document
      const userRef = admin.firestore().collection('users').doc(uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User document not found');
      }

      const userData = userDoc.data();
      let clubAccess = userData?.clubAccess || userData?.clubs || []; // Support backward compatibility
    
      // Find the club in the user's clubAccess array
      const existingClubIndex = clubAccess.findIndex((club: any) => club.clubId === clubId);
      
      if (existingClubIndex === -1) {
        throw new HttpsError('not-found', 'User is not a member of this club');
      }

      if (operation === 'add') {
        console.log(`Adding group info for user ${uid}, group ${groupInfo!.groupId} in club ${clubId} with roles:`, roles);

        // 🆕 REACTIVATION LOGIC: Check if club access is inactive and reactivate if within grace period
        const now = new Date();
        if (clubAccess[existingClubIndex].isActive === false) {
          const scheduledDeletion = clubAccess[existingClubIndex].scheduledForDeletion ?
            (clubAccess[existingClubIndex].scheduledForDeletion.toDate ? 
              clubAccess[existingClubIndex].scheduledForDeletion.toDate() : 
              new Date(clubAccess[existingClubIndex].scheduledForDeletion)) : 
            null;
          
          if (scheduledDeletion && now < scheduledDeletion) {
            console.log(`♻️ Reactivating club access for user ${uid} in club ${clubId} - within grace period`);
            clubAccess[existingClubIndex].isActive = true;
            clubAccess[existingClubIndex].inactiveSince = null;
            clubAccess[existingClubIndex].scheduledForDeletion = null;
            clubAccess[existingClubIndex].reactivatedAt = now;
            clubAccess[existingClubIndex].reactivationCount = (clubAccess[existingClubIndex].reactivationCount || 0) + 1;
          } else {
            console.log(`♻️ Reactivating club access for user ${uid} in club ${clubId} - grace period expired`);
            clubAccess[existingClubIndex].isActive = true;
            clubAccess[existingClubIndex].inactiveSince = null;
            clubAccess[existingClubIndex].scheduledForDeletion = null;
            clubAccess[existingClubIndex].reactivatedAt = now;
            clubAccess[existingClubIndex].reactivationCount = (clubAccess[existingClubIndex].reactivationCount || 0) + 1;
          }
        }

        // Get the club's groupAccess array (initialize if it doesn't exist)
        if (!clubAccess[existingClubIndex].groupAccess) {
          clubAccess[existingClubIndex].groupAccess = [];
        }
        
        const clubGroupAccess = clubAccess[existingClubIndex].groupAccess;

        // 🆕 Check if group membership already exists (including inactive)
        const existingGroupIndex = clubGroupAccess.findIndex((group: any) => group.groupId === groupInfo!.groupId);
        
        if (existingGroupIndex !== -1) {
          const existingGroup = clubGroupAccess[existingGroupIndex];
          
          // Check if group is inactive and reactivate if within grace period
          if (existingGroup.isActive === false) {
            const scheduledDeletion = existingGroup.scheduledForDeletion ?
              (existingGroup.scheduledForDeletion.toDate ? 
                existingGroup.scheduledForDeletion.toDate() : 
                new Date(existingGroup.scheduledForDeletion)) : 
              null;
            
            if (scheduledDeletion && now < scheduledDeletion) {
              console.log(`♻️ Reactivating group membership for user ${uid}, group ${groupInfo!.groupId} - within grace period`);
              
              // Merge roles (avoid duplicates)
              const existingRoles = existingGroup.roles || [];
              const mergedRoles = [...new Set([...existingRoles, ...roles!])];
              
              clubGroupAccess[existingGroupIndex] = {
                ...existingGroup,
                roles: mergedRoles,
                isActive: true,
                inactiveSince: null,
                scheduledForDeletion: null,
                reactivatedAt: now,
                reactivationCount: (existingGroup.reactivationCount || 0) + 1,
                lastModifiedAt: now
              };
            } else {
              console.log(`♻️ Reactivating group membership for user ${uid}, group ${groupInfo!.groupId} - grace period expired`);
              clubGroupAccess[existingGroupIndex] = {
                groupId: groupInfo!.groupId,
                groupName: groupInfo!.groupName,
                roles: roles,
                joinedAt: groupInfo!.joinedAt,
                isActive: true,
                inactiveSince: null,
                scheduledForDeletion: null,
                reactivatedAt: now,
                reactivationCount: (existingGroup.reactivationCount || 0) + 1,
                lastModifiedAt: now
              };
            }
          } else {
            // Update existing active membership with new roles
            clubGroupAccess[existingGroupIndex].roles = roles;
            clubGroupAccess[existingGroupIndex].isActive = true;
            clubGroupAccess[existingGroupIndex].lastModifiedAt = now;
            console.log(`Updated existing group membership with new roles for user ${uid}, group ${groupInfo!.groupId}`);
          }
        } else {
          // Add new group membership to the club's groupAccess array
          clubGroupAccess.push({
            groupId: groupInfo!.groupId,
            groupName: groupInfo!.groupName,
            roles: roles,
            joinedAt: groupInfo!.joinedAt,
            isActive: true,
            lastModifiedAt: now
          });
          console.log(`Added new group membership for user ${uid}, group ${groupInfo!.groupId}`);
        }

        // Optionally update club member list roles (for existing club members joining new group)
        if (updateClubMemberListRoles && roles && roles.length > 0) {
          try {
            const db = admin.firestore();
            const clubMembersRef = db.collection('clubs').doc(clubId).collection('allMembers').doc('members');
            const clubMembersDoc = await clubMembersRef.get();

            if (clubMembersDoc.exists) {
              const clubMembers = clubMembersDoc.data()?.members || [];
              const clubMemberIndex = clubMembers.findIndex((m: any) => m.userId === uid);

              if (clubMemberIndex >= 0) {
                const clubMember = clubMembers[clubMemberIndex];
                
                // 🆕 REACTIVATION: Check if club member is inactive and reactivate
                if (clubMember.isActive === false) {
                  const scheduledDeletion = clubMember.scheduledForDeletion ?
                    (clubMember.scheduledForDeletion.toDate ? 
                      clubMember.scheduledForDeletion.toDate() : 
                      new Date(clubMember.scheduledForDeletion)) : 
                    null;
                  
                  if (scheduledDeletion && now < scheduledDeletion) {
                    console.log(`♻️ Reactivating club member ${uid} - within grace period`);
                    clubMembers[clubMemberIndex].isActive = true;
                    clubMembers[clubMemberIndex].inactiveSince = null;
                    clubMembers[clubMemberIndex].scheduledForDeletion = null;
                    clubMembers[clubMemberIndex].reactivatedAt = now;
                    clubMembers[clubMemberIndex].reactivationCount = (clubMember.reactivationCount || 0) + 1;
                  } else {
                    console.log(`♻️ Reactivating club member ${uid} - grace period expired`);
                    clubMembers[clubMemberIndex].isActive = true;
                    clubMembers[clubMemberIndex].inactiveSince = null;
                    clubMembers[clubMemberIndex].scheduledForDeletion = null;
                    clubMembers[clubMemberIndex].reactivatedAt = now;
                    clubMembers[clubMemberIndex].reactivationCount = (clubMember.reactivationCount || 0) + 1;
                  }
                }
                
                // Add each role to club member list (allows duplicates for tracking multiple group memberships)
                const currentRoles = clubMembers[clubMemberIndex].roles || [];
                clubMembers[clubMemberIndex].roles = [...currentRoles, ...roles];
                clubMembers[clubMemberIndex].lastModifiedAt = now;

                await clubMembersRef.update({
                  members: clubMembers,
                  version: FieldValue.increment(1),
                  lastModified: FieldValue.serverTimestamp()
                });

                console.log(`✅ Added roles [${roles.join(', ')}] to club member list`);
              }
            }
          } catch (clubUpdateError) {
            console.warn('⚠️ Failed to update club member list roles:', clubUpdateError);
            // Don't fail the entire operation if club member list update fails
          }
        }

      } else if (operation === 'remove') {
        console.log(`Removing group info for user ${uid}, group ${groupInfo!.groupId} from club ${clubId}`);

        // Get the club's groupAccess array
        const clubGroupAccess = clubAccess[existingClubIndex].groupAccess || [];
        
        // Find the group membership in this club
        const existingGroupIndex = clubGroupAccess.findIndex((group: any) => group.groupId === groupInfo!.groupId);
        
        if (existingGroupIndex === -1) {
          return {
            success: false,
            error: 'User is not a member of this group'
          };
        }

        // Remove group membership from the club's groupAccess array
        const removedGroup = clubGroupAccess[existingGroupIndex];
        const removedRoles = removedGroup.roles || [];
        clubAccess[existingClubIndex].groupAccess = clubGroupAccess.filter((group: any) => group.groupId !== groupInfo!.groupId);

        // Optionally update club member list roles (remove roles for this group)
        if (updateClubMemberListRoles && removedRoles.length > 0) {
          try {
            const db = admin.firestore();
            const clubMembersRef = db.collection('clubs').doc(clubId).collection('allMembers').doc('members');
            const clubMembersDoc = await clubMembersRef.get();

            if (clubMembersDoc.exists) {
              const clubMembers = clubMembersDoc.data()?.members || [];
              const clubMemberIndex = clubMembers.findIndex((m: any) => m.userId === uid);

              if (clubMemberIndex >= 0) {
                // Remove ONE instance of each role from club member list
                let currentRoles = clubMembers[clubMemberIndex].roles || [];
                
                for (const role of removedRoles) {
                  const roleIndex = currentRoles.indexOf(role);
                  if (roleIndex > -1) {
                    currentRoles = [...currentRoles.slice(0, roleIndex), ...currentRoles.slice(roleIndex + 1)];
                  }
                }
                
                clubMembers[clubMemberIndex].roles = currentRoles;
                clubMembers[clubMemberIndex].lastModifiedAt = new Date();

                await clubMembersRef.update({
                  members: clubMembers,
                  version: FieldValue.increment(1),
                  lastModified: FieldValue.serverTimestamp()
                });

                console.log(`✅ Removed roles [${removedRoles.join(', ')}] from club member list`);
              }
            }
          } catch (clubUpdateError) {
            console.warn('⚠️ Failed to update club member list roles:', clubUpdateError);
            // Don't fail the entire operation if club member list update fails
          }
        }

      } else {
        throw new HttpsError('invalid-argument', 'operation must be either "add" or "remove"');
      }

      // Update user document with new nested structure and increment version
      await userRef.update({
        clubAccess: clubAccess,
        version: FieldValue.increment(1),
        lastModified: FieldValue.serverTimestamp()
      });

      console.log(`Successfully ${operation === 'add' ? 'added' : 'removed'} group info for user ${uid}`);

      return {
        success: true,
        message: `User group info ${operation === 'add' ? 'added' : 'removed'} successfully`
      };

    } catch (error) {
      console.error('Error in updateUserGroupInfo:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to update user group info');
    }
  }
);
