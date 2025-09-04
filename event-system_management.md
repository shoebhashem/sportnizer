# Event System Management - Sportnizer

## 📋 **Project Overview**

Comprehensive event scheduling and management system for sports groups, allowing admins and coaches to create, schedule, and manage events while enabling members to respond to invitations.

**Target Users:** Admins and Coaches (event creators), All Members (event participants)

---

## 🎯 **Feature Specifications**

### **Event Management Requirements**
- ✅ **Role-Based Access**: Only admins and coaches can create/manage events
- ✅ **Calendar Tab**: Additional tab between Home and Groups (conditional visibility)
- ✅ **Event Types**: One-time and Recurring events
- ✅ **Predefined Categories**: Training, Match, Meeting
- ✅ **Flexible Recipients**: All members, specific subgroups, or custom member lists
- ✅ **Complete Scheduling**: Date, time (start/end/gathering), location
- ✅ **Member Responses**: Accept/Decline with optional RSVP deadline
- ✅ **Event Editing**: Admins/coaches can modify events after creation
- ✅ **Response Visibility**: All participants can see who's attending

### **User Interaction Flow**
```
Calendar Tab → Manage Events → Create Event → Select Event Type → 
Select Group → Select Recipients → Schedule Details → Send Event
```

### **Technical Specifications**
- **Recurring Patterns**: Weekly, Bi-weekly, Monthly (simple patterns)
- **Time Format**: 24-hour format
- **Calendar View**: Monthly calendar view
- **Response Options**: Accept/Decline (no "Maybe")
- **RSVP Deadline**: Optional (admin/coach can set or leave open)
- **Notifications**: Planned for later phase
- **Platform Support**: React Native (mobile) + Web

---

## 🗃️ **Database Structure**

### **Events Collection**
```typescript
// groups/{groupId}/events/{eventId}
interface Event {
  // Basic Info
  id: string;
  title: string;
  description?: string;
  category: 'Training' | 'Match' | 'Meeting';
  
  // Scheduling
  type: 'one-time' | 'recurring';
  date: timestamp;
  startTime: string; // "14:00"
  endTime: string; // "16:00" 
  gatheringTime?: string; // "13:45"
  location: string;
  
  // Recurring Details (if applicable)
  recurringPattern?: {
    frequency: 'weekly' | 'bi-weekly' | 'monthly';
    endDate?: timestamp;
    occurrences?: number;
  };
  
  // Participants
  createdBy: string; // userId of admin/coach
  invitedMembers: string[]; // array of member IDs
  recipientType: 'all' | 'subgroup' | 'custom';
  subgroupId?: string; // if recipientType is 'subgroup'
  
  // Responses
  responses: {
    [memberId]: {
      status: 'accepted' | 'declined' | 'pending';
      respondedAt?: timestamp;
    }
  };
  
  // RSVP Management
  rsvpDeadline?: timestamp; // optional deadline
  
  // Metadata
  createdAt: timestamp;
  updatedAt: timestamp;
  isActive: boolean; // for soft deletion
}
```

### **User Role Tracking**
```typescript
// Enhanced user context to track roles across groups
interface UserContext {
  uid: string;
  groupRoles: {
    [groupId]: 'admin' | 'coach' | 'member';
  };
  canCreateEvents: boolean; // computed property
}
```

---

## 🏗️ **Implementation Plan**

### **Phase 1: Foundation & Navigation (Week 1)**

#### **1.1 Calendar Tab Setup**
- [x] Modify `app/(tabs)/_layout.tsx` for conditional calendar tab
- [x] Create role checking utility: `utils/roleUtils.ts`
- [x] Add calendar tab icon and styling
- [x] Test role-based visibility

#### **1.2 Base Screen Creation**
- [x] `app/create-event.tsx` - Main event creation form
- [x] `app/select-event-group.tsx` - Group selection screen
- [x] `app/select-event-recipients.tsx` - Member selection screen  
- [x] `app/schedule-event.tsx` - Final confirmation screen
- [x] Update events tab with create event navigation

#### **1.3 Navigation Infrastructure**
- [ ] Parameter passing between screens
- [ ] Navigation state management
- [ ] Back button handling
- [ ] Progress indicators

