import {
  arrayUnion,
  collection,
  doc,
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
import { ClubData, ClubMemberData, ClubMembership } from "../types/club";

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

    // Create allMembers subcollection and add the creator as the first member
    const memberData: ClubMemberData = {
      userId: user.uid,
      roles: ["admin"], // Creator is an admin
      joinedAt: now,
      profilePictureUrl: user.photoURL || "", // Use user's photo URL if available
      name: user.name || "User",
      email: user.email || "",
    };

    // Add the creator to the allMembers subcollection
    await setDoc(doc(db, "clubs", clubId, "allMembers", user.uid), memberData);

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
