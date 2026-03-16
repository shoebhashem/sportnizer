// /contexts/GroupDataContext.tsx - Real-time listeners for groups, subgroups, and their member lists
//
// Listens to:
//   - clubs/{clubId}/groups/{groupId}                    → group doc
//   - clubs/{clubId}/groups/{groupId}/allMembers/members → group member list
//   - clubs/{clubId}/groups/{groupId}/subgroups          → subgroup collection
//   - clubs/{clubId}/groups/{groupId}/subgroups/{sgId}/allMembers/members → subgroup members (dynamic)
//
// Subgroup member listeners are managed dynamically: when the subgroup collection
// snapshot reports new or removed subgroups, their allMembers listeners are
// attached or detached accordingly.
//
// Security rules allow group allMembers reads for club-admin, group admin/coach, and group members.

import {
    collection,
    doc,
    getDocs,
    onSnapshot,
    query,
    where,
} from "firebase/firestore";
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
import type { GroupData, GroupMemberData } from "../services/types/group";
import { useUser } from "./UserContext";

// ---------------------------------------------------------------------------
// Subgroup document shape (mirrors services/subgroup.ts SubGroup interface)
// Defined locally to avoid pulling in heavy service module dependencies.
// ---------------------------------------------------------------------------

export interface SubgroupData {
  id: string;
  name: string;
  createdBy: string;
  createdAt: any;
  description?: string;
  color?: string;
  memberCount: number;
}

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

interface GroupDataContextType {
  /** Map of "clubId:groupId" → GroupData */
  groups: Map<string, GroupData>;
  /** Map of "clubId:groupId" → GroupMemberData[] */
  groupMembers: Map<string, GroupMemberData[]>;
  /** Map of "clubId:groupId" → SubgroupData[] */
  subgroups: Map<string, SubgroupData[]>;
  /** Map of "clubId:groupId:subgroupId" → GroupMemberData[] */
  subgroupMembers: Map<string, GroupMemberData[]>;
  /** True until every attached listener has delivered its first snapshot */
  isLoading: boolean;

  getGroup: (clubId: string, groupId: string) => GroupData | undefined;
  getGroupMembers: (clubId: string, groupId: string) => GroupMemberData[];
  getSubgroups: (clubId: string, groupId: string) => SubgroupData[];
  getSubgroupMembers: (
    clubId: string,
    groupId: string,
    subgroupId: string,
  ) => GroupMemberData[];
}

