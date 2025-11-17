import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
    CreateEventRequestV2,
    CreateEventResponse,
    RecipientSelection
} from '../types/interfaces';
import { config } from '../utils/config';

export const createNewEvent = onCall(
  {
    region: config.region,
    enforceAppCheck: true,
  },
  async (request): Promise<CreateEventResponse> => {
    const requestData = request.data;
    const { auth } = request;

    // Support both new level-based and legacy recipient-based approaches
    const isLevelBased = 'level' in requestData;
    
    if (isLevelBased) {
      const { clubId, level, targetId, subgroupId, eventData } = requestData as CreateEventRequestV2;
      console.log(`createNewEvent (v2) called for club: ${clubId}, level: ${level}`);
      console.log(`Event: ${eventData.title}, Level: ${level}, TargetId: ${targetId}, SubgroupId: ${subgroupId}`);
      return await handleLevelBasedEventCreation(auth, clubId, level, eventData, targetId, subgroupId);
    } else {
      // Legacy approach
      const { clubId, eventData, recipients } = requestData;
      console.log(`createNewEvent (legacy) called for club: ${clubId}`);
      console.log(`Event: ${eventData.title}, Recipients: ${recipients?.totalCount} users`);
      return await handleLegacyEventCreation(auth, clubId, eventData, recipients);
    }
  }
);

/**
 * Validate if user has permission to create events for the specified recipients
 */
async function validateUserEventPermissions(
  db: FirebaseFirestore.Firestore, 
  userId: string, 
  clubId: string, 
  recipients: RecipientSelection
): Promise<{ canCreateEvent: boolean; permissionLevel?: string; reason?: string }> {
  
  try {
    // Check if user is club admin
    const clubMemberRef = db.collection('clubs').doc(clubId).collection('members').doc(userId);
    const clubMemberDoc = await clubMemberRef.get();
    
    if (clubMemberDoc.exists) {
      const memberData = clubMemberDoc.data();
      const roles = memberData?.roles || [];
      
      if (roles.includes('admin')) {
        return { canCreateEvent: true, permissionLevel: 'club-admin' };
      }
    }

    // Check if user has coach/admin role in any of the target groups
    const groupIds = recipients.groups.map(g => g.groupId);
    
    for (const groupId of groupIds) {
      const groupMemberRef = db.collection('clubs').doc(clubId)
        .collection('groups').doc(groupId)
        .collection('allMembers').doc('members');
      
      const groupMemberDoc = await groupMemberRef.get();
      
      if (groupMemberDoc.exists) {
        const membersData = groupMemberDoc.data();
        const userMembership = membersData?.members?.find((member: any) => member.uid === userId);
        
        if (userMembership) {
          const userRoles = userMembership.roles || [];
          
          if (userRoles.some((role: string) => ['coach', 'admin'].includes(role))) {
            return { canCreateEvent: true, permissionLevel: 'group-coach-admin' };
          }
        }
      }
    }

    return { 
      canCreateEvent: false, 
      reason: 'User must be club admin or have coach/admin role in target groups' 
    };
    
  } catch (error) {
    console.error('Error validating user permissions:', error);
    return { 
      canCreateEvent: false, 
      reason: 'Error validating permissions' 
    };
  }
}

/**
 * Get all user IDs that should receive the event invitation
 */
async function getRecipientUserIds(
  db: FirebaseFirestore.Firestore, 
  clubId: string, 
  recipients: RecipientSelection
): Promise<string[]> {
  
  const userIds = new Set<string>();
  
  try {
    for (const group of recipients.groups) {
      const { groupId, scope, subgroupIds, memberIds } = group;
      
      // Get group members document
      const groupMembersRef = db.collection('clubs').doc(clubId)
        .collection('groups').doc(groupId)
        .collection('allMembers').doc('members');
      
      const groupMembersDoc = await groupMembersRef.get();
      
      if (!groupMembersDoc.exists) {
        console.warn(`Group ${groupId} members not found`);
        continue;
      }

      const membersData = groupMembersDoc.data();
      const allMembers = membersData?.members || [];

      switch (scope) {
        case 'entire':
          // Add all group members
          allMembers.forEach((member: any) => {
            if (member.uid) {
              userIds.add(member.uid);
            }
          });
          break;

        case 'subgroups':
          // Add members from specific subgroups
          if (subgroupIds && subgroupIds.length > 0) {
            allMembers.forEach((member: any) => {
              const memberSubgroups = member.belongsToSubGroups || [];
              if (memberSubgroups.some((sg: string) => subgroupIds.includes(sg))) {
                userIds.add(member.uid);
              }
            });
          }
          break;

        case 'members':
          // Add specific members
          if (memberIds && memberIds.length > 0) {
            memberIds.forEach((memberId) => {
              const member = allMembers.find((m: any) => m.uid === memberId);
              if (member) {
                userIds.add(member.uid);
              }
            });
          }
          break;
      }
    }

    return Array.from(userIds);
    
  } catch (error) {
    console.error('Error getting recipient user IDs:', error);
    return [];
  }
}

