/**
 * LOK Services Index
 *
 * Re-exports all LOK-stöd / RF integration services for convenient imports.
 */

export { lokValidationService } from "./lokValidationService";
export { personnummerService } from "./personnummerService";
export { rfService } from "./rfService";

// Re-export commonly used functions
export {
    formatPersonnummerInput,
    getMaskedPersonnummer, getPersonnummerStatus, removePersonnummer, storePersonnummer, validatePersonnummerFormat
} from "./personnummerService";

export {
    LOK_RULES, calculateDurationMinutes, checkEventLokEligibility, getCurrentReportingPeriod,
    getReportingPeriodLabel
} from "./lokValidationService";

export {
    generateKommunExport, generateLokReport,
    getLokReport,
    listLokReports,
    submitLokReportToRf,
    updateClubRfSettings
} from "./rfService";

