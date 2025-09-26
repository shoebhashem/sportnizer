import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Button from '../components/Button';
import ConfirmationModal from '../components/ConfirmationModal';
import { theme } from '../constants/theme';
import { getCurrentUser } from '../services/auth/authService';
import { homeService } from '../services/core/homeService';

interface EventDetails {
  id: string;
  type: 'event' | 'recurring-event';
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location: string;
  eventType: 'practice' | 'game' | 'meeting' | 'other';
  createdBy: string;
  responses: {
    [userId: string]: {
      response: 'accepted' | 'declined' | 'maybe';
      timestamp: any;
    };
  };
  recipientGroups: string[];
  isRecurring: boolean;
  recurringMasterId?: string;
}

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
  type?: 'error' | 'success' | 'info';
}

export default function EventDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const eventId = params.eventId as string;
  
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: '',
    type: 'error'
  });

  const loadEventDetails = useCallback(async () => {
    if (!eventId) {
      setModal({
        visible: true,
        title: 'Error',
        message: 'Event ID is missing.',
        type: 'error'
      });
      return;
    }

    try {
      const db = getFirestore();
      const eventDoc = await getDoc(doc(db, 'events', eventId));
      
      if (!eventDoc.exists()) {
        setModal({
          visible: true,
          title: 'Event Not Found',
          message: 'The event you are looking for could not be found.',
          type: 'error'
        });
        return;
      }

      const eventData = eventDoc.data() as any;
      setEvent({
        id: eventDoc.id,
        type: eventData.type || 'event',
        title: eventData.title || 'Untitled Event',
        description: eventData.description || '',
        startTime: eventData.startTime?.toDate() || new Date(),
        endTime: eventData.endTime?.toDate() || new Date(),
        location: eventData.location || '',
        eventType: eventData.eventType || 'other',
        createdBy: eventData.createdBy || '',
        responses: eventData.responses || {},
        recipientGroups: eventData.recipientGroups || [],
        isRecurring: eventData.type === 'recurring-event',
        recurringMasterId: eventData.recurringMasterId
      });
    } catch (error) {
      console.error('Error loading event details:', error);
      setModal({
        visible: true,
        title: 'Error',
        message: 'Failed to load event details. Please try again.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadEventDetails();
  }, [loadEventDetails]);

  const handleResponse = async (response: 'accepted' | 'declined' | 'maybe') => {
    if (!event) return;

    setUpdating(true);
    try {
      await homeService.updateEventResponse(event.id, response);
      
      // Update local state
      const currentUser = getCurrentUser();
      if (currentUser) {
        setEvent(prev => prev ? {
          ...prev,
          responses: {
            ...prev.responses,
            [currentUser.uid]: {
              response: response,
              timestamp: new Date()
            }
          }
        } : prev);
      }
      
      setModal({
        visible: true,
        title: 'Response Recorded',
        message: `You have ${response} this event.`,
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
    } finally {
      setUpdating(false);
    }
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (startTime: Date, endTime: Date) => {
    const diffInMs = endTime.getTime() - startTime.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      const diffInMinutes = Math.round(diffInMs / (1000 * 60));
      return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''}`;
    } else {
      return `${diffInHours.toFixed(1)} hour${diffInHours !== 1 ? 's' : ''}`;
    }
  };

  const handleModalClose = () => {
    setModal({ ...modal, visible: false });
    if (modal.type === 'error' && modal.title === 'Event Not Found') {
      router.back();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.fontSize.medium }}>
            Loading event details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.fontSize.medium }}>
            Event not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentUser = getCurrentUser();
  const userResponse = currentUser ? event.responses[currentUser.uid]?.response : undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: theme.layout.containerPadding,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.inputBorder,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.borderRadius.medium,
            backgroundColor: theme.colors.inputBackground,
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: theme.spacing.md,
          }}
        >
          <FontAwesome name="arrow-left" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{
          fontSize: theme.typography.fontSize.large,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text,
          flex: 1,
        }}>
          Event Details
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: theme.layout.containerPadding }}>
        {/* Event Header */}
        <View style={{
          backgroundColor: theme.colors.inputBackground,
          borderRadius: theme.borderRadius.medium,
          padding: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
          borderWidth: 1,
          borderColor: theme.colors.inputBorder,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md }}>
            <Text style={{
              fontSize: theme.typography.fontSize.xlarge,
              fontWeight: theme.typography.fontWeight.bold,
              color: theme.colors.text,
              flex: 1,
              marginRight: theme.spacing.md,
            }}>
              {event.title}
            </Text>
            <View style={{
              backgroundColor: theme.colors.secondary + '20',
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.borderRadius.medium,
            }}>
              <Text style={{
                fontSize: theme.typography.fontSize.small,
                color: theme.colors.secondary,
                fontWeight: theme.typography.fontWeight.bold,
                textTransform: 'capitalize',
              }}>
                {event.eventType}
              </Text>
            </View>
          </View>

          {event.isRecurring && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: theme.spacing.md,
            }}>
              <Ionicons name="repeat-outline" size={16} color={theme.colors.secondary} />
              <Text style={{
                fontSize: theme.typography.fontSize.small,
                color: theme.colors.secondary,
                marginLeft: theme.spacing.xs,
                fontWeight: theme.typography.fontWeight.medium,
              }}>
                Recurring Event
              </Text>
            </View>
          )}
        </View>

        {/* Event Details */}
        <View style={{
          backgroundColor: theme.colors.inputBackground,
          borderRadius: theme.borderRadius.medium,
          padding: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
          borderWidth: 1,
          borderColor: theme.colors.inputBorder,
        }}>
          <Text style={{
            fontSize: theme.typography.fontSize.large,
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text,
            marginBottom: theme.spacing.md,
          }}>
            Details
          </Text>

          {/* Start Time */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md }}>
            <Ionicons name="time-outline" size={20} color={theme.colors.textSecondary} />
            <View style={{ marginLeft: theme.spacing.md, flex: 1 }}>
              <Text style={{
                fontSize: theme.typography.fontSize.small,
                color: theme.colors.textSecondary,
                fontWeight: theme.typography.fontWeight.medium,
              }}>
                Start Time
              </Text>
              <Text style={{
                fontSize: theme.typography.fontSize.medium,
                color: theme.colors.text,
                marginTop: theme.spacing.xs,
              }}>
                {formatDateTime(event.startTime)}
              </Text>
            </View>
          </View>

          {/* Duration */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md }}>
            <Ionicons name="hourglass-outline" size={20} color={theme.colors.textSecondary} />
            <View style={{ marginLeft: theme.spacing.md, flex: 1 }}>
              <Text style={{
                fontSize: theme.typography.fontSize.small,
                color: theme.colors.textSecondary,
                fontWeight: theme.typography.fontWeight.medium,
              }}>
                Duration
              </Text>
              <Text style={{
                fontSize: theme.typography.fontSize.medium,
                color: theme.colors.text,
                marginTop: theme.spacing.xs,
              }}>
                {formatDuration(event.startTime, event.endTime)}
              </Text>
            </View>
          </View>

          {/* Location */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md }}>
            <Ionicons name="location-outline" size={20} color={theme.colors.textSecondary} />
            <View style={{ marginLeft: theme.spacing.md, flex: 1 }}>
              <Text style={{
                fontSize: theme.typography.fontSize.small,
                color: theme.colors.textSecondary,
                fontWeight: theme.typography.fontWeight.medium,
              }}>
                Location
              </Text>
              <Text style={{
                fontSize: theme.typography.fontSize.medium,
                color: theme.colors.text,
                marginTop: theme.spacing.xs,
              }}>
                {event.location || 'Location TBD'}
              </Text>
            </View>
          </View>
        </View>

        {/* Description */}
        {event.description && (
          <View style={{
            backgroundColor: theme.colors.inputBackground,
            borderRadius: theme.borderRadius.medium,
            padding: theme.spacing.lg,
            marginBottom: theme.spacing.lg,
            borderWidth: 1,
            borderColor: theme.colors.inputBorder,
          }}>
            <Text style={{
              fontSize: theme.typography.fontSize.large,
              fontWeight: theme.typography.fontWeight.bold,
              color: theme.colors.text,
              marginBottom: theme.spacing.md,
            }}>
              Description
            </Text>
            <Text style={{
              fontSize: theme.typography.fontSize.medium,
              color: theme.colors.text,
              lineHeight: 22,
            }}>
              {event.description}
            </Text>
          </View>
        )}

        {/* Your Response */}
        {userResponse && (
          <View style={{
            backgroundColor: theme.colors.inputBackground,
            borderRadius: theme.borderRadius.medium,
            padding: theme.spacing.lg,
            marginBottom: theme.spacing.lg,
            borderWidth: 1,
            borderColor: theme.colors.inputBorder,
          }}>
            <Text style={{
              fontSize: theme.typography.fontSize.large,
              fontWeight: theme.typography.fontWeight.bold,
              color: theme.colors.text,
              marginBottom: theme.spacing.md,
            }}>
              Your Response
            </Text>
            <Text style={{
              fontSize: theme.typography.fontSize.medium,
              color: userResponse === 'accepted' ? '#4CAF50' : userResponse === 'declined' ? '#f44336' : theme.colors.secondary,
              fontWeight: theme.typography.fontWeight.bold,
              textTransform: 'capitalize',
            }}>
              {userResponse}
            </Text>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Response Buttons */}
      <View style={{
        padding: theme.layout.containerPadding,
        borderTopWidth: 1,
        borderTopColor: theme.colors.inputBorder,
        backgroundColor: theme.colors.primary,
      }}>
        <Text style={{
          fontSize: theme.typography.fontSize.medium,
          fontWeight: theme.typography.fontWeight.medium,
          color: theme.colors.text,
          marginBottom: theme.spacing.md,
          textAlign: 'center',
        }}>
          Will you attend this event?
        </Text>
        
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Accept"
              onPress={() => handleResponse('accepted')}
              theme={userResponse === 'accepted' ? 'primary' : 'secondary'}
              disabled={updating}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Decline"
              onPress={() => handleResponse('declined')}
              theme={userResponse === 'declined' ? 'primary' : 'secondary'}
              disabled={updating}
            />
          </View>
        </View>
      </View>

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
    </SafeAreaView>
  );
}