const GroupDataContext = createContext<GroupDataContextType | undefined>(
  undefined,
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Composite key for group-level maps */
const gKey = (clubId: string, groupId: string) => `${clubId}:${groupId}`;

/** Composite key for subgroup-level maps */
const sgKey = (clubId: string, groupId: string, subgroupId: string) =>
  `${clubId}:${groupId}:${subgroupId}`;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function GroupDataProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useUser();

  const [groups, setGroups] = useState<Map<string, GroupData>>(new Map());
  const [groupMembers, setGroupMembers] = useState<
    Map<string, GroupMemberData[]>
  >(new Map());
  const [subgroups, setSubgroups] = useState<Map<string, SubgroupData[]>>(
    new Map(),
  );
  const [subgroupMembers, setSubgroupMembers] = useState<
    Map<string, GroupMemberData[]>
  >(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Subgroup-member listeners are created/destroyed dynamically from inside the
  // subgroup-collection snapshot callback. We track them here so the main
  // effect cleanup can tear them all down.
  const sgMemberUnsubs = useRef<Map<string, () => void>>(new Map());

  // Stable dependency key — only changes when the set of groups changes.
  // Includes both direct groups (from clubAccess) and dependent groups
  // (from dependents[].clubAccess) so guardians also get real-time listeners.
  const groupAccessKey = (() => {
    const keys = new Set<string>();

    // Direct groups
    for (const ca of userProfile?.clubAccess || []) {
      if (ca.isActive === false) continue;

      if (ca.role === "club-admin") {
        keys.add(`${ca.clubId}:__club_admin__`);
      }

      for (const ga of ca.groupAccess || []) {
        if (ga.isActive === false) continue;
        keys.add(`${ca.clubId}:${ga.groupId}`);
      }
    }

    // Dependent groups (guardian access)
    for (const dep of userProfile?.dependents || []) {
      for (const ca of dep.clubAccess || []) {
        if (ca.isActive === false) continue;
        for (const ga of ca.groupAccess || []) {
          if (ga.isActive === false) continue;
          keys.add(`${ca.clubId}:${ga.groupId}`);
        }
      }
    }

    return [...keys].sort().join(",");
  })();

  // Track pending first-snapshots
  const pendingRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    const unsubscribers: (() => void)[] = [];

    const setupListeners = async () => {
      // Build list of groups to listen on
      // 1) direct user groupAccess
      // 2) dependent groupAccess
      // 3) all active groups for clubs where user is club-admin
      const entries: { clubId: string; groupId: string }[] = [];
      const seen = new Set<string>();

      const addEntry = (clubId: string, groupId: string) => {
        const k = `${clubId}:${groupId}`;
        if (!seen.has(k)) {
          seen.add(k);
          entries.push({ clubId, groupId });
        }
      };

      // Direct groups
      for (const ca of userProfile?.clubAccess || []) {
        if (ca.isActive === false) continue;
        for (const ga of ca.groupAccess || []) {
          if (ga.isActive === false) continue;
          addEntry(ca.clubId, ga.groupId);
        }
      }

      // Dependent groups (guardian access)
      for (const dep of userProfile?.dependents || []) {
        for (const ca of dep.clubAccess || []) {
          if (ca.isActive === false) continue;
          for (const ga of ca.groupAccess || []) {
            if (ga.isActive === false) continue;
            addEntry(ca.clubId, ga.groupId);
          }
        }
      }

      // Club-admin clubs: subscribe to all active groups in the club
      const clubAdminClubIds = (userProfile?.clubAccess || [])
        .filter((ca) => ca.isActive !== false && ca.role === "club-admin")
        .map((ca) => ca.clubId);

      for (const adminClubId of clubAdminClubIds) {
        try {
          const groupsRef = collection(db, "clubs", adminClubId, "groups");
          const q = query(groupsRef, where("isActive", "!=", false));
          const snapshot = await getDocs(q);
          snapshot.forEach((groupDoc) => {
            addEntry(adminClubId, groupDoc.id);
          });
        } catch (error) {
          console.error(
            `❌ GroupDataContext - Failed to fetch admin groups for club ${adminClubId}:`,
            error,
          );
        }
      }

      if (disposed) return;

      if (entries.length === 0) {
        setGroups(new Map());
        setGroupMembers(new Map());
        setSubgroups(new Map());
        setSubgroupMembers(new Map());
        sgMemberUnsubs.current.forEach((unsub) => unsub());
        sgMemberUnsubs.current.clear();
        setIsLoading(false);
        return;
      }

      // 3 listeners per group: doc + allMembers + subgroups-collection
      const totalExpected = entries.length * 3;
      pendingRef.current = totalExpected;
      setIsLoading(true);

      const onFirstSnapshot = () => {
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        if (pendingRef.current === 0) {
          setIsLoading(false);
        }
      };

      for (const { clubId, groupId } of entries) {
        const key = gKey(clubId, groupId);

        // ── 1. Group document listener ────────────────────────────────────
        const groupDocRef = doc(db, "clubs", clubId, "groups", groupId);
        const unsubGroup = onSnapshot(
          groupDocRef,
          (snapshot) => {
            if (snapshot.exists()) {
              setGroups((prev) => {
                const next = new Map(prev);
                next.set(key, {
                  ...snapshot.data(),
                  id: snapshot.id,
                } as GroupData);
                return next;
              });
            } else {
              setGroups((prev) => {
                const next = new Map(prev);
                next.delete(key);
                return next;
              });
            }
            onFirstSnapshot();
          },
          (error) => {
            console.error(
              `❌ GroupDataContext - Group listener error for ${key}:`,
              error,
            );
            onFirstSnapshot();
          },
        );
        unsubscribers.push(unsubGroup);

        // ── 2. Group allMembers listener ──────────────────────────────────
        const groupMembersRef = doc(
          db,
          "clubs",
          clubId,
          "groups",
          groupId,
          "allMembers",
          "members",
        );
        const unsubGroupMembers = onSnapshot(
          groupMembersRef,
          (snapshot) => {
            if (snapshot.exists()) {
              setGroupMembers((prev) => {
                const next = new Map(prev);
                next.set(
                  key,
                  (snapshot.data().members || []) as GroupMemberData[],
                );
                return next;
              });
            }
            onFirstSnapshot();
          },
          (error) => {
            console.error(
              `❌ GroupDataContext - Group members listener error for ${key}:`,
              error,
            );
            onFirstSnapshot();
          },
        );
        unsubscribers.push(unsubGroupMembers);

        // ── 3. Subgroup collection listener ───────────────────────────────
        const subgroupsCollRef = collection(
          db,
          "clubs",
          clubId,
          "groups",
          groupId,
          "subgroups",
        );
        const unsubSubgroups = onSnapshot(
          subgroupsCollRef,
          (snapshot) => {
            const sgList: SubgroupData[] = snapshot.docs.map(
              (d) => ({ ...d.data(), id: d.id }) as SubgroupData,
            );

            setSubgroups((prev) => {
              const next = new Map(prev);
              next.set(key, sgList);
              return next;
            });

            // ── Manage dynamic subgroup-member listeners ────────────────
            const currentSgIds = new Set(snapshot.docs.map((d) => d.id));

            // Detach listeners for subgroups that no longer exist under this group
            for (const [existingKey, unsub] of sgMemberUnsubs.current) {
              if (existingKey.startsWith(`${key}:`)) {
                const parts = existingKey.split(":");
                const existingSgId = parts[2];
                if (!currentSgIds.has(existingSgId)) {
                  unsub();
                  sgMemberUnsubs.current.delete(existingKey);
                  setSubgroupMembers((prev) => {
                    const next = new Map(prev);
                    next.delete(existingKey);
                    return next;
                  });
                }
              }
            }

            // Attach listeners for newly added subgroups
            for (const sgDoc of snapshot.docs) {
              const fullKey = sgKey(clubId, groupId, sgDoc.id);
              if (!sgMemberUnsubs.current.has(fullKey)) {
                const sgMembersRef = doc(
                  db,
                  "clubs",
                  clubId,
                  "groups",
                  groupId,
                  "subgroups",
                  sgDoc.id,
                  "allMembers",
                  "members",
                );
                const unsubSgMembers = onSnapshot(
                  sgMembersRef,
                  (memberSnap) => {
                    if (memberSnap.exists()) {
                      setSubgroupMembers((prev) => {
                        const next = new Map(prev);
                        next.set(
                          fullKey,
                          (memberSnap.data().members ||
                            []) as GroupMemberData[],
                        );
                        return next;
                      });
                    }
                  },
                  (error) => {
                    console.error(
                      `❌ GroupDataContext - Subgroup members listener error for ${fullKey}:`,
                      error,
                    );
                  },
                );
                sgMemberUnsubs.current.set(fullKey, unsubSgMembers);
              }
            }

            onFirstSnapshot();
          },
          (error) => {
            console.error(
              `❌ GroupDataContext - Subgroups collection listener error for ${key}:`,
              error,
            );
            onFirstSnapshot();
          },
        );
        unsubscribers.push(unsubSubgroups);
      }

      console.log(
        `👂 GroupDataContext - Attached ${unsubscribers.length} static listeners for ${entries.length} groups`,
      );
    };

    void setupListeners();

    return () => {
      disposed = true;
      console.log(
        `🔇 GroupDataContext - Detaching ${unsubscribers.length} static + ${sgMemberUnsubs.current.size} dynamic listeners`,
      );
      unsubscribers.forEach((unsub) => unsub());
      sgMemberUnsubs.current.forEach((unsub) => unsub());
      sgMemberUnsubs.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupAccessKey]);

  // ── Accessor helpers ──────────────────────────────────────────────────
  const getGroup = useCallback(
    (clubId: string, groupId: string) => groups.get(gKey(clubId, groupId)),
    [groups],
  );

  const getGroupMembers = useCallback(
    (clubId: string, groupId: string) =>
      groupMembers.get(gKey(clubId, groupId)) || [],
    [groupMembers],
  );

  const getSubgroups = useCallback(
    (clubId: string, groupId: string) =>
      subgroups.get(gKey(clubId, groupId)) || [],
    [subgroups],
  );

  const getSubgroupMembers = useCallback(
    (clubId: string, groupId: string, subgroupId: string) =>
      subgroupMembers.get(sgKey(clubId, groupId, subgroupId)) || [],
    [subgroupMembers],
  );

  const value: GroupDataContextType = {
    groups,
    groupMembers,
    subgroups,
    subgroupMembers,
    isLoading,
    getGroup,
    getGroupMembers,
    getSubgroups,
    getSubgroupMembers,
  };

  return (
    <GroupDataContext.Provider value={value}>
      {children}
    </GroupDataContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGroupData() {
  const ctx = useContext(GroupDataContext);
  if (!ctx)
    throw new Error("useGroupData must be used within a GroupDataProvider");
  return ctx;
}
