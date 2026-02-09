// ============================================
//  CARAVAN QUEUE SYSTEM - Main Entry Point
//  A modular event registration & queue system
// ============================================

/**
 * Web app entry point - routes to appropriate page
 */
function doGet(e) {
  const page = (e.parameter.page || 'appointment').toLowerCase();
  const params = e.parameter;

  // API-style requests (JSON responses)
  if (params.action === 'getSlots' && params.agency && params.date) {
    const slots = getAvailableSlots(params.agency, params.date);
    return jsonResponse(slots);
  }
  if (params.action === 'getConfig') {
    return jsonResponse(getPublicConfig());
  }
  if (params.action === 'lookupEmail' && params.email) {
    return jsonResponse(lookupByEmail(params.email));
  }

  // Page routing
  const pages = {
    appointment: { file: 'appointment', title: 'Event Registration' },
    attendance:  { file: 'attendance',  title: 'Attendance Scanner' },
    selfcheckin: { file: 'selfcheckin', title: 'Walk-In Registration' },
    display:     { file: 'display',     title: 'Queue Display' },
    agency:      { file: 'agency',      title: 'Agency Counter' },
    admin:       { file: 'admin',       title: 'System Admin' },
    stats:       { file: 'stats',       title: 'Event Statistics' }
  };

  const pageInfo = pages[page] || pages.appointment;

  return HtmlService.createTemplateFromFile(pageInfo.file)
    .evaluate()
    .setTitle(pageInfo.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Web app POST handler - form submissions
 */
function doPost(e) {
  const data = e.parameter || {};
  const action = data._action || 'register';

  if (action === 'register') {
    return jsonResponse(processRegistration(data));
  }
  if (action === 'updateRegistration') {
    return jsonResponse(updateRegistration(data));
  }

  return jsonResponse({ error: 'Unknown action' });
}

/**
 * Include HTML partials (for templated HTML)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Return JSON response
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get the web app URL for use in client-side code
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}
