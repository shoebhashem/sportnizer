import { addDoc, collection, doc, getFirestore, serverTimestamp, updateDoc } from 'firebase/firestore';

// Import Firebase app to ensure it's initialized
import '../core/firebase';

// Poll interfaces
export interface PollData {
  question: string;
  description: string;
  options: string[];
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

export interface Poll {
  id?: string;
  type: 'poll';
  question: string;
  description: string;
  options: string[];
  
  // Creation & Management
  createdBy: string;
  createdAt: any; // Firestore timestamp
  updatedAt: any; // Firestore timestamp
  status: 'active' | 'closed' | 'draft';
  
  // Recipients
  groupIds: string[];
  recipientSelection: RecipientSelection;
  
  // Voting tracking
  votes: {
    [userId: string]: {
      optionIndex: number;
      timestamp: any;
    };
  };
  voteStats: {
    [optionIndex: number]: number; // Count per option
    totalVotes: number;
    invitedCount: number;
  };
}

/**
 * Service for managing polls in Firestore
 */
class PollService {
  private db = getFirestore();

  /**
   * Create a new poll
   */
  async createPoll(
    pollData: PollData,
    recipients: RecipientSelection,
    createdBy: string
  ): Promise<string> {
    try {
      console.log('PollService: Creating poll...');
      console.log('PollService: Poll data:', pollData);
      console.log('PollService: Recipients:', recipients);

      // Extract group IDs from recipients
      const groupIds = recipients.groups.map(g => g.groupId);

      // Initialize vote stats for each option
      const voteStats: { [optionIndex: number]: number; totalVotes: number; invitedCount: number } = {
        totalVotes: 0,
        invitedCount: recipients.totalCount
      };

      // Initialize each option with 0 votes
      pollData.options.forEach((_, index) => {
        voteStats[index] = 0;
      });

      const pollDoc: Poll = {
        type: 'poll',
        question: pollData.question,
        description: pollData.description,
        options: pollData.options,
        
        // Creation & Management
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: 'active',
        
        // Recipients
        groupIds,
        recipientSelection: recipients,
        
        // Voting tracking (initialize empty)
        votes: {},
        voteStats
      };

      console.log('PollService: Final poll document:', pollDoc);
      console.log('PollService: Attempting to write to Firestore...');
      
      const docRef = await addDoc(collection(this.db, 'polls'), pollDoc);
      console.log('PollService: Successfully created poll with ID:', docRef.id);
      
      return docRef.id;
    } catch (error) {
      console.error('PollService: Error creating poll:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error in PollService';
      throw new Error(`Failed to create poll: ${errorMessage}`);
    }
  }

  /**
   * Vote on a poll
   */
  async voteOnPoll(
    pollId: string,
    userId: string,
    optionIndex: number
  ): Promise<void> {
    try {
      const pollRef = doc(this.db, 'polls', pollId);
      
      await updateDoc(pollRef, {
        [`votes.${userId}`]: {
          optionIndex,
          timestamp: serverTimestamp()
        },
        [`voteStats.${optionIndex}`]: 'increment(1)', // Will be replaced with actual increment
        'voteStats.totalVotes': 'increment(1)', // Will be replaced with actual increment
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error voting on poll:', error);
      throw new Error('Failed to vote on poll');
    }
  }

  /**
   * Close a poll
   */
  async closePoll(pollId: string): Promise<void> {
    try {
      const pollRef = doc(this.db, 'polls', pollId);
      
      await updateDoc(pollRef, {
        status: 'closed',
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error closing poll:', error);
      throw new Error('Failed to close poll');
    }
  }
}

// Singleton instance
export const pollService = new PollService();
