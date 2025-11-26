# Orchestrating Services

This directory contains orchestrating services that coordinate multiple atomic Firebase Functions to accomplish complex business operations.

## Available Services

### 1. `createNewClubAndGroup`
**Purpose**: Create a brand new club with its first group and set the user as club admin

**Use Case**: When a user wants to start their own sports club from scratch

**Steps**:
1. Create club (atomic: `createClub`)
2. Create first group within club (atomic: `createGroup`)  
3. Add user as club member with admin role (atomic: `addMemberToClub`)
4. Update user's club access (atomic: `updateUserClubInfo`)
5. Update user's group access (atomic: `updateUserGroupInfo`)

**Permissions**: Any authenticated user can create a new club

### 2. `createNewGroupInExistingClub`
**Purpose**: Create a new group within an existing club 

**Use Case**: When a club admin wants to add additional teams/groups to their existing club

**Steps**:
1. **Permission check** - Verify user is club admin (uses `isUserClubAdmin`)
2. Create group within existing club (atomic: `createGroup`)
3. Add user as group member with admin role (atomic: `addMemberToGroup`) 
4. Update user's group access within existing club (atomic: `updateUserGroupInfo`)

**Permissions**: Only club admins can create groups in existing clubs

## Key Differences

| Feature | createNewClubAndGroup | createNewGroupInExistingClub |
|---------|----------------------|------------------------------|
| Creates Club | ✅ Yes | ❌ No (uses existing) |
| Permission Check | ❌ No (anyone can create club) | ✅ Yes (must be club admin) |
| Club Membership | ✅ Creates new membership | ❌ Uses existing membership |
| Group Membership | ✅ Creates first group membership | ✅ Adds to existing club's groups |

## Architecture Principles

Both services follow the **Orchestrating Service Pattern** from ARCHITECTURE.md:

- **Atomic Operations**: Each step calls a single, atomic Firebase Function
- **Flexible Interfaces**: Input interfaces match atomic function expectations exactly
- **Permission Validation**: Uses `fetchUserAccess` utilities for consistent permission checking
- **Error Handling**: Comprehensive error handling with rollback considerations
- **Logging**: Detailed console logging for debugging and monitoring

## Usage Examples

```typescript
// Create new club and first group
import { createNewClubAndGroup } from './services/orchestration';

const result = await createNewClubAndGroup({
  clubData: { name: "Manchester FC" },
  groupData: { name: "Senior Team", sport: "Football" },
  userId: "user123",
  userDisplayName: "John Smith",
  userEmail: "john@example.com"
});

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
- `inviteUserToGroup` - Coordinate invitation creation and user notification
- `transferGroupToClub` - Move group between clubs with permission validation
- `mergeClubs` - Combine two clubs with data migration and user updates
