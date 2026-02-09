// ============================================
//  SELFCHECKIN.gs - Walk-In Self Registration
// ============================================

/**
 * Submit a walk-in registration form
 */
function submitWalkIn(formData) {
  try {
    // Check if walk-ins are enabled
    if (!getWalkInEnabled()) {
      return { success: false, message: 'Walk-in registration is currently disabled.' };
    }

    const ss = getSS();
    const selectedServices = formData.serviceTypes;

    if (!selectedServices || selectedServices.length === 0) {
      return { success: false, message: 'Please select at least one service.' };
    }

    const agencies = getAgencies();
    for (let i = 0; i < selectedServices.length; i++) {
      const agency = agencies.find(a => a.agencyKey === selectedServices[i]);
      if (!agency) {
        return { success: false, message: 'Invalid service selected: ' + selectedServices[i] };
      }
    }

    // Generate reference and data
    const code = generateUniqueCode();
    const dateToday = getTodayDate();
    const fullName = `${formData.lastName || ''}, ${formData.firstName || ''} ${formData.middleName || ''}`.trim();
    const contact = formData.contactPrefix
      ? formData.contactPrefix + formData.contact
      : formData.contact || '';

    const queues = [];

    // 1. Add to attendance sheet
    const attendanceSheet = ensureAttendanceSheet(ss);
    const attQueueNumber = appendToWalkInSheet(
      attendanceSheet, code, dateToday, fullName,
      formData.email, contact, formData.gender,
      formData.employer, formData.position
    );
    queues.push({ agency: 'Attendance', queueNumber: attQueueNumber });

    // 2. Add to each selected service sheet
    for (const serviceKey of selectedServices) {
      const agency = agencies.find(a => a.agencyKey === serviceKey);
      const sheetName = agency ? agency.sheetName : serviceKey;
      const displayName = agency ? agency.agencyName : serviceKey;

      const serviceSheet = ensureAgencySheet(ss, sheetName);
      const serviceQueueNumber = appendToWalkInSheet(
        serviceSheet, code, dateToday, fullName,
        formData.email, contact, formData.gender,
        formData.employer, formData.position
      );
      queues.push({ agency: displayName, queueNumber: serviceQueueNumber });
    }

    // 3. Also add to main registration sheet (for consistency)
    const regSheet = ss.getSheetByName(REGISTRATION_SHEET);
    if (regSheet) {
      regSheet.appendRow([
        new Date(),          // timestamp
        code,                // reference
        '', '', '', '', '',  // appointment columns (empty for walk-in)
        selectedServices.join(', '),  // selectedOptions
        formData.lastName || '',
        formData.firstName || '',
        formData.middleName || '',
        formData.email || '',
        contact,
        formData.gender || '',
        formData.employer || '',
        formData.position || '',
        fullName,
        '', '',              // OWWA/DMW trans
        'checked-in'         // walk-ins are auto checked-in
      ]);
    }

    return {
      success: true,
      message: 'Registration successful!',
      code: code,
      fullName: fullName,
      queues: queues
    };
  } catch (error) {
    Logger.log('Walk-in error: ' + error);
    return { success: false, message: 'Error: ' + error.toString() };
  }
}

/**
 * Ensure attendance sheet exists
 */
function ensureAttendanceSheet(ss) {
  let sheet = ss.getSheetByName(ATTENDANCE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ATTENDANCE_SHEET);
    const headers = new Array(26).fill('');
    headers[0] = 'Code';
    headers[1] = 'Date';
    headers[2] = 'Full Name';
    headers[5] = 'Email';
    headers[6] = 'Contact';
    headers[7] = 'Gender';
    headers[8] = 'Employer';
    headers[9] = 'Position';
    headers[25] = 'Queue No.';
    sheet.appendRow(headers);
  }
  return sheet;
}

/**
 * Append a walk-in entry to a sheet with queue number
 */
function appendToWalkInSheet(sheet, code, dateToday, fullName, email, contact, gender, employer, position) {
  const queueNumber = getNextQueueNumber(sheet);

  const rowData = new Array(26).fill('');
  rowData[0] = code;
  rowData[1] = dateToday;
  rowData[2] = fullName;
  rowData[3] = email || '';
  rowData[4] = contact || '';
  rowData[5] = gender || '';
  rowData[6] = employer || '';
  rowData[7] = position || '';
  rowData[25] = queueNumber;

  sheet.appendRow(rowData);
  return queueNumber;
}
