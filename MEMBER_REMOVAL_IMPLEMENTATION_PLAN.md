# 🗑️ Member Removal Feature - Implementation Plan

**Feature:** Multi-level member removal with guardian/dependent handling  
**Created:** January 24, 2026  
**Status:** Planning Phase  
**Architecture Doc:** See ARCHITECTURE.md section "Member Removal Architecture"

---

## 📋 Overview

This implementation plan covers the complete member removal system across three levels (subgroup, group, club) with comprehensive guardian-dependent relationship handling.

---

## 🎯 Implementation Phases

### Phase 1: Backend Foundation (Week 1)

#### Priority: HIGH - Foundation for all other work

**Deliverables:**
- 9 new Firebase Functions
- 1 enhanced Firebase Function
- TypeScript interfaces
- Unit tests for each function

---

#### 1.1 Discovery Functions (Read-Only)

**Function:** `checkGuardianDependentStatus.ts`
- **Path:** `functions/src/members/checkGuardianDependentStatus.ts`
- **Purpose:** Returns guardian/dependent relationship info for a user
- **Inputs:** `{ userId, clubId }`
- **Outputs:** 
  ```typescript
  {
    isYouth: boolean;
    isGuardian: boolean;
    guardians?: Array<{guardianUid, guardianName, guardianEmail}>;
    dependentCount?: number;
    dependentsInThisClub?: number;
    dependentIds?: Array<{uid, childName}>;
    hasOwnMembership?: boolean;
    hasOtherClubs: boolean;
    needsGuardianCleanup?: boolean;
  }
  ```
- **Firestore Operations:** 1 read (`/users/{userId}`)
- **Estimated Dev Time:** 3 hours
- **Testing Scenarios:**
  - Youth member with 1 guardian
  - Youth member with multiple guardians
  - Guardian with 1 dependent
  - Guardian with multiple dependents
  - Guardian who is also a player
  - Regular adult user

---

**Function:** `getMemberGroupMemberships.ts`
- **Path:** `functions/src/members/getMemberGroupMemberships.ts`
- **Purpose:** Returns all groups/subgroups user belongs to in a club
- **Inputs:** `{ clubId, userId }`
- **Outputs:**
  ```typescript
  {
    groups: string[];  // ["group1", "group2"]
    subgroups: {       // { "group1": ["subA", "subB"], "group2": ["subC"] }
      [groupId: string]: string[];
    }
  }
  ```
- **Firestore Operations:** 1 read (`/users/{userId}`)
- **Estimated Dev Time:** 2 hours
- **Testing Scenarios:**
  - User in 1 group, no subgroups
  - User in multiple groups with subgroups
  - User not in any groups
  - User in club but no groups

---

#### 1.2 User Document Update Functions

**Function:** `updateUserClubRemoval.ts`
- **Path:** `functions/src/users/updateUserClubRemoval.ts`
- **Purpose:** Remove club from user's clubAccess array
- **Inputs:** `{ userId, clubId }`
- **Firestore Operations:** 1 read + 1 write (`/users/{userId}`)
- **Estimated Dev Time:** 2 hours
- **Edge Cases:** User not in club, last club (should mark inactive separately)

---

**Function:** `updateUserGroupRemoval.ts`
- **Path:** `functions/src/users/updateUserGroupRemoval.ts`
- **Purpose:** Remove group from user's groupAccess array
- **Inputs:** `{ userId, clubId, groupId }`
- **Firestore Operations:** 1 read + 1 write (`/users/{userId}`)
- **Estimated Dev Time:** 2 hours
- **Edge Cases:** User not in group, last group in club

---

#### 1.3 Guardian-Specific Functions

**Function:** `updateGuardianDependentClubRemoval.ts`
- **Path:** `functions/src/members/updateGuardianDependentClubRemoval.ts`
- **Purpose:** Remove club from guardian's dependent tracking
- **Inputs:** `{ guardianUid, youthUid, clubId }`
- **Firestore Operations:** 1 read + 1 write (`/users/{guardianUid}`)
- **Estimated Dev Time:** 3 hours
- **Edge Cases:** 
  - Dependent not found in guardian's array
  - Guardian with multiple dependents
  - Last club for dependent

---

