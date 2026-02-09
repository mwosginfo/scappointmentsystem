// ============================================
//  APPOINTMENT.gs - Registration & Appointments
// ============================================

/**
 * Generate time slots for a given date
 */
function generateTimeSlots(dateStr) {
  const slotConfig = getSlotConfig();
  const config = slotConfig[dateStr] || {};

  const startHour = config.startHour || 8;
  const startMinute = config.startMinute || 0;
  const endHour = config.endHour || 16;
  const endMinute = config.endMinute || 30;
  const intervalMinutes = config.interval || 30;

  const slots = [];
  let hour = startHour;
  let minute = startMinute;

  while (hour < endHour || (hour === endHour && minute <= endMinute)) {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    slots.push(`${displayHour}:${String(minute).padStart(2, '0')} ${ampm}`);
    minute += intervalMinutes;
    if (minute >= 60) {
      hour++;
      minute = 0;
    }
  }
  return slots;
}

/**
 * Get available slots for an agency on a specific date
 */
function getAvailableSlots(agency, date) {
  const ss = getSS();
  const sheet = ss.getSheetByName(REGISTRATION_SHEET);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return generateTimeSlots(date);

  const data = sheet.getDataRange().getValues();
  const header = data[0];

  // Find the appointment column for this agency
  const colName = 'appt' + agency;
  let colIndex = header.indexOf(colName);
  if (colIndex === -1) return generateTimeSlots(date);

  // Count existing appointments per slot
  const slotCount = {};
  for (let i = 1; i < data.length; i++) {
    const apptValue = data[i][colIndex];
    if (!apptValue) continue;

    try {
      const apptDateObj = new Date(apptValue);
      const apptDate = Utilities.formatDate(apptDateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      const apptTime = Utilities.formatDate(apptDateObj, Session.getScriptTimeZone(), 'h:mm a');

      if (apptDate === date) {
        slotCount[apptTime] = (slotCount[apptTime] || 0) + 1;
      }
    } catch (e) {
      // Try string parsing as fallback
      const parts = String(apptValue).split(' ');
      if (parts[0] === date) {
        const time = parts.slice(1).join(' ');
        slotCount[time] = (slotCount[time] || 0) + 1;
      }
    }
  }

  // Filter out full slots
  const allSlots = generateTimeSlots(date);
  const maxSlots = MAX_PER_SLOT;

  return allSlots.filter(slot => (slotCount[slot] || 0) < maxSlots);
}

/**
 * Check for duplicate registration by email
 */
function checkDuplicate(email) {
  if (!email) return null;

  const ss = getSS();
  const sheet = ss.getSheetByName(REGISTRATION_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return null;

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 20).getValues();

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][11]).trim().toLowerCase() === email.trim().toLowerCase()) {
      return {
        exists: true,
        reference: data[i][1],
        name: data[i][16],
        rowIndex: i + 2
      };
    }
  }
  return null;
}

/**
 * Lookup registration by email (for editing)
 */
function lookupByEmail(email) {
  if (!email) return { found: false };

  const ss = getSS();
  const sheet = ss.getSheetByName(REGISTRATION_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return { found: false };

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 20).getValues();
  const header = sheet.getRange(1, 1, 1, 20).getValues()[0];

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][11]).trim().toLowerCase() === email.trim().toLowerCase()) {
      const row = data[i];
      return {
        found: true,
        rowIndex: i + 2,
        reference: row[1],
        apptLTO: row[2] ? String(row[2]) : '',
        apptPSA: row[3] ? String(row[3]) : '',
        apptNBI: row[4] ? String(row[4]) : '',
        apptPagIBIG: row[5] ? String(row[5]) : '',
        apptNotarials: row[6] ? String(row[6]) : '',
        selectedOptions: row[7] ? String(row[7]) : '',
        lastName: row[8],
        firstName: row[9],
        middleName: row[10],
        email: row[11],
        contact: row[12],
        gender: row[13],
        employer: row[14],
        position: row[15],
        fullName: row[16],
        OWWAtransSelected: row[17] ? String(row[17]) : '',
        DMWtransSelected: row[18] ? String(row[18]) : '',
        checkedIn: row[19]
      };
    }
  }
  return { found: false };
}

/**
 * Process a new registration
 */
