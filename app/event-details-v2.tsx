// /app/event-details-v2.tsx (Example of versioned event details screen)

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useEventData } from '@/hooks/useVersionedData';
import Button from '../components/Button';
import { theme } from '../constants/theme';

interface EventDetails {
  id: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location: string;
  eventType: 'practice' | 'game' | 'meeting' | 'other';
  createdBy: string;
  status: string;
  version: number;
  // Add other fields as needed
}

export default function EventDetailsV2Screen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const clubId = params.clubId as string;
  const eventId = params.eventId as string;

  // Use the new versioned data hook
  const { eventData, loading, error, refreshEventData } = useEventData(clubId, eventId);

  const handleRefresh = useCallback(() => {
    refreshEventData();
  }, [refreshEventData]);

  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  // Handle error cases
  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="alert-circle" size={48} color={theme.colors.error} />
          <Text style={{ 
            fontSize: 18, 
            fontWeight: 'bold', 
            color: theme.colors.textPrimary, 
            marginTop: 16,
            textAlign: 'center'
          }}>
            Error Loading Event
          </Text>
          <Text style={{ 
            fontSize: 14, 
            color: theme.colors.textSecondary, 
            marginTop: 8,
            textAlign: 'center'
          }}>
            {error}
          </Text>
          <Button 
            title="Try Again" 
            onPress={handleRefresh}
            style={{ marginTop: 20 }}
          />
          <TouchableOpacity onPress={handleGoBack} style={{ marginTop: 12 }}>
            <Text style={{ color: theme.colors.primary }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Handle loading state
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ 
            fontSize: 16, 
            color: theme.colors.textSecondary, 
            marginTop: 12 
          }}>
            Loading event details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Handle case where no event data
  if (!eventData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="calendar-outline" size={48} color={theme.colors.textSecondary} />
          <Text style={{ 
            fontSize: 18, 
            fontWeight: 'bold', 
            color: theme.colors.textPrimary, 
            marginTop: 16,
            textAlign: 'center'
          }}>
            Event Not Found
          </Text>
          <Text style={{ 
            fontSize: 14, 
            color: theme.colors.textSecondary, 
            marginTop: 8,
            textAlign: 'center'
          }}>
            The event you're looking for could not be found.
          </Text>
          <TouchableOpacity onPress={handleGoBack} style={{ marginTop: 20 }}>
            <Text style={{ color: theme.colors.primary, fontSize: 16 }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Convert timestamp to date if needed
  const startTime = eventData.startTime?.toDate ? eventData.startTime.toDate() : new Date(eventData.startTime);
  const endTime = eventData.endTime?.toDate ? eventData.endTime.toDate() : new Date(eventData.endTime);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}>
        <TouchableOpacity onPress={handleGoBack} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{
          flex: 1,
          fontSize: 18,
          fontWeight: 'bold',
          color: theme.colors.textPrimary,
        }}>
          Event Details
        </Text>
        <TouchableOpacity onPress={handleRefresh}>
          <Ionicons name="refresh" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        {/* Event Title */}
        <Text style={{
          fontSize: 24,
          fontWeight: 'bold',
          color: theme.colors.textPrimary,
          marginBottom: 8,
        }}>
          {eventData.title}
        </Text>

        {/* Event Type Badge */}
        <View style={{
          backgroundColor: theme.colors.primary,
          paddingHorizontal: 12,
          paddingVertical: 4,
          borderRadius: 12,
          alignSelf: 'flex-start',
          marginBottom: 16,
        }}>
          <Text style={{ 
            color: 'white', 
            fontSize: 12, 
            fontWeight: '600',
            textTransform: 'capitalize'
          }}>
            {eventData.eventType}
          </Text>
        </View>

        {/* Event Details */}
        <View style={{ marginBottom: 24 }}>
          {/* Date & Time */}
          <View style={{ 
            flexDirection: 'row', 
            alignItems: 'center', 
            marginBottom: 12 
          }}>
            <Ionicons 
              name="time" 
              size={20} 
              color={theme.colors.textSecondary}
              style={{ marginRight: 12 }}
            />
            <View>
              <Text style={{ 
                fontSize: 16, 
                color: theme.colors.textPrimary,
                fontWeight: '500'
              }}>
                {startTime.toLocaleDateString()} at {startTime.toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </Text>
              <Text style={{ 
                fontSize: 14, 
                color: theme.colors.textSecondary 
              }}>
                Until {endTime.toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </Text>
            </View>
          </View>

          {/* Location */}
          <View style={{ 
            flexDirection: 'row', 
            alignItems: 'center', 
            marginBottom: 12 
          }}>
            <Ionicons 
              name="location" 
              size={20} 
              color={theme.colors.textSecondary}
              style={{ marginRight: 12 }}
            />
            <Text style={{ 
              fontSize: 16, 
              color: theme.colors.textPrimary,
              flex: 1
            }}>
              {eventData.location || 'Location not specified'}
            </Text>
          </View>

          {/* Version Info (for debugging/development) */}
          {__DEV__ && (
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              marginBottom: 12 
            }}>
              <Ionicons 
                name="code-working" 
                size={20} 
                color={theme.colors.textSecondary}
                style={{ marginRight: 12 }}
              />
              <Text style={{ 
                fontSize: 14, 
                color: theme.colors.textSecondary 
              }}>
                Version: {eventData.version || 1} (Cached)
              </Text>
            </View>
          )}
        </View>

        {/* Description */}
        {eventData.description ? (
          <View style={{ marginBottom: 24 }}>
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: theme.colors.textPrimary,
              marginBottom: 8,
            }}>
              Description
            </Text>
            <Text style={{
              fontSize: 14,
              color: theme.colors.textSecondary,
              lineHeight: 20,
            }}>
              {eventData.description}
            </Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={{ gap: 12 }}>
          <Button 
            title="Accept" 
            onPress={() => {
              // Handle accept response
              console.log('Accept event response');
            }}
            style={{ backgroundColor: theme.colors.success }}
          />
          <Button 
            title="Decline" 
            onPress={() => {
              // Handle decline response  
              console.log('Decline event response');
            }}
            style={{ backgroundColor: theme.colors.error }}
          />
          <Button 
            title="Maybe" 
            onPress={() => {
              // Handle maybe response
              console.log('Maybe event response');
            }}
            style={{ backgroundColor: theme.colors.warning }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
