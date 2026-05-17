/**
 * ============================================
 * CONFIG.JS — Production Configuration
 * Enterprise-Grade Settings + Demo Fallback
 * ============================================
 */

const CONFIG = {
  // 🔗 API Configuration
  API_URL: 'https://script.google.com/macros/s/AKfycbxmz0gT1rUXChCW42soPQXYtcpmir9reKAhnP9xKCvWii0adGkA7glu0WbQwVaAIisG/exec',
  
  // 🔐 Login API (مهم جداً للـ Authentication)
  LOGIN_API_URL: 'https://script.google.com/macros/s/AKfycbxmz0gT1rUXChCW42soPQXYtcpmir9reKAhnP9xKCvWii0adGkA7glu0WbQwVaAIisG/exec',
  
  // ⚡ Performance Settings
  CACHE_TTL: 30000,              // 30 seconds client-side cache
  REQUEST_TIMEOUT: 15000,         // 15 seconds fetch timeout
  REFRESH_INTERVAL: 30000,        // 30 seconds auto-refresh
  DEBOUNCE_DELAY: 300,            // 300ms for search input
  
  // 🎨 UI Settings
  ANIMATION_STAGGER_DELAY: 50,    // Faster staggered animations
  VIRTUAL_SCROLL_THRESHOLD: 50,   // Enable virtual scroll for >50 items
  
  // 📍 Location Grouping
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
  
  // 👥 Role Definitions (متوافقة مع الـ script.js)
  // ⚠️ ملاحظة: الـ script.js بيستخدم 'supervisors' و 'Qc' (حروف صغيرة/كبيرة)
  ROLES: {
    admin: {
      name: 'Administrator',
      level: 100,
      permissions: ['all']
    },
    supervisors: {  // ← متوافق مع الـ script.js
      name: 'Supervisor',
      level: 75,
      permissions: ['all', 'view_rooms', 'view_submissions']
    },
    shift_supervisor: {
      name: 'Shift Supervisor',
      level: 80,
      permissions: ['view_shift', 'view_metrics', 'view_breakdown']
    },
    Qc: {  // ← متوافق مع الـ script.js (حرف Q كبير)
      name: 'Quality Controller',
      level: 25,
      permissions: ['only', 'view_team']
    }
  },
  
  // 🔄 Shifts
  SHIFTS: ['M', 'N', 'ON'],
  
  // 🚩 Feature Flags
  FEATURES: {
    ENABLE_AUTO_REFRESH: true,
    ENABLE_OFFLINE_MODE: false,
    ENABLE_ANALYTICS: true,
    ENABLE_NOTIFICATIONS: true
  },
  
  // 🧪 Demo Data Fallback (مهم لو الـ API فشل)
  DEMO_DATA: {
    "M": {
      "NC Unit 106": {
        "Asmaa Khaled (M)": {
          submitted: [
            { email: "ahmed.test@company.com", pc: "PC-101" },
            { email: "sara.demo@company.com", pc: "PC-102" }
          ],
          notSubmitted: [
            { email: "pending.user@company.com", pc: "PC-103" }
          ]
        }
      },
      "SF Floor 4 Room 1": {
        "Team Alpha": {
          submitted: [
            { email: "alpha1@company.com", pc: "SF-R1-01" }
          ],
          notSubmitted: []
        }
      }
    },
    "N": {
      "NC Unit 102": {
        "Night Team": {
          submitted: [],
          notSubmitted: [
            { email: "night.pending@company.com", pc: "N-PC-01" }
          ]
        }
      }
    }
  },
  
  // 👤 Demo Users for Testing Login
  DEMO_USERS: [
    { username: "Fayez", password: "2468", role: "supervisors", permission: "all" },
    { username: "Asmaa Khaled", password: "123456", role: "Qc", permission: "only" },
    { username: "Wafaa Fathy", password: "123456", role: "Qc", permission: "only" },
    { username: "Nesma Mustafa", password: "123456", role: "Qc", permission: "only" },
    { username: "Shika", password: "m@1999", role: "supervisors", permission: "all" },
    { username: "3lewa", password: "711711", role: "supervisors", permission: "all" },
    { username: "admin", password: "admin123", role: "admin", permission: "all" }
  ]
};

// 📱 Service Worker Registration (PWA Support - Optional)
if ('serviceWorker' in navigator && CONFIG.FEATURES.ENABLE_OFFLINE_MODE) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silent fail - offline mode is optional
    });
  });
}
