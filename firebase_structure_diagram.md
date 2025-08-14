# Firestore Data Structure – Sportnizer App

This document defines the **Firestore database structure** for the Sportnizer app.  
It is intended as a reference for developers and to guide GitHub Copilot suggestions.

---

## 1. Overview

The database is organized around **users**, **groups**, and related subcollections for **members**, **events**, and **results**.  
The structure is optimized for:
- Minimizing read/write costs
- Enforcing user permissions
- Supporting private groups
- Allowing scalable statistics tracking

---

## 2. Top-Level Collections

### **`users`**
Stores individual user accounts.

| Field             | Type     | Description |
|-------------------|----------|-------------|
| `name`            | string   | Full name of the user |
| `email`           | string   | Email address |
| `groupsJoined`    | array    | List of group IDs the user is part of |
| `groupsCreated`   | number   | Number of groups created by the user (used for rate limiting) |
| `createdAt`       | timestamp| Account creation date |

**Example:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "groupsJoined": ["groupId_1", "groupId_2"],
  "groupsCreated": 2,
  "createdAt": "2025-08-13T12:00:00Z"
}
groups

Represents a sports group/team.

Field	Type	Description
name	string	Group name
sportType	string	Sport type (e.g., "Football", "Basketball")
location	string	Location of the group
createdBy	string	User ID of the group creator
createdAt	timestamp	Creation date
membersCount	number	Current member count
customStats	array	List of up to 3 custom stat names (e.g., ["wins", "goals", "assists"])

Example:

{
  "name": "Champions League Legends",
  "sportType": "Football",
  "location": "Stockholm",
  "createdBy": "userId_1",
  "createdAt": "2025-08-13T12:00:00Z",
  "membersCount": 5,
  "customStats": ["wins", "goals", "assists"]
}

3. Subcollections
groups/{groupId}/members

Stores members of a group and their roles.

Field	Type	Description
role	string	"admin" or "member"
joinedAt	timestamp	Date the member joined

Example:

{
  "role": "admin",
  "joinedAt": "2025-08-13T12:00:00Z"
}

groups/{groupId}/events

Stores scheduled events for a group.

Field	Type	Description
title	string	Event name
date	timestamp	Event date
createdBy	string	User ID of event creator
invites	array	List of user IDs invited
status	map	Object of `{userId: "accepted"

Example:

{
  "title": "Match Day 1",
  "date": "2025-09-01T15:00:00Z",
  "createdBy": "userId_1",
  "invites": ["userId_2", "userId_3"],
  "status": {
    "userId_2": "accepted",
    "userId_3": "pending"
  }
}

groups/{groupId}/results

Stores performance stats for members.

Field	Type	Description
userId	string	Member ID
statType	string	One of the group's custom stats
value	number	Stat value (e.g., number of wins)
recordedAt	timestamp	Date recorded

Example:

{
  "userId": "userId_1",
  "statType": "wins",
  "value": 3,
  "recordedAt": "2025-09-02T12:00:00Z"
}

5. Cost Optimization Strategies

Limit group creation per user
Track groupsCreated in users collection and enforce max limit (e.g., 3 groups per user).

Limit custom stats
Max 3 per group to avoid large documents.

Avoid large arrays
Use subcollections for members and events instead of storing them as arrays in groups.

Selective queries
Only fetch needed fields (.select() in Firestore).

Paginate results
Use .limit() and pagination for listing members or results.

# Sportnizer Firestore Data Structure

This document describes the optimized Firestore structure for the Sportnizer app to keep costs low while allowing flexible features.

---

## Firestore Collections & Subcollections

### 1. `users` (top-level collection)
Stores basic user profile and meta-data.  
**Path:** `/users/{userId}`

**Fields:**
- `name` (string)
- `email` (string)
- `groupsJoined` (array of group IDs)
- `groupsCreated` (number)
- `createdAt` (timestamp)

---

### 2. `groups` (top-level collection)
Stores metadata about each group.  
**Path:** `/groups/{groupId}`

**Fields:**
- `name` (string)
- `sportType` (string)
- `location` (string)
- `createdBy` (userId)
- `createdAt` (timestamp)
- `membersCount` (number)
- `customStats` (array of strings — max 3 types allowed, e.g., `["wins","goals","assists"]`)

---

#### Subcollection: `members`
Stores each member’s role and join date in this group.  
**Path:** `/groups/{groupId}/members/{memberId}`

**Fields:**
- `userId` (string)
- `role` (string: `"admin"` or `"member"`)
- `joinedAt` (timestamp)

---

#### Subcollection: `events`
Stores all events (matches, trainings, etc.) scheduled for the group.  
**Path:** `/groups/{groupId}/events/{eventId}`

**Fields:**
- `title` (string)
- `date` (timestamp)
- `createdBy` (userId)
- `invites` (array of userIds)
- `status` (map of `{ userId: "accepted" | "rejected" | "pending" }`)

---

#### Subcollection: `results`
Stores results/stats for members in this group.  
**Path:** `/groups/{groupId}/results/{resultId}`

**Fields:**
- `userId` (string)
- `statType` (string — matches one of `customStats`)
- `value` (number)
- `recordedAt` (timestamp)

---

## ER-like Diagram

```mermaid
erDiagram
    USERS {
        string name
        string email
        array groupsJoined
        number groupsCreated
        timestamp createdAt
    }
    GROUPS {
        string name
        string sportType
        string location
        string createdBy
        timestamp createdAt
        number membersCount
        array customStats
    }
    MEMBERS {
        string userId
        string role
        timestamp joinedAt
    }
    EVENTS {
        string title
        timestamp date
        string createdBy
        array invites
        map status
    }
    RESULTS {
        string userId
        string statType
        number value
        timestamp recordedAt
    }

    USERS ||--o{ GROUPS : "creates"
    USERS ||--o{ MEMBERS : "joins"
    GROUPS ||--o{ MEMBERS : "has"
    GROUPS ||--o{ EVENTS : "schedules"
    GROUPS ||--o{ RESULTS : "tracks"
