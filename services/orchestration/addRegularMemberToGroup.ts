// ===============================================================================
// FILE PURPOSE: Group Invitation Orchestration Service 
// ===============================================================================
// This file is like a "smart invitation manager" for sports teams/groups
//
// 🎯 WHAT THIS FILE DOES:
// 1. Handles inviting people to join a sports group (like a soccer team)
// 2. Checks if invited people already have accounts in our app
// 3. Sends different types of invitations based on whether they have accounts
// 4. Manages what happens when people accept or reject invitations
// 5. Coordinates multiple backend functions to complete complex operations
//
// 🧠 WHY THIS EXISTS:
// - Inviting people to groups is complex and involves many steps
// - We need different flows for existing users vs new users
// - This file orchestrates (coordinates) all those steps
// - It follows a "three-layer architecture" pattern for clean code organization
// ===============================================================================

// 📦 IMPORTS: Bringing in tools we need from other files
// -------------------------------------------------------
// httpsCallable: A tool that lets us call backend functions from the frontend
import { httpsCallable } from 'firebase/functions';
// functions: Our connection to the Firebase backend where our server functions live
import { functions } from '../core/firebase';

// ===============================================================================
// TYPESCRIPT INTERFACES: Data Structure Definitions
// ===============================================================================
// Think of interfaces like blueprints or forms - they define exactly what 
// information we need and what type each piece should be

// 📝 WHAT WE NEED TO START INVITING PEOPLE
// ----------------------------------------
export interface GroupInvitationRequest {
  emails: string[];           // List of email addresses to invite (e.g., ["john@email.com", "mary@email.com"])
  clubId: string;            // Unique ID of the sports club (e.g., "club_abc123")
  clubName: string;          // Human-readable club name (e.g., "Manchester United FC")
  groupId: string;           // Unique ID of the specific team/group (e.g., "group_xyz789")
  groupName: string;         // Human-readable group name (e.g., "Under 16 Boys Team")
  inviterName: string;       // Name of person sending invites (e.g., "Coach Smith")
  inviterUid: string;        // Unique ID of person sending invites (e.g., "user_def456")
}

// 📊 WHAT WE GET BACK AFTER TRYING TO INVITE PEOPLE
// -------------------------------------------------
export interface GroupInvitationResult {
  success: boolean;          // Did the overall invitation process work? (true/false)
  results?: {               // Details for each email we tried to invite (optional)
    email: string;           // The email address we processed
    success: boolean;        // Did this specific invitation succeed?
    userExists: boolean;     // Does this email belong to someone who already has an account?
    action: 'in_app_notification' | 'email_invitation' | 'error';  // What type of invitation was sent?
    error?: string;          // Error message if something went wrong (optional)
    invitationId?: string;   // Unique ID of the invitation created (optional)
  }[];
  error?: string;            // Overall error message if everything failed (optional)
}

// 💾 HOW WE STORE INVITATION INFORMATION IN THE DATABASE
// ------------------------------------------------------
export interface GroupInviteData {
  inviteId: string;          // Unique identifier for this invitation
  clubId: string;            // Which club the invitation is for
  clubName: string;          // Club name for display purposes
  groupId: string;           // Which specific group within the club
  groupName: string;         // Group name for display purposes
  inviterName: string;       // Who sent the invitation
  inviterUid: string;        // Unique ID of the inviter
  invitedAt: Date;          // When the invitation was created
  status: 'pending' | 'accepted' | 'rejected';  // Current state of the invitation
  type: 'group_invitation';  // What kind of invitation this is
}

// 📱 WHAT WE NEED WHEN SOMEONE RESPONDS TO AN INVITATION
// ------------------------------------------------------
export interface AcceptRejectInviteRequest {
  inviteId: string;          // ID of the invitation being responded to
  action: 'accept' | 'reject';  // What the user chose to do
  clubId: string;            // Which club (needed for processing)
  groupId: string;           // Which group (needed for processing)
}

// 📤 WHAT WE GET BACK AFTER SOMEONE RESPONDS
// ------------------------------------------
export interface AcceptRejectResult {
  success: boolean;          // Did the response get processed successfully?
  action: 'accepted' | 'rejected' | 'error';  // What actually happened?
  message: string;           // Human-readable message to show the user
  error?: string;            // Error details if something went wrong (optional)
}

