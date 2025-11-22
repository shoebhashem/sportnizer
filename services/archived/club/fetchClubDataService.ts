// /services/club/fetchClubDataService.ts

import type { ClubMembership } from "../types/club";
import type { UserProfile } from "../types/user";

/**
 * Fetches the list of club names from the user's profile.
 *
 * @param userProfile The current user's profile object.
 * @returns An array of club names the user is a member of.
 */
export function getUserClubNames(userProfile: UserProfile | null): string[] {
  if (!userProfile || !userProfile.clubs) {
    return [];
  }

  return userProfile.clubs.map((club: ClubMembership) => club.clubName);
}
