/* ================================================
   CONFIG.JS  v3.0
   ================================================ */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxmz0gT1rUXChCW42soPQXYtcpmir9reKAhnP9xKCvWii0adGkA7glu0WbQwVaAIisG/exec ',

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
