# Firebase Firestore Indexes Documentation

This document explains the Firestore indexes configured for optimal query performance and cost efficiency.

## 📋 **Configured Indexes**

### **Events Collection**
- **groupIds (array-contains) + startTime (asc)**: For fetching upcoming events by group
- **groupIds (array-contains) + createdAt (desc)**: For event newsflow by creation time  
- **createdBy + startTime (desc)**: For user's created events
- **type + startTime (asc)**: For filtering events by type

### **Announcements Collection**
- **groupIds (array-contains) + createdAt (asc/desc)**: For newsflow announcements

### **Polls Collection**  
- **groupIds (array-contains) + createdAt (asc/desc)**: For newsflow polls

### **Groups Collection**
- **createdBy + createdAt (desc)**: For user's created groups
- **members.userId + members.role**: For role-based permissions

## 🚀 **Deployment Instructions**

### **Option 1: Using Firebase CLI**
```bash
# Deploy indexes to Firebase
firebase deploy --only firestore:indexes

# Deploy both rules and indexes
firebase deploy --only firestore
```

### **Option 2: Firebase Console**
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Navigate to Firestore Database
4. Go to "Indexes" tab
5. Click "Add index" and configure each index manually

## 📊 **Performance Benefits**

### **Before Indexes**
- Queries may time out or fail
- High read costs due to document scanning
- Slower response times

### **After Indexes**
- ⚡ **Faster Queries**: Millisecond response times
- 💰 **Lower Costs**: Efficient document targeting
- 🔄 **Better UX**: Smooth scrolling and real-time updates

## 🔍 **Query Optimization Examples**

### **Home Events Query**
```typescript
// Optimized with: groupIds (array-contains) + startTime (asc)
const eventsQuery = query(
  collection(db, 'events'),
  where('groupIds', 'array-contains', groupId),
  where('startTime', '>=', new Date()),
  orderBy('startTime', 'asc'),
  limit(20)
);
```

### **User's Groups Query**  
```typescript
// Optimized with: createdBy + createdAt (desc)
const groupsQuery = query(
  collection(db, 'groups'),
  where('createdBy', '==', userId),
  orderBy('createdAt', 'desc')
);
```

## ⚠️ **Important Notes**

1. **Index Creation Time**: New indexes can take several minutes to build
2. **Billing Impact**: Indexes consume storage but dramatically reduce query costs
3. **Query Limitations**: All `orderBy` fields must be in `where` clauses or indexes
4. **Array Queries**: `array-contains` requires special indexing

## 🛠 **Maintenance**

### **Monitoring Index Usage**
- Check Firebase Console → Firestore → Usage tab
- Monitor query performance metrics
- Remove unused indexes to save storage costs

### **Adding New Indexes**
1. Update `firestore-indexes.json`
2. Run `firebase deploy --only firestore:indexes`
3. Test query performance after deployment

## 🔧 **Troubleshooting**

### **Common Index Errors**
```
Error: The query requires an index
```
**Solution**: Add the missing index to `firestore-indexes.json`

### **Index Build Failures**
- Check field names match exactly
- Verify collection names are correct
- Ensure proper field types (array-contains vs equality)

## 📈 **Performance Monitoring**

Track these metrics after deployment:
- Average query response time
- Read operation costs
- User experience improvements
- Error rate reduction

---

**Last Updated**: September 2025  
**Next Review**: Monitor performance for 2 weeks, then optimize based on usage patterns