**Function:** `checkAndMarkGuardianInactive.ts`
- **Path:** `functions/src/members/checkAndMarkGuardianInactive.ts`
- **Purpose:** Check if guardian should be marked inactive
- **Inputs:** `{ guardianUid }`
- **Logic:**
  ```typescript
  // Mark inactive if:
  // 1. Guardian has no own club memberships (clubAccess.length === 0)
  // 2. All dependents have no club memberships (dependents.every(d => d.clubAccess.length === 0))
  ```
- **Firestore Operations:** 1 read + 0-1 write (`/users/{guardianUid}`)
- **Estimated Dev Time:** 3 hours
- **Testing Scenarios:**
  - Guardian with multiple dependents (1 removed, others active)
  - Guardian with own membership + dependent removed
  - Guardian with no membership, last dependent removed

---

#### 1.4 Inactivity Management

**Function:** `markUserInactive.ts`
- **Path:** `functions/src/users/markUserInactive.ts`
- **Purpose:** Mark user as inactive if no club memberships
- **Inputs:** `{ userId }`
- **Updates:**
  ```typescript
  {
    isActive: false,
    inactiveSince: serverTimestamp(),
    lastModified: serverTimestamp()
  }
  ```
- **Firestore Operations:** 1 read + 1 write (`/users/{userId}`)
- **Estimated Dev Time:** 2 hours
- **Testing:** Only marks inactive if clubAccess.length === 0

---

#### 1.5 Core Removal Functions

**Function:** `removeMemberFromClub.ts` (NEW)
- **Path:** `functions/src/members/removeMemberFromClub.ts`
- **Purpose:** Remove member from club member collection
- **Inputs:** `{ clubId, userId }`
- **Logic:**
  ```typescript
  1. Verify permissions (club-admin only)
  2. Get all groups in club
  3. For each group: call removeMemberFromGroup (includes subgroup cascade)
  4. Remove from: /clubs/{clubId}/allMembers/members
  5. Update member count, version, lastModified
  ```
- **Firestore Operations:** 
  - 1 read (groups query)
  - N reads + N writes (removeMemberFromGroup calls)
  - 1 read + 1 write (club member doc)
- **Estimated Dev Time:** 4 hours
- **NOTE:** This function does NOT update user document - that's handled by orchestration

---

**Function:** `removeMemberFromGroup.ts` (ENHANCE EXISTING)
- **Path:** `functions/src/members/removeMemberFromGroup.ts`
- **Enhancement:** Add subgroup cascade logic
- **New Logic:**
  ```typescript
  // After removing from group, add:
  
  // Get all subgroups in this group
  const subgroupsSnapshot = await groupRef
    .collection('subgroups')
    .get();
  
  // Remove member from each subgroup
  for (const subgroupDoc of subgroupsSnapshot.docs) {
    const subgroupMemberRef = subgroupDoc.ref
      .collection('allMembers')
      .doc('members');
      
    const subgroupMembersDoc = await subgroupMemberRef.get();
    if (subgroupMembersDoc.exists) {
      const members = subgroupMembersDoc.data()?.members || [];
      const updatedMembers = members.filter((m: any) => m.userId !== userId);
      
      await subgroupMemberRef.update({
        members: updatedMembers,
        memberCount: updatedMembers.length,
        version: admin.firestore.FieldValue.increment(1),
        lastModified: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }
  ```
- **Estimated Dev Time:** 2 hours
- **Testing:** Verify cascade to all subgroups

---

#### 1.6 Phase 1 Checklist

- [ ] Create `checkGuardianDependentStatus.ts`
- [ ] Create `getMemberGroupMemberships.ts`
- [ ] Create `updateUserClubRemoval.ts`
- [ ] Create `updateUserGroupRemoval.ts`
- [ ] Create `updateGuardianDependentClubRemoval.ts`
- [ ] Create `checkAndMarkGuardianInactive.ts`
- [ ] Create `markUserInactive.ts`
- [ ] Create `removeMemberFromClub.ts`
- [ ] Enhance `removeMemberFromGroup.ts` (subgroup cascade)
- [ ] Create TypeScript interfaces in `functions/src/types/interfaces.ts`
- [ ] Write unit tests for each function
- [ ] Deploy all functions to Firebase
- [ ] Test each function individually via Firebase console

