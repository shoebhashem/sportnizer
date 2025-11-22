import { addDoc, collection, doc, getFirestore, serverTimestamp, updateDoc } from 'firebase/firestore';

// Import Firebase app to ensure it's initialized
import '../core/firebase';

// Announcement interfaces
export interface AnnouncementData {
  title: string;
  message: string;
}

export interface RecipientSelection {
  type: 'selected-groups';
  groups: {
    groupId: string;
    scope: 'entire' | 'subgroups' | 'members';
    subgroupIds?: string[];
    memberIds?: string[];
  }[];
  totalCount: number;
}

export interface Announcement {
  id?: string;
  type: 'announcement';
  title: string;
  message: string;
  
  // Creation & Management
  createdBy: string;
  createdAt: any; // Firestore timestamp
  updatedAt: any; // Firestore timestamp
  status: 'active' | 'archived' | 'draft';
  
  // Recipients
  groupIds: string[];
  recipientSelection: RecipientSelection;
  
  // Read tracking
  readBy: {
    [userId: string]: {
      timestamp: any;
    };
  };
  readStats: {
    totalReads: number;
    invitedCount: number;
  };
}

/**
 * Service for managing announcements in Firestore
 */
class AnnouncementService {
  private db = getFirestore();

  /**
   * Create a new announcement
   */
  async createAnnouncement(
    announcementData: AnnouncementData,
    recipients: RecipientSelection,
    createdBy: string
  ): Promise<string> {
    try {
      console.log('AnnouncementService: Creating announcement...');
      console.log('AnnouncementService: Announcement data:', announcementData);
      console.log('AnnouncementService: Recipients:', recipients);

      // Extract group IDs from recipients
      const groupIds = recipients.groups.map(g => g.groupId);

      const announcementDoc: Announcement = {
        type: 'announcement',
        title: announcementData.title,
        message: announcementData.message,
        
        // Creation & Management
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: 'active',
        
        // Recipients
        groupIds,
        recipientSelection: recipients,
        
        // Read tracking (initialize empty)
        readBy: {},
        readStats: {
          totalReads: 0,
          invitedCount: recipients.totalCount
        }
      };

      console.log('AnnouncementService: Final announcement document:', announcementDoc);
      console.log('AnnouncementService: Attempting to write to Firestore...');
      
      const docRef = await addDoc(collection(this.db, 'announcements'), announcementDoc);
      console.log('AnnouncementService: Successfully created announcement with ID:', docRef.id);
      
      return docRef.id;
    } catch (error) {
      console.error('AnnouncementService: Error creating announcement:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error in AnnouncementService';
      throw new Error(`Failed to create announcement: ${errorMessage}`);
    }
  }

  /**
   * Mark announcement as read by user
   */
  async markAsRead(
    announcementId: string,
    userId: string
  ): Promise<void> {
    try {
      const announcementRef = doc(this.db, 'announcements', announcementId);
      
      await updateDoc(announcementRef, {
        [`readBy.${userId}`]: {
          timestamp: serverTimestamp()
        },
        'readStats.totalReads': 'increment(1)', // Will be replaced with actual increment
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error marking announcement as read:', error);
      throw new Error('Failed to mark announcement as read');
    }
  }

  /**
   * Archive an announcement
   */
  async archiveAnnouncement(announcementId: string): Promise<void> {
    try {
      const announcementRef = doc(this.db, 'announcements', announcementId);
      
      await updateDoc(announcementRef, {
        status: 'archived',
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error archiving announcement:', error);
      throw new Error('Failed to archive announcement');
    }
  }
}

// Singleton instance
export const announcementService = new AnnouncementService();