// ===============================================================================
// MAIN SERVICE OBJECT: The Invitation Management Toolbox
// ===============================================================================
// This is like a toolbox containing different tools (functions) for managing invitations
// Each tool has a specific job in the invitation process

/**
 * 🧰 MAIN INVITATION TOOLBOX: Orchestrating service for group invitation workflow
 * 
 * 🎼 What "Orchestrating" Means:
 * - Like a conductor directing a symphony orchestra
 * - This doesn't do all the work itself, but coordinates when other functions should run
 * - It makes sure everything happens in the right order
 * - It handles complex workflows by breaking them into smaller steps
 * 
 * This implements the new requirements-compliant invitation system
 */
export const addRegularMemberToGroupService = {
  /**
   * 🎯 TOOL #1: Main Invitation Workflow Orchestrator
   * 
   * 📋 WHAT THIS FUNCTION DOES:
   * 1. Takes a list of email addresses that should be invited to a group
   * 2. For each email, checks if that person already has an account in our app
   * 3. If they have an account: sends them a notification inside the app
   * 4. If they don't have an account: sends them an email invitation to sign up
   * 5. Keeps track of what happened with each email address
   * 6. Returns a summary report of all results
   * 
   * 🧠 WHY IT'S CALLED "ORCHESTRATOR":
   * - It coordinates multiple complex steps
   * - Like a project manager organizing different team members
   * - It doesn't do the actual work, but tells other functions when to run
   * 
   * 📥 WHAT IT NEEDS (Parameters):
   * - request: Object containing emails to invite + club/group information
   * 
   * 📤 WHAT IT RETURNS:
   * - A detailed report showing what happened with each email
   */
  async inviteUsersToGroup(request: GroupInvitationRequest): Promise<GroupInvitationResult> {
    try {
      // 📝 STEP 1: Log what we're starting (helps with debugging)
      // console.log is like leaving breadcrumbs for developers to follow
      console.log('🚀 Starting group invitation workflow:', {
        emails: request.emails,        // Show which emails we're processing
        clubId: request.clubId,       // Show which club
        groupId: request.groupId      // Show which group
      });

      // 📝 STEP 2: Create an empty list to store results for each email
      // We'll add one result object for each email we try to invite
      const results: GroupInvitationResult['results'] = [];

      // 📝 STEP 3: Process each email address one by one
      // "for...of" loop goes through each email in the array, one at a time
      for (const email of request.emails) {
        try {
          // 👤 Log which email we're currently working on
          console.log(`👤 Processing invitation for: ${email}`);
          
          // 🔍 STEP 3A: Check if this email belongs to an existing user
          // We ask the backend: "Do you have a user with this email?"
          const getUserByEmailFn = httpsCallable(functions, 'getUserByEmail');
          const userResult = await getUserByEmailFn({ email: email.trim().toLowerCase() });
          
          // Extract the data from the backend response and tell TypeScript what it looks like
          const userResponse = userResult.data as { 
            success: boolean;      // Did the lookup succeed?
            userExists: boolean;   // Was a user found with this email?
            userId?: string;       // If found, what's their unique ID? (optional)
            error?: string;        // If something went wrong, what was the error? (optional)
          };

          // 🚨 STEP 3B: Handle the case where the lookup itself failed
          if (!userResponse.success) {
            console.error(`❌ Error checking user existence for ${email}:`, userResponse.error);
            // Add this email to our results list with error status
            results.push({
              email,
              success: false,
              userExists: false,
              action: 'error',
              error: userResponse.error || 'Failed to check user existence'
            });
            continue; // Skip to the next email (don't process this one further)
          }

          // 🎯 STEP 3C: Branch the logic based on whether user exists
          if (userResponse.userExists && userResponse.userId) {
            // 📱 BRANCH A: User exists - send them an in-app notification
            console.log(`✅ User exists: ${userResponse.userId}, creating in-app notification`);
            
            // Call our helper function that creates notifications inside the app
            const notificationResult = await this.createInAppGroupInvitation({
              userId: userResponse.userId,
              email,
              clubId: request.clubId,
              clubName: request.clubName,
              groupId: request.groupId,
              groupName: request.groupName,
              inviterName: request.inviterName,
              inviterUid: request.inviterUid
            });

            // Add the result to our results list
            results.push({
              email,
              success: notificationResult.success,
              userExists: true,
              action: notificationResult.success ? 'in_app_notification' : 'error',
              error: notificationResult.error,
              invitationId: notificationResult.invitationId
            });
          } else {
            // 📧 BRANCH B: User doesn't exist - send them an email invitation
            console.log(`📧 User doesn't exist, sending email invitation to: ${email}`);
            
            // Call our helper function that sends email invitations
            const emailResult = await this.sendEmailGroupInvitation({
              email,
              clubId: request.clubId,
              clubName: request.clubName,
              groupId: request.groupId,
              groupName: request.groupName,
              inviterName: request.inviterName,
              inviterUid: request.inviterUid
            });

            // Add the result to our results list
            results.push({
              email,
              success: emailResult.success,
              userExists: false,
              action: emailResult.success ? 'email_invitation' : 'error',
              error: emailResult.error,
              invitationId: emailResult.invitationId
            });
          }

        } catch (error: any) {
          // 🚨 If anything goes wrong while processing this specific email
          console.error(`❌ Error processing invitation for ${email}:`, error);
          results.push({
            email,
            success: false,
            userExists: false,
            action: 'error',
            error: error.message || 'Unknown error'
          });
        }
      }

      // 📊 STEP 4: Calculate summary statistics
      // Count how many invitations were successful out of the total
      const successCount = results?.filter(r => r.success).length || 0;
      console.log(`📊 Invitation workflow completed: ${successCount}/${request.emails.length} successful`);

      // 📤 STEP 5: Return the final result summary
      return {
        success: successCount > 0,  // Consider it successful if at least one invitation worked
        results                     // Include detailed results for each email
      };

    } catch (error: any) {
      // 🚨 If the entire process fails catastrophically
      console.error('❌ Error in group invitation workflow:', error);
      return {
        success: false,
        error: error.message || 'Failed to process group invitations'
      };
    }
  },

  /**
   * 📱 TOOL #2: Create in-app notification for existing users
   * 
   * 📋 WHAT THIS FUNCTION DOES:
   * - When we know someone already has an account in our app
   * - We create a notification that appears in their notifications list
   * - They'll see it next time they open the app
   * - Much faster than email and more reliable (no spam filters!)
   * 
   * 💡 WHY WE USE IN-APP NOTIFICATIONS:
   * - Instant delivery (they see it immediately when they open the app)
   * - No email delivery issues or spam filters to worry about
   * - Better user experience for people already using the app
   * - Users can accept/reject directly in the app
   * 
   * 📥 WHAT IT NEEDS (Parameters):
   * - All the information needed to create the invitation notification
   * 
   * 📤 WHAT IT RETURNS:
   * - Whether it worked and the invitation ID if successful
   */
  async createInAppGroupInvitation(params: {
    userId: string;        // Unique ID of the user who will receive the notification
    email: string;         // Their email address (for logging/reference)
    clubId: string;        // Which club they're being invited to
    clubName: string;      // Name of the club (for the notification message)
    groupId: string;       // Which group within the club
    groupName: string;     // Name of the group (for the notification message)
    inviterName: string;   // Who is inviting them (for the notification message)
    inviterUid: string;    // Unique ID of the person doing the inviting
  }): Promise<{ success: boolean; invitationId?: string; error?: string }> {
    try {
      // 📝 Log what we're starting to do (debugging breadcrumbs)
      console.log(`📱 Creating in-app invitation for user: ${params.userId}`);
      
      // 🔧 STEP 1: Call the backend function that adds the invitation to the user's document
      // Think of this like adding a new notification to their notifications list
      const addGroupInviteFn = httpsCallable(functions, 'addGroupInviteToUser');
      const result = await addGroupInviteFn({
        userId: params.userId,
        inviteData: {
          clubId: params.clubId,
          clubName: params.clubName,
          groupId: params.groupId,
          groupName: params.groupName,
          inviterName: params.inviterName,
          inviterUid: params.inviterUid,
          invitedAt: new Date(),        // Timestamp: when was this invitation created (right now)
          status: 'pending',            // Status: they haven't responded yet
          type: 'group_invitation'      // Type: what kind of invitation this is
        }
      });

      // 📤 STEP 2: Extract the response data and tell TypeScript what shape it has
      const response = result.data as { success: boolean; invitationId?: string; error?: string };
      
      // 📝 STEP 3: Log the outcome for debugging
      if (response.success) {
        console.log(`✅ In-app invitation created with ID: ${response.invitationId}`);
      } else {
        console.error(`❌ Failed to create in-app invitation:`, response.error);
      }

      // 📤 STEP 4: Return the result to whoever called this function
      return response;

    } catch (error: any) {
      // 🚨 If anything goes wrong during this process
      console.error('❌ Error creating in-app invitation:', error);
      return {
        success: false,
        error: error.message || 'Failed to create in-app invitation'
      };
    }
  },

  /**
   * 📧 TOOL #3: Send email invitation for non-existing users
   * 
   * 📋 WHAT THIS FUNCTION DOES:
   * - When someone doesn't have an account in our app yet
   * - We send them an email with a special signup link
   * - The link contains an "invitation token" (like a secret code)
   * - When they sign up using that link, they automatically join the group
   * - No manual steps needed after signup - it's all automatic!
   * 
   * 💡 WHY WE USE EMAIL FOR NEW USERS:
   * - They don't have our app yet, so in-app notifications won't work
   * - Email is the universal way to reach anyone
   * - The invitation token ensures they get added to the right group automatically
   * 
   * 🎯 HOW THE MAGIC WORKS:
   * 1. Backend creates an invitation record with a unique token in the database
   * 2. Email is sent with a link containing that token (like: app.com/signup?token=abc123)
   * 3. When they click the link and sign up, the signup process detects the token
   * 4. The signup process automatically adds them to the correct group
   * 
   * 📥 WHAT IT NEEDS (Parameters):
   * - All the information needed to send the email invitation
   * 
   * 📤 WHAT IT RETURNS:
   * - Whether it worked and the invitation token if successful
   */
  async sendEmailGroupInvitation(params: {
    email: string;         // Email address to send the invitation to
    clubId: string;        // Which club they're being invited to
    clubName: string;      // Name of club (for the email message)
    groupId: string;       // Which group within the club
    groupName: string;     // Name of group (for the email message)
    inviterName: string;   // Who is inviting them (for the email message)
    inviterUid: string;    // Unique ID of the person doing the inviting
  }): Promise<{ success: boolean; invitationId?: string; error?: string }> {
    try {
      // 📝 Log what we're starting to do
      console.log(`📧 Sending email invitation to: ${params.email}`);
      
      // 🔧 STEP 1: Call the backend function that sends group invitation emails
      // This backend function does several things:
      // - Creates an invitation record in the database
      // - Generates a unique invitation token (like a secret code)
      // - Sends a nicely formatted email with a signup link containing that token
      const sendInvitationFn = httpsCallable(functions, 'sendGroupInvitation');
      const result = await sendInvitationFn({
        emails: [params.email],           // Put the email in an array (the function expects a list)
        clubId: params.clubId,
        clubName: params.clubName,
        groupId: params.groupId,
        groupName: params.groupName,
        inviterName: params.inviterName,
        inviterUid: params.inviterUid
      });

      // 📤 STEP 2: Extract the response data and tell TypeScript what shape it has
      const response = result.data as { 
        success: boolean; 
        results?: { email: string; success: boolean; invitationToken?: string; error?: string }[]; 
        error?: string; 
      };

      // 🔍 STEP 3: Process the results
      // The backend function can handle multiple emails at once, but we only sent one
      // So we need to extract the result for our single email
      if (response.success && response.results && response.results.length > 0) {
        const emailResult = response.results[0];  // Get the first (and only) result
        return {
          success: emailResult.success,
          invitationId: emailResult.invitationToken,  // This is the magic token!
          error: emailResult.error
        };
      } else {
        // Something went wrong with the email sending
        return {
          success: false,
          error: response.error || 'Failed to send email invitation'
        };
      }

    } catch (error: any) {
      // 🚨 If anything goes wrong during this process
      console.error('❌ Error sending email invitation:', error);
      return {
        success: false,
        error: error.message || 'Failed to send email invitation'
      };
    }
  },

  /**
   * 🎯 TOOL #4: Process invitation after user signup (THE MAGIC HAPPENS HERE!)
   * 
   * 📋 WHAT THIS FUNCTION DOES:
   * - This is called after someone signs up using an invitation link
   * - Remember that invitation token from the email? This is where it gets processed!
   * - This function takes that token and automatically adds the new user to the group
   * - It calls multiple "atomic functions" to update different parts of the database
   * 
   * 🎪 THE COMPLETE WORKFLOW:
   * 1. User gets email invitation with special token
   * 2. User clicks link and signs up for account
   * 3. During signup, system detects the invitation token
   * 4. After signup is complete, THIS FUNCTION gets called
   * 5. This function adds user to club, adds user to group, updates user's profile
   * 6. User is now automatically a member - no manual steps needed!
   * 
   * 🔧 WHAT ATOMIC FUNCTIONS DOES IT CALL:
   * - addMemberToClub: Adds user to the club's member list
   * - addMemberToGroup: Adds user to the specific group's member list  
   * - updateUserClubInfo: Updates user's profile to show they're in this club
   * - updateUserGroupInfo: Updates user's profile to show they're in this group
   * - markInvitationUsed: Marks the invitation as completed so it can't be used again
   * 
   * 📥 WHAT IT NEEDS (Parameters):
   * - invitationToken: The special code from the email link
   * - newUserId: The unique ID of the newly created user account
   * 
   * 📤 WHAT IT RETURNS:
   * - Success/failure status and a welcome message
   */
  async processInvitationAfterSignup(invitationToken: string, newUserId: string): Promise<AcceptRejectResult> {
    try {
      // 📝 Log what we're starting to process
      console.log(`🎯 Processing invitation after signup:`, {
        invitationToken,
        newUserId
      });

      // 💾 STEP 1: Get invitation data directly from the database
      console.log('📝 Getting invitation data directly from Firestore...');
      
      // 💡 WHY WE GET DATA DIRECTLY:
      // - We need the invitation details to know which club/group to add them to
      // - The invitation should be in 'accepted_pending_signup' status at this point
      // - Other functions might only work with 'pending' status, so we go direct
      let invitationData: any;
      try {
        // Import Firebase tools dynamically (only when we need them)
        const { getFirestore } = await import('firebase/firestore');
        const { doc, getDoc } = await import('firebase/firestore');
        const db = getFirestore();
        
        // Get the invitation document by its token ID
        const invitationDocRef = doc(db, 'invitations', invitationToken);
        const invitationDocSnap = await getDoc(invitationDocRef);
        
        // Check if the invitation exists
        if (!invitationDocSnap.exists()) {
          return {
            success: false,
            action: 'error',
            message: 'Invalid or expired invitation',
            error: 'Invitation not found'
          };
        }

        // Extract the invitation data
        invitationData = invitationDocSnap.data();
        
        // 🔍 Verify invitation is in the correct status for post-signup processing
        // It should be 'accepted_pending_signup' which means:
        // - User clicked the email link (accepted)
        // - User completed signup (pending_signup)  
        // - Now we need to add them to the group
        if (invitationData.status !== 'accepted_pending_signup') {
          console.log(`❌ Invitation status is ${invitationData.status}, expected accepted_pending_signup`);
          return {
            success: false,
            action: 'error',
            message: 'Invitation is not in the correct state for processing',
            error: `Expected status 'accepted_pending_signup', got '${invitationData.status}'`
          };
        }

        console.log(`📋 Found invitation for group: ${invitationData.groupName} (Status: ${invitationData.status})`);

      } catch (firestoreError: any) {
        console.error('❌ Error getting invitation data:', firestoreError);
        return {
          success: false,
          action: 'error',
          message: 'Failed to retrieve invitation data',
          error: firestoreError.message
        };
      }

      // 📋 STEP 2: Prepare member data for the atomic functions
      // This creates a standard "member" object that all functions expect
      const memberData = {
        userId: newUserId,
        name: invitationData.email?.split('@')[0] || 'Unknown User', // Use email prefix as temporary name
        email: invitationData.email,
        roles: ['member'],                    // Default role: regular member
        joinedAt: new Date(),                // When they joined (right now)
        profilePictureUrl: '',               // No profile picture yet
        addedBy: invitationData.inviterUid,  // Who invited them
        needsGuardian: false,                // Assume adult member unless specified
        guardiansContacts: []                // Empty guardian list for now
      };

      // 📋 Prepare club information object
      const clubInfo = {
        clubId: invitationData.clubId,
        clubName: invitationData.clubName,
        role: 'member',
        joinedAt: new Date(),
        lastModifiedAt: new Date()
      };

      // 📋 Prepare group information object
      const groupInfo = {
        groupId: invitationData.groupId,
        groupName: invitationData.groupName,
        joinedAt: new Date(),
        lastModifiedAt: new Date()
      };

      // 🎯 STEP 3: Call atomic functions in sequence (THIS IS THE IMPORTANT PART!)
      // Each function updates a different part of the database safely
      
      // 🏛️ Add user to the club's member list
      console.log('📞 Calling addMemberToClub atomic function...');
      const addMemberToClubFn = httpsCallable(functions, 'addMemberToClub');
      const clubResult = await addMemberToClubFn({
        clubId: invitationData.clubId,
        memberData
      });

      const clubResponse = clubResult.data as { success: boolean; error?: string };
      if (!clubResponse.success) {
        throw new Error(`Failed to add member to club: ${clubResponse.error}`);
      }
      console.log('✅ Member added to club successfully');

      // 👥 Add user to the group's member list  
      console.log('📞 Calling addMemberToGroup atomic function...');
      const addMemberToGroupFn = httpsCallable(functions, 'addMemberToGroup');
      const groupResult = await addMemberToGroupFn({
        clubId: invitationData.clubId,
        groupId: invitationData.groupId,
        memberData
      });

      const groupResponse = groupResult.data as { success: boolean; error?: string };
      if (!groupResponse.success) {
        throw new Error(`Failed to add member to group: ${groupResponse.error}`);
      }
      console.log('✅ Member added to group successfully');

      // 👤 Update user's profile to show they're in this club
      console.log('📞 Calling updateUserClubInfo atomic function...');
      const updateUserClubInfoFn = httpsCallable(functions, 'updateUserClubInfo');
      const userClubResult = await updateUserClubInfoFn({
        uid: newUserId,
        clubInfo,
        role: 'member'
      });

      const userClubResponse = userClubResult.data as { success: boolean; error?: string };
      if (!userClubResponse.success) {
        throw new Error(`Failed to update user club info: ${userClubResponse.error}`);
      }
      console.log('✅ User club info updated successfully');

      // 👥 Update user's profile to show they're in this group
      console.log('📞 Calling updateUserGroupInfo atomic function...');
      const updateUserGroupInfoFn = httpsCallable(functions, 'updateUserGroupInfo');
      const userGroupResult = await updateUserGroupInfoFn({
        uid: newUserId,
        clubId: invitationData.clubId,
        groupInfo,
        roles: ['member'],
        operation: 'add'
      });

      const userGroupResponse = userGroupResult.data as { success: boolean; error?: string };
      if (!userGroupResponse.success) {
        throw new Error(`Failed to update user group info: ${userGroupResponse.error}`);
      }
      console.log('✅ User group info updated successfully');

      // ✅ STEP 4: Mark invitation as used (so it can't be used again)
      console.log('📞 Calling markInvitationUsed atomic function...');
      const markInvitationUsedFn = httpsCallable(functions, 'markInvitationUsed');
      await markInvitationUsedFn({
        invitationToken: invitationToken,
        userId: newUserId,
        status: 'accepted'
      });

      // 🎉 STEP 5: Success! All atomic functions completed successfully
      console.log(`✅ Successfully orchestrated all atomic functions for user ${newUserId}`);
      
      return {
        success: true,
        action: 'accepted',
        message: `Welcome to ${invitationData.groupName}! You have been successfully added to the group.`
      };

    } catch (error: any) {
      // 🚨 If anything goes wrong during this complex process
      console.error('❌ Error processing invitation after signup:', error);
      return {
        success: false,
        action: 'error',
        message: 'Failed to process invitation after signup',
        error: error.message || 'Unknown error'
      };
    }
  },

  /**
   * ✅❌ TOOL #5: Handle accept/reject responses from existing users
   * 
   * 📋 WHAT THIS FUNCTION DOES:
   * - When an existing user sees an in-app invitation notification
   * - They can tap "Accept" or "Reject" buttons
   * - This function processes their choice and updates everything accordingly
   * 
   * 🎯 WHAT HAPPENS WHEN THEY ACCEPT:
   * - Adds user to the group's member list
   * - Updates user's profile to show they're in this club/group  
   * - Marks the invitation as "accepted"
   * - Sends a success confirmation message
   * 
   * 🚫 WHAT HAPPENS WHEN THEY REJECT:
   * - Marks the invitation as "rejected"
   * - Removes invitation from their notifications list
   * - Sends a confirmation message that they declined
   * 
   * 💡 WHY THIS IS SEPARATE FROM SIGNUP PROCESSING:
   * - This is for users who ALREADY have accounts
   * - The signup processing is for users who are NEW and don't have accounts yet
   * - Different flows, different functions, but similar end result
   * 
   * 📥 WHAT IT NEEDS (Parameters):
   * - The invitation ID and whether they're accepting or rejecting
   * 
   * 📤 WHAT IT RETURNS:
   * - Whether it worked and what message to show the user
   */
  async respondToGroupInvite(request: AcceptRejectInviteRequest): Promise<AcceptRejectResult> {
    try {
      // 📝 Log what we're starting to process  
      console.log(`🔄 Processing invitation response:`, {
        inviteId: request.inviteId,
        action: request.action
      });

      // 🔧 STEP 1: Call the backend function that handles invitation responses
      // This backend function is smart and does different things based on accept/reject:
      //
      // 🎯 IF ACCEPTING:
      // - Validates that the invitation is still valid
      // - Adds user to group membership lists
      // - Updates user's profile with club/group info
      // - Marks invitation as accepted
      // - Returns success message
      //
      // 🚫 IF REJECTING: 
      // - Validates that the invitation exists
      // - Marks invitation as rejected
      // - Removes from user's notifications
      // - Returns confirmation message
      //
      const respondToInviteFn = httpsCallable(functions, 'respondToGroupInvite');
      const result = await respondToInviteFn(request);
      
      // 📤 STEP 2: Extract the response data and tell TypeScript what shape it has
      const response = result.data as AcceptRejectResult;
      
      // 📝 STEP 3: Log the final outcome for debugging
      console.log(`✅ Invitation response processed: ${response.action}`);
      
      // 📤 STEP 4: Return the result (this gets shown to the user in the app)
      return response;

    } catch (error: any) {
      // 🚨 If anything goes wrong during this process
      console.error('❌ Error processing invitation response:', error);
      return {
        success: false,
        action: 'error',
        message: 'Failed to process invitation response',
        error: error.message || 'Unknown error'
      };
    }
  }
}; // 🔚 END OF SERVICE OBJECT