### **Phase 2: Data Structure & Backend (Week 2)**

#### **2.1 Event Services**
- [ ] `services/eventService.ts` - Core CRUD operations
  - [ ] `createEvent(eventData)`
  - [ ] `updateEvent(eventId, updates)`
  - [ ] `deleteEvent(eventId)`
  - [ ] `getGroupEvents(groupId)`
  - [ ] `getUserEvents(userId)`
- [ ] Event validation utilities
- [ ] Recurring event generation logic

#### **2.2 Response Management**
- [ ] `respondToEvent(eventId, userId, response)`
- [ ] `getEventResponses(eventId)`
- [ ] RSVP deadline checking
- [ ] Response statistics calculation

#### **2.3 Permission System**
- [ ] Role-based permission checks
- [ ] Event creation authorization
- [ ] Event editing authorization
- [ ] Response viewing permissions

### **Phase 3: UI Components & Event Creation (Week 3)**

#### **3.1 Event Type Selection**
- [ ] Simple UI with two options: One-time vs Recurring
- [ ] Consistent button styling using theme
- [ ] Form validation and navigation

#### **3.2 Group Selection Screen**
- [ ] List all groups where user has admin/coach role
- [ ] Reuse existing group display components
- [ ] Loading states and error handling

#### **3.3 Recipients Selection**
- [ ] Three options: All Members, Specific Subgroup, Custom List
- [ ] For custom: checkbox member selection interface
- [ ] Reuse member list components from manage-group
- [ ] Selected recipients summary

#### **3.4 Schedule Details Screen**
- [ ] **Date Picker Implementation**:
  - Mobile: `@react-native-community/datetimepicker`
  - Web: Custom picker mimicking native style
- [ ] **Time Pickers**: Start time, End time, Gathering time
- [ ] **Location Input**: Text field with validation
- [ ] **Event Category**: Dropdown (Training/Match/Meeting)
- [ ] **Optional RSVP Deadline**: Toggle + date/time picker
- [ ] **Recurring Pattern** (if applicable): Frequency selection

### **Phase 4: Event Display & Management (Week 4)**

#### **4.1 Events Tab (Main Calendar)**
- [ ] Monthly calendar view implementation
- [ ] Event list view (alternative/fallback)
- [ ] Filter by group, category, date range
- [ ] Admin/coach can see all their created events
- [ ] Event creation floating action button

#### **4.2 Home Tab Integration**
- [ ] Add upcoming events section to existing home screen
- [ ] Show events user is invited to
- [ ] Quick response buttons (Accept/Decline)
- [ ] Event countdown/reminder display

#### **4.3 Event Details & Response Management**
- [ ] Comprehensive event detail screen
- [ ] List of all invitees and their responses
- [ ] Response statistics (attending/declined/pending)
- [ ] Admin/coach event editing capabilities
- [ ] Event cancellation functionality

### **Phase 5: Advanced Features & Polish (Week 5)**

#### **5.1 Recurring Events**
- [ ] Generate multiple event instances from pattern
- [ ] Handle recurring event modifications
- [ ] "Edit this occurrence" vs "Edit all occurrences"
- [ ] Recurring event deletion handling

#### **5.2 Event Editing & Management**
- [ ] Edit event details after creation
- [ ] Handle changes with existing responses
- [ ] Notify participants of changes
- [ ] Event history and audit trail

#### **5.3 Performance & UX Enhancements**
- [ ] Event caching and offline support
- [ ] Loading states for all operations
- [ ] Error handling and retry mechanisms
- [ ] Form persistence during navigation
- [ ] Optimistic UI updates

#### **5.4 Calendar Integration**
- [ ] Export events to device calendar
- [ ] Import from external calendars
- [ ] Sync with existing calendar apps

---

## 🎨 **UI/UX Design Guidelines**

### **Design Consistency**
- **Theme**: Use existing `theme.js` constants for all styling
- **Components**: Reuse `Button`, `ConfirmationModal`, existing form components
- **Navigation**: Follow existing screen layout patterns
- **Member Lists**: Reuse components from manage-group screen
- **Colors**: Maintain app's color scheme and branding