/**
 * Create event subcollections for recipients and response statistics
 */
async function createEventSubcollections(
  db: FirebaseFirestore.Firestore,
  clubId: string,
  eventId: string,
  userIds: string[]
): Promise<void> {
  
  try {
    const eventRef = db.collection('clubs').doc(clubId).collection('events').doc(eventId);
    
    // Create recipients subcollection
    const recipientsPromises = userIds.map(async (userId) => {
      const recipientRef = eventRef.collection('recipients').doc(userId);
      
      return recipientRef.set({
        userId: userId,
        invitedAt: FieldValue.serverTimestamp(),
        response: null,
        respondedAt: null,
        note: null
      });
    });

    await Promise.all(recipientsPromises);
    console.log(`Created ${userIds.length} recipient documents`);

    // Create initial stats document
    const statsRef = eventRef.collection('stats').doc('responses');
    await statsRef.set({
      totalInvited: userIds.length,
      responses: {
        accepted: 0,
        declined: 0,
        maybe: 0,
        notReplied: userIds.length
      },
      roleBreakdown: {
        coach: { accepted: 0, declined: 0, maybe: 0, notReplied: 0 },
        admin: { accepted: 0, declined: 0, maybe: 0, notReplied: 0 },
        guardian: { accepted: 0, declined: 0, maybe: 0, notReplied: 0 },
        member: { accepted: 0, declined: 0, maybe: 0, notReplied: 0 }
      },
      lastUpdated: FieldValue.serverTimestamp()
    });

    console.log('Created event statistics document');
    
  } catch (error) {
    console.error('Error creating event subcollections:', error);
    throw error;
  }
}

/**
 * Handle level-based event creation (new v2 approach)
 */
