// ============================================
//  EMAIL.gs - Email Confirmation
// ============================================

/**
 * Send a registration confirmation email with QR code
 */
function sendConfirmationEmail(data, reference, qrUrl) {
  const selected = (data.selectedOptions || '').split(',').map(s => s.trim()).filter(Boolean);

  const parseAppointment = (apptStr) => {
    if (!apptStr) return { date: '', time: '' };
    const parts = String(apptStr).split(' ');
    return { date: parts[0] || '', time: parts.slice(1).join(' ') || '' };
  };

  // Build appointment list
  const appointmentList = selected.map(agency => {
    const apptKey = 'appt' + agency;
    const apptStr = data[apptKey];
    const appt = parseAppointment(apptStr);
    let extra = '';
    if (appt.date && appt.time) {
      extra = ` (${appt.date} at ${appt.time})`;
    }
    return `<li style="margin-bottom:6px;">${agency}${extra}</li>`;
  }).join('');

  const bannerHtml = EVENT_BANNER_URL
    ? `<div style="border-bottom:2px dashed #ccc;text-align:center">
         <img src="${EVENT_BANNER_URL}" style="width:100%;display:block" alt="Event Banner">
       </div>`
    : '';

  const htmlBody = `
<div style="max-width:480px;margin:auto;padding:0;border:2px solid #000;border-radius:12px;font-family:Arial;background:#fff;overflow:hidden">
  ${bannerHtml}
  <div style="padding:20px">
    <p>Dear <strong>${data.firstName || ''} ${data.lastName || ''}</strong>,</p>
    <p>Thank you for registering for the <strong>${EVENT_NAME}</strong>!</p>

    <div style="padding:12px;background:#f7f7f7;border-radius:8px;margin-bottom:20px">
      <strong>Reference Code:</strong><br>
      <span style="font-size:20px;letter-spacing:2px">${reference}</span>
    </div>

    <p><strong>Selected Agencies & Appointments:</strong></p>
    <ul style="padding-left:20px">
      ${appointmentList || '<li>No agencies selected</li>'}
    </ul>

    <div style="text-align:center;margin:20px 0">
      <img src="${qrUrl}" style="width:180px;height:180px;border:1px solid #ccc;padding:8px;border-radius:8px" alt="QR Code">
    </div>

    <div style="padding:12px;background:#f7f7f7;border-radius:8px">
      <strong>Event Details:</strong><br>
      ${EVENT_LOCATION}
    </div>

    <p style="margin-top:16px">Please save this email and present your QR code during the event.</p>
    <p style="color:#888;font-size:12px">To edit your registration, visit the registration page and use the "Edit Registration" option with your email address.</p>
  </div>
</div>
`;

  try {
    MailApp.sendEmail({
      to: data.email,
      subject: `Registration Confirmed: ${EVENT_NAME}`,
      htmlBody: htmlBody,
      replyTo: MWO_EMAIL,
    });
    Logger.log('Email sent to: ' + data.email);
  } catch (error) {
    Logger.log('Error sending email: ' + error.toString());
  }
}
