# Role System Migration - Enhanced Multiple Roles

## 🎯 **Overview**

This document outlines the migration from single-role to multiple-role system and the impact on Firestore security rules.

---

## 🔧 **Firestore Rules Changes**

### **Key Enhancements Made:**

1. **Backward Compatible Role Checking:**
   - New `getUserRoles()` function returns roles array
   - Legacy `getUserRole()` still works for existing single-role documents
   - `hasRole(role)` function checks if user has specific role

2. **Enhanced Security Functions:**
   ```javascript
   // New functions added:
   function getUserRoles()         // Returns array of roles
   function hasRole(role)          // Checks if user has specific role
   function hasAdminOrCoachRole()  // Checks admin OR coach permissions
   function canPromoteToAdmin()    // Only admins can create other admins
   function canManageMembers()     // Admin or coach can manage members
   ```

3. **Role Array Validation:**
   - Maximum 3 roles per user (prevents abuse)
   - Validates roles field is proper array structure
   - Ensures at least one role assigned

4. **Permission Granularity:**
   - Admins can assign any role (including admin)
   - Coaches cannot promote to admin role
   - Self-updates cannot modify roles

---

## 📊 **Data Structure Migration**

### **Current Structure (Single Role):**
```typescript
groups/{groupId}/members/{userId}: {
  role: 'admin',           // Single role
  joinedAt: timestamp,
  invitedBy: string
}
```

### **Enhanced Structure (Multiple Roles):**
```typescript
groups/{groupId}/members/{userId}: {
  roles: ['admin', 'coach'], // Array of roles
  role: 'admin',            // Legacy field (optional, for backward compatibility)
  joinedAt: timestamp,
  invitedBy: string,
  permissions?: string[],   // Optional: granular permissions
  specialties?: string[]    // Optional: coach specialties
}
```

---

## 🚀 **Migration Strategy**

### **Phase 1: Rules Update (COMPLETED)**
✅ Updated Firestore security rules for backward compatibility
✅ Added multiple role support functions
✅ Enhanced permission checking logic

### **Phase 2: Application Code Updates**
- [ ] Update role checking utilities in `utils/roleUtils.ts`
- [ ] Modify member management components
- [ ] Update role assignment UI
- [ ] Add role selection interfaces

### **Phase 3: Data Migration**
- [ ] Create migration script for existing members
- [ ] Convert single `role` to `roles` array
- [ ] Maintain backward compatibility during transition

### **Phase 4: Enhanced Features**
- [ ] Multiple role selection UI
- [ ] Granular permission management
- [ ] Role-based dashboard customization

---

## 🔐 **Security Improvements**

### **Access Control Matrix:**

| Action | Admin | Coach | Member | Multiple Roles |
|--------|-------|-------|--------|----------------|
| Promote to Admin | ✅ | ❌ | ❌ | ✅ (if has admin) |
| Add Coach Role | ✅ | ❌ | ❌ | ✅ (if has admin) |
| Manage Events | ✅ | ✅ | ❌ | ✅ (if has admin/coach) |
| Manage Members | ✅ | ✅ | ❌ | ✅ (if has admin/coach) |
| Update Own Profile | ✅ | ✅ | ✅ | ✅ (cannot change roles) |

### **Role Validation Rules:**
- Users must have at least one role
- Maximum 3 roles per user (prevents system abuse)
- Only admins can assign admin role
- Self-role modification prevented
- Array structure validation ensures data integrity

---

## 🛠 **Implementation Examples**

### **Client-Side Role Checking:**
```typescript
// Check if user has specific role
const hasAdminRole = member.roles?.includes('admin') || member.role === 'admin';

// Check multiple roles
const canManageEvents = member.roles?.some(role => ['admin', 'coach'].includes(role));

// Backward compatibility
const userRole = member.roles?.[0] || member.role || 'member';
```

### **Role Assignment:**
```typescript
// Add coach role to existing admin
await updateDoc(memberRef, {
  roles: ['admin', 'coach'],
  role: 'admin' // Keep legacy field
});

// New member with multiple roles
await setDoc(memberRef, {
  roles: ['coach', 'treasurer'],
  role: 'coach', // Primary role for legacy support
  joinedAt: serverTimestamp()
});
```

---

## ⚠️ **Migration Considerations**

### **Backward Compatibility:**
- All existing single-role documents continue to work
- Legacy `role` field still supported
- No breaking changes to existing functionality

### **Performance Impact:**
- Minimal - rules use efficient existence checks
- Role arrays typically small (1-3 items)
- Indexed queries remain efficient

### **Data Consistency:**
- Migration script needed for existing data
- Validation ensures clean role assignments
- Rollback strategy available if needed

---

## 🎨 **UI/UX Implications**

### **Role Display:**
```typescript
// Show multiple roles in member lists
{member.roles?.map(role => (
  <Badge key={role} variant={role}>
    {role.toUpperCase()}
  </Badge>
))}
```

### **Role Selection:**
```typescript
// Multi-select for role assignment
<RoleSelector 
  availableRoles={['admin', 'coach', 'treasurer']}
  selectedRoles={member.roles || [member.role]}
  onRolesChange={handleRoleUpdate}
  maxRoles={3}
/>
```

---

## 📈 **Benefits of Enhanced System**

1. **Flexibility:** Users can have specialized roles simultaneously
2. **Scalability:** Easy to add new role types in future
3. **Granularity:** More precise permission control
4. **Real-world Mapping:** Better reflects actual organizational structures
5. **Backward Compatible:** No disruption to existing functionality

---

## 🔄 **Next Steps**

1. **Test the updated rules** in Firestore console
2. **Update client-side utilities** for role checking
3. **Create migration script** for existing data
4. **Implement UI components** for multiple role management
5. **Add role-specific features** based on enhanced permissions

This migration maintains all existing functionality while providing the foundation for more sophisticated role management in your sports group management system.
