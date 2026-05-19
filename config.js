/* ================================================
   CONFIG.JS  v3.1
   ================================================ */
const CONFIG = {
  // IMPORTANT: Replace this URL with your NEW deployment URL
  // After deploying code.gs, copy the Web App URL here
  API_URL: 'https://script.google.com/macros/s/AKfycbx2CofzmDfo__LoHMhhGJK9gORIDJMp7ygQW5gAfFYPX3VE5yKvx8X2buoPT11SXQkj/exec',

  REFRESH_INTERVAL:        30000,   // 30s auto-refresh
  REQUEST_TIMEOUT:         14000,   // 14s abort
  CLIENT_CACHE_TTL:        24000,   // 24s client cache
  ANIMATION_STAGGER_DELAY: 55,

  ROLES: {
    SUPERVISOR:       'supervisors',
    SHIFT_SUPERVISOR: 'shiftSupervisor',
    QC:               'Qc'
  },

  SHIFT_LABELS: { 'M':'Morning', 'N':'Night', 'ON':'Overnight' },

  // Rooms that appear grouped under one header
  LOCATION_GROUPS: {
    'Saint Fatima': [
      'SF Floor 4 Room 1','SF Floor 4 Room 2','SF Floor 4 Room 3',
      'SF Floor 4 Room 4','SF Floor 4 Room 6','SF Floor 4 Room 8',
      'SF Floor 4 Room 9','SF Floor 4 Room 12','SF Floor 4 Room 13'
    ]
  }
};
