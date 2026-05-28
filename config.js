/* ================================================
   CONFIG.JS  v4.0  —  Optimized Configuration
   ================================================ */
const CONFIG = {
  // IMPORTANT: Replace this URL with your NEW deployment URL
  // After deploying code.gs, copy the Web App URL here
  API_URL: 'https://script.google.com/macros/s/AKfycbx2CofzmDfo__LoHMhhGJK9gORIDJMp7ygQW5gAfFYPX3VE5yKvx8X2buoPT11SXQkj/exec',

  REFRESH_INTERVAL:        30000,   // 30s auto-refresh
  REQUEST_TIMEOUT:         20000,   // 20s abort (increased for large data)
  CLIENT_CACHE_TTL:        30000,   // 30s client cache (optimized)
  ANIMATION_STAGGER_DELAY: 55,

  ROLES: {
    SUPERVISOR:       'supervisor',        // normalized lowercase
    SHIFT_SUPERVISOR: 'shiftsupervisor',   // normalized lowercase (no spaces)
    QC:               'qc'                 // normalized lowercase
  },

  SHIFT_LABELS: { 'M':'Morning', 'N':'Night', 'ON':'Overnight' },

  // For display purposes - maps raw shift values to normalized
  SHIFT_NORMALIZE: {
    'morning': 'M',
    'night': 'N', 
    'overnight': 'ON',
    'over night': 'ON',
    'over night 12 h': 'ON',
    'night 12 h': 'N'
  },

  // Locations that appear as individual sections (not grouped)
  SUPERVISOR_LOCATIONS: {
    '106': '106',
    '102': '102', 
    '108': '108',
    'Saint Fatima': 'Saint Fatima'
  },

  // Rooms that appear grouped under one header
  LOCATION_GROUPS: {
    'Saint Fatima': [
      'SF Floor 4 Room 1','SF Floor 4 Room 2','SF Floor 4 Room 3',
      'SF Floor 4 Room 4','SF Floor 4 Room 6','SF Floor 4 Room 8',
      'SF Floor 4 Room 9','SF Floor 4 Room 12','SF Floor 4 Room 13'
    ]
  }
};