// ===============================================================================
// 📚 FILE SUMMARY: What You Just Learned!
// ===============================================================================
// 
// 🎯 THIS FILE IS THE "INVITATION MANAGER" FOR SPORTS GROUPS
// 
// 📋 IT HAS 5 MAIN TOOLS:
// 1. 🎼 inviteUsersToGroup: The main coordinator that decides what to do with each email
// 2. 📱 createInAppGroupInvitation: Sends notifications to existing users  
// 3. 📧 sendEmailGroupInvitation: Sends emails to new users with magic signup links
// 4. 🎯 processInvitationAfterSignup: THE IMPORTANT ONE - adds new users to groups after signup
// 5. ✅❌ respondToGroupInvite: Handles accept/reject from existing users
// 
// 🔑 KEY CONCEPTS YOU LEARNED:
// - "Orchestration" = coordinating multiple steps like a conductor
// - "Atomic functions" = backend functions that do one specific task safely
// - "Invitation tokens" = special codes that automatically add users to groups
// - "In-app notifications" vs "Email invitations" = different flows for existing vs new users
// - "Three-layer architecture" = client → orchestration → backend pattern
//
// 🎪 THE COMPLETE INVITATION WORKFLOW:
// 1. Coach wants to invite players → calls inviteUsersToGroup()
// 2. System checks each email → existing user or new user?
// 3. Existing users → get in-app notifications → can accept/reject in app
// 4. New users → get email invites → click link to signup with token
// 5. After signup → processInvitationAfterSignup() automatically adds them to group
// 6. Result: Everyone who accepts is now a member of the team! 🎉
//
// 💡 WHY THIS MATTERS FOR YOUR ORIGINAL QUESTION:
// When you reported that "new member is not added to the group" after signup,
// the issue was likely in the processInvitationAfterSignup() function (Tool #4).
// This function calls all the atomic functions you mentioned:
// - addMemberToClub
// - addMemberToGroup  
// - updateUserClubInfo
// - updateUserGroupInfo
//
// Now you can see exactly how they all work together! 🔧
// ===============================================================================
 