### **Platform-Specific Considerations**
- **Mobile**: Native date/time pickers, touch-optimized interfaces
- **Web**: Custom date pickers, mouse/keyboard navigation
- **Responsive**: Adapt layouts for different screen sizes
- **Accessibility**: Proper labels, keyboard navigation, screen reader support

### **User Experience Priorities**
1. **Simplicity**: Clear, intuitive flow for event creation
2. **Efficiency**: Minimize steps and clicks
3. **Feedback**: Clear confirmation and error messages
4. **Accessibility**: Support for all user abilities
5. **Performance**: Fast loading and responsive interactions

---

## 🔒 **Security & Permissions**

### **Access Control Matrix**
| Action | Admin | Coach | Member |
|--------|-------|-------|--------|
| Create Events | ✅ | ✅ | ❌ |
| Edit Own Events | ✅ | ✅ | ❌ |
| Delete Own Events | ✅ | ✅ | ❌ |
| View Group Events | ✅ | ✅ | ✅ |
| Respond to Events | ✅ | ✅ | ✅ |
| View All Responses | ✅ | ✅ | ✅ |
| Access Calendar Tab | ✅ | ✅ | ❌ |

### **Data Security**
- **Firestore Rules**: Restrict event creation to admins/coaches
- **Validation**: Server-side validation for all event data
- **Privacy**: Members can only see events they're invited to
- **Audit**: Track all event modifications and responses

---

## 🚀 **Implementation Priority**

### **Critical Path (Must Have)**
1. Calendar tab with role-based visibility
2. Basic event creation flow (one-time events)
3. Event display in home and events tabs
4. Member response functionality
5. Event details and response viewing

### **Important (Should Have)**
1. Recurring events (weekly/monthly patterns)
2. Event editing capabilities
3. Monthly calendar view
4. RSVP deadline functionality
5. Event categories (Training/Match/Meeting)

### **Nice to Have (Could Have)**
1. Advanced recurring patterns
2. Calendar export/import
3. Event templates
4. Advanced filtering and search
5. Event analytics and reporting

### **Future Enhancements**
1. Push notifications
2. Email reminders
3. Integration with external calendar services
4. Event photo sharing
5. Attendance tracking and statistics

---

## 📝 **Development Notes**

### **Dependencies to Add**
```bash
# Date/Time Pickers
npm install @react-native-community/datetimepicker

# Calendar Components (if needed)
npm install react-native-calendars

# Form Handling (if not already present)
npm install react-hook-form
```

### **Key Files to Create/Modify**
- `app/(tabs)/_layout.tsx` - Add calendar tab
- `app/(tabs)/events.tsx` - Main events screen
- `app/create-event.tsx` - Event creation flow
- `app/schedule-event.tsx` - Event scheduling details
- `services/eventService.ts` - Event CRUD operations
- `utils/roleUtils.ts` - Role checking utilities
- `components/EventCard.tsx` - Reusable event display
- `components/CalendarView.tsx` - Monthly calendar component

### **Testing Strategy**
- **Unit Tests**: Event creation logic, date/time handling
- **Integration Tests**: Full event creation flow
- **Role Testing**: Verify role-based access control
- **Cross-Platform**: Test on both mobile and web
- **Edge Cases**: Recurring events, timezone handling

---

## 📊 **Success Metrics**

### **Technical Metrics**
- [ ] 100% role-based access control accuracy
- [ ] <2 seconds event creation completion time
- [ ] Zero data loss during event operations
- [ ] 100% cross-platform compatibility

### **User Experience Metrics**
- [ ] Event creation completion rate >90%
- [ ] User satisfaction with calendar interface
- [ ] Response rate to event invitations
- [ ] Reduction in communication overhead for event planning

---

## 🔄 **Maintenance & Updates**

### **Version Control**
- **Feature Branches**: Separate branch for each phase
- **Code Reviews**: All event-related code must be reviewed
- **Documentation**: Update this document for any specification changes
- **Testing**: Comprehensive testing before merging

### **Future Considerations**
- **Scalability**: Plan for groups with 100+ members
- **Performance**: Optimize for large numbers of events
- **Internationalization**: Support for multiple languages/timezones
- **Integration**: APIs for third-party calendar services

---

*Document Version: 1.0*  
*Last Updated: September 4, 2025*  
*Next Review: After Phase 1 completion*
