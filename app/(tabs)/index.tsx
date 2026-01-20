import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../../components/Button';
import ConfirmationModal from '../../components/ConfirmationModal';
import InvitationModal from '../../components/InvitationModal';
import NotificationBell from '../../components/NotificationBell';
import { getCurrentUser } from '../../services/auth/authService';
import { acceptGroupInvite, fetchGroupInvites, GroupInviteInfo, rejectGroupInvite } from '../../services/fetchGroupInvites';
import { HomeAnnouncement, HomeEvent, HomePoll, NewsFlowItem } from '../../services/types';

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
  type?: 'error' | 'success' | 'info';
}

export default function Index() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'events' | 'newsflow'>('events');
  const [events, setEvents] = useState<HomeEvent[]>([]);
  const [newsItems, setNewsItems] = useState<NewsFlowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [eventsWeeksLoaded, setEventsWeeksLoaded] = useState(1);
  const [newsWeeksLoaded, setNewsWeeksLoaded] = useState(2);
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: '',
    type: 'error'
  });
  
  // Invitation state
  const [pendingInvites, setPendingInvites] = useState<GroupInviteInfo[]>([]);
  const [currentInvite, setCurrentInvite] = useState<GroupInviteInfo | null>(null);
  const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [processedInvites, setProcessedInvites] = useState<Set<string>>(new Set()); // Track processed invites
  const [hasLoadedInitialInvites, setHasLoadedInitialInvites] = useState(false); // Track if we've done initial load

  const loadInvitations = useCallback(async () => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        console.log('No current user, skipping invitation check');
        return;
      }
      
      console.log('Fetching group invitations...');
      const response = await fetchGroupInvites(currentUser.uid);
      console.log('Found invitations:', response);
      
      // Extract invitations from response
      const allInvites = response.invites || [];
      
      // Filter out invitations we've already processed
      const newInvites = allInvites.filter(invite => {
        const inviteKey = `${invite.clubId}-${invite.groupId}`;
        return !processedInvites.has(inviteKey);
      });
      
      console.log('New unprocessed invitations:', newInvites);
      setPendingInvites(newInvites);
      
      // Show the first new invitation if any exist and no modal is currently visible
      if (newInvites.length > 0 && !isInviteModalVisible && !currentInvite) {
        setCurrentInvite(newInvites[0]);
        setIsInviteModalVisible(true);
      }
    } catch (error) {
      console.error('Error loading invitations:', error);
    }
  }, [isInviteModalVisible, currentInvite, processedInvites]);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      console.log('Loading initial home screen data...');
      
      // Load invitations only on first load
      if (!hasLoadedInitialInvites) {
        await loadInvitations();
        setHasLoadedInitialInvites(true);
      }
      
      // Placeholder for other data loading
      if (activeTab === 'events') {
        //const eventsData = await homeService.getUpcomingEvents(1);
        //setEvents(eventsData);
        //setEventsWeeksLoaded(1);
      } else {
        //const newsData = await homeService.getNewsFlow(2);
        //setNewsItems(newsData);
        //setNewsWeeksLoaded(2);
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to load data. Please try again.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [activeTab, loadInvitations, hasLoadedInitialInvites]);

  // Load initial data when screen focuses
  useFocusEffect(
    useCallback(() => {
      loadInitialData();
    }, [loadInitialData])
  );

  const handleTabSwitch = async (tab: 'events' | 'newsflow') => {
    if (tab === activeTab) return;
    
    setActiveTab(tab);
    setLoading(true);
    
    try {
      if (tab === 'events' && events.length === 0) {
        //const eventsData = await homeService.getUpcomingEvents(1);
        //setEvents(eventsData);
        //setEventsWeeksLoaded(1);
      } else if (tab === 'newsflow' && newsItems.length === 0) {
        //const newsData = await homeService.getNewsFlow(2);
        //setNewsItems(newsData);
        //setNewsWeeksLoaded(2);
      }
    } catch (error) {
      console.error('Error switching tabs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMoreEvents = async () => {
    try {
      //const newWeeksToLoad = eventsWeeksLoaded + 4; // Load 4 more weeks
      //const eventsData = await homeService.getUpcomingEvents(newWeeksToLoad);
      //setEvents(eventsData);
      //setEventsWeeksLoaded(newWeeksToLoad);
    } catch (error) {
      console.error('Error loading more events:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to load more events. Please try again.',
        type: 'error'
      });
    }
  };

  const handleLoadMoreNews = async () => {
    try {
      const newWeeksToLoad = newsWeeksLoaded + 4; // Load 4 more weeks
      //const newsData = await homeService.getNewsFlow(newWeeksToLoad);
      //setNewsItems(newsData);
      //setNewsWeeksLoaded(newWeeksToLoad);
    } catch (error) {
      console.error('Error loading more news:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to load more news. Please try again.',
        type: 'error'
      });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  };

  const handleEventPress = (event: HomeEvent) => {
    router.push({
      pathname: '/event-details',
      params: { eventId: event.id }
    } as any);
  };

  const handleEventResponse = async (eventId: string, response: 'accepted' | 'declined' | 'maybe') => {
    try {
      //await homeService.updateEventResponse(eventId, response);
      // Refresh the events to show updated response
      //const eventsData = await homeService.getUpcomingEvents(eventsWeeksLoaded);
      //setEvents(eventsData);
      
      setModal({
        visible: true,
        title: 'Response Recorded',
        message: `You have ${response} the event.`,
        type: 'success'
      });
    } catch (error) {
      console.error('Error updating event response:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to record your response. Please try again.',
        type: 'error'
      });
    }
  };

  // Invitation handlers
  const handleAcceptInvite = async () => {
    if (!currentInvite) return;
    
    setInviteLoading(true);
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }
      
      // Mark this invitation as processed immediately
      const inviteKey = `${currentInvite.clubId}-${currentInvite.groupId}`;
      setProcessedInvites(prev => new Set(prev.add(inviteKey)));
      
      // YOUTH INVITATION: Create youth document first, then process invitation
      if (currentInvite.invitationType === 'youth_member' && currentInvite.youthData) {
        console.log('👶 Creating youth member document before accepting invitation...');
        
        const { httpsCallable } = await import('firebase/functions');
        const { functions } = await import('@/services/core/firebase');
        
        const createYouthFn = httpsCallable(functions, 'createYouthMemberDocument');
        const youthResult = await createYouthFn({
          guardianUid: currentUser.uid,
          guardianEmail: currentUser.email || '',
          guardianName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Guardian',
          childName: currentInvite.youthData.childName,
          dateOfBirth: currentInvite.youthData.dateOfBirth,
          relationship: currentInvite.youthData.relationship
        });
        
        const youthResponse = youthResult.data as any;
        if (!youthResponse.success) {
          throw new Error(youthResponse.error || 'Failed to create youth member');
        }
        
        console.log('✅ Youth member document created:', youthResponse.youthUid);
        
        // Get guardian info for the invitation processing
        const guardianEmail = currentUser.email || '';
        const guardianName = currentUser.displayName || guardianEmail.split('@')[0] || 'Guardian';
        
        // Now process the invitation with the youth's userId (not guardian's) and guardian info
        const { addRegularMemberToGroupService } = await import('@/services/orchestration/addRegularMemberToGroup');
        const invitationResult = await addRegularMemberToGroupService.processInvitationAfterUserResponse(
          currentInvite.inviteId,      // invitationToken
          youthResponse.youthUid,      // Use youth's userId, not guardian's
          'accept',                    // action
          {                            // guardianInfo to avoid permission issues
            guardianUid: currentUser.uid,
            guardianEmail: guardianEmail,
            guardianName: guardianName,
            relationship: currentInvite.youthData.relationship
          }
        );
        
        if (!invitationResult.success) {
          throw new Error(invitationResult.error || 'Failed to process invitation');
        }
        
        console.log('✅ Youth invitation processed successfully!');
      } else {
        // REGULAR INVITATION: Standard flow
        await acceptGroupInvite(currentInvite.inviteId, currentInvite.clubId, currentInvite.groupId);
      }
      
      // Remove from pending invites
      const updatedInvites = pendingInvites.filter(invite => 
        invite.clubId !== currentInvite.clubId || invite.groupId !== currentInvite.groupId
      );
      setPendingInvites(updatedInvites);
      
      // Show success message
      const successMessage = currentInvite.youthData 
        ? `${currentInvite.youthData.childName} has been successfully added to ${currentInvite.groupName}!`
        : `You've successfully joined ${currentInvite.groupName}!`;
      
      setModal({
        visible: true,
        title: 'Invitation Accepted',
        message: successMessage,
        type: 'success'
      });
      
      // Close modal and show next invitation if any (pass updated list)
      closeInviteModalWithUpdatedList(updatedInvites);
      
    } catch (error) {
      console.error('Error accepting invitation:', error);
      // Remove from processed invites if there was an error
      if (currentInvite) {
        const inviteKey = `${currentInvite.clubId}-${currentInvite.groupId}`;
        setProcessedInvites(prev => {
          const newSet = new Set(prev);
          newSet.delete(inviteKey);
          return newSet;
        });
      }
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to accept invitation. Please try again.',
        type: 'error'
      });
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRejectInvite = async () => {
    if (!currentInvite) return;
    
    setInviteLoading(true);
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }
      
      // Mark this invitation as processed immediately
      const inviteKey = `${currentInvite.clubId}-${currentInvite.groupId}`;
      setProcessedInvites(prev => new Set(prev.add(inviteKey)));
      
      await rejectGroupInvite(currentInvite.inviteId, currentInvite.clubId, currentInvite.groupId);
      
      // Remove from pending invites
      const updatedInvites = pendingInvites.filter(invite => 
        invite.clubId !== currentInvite.clubId || invite.groupId !== currentInvite.groupId
      );
      setPendingInvites(updatedInvites);
      
      // Close modal and show next invitation if any (pass updated list)
      closeInviteModalWithUpdatedList(updatedInvites);
      
    } catch (error) {
      console.error('Error rejecting invitation:', error);
      // Remove from processed invites if there was an error
      if (currentInvite) {
        const inviteKey = `${currentInvite.clubId}-${currentInvite.groupId}`;
        setProcessedInvites(prev => {
          const newSet = new Set(prev);
          newSet.delete(inviteKey);
          return newSet;
        });
      }
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to reject invitation. Please try again.',
        type: 'error'
      });
    } finally {
      setInviteLoading(false);
    }
  };

  const closeInviteModalWithUpdatedList = (updatedInvites: GroupInviteInfo[]) => {
    setIsInviteModalVisible(false);
    setCurrentInvite(null);
    
    // Filter out any processed invitations from the updated list
    const unprocessedInvites = updatedInvites.filter(invite => {
      const inviteKey = `${invite.clubId}-${invite.groupId}`;
      return !processedInvites.has(inviteKey);
    });
    
    // Show next invitation if any remaining unprocessed invites
    if (unprocessedInvites.length > 0) {
      setTimeout(() => {
        setCurrentInvite(unprocessedInvites[0]);
        setIsInviteModalVisible(true);
      }, 500); // Small delay for better UX
    }
  };

  const closeInviteModal = () => {
    setIsInviteModalVisible(false);
    setCurrentInvite(null);
    
    // Show next invitation if any remaining
    const remainingInvites = pendingInvites.filter(invite => 
      invite.clubId !== currentInvite?.clubId || invite.groupId !== currentInvite?.groupId
    );
    
    if (remainingInvites.length > 0) {
      setTimeout(() => {
        setCurrentInvite(remainingInvites[0]);
        setIsInviteModalVisible(true);
      }, 500); // Small delay for better UX
    }
  };

  const handleAnnouncementPress = async (announcement: HomeAnnouncement) => {
    try {
      //await homeService.markAnnouncementAsRead(announcement.id);
      // You could implement a detailed view here
      setModal({
        visible: true,
        title: announcement.title,
        message: announcement.message,
        type: 'info'
      });
    } catch (error) {
      console.error('Error marking announcement as read:', error);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    return `${Math.floor(diffInDays / 30)} months ago`;
  };

  const handleModalClose = () => {
    setModal({ ...modal, visible: false });
  };

  // Handle invitation click from notification bell
  const handleNotificationInvitationPress = async (invitationToken: string) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        console.error('No current user');
        return;
      }

      // Fetch the specific invitation by token (includes youth invitations)
      const { fetchInvitationByToken } = await import('@/services/fetchGroupInvites');
      const invitation = await fetchInvitationByToken(currentUser.uid, invitationToken);
      
      if (invitation) {
        setCurrentInvite(invitation);
        setIsInviteModalVisible(true);
      } else {
        console.error('Invitation not found or already processed:', invitationToken);
      }
    } catch (error) {
      console.error('Error loading invitation from notification:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sportnizer</Text>
        <NotificationBell 
          onInvitationPress={handleNotificationInvitationPress}
          iconSize={24}
          iconColor={theme.colors.white}
        />
      </View>

      {/* Tab Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'events' && styles.activeTab]}
          onPress={() => handleTabSwitch('events')}
        >
          <Ionicons 
            name="calendar-outline" 
            size={20} 
            color={activeTab === 'events' ? theme.colors.primary : theme.colors.textSecondary} 
          />
          <Text style={[styles.tabText, activeTab === 'events' && styles.activeTabText]}>
            Events
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'newsflow' && styles.activeTab]}
          onPress={() => handleTabSwitch('newsflow')}
        >
          <Ionicons 
            name="newspaper-outline" 
            size={20} 
            color={activeTab === 'newsflow' ? theme.colors.primary : theme.colors.textSecondary} 
          />
          <Text style={[styles.tabText, activeTab === 'newsflow' && styles.activeTabText]}>
            News Flow
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.secondary} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : activeTab === 'events' ? (
          <View style={styles.eventsContainer}>
            {events.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={64} color={theme.colors.textSecondary} />
                <Text style={styles.emptyText}>No upcoming events</Text>
                <Text style={styles.emptySubtext}>Check back later or create an event</Text>
              </View>
            ) : (
              <>
                {events.map((event, index) => (
                  <EventCard 
                    key={`${event.id}-${index}`}
                    event={event}
                    onPress={() => handleEventPress(event)}
                    onResponse={handleEventResponse}
                    formatDate={formatDate}
                    formatTime={formatTime}
                  />
                ))}
                
                <View style={styles.loadMoreContainer}>
                  <Button
                    label="Load More Events"
                    onPress={handleLoadMoreEvents}
                    theme="secondary"
                  />
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={styles.newsContainer}>
            {newsItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="newspaper-outline" size={64} color={theme.colors.textSecondary} />
                <Text style={styles.emptyText}>No recent news</Text>
                <Text style={styles.emptySubtext}>Check back later for announcements and polls</Text>
              </View>
            ) : (
              <>
                {newsItems.map((item, index) => (
                  <NewsCard 
                    key={`${item.id}-${index}`}
                    item={item}
                    onPress={item.type === 'announcement' ? () => handleAnnouncementPress(item as HomeAnnouncement) : undefined}
                    formatTimeAgo={formatTimeAgo}
                  />
                ))}
                
                <View style={styles.loadMoreContainer}>
                  <Button
                    label="Load More News"
                    onPress={handleLoadMoreNews}
                    theme="secondary"
                  />
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal */}
      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        confirmText="OK"
        cancelText=""
        onConfirm={handleModalClose}
        onCancel={handleModalClose}
        confirmButtonTheme="primary"
      />

      {/* Group Invitation Modal */}
      {currentInvite && (
        <InvitationModal
          visible={isInviteModalVisible}
          groupName={currentInvite.groupName}
          inviterName={currentInvite.invitedByName || 'Someone'}
          onAccept={handleAcceptInvite}
          onReject={handleRejectInvite}
          loading={inviteLoading}
          youthData={currentInvite.youthData}
        />
      )}
    </SafeAreaView>
  );
}

