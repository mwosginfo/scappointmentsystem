// ============================================
//  QUEUEDISPLAY.gs - Queue Display & Calling
// ============================================

/**
 * Get queue display data for all counters
 */
function getQueueDisplay() {
  const counters = getCounters();
  if (!counters || counters.length === 0) return [];

  const ss = getSS();
  const displayData = [];

  counters.forEach(counter => {
    const transSheet = ss.getSheetByName(counter.sheet);
    if (!transSheet) return;

    const queueInfo = getCounterQueueInfo(transSheet, counter.confirmCol || 8, counter.name);

    displayData.push({
      name: counter.name,
      logo: counter.logo || '',
      nowServing: queueInfo.nowServing,
      nowServingQR: queueInfo.nowServingQR,
      nowServingStatus: queueInfo.nowServingStatus,
      nextInLine: queueInfo.nextInLine,
      calling: false
    });
  });

  return displayData;
}

/**
 * Get queue info for a specific counter
 */
function getCounterQueueInfo(sheet, confirmCol, counterName) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { nowServing: null, nowServingQR: null, nowServingStatus: null, nextInLine: [] };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 26).getValues();
  const queueCol = 25;  // Column Z (0-indexed)
  const qrCol = 0;      // Column A
  const confirmColIndex = confirmCol - 1;

  // Get last called from storage
  let lastCalled = null, lastCalledQR = null, lastCalledStatus = null;
  try {
    const stored = scriptProps.getProperty('lastCalled_' + counterName);
    if (stored) {
      const parsed = JSON.parse(stored);
      lastCalled = parsed.number;
      lastCalledQR = parsed.qr;
      lastCalledStatus = parsed.status || 'serving';
    }
  } catch (e) {}

  const pendingQueue = [];
  for (let i = 0; i < data.length; i++) {
    const queueNum = data[i][queueCol];
    const qrCode = data[i][qrCol];
    const confirmed = data[i][confirmColIndex];

    if (typeof queueNum === 'number' && queueNum > 0) {
      const isConfirmed = confirmed === true || confirmed === 'TRUE' || confirmed === 'true';
      if (!isConfirmed) {
        pendingQueue.push({ queue: queueNum, qr: qrCode, rowIndex: i + 2 });
      }
    }
  }

  pendingQueue.sort((a, b) => a.queue - b.queue);
  const nextInLine = pendingQueue.slice(0, 10).map(item => ({ queue: item.queue, qr: item.qr }));

  return {
    nowServing: lastCalled,
    nowServingQR: lastCalledQR,
    nowServingStatus: lastCalledStatus,
    nextInLine: nextInLine
  };
}

/**
 * Get all QR codes currently being served across all counters
 */
function getActivelyServedQRCodes() {
  const counters = getCounters();
  const activeQRs = new Set();

  counters.forEach(counter => {
    try {
      const str = scriptProps.getProperty('lastCalled_' + counter.name);
      if (str) {
        const parsed = JSON.parse(str);
        if (parsed.qr && parsed.status === 'serving') {
          activeQRs.add(parsed.qr);
        }
      }
    } catch (e) {}
  });

  return activeQRs;
}

/**
 * Call the next number for a counter
 */
function callNextNumber(counterName, previousStatus) {
  const counters = getCounters();
  const counter = counters.find(c => c.name === counterName);
  if (!counter) return { success: false, message: 'Invalid counter' };

  const ss = getSS();
  const sheet = ss.getSheetByName(counter.sheet);
  if (!sheet) return { success: false, message: 'Sheet not found' };

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, message: 'No entries in queue' };

  const data = sheet.getRange(2, 1, lastRow - 1, 26).getValues();
  const queueCol = 25;
  const qrCol = 0;
  const confirmColIndex = (counter.confirmCol || 8) - 1;

  const activeQRs = getActivelyServedQRCodes();

  // Exclude current serving QR
  let currentServingRowIndex = null;
  try {
    const str = scriptProps.getProperty('lastCalled_' + counterName);
    if (str) {
      const parsed = JSON.parse(str);
      currentServingRowIndex = parsed.rowIndex;
      if (parsed.qr) activeQRs.delete(parsed.qr);
    }
  } catch (e) {}

  // Find unserved entries
  const unservedEntries = [];
  for (let i = 0; i < data.length; i++) {
    const rowIndex = i + 2;
    const queueNum = data[i][queueCol];
    const qrCode = data[i][qrCol];
    const confirmed = data[i][confirmColIndex];

    if (typeof queueNum === 'number' && queueNum > 0) {
      const isConfirmed = confirmed === true || confirmed === 'TRUE' || confirmed === 'true';
      if (!isConfirmed && rowIndex !== currentServingRowIndex) {
        unservedEntries.push({ queue: queueNum, qr: qrCode, rowIndex: rowIndex });
      }
    }
  }

  if (unservedEntries.length === 0) {
    return { success: false, message: 'No more numbers in queue' };
  }

  unservedEntries.sort((a, b) => a.queue - b.queue);

  // Find first entry not being served elsewhere
  let nextEntry = null;
  let skippedCount = 0;

  for (const entry of unservedEntries) {
    if (activeQRs.has(entry.qr)) {
      skippedCount++;
    } else {
      nextEntry = entry;
      break;
    }
  }

  if (!nextEntry) {
    return { success: false, message: 'All pending numbers are being served elsewhere' };
  }

  // Save current serving info
  scriptProps.setProperty('lastCalled_' + counterName, JSON.stringify({
    number: nextEntry.queue,
    qr: nextEntry.qr,
    rowIndex: nextEntry.rowIndex,
    status: 'serving'
  }));

  // Add to recent alerts
  addRecentAlert(nextEntry.queue, nextEntry.qr, counterName, 'serving', counter.logo);

  const remainingQueue = unservedEntries
    .filter(item => item.queue !== nextEntry.queue)
    .slice(0, 5)
    .map(item => ({ queue: item.queue, qr: item.qr }));

  return {
    success: true,
    transaction: counterName,
    number: nextEntry.queue,
    qrCode: nextEntry.qr,
    status: 'serving',
    nextInLine: remainingQueue,
    skippedCount: skippedCount
  };
}

