# 👨‍👩‍👧 Guardian-Dependent Removal Quick Reference

**Quick guide for understanding guardian-dependent removal scenarios**

---

## 🔑 Key Concepts

### Guardian Types
1. **Guardian Only** - Parent account managing child(ren) only
2. **Guardian + Player** - Parent who is also a player/coach in the club

### Dependent Types
- **Youth Member (player-underage)** - Child under 18 with NO login ability
- Managed entirely through guardian account
- Can be in multiple clubs/groups

---

## 📋 Decision Matrix

### When Removing a YOUTH Member

| Youth Has Other Clubs? | Action |
|------------------------|--------|
| ✅ YES | Remove from this club only<br>Keep youth active<br>Update all guardians' tracking |
| ❌ NO | Remove from club<br>Mark youth INACTIVE<br>Update all guardians' tracking<br>Check each guardian for inactivity |

**Guardian Updates:**
- ALL guardians' `dependents[].clubAccess[]` updated
- Each guardian checked separately for inactivity

---

### When Removing a GUARDIAN

| Guardian Has Dependents in Club? | Guardian Has Own Membership? | Action |
|----------------------------------|------------------------------|--------|
| ✅ YES | Any | ❌ **BLOCKED** - Show error with dependent names |
| ❌ NO | ✅ YES | ✅ Allow removal |
| ❌ NO | ❌ NO | ✅ Allow removal<br>May mark inactive if no other clubs |

**Error Message When Blocked:**
```
❌ Cannot Remove Guardian

Jane Doe cannot be removed because:
2 dependent(s) are still members:
• John Doe (youth1)
• Sarah Doe (youth2)

Please:
1. Remove dependents first, OR
2. Transfer guardianship
```

---

## 🎯 Guardian Inactivity Rules

A guardian is marked **INACTIVE** only when **ALL** conditions are true:

| Check | Description |
|-------|-------------|
| ✅ Own Memberships | `clubAccess.length === 0` |
| ✅ All Dependents | `dependents.every(d => d.clubAccess.length === 0)` |

### Examples

#### Example 1: Guardian Stays Active (Has Own Membership)
```
Guardian: Jane Doe
├─ Own clubs: 1 (Jane is a coach)
├─ Dependent: John (0 clubs - just removed)
└─ Result: ❌ STAY ACTIVE (Jane has own membership)
```

#### Example 2: Guardian Stays Active (Other Dependent Active)
```
Guardian: Jane Doe
├─ Own clubs: 0
├─ Dependent: John (0 clubs - just removed)
├─ Dependent: Sarah (1 club - still active)
└─ Result: ❌ STAY ACTIVE (Sarah still has membership)
```

#### Example 3: Guardian Marked Inactive
```
Guardian: Mike Smith
├─ Own clubs: 0
├─ Dependent: Tom (0 clubs - just removed)
├─ No other dependents
└─ Result: ✅ MARK INACTIVE
```

---

## 🔄 Removal Flow Diagrams

### Flow 1: Remove Youth with 1 Guardian

```
┌─────────────────────────────────────────┐
│ Remove Youth "John" from Club           │
└─────────────────┬───────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
Remove from   Remove from   Remove from
Group 1       Group 2       Club
(+ subgroups) (+ subgroups)
    │             │             │
    └─────────────┴─────────────┘
                  │
                  ▼
    Update John's /users/{youthUid}
    (Remove club from clubAccess[])
                  │
                  ▼
    Update Guardian Jane's /users/{guardianUid}
    (Remove club from dependents[0].clubAccess[])
                  │
                  ▼
    Check: Does John have other clubs?
       ├─ YES → Keep John active
       └─ NO → Mark John INACTIVE
                  │
                  ▼
    Check: Should Jane be marked inactive?
    ├─ Jane has own membership? → Keep active
    ├─ Jane has other active dependents? → Keep active
    └─ Neither? → Mark Jane INACTIVE
```

### Flow 2: Remove Youth with Multiple Guardians

```
┌─────────────────────────────────────────┐
│ Remove Youth "Sarah" from Club          │
│ Sarah has 2 guardians: Jane & Mike     │
└─────────────────┬───────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
Remove from   Remove from   Remove from
all groups    all subgroups  club
                  │
    ┌─────────────┴─────────────┐
    ▼                           ▼
Update Jane's              Update Mike's
dependents[]               dependents[]
    │                           │
    ▼                           ▼
Check Jane                 Check Mike
for inactivity             for inactivity
```

