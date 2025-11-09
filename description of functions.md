# Description of Firebase Functions

This document provides a comprehensive overview of all Firebase Functions implemented in the Sportnizer application. The functions are organized by category and deployed to the `europe-north1` region using Firebase Functions v2.

## Function Categories

### 1. Group Invitation Functions

#### generateShareableInvite
**Purpose:** Creates shareable invitation links for group membership

**Parameters:**
- `clubId` (string, required): The ID of the club
- `groupId` (string, required): The ID of the group
- `groupName` (string, required): The name of the group
- `inviterName` (string, required): Name of the person creating the invite
- `expirationDays` (number, optional): Days until expiration (default: 7)
- `maxUses` (number, optional): Maximum number of uses (default: null = unlimited)
- `invitationType` (string, optional): Type of invitation (default: 'group-member')

**Authentication:** Required
**Return Type:** `GenerateShareableInviteResponse`

---

#### getInvitationDetails
**Purpose:** Retrieves details of a specific invitation

**Parameters:**
- `invitationId` (string, required): The ID of the invitation

**Authentication:** Not specified
**Return Type:** Invitation details object

---

#### processInvitation
**Purpose:** Processes an invitation (acceptance/rejection)

**Parameters:**
- Various invitation processing parameters

**Authentication:** Required
**Return Type:** Processing result

---

#### respondToInvitation
**Purpose:** Handles user response to invitations

**Parameters:**
- Invitation response parameters

**Authentication:** Required
**Return Type:** Response result

---

#### sendGroupInvitation
**Purpose:** Sends email invitations to join a group

**Parameters:**
- `emails` (string[], required): Array of email addresses to invite
- `clubId` (string, required): The ID of the club
- `clubName` (string, required): The name of the club
- `groupId` (string, required): The ID of the group
- `groupName` (string, required): The name of the group
- `inviterName` (string, required): Name of the person sending invitations

**Authentication:** Required
**Return Type:** Array of `InvitationResult`

**Features:**
- Validates all required fields
- Validates email array format
- Generates unique invitation tokens for each email
- Sends personalized email invitations

---

### 2. Guardian Invitation Functions

#### getGuardianInvitationDetails
**Purpose:** Retrieves details of guardian invitations

**Parameters:**
- Guardian invitation ID parameters

**Authentication:** Required
**Return Type:** Guardian invitation details

---

#### processGuardianInvitation
**Purpose:** Processes guardian invitation responses

**Parameters:**
- Guardian invitation processing parameters

**Authentication:** Required
**Return Type:** Processing result

---

#### sendGuardianInvitations
**Purpose:** Sends guardian invitations for selected group members

**Parameters:**
- `groupId` (string, required): The ID of the group
- `selectedMemberIds` (string[], required): Array of member IDs to invite guardians for
- `guardianEmails` (string[], required): Array of guardian email addresses

**Authentication:** Required
**Return Type:** Array of `InvitationResult`

**Features:**
- Validates all required fields and arrays
- Verifies group existence
- Sends personalized guardian invitation emails

---

### 3. Email Verification Functions

#### resendVerificationEmail
**Purpose:** Resends email verification to users

**Parameters:**
- User identification parameters for resending verification

**Authentication:** Required
**Return Type:** Resend confirmation

---

#### sendEmailVerification
**Purpose:** Sends initial email verification to new users

**Parameters:**
- `email` (string, required): User's email address
- `uid` (string, required): User's Firebase UID
- `fullName` (string, required): User's full name

**Authentication:** Not required (used during registration)
**Return Type:** Verification send confirmation

**Features:**
- Validates required fields
- Cleans up expired tokens before creating new ones
- Generates unique verification tokens
- Stores verification data with expiration timestamps

---

#### verifyEmail
**Purpose:** HTTP endpoint for email verification via token

**Type:** HTTP Request Function (not callable)
**Parameters:**
- `token` (query parameter, string, required): Verification token from email link

**Authentication:** Not required (public endpoint)
**Return Type:** JSON response with success/error status

**Features:**
- Validates token format and existence
- Checks token expiration
- Updates user email verification status
- Returns appropriate HTTP status codes

---

### 4. Group Management Functions

#### createSubGroup
**Purpose:** Creates subgroups within existing groups with comprehensive permission validation

**Parameters:**
- `parentGroupId` (string, required): The ID of the parent group
- `subGroupName` (string, required): The name of the new subgroup
- `description` (string, optional): Description of the subgroup

**Authentication:** Required
**Return Type:** `CreateSubGroupResponse` with subgroup details

**Features:**
- Multi-level permission validation:
  - Club creator permissions
  - Club admin permissions  
  - Group creator permissions
  - Group admin/coach permissions
- Input validation and sanitization
- Duplicate name checking within parent group
- Automatic metadata assignment (creation timestamp, creator info)
- Hierarchical group structure maintenance

**Permission Hierarchy:**
1. Club Creator: Full access
2. Club Admin: Full access  
3. Group Creator: Access to their groups
4. Group Admin/Coach: Access to their assigned groups

---

## Additional Function Categories

### 5. Authentication Functions
Located in `/functions/src/auth/`:

#### createUserAccount
**Purpose:** Creates new user accounts with proper validation

#### getUserProfile  
**Purpose:** Retrieves user profile information

---

### 6. Club Management Functions
Located in `/functions/src/clubs/`:
*Functions for managing club-related operations*

---

### 7. Member Management Functions  
Located in `/functions/src/members/`:
*Functions for managing group and club memberships*

---

## Technical Architecture

### Configuration
- **Region:** `europe-north1`
- **Runtime:** Firebase Functions v2
- **Authentication:** Firebase Auth integration
- **Database:** Firestore integration
- **Email:** Custom email transporter with templates

### Common Features Across Functions
- **Input Validation:** All functions use centralized validation utilities
- **Error Handling:** Consistent HttpsError responses with descriptive messages
- **Authentication Checks:** Proper user authentication verification
- **Firestore Integration:** Direct database operations with proper error handling
- **Email Integration:** Professional email templates for all notification types

### Utility Functions
- **Validation:** Field validation, array validation, required field checking
- **Email:** Email transporter, template system for different invitation types
- **Configuration:** Centralized region and service configuration
- **User Management:** Token cleanup, expiration handling

### Type System
All functions use TypeScript interfaces defined in `/functions/src/types/interfaces.ts` for:
- Request/response type safety
- Parameter validation
- Return type consistency
- IDE support and autocomplete

---

## Deployment Status
All functions are successfully deployed and operational in the Firebase project with proper error handling, logging, and monitoring capabilities.
