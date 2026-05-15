/**
 * ============================================
 * CONFIG.JS — Application Settings
 * ============================================
 * NO DEMO MODE — Production Only
 */

const CONFIG = {
    // API URLs
    API_URL: 'https://script.google.com/macros/s/AKfycbxmz0gT1rUXChCW42soPQXYtcpmir9reKAhnP9xKCvWii0adGkA7glu0WbQwVaAIisG/exec',
    LOGIN_API_URL: 'https://script.google.com/macros/s/AKfycbxmz0gT1rUXChCW42soPQXYtcpmir9reKAhnP9xKCvWii0adGkA7glu0WbQwVaAIisG/exec',

    // Performance Settings
    REFRESH_INTERVAL: 15000,        // 15 seconds (was 10)
    REQUEST_TIMEOUT: 10000,         // 10 seconds (was 15)
    ANIMATION_STAGGER_DELAY: 60,     // Faster animations
    DEBOUNCE_DELAY: 300,            // Search debounce

    // Mobile Optimizations
    MOBILE_ANIMATIONS: false,       // Disable heavy animations on mobile
    LAZY_RENDER_BATCH: 50,          // Render items in batches

    // Location Configuration
    ROOMS: [
        'NC Room 102',
        'NC Room 106', 
        'Saint Fatima',
        'NC Room 108'
    ],

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

    // Task Types for Breakdown
    TASK_TYPES: {
        'LIDAR': {
            label: 'LIDAR',
            color: '#a5b4fc',
            icon: 'fa-cube'
        },
        'Lane Line': {
            label: 'Lane Line',
            color: '#6ee7b7',
            icon: 'fa-road'
        },
        'Other': {
            label: 'Other',
            color: '#fbbf24',
            icon: 'fa-tasks'
        }
    },

    // Status Types
    STATUS_TYPES: {
        'FP': { label: 'First Pass', color: '#6ee7b7', icon: 'fa-check' },
        'QA': { label: 'Quality Assurance', color: '#a5b4fc', icon: 'fa-search' },
        'SUBMITTED': { label: 'Submitted', color: '#fbbf24', icon: 'fa-paper-plane' }
    },

    // Training Types
    TRAINING_TYPES: {
        'T1': { label: 'Training 1', color: '#f472b6' },
        'T2': { label: 'Training 2', color: '#fb923c' },
        'T3': { label: 'Training 3', color: '#a3e635' },
        'T4': { label: 'Training 4', color: '#22d3ee' },
        'T5': { label: 'Training 5', color: '#c084fc' }
    },

    // Shift Mapping
    SHIFTS: {
        'M': { label: 'Morning', icon: 'fa-sun', color: '#fbbf24' },
        'N': { label: 'Night', icon: 'fa-moon', color: '#a5b4fc' },
        'ON': { label: 'Overnight', icon: 'fa-star', color: '#6ee7b7' }
    }
};