function processRegistration(data) {
  const ss = getSS();
  const mainSheet = ss.getSheetByName(REGISTRATION_SHEET);

  // Check for duplicate
  const duplicate = checkDuplicate(data.email);
  if (duplicate) {
    return {
      error: 'duplicate',
      message: 'An account with this email already exists.',
      reference: duplicate.reference,
      name: duplicate.name
    };
  }

  const reference = generateUniqueCode();
  const timestamp = new Date();
  const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();

  // Append to main registration sheet
  const mainRow = [
    timestamp,
    reference,
    data.apptLTO || '',
    data.apptPSA || '',
    data.apptNBI || '',
    data.apptPagIBIG || '',
    data.apptNotarials || '',
    data.selectedOptions || '',
    data.lastName || '',
    data.firstName || '',
    data.middleName || '',
    data.email || '',
    data.contact || '',
    data.gender || '',
    data.employer || '',
    data.position || '',
    fullName,
    data.OWWAtransSelected || '',
    data.DMWtransSelected || '',
    '' // checkedIn
  ];
  mainSheet.appendRow(mainRow);

  // Append to individual agency sheets for appointment agencies
  const agencies = getAgencies();
  const appointmentAgencies = agencies.filter(a => a.needsAppointment && a.enabled);

  appointmentAgencies.forEach(agency => {
    const apptKey = 'appt' + agency.agencyKey;
    const apptValue = data[apptKey];
    if (!apptValue) return;

    appendToAgencySheet(ss, agency.sheetName, {
      reference: reference,
      dateTime: apptValue,
      fullName: fullName,
      email: data.email || '',
      contact: data.contact || '',
      gender: data.gender || ''
    });
  });

  // Append to OWWA sheet if selected
  if (data.OWWAtransSelected) {
    appendToGenericAgencySheet(ss, 'OWWA', {
      reference: reference,
      fullName: fullName,
      lastName: data.lastName,
      firstName: data.firstName,
      middleName: data.middleName,
      email: data.email,
      contact: data.contact,
      gender: data.gender,
      transaction: data.OWWAtransSelected
    });
  }

  // Append to DMW sheet if selected
  if (data.DMWtransSelected) {
    appendToGenericAgencySheet(ss, 'DMW', {
      reference: reference,
      fullName: fullName,
      email: data.email,
      contact: data.contact,
      gender: data.gender,
      transaction: data.DMWtransSelected
    });
  }

  // Send confirmation email
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${reference}`;

  if (data.email) {
    sendConfirmationEmail(data, reference, qrUrl);
  }

  return { success: true, reference: reference, qrUrl: qrUrl };
}

/**
 * Update an existing registration
 */
function updateRegistration(data) {
  const ss = getSS();
  const sheet = ss.getSheetByName(REGISTRATION_SHEET);

  const existing = lookupByEmail(data.email);
  if (!existing.found) {
    return { error: 'not_found', message: 'Registration not found.' };
  }
  if (existing.checkedIn) {
    return { error: 'checked_in', message: 'Cannot edit - already checked in.' };
  }

  const rowIndex = existing.rowIndex;
  const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();

  // Update the row (skip timestamp and reference)
  sheet.getRange(rowIndex, 3, 1, 18).setValues([[
    data.apptLTO || '',
    data.apptPSA || '',
    data.apptNBI || '',
    data.apptPagIBIG || '',
    data.apptNotarials || '',
    data.selectedOptions || '',
    data.lastName || '',
    data.firstName || '',
    data.middleName || '',
    data.email || '',
    data.contact || '',
    data.gender || '',
    data.employer || '',
    data.position || '',
    fullName,
    data.OWWAtransSelected || '',
    data.DMWtransSelected || '',
    '' // keep checkedIn status
  ]]);

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${existing.reference}`;

  return {
    success: true,
    reference: existing.reference,
    qrUrl: qrUrl,
    message: 'Registration updated successfully.'
  };
}

/**
 * Append to an appointment-type agency sheet
 */
function appendToAgencySheet(ss, sheetName, info) {
  if (!info.dateTime) return;

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ensureAgencySheet(ss, sheetName);
  }

  const parts = String(info.dateTime).split(' ');
  const datePart = parts[0];
  const timePart = parts.slice(1).join(' ');

  let formattedDate;
  try {
    formattedDate = Utilities.formatDate(new Date(datePart), Session.getScriptTimeZone(), 'dd-MM-yyyy');
  } catch (e) {
    formattedDate = datePart;
  }

  // Build a row with 26 columns
  const rowData = new Array(26).fill('');
  rowData[0] = info.reference;
  rowData[1] = formattedDate;
  rowData[2] = info.fullName;
  rowData[3] = info.email;
  rowData[4] = info.contact;
  rowData[5] = info.gender;
  // Column 7 (index 6) = time
  rowData[6] = timePart;
  // Column 8 (index 7) = confirmed (empty by default)
  sheet.appendRow(rowData);
}

/**
 * Append to a generic (non-appointment) agency sheet
 */
function appendToGenericAgencySheet(ss, sheetName, info) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ensureAgencySheet(ss, sheetName);
  }

  const rowData = new Array(26).fill('');
  rowData[0] = info.reference;
  rowData[1] = getTodayDate();
  rowData[2] = info.fullName;
  rowData[3] = info.email || '';
  rowData[4] = info.contact || '';
  rowData[5] = info.gender || '';
  rowData[6] = info.transaction || '';
  sheet.appendRow(rowData);
}
