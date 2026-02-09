// ============================================
//  ATTENDANCE.gs - Staff Attendance / Check-In
// ============================================

const CACHE_DURATION = 300; // 5 minutes

/**
 * Get list of attendees not yet checked in (for search/autocomplete)
 */
function getAttendees() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('attendees');
  if (cached) return JSON.parse(cached);

  const ss = getSS();
  const sheet = ss.getSheetByName(REGISTRATION_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 20).getValues();
  const attendees = [];

  for (let i = 0; i < data.length; i++) {
    const qrCode = data[i][1];     // Column B - reference
    const name = data[i][16];      // Column Q - fullName
    const checkedIn = data[i][19]; // Column T - checkedIn

    if (checkedIn || !qrCode || !name) continue;

    attendees.push({
      qrCode: String(qrCode).trim(),
      name: String(name).toUpperCase().trim()
    });
  }

  try {
    cache.put('attendees', JSON.stringify(attendees), CACHE_DURATION);
  } catch (e) {
    Logger.log('Cache error: ' + e);
  }

  return attendees;
}

/**
 * Get detailed attendee info when QR is scanned or name clicked
 */
function getAttendeeDetails(qrCode) {
  const ss = getSS();
  const sheet = ss.getSheetByName(REGISTRATION_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  const data = sheet.getRange(2, 1, lastRow - 1, 20).getValues();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowQR = String(row[1]).trim();

    if (rowQR !== String(qrCode).trim()) continue;

    if (row[19]) {
      throw new Error('This attendee has already checked in.');
    }

    const attendee = {
      qrCode: rowQR,
      name: String(row[16] || '').toUpperCase().trim(),
      lastName: String(row[8] || '').trim(),
      firstName: String(row[9] || '').trim(),
      middleName: String(row[10] || '').trim(),
      email: String(row[11] || '').trim(),
      contact: String(row[12] || '').trim(),
      gender: String(row[13] || '').trim(),
      employer: String(row[14] || '').trim(),
      position: String(row[15] || '').trim(),
      rowIndex: i + 2
    };

    // Parse selected agencies and appointment times
    const transactionsString = String(row[7] || '');
    const appointmentTimes = {
      'LTO': row[2],
      'PSA': row[3],
      'NBI': row[4],
      'PagIBIG': row[5],
      'Notarials': row[6]
    };

    attendee.transactions = parseTransactions(transactionsString, appointmentTimes, ss);
    return attendee;
  }

  return null;
}

/**
 * Parse registered transactions with queue number suggestions
 */
function parseTransactions(transactionsString, appointmentTimes, ss) {
  const registered = transactionsString
    ? transactionsString.split(',').map(t => t.trim()).filter(Boolean)
    : [];

  const agencies = getAgencies().filter(a => a.enabled);
  const result = [];

  agencies.forEach(agency => {
    const isSelected = registered.includes(agency.agencyKey) || registered.includes(agency.agencyName);
    const time = appointmentTimes[agency.agencyKey] || null;

    let queueNumber = null;
    if (isSelected && ss) {
      const transSheet = ss.getSheetByName(agency.sheetName);
      if (transSheet) {
        queueNumber = getNextQueueNumber(transSheet);
      }
    }

    result.push({
      name: agency.agencyKey,
      displayName: agency.agencyName,
      sheet: agency.sheetName,
      selected: isSelected,
      time: time ? formatDateTime(time) : null,
      queueNumber: queueNumber
    });
  });

  return result;
}

/**
 * Process check-in: append to attendance + agency sheets, mark as checked in
 */
function processCheckIn(checkInData) {
  const ss = getSS();
  const attendanceSheet = ss.getSheetByName(ATTENDANCE_SHEET);
  const registrationSheet = ss.getSheetByName(REGISTRATION_SHEET);

  if (!attendanceSheet || !registrationSheet) {
    throw new Error('Required sheets not found');
  }
  if (!checkInData || !checkInData.qrCode || !checkInData.transactions) {
    throw new Error('Invalid check-in data');
  }

  const today = new Date();
  const todayFormatted = getTodayDate();
  const timestamp = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  const assignedQueueNumbers = {};
  const agencies = getAgencies();

  // 1. Append to each selected transaction/agency sheet
  for (const transName of checkInData.transactions) {
    const agency = agencies.find(a => a.agencyKey === transName);
    const sheetName = agency ? agency.sheetName : transName;

    const transSheet = ensureAgencySheet(ss, sheetName);
    const queueNumber = getNextQueueNumber(transSheet);
    assignedQueueNumbers[transName] = queueNumber;

    const rowData = new Array(26).fill('');
    rowData[0] = checkInData.qrCode;
    rowData[1] = todayFormatted;
    rowData[2] = checkInData.name || '';
    rowData[3] = checkInData.email || '';
    rowData[4] = checkInData.contact || '';
    rowData[5] = checkInData.gender || '';
    rowData[6] = checkInData.employer || '';
    rowData[25] = queueNumber;

    transSheet.appendRow(rowData);
  }

  // 2. Append to attendance sheet
  const transactionsList = checkInData.transactions.join(', ');
  attendanceSheet.appendRow([
    checkInData.qrCode,
    checkInData.name,
    timestamp,
    transactionsList,
    checkInData.gender,
    checkInData.email,
    checkInData.contact
  ]);

  // 3. Mark as checked-in in registration sheet
  const lastRow = registrationSheet.getLastRow();
  const qrCodes = registrationSheet.getRange(2, 2, lastRow - 1, 1).getValues();

  for (let i = 0; i < qrCodes.length; i++) {
    if (String(qrCodes[i][0]).trim() === String(checkInData.qrCode).trim()) {
      registrationSheet.getRange(i + 2, 20).setValue('checked-in');
      break;
    }
  }

  // 4. Clear cache
  try {
    CacheService.getScriptCache().remove('attendees');
  } catch (e) {
    Logger.log('Cache clear error: ' + e);
  }

  return {
    success: true,
    message: 'Check-in successful',
    queueNumbers: assignedQueueNumbers
  };
}
