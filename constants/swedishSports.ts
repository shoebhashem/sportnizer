// Sports list for group creation dropdown.
// Each sport has a stable i18n key stored in Firestore and used to look up
// localized names at render time via the "sports" i18n namespace.
// rfSportId is null until RF API credentials are active and IDs can be resolved.

export interface Sport {
  key: string; // Stable i18n key, e.g. "football" — stored in Firestore
  nameEn: string; // English fallback / human-readable label for RF API reference
  rfSportId: string | null; // RF sport ID — null until resolved via RF API
}

export const SPORTS: Sport[] = [
  { key: "american_football", nameEn: "American Football", rfSportId: null },
  { key: "athletics", nameEn: "Athletics", rfSportId: null },
  { key: "badminton", nameEn: "Badminton", rfSportId: null },
  { key: "bandy", nameEn: "Bandy", rfSportId: null },
  { key: "baseball_softball", nameEn: "Baseball/Softball", rfSportId: null },
  { key: "basketball", nameEn: "Basketball", rfSportId: null },
  { key: "beach_volleyball", nameEn: "Beach Volleyball", rfSportId: null },
  { key: "biathlon", nameEn: "Biathlon", rfSportId: null },
  { key: "bowling", nameEn: "Bowling", rfSportId: null },
  { key: "boxing", nameEn: "Boxing", rfSportId: null },
  { key: "canoe", nameEn: "Canoe/Kayak", rfSportId: null },
  { key: "climbing", nameEn: "Climbing", rfSportId: null },
  {
    key: "cross_country_skiing",
    nameEn: "Cross-Country Skiing",
    rfSportId: null,
  },
  { key: "curling", nameEn: "Curling", rfSportId: null },
  { key: "cycling", nameEn: "Cycling", rfSportId: null },
  { key: "dance", nameEn: "Dance Sport", rfSportId: null },
  { key: "equestrian", nameEn: "Equestrian", rfSportId: null },
  { key: "field_hockey", nameEn: "Field Hockey", rfSportId: null },
  { key: "figure_skating", nameEn: "Figure Skating", rfSportId: null },
  { key: "floorball", nameEn: "Floorball", rfSportId: null },
  { key: "football", nameEn: "Football (Soccer)", rfSportId: null },
  { key: "golf", nameEn: "Golf", rfSportId: null },
  { key: "gymnastics", nameEn: "Gymnastics", rfSportId: null },
  { key: "handball", nameEn: "Handball", rfSportId: null },
  { key: "ice_hockey", nameEn: "Ice Hockey", rfSportId: null },
  { key: "judo", nameEn: "Judo", rfSportId: null },
  { key: "karate", nameEn: "Karate", rfSportId: null },
  { key: "motorsport", nameEn: "Motorsport", rfSportId: null },
  { key: "orienteering", nameEn: "Orienteering", rfSportId: null },
  { key: "padel", nameEn: "Padel", rfSportId: null },
  { key: "rowing", nameEn: "Rowing", rfSportId: null },
  { key: "rugby", nameEn: "Rugby", rfSportId: null },
  { key: "sailing", nameEn: "Sailing", rfSportId: null },
  { key: "alpine_skiing", nameEn: "Alpine Skiing", rfSportId: null },
  { key: "shooting", nameEn: "Shooting", rfSportId: null },
  { key: "squash", nameEn: "Squash", rfSportId: null },
  { key: "swimming", nameEn: "Swimming", rfSportId: null },
  { key: "table_tennis", nameEn: "Table Tennis", rfSportId: null },
  { key: "tennis", nameEn: "Tennis", rfSportId: null },
  { key: "triathlon", nameEn: "Triathlon", rfSportId: null },
  { key: "ultimate_frisbee", nameEn: "Ultimate Frisbee", rfSportId: null },
  { key: "volleyball", nameEn: "Volleyball", rfSportId: null },
  { key: "weightlifting", nameEn: "Weightlifting", rfSportId: null },
  { key: "wrestling", nameEn: "Wrestling", rfSportId: null },
  { key: "other_sport", nameEn: "Other Sport", rfSportId: null },
];

// Alphabetically sorted by English name — the i18n layer sorts by localized name at render time if needed.
export const SPORTS_SORTED = [...SPORTS].sort((a, b) =>
  a.nameEn.localeCompare(b.nameEn, "en"),
);

// Look up a Sport by its stable key (used when displaying a stored group's sport).
export const getSportByKey = (key: string): Sport | undefined =>
  SPORTS.find((s) => s.key === key);
