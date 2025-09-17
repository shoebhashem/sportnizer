# Profile Picture Implementation Guide

## Overview
This implementation provides a complete profile picture system for your Sportnizer app with the following features:

1. **Public read access** to all profile pictures for easy display
2. **User-controlled uploads** - users can upload their own profile pictures
3. **Guardian permissions** - guardians can upload photos for their children
4. **Automatic image resizing** via Firebase Extension
5. **Default profile pictures** for new users

## URL Structure Explanation

### Firebase Storage Location vs Download URL

**Storage Location (Internal):**
```
gs://sportnizer.firebasestorage.app/defaults/adult_profile_icon.png
```

**Download URL (Public):**
```
https://firebasestorage.googleapis.com/v0/b/sportnizer.firebasestorage.app/o/defaults%2Fadult_profile_icon.png?alt=media
```

The URL in your user document is **correct**! Firebase automatically converts storage paths to download URLs:
- `gs://` → `https://firebasestorage.googleapis.com/v0/b/`
- `/` → `%2F` (URL encoded)
- Adds `?alt=media` for direct media access

## File Structure

### New Files Created:
1. **`storage_new.rules`** - Updated storage security rules
2. **`services/profilePictureService.ts`** - Core upload/download logic
3. **`components/ProfilePictureUpload.tsx`** - Image picker and upload UI

### Modified Files:
1. **`components/UserAvatar.tsx`** - Now displays profile pictures and handles uploads

## Storage Rules (`storage_new.rules`)

```javascript
// Key rules:
// 1. Public read access to all profile pictures
match /users/{userId}/profile.{ext} {
  allow read: if true; // Anyone can view
  allow write: if isValidUser() && request.auth.uid == userId; // Users upload their own
}

// 2. Guardian permissions for member photos
match /groups/{groupId}/members/{memberId}/profile.{ext} {
  allow read: if true;
  allow write: if isValidUser() && (
    request.auth.uid == memberId ||           // Member themselves
    isGuardianOfMember(groupId, memberId) ||  // Guardian of member
    canManageGroup(groupId)                   // Admin/coach
  );
}
```

## Profile Picture Paths

### Adult Users:
- **Original:** `users/{userId}/profile.jpg`
- **Resized:** `users/{userId}/profile_200x200.jpg` (auto-created by extension)

### Group Members (including children):
- **Original:** `groups/{groupId}/members/{memberId}/profile.jpg`
- **Resized:** `groups/{groupId}/members/{memberId}/profile_200x200.jpg`

## How to Use

### 1. Deploy Updated Storage Rules

Replace your current `storage.rules` with the content from `storage_new.rules`:

```bash
firebase deploy --only storage
```

### 2. Install Required Dependencies

```bash
npm install expo-image-picker
# or
yarn add expo-image-picker
```

### 3. For User Profile Pictures

```typescript
import { uploadUserProfilePicture } from '../services/profilePictureService';

// Upload user's own profile picture
const result = await uploadUserProfilePicture(imageUri);
if (result.success) {
  console.log('New profile picture URL:', result.profilePictureUrl);
}
```

### 4. For Member Profile Pictures (Guardian uploading for child)

```typescript
import { uploadMemberProfilePicture } from '../services/profilePictureService';

// Guardian uploads photo for their child
const result = await uploadMemberProfilePicture(groupId, memberId, imageUri);
if (result.success) {
  console.log('New member photo URL:', result.profilePictureUrl);
}
```

## Current Implementation Status

### ✅ Completed:
1. **UserAvatar.tsx** - Displays profile pictures from Firestore
2. **Storage rules** - Security rules for read/write access
3. **Profile picture service** - Upload/download functionality
4. **Upload component** - UI for selecting and uploading images
5. **Guardian permissions** - Rules for guardians to upload child photos

### 🔧 What You Need to Do:

1. **Deploy the new storage rules:**
   ```bash
   cp storage_new.rules storage.rules
   firebase deploy --only storage
   ```

2. **Install expo-image-picker:**
   ```bash
   npm install expo-image-picker
   ```

3. **Test the implementation:**
   - Try uploading a profile picture through the UserAvatar
   - Verify the image appears correctly
   - Check that the resize extension creates 200x200 versions

## Image Resize Extension

Your Firebase resize extension will automatically:
1. Create `profile_200x200.jpg` versions when images are uploaded
2. The service will prioritize showing resized versions for better performance
3. Fall back to original if resized version isn't ready yet

## Security Features

1. **File size limits:** 5MB for profile pictures
2. **Image type validation:** Only allows `image/*` content types
3. **User authentication:** Must be signed in to upload
4. **Guardian verification:** Uses Firestore guardian relationships
5. **Public read access:** Anyone can view profile pictures (for easy sharing)

## Next Steps

After deploying and testing:
1. Consider adding image compression before upload
2. Add progress indicators for uploads
3. Implement profile picture deletion
4. Add cropping functionality
5. Consider adding profile picture moderation for children

## Troubleshooting

### If images don't display:
1. Check Firebase Storage rules are deployed
2. Verify the profilePicture URL in Firestore user documents
3. Check browser network tab for failed image requests
4. Ensure resize extension is properly configured

### If uploads fail:
1. Check user authentication
2. Verify storage rules allow write access
3. Check file size and type restrictions
4. Look for errors in browser console
