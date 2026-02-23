// Stripe Onboarding Screen - Handle club payment setup
// Allows club admins to create Stripe connected account and complete onboarding

import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import { theme } from "@/constants/theme";
import { paymentService } from "@/services/paymentService";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useState,
} from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// All Stripe Connect supported countries (46 total)
// Organized alphabetically by region for better UX
const COUNTRIES = [
  // Europe
  { code: "AT", name: "Austria", currency: "EUR" },
  { code: "BE", name: "Belgium", currency: "EUR" },
  { code: "BG", name: "Bulgaria", currency: "BGN" },
  { code: "HR", name: "Croatia", currency: "EUR" },
  { code: "CY", name: "Cyprus", currency: "EUR" },
  { code: "CZ", name: "Czech Republic", currency: "CZK" },
  { code: "DK", name: "Denmark", currency: "DKK" },
  { code: "EE", name: "Estonia", currency: "EUR" },
  { code: "FI", name: "Finland", currency: "EUR" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "DE", name: "Germany", currency: "EUR" },
  { code: "GR", name: "Greece", currency: "EUR" },
  { code: "HU", name: "Hungary", currency: "HUF" },
  { code: "IE", name: "Ireland", currency: "EUR" },
  { code: "IT", name: "Italy", currency: "EUR" },
  { code: "LV", name: "Latvia", currency: "EUR" },
  { code: "LT", name: "Lithuania", currency: "EUR" },
  { code: "LU", name: "Luxembourg", currency: "EUR" },
  { code: "MT", name: "Malta", currency: "EUR" },
  { code: "NL", name: "Netherlands", currency: "EUR" },
  { code: "NO", name: "Norway", currency: "NOK" },
  { code: "PL", name: "Poland", currency: "PLN" },
  { code: "PT", name: "Portugal", currency: "EUR" },
  { code: "RO", name: "Romania", currency: "RON" },
  { code: "SK", name: "Slovakia", currency: "EUR" },
  { code: "SI", name: "Slovenia", currency: "EUR" },
  { code: "ES", name: "Spain", currency: "EUR" },
  { code: "SE", name: "Sweden", currency: "SEK" },
  { code: "CH", name: "Switzerland", currency: "CHF" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  // Americas
  { code: "BR", name: "Brazil", currency: "BRL" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "MX", name: "Mexico", currency: "MXN" },
  { code: "US", name: "United States", currency: "USD" },
  // Asia-Pacific
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "HK", name: "Hong Kong", currency: "HKD" },
  { code: "IN", name: "India", currency: "INR" },
  { code: "JP", name: "Japan", currency: "JPY" },
  { code: "MY", name: "Malaysia", currency: "MYR" },
  { code: "NZ", name: "New Zealand", currency: "NZD" },
  { code: "SG", name: "Singapore", currency: "SGD" },
  { code: "TH", name: "Thailand", currency: "THB" },
  // Middle East / Africa
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
];

