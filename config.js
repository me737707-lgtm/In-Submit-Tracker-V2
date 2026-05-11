/**
 * ============================================
 * CONFIG.JS — Application Settings & Demo Data
 * ============================================
 * Edit this file to change the API URL, refresh
 * interval, location groupings, and demo data.
 */

const CONFIG = {
    // ⚠️ DEFAULT API URL - CHANGE THIS TO YOUR WORKING URL
    API_URL: 'https://script.google.com/macros/s/AKfycbxmz0gT1rUXChCW42soPQXYtcpmir9reKAhnP9xKCvWii0adGkA7glu0WbQwVaAIisG/exec',
    
    // Login Users Sheet API URL (you need to create this endpoint)
    LOGIN_API_URL: 'https://script.google.com/macros/s/AKfycbxmz0gT1rUXChCW42soPQXYtcpmir9reKAhnP9xKCvWii0adGkA7glu0WbQwVaAIisG/exec',

    REFRESH_INTERVAL: 10000,
    REQUEST_TIMEOUT: 15000,
    ANIMATION_STAGGER_DELAY: 80,

    // Location grouping configuration
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

    // Comprehensive demo data for testing
    DEMO_DATA: {
        "M": {
            "NC Unit 106": {
                "Rahma Sayed (M)": {
                    submitted: [
                        { email: "ahmed.mohamed@company.com", pc: "me-C-4-M" },
                        { email: "sara.ali@company.com", pc: "PC-Station-01" },
                        { email: "omar.hassan@company.com", pc: "Workstation-A" }
                    ],
                    notSubmitted: [
                        { email: "fatma.ibrahim@company.com", pc: "me-C-5-N" },
                        { email: "khaled.salem@company.com", pc: "PC-Lab-03" }
                    ]
                },
                "Omnia Mohamed (M)": {
                    submitted: [
                        { email: "nada.fathy@company.com", pc: "PC-Station-05" },
                        { email: "mohsen.ramzy@company.com", pc: "Desk-07" }
                    ],
                    notSubmitted: [
                        { email: "layla.adel@company.com", pc: "me-D-2-O" }
                    ]
                },
                "Sara Atef (M)": {
                    submitted: [
                        { email: "youssef.kamel@company.com", pc: "Terminal-09" }
                    ],
                    notSubmitted: [
                        { email: "rana.mostafa@company.com", pc: "PC-New-01" },
                        { email: "hossam.farid@company.com", pc: "Lab-PC-04" }
                    ]
                },
                "Asmaa Khaled (M)": {
                    submitted: [
                        { email: "user1@company.com", pc: "PC-001" }
                    ],
                    notSubmitted: [
                        { email: "user2@company.com", pc: "PC-002" },
                        { email: "user3@company.com", pc: "PC-003" }
                    ]
                }
            },
            "SF Floor 4 Room 1": {
                "Team Leader Alpha": {
                    submitted: [
                        { email: "ali.abdullah@company.com", pc: "Room1-PC1" },
                        { email: "mona.zaki@company.com", pc: "Room1-PC2" }
                    ],
                    notSubmitted: []
                }
            },
            "SF Floor 4 Room 2": {
                "Team Leader Beta": {
                    submitted: [],
                    notSubmitted: [
                        { email: "tamer.nabil@company.com", pc: "Room2-PC1" }
                    ]
                }
            },
            "SF Floor 4 Room 3": {
                "Team Leader Gamma": {
                    submitted: [
                        { email: "dina.mahmoud@company.com", pc: "Room3-PC1" },
                        { email: "karim.sherif@company.com", pc: "Room3-PC2" },
                        { email: "salma.hassan@company.com", pc: "Room3-PC3" }
                    ],
                    notSubmitted: []
                }
            },
            "NC Unit 108": {
                "Supervisor X": {
                    submitted: [
                        { email: "amr.tawfik@company.com", pc: "Unit108-A" }
                    ],
                    notSubmitted: [
                        { email: "nourhan.khaled@company.com", pc: "Unit108-B" },
                        { email: "ibrahim.fouad@company.com", pc: "Unit108-C" }
                    ]
                }
            }
        },
        "N": {
            "NC Unit 102": {
                "Night Lead A": {
                    submitted: [
                        { email: "night.user1@company.com", pc: "Night-PC1" }
                    ],
                    notSubmitted: [
                        { email: "night.pending1@company.com", pc: "Night-PC2" }
                    ]
                }
            }
        }
    },
    
    // Demo login users for testing
    DEMO_USERS: [
    { username: "Fayez", password: "2468", role: "supervisors", permission: "all" },
    { username: "Asmaa Khaled", password: "123456", role: "Qc", permission: "only" },
    { username: "Wafaa Fathy", password: "123456", role: "Qc", permission: "only" },  
    { username: "Nesma Mustafa", password: "123456", role: "Qc", permission: "only" },
    { username: "Shika", password: "m@1999", role: "supervisors", permission: "all" },
    { username: "3lewa", password: "711711", role: "supervisors", permission: "all" }
    ]
};
