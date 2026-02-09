// ============================================
//  CONFIG.gs - Configuration Management
// ============================================

// =============================================
//  ⚙️  EDIT THESE VALUES FOR YOUR EVENT
// =============================================
const SHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';          // Google Sheet ID
const MWO_EMAIL = 'your-email@example.com';            // Reply-to email for inquiries
const EVENT_NAME = 'BAGONG BAYANI Serbisyo Caravan';   // Event name
const EVENT_LOCATION = 'Your Event Location';           // Event venue
const EVENT_BANNER_URL = '';                             // Banner image URL for emails/tickets (optional)
const MAX_PER_SLOT = 5;                                 // Default max appointments per time slot
const QUEUE_CODE_PREFIX = '';                            // Prefix for walk-in codes e.g. 'WI-'
const QUEUE_CODE_LENGTH = 8;                            // Length of generated reference codes
// =============================================

const CONFIG_SHEET = '_config';
const REGISTRATION_SHEET = 'registration';
const ATTENDANCE_SHEET = 'attendance';

// PropertiesService for persistent queue state
const scriptProps = PropertiesService.getScriptProperties();

/**
 * Get the spreadsheet instance
 */
function getSS() {
  return SpreadsheetApp.openById(SHEET_ID);
}

/**
 * Initialize the system - creates config sheet and registration sheet if needed.
 * Run this once after setup.
 */
function initializeSystem() {
  const ss = getSS();

  // Create _config sheet
  let configSheet = ss.getSheetByName(CONFIG_SHEET);
  if (!configSheet) {
    configSheet = ss.insertSheet(CONFIG_SHEET);
    configSheet.appendRow([
      'agencyKey', 'agencyName', 'description', 'services',
      'logoUrl', 'category', 'needsAppointment', 'appointmentDates',
      'sheetName', 'enabled', 'sortOrder'
    ]);

    // Insert default agencies
    const defaults = [
      ['LTO', 'Land Transportation Office', 'LTO Services', "Driver's License Renewal", '', 'appointment', true, '', 'LTO', true, 1],
      ['PSA', 'Philippine Statistics Authority', 'PSA Services', 'Civil Registry Issuance|National ID Registration|Civil Registration Matters', '', 'appointment', true, '', 'PSA', true, 2],
      ['NBI', 'NBI', 'NBI Services', 'NBI Clearance Issuance', '', 'appointment', true, '', 'NBI', true, 3],
      ['PagIBIG', 'Pag-IBIG Fund', 'Pag-IBIG Services', 'Membership Services|MP2 Enrollment|Loan Consultation', '', 'appointment', true, '', 'PagIBIG', true, 4],
      ['Notarials', 'PH Embassy Notarials', 'Notarial Services', 'Affidavits|Legal Notarization', '', 'appointment', true, '', 'Notarials', true, 5],
      ['Passport', 'PH Embassy Passport', 'Passport Application', 'Passport Application', '', 'embassy', false, '', 'Passport', true, 6],
      ['PE_ID', 'PH Embassy ID', 'Embassy ID Services', 'PH Embassy ID', '', 'embassy', false, '', 'PE ID', true, 7],
      ['ATN', 'Assistance-To-Nationals', 'ATN Services', 'ATN', '', 'embassy', false, '', 'ATN', true, 8],
      ['SSS', 'SSS', 'SSS Services', 'Membership and Benefits|Annual Confirmation|PRN Generation', '', 'other', false, '', 'SSS', true, 9],
      ['PhilHealth', 'PhilHealth', 'PhilHealth Services', 'Membership and Benefits|YAKAP Enrollment', '', 'other', false, '', 'PhilHealth', true, 10],
      ['PAO', "Public Attorney's Office", 'Legal Services', 'Legal Advice and Information', '', 'other', false, '', 'PAO', true, 11],
      ['DSWD', 'DSWD', 'DSWD Services', 'Programs and Services Info|Counseling/Psychosocial', '', 'other', false, '', 'DSWD', true, 12],
      ['Landbank', 'Land Bank', 'Banking Services', 'GoBayani Account|Financial Education', '', 'other', false, '', 'Landbank', true, 13],
      ['UPOU', 'UP Open University', 'Education', 'Admissions and Courses Inquiries', '', 'other', false, '', 'UPOU', true, 14],
      ['OWWA', 'OWWA', 'OWWA Services', 'Membership|Benefits|Repatriation', '', 'other_multi', false, '', 'OWWA', true, 15],
      ['DMW', 'DMW', 'DMW Services', 'First Time OEC|Change of Employer', '', 'other_radio', false, '', 'DMW', true, 16],
    ];

    defaults.forEach(row => configSheet.appendRow(row));
  }

  // Create registration sheet
  let regSheet = ss.getSheetByName(REGISTRATION_SHEET);
  if (!regSheet) {
    regSheet = ss.insertSheet(REGISTRATION_SHEET);
    regSheet.appendRow([
      'timestamp', 'reference', 'apptLTO', 'apptPSA', 'apptNBI',
      'apptPagIBIG', 'apptNotarials', 'selectedOptions', 'lastName',
      'firstName', 'middleName', 'email', 'contact', 'gender',
      'employer', 'position', 'fullName', 'OWWAtransSelected',
      'DMWtransSelected', 'checkedIn'
    ]);
  }

  // Create attendance sheet
  let attSheet = ss.getSheetByName(ATTENDANCE_SHEET);
  if (!attSheet) {
    attSheet = ss.insertSheet(ATTENDANCE_SHEET);
    attSheet.appendRow([
      'reference', 'fullName', 'timestamp', 'transactions',
      'gender', 'email', 'contact'
    ]);
  }

  // Create settings properties
  if (!scriptProps.getProperty('walkInEnabled')) {
    scriptProps.setProperty('walkInEnabled', 'true');
  }
  if (!scriptProps.getProperty('appointmentDates')) {
    scriptProps.setProperty('appointmentDates', JSON.stringify([]));
  }

  return { success: true, message: 'System initialized successfully.' };
}