**Total Estimated Time:** 25 hours (~1 week)

---

### Phase 2: Service Layer Orchestration (Week 2)

#### Priority: HIGH - Coordinates backend functions

**Deliverables:**
- 2 orchestration services
- 1 helper function
- TypeScript interfaces
- Integration tests

---

#### 2.1 Group-Level Removal Service

**File:** `services/orchestration/removeMemberFromGroup.ts`
- **Purpose:** Orchestrate group-level member removal
- **Steps:**
  1. Validate permissions (coach/admin/club-admin)
  2. Check guardian/dependent status
  3. Call `removeMemberFromGroup` (includes subgroup cascade)
  4. Update user document (remove group)
  5. If youth: Update all guardians' tracking
  6. Get club admin contacts for UI message
- **Returns:**
  ```typescript
  {
    success: boolean;
    message?: string;
    error?: string;
    clubAdminContacts?: string[];
    removedFrom?: {
      group: string;
      subgroups: string[];
    }
  }
  ```
- **Estimated Dev Time:** 4 hours

---

#### 2.2 Club-Level Removal Service

**File:** `services/orchestration/removeMemberFromClub.ts`
- **Purpose:** Orchestrate club-level member removal
- **Steps:**
  1. Validate permissions (club-admin only)
  2. Check guardian/dependent status
  3. BLOCK if guardian has dependents in this club
  4. Discover all group memberships
  5. Remove from all groups (each includes subgroup cascade)
  6. Remove from club
  7. Update user document
  8. If youth: Update all guardians + check inactive
  9. If regular user: Check if should be marked inactive
- **Returns:**
  ```typescript
  {
    success: boolean;
    message?: string;
    error?: string;
    details?: {
      dependents?: Array<{uid, childName}>;
      suggestion?: string;
    };
    clubAdminContacts?: string[];
    removedFrom?: {
      club: string;
      groups: string[];
      subgroups: string[];
    };
    cleanupActions?: {
      userMarkedInactive: boolean;
      guardiansNotified: number;
    }
  }
  ```
- **Estimated Dev Time:** 6 hours

---

#### 2.3 Helper Functions

**File:** `services/helpers/getClubAdminContacts.ts`
- **Purpose:** Fetch club admin email addresses for UI messages
- **Logic:**
  ```typescript
  export async function getClubAdminContacts(clubId: string): Promise<string[]> {
    const members = await fetchClubMembers(clubId);
    const admins = members.members?.filter(m => 
      m.roles?.includes('club-admin')
    ) || [];
    
    return admins.map(admin => admin.email);
  }
  ```
- **Estimated Dev Time:** 1 hour

---

#### 2.4 TypeScript Interfaces

**File:** `services/types/removal.ts` (NEW)
```typescript
export interface RemovalResult {
  success: boolean;
  message?: string;
  error?: string;
  details?: {
    dependents?: Array<{ uid: string; childName: string }>;
    suggestion?: string;
  };
  clubAdminContacts?: string[];
  removedFrom?: {
    club?: string;
    group?: string;
    groups?: string[];
    subgroups?: string[];
  };
  cleanupActions?: {
    userMarkedInactive: boolean;
    guardiansNotified: number;
  };
}

export interface GuardianDependentStatus {
  isYouth: boolean;
  isGuardian: boolean;
  guardians?: Array<{
    guardianUid: string;
    guardianName: string;
    guardianEmail: string;
  }>;
  dependentCount?: number;
  dependentsInThisClub?: number;
  dependentIds?: Array<{ uid: string; childName: string }>;
  hasOwnMembership?: boolean;
  hasOtherClubs: boolean;
  needsGuardianCleanup?: boolean;
}

export interface GroupMemberships {
  groups: string[];
  subgroups: {
    [groupId: string]: string[];
  };
}
```
- **Estimated Dev Time:** 1 hour

---

#### 2.5 Phase 2 Checklist

- [ ] Create `services/orchestration/removeMemberFromGroup.ts`
- [ ] Create `services/orchestration/removeMemberFromClub.ts`
- [ ] Create `services/helpers/getClubAdminContacts.ts`
- [ ] Create `services/types/removal.ts`
- [ ] Update `services/member.ts` exports
- [ ] Write integration tests
- [ ] Test complete removal flow (group level)
- [ ] Test complete removal flow (club level)
- [ ] Test guardian blocking logic
- [ ] Test youth removal with multiple guardians