// Event Card Component
const EventCard = ({ event, onPress, onResponse, formatDate, formatTime }: {
  event: HomeEvent;
  onPress: () => void;
  onResponse: (eventId: string, response: 'accepted' | 'declined' | 'maybe') => void;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
}) => {
  const currentUser = getCurrentUser();
  const userResponse = currentUser ? event.responses[currentUser.uid]?.response : undefined;

  return (
    <TouchableOpacity style={styles.eventCard} onPress={onPress}>
      <View style={styles.eventHeader}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <View style={styles.eventTypeContainer}>
          <Text style={styles.eventType}>{event.eventType}</Text>
        </View>
      </View>

      {/* Recipient Name */}
      <View style={styles.recipientContainer}>
        <Ionicons name="person-outline" size={14} color={theme.colors.secondary} />
        <Text style={styles.recipientText}>Hey {event.recipientName}!</Text>
      </View>
      
      <View style={styles.eventDetails}>
        {/* Date */}
        <View style={styles.eventDetailRow}>
          <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.eventDetailText}>{formatDate(event.startTime)}</Text>
        </View>

        {/* Gathering Time (if available) */}
        {event.gatheringTime && (
          <View style={styles.eventDetailRow}>
            <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.eventDetailText}>
              Gather at {formatTime(event.gatheringTime)}
            </Text>
          </View>
        )}

        {/* Start Time - End Time */}
        <View style={styles.eventDetailRow}>
          <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.eventDetailText}>
            {formatTime(event.startTime)} - {formatTime(event.endTime)}
          </Text>
        </View>
        
        {/* Location */}
        <View style={styles.eventDetailRow}>
          <Ionicons name="location-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.eventDetailText}>{event.location || 'Location TBD'}</Text>
        </View>
      </View>

      {/* Response Buttons */}
      <View style={styles.responseButtons}>
        <TouchableOpacity
          style={[styles.responseButton, styles.acceptButton, userResponse === 'accepted' && styles.selectedResponse]}
          onPress={() => onResponse(event.id, 'accepted')}
        >
          <Text style={[styles.responseButtonText, userResponse === 'accepted' && styles.selectedResponseText]}>
            Accept
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.responseButton, styles.declineButton, userResponse === 'declined' && styles.selectedResponse]}
          onPress={() => onResponse(event.id, 'declined')}
        >
          <Text style={[styles.responseButtonText, userResponse === 'declined' && styles.selectedResponseText]}>
            Decline
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

