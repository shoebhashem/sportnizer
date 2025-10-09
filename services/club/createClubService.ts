import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getCurrentUser } from "../auth/authService";
import { ClubAllMembersDocument, ClubData, ClubMemberData } from "../types/club";
import { ClubMembership } from "../types/user";

/**
 * Creates a new club document in Firestore and updates the user's clubs array
 */
export const createClub = async (clubName: string) => {
  const user = getCurrentUser();
  if (!user) {
    return {
      success: false,
      error: { code: "auth/no-user", message: "You must be signed in to create a club." },
    };
  }

  const db = getFirestore();

  try {
    const trimmedName = clubName.trim();

    // 🔍 Check if club with this name already exists (case-insensitive)
    const clubsRef = collection(db, "clubs");
    const q = query(clubsRef, where("name", "==", trimmedName));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      return {
        success: false,
        error: {
          code: "club/already-exists",
          message: `A club with the name "${trimmedName}" already exists.`,
        },
      };
    }

    // Generate a new club ID
    const clubId = doc(clubsRef).id;

    // Create timestamp for createdAt
    const now = serverTimestamp();

    // Build the club data
    const clubData: ClubData = {
      name: trimmedName,
      description: "",
      location: "",
      website: "",
      logoUrl: "",
      createdBy: user.uid,
      createdAt: now,
      adminIds: [user.uid],
      totalCounts: 1,
      isActive: true,
    };

    // Save the new club document
    await setDoc(doc(clubsRef, clubId), clubData);

    // Fetch the user's current profile to get up-to-date name and photo
    let userName = user.displayName || user.email?.split('@')[0] || "User";
    let userPhotoURL = user.photoURL || "";
    try {
      const userProfileDoc = await getDoc(doc(db, 'users', user.uid));
      if (userProfileDoc.exists()) {
        const userProfileData = userProfileDoc.data();
        // Prioritize displayName, then name, then fall back to Firebase Auth displayName
        userName = userProfileData.displayName || userProfileData.name || user.displayName || user.email?.split('@')[0] || "User";
        userPhotoURL = userProfileData.photoURL || user.photoURL || "";
      }
    } catch {
      console.log(`Could not fetch profile for user ${user.uid}, using Firebase Auth data`);
    }

    // Create allMembers document with the creator as the first member
    const memberData: ClubMemberData = {
      userId: user.uid,
      roles: ["club-admin"], // Creator is a club admin
      photoURL: userPhotoURL,
      name: userName,
      email: user.email || "",
      addedBy: user.uid, // Self-added
      joinedAt: Timestamp.now(), // Use Timestamp.now() instead of serverTimestamp() for arrays
      lastModifiedAt: Timestamp.now(), // Use Timestamp.now() instead of serverTimestamp() for arrays
      needsGuardian: false, // Creator is assumed to be adult
      guardiansContacts: [] // No guardians for admin
    };

    // Create the allMembers document with the creator
    const allMembersDoc: ClubAllMembersDocument = {
      members: [memberData],
      lastUpdated: Timestamp.now(), // Use Timestamp.now() since this goes in the document
      memberCount: 1
    };

    // Add the allMembers document to the club
    await setDoc(doc(db, "clubs", clubId, "allMembers", "members"), allMembersDoc);

    // Build ClubMembership for user document
    const membership: ClubMembership = {
      clubId: clubId,
      clubName: trimmedName,
      isAdmin: true,
      joinedAt: Timestamp.now().toDate(),
      lastModifiedAt: Timestamp.now().toDate(),
    };

    // Update the user document: add new club membership
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, {
      clubs: arrayUnion(membership),
    });

    return {
      success: true,
      clubId,
      message: "Club created successfully and added to your profile!",
    };
  } catch (error: any) {
    console.error("Error creating club:", error);
    return {
      success: false,
      error: {
        code: error.code || "unknown",
        message: error.message || "Failed to create club. Please try again.",
      },
    };
  }
};