**Total Estimated Time:** 15 hours (~1 week)

---

### Phase 3: UI Implementation (Week 3)

#### Priority: MEDIUM - User-facing components

**Deliverables:**
- 2 new screens
- 1 updated screen
- Confirmation modals
- Permission-based visibility

---

#### 3.1 Manage Members Screen

**File:** `app/manage-members.tsx`
- **Navigation:** `group-settings.tsx` → "Manage Members"
- **Features:**
  - Section-based layout (Member Actions, Coach Actions, Admin Actions)
  - Permission-based visibility
  - Navigation to add/remove screens
- **State:**
  ```typescript
  const [userRole, setUserRole] = useState<string>('member');
  const [groupName, setGroupName] = useState<string>('');
  ```
- **Components:**
  - Header with back button
  - Group info display
  - Action sections (collapsible or always visible)
  - Action items with icons
- **Estimated Dev Time:** 6 hours

---

#### 3.2 Remove Member Screen

**File:** `app/remove-member.tsx`
- **Navigation:** `manage-members.tsx` → "Remove Player/Coach/Admin"
- **Features:**
  - Member list filtered by type
  - Search functionality
  - Selection (radio buttons)
  - Guardian/dependent status checking
  - Confirmation modals (3 variants)
- **State:**
  ```typescript
  const [members, setMembers] = useState<GroupMemberData[]>([]);
  const [selectedMember, setSelectedMember] = useState<GroupMemberData | null>(null);
  const [loading, setLoading] = useState(false);
  const [guardianStatus, setGuardianStatus] = useState<GuardianDependentStatus | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [modalContent, setModalContent] = useState<any>(null);
  ```
- **Confirmation Modals:**
  1. Youth removal confirmation (shows guardian info)
  2. Guardian blocked modal (shows dependents)
  3. Standard confirmation (shows club admin contacts)
- **Estimated Dev Time:** 10 hours

---

#### 3.3 Update Group Settings Screen

**File:** `app/group-settings.tsx`
- **Changes:**
  - Replace "Add Player" option with "Manage Members"
  - Replace "Add Coach" option (remove, consolidated)
  - Update navigation
- **New Option:**
  ```typescript
  {
    label: "Manage Members",
    icon: "people",
    description: "Add or remove players, coaches, and admins",
    onPress: () => {
      router.push({
        pathname: '/manage-members',
        params: { groupId, clubId }
      });
    }
  }
  ```
- **Estimated Dev Time:** 1 hour

---

#### 3.4 Phase 3 Checklist

- [ ] Create `app/manage-members.tsx`
- [ ] Create `app/remove-member.tsx`
- [ ] Create modal components (or use existing)
- [ ] Update `app/group-settings.tsx`
- [ ] Implement permission checks in UI
- [ ] Add loading states
- [ ] Add error handling and user feedback
- [ ] Test navigation flow
- [ ] Test permission-based visibility
- [ ] Test all confirmation modal variants
- [ ] Test on iOS, Android, and Web

**Total Estimated Time:** 20 hours (~1 week)

---

### Phase 4: Testing & Polish (Week 4)

#### Priority: HIGH - Ensure quality and reliability

**Deliverables:**
- Comprehensive test suite
- Bug fixes
- Performance optimization
- Documentation updates

---

#### 4.1 Test Scenarios

**Subgroup Level Removal:**
- [ ] Remove player from subgroup (not in other subgroups)
- [ ] Remove player from subgroup (also in other subgroups)
- [ ] Verify player remains in parent group
- [ ] Verify UI shows correct message

**Group Level Removal:**
- [ ] Remove player from group with subgroups
- [ ] Verify cascade to all subgroups
- [ ] Verify player remains in club
- [ ] Verify UI shows correct message with club admin contacts

**Club Level Removal:**
- [ ] Remove player from club (in 2 groups, 3 subgroups)
- [ ] Verify cascade to all groups and subgroups
- [ ] Verify user document updated
- [ ] Verify inactive marking if no other clubs
- [ ] Verify UI shows complete removal report

