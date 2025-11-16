// /services/versioning/eventDataService.ts

import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../core/firebase';
import { CACHE_KEYS, FetchResult } from '../types/versioning';
import {
    checkDocumentVersion,
    saveToCacheWithVersion
} from './versionCheckService';

/**
 * Fetch single event data with version checking
 */
export async function fetchEventDataWithVersioning(
  clubId: string,
  eventId: string
): Promise<FetchResult<any>> {
  try {
    console.log(`🎪 Fetching event data for: ${eventId} in club ${clubId}`);

    const documentPath = `clubs/${clubId}/events/${eventId}`;
    const cacheKey = CACHE_KEYS.EVENT_DATA(eventId);

    // Check if we need to update
    const versionCheck = await checkDocumentVersion(documentPath, cacheKey);

    if (!versionCheck.needsUpdate && versionCheck.data) {
      console.log(`✅ Using cached event data for ${eventId}`);
      return {
        success: true,
        data: versionCheck.data,
        version: versionCheck.localVersion,
      };
    }

    // Fetch fresh data
    console.log(`🔄 Fetching fresh event data for ${eventId}`);
    const docRef = doc(db, documentPath);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return {
        success: false,
        error: `Event ${eventId} not found in club ${clubId}`,
      };
    }

    const eventData = docSnap.data();
    const version = eventData.version || 1;

    // Cache the fresh data
    await saveToCacheWithVersion(cacheKey, eventData, version);

    console.log(`✅ Event data fetched and cached for ${eventId} (v${version})`);
    return {
      success: true,
      data: eventData,
      version: version,
    };
  } catch (error) {
    console.error(`❌ Error fetching event data for ${eventId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch club events (simplified without collection-level version checking for now)
 */
export async function fetchClubEventsWithVersioning(
  clubId: string
): Promise<FetchResult<any[]>> {
  try {
    console.log(`🎪 Fetching events for club: ${clubId}`);

    // For now, fetch fresh data directly
    // TODO: Implement collection-level version checking
    console.log(`🔄 Fetching fresh club events for ${clubId}`);
    const eventsRef = collection(db, `clubs/${clubId}/events`);
    const eventsQuery = query(eventsRef, orderBy('startTime', 'desc'));
    const eventsSnap = await getDocs(eventsQuery);

    const events: any[] = [];
    let maxVersion = 1;

    eventsSnap.forEach((doc) => {
      const eventData = { id: doc.id, ...doc.data() };
      events.push(eventData);
      
      // Track highest version for potential future collection versioning
      const docVersion = (eventData as any).version || 1;
      if (docVersion > maxVersion) {
        maxVersion = docVersion;
      }
    });

    console.log(`✅ Club events fetched for ${clubId} (${events.length} events, max v${maxVersion})`);
    return {
      success: true,
      data: events,
      version: maxVersion,
    };
  } catch (error) {
    console.error(`❌ Error fetching club events for ${clubId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch user's events (events where user is invited) with version checking
 */
export async function fetchUserEventsWithVersioning(
  accessibleClubIds: string[]
): Promise<FetchResult<any[]>> {
  try {
    console.log(`👤 Fetching user events across ${accessibleClubIds.length} clubs`);

    // For user events, we'll check each club individually and combine results
    const allEvents: any[] = [];
    let maxVersion = 1;
    
    for (const clubId of accessibleClubIds) {
      const clubEventsResult = await fetchClubEventsWithVersioning(clubId);
      
      if (clubEventsResult.success && clubEventsResult.data) {
        allEvents.push(...clubEventsResult.data);
        
        if (clubEventsResult.version && clubEventsResult.version > maxVersion) {
          maxVersion = clubEventsResult.version;
        }
      }
    }

    // Sort all events by start time
    allEvents.sort((a, b) => {
      const aTime = a.startTime?.toDate ? a.startTime.toDate() : new Date(a.startTime);
      const bTime = b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime);
      return bTime.getTime() - aTime.getTime(); // Descending order (newest first)
    });

    console.log(`✅ User events fetched: ${allEvents.length} events across ${accessibleClubIds.length} clubs`);
    return {
      success: true,
      data: allEvents,
      version: maxVersion,
    };
  } catch (error) {
    console.error(`❌ Error fetching user events:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
