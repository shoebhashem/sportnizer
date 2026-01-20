import { doc, getDoc } from 'firebase/firestore';
import { db } from './core/firebase';
import type { DependentInfo, UserProfile } from './types/user';

/**
 * Fetches the full UserProfile for each dependent (youth member)
 * @param dependents - Array of dependent info from guardian's profile
 * @returns Array of full UserProfile objects for each dependent
 */
export async function fetchDependentProfiles(
  dependents: DependentInfo[]
): Promise<UserProfile[]> {
  if (!dependents || dependents.length === 0) {
    return [];
  }

  try {
    // Fetch all dependent profiles in parallel
    const profilePromises = dependents.map(async (dependent) => {
      try {
        const userDocRef = doc(db, 'users', dependent.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          console.warn(`⚠️ Dependent profile not found: ${dependent.uid}`);
          return null;
        }

        const data = userDoc.data();
        
        // Convert Firestore Timestamps to Date objects
        const profile: UserProfile = {
          uid: userDoc.id,
          email: data.email || '',
          displayName: data.displayName || dependent.childName || 'Unknown',
          photoURL: data.photoURL,
          phoneNumber: data.phoneNumber || null,
          dateOfBirth: data.dateOfBirth?.toDate() || null,
          emailVerified: data.emailVerified || false,
          address: data.address,
          clubAccess: data.clubAccess || [],
          groupsCreated: data.groupsCreated || 0,
          events: data.events || [],
          eventsResponses: data.eventsResponses || [],
          verificationStatus: data.verificationStatus,
          createdAt: data.createdAt?.toDate(),
          lastActive: data.lastActive?.toDate(),
          version: data.version,
          dependents: data.dependents || [],
          guardians: data.guardians || [],
        };

        // Convert timestamps in clubAccess
        if (profile.clubAccess) {
          profile.clubAccess = profile.clubAccess.map((club) => ({
            ...club,
            joinedAt: club.joinedAt instanceof Date ? club.joinedAt : (club.joinedAt as any)?.toDate?.() || new Date(),
            lastModifiedAt: club.lastModifiedAt instanceof Date ? club.lastModifiedAt : (club.lastModifiedAt as any)?.toDate?.() || new Date(),
            groupAccess: club.groupAccess?.map((group) => ({
              ...group,
              joinedAt: group.joinedAt instanceof Date ? group.joinedAt : (group.joinedAt as any)?.toDate?.() || new Date(),
              lastModifiedAt: group.lastModifiedAt instanceof Date ? group.lastModifiedAt : (group.lastModifiedAt as any)?.toDate?.() || new Date(),
            })),
          }));
        }

        return profile;
      } catch (error) {
        console.error(`❌ Error fetching dependent profile ${dependent.uid}:`, error);
        return null;
      }
    });

    const profiles = await Promise.all(profilePromises);
    
    // Filter out null values (failed fetches)
    return profiles.filter((profile): profile is UserProfile => profile !== null);
  } catch (error) {
    console.error('❌ Error fetching dependent profiles:', error);
    return [];
  }
}