### Flow 3: Try to Remove Guardian (Blocked)

```
┌─────────────────────────────────────────┐
│ Try to Remove Guardian "Jane"           │
└─────────────────┬───────────────────────┘
                  │
                  ▼
    Check: Does Jane have dependents in club?
                  │
         ┌────────┴────────┐
         ▼                 ▼
       YES                NO
         │                 │
         ▼                 ▼
    ❌ BLOCK           ✅ ALLOW
    Show Error        Proceed with
    List dependents   removal
```

---

## 🧪 Test Scenarios Checklist

### Youth Removal Tests

- [ ] Youth with 1 guardian, 1 club → Both marked inactive
- [ ] Youth with 1 guardian, 2 clubs → Both stay active
- [ ] Youth with 2 guardians, 1 club → Youth inactive, check both guardians
- [ ] Youth with guardian who is also player → Guardian stays active
- [ ] Youth with guardian who has another active dependent → Guardian stays active

### Guardian Removal Tests

- [ ] Guardian with 1 dependent in club → BLOCKED
- [ ] Guardian with 2 dependents in club → BLOCKED  
- [ ] Guardian with dependent in different club → ALLOWED
- [ ] Guardian with no dependents → ALLOWED
- [ ] Guardian who is player with dependent → Remove from club, keep guardian active

### Edge Cases

- [ ] Youth with multiple guardians - remove youth, verify ALL guardians updated
- [ ] Guardian with multiple dependents - remove 1 dependent, guardian stays active
- [ ] Guardian with multiple dependents - remove last dependent, guardian marked inactive
- [ ] Youth in multiple groups - remove from 1 group, verify only that group removed

---

## 💬 UI Messages

### Youth Removal Confirmation
```
⚠️ Remove Youth Member

Are you sure you want to remove:
John Doe (Player-Underage)
Guardian: Jane Doe (jane@email.com)

From: Soccer Club?

This will:
✓ Remove John from all groups and subgroups in this club
✓ Update guardian Jane's dependent tracking
✓ Notify guardian of removal

⚠️ IMPORTANT:
Member will be removed from THIS CLUB ONLY.
To remove from other clubs, repeat this process.

[Cancel]  [Remove Member]
```

### Guardian Blocked Message
```
❌ Cannot Remove Guardian

Jane Doe cannot be removed because:
2 dependent(s) are still members of this club:
• John Doe (youth1)
• Sarah Doe (youth2)

Please:
1. Remove dependents first, OR
2. Transfer guardianship to another user

[OK]
```

### Standard Removal Confirmation
```
⚠️ Remove Member

Are you sure you want to remove:
Jane Doe (Coach)
jane@email.com

From: A-lager group?

⚠️ IMPORTANT:
This member will be removed from THIS GROUP and all subgroups.

To remove from the entire club, contact club admin:
📧 admin@club.com

[Cancel]  [Remove Member]
```

---

## 🎯 Quick Troubleshooting

### Problem: Guardian won't become inactive after removing last dependent

**Check:**
1. Does guardian have `clubAccess.length > 0`? (own membership)
2. Do any other dependents have `clubAccess.length > 0`?
3. Is `checkAndMarkGuardianInactive` being called?

### Problem: Youth removal doesn't update guardian's dependents[]

**Check:**
1. Is `updateGuardianDependentClubRemoval` being called?
2. Does youth document have correct `guardians[]` array?
3. Is guardian UID correct?

### Problem: Cannot remove member from club

**Check:**
1. Is user a club-admin?
2. If removing guardian, do they have dependents in this club?
3. Check error message for details

---

## 📊 Data Structure Reference

### Youth Document
```typescript
{
  uid: "youth123",
  displayName: "John Doe",
  isYouth: true,
  guardians: [
    {
      guardianUid: "guardian456",
      guardianName: "Jane Doe",
      guardianEmail: "jane@email.com"
    }
  ],
  clubAccess: [...]  // Same as adult users
}
```

### Guardian Document
```typescript
{
  uid: "guardian456",
  email: "jane@email.com",
  dependents: [
    {
      uid: "youth123",
      childName: "John Doe",
      clubAccess: [...]  // Duplicated for guardian's view
    }
  ],
  clubAccess: [...]  // Guardian's own memberships
}
```

---

**Last Updated:** January 24, 2026  
**See Also:** 
- ARCHITECTURE.md (Member Removal Architecture section)
- MEMBER_REMOVAL_IMPLEMENTATION_PLAN.md