// ============================================
//  CONFIG CRUD OPERATIONS
// ============================================

/**
 * Get all agencies from config
 */
function getAgencies() {
  const ss = getSS();
  const sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();

  return data.map((row, i) => ({
    rowIndex: i + 2,
    agencyKey: row[0],
    agencyName: row[1],
    description: row[2],
    services: row[3] ? String(row[3]).split('|').map(s => s.trim()) : [],
    logoUrl: row[4],
    category: row[5],         // 'appointment', 'embassy', 'other', 'other_multi', 'other_radio'
    needsAppointment: row[6] === true || row[6] === 'TRUE',
    appointmentDates: row[7] ? String(row[7]).split('|').map(s => s.trim()) : [],
    sheetName: row[8],
    enabled: row[9] === true || row[9] === 'TRUE' || row[9] === '',
    sortOrder: row[10] || 999
  })).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get public-safe config for client pages
 */
function getPublicConfig() {
  const agencies = getAgencies().filter(a => a.enabled);
  const walkInEnabled = scriptProps.getProperty('walkInEnabled') !== 'false';
  const appointmentDates = JSON.parse(scriptProps.getProperty('appointmentDates') || '[]');

  return {
    eventName: EVENT_NAME,
    eventLocation: EVENT_LOCATION,
    bannerUrl: EVENT_BANNER_URL,
    agencies: agencies,
    walkInEnabled: walkInEnabled,
    appointmentDates: appointmentDates
  };
}

/**
 * Add a new agency
 */
function addAgency(agencyData) {
  const ss = getSS();
  const sheet = ss.getSheetByName(CONFIG_SHEET);

  sheet.appendRow([
    agencyData.agencyKey,
    agencyData.agencyName,
    agencyData.description || '',
    (agencyData.services || []).join('|'),
    agencyData.logoUrl || '',
    agencyData.category || 'other',
    agencyData.needsAppointment || false,
    (agencyData.appointmentDates || []).join('|'),
    agencyData.sheetName || agencyData.agencyKey,
    true,
    agencyData.sortOrder || 999
  ]);

  // Create the agency sheet if needed
  ensureAgencySheet(ss, agencyData.sheetName || agencyData.agencyKey);

  return { success: true, message: 'Agency added: ' + agencyData.agencyName };
}

/**
 * Update an agency
 */
function updateAgency(rowIndex, agencyData) {
  const ss = getSS();
  const sheet = ss.getSheetByName(CONFIG_SHEET);

  sheet.getRange(rowIndex, 1, 1, 11).setValues([[
    agencyData.agencyKey,
    agencyData.agencyName,
    agencyData.description || '',
    (agencyData.services || []).join('|'),
    agencyData.logoUrl || '',
    agencyData.category || 'other',
    agencyData.needsAppointment || false,
    (agencyData.appointmentDates || []).join('|'),
    agencyData.sheetName || agencyData.agencyKey,
    agencyData.enabled !== false,
    agencyData.sortOrder || 999
  ]]);

  return { success: true, message: 'Agency updated: ' + agencyData.agencyName };
}

/**
 * Delete an agency
 */
function deleteAgency(rowIndex) {
  const ss = getSS();
  const sheet = ss.getSheetByName(CONFIG_SHEET);
  sheet.deleteRow(rowIndex);
  return { success: true };
}

/**
 * Toggle walk-in registration
 */
function setWalkInEnabled(enabled) {
  scriptProps.setProperty('walkInEnabled', String(enabled));
  return { success: true, walkInEnabled: enabled };
}

/**
 * Get walk-in status
 */
function getWalkInEnabled() {
  return scriptProps.getProperty('walkInEnabled') !== 'false';
}

/**
 * Set appointment dates for the event
 */
function setAppointmentDates(dates) {
  scriptProps.setProperty('appointmentDates', JSON.stringify(dates));
  return { success: true, dates: dates };
}

/**
 * Get appointment dates
 */
function getAppointmentDates() {
  return JSON.parse(scriptProps.getProperty('appointmentDates') || '[]');
}

/**
 * Set slot config per agency (date-specific end times, etc.)
 */
function setSlotConfig(config) {
  scriptProps.setProperty('slotConfig', JSON.stringify(config));
  return { success: true };
}

/**
 * Get slot config
 */
function getSlotConfig() {
  return JSON.parse(scriptProps.getProperty('slotConfig') || '{}');
}

// ============================================
//  COUNTER / QUEUE CONFIGURATION
// ============================================

/**
 * Get queue counters config
 */
function getCounters() {
  const stored = scriptProps.getProperty('counters');
  if (stored) return JSON.parse(stored);
  return [];
}

/**
 * Save queue counters config
 */
function saveCounters(counters) {
  scriptProps.setProperty('counters', JSON.stringify(counters));
  return { success: true };
}

// ============================================
//  UTILITY FUNCTIONS
// ============================================

/**
 * Ensure an agency sheet exists with headers
 */
function ensureAgencySheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = new Array(26).fill('');
    headers[0] = 'Code';
    headers[1] = 'Date';
    headers[2] = 'Full Name';
    headers[3] = 'Email';
    headers[4] = 'Contact';
    headers[5] = 'Gender';
    headers[6] = 'Employer';
    headers[7] = 'Confirmed';
    headers[25] = 'Queue No.';
    sheet.appendRow(headers);
  }
  return sheet;
}

/**
 * Generate a unique reference code
 */
function generateUniqueCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = QUEUE_CODE_PREFIX;
  for (let i = 0; i < QUEUE_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Get the next queue number for a sheet
 */
function getNextQueueNumber(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;

  try {
    const queueValues = sheet.getRange(2, 26, lastRow - 1, 1).getValues();
    let maxQueue = 0;
    for (let i = 0; i < queueValues.length; i++) {
      const val = parseInt(queueValues[i][0], 10);
      if (!isNaN(val) && val > maxQueue) maxQueue = val;
    }
    return maxQueue + 1;
  } catch (e) {
    Logger.log('Error getting queue number: ' + e);
    return 1;
  }
}

/**
 * Format date/time for display
 */
function formatDateTime(dateTime) {
  if (!dateTime) return null;
  try {
    if (dateTime instanceof Date) {
      return Utilities.formatDate(dateTime, Session.getScriptTimeZone(), 'yyyy-MM-dd hh:mm a');
    }
    return String(dateTime);
  } catch (e) {
    return String(dateTime);
  }
}

/**
 * Get today's date string
 */
function getTodayDate() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
