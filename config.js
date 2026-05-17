/**
 * ============================================
 * CONFIG.JS - Production Configuration
 * Enterprise-Grade Settings
 * ============================================
 */

const CONFIG = {
  // API Configuration
  API_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
  
  // Performance Settings
  CACHE_TTL: 30000,              // 30 seconds
  REQUEST_TIMEOUT: 15000,         // 15 seconds
  REFRESH_INTERVAL: 30000,        // 30 seconds auto-refresh
  DEBOUNCE_DELAY: 300,            // 300ms for search
  
  // UI Settings
  ANIMATION_STAGGER_DELAY: 50,    // Faster animations
  VIRTUAL_SCROLL_THRESHOLD: 50,   // Enable virtual scroll for >50 items
  
  // Location Grouping
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
    ],
    'NC Units': [
      'NC Unit 102',
      'NC Unit 106',
      'NC Unit 108'
    ]
  },
  
  // Role Definitions
  ROLES: {
    ADMIN: {
      name: 'Administrator',
      level: 100,
      permissions: ['all']
    },
    SHIFT_SUPERVISOR: {
      name: 'Shift Supervisor',
      level: 75,
      permissions: ['view_shift', 'view_metrics', 'view_breakdown']
    },
    SUPERVISOR: {
      name: 'Supervisor',
      level: 50,
      permissions: ['view_rooms', 'view_submissions']
    },
    QC: {
      name: 'Quality Controller',
      level: 25,
      permissions: ['view_team']
    }
  },
  
  // Shifts
  SHIFTS: ['M', 'N', 'ON'],
  
  // Feature Flags
  FEATURES: {
    ENABLE_AUTO_REFRESH: true,
    ENABLE_OFFLINE_MODE: false,
    ENABLE_ANALYTICS: true,
    ENABLE_NOTIFICATIONS: true
  }
};

// Service Worker Registration (for future PWA support)
if ('serviceWorker' in navigator && CONFIG.FEATURES.ENABLE_OFFLINE_MODE) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silent fail - offline mode is optional
    });
  });
}
