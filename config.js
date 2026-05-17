/**
 * ============================================
 * CONFIG.JS  v2.0  —  No Demo Mode
 * ============================================
 */

const CONFIG = {

  // ─── API ────────────────────────────────────────────────────
  API_URL: 'https://script.google.com/macros/s/AKfycbxmz0gT1rUXChCW42soPQXYtcpmir9reKAhnP9xKCvWii0adGkA7glu0WbQwVaAIisG/exec',

  // ─── Timing ─────────────────────────────────────────────────
  REFRESH_INTERVAL:       30000,   // 30 s  — dashboard auto-refresh
  REQUEST_TIMEOUT:        15000,   // 15 s  — abort slow requests
  ANIMATION_STAGGER_DELAY: 60,     // ms between card animations

  // ─── Client-side cache TTL (ms) ─────────────────────────────
  CLIENT_CACHE_TTL: 25000,         // 25 s  — matches server cache

  // ─── Roles ───────────────────────────────────────────────────
  // Add / remove users directly in the "Login Users" sheet.
  // Columns:  A=username  B=password  C=role  D=permission
  //
  // role values recognised by the frontend:
  //   supervisors       → sees everything (all shifts, all locations)
  //   shiftSupervisor   → sees own shift only (M / N / ON)
  //   Qc                → sees own team only
  //
  // permission values:
  //   all               → full view for that role
  //   only              → restricted view (Qc default)
  //
  // ⚠️  Do NOT keep passwords here — use the Google Sheet.
  //     The array below is ONLY a reference for the role strings.
  ROLES: {
    SUPERVISOR:       'supervisors',
    SHIFT_SUPERVISOR: 'shiftSupervisor',
    QC:               'Qc'
  },

  // ─── Location Groups ─────────────────────────────────────────
  // Rooms that should be visually grouped under one header
  LOCATION_GROUPS: {
    'Saint Fatima': [
      'SF Floor 4 Room 1',
      'SF Floor 4 Room 2',
      'SF Floor 4 Room 3',
      'SF Floor 4 Room 4',
      'SF Floor 4 Room 6',
      'SF Floor 4 Room 8',
      'SF Floor 4 Room 9',
      'SF Floor 4 Room 12',
      'SF Floor 4 Room 13'
    ]
  },

  // ─── Shift labels ────────────────────────────────────────────
  SHIFT_LABELS: {
    'M':  'Morning',
    'N':  'Night',
    'ON': 'Overnight'
  }

};
