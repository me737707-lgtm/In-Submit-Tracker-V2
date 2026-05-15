const CONFIG = {
    // ⚠️ حط الـ URL الجديد هنا
    API_URL: 'https://script.google.com/macros/s/AKfycbxmz0gT1rUXChCW42soPQXYtcpmir9reKAhnP9xKCvWii0adGkA7glu0WbQwVaAIisG/exec',
    LOGIN_API_URL: 'https://script.google.com/macros/s/AKfycbxmz0gT1rUXChCW42soPQXYtcpmir9reKAhnP9xKCvWii0adGkA7glu0WbQwVaAIisG/exec',

    REFRESH_INTERVAL: 10000,
    REQUEST_TIMEOUT: 15000,
    ANIMATION_STAGGER_DELAY: 80,
    CACHE_DURATION: 300,

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

    ROOMS_CONFIG: {
        '102': { displayName: 'NC Unit 102', type: 'standard' },
        '106': { displayName: 'NC Unit 106', type: 'standard' },
        '108': { displayName: 'NC Unit 108', type: 'standard' },
        'Saint Fatima': { 
            displayName: 'Saint Fatima', 
            type: 'group',
            rooms: [
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
        }
    },

    MODALITY_TYPES: [
        { key: 'LIDAR', label: 'LIDAR', color: '#a5b4fc' },
        { key: 'Lane Line', label: 'Lane Line', color: '#6ee7b7' }
    ],

    PASS_TYPES: [
        { key: 'FP', label: 'First Pass', color: '#6ee7b7' },
        { key: 'QA', label: 'Quality Assurance', color: '#fbbf24' }
    ],

    ROLES: {
        'supervisors': {
            label: 'SUPERVISOR',
            color: '#a5b4fc',
            permissions: {
                viewAll: true,
                viewBreakdown: true,
                exportData: true
            }
        },
        'shift_supervisor': {
            label: 'SHIFT SUPERVISOR',
            color: '#8b5cf6',
            permissions: {
                viewShiftOnly: true,
                viewBreakdown: true,
                viewRoomBreakdown: true,
                viewModalityBreakdown: true,
                exportData: false
            }
        },
        'Qc': {
            label: 'QC',
            color: '#6ee7b7',
            permissions: {
                viewTeamOnly: true,
                viewUserBreakdown: true,
                exportData: false
            }
        }
    },

    DASHBOARD_CARDS: {
        shift_supervisor: [
            { id: 'totalActiveUsers', label: 'Total Active Users', icon: 'fa-users', color: 'indigo', hasBreakdown: true, breakdownType: 'rooms' },
            { id: 'totalSubmitted', label: 'Total Submitted Tasks', icon: 'fa-check-circle', color: 'emerald', hasBreakdown: true, breakdownType: 'modality' },
            { id: 'totalNotSubmitted', label: 'Pending Submissions', icon: 'fa-clock', color: 'crimson', hasBreakdown: true, breakdownType: 'users' },
            { id: 'productivityRate', label: 'Productivity Rate', icon: 'fa-chart-line', color: 'yellow', hasBreakdown: false, isPercentage: true }
        ],
        qc: [
            { id: 'teamSubmitted', label: 'My Team Submitted', icon: 'fa-check-circle', color: 'emerald', hasBreakdown: true, breakdownType: 'users' },
            { id: 'teamPending', label: 'My Team Pending', icon: 'fa-clock', color: 'crimson', hasBreakdown: true, breakdownType: 'users' }
        ],
        supervisors: [
            { id: 'totalActiveUsers', label: 'Total Active Users', icon: 'fa-users', color: 'indigo', hasBreakdown: true, breakdownType: 'locations' },
            { id: 'totalSubmitted', label: 'Total Submitted', icon: 'fa-check-circle', color: 'emerald', hasBreakdown: true, breakdownType: 'rooms' },
            { id: 'totalNotSubmitted', label: 'Total Pending', icon: 'fa-clock', color: 'crimson', hasBreakdown: true, breakdownType: 'rooms' }
        ]
    },

    CACHE_KEYS: {
        shiftBreakdown: (shift, date) => `breakdown_shift_${shift}_${date}`,
        roomBreakdown: (room, date) => `breakdown_room_${room}_${date}`,
        modalityBreakdown: (date) => `breakdown_modality_${date}`,
        userBreakdown: (tlName, date) => `breakdown_user_${tlName}_${date}`
    }
};

function getRoleConfig(roleName) {
    return CONFIG.ROLES[roleName] || {
        label: roleName?.toUpperCase() || 'USER',
        color: '#94a3b8',
        permissions: { viewAll: false, viewBreakdown: false, exportData: false }
    };
}

function hasPermission(user, permission) {
    if (!user || !user.role) return false;
    const roleConfig = getRoleConfig(user.role);
    return roleConfig.permissions[permission] === true;
}

function formatNumber(num) {
    return num?.toString()?.replace(/\B(?=(\d{3})+(?!\d))/g, ",") || "0";
}

function calculatePercentage(part, total) {
    if (!total || total === 0) return 0;
    return Math.round((part / total) * 100);
}

function getLocationDisplayName(location) {
    const roomConfig = CONFIG.ROOMS_CONFIG[location];
    return roomConfig?.displayName || location;
}

function isLocationGroup(location) {
    return CONFIG.ROOMS_CONFIG[location]?.type === 'group';
}

function getGroupRooms(groupName) {
    return CONFIG.ROOMS_CONFIG[groupName]?.rooms || [];
}

function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const BreakdownCache = {
    cache: {},
    set(key, data, duration = CONFIG.CACHE_DURATION) {
        this.cache[key] = { data: data, expiry: Date.now() + (duration * 1000) };
    },
    get(key) {
        const item = this.cache[key];
        if (!item) return null;
        if (Date.now() > item.expiry) {
            delete this.cache[key];
            return null;
        }
        return item.data;
    },
    clear() { this.cache = {}; },
    clearPrefix(prefix) {
        Object.keys(this.cache).forEach(key => {
            if (key.startsWith(prefix)) delete this.cache[key];
        });
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, getRoleConfig, hasPermission, formatNumber, calculatePercentage, getLocationDisplayName, isLocationGroup, getGroupRooms, debounce, BreakdownCache };
}