async function handleLevelBasedEventCreation(
  auth: any,
  clubId: string,
  level: 'club' | 'group' | 'subgroup',
  eventData: any,
  targetId?: string,
  subgroupId?: string
): Promise<CreateEventResponse> {
  
  // Validate authentication
  if (!auth?.uid) {
    console.error('handleLevelBasedEventCreation: No authenticated user');
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = auth.uid;

  // Validate input
  if (!clubId || !eventData) {
    throw new HttpsError('invalid-argument', 'clubId and eventData are required');
  }

  if (!eventData.title?.trim() || !eventData.location?.trim()) {
    throw new HttpsError('invalid-argument', 'Event title and location are required');
  }

  if (!eventData.startTime || !eventData.endTime) {
    throw new HttpsError('invalid-argument', 'Event start time and end time are required');
  }

  // Validate level-specific requirements
  if ((level === 'group' || level === 'subgroup') && !targetId) {
    throw new HttpsError('invalid-argument', `targetId (groupId) is required for ${level} level events`);
  }

  if (level === 'subgroup' && !subgroupId) {
    throw new HttpsError('invalid-argument', 'subgroupId is required for subgroup level events');
  }

  const db = getFirestore();

  try {
    // 1. Validate club exists
    const clubRef = db.collection('clubs').doc(clubId);
    const clubDoc = await clubRef.get();

    if (!clubDoc.exists) {
      throw new HttpsError('not-found', 'Club not found');
    }

    const clubData = clubDoc.data();
    console.log(`Club found: ${clubData?.name}`);

    // 2. Check user permissions based on level
    const userPermissions = await validateLevelBasedEventPermissions(db, userId, clubId, level, targetId);
    
    if (!userPermissions.canCreateEvent) {
      throw new HttpsError('permission-denied', userPermissions.reason || 'Insufficient permissions to create events');
    }

    console.log(`User ${userId} has permission to create ${level} level event: ${userPermissions.permissionLevel}`);

    // 3. Get recipient user IDs based on level
    const recipientUserIds = await getLevelBasedRecipients(db, clubId, level, targetId, subgroupId);
    
    if (recipientUserIds.length === 0) {
      throw new HttpsError('invalid-argument', `No valid recipients found for ${level} level event`);
    }

    console.log(`Found ${recipientUserIds.length} recipient users for ${level} level event`);

    // 4. Create the event document
    const eventRef = db.collection('clubs').doc(clubId).collection('events').doc();
    const eventId = eventRef.id;

    const eventDocument = {
      // Basic event info
      title: eventData.title.trim(),
      description: eventData.description?.trim() || '',
      startTime: new Date(eventData.startTime),
      endTime: new Date(eventData.endTime),
      location: eventData.location.trim(),
      eventType: eventData.eventType,
      
      // Optional fields
      ...(eventData.gatheringTime && { gatheringTime: new Date(eventData.gatheringTime) }),
      ...(eventData.capacity && { capacity: eventData.capacity }),
      
      // Response deadline - default to start time if not specified
      responseDeadline: eventData.responseDeadline?.enabled && eventData.responseDeadline.date
        ? new Date(eventData.responseDeadline.date)
        : new Date(eventData.startTime),
      
      // Creation metadata
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      status: 'active',
      
      // Event scope metadata (new v2 approach)
      scope: {
        level: level,
        ...(targetId && { targetId: targetId }),
        ...(subgroupId && { subgroupId: subgroupId }),
      },
      
      // Recipients info
      invitedUserIds: recipientUserIds,
      invitedCount: recipientUserIds.length,
      
      // Initialize response tracking
      responseStats: {
        accepted: 0,
        declined: 0,
        maybe: 0,
        notReplied: recipientUserIds.length,
        total: 0
      },

      // Versioning fields
      version: 1,
      lastModified: FieldValue.serverTimestamp()
    };

    console.log(`Creating ${level} level event document in /clubs/${clubId}/events/${eventId}`);
    await eventRef.set(eventDocument);

    console.log(`Event ${eventId} created successfully`);

    // 5. Create subcollections for recipients and stats
    await createEventSubcollections(db, clubId, eventId, recipientUserIds);

    // 6. User notifications will be handled separately via updateUserEventsInfo function
    console.log(`${level} level event created successfully. Use updateUserEventsInfo function to notify ${recipientUserIds.length} users.`);

    const response: CreateEventResponse = {
      success: true,
      eventId: eventId,
      message: `Event "${eventData.title}" created successfully for ${level} with ${recipientUserIds.length} recipients`
    };

    console.log('handleLevelBasedEventCreation completed successfully:', response);
    return response;

  } catch (error) {
    console.error('handleLevelBasedEventCreation error:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpsError('internal', `Failed to create ${level} level event: ${errorMessage}`);
  }
}

/**
 * Handle legacy event creation (backward compatibility)
 */
async function handleLegacyEventCreation(
  auth: any,
  clubId: string,
  eventData: any,
  recipients: RecipientSelection
): Promise<CreateEventResponse> {
  
  // Validate authentication
  if (!auth?.uid) {
    console.error('handleLegacyEventCreation: No authenticated user');
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const userId = auth.uid;

  // Validate input
  if (!clubId || !eventData || !recipients) {
    throw new HttpsError('invalid-argument', 'clubId, eventData, and recipients are required');
  }

  if (!eventData.title?.trim() || !eventData.location?.trim()) {
    throw new HttpsError('invalid-argument', 'Event title and location are required');
  }

  if (!eventData.startTime || !eventData.endTime) {
    throw new HttpsError('invalid-argument', 'Event start time and end time are required');
  }

  const db = getFirestore();

  try {
    // 1. Validate club exists and user has permission
    const clubRef = db.collection('clubs').doc(clubId);
    const clubDoc = await clubRef.get();

    if (!clubDoc.exists) {
      throw new HttpsError('not-found', 'Club not found');
    }

    const clubData = clubDoc.data();
    console.log(`Club found: ${clubData?.name}`);

    // 2. Check user permissions - must be club admin or coach/admin in at least one target group
    const userPermissions = await validateUserEventPermissions(db, userId, clubId, recipients);
    
    if (!userPermissions.canCreateEvent) {
      throw new HttpsError('permission-denied', userPermissions.reason || 'Insufficient permissions to create events');
    }

    console.log(`User ${userId} has permission to create event: ${userPermissions.permissionLevel}`);

    // 3. Get all recipient user IDs from the specified groups
    const recipientUserIds = await getRecipientUserIds(db, clubId, recipients);
    
    if (recipientUserIds.length === 0) {
      throw new HttpsError('invalid-argument', 'No valid recipients found for the selected groups');
    }

    console.log(`Found ${recipientUserIds.length} recipient users`);

    // 4. Create the event document in club-based structure
    const eventRef = db.collection('clubs').doc(clubId).collection('events').doc();
    const eventId = eventRef.id;

    const eventDocument = {
      // Basic event info
      title: eventData.title.trim(),
      description: eventData.description?.trim() || '',
      startTime: new Date(eventData.startTime),
      endTime: new Date(eventData.endTime),
      location: eventData.location.trim(),
      eventType: eventData.eventType,
      
      // Optional fields
      ...(eventData.gatheringTime && { gatheringTime: new Date(eventData.gatheringTime) }),
      ...(eventData.capacity && { capacity: eventData.capacity }),
      
      // Response deadline - default to start time if not specified
      responseDeadline: eventData.responseDeadline?.enabled && eventData.responseDeadline.date
        ? new Date(eventData.responseDeadline.date)
        : new Date(eventData.startTime),
      
      // Creation metadata
      createdBy: userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      status: 'active',
      
      // Recipients info (legacy format)
      recipientSelection: recipients,
      invitedUserIds: recipientUserIds,
      invitedCount: recipientUserIds.length,
      
      // Initialize response tracking
      responseStats: {
        accepted: 0,
        declined: 0,
        maybe: 0,
        notReplied: recipientUserIds.length,
        total: 0
      },

      // Versioning fields
      version: 1,
      lastModified: FieldValue.serverTimestamp()
    };

    console.log(`Creating event document in /clubs/${clubId}/events/${eventId}`);
    await eventRef.set(eventDocument);

    console.log(`Event ${eventId} created successfully`);

    // 5. Create subcollections for recipients and stats
    await createEventSubcollections(db, clubId, eventId, recipientUserIds);

    // 6. User notifications will be handled separately via updateUserEventsInfo function
    console.log(`Event created successfully. Use updateUserEventsInfo function to notify ${recipientUserIds.length} users.`);

    const response: CreateEventResponse = {
      success: true,
      eventId: eventId,
      message: `Event "${eventData.title}" created successfully with ${recipientUserIds.length} recipients`
    };

    console.log('handleLegacyEventCreation completed successfully:', response);
    return response;

  } catch (error) {
    console.error('handleLegacyEventCreation error:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpsError('internal', `Failed to create event: ${errorMessage}`);
  }
}

/**
 * Validate if user has permission to create events at the specified level
 */
async function validateLevelBasedEventPermissions(
  db: FirebaseFirestore.Firestore, 
  userId: string, 
  clubId: string, 
  level: 'club' | 'group' | 'subgroup',
  targetId?: string
): Promise<{ canCreateEvent: boolean; permissionLevel?: string; reason?: string }> {
  
  try {
    // Check if user is club admin first - they can create events at any level
    const clubMemberRef = db.collection('clubs').doc(clubId).collection('members').doc(userId);
    const clubMemberDoc = await clubMemberRef.get();
    
    if (clubMemberDoc.exists) {
      const memberData = clubMemberDoc.data();
      const roles = memberData?.roles || [];
      
      if (roles.includes('admin')) {
        return { canCreateEvent: true, permissionLevel: 'club-admin' };
      }
    }

    // For club level events, only club admins can create them
    if (level === 'club') {
      return { 
        canCreateEvent: false, 
        reason: 'Only club admins can create club-level events' 
      };
    }

    // For group/subgroup level events, check if user has coach/admin role in the target group
    if ((level === 'group' || level === 'subgroup') && targetId) {
      const groupMemberRef = db.collection('clubs').doc(clubId)
        .collection('groups').doc(targetId)
        .collection('allMembers').doc('members');
      
      const groupMemberDoc = await groupMemberRef.get();
      
      if (groupMemberDoc.exists) {
        const membersData = groupMemberDoc.data();
        const userMembership = membersData?.members?.find((member: any) => member.uid === userId);
        
        if (userMembership) {
          const userRoles = userMembership.roles || [];
          
          if (userRoles.some((role: string) => ['coach', 'admin'].includes(role))) {
            return { canCreateEvent: true, permissionLevel: 'group-coach-admin' };
          }
        }
      }
    }

    return { 
      canCreateEvent: false, 
      reason: `User must be club admin or have coach/admin role in the target group for ${level} level events` 
    };
    
  } catch (error) {
    console.error('Error validating level-based permissions:', error);
    return { 
      canCreateEvent: false, 
      reason: 'Error validating permissions' 
    };
  }
}

/**
 * Get recipient user IDs based on event level
 */
async function getLevelBasedRecipients(
  db: FirebaseFirestore.Firestore,
  clubId: string,
  level: 'club' | 'group' | 'subgroup',
  targetId?: string,
  subgroupId?: string
): Promise<string[]> {
  
  try {
    switch (level) {
      case 'club':
        return await getClubLevelRecipients(db, clubId);
        
      case 'group':
        if (!targetId) throw new Error('targetId required for group level');
        return await getGroupLevelRecipients(db, clubId, targetId);
        
      case 'subgroup':
        if (!targetId || !subgroupId) throw new Error('targetId and subgroupId required for subgroup level');
        return await getSubgroupLevelRecipients(db, clubId, targetId, subgroupId);
        
      default:
        throw new Error(`Invalid level: ${level}`);
    }
  } catch (error) {
    console.error(`Error getting ${level} level recipients:`, error);
    return [];
  }
}

/**
 * Get all club members as recipients
 */
async function getClubLevelRecipients(
  db: FirebaseFirestore.Firestore,
  clubId: string
): Promise<string[]> {
  
  try {
    const clubMembersRef = db.collection('clubs').doc(clubId)
      .collection('allMembers').doc('members');
    
    const clubMembersDoc = await clubMembersRef.get();
    
    if (!clubMembersDoc.exists) {
      console.warn(`Club ${clubId} members not found`);
      return [];
    }

    const membersData = clubMembersDoc.data();
    const allMembers = membersData?.members || [];

    const userIds = allMembers
      .filter((member: any) => member.uid)
      .map((member: any) => member.uid);

    console.log(`Found ${userIds.length} club members for club ${clubId}`);
    return userIds;
    
  } catch (error) {
    console.error('Error getting club level recipients:', error);
    return [];
  }
}

/**
 * Get all group members as recipients
 */
async function getGroupLevelRecipients(
  db: FirebaseFirestore.Firestore,
  clubId: string,
  groupId: string
): Promise<string[]> {
  
  try {
    const groupMembersRef = db.collection('clubs').doc(clubId)
      .collection('groups').doc(groupId)
      .collection('allMembers').doc('members');
    
    const groupMembersDoc = await groupMembersRef.get();
    
    if (!groupMembersDoc.exists) {
      console.warn(`Group ${groupId} members not found`);
      return [];
    }

    const membersData = groupMembersDoc.data();
    const allMembers = membersData?.members || [];

    const userIds = allMembers
      .filter((member: any) => member.uid)
      .map((member: any) => member.uid);

    console.log(`Found ${userIds.length} group members for group ${groupId}`);
    return userIds;
    
  } catch (error) {
    console.error('Error getting group level recipients:', error);
    return [];
  }
}

/**
 * Get subgroup members as recipients
 */
async function getSubgroupLevelRecipients(
  db: FirebaseFirestore.Firestore,
  clubId: string,
  groupId: string,
  subgroupId: string
): Promise<string[]> {
  
  try {
    const groupMembersRef = db.collection('clubs').doc(clubId)
      .collection('groups').doc(groupId)
      .collection('allMembers').doc('members');
    
    const groupMembersDoc = await groupMembersRef.get();
    
    if (!groupMembersDoc.exists) {
      console.warn(`Group ${groupId} members not found for subgroup filtering`);
      return [];
    }

    const membersData = groupMembersDoc.data();
    const allMembers = membersData?.members || [];

    // Filter members who belong to the specific subgroup
    const subgroupMembers = allMembers.filter((member: any) => {
      const memberSubgroups = member.belongsToSubGroups || [];
      return memberSubgroups.includes(subgroupId) && member.uid;
    });

    const userIds = subgroupMembers.map((member: any) => member.uid);

    console.log(`Found ${userIds.length} subgroup members for subgroup ${subgroupId} in group ${groupId}`);
    return userIds;
    
  } catch (error) {
    console.error('Error getting subgroup level recipients:', error);
    return [];
  }
}
