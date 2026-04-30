/**
 * PhoneInput — country-code picker + local number field.
 *
 * value:    full E.164 string, e.g. "+46701234567", or ""
 * onChange: called with the full E.164 string or "" when cleared
 *
 * The component guarantees the stored value always starts with + and
 * contains only digits after stripping whitespace, making it safe to
 * pass directly to WhatsApp's wa.me deep link.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { COUNTRIES } from "@/constants/countries";
import { theme } from "@/constants/theme";

// ── Dial-code map (country ISO → dialCode) ────────────────────────────────────
const DIAL_CODES: Record<string, string> = {
  AE: "+971",
  AT: "+43",
  AU: "+61",
  BE: "+32",
  BG: "+359",
  BR: "+55",
  CA: "+1",
  CH: "+41",
  CY: "+357",
  CZ: "+420",
  DE: "+49",
  DK: "+45",
  EE: "+372",
  ES: "+34",
  FI: "+358",
  FR: "+33",
  GB: "+44",
  GR: "+30",
  HK: "+852",
  HR: "+385",
  HU: "+36",
  IE: "+353",
  IN: "+91",
  IT: "+39",
  JP: "+81",
  LT: "+370",
  LU: "+352",
  LV: "+371",
  MT: "+356",
  MX: "+52",
  MY: "+60",
  NL: "+31",
  NO: "+47",
  NZ: "+64",
  PL: "+48",
  PT: "+351",
  RO: "+40",
  SE: "+46",
  SG: "+65",
  SI: "+386",
  SK: "+421",
  TH: "+66",
  US: "+1",
  ZA: "+27",
};

// ── Derived country list sorted alphabetically by name ────────────────────────
interface PhoneEntry {
  code: string;
  name: string;
  dialCode: string;
}

const PHONE_ENTRIES: PhoneEntry[] = COUNTRIES.filter(
  (c) => !!DIAL_CODES[c.code],
)
  .map((c) => ({ code: c.code, name: c.name, dialCode: DIAL_CODES[c.code] }))
  .sort((a, b) => a.name.localeCompare(b.name));

const DEFAULT_ENTRY: PhoneEntry =
  PHONE_ENTRIES.find((e) => e.code === "SE") ?? PHONE_ENTRIES[0];

// ── Helper: parse an E.164 string back to { entry, local } ───────────────────
function parseValue(value: string): { entry: PhoneEntry; local: string } {
  if (!value || !value.startsWith("+")) {
    return { entry: DEFAULT_ENTRY, local: "" };
  }
  // Match longest dial code first to avoid +1 shadowing +354 etc.
  const sorted = [...PHONE_ENTRIES].sort(
    (a, b) => b.dialCode.length - a.dialCode.length,
  );
  for (const entry of sorted) {
    if (value.startsWith(entry.dialCode)) {
      return { entry, local: value.slice(entry.dialCode.length) };
    }
  }
  return { entry: DEFAULT_ENTRY, local: value.slice(1) };
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Placeholder shown in the local-number field */
  placeholder?: string;
}

export default function PhoneInput({ value, onChange, placeholder }: Props) {
  const { t } = useTranslation(["components"]);

  const init = parseValue(value);
  const [selectedEntry, setSelectedEntry] = useState<PhoneEntry>(init.entry);
  const [localNumber, setLocalNumber] = useState(init.local);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Track the last value we emitted so we can distinguish external resets
  // (e.g. parent cancel-edit) from echoes of our own onChange calls.
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      const p = parseValue(value);
      setSelectedEntry(p.entry);
      setLocalNumber(p.local);
    }
  }, [value]);

  const emit = useCallback(
    (entry: PhoneEntry, local: string) => {
      const digits = local.replace(/\D/g, "");
      const result = digits ? entry.dialCode + digits : "";
      lastEmitted.current = result;
      onChange(result);
    },
    [onChange],
  );

  const handleSelectEntry = useCallback(
    (entry: PhoneEntry) => {
      setSelectedEntry(entry);
      setIsOpen(false);
      setSearch("");
      emit(entry, localNumber);
    },
    [localNumber, emit],
  );

  const handleLocalChange = useCallback(
    (text: string) => {
      // Allow digits, spaces and hyphens in the display value
      const cleaned = text.replace(/[^\d\s\-]/g, "");
      setLocalNumber(cleaned);
      emit(selectedEntry, cleaned);
    },
    [selectedEntry, emit],
  );

  const filtered = search
    ? PHONE_ENTRIES.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.dialCode.includes(search) ||
          e.code.toLowerCase().includes(search.toLowerCase()),
      )
    : PHONE_ENTRIES;

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setSearch("");
  }, []);

  return (
    <View style={styles.container}>
      {/* Country-code picker button */}
      <Pressable style={styles.codePicker} onPress={() => setIsOpen(true)}>
        <Text style={styles.codeText}>
          {selectedEntry.code} {selectedEntry.dialCode}
        </Text>
        <Ionicons
          name="chevron-down"
          size={13}
          color={theme.colors.textSecondary}
        />
      </Pressable>

      <View style={styles.divider} />

      {/* Local number */}
      <TextInput
        style={styles.numberInput}
        value={localNumber}
        onChangeText={handleLocalChange}
        placeholder={placeholder ?? "70 123 45 67"}
        placeholderTextColor={theme.colors.textSecondary}
        keyboardType="phone-pad"
      />

      {/* Country picker modal */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.overlay} onPress={closeModal}>
          <View style={styles.modalContainer}>
            {/* Absorb taps so overlay Pressable doesn't fire */}
            <Pressable onPress={() => {}}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {t("components:phoneInput.selectCountryCode")}
                </Text>
                <Pressable onPress={closeModal} hitSlop={8}>
                  <Ionicons name="close" size={22} color={theme.colors.text} />
                </Pressable>
              </View>

              <View style={styles.searchRow}>
                <Ionicons
                  name="search"
                  size={15}
                  color={theme.colors.textSecondary}
                />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t("components:phoneInput.search")}
                  placeholderTextColor={theme.colors.textSecondary}
                  autoFocus
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch("")} hitSlop={8}>
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                  </Pressable>
                )}
              </View>

              <FlatList
                data={filtered}
                keyExtractor={(item) => item.code}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const isSelected = item.code === selectedEntry.code;
                  return (
                    <Pressable
                      style={[
                        styles.option,
                        isSelected && styles.optionSelected,
                      ]}
                      onPress={() => handleSelectEntry(item)}
                    >
                      <Text style={styles.optionName}>{item.name}</Text>
                      <Text
                        style={[
                          styles.optionDial,
                          isSelected && styles.optionDialSelected,
                        ]}
                      >
                        {item.dialCode}
                      </Text>
                      {isSelected && (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={theme.colors.secondary}
                        />
                      )}
                    </Pressable>
                  );
                }}
              />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    overflow: "hidden",
  },
  codePicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minWidth: 88,
  },
  codeText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: "500",
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: theme.colors.inputBorder,
    marginVertical: 8,
  },
  numberInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  // Modal
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "88%",
    maxWidth: 400,
    maxHeight: "72%",
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.large,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.inputBorder,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    paddingVertical: 0,
  },
  list: {
    maxHeight: 400,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.inputBorder,
  },
  optionSelected: {
    backgroundColor: theme.colors.inputBackground,
  },
  optionName: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
  },
  optionDial: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginRight: 8,
  },
  optionDialSelected: {
    color: theme.colors.secondary,
  },
});
