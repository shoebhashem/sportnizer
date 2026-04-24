import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isValidFeeCategory, resolveBasAccount } from "../config/accounting";
import {
    getMinimumChargeAmount,
    isSupportedCurrency,
    SupportedCurrency,
} from "../config/stripe";
import { createNotificationDirect } from "../notifications/createNotification";
import { config } from "../utils/config";

/**
 * Create a membership fee for a group
 *
 * This creates a fee request that targets specific roles within a group.
 * Members with those roles will receive payment notifications.
 *
 * SECURITY: Only club-admin role can create fees (not group admin/coach!)
 */
export const createMembershipFee = onCall(
  { region: config.region },
  async (
    request,
  ): Promise<{
    success: boolean;
    feeId: string;
    includedMembersCount: number;
  }> => {
    // 1. Validate authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      clubId,
      groupId,
      title,
      description,
      amount,
      currency,
      dueDate,
      targetRoles,
      category,
      earmarkedGroupId,
    } = request.data;

    // 2. Validate required fields
    if (!clubId || !groupId || !title || !amount || !currency || !targetRoles) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required fields: clubId, groupId, title, amount, currency, targetRoles",
      );
    }

    // Validate category
    if (!category || !isValidFeeCategory(category)) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid or missing fee category: ${category}`,
      );
    }

    // Validate title
    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle.length > 100) {
      throw new HttpsError(
        "invalid-argument",
        "Title must be between 1 and 100 characters",
      );
    }

    // Validate amount (in smallest currency unit)
    if (
      typeof amount !== "number" ||
      amount <= 0 ||
      !Number.isInteger(amount)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Amount must be a positive integer (in smallest currency unit)",
      );
    }

    // Validate currency
    const normalizedCurrency = currency.toLowerCase();
    if (!isSupportedCurrency(normalizedCurrency)) {
      throw new HttpsError(
        "invalid-argument",
        `Unsupported currency: ${currency}`,
      );
    }

    // Check minimum charge amount
    const minAmount = getMinimumChargeAmount(
      normalizedCurrency as SupportedCurrency,
    );
    if (amount < minAmount) {
      throw new HttpsError(
        "invalid-argument",
        `Amount must be at least ${minAmount / 100} ${normalizedCurrency.toUpperCase()}`,
      );
    }

    // Validate targetRoles
    if (!Array.isArray(targetRoles) || targetRoles.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "At least one target role must be selected",
      );
    }

    const db = admin.firestore();

    try {
      // 3. Verify user is club-admin (NOT just group admin!)
      const userDoc = await db.collection("users").doc(request.auth.uid).get();

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User profile not found");
      }

      const userData = userDoc.data();
      const clubAccess = userData?.clubAccess || [];

      const isClubAdmin = clubAccess.some(
        (access: { clubId: string; role: string }) =>
          access.clubId === clubId && access.role === "club-admin",
      );

      if (!isClubAdmin) {
        throw new HttpsError(
          "permission-denied",
          "Only club administrators can create membership fees",
        );
      }

      // 4. Verify club has Stripe enabled
      const clubDoc = await db.collection("clubs").doc(clubId).get();

      if (!clubDoc.exists) {
        throw new HttpsError("not-found", "Club not found");
      }

      const clubData = clubDoc.data()!;

      if (!clubData.stripe?.chargesEnabled) {
        throw new HttpsError(
          "failed-precondition",
          "Please complete payment setup in Club Settings first",
        );
      }

      // 5. Get group info
      const groupDoc = await db
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId)
        .get();

      if (!groupDoc.exists) {
        throw new HttpsError("not-found", "Group not found");
      }

      const groupData = groupDoc.data()!;

      // 6. Get all members in the group
      const membersDoc = await db
        .collection("clubs")
        .doc(clubId)
        .collection("groups")
        .doc(groupId)
        .collection("allMembers")
        .doc("members")
        .get();

      if (!membersDoc.exists) {
        throw new HttpsError("not-found", "Group members not found");
      }

      const membersData = membersDoc.data();
      const allMembers = membersData?.members || [];

      // 7. Filter members by target roles
      const targetMembers = allMembers.filter((member: { roles: string[] }) =>
        member.roles.some((role: string) => targetRoles.includes(role)),
      );

      if (targetMembers.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "No members match the selected roles",
        );
      }

      const includedMemberIds = targetMembers.map(
        (m: { userId: string }) => m.userId,
      );

      // 8. Parse due date
      let dueDateTimestamp = null;
      if (dueDate) {
        const parsedDate = new Date(dueDate);
        if (isNaN(parsedDate.getTime())) {
          throw new HttpsError("invalid-argument", "Invalid due date format");
        }
        dueDateTimestamp = Timestamp.fromDate(parsedDate);
      }

      // 9. Resolve BAS account server-side (never trust client)
      const clubCountry = clubData.country || "SE";
      const basAccount = resolveBasAccount(category, clubCountry);

      // Create the membership fee document
      const feeRef = db.collection("membershipFees").doc();

      await feeRef.set({
        clubId,
        groupId,
        groupName: groupData.name,
        title: trimmedTitle,
        description: description?.trim() || "",
        amount,
        currency: normalizedCurrency,
        dueDate: dueDateTimestamp,
        targetRoles,
        includedMembers: includedMemberIds,
        totalExpected: targetMembers.length,
        totalPaid: 0,
        status: "active",
        category,
        basAccount,
        earmarkedGroupId: earmarkedGroupId || null,
        createdBy: request.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
        lastModifiedAt: FieldValue.serverTimestamp(),
      });

      // 10. Update each target member's payment status
      const updatedMembers = allMembers.map(
        (member: { userId: string; paymentStatus?: any }) => {
          if (includedMemberIds.includes(member.userId)) {
            return {
              ...member,
              paymentStatus: {
                activeFeeId: feeRef.id,
                status: "pending",
                amount,
                currency: normalizedCurrency,
                dueDate: dueDateTimestamp,
                paidAt: null,
                paidBy: null,
              },
            };
          }
          return member;
        },
      );

      await membersDoc.ref.update({ members: updatedMembers });

      // 11. Create notifications for each target member using createNotificationDirect
      // This ensures consistent notification structure with read/dismissed fields
      const notificationPromises: Promise<string>[] = [];

      for (const member of targetMembers) {
        // Check if this is a youth member using the same pattern as createEventV2
        const isYouthMember =
          member.needsGuardian &&
          member.guardiansContacts &&
          member.guardiansContacts.length > 0;

        if (isYouthMember) {
          // For youth members, notify all guardians
          for (const guardian of member.guardiansContacts) {
            if (guardian.guardianUid) {
              notificationPromises.push(
                createNotificationDirect(guardian.guardianUid, {
                  type: "payment_request",
                  title: trimmedTitle,
                  message: `Payment required for ${member.name}: ${trimmedTitle}`,
                  sourceId: feeRef.id,
                  sourceCollection: "membershipFees",
                  clubId,
                  clubName: clubData.name || "Club",
                  groupId,
                  groupName: groupData.name,
                  priority: "high",
                  metadata: {
                    feeId: feeRef.id,
                    beneficiaryId: member.userId,
                    beneficiaryName: member.name,
                    amount,
                    currency: normalizedCurrency,
                    dueDate: dueDateTimestamp,
                  },
                }).catch((err) => {
                  console.error(
                    `Failed to create notification for guardian ${guardian.guardianUid}:`,
                    err,
                  );
                  return ""; // Return empty string on failure, don't block
                }),
              );
            }
          }
        } else {
          // For adult members, notify directly
          notificationPromises.push(
            createNotificationDirect(member.userId, {
              type: "payment_request",
              title: trimmedTitle,
              message: `Payment required: ${trimmedTitle}`,
              sourceId: feeRef.id,
              sourceCollection: "membershipFees",
              clubId,
              clubName: clubData.name || "Club",
              groupId,
              groupName: groupData.name,
              priority: "high",
              metadata: {
                feeId: feeRef.id,
                beneficiaryId: member.userId,
                beneficiaryName: member.name,
                amount,
                currency: normalizedCurrency,
                dueDate: dueDateTimestamp,
              },
            }).catch((err) => {
              console.error(
                `Failed to create notification for user ${member.userId}:`,
                err,
              );
              return ""; // Return empty string on failure, don't block
            }),
          );
        }
      }

      // Wait for all notifications (failures are caught individually)
      await Promise.all(notificationPromises);

      return {
        success: true,
        feeId: feeRef.id,
        includedMembersCount: targetMembers.length,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error("Error creating membership fee:", error);
      throw new HttpsError(
        "internal",
        "Failed to create membership fee. Please try again.",
      );
    }
  },
);
