# Orchestrating Services

This directory contains orchestrating services that coordinate multiple atomic Firebase Functions to accomplish complex business operations.

## Available Services

### 1. `createNewGroupInExistingClub`
**Purpose**: Create a new group within an existing club 

**Use Case**: When a club admin wants to add additional teams/groups to their existing club

**Steps**:
1. **Permission check** - Verify user is club admin (uses `isUserClubAdmin`)
2. Fetch club information for denormalization
3. Create group within existing club (atomic: `createGroup`)
4. Add user as group member with admin role (atomic: `addMemberToGroup`) 
5. Update user's group access within existing club (atomic: `updateUserGroupInfo`)

**Permissions**: Only club admins can create groups in existing clubs

---

**Note on New User Onboarding:**  
When new users create their first club via the `/create-club-form` screen, they call three atomic functions directly (createClub, updateUserClubInfo, addMemberToClub) without using an orchestration service. This simplified flow is specific to initial club creation. For adding groups to existing clubs, use the `createNewGroupInExistingClub` orchestration service above.

## Architecture Principles

Services follow the **Orchestrating Service Pattern** from ARCHITECTURE.md:

- **Atomic Operations**: Each step calls a single, atomic Firebase Function
- **Flexible Interfaces**: Input interfaces match atomic function expectations exactly
- **Permission Validation**: Uses `fetchUserAccess` utilities for consistent permission checking
- **Error Handling**: Comprehensive error handling with rollback considerations
- **Logging**: Detailed console logging for debugging and monitoring

## Usage Example

```typescript
// Add group to existing club
import { createNewGroupInExistingClub } from './services/orchestration';

const result = await createNewGroupInExistingClub({
  clubId: "existing-club-123",
  groupData: { name: "Under 18 Team", sport: "Football" },
  userId: "user123",
  userDisplayName: "John Smith", 
  userEmail: "john@example.com"
});
```

## Future Services

Additional orchestrating services to consider:
- `inviteUserToGroup` - Coordinate invitation creation and user notification (partially implemented in addRegularMemberToGroup)
- `transferGroupToClub` - Move group between clubs with permission validation
- `mergeClubs` - Combine two clubs with data migration and user updates
