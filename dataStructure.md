# Sportnizer Database Structure

## Overview
This document outlines the new database architecture strategy we've agreed upon for Sportnizer. It clearly distinguishes between what has been **discussed/planned** versus what has been **implemented**.

---

## ✅ IMPLEMENTED FEATURES

### User Authentication & Management
- **Email Verification System**: ✅ Fully implemented
  - Users must verify email before accessing the app
  - Custom verification messages with clear instructions
  - Automatic sign-out after account creation
  - Custom Email verification handled by Firebase fucntion to be implemented  

- **User Document Structure**: ✅ Implemented in signup flow
  ```javascript
  // Collection: users/{uid}
  {
    name: "Full Name",
    email: "user@example.com",
    createdAt: serverTimestamp(),
    groupsCreated: 0,
    emailVerified: false
  }
  ```

### SMTP Configuration
- **Custom Domain Email**: ✅ Configured via Firebase Console
  - Emails now sent from custom domain (pending 48hr activation)
  - Professional SMTP setup with Strato hosting
  - Improved deliverability to avoid spam folders

---

## 🔄 DISCUSSED BUT NOT YET IMPLEMENTED

### New Database Architecture Strategy

#### **1. Collections Structure**
```
/users/{uid}
  - name: string
  - email: string
  - createdAt: timestamp
  - groupsCreated: number
  - emailVerified: boolean

/groups/{groupId}
  - name: string
  - description: string
  - createdBy: string (user uid)
  - createdAt: timestamp
  - memberCount: number
  - customStats: array[3] (optional custom stat names defined by group creator)
    // Example: ["Goals Scored", "Assists", "Yellow Cards"]

/groups/{groupId}/members/{uid}
  - joinedAt: timestamp
  - role: "owner" | "admin" | "member"
  - invitedBy: string (user uid)
  - customStats: object (dynamic fields based on group's customStats)
    // Example: { "Goals Scored": 0, "Assists": 0, "Yellow Cards": 0 }
    // Note: Field names match exactly what group creator defined

/invitations/{invitationId}
  - email: string
  - groupId: string
  - groupName: string
  - inviterName: string
  - inviterUid: string
  - createdAt: timestamp
  - expiresAt: timestamp
  - status: "pending" | "accepted" | "expired"
  - token: string
```

#### **2. Key Benefits of New Structure**
- **Subcollections for Members**: No more array limitations
- **Scalable Group Management**: Can handle unlimited members per group
- **Better Query Performance**: Efficient member listing and filtering
- **Clear Invitation Tracking**: Dedicated collection for invitation management
- **Role-Based Access**: Proper admin/member distinction

#### **3. Custom Stats Feature**
When a group creator creates a new group, they can define up to 3 optional custom statistics that will be tracked for each member.

**Example Flow:**
1. **Group Creation**: User creates "Soccer Team Alpha" and defines custom stats:
   - Custom Stat 1: "Goals Scored"
   - Custom Stat 2: "Assists" 
   - Custom Stat 3: "Yellow Cards"

2. **Group Document**: The group document stores these custom stat names:
   ```javascript
   /groups/soccerTeamAlpha123 {
     name: "Soccer Team Alpha",
     customStats: ["Goals Scored", "Assists", "Yellow Cards"]
     // ... other fields
   }
   ```

3. **Member Documents**: Each member's document includes these custom stats as individual fields:
   ```javascript
   /groups/soccerTeamAlpha123/members/user123 {
     joinedAt: timestamp,
     role: "member",
     customStats: {
       "Goals Scored": 5,
       "Assists": 3,
       "Yellow Cards": 1
     }
     // ... other fields
   }
   ```

**Benefits:**
- **Dynamic Fields**: Custom stat names become actual field names in member documents
- **Flexible Tracking**: Each group can track different statistics relevant to their sport/activity
- **Easy Queries**: Can query and sort members by their custom stat values
- **Scalable**: Up to 3 custom stats per group to keep UI manageable

#### **4. Migration Strategy**
- ✅ **Phase 1**: User authentication and email verification (COMPLETED)
- 🔄 **Phase 2**: Update Firebase Functions to use new schema (PENDING)
- 🔄 **Phase 3**: Implement group creation with subcollections (PENDING)
- 🔄 **Phase 4**: Update invitation processing to new structure (PENDING)
- 🔄 **Phase 5**: Test complete flow with new architecture (PENDING)

---

## 📋 CURRENT STATE

### What's Working
- ✅ User signup with full name collection
- ✅ Email verification flow
- ✅ Proper user document creation in Firestore
- ✅ Custom domain SMTP configuration
- ✅ Professional invitation emails

### What Needs Implementation
- 🔄 Firebase Functions update to new database schema
- 🔄 Group creation with subcollection-based members
- 🔄 Invitation processing with new structure
- 🔄 Group management UI updates
- 🔄 Member role management

### Firebase Functions Status
- **Current**: Still using old array-based member structure
- **Planned**: Will be updated to use new subcollection structure
- **Dependencies**: Waiting for custom domain email activation (48 hours)

---

## 🎯 NEXT STEPS

1. **Wait for Custom Domain Email Activation** (24-48 hours)
2. **Test Email Verification with Custom Domain**
3. **Update Firebase Functions to New Schema**
4. **Implement Group Creation with Subcollections**
5. **Update Invitation Processing Logic**
6. **Test Complete Invitation Flow**

---

## 📝 NOTES

- **Database Schema**: Designed for scalability and performance
- **Email System**: Professional setup with custom domain
- **User Experience**: Comprehensive verification and invitation flows
- **Security**: Email verification required before app access
- **Compatibility**: Cross-platform React Native/Expo implementation

---

*Last Updated: August 23, 2025*  
*Status: Phase 1 Complete, Phase 2+ Pending Implementation*
