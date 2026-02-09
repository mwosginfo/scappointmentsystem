# Caravan Queue System

A modular Google Apps Script web application for event registration, attendance tracking, and queue management. Built for organizations that manage multi-agency service events with appointment scheduling, walk-in support, and real-time queue displays.

## Features

### 1. Appointment Registration (`?page=appointment`)
- Clients select agencies/services and book appointment time slots
- Configurable appointment dates and slot capacity
- Duplicate prevention by email
- Edit existing appointments via email lookup
- QR code generated for each registration
- Supports multiple agency categories: appointment-based, embassy, multi-select, radio-select

### 2. Email Confirmations
- Automated HTML emails with QR code attachment
- Lists selected agencies and appointment times
- Configurable event banner, reply-to address, and event details

### 3. Staff Attendance / Check-In (`?page=attendance`)
- QR code scanning with auto-processing
- Name search with real-time filtering
- Transaction selection with suggested queue numbers
- Staff can adjust queue numbers before confirming check-in
- Marks attendees as checked-in and appends to per-agency sheets

### 4. Walk-In Self Check-In (`?page=selfcheckin`)
- Admin-toggleable feature (enable/disable from admin page)
- Self-service kiosk interface for walk-in clients
- Immediate queue number assignment
- Continuous registration mode ("Register Next Person" button)

### 5. Queue Calling / Agency Counter (`?page=agency`)
- Counter-based queue system (counters configurable in admin)
- "Served & Call Next" with optional sub-transaction confirmation
- "Missed & Call Next" with priority re-queue for missed numbers
- Prevents calling the same QR code at multiple counters simultaneously
- Real-time alerts panel showing recent calls

### 6. Public Queue Display (`?page=display`)
- Optimized for 1920×1080 screens (TV/projector)
- 30/70 split layout: recent calls on left, queue cards on right
- Auto-refreshes every 5 seconds
- Sound notification on new calls
- Calling animation and missed status highlighting
- Responsive: stacks vertically on smaller screens

### 7. Admin Dashboard (`?page=admin`)
- Agency CRUD: add, edit, enable/disable, delete agencies
- Agency categories: `appointment`, `embassy`, `other`, `other_multi`, `other_radio`
- Appointment date management
- Time slot configuration (start time, end time, interval)
- Walk-in enable/disable toggle
- Counter management for queue system
- Danger zone: reset queues, clear alerts, re-initialize system

### 8. Event Statistics (`?page=stats`)
- Today's check-ins and total attendees
- Per-agency breakdown with logos
- Refresh button for live updates

## File Structure

```
caravan-queue-system/
├── Code.gs              # Main entry point, routing (doGet/doPost)
├── Config.gs            # Configuration CRUD, agency management, system init
├── Appointment.gs       # Registration logic, slot availability, duplicates
├── Email.gs             # Email sending with QR codes
├── Attendance.gs        # Staff check-in workflow
├── SelfCheckIn.gs       # Walk-in registration
├── QueueDisplay.gs      # Queue calling, alerts, sub-transactions
├── admin.html           # System admin dashboard
├── appointment.html     # Client registration page
├── attendance.html      # Staff check-in interface
├── selfcheckin.html     # Walk-in kiosk
├── display.html         # Public queue display (TV/projector)
├── agency.html          # Counter staff interface
└── stats.html           # Event statistics dashboard
```

## Setup

### 1. Create Google Sheet
Create a new Google Spreadsheet. Copy the Sheet ID from the URL:
```
https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
```

### 2. Create Apps Script Project
1. In the Google Sheet, go to **Extensions → Apps Script**
2. Delete any default code

### 3. Add Files
Copy each `.gs` file into the Apps Script editor as a new script file:
- `Code.gs`, `Config.gs`, `Appointment.gs`, `Email.gs`, `Attendance.gs`, `SelfCheckIn.gs`, `QueueDisplay.gs`

