 * CONFIG.JS — Application Settings V3.0
 * ============================================
 * ✅ PRODUCTION MODE - No Demo Data
 */

const CONFIG = {
    // ── API URLs ──
    API_URL: 'https://script.google.com/macros/s/AKfycbxmz0gT1rUXChCW42soPQXYtcpmir9reKAhnP9xKCvWii0adGkA7glu0WbQwVaAIisG/exec',
    
    LOGIN_API_URL: 'https://script.google.com/macros/s/AKfycbxmz0gT1rUXChCW42soPQXYtcpmir9reKAhnP9xKCvWii0adGkA7glu0WbQwVaAIisG/exec',

    // ── Performance Settings ──
    REFRESH_INTERVAL: 15000,       // 15 seconds
    REQUEST_TIMEOUT: 12000,         // 12 seconds
    ANIMATION_STAGGER_DELAY: 60,    // 60ms

    // ── ✅ NEW: User Management Settings ──
    USER_MANAGEMENT: {
        defaultRole: 'qc',
        defaultPermission: 'only',
        
        // Roles hierarchy (higher = more access)
        roles: {
            'qc': { 
                level: 1, 
                label: 'QC', 
                color: '#6ee7b7',
                description: 'يرى فريقه فقط'
            },
            'supervisors': { 
                level: 2, 
                label: 'Supervisor', 
                color: '#a5b4fc',
                description: 'يرى كل شيء + breakdown روامه'
            },
            'shift_supervisor': { 
                level: 3, 
                label: 'Shift Supervisor', 
                color: '#fbbf24',
                description: 'يرى الشيفت كامل + breakdown شامل'
            },
            'admin': { 
                level: 4, 
                label: 'Admin', 
                color: '#fb7185',
                description: 'صلاحيات كاملة'
            }
        },
        
        // Permissions
        permissions: {
            'only': { label: 'محدود', access: 'own_team' },
            'all': { label: 'كامل', access: 'everything' }
        }
    },

    // ── Location Groups ──
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

    // ── ✅ NEW: Task Types for Breakdown ──
    TASK_TYPES: [
        { id: 'LIDAR', label: 'LIDAR', icon: 'fa-satellite' },
        { id: 'FP QA', label: 'FP QA', icon: 'fa-check-double' },
        { id: 'Lane Line', label: 'Lane Line', icon: 'fa-road' },
        { id: 'FP', label: 'FP', icon: 'fa-edit' },
        { id: 'QA', label: 'QA', icon: 'fa-clipboard-check' }
    ],

    // ── Status Types (from Attendance Sheet) ──
    STATUS_TYPES: {
        active: ['P', 'TP', 'PT', 'T1', 'T2', 'T3', 'T4', 'T5'],
        absent: ['0', 'E'],
        training: ['T1', 'T2', 'T3', 'T4', 'T5']
    },

    // ── UI Settings ──
    UI: {
        maxCardsPerRow: 3,
        animationDuration: 300,
        debounceDelay: 300,
        toastDuration: 2500
    },

    // ════════════════════════════════════════
    // ❌ REMOVED: DEMO_DATA - No more demo mode!
    // ❌ REMOVED: DEMO_USERS - Users from sheet only!
    // ════════════════════════════════════════
};
