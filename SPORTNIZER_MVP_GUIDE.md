# Sportnizer MVP - Project Guide

## App Overview
**Sportnizer** is a cross-platform (iOS, Android, Web) React Native Expo app for organizing and managing sports groups, events, and team statistics.

## Core Technology Stack
- **Frontend**: React Native with Expo (Universal App)
- **Backend**: Firebase Suite
  - Firebase Authentication (user management)
  - Firebase Firestore (data storage)
  - Firebase Functions (server-side logic)
  - Firebase Storage (file storage)
- **Development**: Firebase Emulators for local development

## MVP Features Breakdown

### 1. User Authentication & Account Management
**Feature**: `loggingAccount`

**User Stories**:
- As a user, I can sign up for a new Sportnizer account
- As a user, I can sign in to my existing account
- As a user, I can sign out of my account
- As a user, I remain logged in between app sessions (persistent authentication)

**Technical Requirements**:
- Firebase Auth integration
- Secure token storage
- Auto-login on app restart
- Form validation for signup/signin

### 2. Group Creation & Management
**Feature**: `CreateGroup`

**User Stories**:
- As a user, I can create a new sports group
- As a user, I must provide group name, sport type, and location when creating a group
- As a group creator, I automatically become the admin of that group

**Technical Requirements**:
- Group data model (name, sport type, location, admin, members)
- Form validation for group creation
- Admin role assignment

### 3. Team Management & Invitations
**Feature**: `ManageTeams`

**User Stories**:
- As an admin, I can add members to my group
- As an admin, I can grant admin rights to other group members
- As an admin, I can invite existing Sportnizer users to join my group
- As an admin, I can invite new users via email to create an account and join my group
- As a user, I receive invitations in-app (existing users) or via email (new users)

**Technical Requirements**:
- Member management system
- Role-based permissions (admin/member)
- Invitation system for existing users
- Email invitation system for new users
- User search functionality

### 4. Event Scheduling & Management
**Feature**: `ManageTeams` (Events)

**User Stories**:
- As a user, I can schedule events (matches, training sessions) for my group
- As a user, I can invite all or specific group members to events
- As a user, I can accept or reject event invitations
- As a user, I can view who is attending specific events
- As a user, I can see event details (date, time, location, type)

**Technical Requirements**:
- Event data model (title, date, time, location, type, attendees)
- RSVP system (accept/reject/pending)
- Selective invitation system
- Real-time attendance tracking

### 5. Statistics & Tracking
**Feature**: `KeepTrack`

**User Stories**:
- As a user, I can view group statistics (attendance rates, points, scores)
- As an admin, I can customize what statistics to track for my group
- As an admin, I can add new tracking categories (goals, assists, wins, etc.)
- As a user, I can view individual and team performance metrics

**Technical Requirements**:
- Flexible statistics system
- Customizable tracking fields per group
- Data aggregation and calculation
- Performance metrics dashboard

## Data Models (High-Level)

### User
```
{
  uid: string
  email: string
  displayName: string
  createdAt: timestamp
  groups: [groupId]
}
```

### Group
```
{
  id: string
  name: string
  sportType: string
  location: string
  adminIds: [userId]
  memberIds: [userId]
  createdBy: userId
  createdAt: timestamp
  customStats: [statConfig]
}
```

### Event
```
{
  id: string
  groupId: string
  title: string
  type: string (match/training)
  date: timestamp
  location: string
  createdBy: userId
  invitedMembers: [userId]
  responses: {userId: 'accepted'|'rejected'|'pending'}
}
```

### Invitation
```
{
  id: string
  groupId: string
  invitedBy: userId
  invitedEmail: string
  invitedUserId?: string
  status: 'pending'|'accepted'|'rejected'
  type: 'group'|'event'
  createdAt: timestamp
}
```

## Implementation Phases

### Phase 1: Foundation
- Project setup with Firebase
- User authentication system
- Basic navigation structure

### Phase 2: Core Group Management
- Group creation
- Basic member management
- Admin role system

### Phase 3: Invitations & Events
- Invitation system
- Event creation and management
- RSVP functionality

### Phase 4: Statistics & Polish
- Statistics tracking system
- Performance metrics
- UI/UX improvements

## Technical Considerations

### Security Rules
- Users can only access their own data
- Group members can only access their group's data
- Admin-only operations properly protected

### Offline Support
- Basic offline functionality for viewing data
- Sync when connection restored

### Cross-Platform Compatibility
- Ensure consistent behavior across iOS, Android, and Web
- Platform-specific adaptations where necessary

## Success Metrics for MVP
- Users can successfully create accounts and authenticate
- Users can create and manage sports groups
- Users can invite others and manage events
- Basic statistics tracking is functional
- App works reliably across all three platforms

---

**Note**: This document serves as our north star for the Sportnizer MVP. All development decisions should align with these core features and user stories. We'll implement features step-by-step, ensuring each phase is solid before moving to the next.