/**
 * Mark current as served and call next
 */
function markServedAndCallNext(counterName) {
  const counters = getCounters();
  const counter = counters.find(c => c.name === counterName);
  if (!counter) return { success: false, message: 'Invalid counter' };

  try {
    const str = scriptProps.getProperty('lastCalled_' + counterName);
    if (str) {
      const lastCalled = JSON.parse(str);
      if (lastCalled.rowIndex) {
        const ss = getSS();
        const sheet = ss.getSheetByName(counter.sheet);
        sheet.getRange(lastCalled.rowIndex, counter.confirmCol || 8).setValue(true);
      }
      lastCalled.status = 'served';
      scriptProps.setProperty('lastCalled_' + counterName, JSON.stringify(lastCalled));
    }
  } catch (e) {
    Logger.log('Error marking served: ' + e);
  }

  return callNextNumber(counterName, 'served');
}

/**
 * Mark current as served with sub-transactions, then call next
 */
function markServedWithSubTransactions(counterName, selectedSubTransCols) {
  const counters = getCounters();
  const counter = counters.find(c => c.name === counterName);
  if (!counter) return { success: false, message: 'Invalid counter' };

  try {
    const str = scriptProps.getProperty('lastCalled_' + counterName);
    if (str) {
      const lastCalled = JSON.parse(str);
      if (lastCalled.rowIndex) {
        const ss = getSS();
        const sheet = ss.getSheetByName(counter.sheet);
        sheet.getRange(lastCalled.rowIndex, counter.confirmCol || 8).setValue(true);

        if (selectedSubTransCols && selectedSubTransCols.length > 0) {
          for (const colIndex of selectedSubTransCols) {
            sheet.getRange(lastCalled.rowIndex, colIndex).setValue(true);
          }
        }
      }
      lastCalled.status = 'served';
      scriptProps.setProperty('lastCalled_' + counterName, JSON.stringify(lastCalled));
    }
  } catch (e) {
    Logger.log('Error marking served with sub-transactions: ' + e);
  }

  return callNextNumber(counterName, 'served');
}

/**
 * Mark current as missed and call next
 */
function markMissedAndCallNext(counterName) {
  const counters = getCounters();
  const counter = counters.find(c => c.name === counterName);
  if (!counter) return { success: false, message: 'Invalid counter' };

  let currentServing = null;
  try {
    const str = scriptProps.getProperty('lastCalled_' + counterName);
    if (str) currentServing = JSON.parse(str);
  } catch (e) {}

  if (currentServing) {
    addRecentAlert(currentServing.number, currentServing.qr, counterName, 'missed', counter.logo);
    addToMissedQueue(counterName, currentServing);
  }

  return callNextNumber(counterName, 'missed');
}

/**
 * Get sub-transaction headers from a counter's sheet
 */
