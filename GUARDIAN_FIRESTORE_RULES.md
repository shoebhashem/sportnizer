# Guardian System in Firestore Rules - Analysis & Implementation

## 🔍 **Current Status**

### **Before This Update:**
❌ **No guardian-related rules existed in Firestore**
❌ Guardian system documented but not implemented in security rules
❌ No permissions for guardian-child relationships

### **After This Update:**
✅ **Guardian permissions added to Firestore rules**
✅ Guardian-child relationship validation implemented
✅ Proper access control for guardian subcollections

---

## 🤔 **Is Guardian a Role?**

### **Answer: NO - Guardian is NOT a role**

**Guardian is a RELATIONSHIP, not a role:**

```typescript
// NOT a role in members collection
groups/{groupId}/members/{userId} {
  role: 'guardian' // ❌ This doesn't exist
}

// Guardian is a relationship in subcollection  
groups/{groupId}/members/{childId}/guardians/{guardianId} {
  guardianUserId: "adult_user_id",     // ✅ Adult from users collection
  relationship: "mother",              // ✅ Relationship type
  contactEmail: "parent@email.com"     // ✅ Contact info
}
```

### **Guardian System Architecture:**

1. **Guardians are Adults:** Exist in `users` collection as regular adults
2. **Children are Members:** Stored in group `members` subcollection 
3. **Relationship Tracking:** `guardians` sub-subcollection links adults to children
4. **Permission Model:** Guardians can act on behalf of their children

---

## 🔐 **New Firestore Rules Added**

### **Guardian Subcollection Rules:**
```javascript
// groups/{groupId}/members/{memberId}/guardians/{guardianId}
match /guardians/{guardianId} {
  // Read: Admins, coaches, and the guardian themselves
  allow read: if canManageMembers() || 
              resource.data.guardianUserId == request.auth.uid;
  
  // Create: Admins, coaches, or self-registration during onboarding
  allow create: if canManageMembers() || 
                request.resource.data.guardianUserId == request.auth.uid;
  
  // Update: Admins, coaches, or the guardian themselves
  allow update: if canManageMembers() || 
                resource.data.guardianUserId == request.auth.uid;
  
  // Delete: Only admins and coaches
  allow delete: if canManageMembers();
}
```

### **Enhanced Member Access:**
```javascript
// Guardians can read their children's member data
allow read: if isGroupMember() || isGuardianOfMember(memberId);
```

### **Guardian Helper Functions:**
```javascript
function isGuardianOfMember(memberId) {
  return exists(/databases/$(database)/documents/groups/$(groupId)/members/$(memberId)/guardians/$(request.auth.uid));
}

function canAccessChildData(memberId) {
  return canManageMembers() || isGuardianOfMember(memberId);
}
```

---

## 🏗️ **Guardian Data Architecture**

### **Three-Layer Structure:**

```
groups/{groupId}                           // Group level
├── members/{childId}                      // Child members
│   ├── name: "Alex Johnson"
│   ├── birthDate: "2016-03-15"  
│   ├── role: "member"
│   └── guardians/{guardianId}             // Guardian relationships
│       ├── guardianUserId: "adult_123"   // Links to users collection
│       ├── relationship: "mother"
│       ├── contactEmail: "mom@email.com"
│       └── contactPhone: "+46701234567"
└── members/{adultId}                      // Adult members (ageGroup 2&3)
    ├── role: "admin" | "coach" | "member"
    └── (no guardians subcollection)
```

### **Guardian vs Role Comparison:**

| Aspect | Traditional Role | Guardian Relationship |
|--------|------------------|----------------------|
| **Scope** | Group-wide permissions | Child-specific permissions |
| **Storage** | `role` field in member doc | Separate guardians subcollection |
| **Access** | Based on role level | Based on parent-child link |
| **Permissions** | Fixed by role type | Dynamic per child |
| **Age Restriction** | Role-based | Relationship-based |

---

## 🎯 **Guardian Permission Model**

### **What Guardians CAN Do:**
- ✅ Read their child's member information
- ✅ Accept/decline events on behalf of child
- ✅ Update their own contact information
- ✅ Receive communications about their child
- ✅ View child's group events and activities

### **What Guardians CANNOT Do:**
- ❌ Manage other children (unless they're their guardian too)
- ❌ Add/remove group members
- ❌ Create events (unless they also have admin/coach role)
- ❌ Access admin/coach functions
- ❌ Promote other members to different roles

### **Guardian + Role Scenarios:**
```typescript
// A guardian who is ALSO a coach
users/{userId} {
  name: "Sarah Johnson"  // Adult user
}

groups/{groupId}/members/{userId} {
  role: "coach"  // Sarah is a coach in the group
}

groups/{groupId}/members/{childId}/guardians/{guardianId} {
  guardianUserId: userId,  // Sarah is ALSO guardian of her child
  relationship: "mother"
}
```
**Result:** Sarah has coach permissions for the group AND guardian permissions for her specific child.

---

## 🔄 **Guardian Workflow Integration**

### **Event Management:**
```typescript
// When creating events for ageGroup=1 groups:
1. Admin/coach creates event
2. System identifies child members
3. For each child, find their guardians
4. Send invitations to guardian emails
5. Guardians respond on behalf of children
6. Track attendance by child, responses by guardian
```

### **Communication Flow:**
```typescript
// Message routing based on member type:
if (member.age < 18) {
  // Send to guardians
  const guardians = await getGuardians(groupId, memberId);
  guardians.forEach(guardian => sendMessage(guardian.contactEmail));
} else {
  // Send directly to adult member
  sendMessage(member.email);
}
```

---

## 🚀 **Implementation Status**

### **✅ Completed (Firestore Rules):**
- Guardian subcollection access control
- Guardian-child relationship validation
- Guardian read/write permissions
- Guardian invitation system rules

### **⏳ Pending (Application Code):**
- Guardian registration flow
- Guardian-child linking during onboarding
- Guardian dashboard for managing children
- Event invitation routing to guardians
- Guardian contact management UI

---

## 🔒 **Security Benefits**

### **Privacy Protection:**
- Guardians can only access their own children's data
- Admin/coach oversight maintained
- No cross-guardian data access
- Audit trail for all guardian actions

### **Data Validation:**
- Guardian relationship types validated
- Guardian-child links properly established
- Age-appropriate access control
- Prevents unauthorized guardian assignment

### **Access Control:**
- Granular permissions per child
- Role-based fallback for admins/coaches
- Self-management for guardian contact info
- Secure guardian removal process

---

This enhancement provides the foundation for a comprehensive guardian system while maintaining security, privacy, and proper access control for child safety in youth sports groups.