**Guardian Scenarios:**
- [ ] Try to remove guardian with 1 active dependent (should block)
- [ ] Try to remove guardian with 2 active dependents (should block)
- [ ] Remove youth member with 1 guardian
- [ ] Remove youth member with 2 guardians
- [ ] Verify all guardians' dependents[] updated
- [ ] Remove last dependent, verify guardian marked inactive (if no own membership)
- [ ] Remove dependent, verify guardian NOT marked inactive (has own membership)
- [ ] Remove dependent, verify guardian NOT marked inactive (has other active dependent)

**Permission Tests:**
- [ ] Coach can remove players (group level)
- [ ] Coach cannot remove from club
- [ ] Admin can remove players and coaches (group level)
- [ ] Admin cannot remove from club
- [ ] Club-admin can remove from club
- [ ] Player cannot access manage members screen

**Edge Cases:**
- [ ] Last admin in group (should block)
- [ ] Self-removal by admin (show warning)
- [ ] Concurrent removal attempts
- [ ] Network failure during removal
- [ ] Orphaned data cleanup

---

#### 4.2 Performance Testing

- [ ] Measure removal time for user in 1 group
- [ ] Measure removal time for user in 5 groups, 10 subgroups
- [ ] Verify < 5 seconds for largest removal
- [ ] Check Firestore read/write costs
- [ ] Optimize if needed (parallel operations, batch writes)

---

#### 4.3 Phase 4 Checklist

- [ ] Execute all test scenarios
- [ ] Fix identified bugs
- [ ] Optimize slow operations
- [ ] Update ARCHITECTURE.md with learnings
- [ ] Create user-facing documentation
- [ ] Record demo video
- [ ] Prepare for production deployment

**Total Estimated Time:** 20 hours (~1 week)

---

## 📊 Overall Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Phase 1: Backend | 1 week | Week 1 | Week 1 |
| Phase 2: Services | 1 week | Week 2 | Week 2 |
| Phase 3: UI | 1 week | Week 3 | Week 3 |
| Phase 4: Testing | 1 week | Week 4 | Week 4 |
| **TOTAL** | **4 weeks** | - | - |

---

## 🎯 Success Metrics

### Functional Metrics
- ✅ All removal scenarios work correctly
- ✅ Guardian protection prevents invalid removals
- ✅ Cascade logic works for all levels
- ✅ Inactive users are marked correctly
- ✅ UI shows appropriate confirmations

### Performance Metrics
- ✅ Removal completes in < 5 seconds
- ✅ Cost per removal < $0.001
- ✅ No data inconsistencies after removal
- ✅ UI is responsive with proper loading states

### Quality Metrics
- ✅ 100% test coverage for critical paths
- ✅ Zero production bugs in first month
- ✅ Positive user feedback
- ✅ Clear error messages guide users

---

## 🚀 Deployment Strategy

### Pre-Deployment
1. Deploy backend functions to staging environment
2. Run full test suite
3. Perform load testing (simulate 100 concurrent removals)
4. Review Firestore security rules
5. Update documentation

### Deployment
1. Deploy backend functions to production
2. Monitor logs for 24 hours
3. Deploy service layer updates
4. Deploy UI updates (gradual rollout: 10% → 50% → 100%)
5. Monitor error rates and performance

### Post-Deployment
1. Monitor for 1 week
2. Collect user feedback
3. Address any issues
4. Plan Phase 5 enhancements (if needed)

---

## 📝 Notes

- All functions follow atomic pattern (single responsibility)
- User document remains single source of truth for memberships
- Guardian-dependent relationship is bidirectional
- Removal operations are idempotent (safe to retry)
- Cost analysis shows extremely low per-operation cost
- Architecture scales to millions of users

---

## 🤝 Next Steps

1. **Review this plan** with team/stakeholders
2. **Confirm timeline** and resource allocation
3. **Start Phase 1** backend development
4. **Set up CI/CD** for automated testing
5. **Schedule weekly check-ins** to track progress

---

**Plan Created By:** AI Assistant (Claude Sonnet 4.5)  
**Reviewed By:** [Pending]  
**Approved By:** [Pending]  
**Implementation Start Date:** [TBD]
