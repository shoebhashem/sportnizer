/**
 * Helper function to get club admin email addresses
 * 
 * Used in removal operations to provide users with contact information
 * when they need to escalate to club-level administration.
 */

import { fetchClubMembers } from '../fetchClubMembers';

export async function getClubAdminContacts(clubId: string): Promise<string[]> {
  try {
    const result = await fetchClubMembers(clubId);
    
    if (!result.success || !result.members) {
      return [];
    }
    
    // Filter members who have club-admin role
    const admins = result.members.filter(member => 
      member.roles?.includes('club-admin')
    );
    
    // Extract unique email addresses
    const emails = admins
      .map(admin => admin.email)
      .filter((email): email is string => !!email);
    
    // Remove duplicates
    return Array.from(new Set(emails));
  } catch (error) {
    console.error('Error getting club admin contacts:', error);
    return [];
  }
}
