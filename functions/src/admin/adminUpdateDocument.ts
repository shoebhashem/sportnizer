import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { config } from "../utils/config";
import { requirePlatformAdmin } from "./requirePlatformAdmin";

interface AdminUpdateDocumentRequest {
  documentPath: string;
  data: Record<string, any>;
  operation: "update" | "delete";
}

interface AdminUpdateDocumentResponse {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Generic admin function to update or delete any Firestore document by path.
 *
 * - "update": calls `set(data, { merge: true })` so it creates the document
 *   if it does not exist yet, or merges into the existing one.
 * - "delete": calls `delete()` (the `data` field is ignored).
 *
 * Every invocation is logged with the admin UID, document path, and operation.
 */
export const adminUpdateDocument = onCall(
  { region: config.region },
  async (request): Promise<AdminUpdateDocumentResponse> => {
    try {
      await requirePlatformAdmin(request);

      const { documentPath, data, operation } = (request.data ||
        {}) as AdminUpdateDocumentRequest;

      if (!documentPath || typeof documentPath !== "string") {
        throw new HttpsError(
          "invalid-argument",
          "documentPath is required and must be a string",
        );
      }

      if (!operation || !["update", "delete"].includes(operation)) {
        throw new HttpsError(
          "invalid-argument",
          'operation must be "update" or "delete"',
        );
      }

      // Basic safety: ensure the path has an even number of segments
      // (i.e. points to a document, not a collection).
      const segments = documentPath.split("/").filter(Boolean);
      if (segments.length === 0 || segments.length % 2 !== 0) {
        throw new HttpsError(
          "invalid-argument",
          "documentPath must point to a document (even number of path segments)",
        );
      }

      const db = admin.firestore();
      const docRef = db.doc(documentPath);

      const adminUid = request.auth!.uid;

      if (operation === "update") {
        if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
          throw new HttpsError(
            "invalid-argument",
            "data is required for update operations and must be a non-empty object",
          );
        }

        await docRef.set(data, { merge: true });

        console.log(
          `[ADMIN] UPDATE by ${adminUid} on ${documentPath} | keys: ${Object.keys(data).join(", ")}`,
        );

        return {
          success: true,
          message: `Document ${documentPath} updated successfully`,
        };
      }

      // operation === "delete"
      await docRef.delete();

      console.log(`[ADMIN] DELETE by ${adminUid} on ${documentPath}`);

      return {
        success: true,
        message: `Document ${documentPath} deleted successfully`,
      };
    } catch (error) {
      console.error("Error in adminUpdateDocument:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to perform admin document operation");
    }
  },
);
