// /contexts/UserContext.tsx - Real-time user document listener
// Uses Firestore onSnapshot for instant, always-current user profile data.
// Replaces the previous version-based caching approach (fetchUserProfile + AsyncStorage).

import { User as FirebaseUser, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { auth, db } from "../services/core/firebase";

// Import domain types
import type { UserProfile } from "@/services/types/user";

// User Context Interface — real-time, READ-ONLY
interface UserContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasLoadedFreshData: boolean; // true once the first listener snapshot has arrived

  clearUserData: () => Promise<void>;

  // NOTE: No refreshUserProfile — the onSnapshot listener keeps data current automatically.
  // NOTE: No updateUserProfile — UserContext is READ-ONLY.
  // All user profile mutations go through Firebase Functions which update the user doc,
  // and the listener propagates changes to the UI in real-time.
}

const UserContext = createContext<UserContextType | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Firestore Timestamp → JS Date conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Firestore Timestamp (or date-like value) to a JavaScript Date.
 * Handles: Firestore Timestamp (.toDate()), Date objects, ISO strings, epoch numbers.
 */
function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (typeof (value as any)?.toDate === "function")
    return (value as any).toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/** Convert a raw Firestore GroupAccess map to a typed object with Date fields. */
function convertGroupAccess(ga: any) {
  return {
    groupId: ga.groupId,
    groupName: ga.groupName,
    roles: ga.roles || [],
    joinedAt: toDate(ga.joinedAt)!,
    lastModifiedAt: toDate(ga.lastModifiedAt)!,
    isActive: ga.isActive,
    deletionScheduledAt: toDate(ga.deletionScheduledAt),
  };
}

/** Convert a raw Firestore ClubAccess map to a typed object with Date fields. */
function convertClubAccess(ca: any) {
  return {
    clubId: ca.clubId,
    clubName: ca.clubName,
    role: ca.role,
    joinedAt: toDate(ca.joinedAt)!,
    lastModifiedAt: toDate(ca.lastModifiedAt)!,
    isActive: ca.isActive,
    deletionScheduledAt: toDate(ca.deletionScheduledAt),
    groupAccess: (ca.groupAccess || []).map(convertGroupAccess),
  };
}

/**
 * Convert raw Firestore document data to a typed UserProfile.
 * Handles Firestore Timestamp → Date conversion for all nested fields.
 */
function convertFirestoreDataToUserProfile(
  data: any,
  uid: string,
): UserProfile {
  return {
    uid: data.uid || uid,
    email: data.email || "",
    displayName: data.displayName || data.name || "",
    photoURL: data.photoURL || data.profilePicture,
    phoneNumber: data.phoneNumber,
    dateOfBirth: toDate(data.dateOfBirth) ?? null,
    emailVerified: data.emailVerified,
    personalNumber: data.personalNumber
      ? {
          encrypted: data.personalNumber.encrypted,
          lastFour: data.personalNumber.lastFour,
          providedAt: toDate(data.personalNumber.providedAt)!,
          updatedAt: toDate(data.personalNumber.updatedAt),
          consentAt: toDate(data.personalNumber.consentAt)!,
          consentVersion: data.personalNumber.consentVersion,
        }
      : undefined,
    clubAccess: (data.clubAccess || []).map(convertClubAccess),
    activeClubsAsAdmin: data.activeClubsAsAdmin,
    maxClubsAsAdmin: data.maxClubsAsAdmin,
    groupsCreated: data.groupsCreated || 0,
    events: (data.events || []).map((e: any) => ({
      eventId: e.eventId,
      response: e.response,
      invitedAt: toDate(e.invitedAt),
      respondedAt: toDate(e.respondedAt),
    })),
    eventsResponses: data.eventsResponses || [],
    verificationStatus: data.verificationStatus || "pending",
    createdAt: toDate(data.createdAt),
    lastActive: toDate(data.lastActive),
    version: data.version || 1,
    dependents: (data.dependents || []).map((dep: any) => ({
      uid: dep.uid,
      childName: dep.childName,
      relationship: dep.relationship,
      addedAt: toDate(dep.addedAt)!,
      clubAccess: (dep.clubAccess || []).map(convertClubAccess),
    })),
    guardians: (data.guardians || []).map((g: any) => ({
      uid: g.uid,
      name: g.name,
      email: g.email,
      phoneNumber: g.phoneNumber,
      relationship: g.relationship,
      addedAt: toDate(g.addedAt)!,
    })),
    legalAcceptance: data.legalAcceptance
      ? {
          termsVersion: data.legalAcceptance.termsVersion,
          privacyVersion: data.legalAcceptance.privacyVersion,
          acceptedAt: toDate(data.legalAcceptance.acceptedAt)!,
          acceptanceMethod: data.legalAcceptance.acceptanceMethod,
        }
      : undefined,

    // Flat role arrays (used by Firestore security rules)
    adminOfClubs: data.adminOfClubs || [],
    memberOfClubs: data.memberOfClubs || [],
    adminOfGroups: data.adminOfGroups || [],
    coachOfGroups: data.coachOfGroups || [],
    memberOfGroups: data.memberOfGroups || [],
    guardianOfGroups: data.guardianOfGroups || [],
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function UserProvider({ children }: UserProviderProps) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedFreshData, setHasLoadedFreshData] = useState(false);

  const isAuthenticated = !!firebaseUser;

  const clearUserData = useCallback(async () => {
    setUserProfile(null);
    setFirebaseUser(null);
    setHasLoadedFreshData(false);
    setIsLoading(false);
  }, []);

  // Auth state listener — sets firebaseUser which drives the document listener below
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      console.log("🔐 UserContext - Auth state changed:", {
        hasUser: !!user,
        uid: user?.uid,
        email: user?.email,
      });
      setFirebaseUser(user);

      if (!user) {
        console.log("🔐 UserContext - No user, clearing state");
        setUserProfile(null);
        setHasLoadedFreshData(false);
        setIsLoading(false); // CRITICAL: unblock UI when no user
      }
    });

    return unsubAuth;
  }, []);

  // Real-time user document listener — attaches when firebaseUser is available
  useEffect(() => {
    if (!firebaseUser) return;

    console.log(
      "👂 UserContext - Attaching listener for users/" + firebaseUser.uid,
    );
    setIsLoading(true);

    const userDocRef = doc(db, "users", firebaseUser.uid);
    const unsubProfile = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const profile = convertFirestoreDataToUserProfile(
            snapshot.data(),
            firebaseUser.uid,
          );
          console.log(
            "✅ UserContext - Profile updated via listener, version:",
            profile.version,
            "| clubs:",
            profile.clubAccess?.length ?? 0,
          );
          setUserProfile(profile);
        } else {
          console.log("⚠️ UserContext - User document does not exist yet");
          setUserProfile(null);
        }
        setIsLoading(false);
        setHasLoadedFreshData(true);
      },
      (error) => {
        console.error("❌ UserContext - Listener error:", error);
        // Don't leave UI stuck on loading — allow fallback rendering
        setIsLoading(false);
      },
    );

    return () => {
      console.log(
        "🔇 UserContext - Detaching listener for users/" + firebaseUser.uid,
      );
      unsubProfile();
    };
  }, [firebaseUser]);

  const value: UserContextType = {
    firebaseUser,
    userProfile,
    isLoading,
    isAuthenticated,
    hasLoadedFreshData,
    clearUserData,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
}

export function useUserProfile() {
  const { userProfile, isLoading, hasLoadedFreshData } = useUser();
  return { userProfile, isLoading, hasLoadedFreshData };
}
