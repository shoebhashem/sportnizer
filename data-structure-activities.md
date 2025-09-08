# Sportnizer Activities Data Structure

## Overview
This document defines the Firestore data structure and cost optimization strategies for activities in the Sportnizer app. We use separate collections for different activity types with document-level caching and targeted updates to minimize costs.

## Collections Structure

### 1. Events Collection (`events/`)
Handles both one-time events and individual instances of recurring events.

```typescript
interface Event {
  // Basic Info
  id: string;
  type: 'one-time' | 'recurring-instance';
  title: string;
  description: string;
  startTime: Timestamp;
  endTime: Timestamp;
  location: string;
  
  // Creation & Management
  createdBy: string; // userId
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: 'active' | 'cancelled' | 'completed';
  
  // Recipients
  groupIds: string[];
  
  // Recurring Event Fields (only for recurring-instance)
  recurringEventId?: string; // Links back to parent recurring event
  recurrenceInfo?: {
    pattern: 'daily' | 'weekly' | 'monthly';
    originalStartTime: Timestamp;
    instanceNumber: number;
    totalInstances: number;
  };
  
  // Response Tracking
  responses: {
    [userId: string]: {
      status: 'accepted' | 'declined' | 'maybe';
      timestamp: Timestamp;
      note?: string;
    };
  };
  
  // Response Statistics (for quick display)
  responseStats: {
    accepted: number;
    declined: number;
    maybe: number;
    total: number;
    invitedCount: number;
  };
}
```

### 2. Polls Collection (`polls/`)
Each poll is a separate document with embedded responses.

```typescript
interface Poll {
  // Basic Info
  id: string;
  title: string;
  description: string;
  options: string[];
  
  // Creation & Management
  createdBy: string; // userId
  createdAt: Timestamp;
  updatedAt: Timestamp;
  endDate: Timestamp;
  status: 'active' | 'ended' | 'cancelled';
  
  // Recipients
  groupIds: string[];
  
  // Response Tracking
  responses: {
    [userId: string]: {
      option: string; // Selected option
      optionIndex: number; // Index of selected option
      timestamp: Timestamp;
    };
  };
  
  // Response Statistics (for quick display)
  responseStats: {
    [optionIndex: number]: number; // Vote count per option
    totalVotes: number;
    eligibleVoters: number;
  };
  
  // Settings
  allowMultipleChoices: boolean;
  allowChangeVote: boolean;
  showResultsBeforeEnd: boolean;
}
```

### 3. Announcements Collection (`announcements/`)
Short-lived, one-way communication documents.

```typescript
interface Announcement {
  // Basic Info
  id: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  
  // Creation & Management
  createdBy: string; // userId
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp; // Auto-cleanup after this date
  status: 'active' | 'expired';
  
  // Recipients
  groupIds: string[];
  
  // Read Tracking
  readBy: string[]; // Array of userIds who have read
  readCount: number;
  recipientCount: number;
  
  // Settings
  requireAcknowledgment: boolean; // If true, users must mark as read
  isPinned: boolean; // Show at top of announcements
}
```

## Cost Optimization Strategies

### 1. Document-Level Caching
```typescript
class DocumentCache {
  private cache = new Map<string, {
    data: any;
    lastFetch: number;
    listeners: Set<Function>;
  }>();
  
  private readonly CACHE_DURATION = {
    events: 5 * 60 * 1000,      // 5 minutes
    polls: 2 * 60 * 1000,       // 2 minutes  
    announcements: 1 * 60 * 1000 // 1 minute
  };
  
  async getDocument(collection: string, docId: string) {
    const cacheKey = `${collection}/${docId}`;
    const cached = this.cache.get(cacheKey);
    const maxAge = this.CACHE_DURATION[collection] || 5 * 60 * 1000;
    
    if (cached && Date.now() - cached.lastFetch < maxAge) {
      return cached.data;
    }
    
    // Fetch only this specific document
    const docRef = doc(db, collection, docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      this.cache.set(cacheKey, {
        data: docSnap.data(),
        lastFetch: Date.now(),
        listeners: new Set()
      });
      return docSnap.data();
    }
    
    return null;
  }
}
```

### 2. Targeted Real-time Updates
- **Timeline queries**: Light queries for basic info only
- **Document listeners**: Only when user views/interacts with specific activity
- **Batch operations**: Group related writes together

### 3. Smart Query Patterns
```typescript
// ✅ Efficient: Get timeline with minimal data
const getUpcomingEvents = query(
  collection(db, 'events'),
  where('groupIds', 'array-contains-any', userGroupIds),
  where('startTime', '>=', startOfDay()),
  where('status', '==', 'active'),
  orderBy('startTime'),
  limit(20)
);

// ✅ Efficient: Get specific document only when needed
const getEventDetails = (eventId: string) => 
  getDoc(doc(db, 'events', eventId));

// ❌ Expensive: Avoid complex joins or large scans
```

