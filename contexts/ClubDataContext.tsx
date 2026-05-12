// /contexts/ClubDataContext.tsx - Real-time listeners for club documents and club member lists
//
// Listens to:
//   - clubs/{clubId}                    → for every club the user belongs to
//   - clubs/{clubId}/allMembers/members → only for clubs where user is club-admin
//     (Firestore rules restrict this path to club admins)
//   - clubs/{clubId}/settings/permissions → for every club the user belongs to
//     (role-visibility config; falls back to DEFAULT_PERMISSIONS if doc absent)
//
// Data is kept current via onSnapshot — no manual refresh needed.

import { doc, onSnapshot } from "firebase/firestore";
import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { db } from "../services/core/firebase";
import type { ClubData, ClubMemberData } from "../services/types/club";
import {
    ClubPermissions,
    resolveClubPermissions
} from "../services/types/clubPermissions";
import { useUser } from "./UserContext";

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

interface ClubDataContextType {
  /** Map of clubId → ClubData for every club the user belongs to */
  clubs: Map<string, ClubData>;
  /** Map of clubId → ClubMemberData[] (only populated for clubs where user is admin) */
  clubMembers: Map<string, ClubMemberData[]>;
  /** True until every attached listener has delivered its first snapshot */
  isLoading: boolean;
  /** Shortcut accessor */
  getClub: (clubId: string) => ClubData | undefined;
  /** Shortcut accessor — returns [] for non-admin clubs or when data hasn't loaded */
  getClubMembers: (clubId: string) => ClubMemberData[];
  /**
   * Returns resolved permissions for a club, merging stored values with
   * DEFAULT_PERMISSIONS. Safe to call before data loads — returns defaults.
   */
  getClubPermissions: (
    clubId: string,
  ) => ReturnType<typeof resolveClubPermissions>;
}

const ClubDataContext = createContext<ClubDataContextType | undefined>(
  undefined,
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ClubDataProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useUser();

  const [clubs, setClubs] = useState<Map<string, ClubData>>(new Map());
  const [clubMembers, setClubMembers] = useState<Map<string, ClubMemberData[]>>(
    new Map(),
  );
  const [clubPermissions, setClubPermissions] = useState<
    Map<string, ClubPermissions>
  >(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Stable dependency key — only changes when the set of clubs or roles changes.
  // This prevents tearing down / re-attaching listeners when unrelated parts of
  // userProfile change (e.g. event responses, lastActive).
  const clubAccessKey = (userProfile?.clubAccess || [])
    .filter((ca) => ca.isActive !== false)
    .map((ca) => `${ca.clubId}:${ca.role}`)
    .sort()
    .join(",");

  // Track how many initial snapshots are still pending
  const pendingRef = useRef(0);

  useEffect(() => {
    const activeAccess = (userProfile?.clubAccess || []).filter(
      (ca) => ca.isActive !== false,
    );

    if (activeAccess.length === 0) {
      setClubs(new Map());
      setClubMembers(new Map());
      setClubPermissions(new Map());
      setIsLoading(false);
      return;
    }

    const unsubscribers: (() => void)[] = [];

    // Count expected first-snapshot callbacks:
    //   1 per club doc  +  1 per admin-club allMembers doc  +  1 per club permissions doc
    const adminCount = activeAccess.filter(
      (ca) => ca.role === "club-admin",
    ).length;
    const totalExpected =
      activeAccess.length + adminCount + activeAccess.length;
    pendingRef.current = totalExpected;
    setIsLoading(true);

    const onFirstSnapshot = () => {
      pendingRef.current = Math.max(0, pendingRef.current - 1);
      if (pendingRef.current === 0) {
        setIsLoading(false);
      }
    };

    for (const ca of activeAccess) {
      // ── Club document listener ──────────────────────────────────────────
      const clubDocRef = doc(db, "clubs", ca.clubId);
      const unsubClub = onSnapshot(
        clubDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = { ...snapshot.data(), id: snapshot.id } as ClubData;
            setClubs((prev) => {
              const next = new Map(prev);
              next.set(ca.clubId, data);
              return next;
            });
          } else {
            setClubs((prev) => {
              const next = new Map(prev);
              next.delete(ca.clubId);
              return next;
            });
          }
          onFirstSnapshot();
        },
        (error) => {
          console.error(
            `❌ ClubDataContext - Club listener error for ${ca.clubId}:`,
            error,
          );
          onFirstSnapshot();
        },
      );
      unsubscribers.push(unsubClub);

      // ── Club allMembers listener (admin-only) ───────────────────────────
      if (ca.role === "club-admin") {
        const membersDocRef = doc(
          db,
          "clubs",
          ca.clubId,
          "allMembers",
          "members",
        );
        const unsubMembers = onSnapshot(
          membersDocRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const membersData = (snapshot.data().members ||
                []) as ClubMemberData[];
              setClubMembers((prev) => {
                const next = new Map(prev);
                next.set(ca.clubId, membersData);
                return next;
              });
            }
            onFirstSnapshot();
          },
          (error) => {
            console.error(
              `❌ ClubDataContext - Club members listener error for ${ca.clubId}:`,
              error,
            );
            onFirstSnapshot();
          },
        );
        unsubscribers.push(unsubMembers);
      }

      // ── Club permissions listener (all club members) ────────────────────
      const permissionsDocRef = doc(
        db,
        "clubs",
        ca.clubId,
        "settings",
        "permissions",
      );
      const unsubPermissions = onSnapshot(
        permissionsDocRef,
        (snapshot) => {
          const data = snapshot.exists()
            ? (snapshot.data() as ClubPermissions)
            : null;
          setClubPermissions((prev) => {
            const next = new Map(prev);
            if (data) {
              next.set(ca.clubId, data);
            } else {
              next.delete(ca.clubId);
            }
            return next;
          });
          onFirstSnapshot();
        },
        (error) => {
          console.error(
            `❌ ClubDataContext - Permissions listener error for ${ca.clubId}:`,
            error,
          );
          onFirstSnapshot();
        },
      );
      unsubscribers.push(unsubPermissions);
    }

    console.log(
      `👂 ClubDataContext - Attached ${unsubscribers.length} listeners for ${activeAccess.length} clubs`,
    );

    return () => {
      console.log(
        `🔇 ClubDataContext - Detaching ${unsubscribers.length} listeners`,
      );
      unsubscribers.forEach((unsub) => unsub());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubAccessKey]);

  // ── Accessor helpers ──────────────────────────────────────────────────
  const getClub = useCallback((clubId: string) => clubs.get(clubId), [clubs]);

  const getClubMembers = useCallback(
    (clubId: string) => clubMembers.get(clubId) || [],
    [clubMembers],
  );

  const getClubPermissions = useCallback(
    (clubId: string) => resolveClubPermissions(clubPermissions.get(clubId)),
    [clubPermissions],
  );

  const value: ClubDataContextType = {
    clubs,
    clubMembers,
    isLoading,
    getClub,
    getClubMembers,
    getClubPermissions,
  };

  return (
    <ClubDataContext.Provider value={value}>
      {children}
    </ClubDataContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useClubData() {
  const ctx = useContext(ClubDataContext);
  if (!ctx)
    throw new Error("useClubData must be used within a ClubDataProvider");
  return ctx;
}