export default function StripeOnboardingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { clubId, clubName } = useLocalSearchParams();

  const [selectedCountry, setSelectedCountry] = useState("SE");
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [hasStripeAccount, setHasStripeAccount] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<{
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    onboardingComplete: boolean;
    requiresAction: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Set header title
  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Payment Setup",
    });
  }, [navigation]);

  // Check existing Stripe status
  const checkStatus = useCallback(async () => {
    if (!clubId) return;

    setCheckingStatus(true);
    try {
      const result = await paymentService.checkStripeStatus(clubId as string);

      if (result.success && result.status) {
        setHasStripeAccount(true);
        setStripeStatus(result.status);
      } else {
        setHasStripeAccount(false);
        setStripeStatus(null);
      }
    } catch {
      // If check fails, assume no account yet
      setHasStripeAccount(false);
      setStripeStatus(null);
    } finally {
      setCheckingStatus(false);
    }
  }, [clubId]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Create Stripe account
  const handleCreateAccount = async () => {
    if (!clubId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await paymentService.createStripeAccount(
        clubId as string,
        selectedCountry,
      );

      if (result.success) {
        setHasStripeAccount(true);
        // Now start onboarding
        await handleStartOnboarding();
      } else {
        setError(result.error || "Failed to create Stripe account");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Start or continue onboarding
  const handleStartOnboarding = async () => {
    if (!clubId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await paymentService.startStripeOnboarding(
        clubId as string,
        clubName as string,
      );

      if (!result.success) {
        setError(result.error || "Failed to start onboarding");
      }
      // Browser will open, user will return and we'll check status
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Refresh status after returning from Stripe
  const handleRefreshStatus = async () => {
    setLoading(true);
    setError(null);

    try {
      await checkStatus();

      if (stripeStatus?.onboardingComplete) {
        setSuccessMessage(
          "Payment setup is complete! You can now create fees.",
        );
        setShowSuccessModal(true);
      }
    } catch (err: any) {
      setError(err.message || "Failed to check status");
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    router.back();
  };

  // Handle reset payment setup
  const handleResetPaymentSetup = async () => {
    if (!clubId) return;

    setResetting(true);
    try {
      const result = await paymentService.resetPaymentSetup(clubId as string);

      if (result.success) {
        setShowResetModal(false);
        setHasStripeAccount(false);
        setStripeStatus(null);
        setSelectedCountry("");
        setSuccessMessage(
          "Payment setup has been reset. You can now set up payments with a different country.",
        );
        setShowSuccessModal(true);
      } else {
        setError(result.error || "Failed to reset payment setup");
      }
    } catch (err: any) {
      setError(err.message || "Failed to reset payment setup");
    } finally {
      setResetting(false);
    }
  };

  if (checkingStatus) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
          <Text style={styles.loadingText}>Checking payment status...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="card" size={48} color={theme.colors.secondary} />
          </View>
          <Text style={styles.title}>Enable Payments</Text>
          <Text style={styles.subtitle}>
            {clubName
              ? `Set up payments for ${clubName}`
              : "Set up payments for your club"}
          </Text>
        </View>

        {/* Status Section */}
        {hasStripeAccount && stripeStatus && (
          <View style={styles.statusSection}>
            <Text style={styles.sectionTitle}>Account Status</Text>

            <View style={styles.statusItem}>
              <Ionicons
                name={stripeStatus.chargesEnabled ? "checkmark-circle" : "time"}
                size={24}
                color={
                  stripeStatus.chargesEnabled
                    ? theme.colors.success
                    : theme.colors.warning
                }
              />
              <Text style={styles.statusText}>
                {stripeStatus.chargesEnabled
                  ? "Can receive payments"
                  : "Payments not yet enabled"}
              </Text>
            </View>

            <View style={styles.statusItem}>
              <Ionicons
                name={stripeStatus.payoutsEnabled ? "checkmark-circle" : "time"}
                size={24}
                color={
                  stripeStatus.payoutsEnabled
                    ? theme.colors.success
                    : theme.colors.warning
                }
              />
              <Text style={styles.statusText}>
                {stripeStatus.payoutsEnabled
                  ? "Can receive payouts"
                  : "Payouts not yet enabled"}
              </Text>
            </View>

            {stripeStatus.onboardingComplete ? (
              <View style={styles.completeContainer}>
                <Ionicons
                  name="checkmark-circle"
                  size={32}
                  color={theme.colors.success}
                />
                <Text style={styles.completeText}>Setup Complete!</Text>
                <Text style={styles.completeSubtext}>
                  You can now create fees
                </Text>
              </View>
            ) : (
              <View style={styles.incompleteContainer}>
                <Ionicons
                  name="alert-circle"
                  size={32}
                  color={theme.colors.warning}
                />
                <Text style={styles.incompleteText}>Setup Incomplete</Text>
                <Text style={styles.incompleteSubtext}>
                  Please complete the Stripe onboarding process
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Country Selection (only if no account yet) */}
        {!hasStripeAccount && (
          <View style={styles.countrySection}>
            <Text style={styles.sectionTitle}>Select Your Country</Text>
            <Text style={styles.sectionSubtitle}>
              This determines your currency and Stripe fees
            </Text>

            <Pressable
              style={styles.countryDropdown}
              onPress={() => setShowCountryModal(true)}
            >
              <View style={styles.countryDropdownContent}>
                <Text style={styles.countryDropdownText}>
                  {COUNTRIES.find((c) => c.code === selectedCountry)?.name ||
                    "Select Country"}
                </Text>
                <Text style={styles.countryDropdownCurrency}>
                  {COUNTRIES.find((c) => c.code === selectedCountry)?.currency}
                </Text>
              </View>
              <Ionicons
                name="chevron-down"
                size={20}
                color={theme.colors.text}
              />
            </Pressable>
          </View>
        )}

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>How It Works</Text>

          <View style={styles.infoItem}>
            <View style={styles.infoNumber}>
              <Text style={styles.infoNumberText}>1</Text>
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Create Account</Text>
              <Text style={styles.infoText}>
                {
                  "We'll create a Stripe Express account connected to Sportnizer"
                }
              </Text>
            </View>
          </View>

          <View style={styles.infoItem}>
            <View style={styles.infoNumber}>
              <Text style={styles.infoNumberText}>2</Text>
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Verify Identity</Text>
              <Text style={styles.infoText}>
                {
                  "Stripe will verify your organization's identity (required by law)"
                }
              </Text>
            </View>
          </View>

          <View style={styles.infoItem}>
            <View style={styles.infoNumber}>
              <Text style={styles.infoNumberText}>3</Text>
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Add Bank Account</Text>
              <Text style={styles.infoText}>
                Connect the bank account where payments will be deposited
              </Text>
            </View>
          </View>

          <View style={styles.feeInfo}>
            <Ionicons
              name="information-circle"
              size={20}
              color={theme.colors.secondary}
            />
            <Text style={styles.feeInfoText}>
              Sportnizer takes a 3% platform fee. Stripe fees (~1.5-2.9%) are
              charged to your club.
            </Text>
          </View>
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons
              name="alert-circle"
              size={20}
              color={theme.colors.error}
            />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {!hasStripeAccount ? (
            <Button
              label={loading ? "Creating Account..." : "Create Stripe Account"}
              onPress={handleCreateAccount}
              theme="primary"
              disabled={loading}
            />
          ) : stripeStatus?.onboardingComplete ? (
            <Button
              label="Create Fee"
              onPress={() =>
                router.push({
                  pathname: "/create-membership-fee",
                  params: {
                    clubId: clubId as string,
                    clubName: clubName as string,
                  },
                } as any)
              }
              theme="primary"
            />
          ) : (
            <>
              <Button
                label={loading ? "Loading..." : "Continue Setup with Stripe"}
                onPress={handleStartOnboarding}
                theme="primary"
                disabled={loading}
              />
              <View style={styles.buttonSpacer} />
              <Button
                label={loading ? "Checking..." : "I've Completed Onboarding"}
                onPress={handleRefreshStatus}
                theme="secondary"
                disabled={loading}
              />
            </>
          )}

          {/* Reset Payment Setup option - show when there's a Stripe account */}
          {hasStripeAccount && (
            <>
              <View style={styles.resetDivider} />
              <TouchableOpacity
                style={styles.resetButton}
                onPress={() => setShowResetModal(true)}
                disabled={resetting}
              >
                <Ionicons
                  name="refresh-outline"
                  size={18}
                  color={theme.colors.error}
                />
                <Text style={styles.resetButtonText}>
                  {resetting ? "Resetting..." : "Reset Payment Setup"}
                </Text>
              </TouchableOpacity>
              <Text style={styles.resetHint}>
                Use this to change your country or start over
              </Text>
            </>
          )}
        </View>
      </ScrollView>

      {/* Success Modal */}
      <ConfirmationModal
        visible={showSuccessModal}
        title="Success!"
        message={successMessage}
        confirmText="OK"
        onConfirm={handleSuccessModalClose}
        onCancel={handleSuccessModalClose}
        confirmButtonTheme="primary"
      />

      {/* Reset Confirmation Modal */}
      <ConfirmationModal
        visible={showResetModal}
        title="Reset Payment Setup?"
        message="This will disconnect your Stripe account from this club. You'll need to complete the setup again with your new country selection. Any pending payments may be affected."
        confirmText={resetting ? "Resetting..." : "Reset Setup"}
        cancelText="Cancel"
        onConfirm={handleResetPaymentSetup}
        onCancel={() => setShowResetModal(false)}
        confirmButtonTheme="primary"
      />

      {/* Country Selection Modal */}
      <Modal
        visible={showCountryModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCountryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <Pressable
                onPress={() => {
                  setShowCountryModal(false);
                  setCountrySearch("");
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons
                name="search"
                size={20}
                color={theme.colors.textSecondary}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search countries..."
                placeholderTextColor={theme.colors.textSecondary}
                value={countrySearch}
                onChangeText={setCountrySearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {countrySearch.length > 0 && (
                <Pressable onPress={() => setCountrySearch("")}>
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </Pressable>
              )}
            </View>

            <ScrollView style={styles.countryModalList}>
              {COUNTRIES.filter(
                (country) =>
                  country.name
                    .toLowerCase()
                    .includes(countrySearch.toLowerCase()) ||
                  country.code
                    .toLowerCase()
                    .includes(countrySearch.toLowerCase()) ||
                  country.currency
                    .toLowerCase()
                    .includes(countrySearch.toLowerCase()),
              ).map((country) => (
                <TouchableOpacity
                  key={country.code}
                  style={[
                    styles.countryModalItem,
                    selectedCountry === country.code &&
                      styles.countryModalItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedCountry(country.code);
                    setShowCountryModal(false);
                    setCountrySearch("");
                  }}
                >
                  <View style={styles.countryModalItemContent}>
                    <Text
                      style={[
                        styles.countryModalName,
                        selectedCountry === country.code &&
                          styles.countryModalNameSelected,
                      ]}
                    >
                      {country.name}
                    </Text>
                    <Text
                      style={[
                        styles.countryModalCurrency,
                        selectedCountry === country.code &&
                          styles.countryModalCurrencySelected,
                      ]}
                    >
                      {country.currency}
                    </Text>
                  </View>
                  {selectedCountry === country.code && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={theme.colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.inputBackground,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  statusSection: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  statusText: {
    fontSize: 16,
    color: theme.colors.text,
    marginLeft: 12,
  },
  completeContainer: {
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  completeText: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.success,
    marginTop: 8,
  },
  completeSubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  incompleteContainer: {
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  incompleteText: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.warning,
    marginTop: 8,
  },
  incompleteSubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
  countrySection: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoSection: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoItem: {
    flexDirection: "row",
    marginBottom: 16,
  },
  infoNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.secondary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  infoNumberText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  feeInfo: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    marginTop: 8,
  },
  feeInfoText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginLeft: 10,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.error,
    marginLeft: 8,
  },
  buttonContainer: {
    marginTop: 8,
  },
  buttonSpacer: {
    height: 12,
  },
  resetDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 20,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  resetButtonText: {
    fontSize: 15,
    color: theme.colors.error,
    fontWeight: "500",
  },
  resetHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
  // Country Dropdown Styles
  countryDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
  },
  countryDropdownContent: {
    flex: 1,
  },
  countryDropdownText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
  countryDropdownCurrency: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBackground,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
  },
  modalCloseButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    margin: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
    color: theme.colors.text,
  },
  countryModalList: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  countryModalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  countryModalItemSelected: {
    backgroundColor: theme.colors.secondary,
  },
  countryModalItemContent: {
    flex: 1,
  },
  countryModalName: {
    fontSize: 16,
    color: theme.colors.text,
  },
  countryModalNameSelected: {
    fontWeight: "600",
    color: theme.colors.primary,
  },
  countryModalCurrency: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  countryModalCurrencySelected: {
    color: theme.colors.primary,
  },
});
