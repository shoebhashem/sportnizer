import {
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    updateDoc
} from 'firebase/firestore';
import { getCurrentUser } from './authService';

const db = getFirestore();

/**
 * Migrates existing user document to include enhanced club and group data
 * This fixes existing users who don't have the new data structure
 */
export const migrateUserDocumentToEnhancedData = async () => {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error('No authenticated user');
    }

    console.log('🔄 Starting user document migration...');
    
    const userRef = doc(db, 'users', currentUser.uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User document not found');
    }

    const userData = userDoc.data();
    const existingClubs = userData.clubs || [];
    
    console.log('📊 Found existing clubs:', existingClubs);

    // Enhanced clubs array with additional data
    const enhancedClubs = [];
    // Enhanced groups array (new)
    const enhancedGroups = [];

    // Process each existing club
    for (const club of existingClubs) {
      try {
        console.log(`🏢 Processing club: ${club.clubId}`);
        
        // Fetch actual club document to get real name
        const clubDoc = await getDoc(doc(db, 'clubs', club.clubId));
        const clubName = clubDoc.exists() ? clubDoc.data().name : 'Unknown Club';
        
        // Fetch groups in this club
        const groupsSnapshot = await getDocs(
          collection(db, 'clubs', club.clubId, 'groups')
        );
        
        const groupCount = groupsSnapshot.size;
        console.log(`📊 Found ${groupCount} groups in club ${club.clubId}`);

        // Calculate total members (simplified - just count unique members across all groups)
        const allMemberIds = new Set();
        
        // Process each group and add to user's groupsJoined
        for (const groupDoc of groupsSnapshot.docs) {
          const groupData = groupDoc.data();
          console.log(`🎯 Processing group: ${groupDoc.id} - ${groupData.name}`);
          
          // Check if user is member of this group
          const memberDoc = await getDoc(
            doc(db, 'clubs', club.clubId, 'groups', groupDoc.id, 'members', currentUser.uid)
          );
          
          if (memberDoc.exists()) {
            const memberData = memberDoc.data();
            console.log(`✅ User is member of group ${groupDoc.id}`);
            
            // Count members in this group
            const membersSnapshot = await getDocs(
              collection(db, 'clubs', club.clubId, 'groups', groupDoc.id, 'members')
            );
            
            // Add all member IDs to set for total count
            membersSnapshot.docs.forEach(doc => allMemberIds.add(doc.id));
            
            // Add to user's groups
            enhancedGroups.push({
              groupId: groupDoc.id,
              groupName: groupData.name,
              clubId: club.clubId,
              roles: memberData.roles || [memberData.role || 'member'],
              joinedAt: memberData.joinedAt || club.joinedAt || new Date(),
              status: 'active',
              sportType: groupData.sportType || 'Unknown Sport',
              memberCount: membersSnapshot.size,
            });
          }
        }

        // Add enhanced club data
        enhancedClubs.push({
          clubId: club.clubId,
          clubName: clubName,
          isAdmin: club.isAdmin || false,
          joinedAt: club.joinedAt || new Date(),
          role: club.role || 'member',
          status: club.status || 'active',
          totalMembers: allMemberIds.size,
          groupCount: groupCount,
        });

        console.log(`✅ Enhanced club ${club.clubId}: ${clubName} (${allMemberIds.size} members, ${groupCount} groups)`);
        
      } catch (error) {
        console.error(`❌ Error processing club ${club.clubId}:`, error);
        // Add original club data if enhancement fails
        enhancedClubs.push({
          ...club,
          clubName: 'Unknown Club',
          totalMembers: 0,
          groupCount: 0,
        });
      }
    }

    // Update user document with enhanced data
    await updateDoc(userRef, {
      clubs: enhancedClubs,
      groupsJoined: enhancedGroups,
    });

    console.log('✅ User document migration completed!');
    console.log('📊 Enhanced clubs:', enhancedClubs);
    console.log('📊 Enhanced groups:', enhancedGroups);

    return {
      success: true,
      enhancedClubs,
      enhancedGroups
    };

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

/**
 * Quick fix to run migration - call this from browser console or add to a button
 */
export const runMigration = async () => {
  try {
    console.log('🚀 Starting migration...');
    const result = await migrateUserDocumentToEnhancedData();
    console.log('🎉 Migration successful!', result);
    // Refresh the page to see changes
    window.location.reload();
  } catch (error) {
    console.error('💥 Migration failed:', error);
  }
};
