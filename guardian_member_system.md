# Guardian/Member System Implementation Plan

## 📋 **System Overview**

This document outlines the complete implementation plan for incorporating guardians and age-based member management into the Sportnizer app.

### **Core Concept:**
- **Users Collection:** Adults only (admins, coaches, guardians)
- **Members Subcollection:** Children/youth for ageGroup=1 groups
- **Guardians Sub-subcollection:** Adult guardians managing children

---

## 🗃️ **Final Confirmed Data Structure**

### **Groups Collection:**
```typescript
groups/{groupId} {
  name: "Gais Pojkar 2016",
  sportType: "Football",
  ageGroup: 1, // 1=children(≤18), 2=adults(18+), 3=mixed
  unconfirmedChildren: [
    {
      name: "Alex Johnson",
      birthDate?: "2016-03-15", // Optional - if club has this data
      confirmationSent: false,
      invitationCode?: string // Generated when invitation sent
    },
    {
      name: "Emma Smith", 
      birthDate?: "2015-08-22",
      confirmationSent: false,
      invitationCode?: string
    }
  ],
  coaches: [
    {
      uid: "coachUserId",
      email: "coach@email.com", 
      name: "John Doe",
      role: "coach",
      addedAt: timestamp,
      addedBy: "adminUserId",
      isExternal: false // true if invited externally, false if promoted
    }
  ],
  createdBy: "userId",
  membersCount: 5,
  createdAt: timestamp
}
```

### **Users Collection (Adults Only):**
```typescript
users/{userId} {
  name: "Sarah Johnson",
  email: "sarah@email.com",
  emailVerified: true,
  groupsCreated: 2,
  groupsJoined: ["groupId1", "groupId2"],
  createdAt: timestamp,
  verifiedAt: timestamp
}
```

### **Members Subcollection (Children/Youth):**
```typescript
groups/{groupId}/members/{memberId} {
  name: "Alex Johnson", // Child's name
  birthDate: "2016-03-15",
  role: "member", // Always member for children
  joinedAt: timestamp
}
```

### **Guardians Sub-subcollection:**
```typescript
groups/{groupId}/members/{memberId}/guardians/{guardianId} {
  guardianUserId: "userId_from_users_collection",
  relationship: "mother" | "father" | "guardian",
  contactEmail: "parent@email.com",
  contactPhone: "+46701234567",
  addedAt: timestamp
}
```

---

## 🏈 **Coach Addition Process**

### **ageGroup 1 (Children Groups):**
- **Cannot promote children to coach** (age restriction)
- **Can promote guardians to coach:** Select from existing members' guardians
- **Can invite external adults:** Send coach invitation to external adult email

### **ageGroup 2 & 3 (Adult/Mixed Groups):**
- **Can promote existing members to coach:** Select from current group members
- **Can promote guardians to coach:** Select from existing members' guardians (ageGroup 3 only)
- **Can invite external adults:** Send coach invitation to external adult email

### **Coach Invitation Flow:**
```
1. Admin clicks "Add Coach" in group-settings
2. Admin chooses:
   - "Promote Member" (ageGroup 2&3 only)
   - "Promote Guardian" (ageGroup 1&3 only) 
   - "Invite External Adult" (all ageGroups)
3. System sends appropriate invitation/promotion
4. New coach appears in group coaches list
```

---

## 📧 **Guardian Confirmation System**

### **Unconfirmed Children Management:**
- Admin maintains list of children not yet confirmed by guardians
- Admin can select specific child(ren) to send confirmation links
- Each child gets personalized invitation link for their guardians

### **Confirmation Link Process:**
```
1. Admin selects child(ren) from unconfirmed list
2. System generates unique invitation code per child
3. Personalized link sent to guardian emails:
   "Confirm Alex Johnson's participation in Gais Pojkar 2016"
4. Guardian clicks link → registers/logs in → confirms child
5. Child moves from unconfirmedChildren to confirmed members
```

---

## 🔄 **Invitation & Registration Flow**

### **1. Group Creation Process:**
```
1. Adult creates ageGroup=1 group
2. Admin specifies enrolled children list:
   - Alex Johnson
   - Emma Smith  
   - Liam Wilson
3. Group created with enrolledChildren array
```

### **2. Invitation Process:**
```
1. Admin selects specific child(ren) from enrolled list
2. System generates personalized invitation link:
   - For Alex Johnson's guardians
   - For Emma Smith's guardians
3. Separate links sent to respective guardian emails
```

### **3. Guardian Registration:**
```
1. Guardian clicks child-specific link
2. Guardian signs up as adult user (users collection)
3. Onboarding shows pre-filled child information:
   - Name: "Alex Johnson" (pre-filled, read-only)
   - Birth Date: "2016-03-15" (pre-filled if available)
4. Guardian provides:
   - Their relationship: mother/father/guardian
   - Contact phone number
   - Any missing child information
5. Child added to members subcollection
6. Guardian added to child's guardians sub-subcollection
```

### **4. Multiple Children Support:**
```
- One guardian can register multiple children from enrolled list
- Example: Parent with twins both enrolled in same group
- Guardian completes registration for all their children in single flow
```

---

## 🖥️ **UI Design Specifications**