// News Card Component
const NewsCard = ({ item, onPress, formatTimeAgo }: {
  item: NewsFlowItem;
  onPress?: () => void;
  formatTimeAgo: (date: Date) => string;
}) => {
  const currentUser = getCurrentUser();
  const isRead = item.type === 'announcement' && currentUser ? 
    (item as HomeAnnouncement).readBy[currentUser.uid] : false;

  return (
    <TouchableOpacity 
      style={[styles.newsCard, item.type === 'announcement' && !isRead && styles.unreadCard]} 
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.newsHeader}>
        <View style={styles.newsTypeContainer}>
          <Ionicons 
            name={item.type === 'announcement' ? 'megaphone-outline' : 'bar-chart-outline'} 
            size={16} 
            color={theme.colors.secondary} 
          />
          <Text style={styles.newsType}>
            {item.type === 'announcement' ? 'Announcement' : 'Poll'}
          </Text>
        </View>
        <Text style={styles.newsTime}>{formatTimeAgo(item.createdAt)}</Text>
      </View>
      
      <Text style={styles.newsTitle}>
        {item.type === 'announcement' ? (item as HomeAnnouncement).title : (item as HomePoll).question}
      </Text>
      
      {item.type === 'announcement' ? (
        <Text style={styles.newsContent} numberOfLines={3}>
          {(item as HomeAnnouncement).message}
        </Text>
      ) : (
        <View style={styles.pollOptions}>
          {(item as HomePoll).options.slice(0, 2).map((option, index) => (
            <Text key={index} style={styles.pollOption} numberOfLines={1}>
              • {option}
            </Text>
          ))}
          {(item as HomePoll).options.length > 2 && (
            <Text style={styles.pollOption}>+ {(item as HomePoll).options.length - 2} more options</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.layout.containerPadding,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xlarge,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.bold,
    flex: 1,
    textAlign: 'center',
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: theme.colors.inputBackground,
    marginHorizontal: theme.layout.containerPadding,
    marginVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.small,
  },
  activeTab: {
    backgroundColor: theme.colors.secondary,
  },
  tabText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
    marginLeft: theme.spacing.xs,
  },
  activeTabText: {
    color: theme.colors.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.layout.containerPadding,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  eventsContainer: {
    paddingBottom: theme.spacing.xl,
  },
  newsContainer: {
    paddingBottom: theme.spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  loadMoreContainer: {
    paddingVertical: theme.spacing.lg,
  },
  
  // Event Card Styles
  eventCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  eventTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  eventTypeContainer: {
    backgroundColor: theme.colors.secondary + '20',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.small,
  },
  eventType: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
  recipientContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  recipientText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
    marginLeft: theme.spacing.xs,
    fontStyle: 'italic',
  },
  eventDetails: {
    marginBottom: theme.spacing.md,
  },
  eventDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  eventDetailText: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  responseButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  responseButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.small,
    alignItems: 'center',
    borderWidth: 1,
  },
  acceptButton: {
    backgroundColor: 'transparent',
    borderColor: '#4CAF50',
  },
  declineButton: {
    backgroundColor: 'transparent',
    borderColor: '#f44336',
  },
  selectedResponse: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  responseButtonText: {
    fontSize: theme.typography.fontSize.small,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
  },
  selectedResponseText: {
    color: theme.colors.primary,
  },
  
  // News Card Styles
  newsCard: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  unreadCard: {
    borderColor: theme.colors.secondary,
    borderWidth: 2,
  },
  newsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  newsTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  newsType: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeight.medium,
    marginLeft: theme.spacing.xs,
    textTransform: 'capitalize',
  },
  newsTime: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
  },
  newsTitle: {
    fontSize: theme.typography.fontSize.large,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.sm,
  },
  newsContent: {
    fontSize: theme.typography.fontSize.medium,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  pollOptions: {
    marginTop: theme.spacing.xs,
  },
  pollOption: {
    fontSize: theme.typography.fontSize.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
});