### 4. Write Optimization
```typescript
// ✅ Single document update for responses
const respondToEvent = async (eventId: string, userId: string, status: string) => {
  await updateDoc(doc(db, 'events', eventId), {
    [`responses.${userId}`]: {
      status,
      timestamp: serverTimestamp()
    },
    [`responseStats.${status}`]: increment(1),
    'responseStats.total': increment(1),
    updatedAt: serverTimestamp()
  });
};

// ✅ Batch operations for related updates
const createEventWithNotifications = async (eventData: Event) => {
  const batch = writeBatch(db);
  
  // Create event
  batch.set(doc(db, 'events', eventData.id), eventData);
  
  // Create notifications (if needed)
  eventData.groupIds.forEach(groupId => {
    const notifId = `${eventData.id}_${groupId}`;
    batch.set(doc(db, 'notifications', notifId), {
      type: 'new_event',
      eventId: eventData.id,
      groupId,
      createdAt: serverTimestamp()
    });
  });
  
  await batch.commit(); // Single write operation cost
};
```

## Recurring Events Implementation

### Strategy: Generate Individual Documents
When a recurring event is created, generate separate documents for each instance:

```typescript
const createRecurringEvent = async (recurringData: RecurringEventData) => {
  const instances = generateRecurringInstances(recurringData);
  const batch = writeBatch(db);
  
  // Create base recurring event record (for reference)
  batch.set(doc(db, 'recurring-events', recurringData.id), {
    ...recurringData,
    createdAt: serverTimestamp(),
    instanceCount: instances.length
  });
  
  // Create individual event instances
  instances.forEach((instance, index) => {
    const eventId = `${recurringData.id}_${index.toString().padStart(3, '0')}`;
    batch.set(doc(db, 'events', eventId), {
      ...instance,
      id: eventId,
      type: 'recurring-instance',
      recurringEventId: recurringData.id,
      recurrenceInfo: {
        pattern: recurringData.pattern,
        originalStartTime: recurringData.startTime,
        instanceNumber: index,
        totalInstances: instances.length
      },
      responses: {},
      responseStats: {
        accepted: 0,
        declined: 0,
        maybe: 0,
        total: 0,
        invitedCount: 0 // Calculate based on groupIds
      }
    });
  });
  
  await batch.commit();
};
```

## Data Cleanup Strategies

### 1. Automatic Announcement Cleanup
```typescript
// Cloud Function: Clean up expired announcements
export const cleanupExpiredAnnouncements = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const expiredQuery = query(
      collection(db, 'announcements'),
      where('expiresAt', '<', new Date()),
      where('status', '==', 'active')
    );
    
    const expiredAnnouncements = await getDocs(expiredQuery);
    const batch = writeBatch(db);
    
    expiredAnnouncements.docs.forEach(doc => {
      batch.update(doc.ref, { status: 'expired' });
    });
    
    await batch.commit();
  });
```

### 2. Event Completion
```typescript
// Mark past events as completed
const markPastEventsCompleted = async () => {
  const pastEvents = query(
    collection(db, 'events'),
    where('endTime', '<', new Date()),
    where('status', '==', 'active')
  );
  
  const batch = writeBatch(db);
  const snapshot = await getDocs(pastEvents);
  
  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      status: 'completed',
      updatedAt: serverTimestamp()
    });
  });
  
  await batch.commit();
};
```

## Security Rules

```javascript
// Firestore Security Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Events
    match /events/{eventId} {
      allow read: if isGroupMember(resource.data.groupIds);
      allow create: if isGroupAdmin(request.resource.data.groupIds);
      allow update: if isGroupAdmin(resource.data.groupIds) || 
                      isResponseUpdate(request.resource.data, resource.data);
    }
    
    // Polls  
    match /polls/{pollId} {
      allow read: if isGroupMember(resource.data.groupIds);
      allow create: if isGroupAdmin(request.resource.data.groupIds);
      allow update: if isGroupAdmin(resource.data.groupIds) || 
                      isPollResponseUpdate(request.resource.data, resource.data);
    }
    
    // Announcements
    match /announcements/{announcementId} {
      allow read: if isGroupMember(resource.data.groupIds);
      allow create: if isGroupAdmin(request.resource.data.groupIds);
      allow update: if isGroupAdmin(resource.data.groupIds) || 
                      isReadUpdate(request.resource.data, resource.data);
    }
  }
}
```

## Performance Monitoring

### Key Metrics to Track:
1. **Read Operations**: Timeline queries, document fetches
2. **Write Operations**: Event creation, response updates
3. **Cache Hit Ratio**: Document cache effectiveness
4. **Real-time Listener Count**: Active subscriptions
5. **Query Performance**: Response times and costs

### Cost Estimation:
- **Timeline Query**: ~1 read per user session
- **Event Details**: ~1 read per event viewed (cached)
- **Response Update**: ~1 write per user response
- **Event Creation**: ~1 write + notifications (batched)

**Target**: <$10/month for 1000 active users with 50 events/month

## Implementation Priority

1. **Phase 1**: One-time events (create, respond, display)
2. **Phase 2**: Polls (create, vote, results)
3. **Phase 3**: Announcements (create, read tracking)
4. **Phase 4**: Recurring events (generate instances)
5. **Phase 5**: Advanced features (notifications, analytics)

---

*This document should be updated as we implement and optimize the system.*