### **Member Display (manage-group.tsx):**
```
Members Tab shows:
├─ Alex Johnson (age 8) [⋮]
├─ Emma Smith (age 9) [⋮]
└─ Liam Wilson (age 8) [⋮]

Kebab Menu Options:
├─ View Profile
├─ Contacts ← NEW (shows guardians)
└─ Remove from Group
```

### **Contacts Modal:**
```
Contacts for Alex Johnson:
├─ Sarah Johnson (mother) - parent@email.com, +46701234567
└─ Mike Johnson (father) - dad@email.com, +46709876543

[Contact via Email] [Contact via Phone] buttons
```

---

## 🔐 **Permission & Validation Rules**

### **Age Boundaries:**
- **Children/Youth:** 0-18 years old
- **Adults:** 18+ years old
- **Validation:** Automatic during registration based on birthDate

### **Group Access Rules:**
- **ageGroup=1:** Only children can be members
- **ageGroup=2:** Only adults can be members  
- **ageGroup=3:** Both children and adults can be members

### **Administrative Roles:**
- **Admin/Coach:** Must be adults (18+)
- **Guardians:** Must be adults, manage children only
- **Members:** Age-appropriate based on group ageGroup

### **Guardian Permissions:**
- All guardians have equal permissions (no isPrimary)
- Any guardian can accept/decline event invitations
- Last response before deadline takes precedence
- All guardians receive communication about their child

---

## 📨 **Communication Routing**

### **Event Invitations:**
```
ageGroup=1 groups:
- Event created → Invitations sent to guardian emails
- Guardians respond on behalf of children
- Children attendance tracked, guardian responses recorded

ageGroup=2 groups:
- Event created → Invitations sent directly to adult members
- Adults respond for themselves

ageGroup=3 groups:
- Event created → Mixed routing:
  - Adult members: Direct invitations
  - Child members: Invitations to guardians
```

### **Group Communications:**
- **Announcements:** Sent to guardians for children, direct to adults
- **Schedule Changes:** Guardians notified for children
- **Emergency Contacts:** Admin/coach can access guardian information

---

## 🚀 **Implementation Phases**

### **✅ Phase 1A: Basic ageGroup Support** 
- [ ] Add ageGroup field to group creation form
- [ ] Update groupService to store ageGroup
- [ ] Update Firestore rules for ageGroup validation
- [ ] Update group interfaces and types

### **⏳ Phase 1B: Enhanced Group Management & Coach System**
- [ ] Add "Add Coach" option to group-settings (all ageGroups)
- [ ] Add "Send Confirmation Link to Guardians" option (ageGroups 1 & 3 only)
- [ ] Implement coach role in Firestore schema and permissions
- [ ] Create coach promotion system:
  - ageGroup 2&3: Promote existing members to coach
  - ageGroup 1: Promote guardians to coach  
  - All ageGroups: Invite external adults as coach
- [ ] Add unconfirmed children management system

### **⏳ Phase 1C: Member Profile & Management System**
- [ ] Update member kebab menus with role-based visibility
- [ ] Create member-profile.tsx screen
- [ ] Implement view/edit member information
- [ ] Add guardian contacts display
- [ ] Enable guardian editing of their children's profiles

### **⏳ Phase 1D: Enhanced Invitation System**
- [ ] Create child-specific invitation links
- [ ] Build guardian registration flow with pre-filled data
- [ ] Implement guardian-child linking during onboarding
- [ ] Update invitation email templates

### **⏳ Phase 2: Member Management UI**
- [ ] Update manage-group.tsx member display
- [ ] Add "Contacts" option to member kebab menu
- [ ] Create guardian contacts modal
- [ ] Implement age display for members

### **⏳ Phase 3: Enhanced Communication**
- [ ] Route event invitations based on member type
- [ ] Update notification system for guardians
- [ ] Implement guardian response handling
- [ ] Add emergency contact features

---

## 🎯 **Key Design Decisions Made**

### **Simplified Approach:**
- ✅ No isPrimary guardian designation
- ✅ No complex permission system for guardians
- ✅ Equal guardian permissions with last-response-wins
- ✅ Guardians not visible in member lists

### **Invitation Strategy:**
- ✅ Separate invitation links per child
- ✅ Pre-filled child information during registration
- ✅ Multiple children support for same guardian
- ✅ Admin-controlled enrolled children list

### **Age Management:**
- ✅ 18 years as adult/child boundary
- ✅ Automatic age validation during registration
- ✅ Age-based group membership restrictions
- ✅ Admin/coach roles restricted to adults

### **Data Efficiency:**
- ✅ Users collection contains only adults
- ✅ Children data stored in group-specific members subcollection
- ✅ Guardian relationships stored per child per group
- ✅ Minimal cross-collection references

---

## 📝 **Implementation Notes**

### **Current Status:**
- Groups screen has real-time listeners implemented
- Group creation, deletion, and member management working
- Firestore rules support admin/coach/member roles
- Ready to extend with ageGroup and guardian support

### **Next Steps:**
Starting with Phase 1A - adding ageGroup field to existing group creation workflow without breaking current functionality.

### **Future Considerations:**
- Push notifications for guardians (mobile)
- Bulk invitation system for multiple children
- Guardian dashboard for managing multiple children across groups
- Compliance with child protection regulations

---

*Document created: September 1, 2025*
*Last updated: September 1, 2025*