Copy each `.html` file into the Apps Script editor as a new HTML file:
- `admin.html`, `appointment.html`, `attendance.html`, `selfcheckin.html`, `display.html`, `agency.html`, `stats.html`

### 4. Configure
Edit the top of `Config.gs` with your settings:

```javascript
const SHEET_ID = 'your-google-sheet-id-here';
const MWO_EMAIL = 'your-reply-to@email.com';
const EVENT_NAME = 'Your Event Name';
const EVENT_LOCATION = 'Event Venue Address';
const EVENT_BANNER_URL = '';   // Optional banner image URL
const MAX_PER_SLOT = 5;       // Max appointments per time slot
```

### 5. Deploy
1. Click **Deploy → New deployment**
2. Select type: **Web app**
3. Set **Execute as**: Me
4. Set **Who has access**: Anyone (or Anyone within your organization)
5. Click **Deploy**
6. Copy the web app URL

### 6. Initialize
1. Open the web app URL with `?page=admin`
2. Or run `initializeSystem()` from the Apps Script editor
3. This creates the required sheets: `_config`, `registration`, `attendance`

### 7. Configure Agencies
From the admin page:
1. Add agencies with their key, name, description, services, logo URL, and category
2. Set appointment dates
3. Configure time slots (start, end, interval)
4. Add counters for the queue system
5. Enable/disable walk-in registration as needed

## Page URLs

All pages are accessed via the deployed web app URL with a `page` query parameter:

| Page | URL | Purpose |
|------|-----|---------|
| Appointment | `?page=appointment` | Client-facing registration |
| Attendance | `?page=attendance` | Staff check-in |
| Self Check-In | `?page=selfcheckin` | Walk-in kiosk |
| Display | `?page=display` | Public queue TV display |
| Agency | `?page=agency` | Counter staff panel |
| Admin | `?page=admin` | System configuration |
| Stats | `?page=stats` | Event statistics |

## Data Structure

### Google Sheets

| Sheet | Purpose |
|-------|---------|
| `_config` | Agency configuration (11 columns) |
| `registration` | Main registration data (20 columns) |
| `attendance` | Check-in log (7 columns) |
| `[AgencyName]` | Per-agency sheets (26 columns, auto-created) |

### Per-Agency Sheet Columns
- **A**: Code/Reference
- **B**: Date
- **C**: Full Name
- **D-G**: Email, Contact, Gender, Employer
- **H**: Confirmed (boolean, for sub-transactions)
- **M-Y**: Sub-transaction headers (optional, add headers in row 1)
- **Z**: Queue Number

### PropertiesService Keys
- `walkInEnabled` — boolean
- `appointmentDates` — JSON array of date strings
- `slotConfig` — JSON object (startTime, endTime, intervalMinutes)
- `counters` — JSON array of counter objects
- `lastCalled_[counterName]` — JSON with current serving info
- `missedQueue_[counterName]` — JSON array of missed queue entries
- `recentAlerts` — JSON array of last 10 alerts

## Customization

### Adding Sub-Transactions
To add sub-transaction tracking for an agency:
1. Open the agency's sheet
2. Add headers in row 1, columns M through Y (e.g., "Document Check", "Payment", "Verification")
3. The agency counter page will automatically detect and show checkboxes for these

### Agency Categories
- `appointment` — Requires date/time slot selection
- `embassy` — Special embassy category
- `other` — Simple checkbox selection
- `other_multi` — Multi-select with sub-options
- `other_radio` — Radio button selection (pick one)

### Styling
Each HTML page is self-contained with inline CSS. Modify colors, fonts, and layouts directly in the HTML files. All pages use Bootstrap 5 for responsive layout.

## Notes

- The system uses Google Apps Script's `PropertiesService` for persistent queue state
- Attendee lists are cached for 5 minutes to improve performance
- Queue numbers are sequential per agency sheet (max value in column Z + 1)
- QR codes are generated using the `api.qrserver.com` API
- The display page plays a notification sound from `soundjay.com`
- All pages include navigation links to related pages

## License

MIT
