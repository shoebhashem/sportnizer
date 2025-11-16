// /hooks/useVersionedData.ts

import { useVersionedData } from '@/contexts/UserContext';
import { useCallback, useEffect, useState } from 'react';

/**
 * Hook for managing event data
 */
export function useEventData(clubId?: string, eventId?: string) {
  const [eventData, setEventData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { fetchEventData } = useVersionedData();

  const loadEventData = useCallback(async () => {
    if (!clubId || !eventId) return;

    setLoading(true);
    setError(null);
    
    try {
      const result = await fetchEventData(clubId, eventId);
      
      if (result.success) {
        setEventData(result.data);
      } else {
        setError(result.error || 'Failed to fetch event data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [clubId, eventId, fetchEventData]);

  const refreshEventData = useCallback(() => {
    loadEventData();
  }, [loadEventData]);

  useEffect(() => {
    if (clubId && eventId) {
      loadEventData();
    }
  }, [loadEventData, clubId, eventId]);

  return {
    eventData,
    loading,
    error,
    refreshEventData,
  };
}

/**
 * Hook for managing club events
 */
export function useClubEvents(clubId?: string) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { fetchClubEvents } = useVersionedData();

  const loadClubEvents = useCallback(async () => {
    if (!clubId) return;

    setLoading(true);
    setError(null);
    
    try {
      const result = await fetchClubEvents(clubId);
      
      if (result.success) {
        setEvents(result.data || []);
      } else {
        setError(result.error || 'Failed to fetch club events');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [clubId, fetchClubEvents]);

  const refreshClubEvents = useCallback(() => {
    loadClubEvents();
  }, [loadClubEvents]);

  useEffect(() => {
    if (clubId) {
      loadClubEvents();
    }
  }, [loadClubEvents, clubId]);

  return {
    events,
    loading,
    error,
    refreshClubEvents,
  };
}

/**
 * Hook for managing user events (all events user has access to)
 */
export function useUserEvents() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { fetchUserEvents } = useVersionedData();

  const loadUserEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await fetchUserEvents();
      
      if (result.success) {
        setEvents(result.data || []);
      } else {
        setError(result.error || 'Failed to fetch user events');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [fetchUserEvents]);

  const refreshUserEvents = useCallback(() => {
    loadUserEvents();
  }, [loadUserEvents]);

  useEffect(() => {
    loadUserEvents();
  }, [loadUserEvents]);

  return {
    events,
    loading,
    error,
    refreshUserEvents,
  };
}
