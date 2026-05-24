// LOK-inställningar — RF integration settings for LOK-stöd
// Club admins can enter their RF organization details here.
// The "integrationEnabled" flag is only needed for direct RF API submission (future feature).
// You can generate and manage local LOK draft reports without enabling it.

import Button from "@/components/Button";
import ConfirmationModal from "@/components/ConfirmationModal";
import Input from "@/components/Input";
import { theme } from "@/constants/theme";
import { useClubData } from "@/contexts/ClubDataContext";
import { useUser } from "@/contexts/UserContext";
import { updateClubRfSettings } from "@/services/lok/rfService";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useLayoutEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LokSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { getClub } = useClubData();
  const { userProfile } = useUser();

  const isPlatformAdmin = userProfile?.platformAdmin === true;

  const club = clubId ? getClub(clubId) : undefined;
  const rf = club?.rf;

  const [organizationNumber, setOrganizationNumber] = useState(
    rf?.organizationNumber ?? "",
  );
  const [municipality, setMunicipality] = useState(rf?.municipality ?? "");
  const [rfOrganizationId, setRfOrganizationId] = useState(
    rf?.rfOrganizationId ?? "",
  );
  const [districtId, setDistrictId] = useState(rf?.districtId ?? "");
  const [integrationEnabled, setIntegrationEnabled] = useState(
    rf?.integrationEnabled ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [orgNrError, setOrgNrError] = useState<string | undefined>();

  const [modal, setModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
  }>({ visible: false, title: "", message: "" });

  // Populate fields when club data loads
  useEffect(() => {
    if (!rf) return;
    setOrganizationNumber(rf.organizationNumber ?? "");
    setMunicipality(rf.municipality ?? "");
    setRfOrganizationId(rf.rfOrganizationId ?? "");
    setDistrictId(rf.districtId ?? "");
    setIntegrationEnabled(rf.integrationEnabled ?? false);
  }, [rf]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: "LOK-inställningar" });
  }, [navigation]);

  const validateOrgNr = (value: string) => {
    if (!value) return undefined;
    return /^\d{6}-\d{4}$/.test(value)
      ? undefined
      : "Format: XXXXXX-XXXX (t.ex. 802400-5678)";
  };

  const handleSave = async () => {
    const err = validateOrgNr(organizationNumber);
    if (err) {
      setOrgNrError(err);
      return;
    }
    setOrgNrError(undefined);

    if (!clubId) return;
    setSaving(true);
    const result = await updateClubRfSettings(clubId, {
      organizationNumber: organizationNumber.trim() || undefined,
      municipality: municipality.trim() || undefined,
      rfOrganizationId: rfOrganizationId.trim() || undefined,
      districtId: districtId.trim() || undefined,
      integrationEnabled,
    });
    setSaving(false);

    setModal({
      visible: true,
      title: result.success ? "Sparat" : "Fel",
      message: result.success
        ? "RF-inställningar har sparats."
        : (result.error ?? "Kunde inte spara inställningarna."),
      confirmText: "OK",
    });
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Info banner ── */}
        <View style={styles.infoBanner}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={theme.colors.secondary}
            style={{ marginRight: 8, marginTop: 1 }}
          />
          <Text style={styles.infoText}>
            Fyll i organisationsnummer och kommun för att LOK-rapporter ska
            innehålla rätt uppgifter. RF-direktintegration krävs{" "}
            <Text style={styles.infoEmphasis}>inte</Text> för att skapa och
            hantera LOK-rapportutkast lokalt.
          </Text>
        </View>

        {/* ── Fields ── */}
        <View style={styles.section}>
          <Input
            label="Organisationsnummer"
            value={organizationNumber}
            onChangeText={(v) => {
              setOrganizationNumber(v);
              setOrgNrError(validateOrgNr(v));
            }}
            placeholder="XXXXXX-XXXX"
            autoCapitalize="none"
            keyboardType="default"
            error={orgNrError}
            helperText="Föreningens svenska organisationsnummer (erhålls från Skatteverket/IdrottOnline)."
          />

          <Input
            label="Kommun"
            value={municipality}
            onChangeText={setMunicipality}
            placeholder="T.ex. Stockholm"
            autoCapitalize="words"
            helperText="Kommunen där föreningen är registrerad. Används i kommunrapporten."
          />

          <Input
            label="RF förenings-ID (valfritt)"
            value={rfOrganizationId}
            onChangeText={setRfOrganizationId}
            placeholder="T.ex. 123456"
            autoCapitalize="none"
            helperText="IdrottOnline förenings-ID. Finns i IdrottOnline-portalen under föreningsinformationen."
          />

          <Input
            label="Distriktsförbunds-ID (valfritt)"
            value={districtId}
            onChangeText={setDistrictId}
            placeholder="T.ex. 12"
            autoCapitalize="none"
            helperText="Ange ditt specialdistriktsförbunds (SDF) ID om det efterfrågas."
          />
        </View>

        {/* ── Integration toggle ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Direktintegration med RF</Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>
                Aktivera RF-direktintegration
              </Text>
              <Text style={styles.toggleDesc}>
                Aktivera enbart om du vill skicka rapporter direkt till RF:s API
                via IdrottOnline. Krävs inte för lokala LOK-rapportutkast.
              </Text>
              {!isPlatformAdmin && (
                <Text style={styles.toggleLocked}>
                  Kontakta Clubnizer support för att aktivera direktintegration.
                </Text>
              )}
            </View>
            <Switch
              value={integrationEnabled}
              onValueChange={
                isPlatformAdmin ? setIntegrationEnabled : undefined
              }
              disabled={!isPlatformAdmin}
              trackColor={{
                false: theme.colors.inputBorder,
                true: theme.colors.secondary + "88",
              }}
              thumbColor={
                integrationEnabled
                  ? theme.colors.secondary
                  : theme.colors.textSecondary
              }
            />
          </View>
        </View>

        {/* ── Save ── */}
        <View style={styles.saveRow}>
          {saving ? (
            <ActivityIndicator color={theme.colors.secondary} />
          ) : (
            <Button label="Spara inställningar" onPress={handleSave} />
          )}
        </View>

        {/* ── Help section ── */}
        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>Var hittar jag uppgifterna?</Text>
          <Text style={styles.helpText}>
            • <Text style={styles.helpBold}>Organisationsnummer</Text>: Finns i
            IdrottOnline (idrottonline.se) under föreningsprofilen, eller via
            Skatteverket.
          </Text>
          <Text style={styles.helpText}>
            • <Text style={styles.helpBold}>RF förenings-ID</Text>: Logga in på
            IdrottOnline, gå till Föreningsinformation → Grunduppgifter.
          </Text>
          <Text style={styles.helpText}>
            • <Text style={styles.helpBold}>Kommun</Text>: Den svenska kommunen
            där föreningen bedriver verksamhet.
          </Text>
        </View>
      </ScrollView>

      <ConfirmationModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        confirmText={modal.confirmText ?? "OK"}
        onConfirm={() => setModal((m) => ({ ...m, visible: false }))}
        onCancel={() => setModal((m) => ({ ...m, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: 40,
    gap: theme.spacing.md,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: theme.colors.secondary + "18",
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.secondary + "44",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 19,
  },
  infoEmphasis: {
    fontWeight: "700",
    color: theme.colors.secondary,
  },
  section: {
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 4,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.medium,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    gap: theme.spacing.md,
  },
  toggleText: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.text,
    marginBottom: 4,
  },
  toggleDesc: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 17,
  },
  toggleLocked: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
    marginTop: 6,
  },
  saveRow: {
    marginTop: theme.spacing.sm,
  },
  helpSection: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    gap: 8,
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 4,
  },
  helpText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  helpBold: {
    fontWeight: "700",
    color: theme.colors.text,
  },
});
