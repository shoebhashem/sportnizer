import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { requirePlatformAdmin } from "./requirePlatformAdmin";

interface AdminGetClubDetailsRequest {
  clubId: string;
}

interface AdminGetClubDetailsResponse {
  success: boolean;
  club: Record<string, any> | null;
  groups: Record<string, any>[];
  clubMembers: Record<string, any>[];
  groupMembers: Record<string, Record<string, any>[]>;
  subgroups: Record<string, Record<string, any>[]>;
  eventCount: number;
  newsCount: number;
  error?: string;
}

/**
 * Helper that converts every Firestore Timestamp inside an object tree to
 * an ISO-8601 string so it can travel over the wire.
 */
function deepSerializeTimestamps(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;

  if (typeof obj.toDate === "function") {
    return obj.toDate().toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(deepSerializeTimestamps);
  }

  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    result[key] = deepSerializeTimestamps(obj[key]);
  }
  return result;
}

/**
 * Returns the full details of a single club, including its groups,
 * members, subgroups, and counts for events and news.
 */
export const adminGetClubDetails = onCall(
  { region: config.region },
  async (request): Promise<AdminGetClubDetailsResponse> => {
    try {
      await requirePlatformAdmin(request);

      const { clubId } = (request.data || {}) as AdminGetClubDetailsRequest;

      if (!clubId) {
        throw new HttpsError("invalid-argument", "clubId is required");
      }

      const db = admin.firestore();
      const clubRef = db.collection("clubs").doc(clubId);

      // 1. Fetch the club document itself.
      const clubDoc = await clubRef.get();
      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }
      const clubData = deepSerializeTimestamps({
        id: clubDoc.id,
        ...clubDoc.data(),
      });

      // 2. Fetch groups, club members, events count, and news count in
      //    parallel for better latency.
      const [
        groupsSnapshot,
        clubMembersDoc,
        eventsSnapshot,
        newsSnapshot,
      ] = await Promise.all([
        clubRef.collection("groups").get(),
        clubRef.collection("allMembers").doc("members").get(),
        clubRef.collection("events").select().get(), // select() = metadata only
        clubRef.collection("news").select().get(),
      ]);

      // Groups with basic data.
      const groups: Record<string, any>[] = groupsSnapshot.docs.map((doc) =>
        deepSerializeTimestamps({ id: doc.id, ...doc.data() }),
      );

      // Club members array.
      const clubMembersRaw = clubMembersDoc.exists
        ? (clubMembersDoc.data()?.members ?? [])
        : [];
      const clubMembers = deepSerializeTimestamps(clubMembersRaw);

      // 3. For each group, fetch its members and subgroups in parallel.
      const groupMembersMap: Record<string, Record<string, any>[]> = {};
      const subgroupsMap: Record<string, Record<string, any>[]> = {};

      await Promise.all(
        groupsSnapshot.docs.map(async (groupDoc) => {
          const gid = groupDoc.id;
          const groupRef = clubRef.collection("groups").doc(gid);

          const [memberDoc, subgroupsSnap] = await Promise.all([
            groupRef.collection("allMembers").doc("members").get(),
            groupRef.collection("subgroups").get(),
          ]);

          groupMembersMap[gid] = deepSerializeTimestamps(
            memberDoc.exists ? (memberDoc.data()?.members ?? []) : [],
          );

          subgroupsMap[gid] = subgroupsSnap.docs.map((doc) =>
            deepSerializeTimestamps({ id: doc.id, ...doc.data() }),
          );
        }),
      );

      return {
        success: true,
        club: clubData,
        groups,
        clubMembers,
        groupMembers: groupMembersMap,
        subgroups: subgroupsMap,
        eventCount: eventsSnapshot.size,
        newsCount: newsSnapshot.size,
      };
    } catch (error) {
      console.error("Error in adminGetClubDetails:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to get club details");
    }
  },
);