function getSubTransactions(counterName) {
  const counters = getCounters();
  const counter = counters.find(c => c.name === counterName);
  if (!counter) return { success: false, subTransactions: [] };

  if (counter.skipSubTrans) {
    return { success: true, skip: true, subTransactions: [] };
  }

  const ss = getSS();
  const sheet = ss.getSheetByName(counter.sheet);
  if (!sheet) return { success: false, subTransactions: [] };

  // Read headers from row 2, columns M(13) to Y(25)
  const lastCol = sheet.getLastColumn();
  if (lastCol < 13) return { success: true, skip: true, subTransactions: [] };

  const endCol = Math.min(lastCol, 25);
  const numCols = endCol - 13 + 1;
  if (numCols <= 0) return { success: true, skip: true, subTransactions: [] };

  const headers = sheet.getRange(1, 13, 1, numCols).getValues()[0];
  const subTransactions = [];

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (header && String(header).trim() !== '') {
      subTransactions.push({ name: String(header).trim(), colIndex: 13 + i });
    }
  }

  if (subTransactions.length === 0) {
    return { success: true, skip: true, subTransactions: [] };
  }

  return { success: true, skip: false, subTransactions: subTransactions };
}

// ============================================
//  MISSED QUEUE MANAGEMENT
// ============================================

function addToMissedQueue(counterName, entry) {
  let missedQueue = [];
  try {
    const stored = scriptProps.getProperty('missedQueue_' + counterName);
    if (stored) missedQueue = JSON.parse(stored);
  } catch (e) {}

  missedQueue.push({
    number: entry.number,
    qr: entry.qr,
    rowIndex: entry.rowIndex,
    missedAt: new Date().toISOString()
  });

  scriptProps.setProperty('missedQueue_' + counterName, JSON.stringify(missedQueue));
}

function getMissedQueue(counterName) {
  try {
    const stored = scriptProps.getProperty('missedQueue_' + counterName);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return [];
}

function removeFromMissedQueue(counterName, qr) {
  let missedQueue = getMissedQueue(counterName);
  missedQueue = missedQueue.filter(item => item.qr !== qr);
  scriptProps.setProperty('missedQueue_' + counterName, JSON.stringify(missedQueue));
}

// ============================================
//  ALERT MANAGEMENT
// ============================================

function addRecentAlert(queueNumber, qrCode, counterName, status, logo) {
  let alerts = [];
  try {
    const stored = scriptProps.getProperty('recentAlerts');
    if (stored) alerts = JSON.parse(stored);
  } catch (e) {}

  alerts.unshift({
    number: queueNumber,
    qr: qrCode || '',
    transaction: counterName,
    logo: logo || '',
    status: status || 'serving',
    timestamp: new Date().toISOString()
  });

  if (alerts.length > 10) alerts = alerts.slice(0, 10);

  scriptProps.setProperty('recentAlerts', JSON.stringify(alerts));
}

function getRecentAlerts() {
  try {
    const stored = scriptProps.getProperty('recentAlerts');
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return [];
}

function clearAllAlerts() {
  scriptProps.deleteProperty('recentAlerts');
  return { success: true };
}

function clearAllMissedQueues() {
  const counters = getCounters();
  counters.forEach(c => scriptProps.deleteProperty('missedQueue_' + c.name));
  return { success: true };
}

/**
 * Reset all queue displays (new day)
 */
function resetQueueDisplay() {
  const counters = getCounters();
  counters.forEach(c => {
    scriptProps.deleteProperty('lastCalled_' + c.name);
    scriptProps.deleteProperty('missedQueue_' + c.name);
  });
  scriptProps.deleteProperty('recentAlerts');
  return { success: true, message: 'Queue display reset successfully.' };
}

/**
 * Reset a specific counter
 */
function resetCounterQueue(counterName) {
  scriptProps.deleteProperty('lastCalled_' + counterName);
  scriptProps.deleteProperty('missedQueue_' + counterName);
  return { success: true, message: counterName + ' queue reset.' };
}

// ============================================
//  EVENT STATISTICS
// ============================================

function getEventStats() {
  const ss = getSS();
  const attendanceSheet = ss.getSheetByName(ATTENDANCE_SHEET);

  const todayStr = getTodayDate();
  let todayCount = 0, totalCount = 0;

  if (attendanceSheet && attendanceSheet.getLastRow() > 1) {
    const data = attendanceSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      totalCount++;
      const dateCell = data[i][2];
      if (dateCell) {
        try {
          const dateStr = Utilities.formatDate(new Date(dateCell), Session.getScriptTimeZone(), 'yyyy-MM-dd');
          if (dateStr === todayStr) todayCount++;
        } catch (e) {}
      }
    }
  }

  // Per-agency stats
  const agencies = getAgencies().filter(a => a.enabled);
  const agencyStats = [];

  agencies.forEach(agency => {
    const sheet = ss.getSheetByName(agency.sheetName);
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    const served = lastRow > 1 ? lastRow - 1 : 0;

    agencyStats.push({
      name: agency.agencyName,
      key: agency.agencyKey,
      logo: agency.logoUrl,
      total: served
    });
  });

  return {
    todayAttendance: todayCount,
    totalAttendance: totalCount,
    agencies: agencyStats
  };
}
