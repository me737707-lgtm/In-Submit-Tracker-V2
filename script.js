/**
 * ============================================
 * SCRIPT.JS — Application Engine
 * ============================================
 * Enhanced with:
 * - Shift Supervisor Role & Breakdowns
 * - Performance Optimization
 * - Real-time Data (No Demo Mode)
 * - Advanced Filtering & Search
 */

/* ---- Application State ---- */
const state = {
    rawData: {},
    filteredData: {},
    breakdownData: {},
    openTeams: new Set(),
    searchTerm: '',
    lastDataHash: '',
    isFirstLoad: true,
    isLoading: false,
    lastError: null,
    customApiUrl: null,
    // Login state
    currentUser: null,
    usersData: [],
    isLoggedIn: false,
    usersRefreshInterval: null,
    // Performance
    lastFetchTime: 0,
    cache: {}
};

/* ---- Cached DOM Elements ---- */
const elements = {};

/* ============================================
   LOGIN FUNCTIONS
   ============================================ */

/**
 * Load users from API (no demo mode)
 */
async function loadLoginUsers(forceRefresh = false) {
    const apiUrl = CONFIG.LOGIN_API_URL + '?action=users';
    
    try {
        console.log('📥 Fetching users from API:', apiUrl);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(apiUrl, {
            signal: controller.signal,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Users fetched successfully:', data);
        
        if (data.success && data.users && data.users.length > 0) {
            state.usersData = data.users;
            console.log(`✅ Loaded ${state.usersData.length} users from sheet:`, 
                       state.usersData.map(u => u.username).join(', '));
            
            state.usersLastUpdate = new Date();
            
        } else {
            console.error('❌ API returned no users - check Login Users sheet');
            showError('No users found in database. Please contact administrator.');
            state.usersData = [];
        }
        
    } catch (error) {
        console.error('❌ Failed to load users from API:', error.message);
        showError('Failed to connect to server. Please check your internet connection.');
        state.usersData = [];
    }
}

/**
 * Handle login submission
 */
function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const loginError = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');
    const loginLoading = document.getElementById('loginLoading');
    
    console.log('🔐 Login attempt for:', username);
    
    // Show loading
    loginBtn.style.display = 'none';
    loginLoading.style.display = 'flex';
    loginError.style.display = 'none';
    
    // Check if users loaded
    if (!state.usersData || state.usersData.length === 0) {
        console.error('❌ No users loaded!');
        loginError.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>No users available. Please check your connection.</span>';
        loginError.style.display = 'flex';
        loginBtn.style.display = 'flex';
        loginLoading.style.display = 'none';
        return;
    }
    
    // Find user (case-insensitive)
    const user = state.usersData.find(u => 
        u.username.toString().toLowerCase() === username.toLowerCase() && 
        u.password.toString() === password
    );
    
    console.log('🔍 Search result:', user ? 'Found' : 'Not found');
    
    if (user) {
        // ✅ Login successful
        state.currentUser = user;
        state.isLoggedIn = true;
        
        // Hide login overlay
        document.getElementById('loginOverlay').style.display = 'none';
        
        // Show user info
        showUserInfo(user);
        
        // Initialize app
        initializeApp();
        
        const roleConfig = getRoleConfig(user.role);
        console.log(`%c✅ Login successful: ${user.username} (${roleConfig.label})`, 
                   `color: ${roleConfig.color}; font-weight: bold; font-size: 14px;`);
    } else {
        // ❌ Login failed
        console.warn('❌ Invalid credentials. Available users:', 
                    state.usersData.map(u => u.username).join(', '));
        
        loginError.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>Invalid username or password</span>';
        loginError.style.display = 'flex';
        loginBtn.style.display = 'flex';
        loginLoading.style.display = 'none';
    }
}

/**
 * Show user info in header
 */
function showUserInfo(user) {
    const userInfo = document.getElementById('userInfo');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userRoleDisplay = document.getElementById('userRoleDisplay');
    
    const roleConfig = getRoleConfig(user.role);
    
    userNameDisplay.textContent = user.username;
    userRoleDisplay.textContent = roleConfig.label;
    userRoleDisplay.className = 'user-role ' + (user.role === 'supervisors' ? 'supervisor' : user.role === 'shift_supervisor' ? 'shift-supervisor' : 'qc');
    userRoleDisplay.style.color = roleConfig.color;
    
    userInfo.style.display = 'flex';
}

/**
 * Handle logout
 */
function handleLogout() {
    state.currentUser = null;
    state.isLoggedIn = false;
    state.rawData = {};
    state.filteredData = {};
    state.breakdownData = {};
    
    // Stop auto-refresh
    if (state.usersRefreshInterval) {
        clearInterval(state.usersRefreshInterval);
        state.usersRefreshInterval = null;
    }
    
    // Clear filters
    if (elements.shiftFilter) elements.shiftFilter.value = 'all';
    if (elements.locFilter) elements.locFilter.value = 'all';
    if (elements.searchInput) elements.searchInput.value = '';
    state.searchTerm = '';
    
    // Hide user info
    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.style.display = 'none';
    
    // Reset login form
    const loginLoading = document.getElementById('loginLoading');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    
    if (loginLoading) loginLoading.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'flex';
    if (loginError) loginError.style.display = 'none';
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    
    // Show login overlay
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) loginOverlay.style.display = 'flex';
    
    // Clear content
    if (elements.contentArea) elements.contentArea.innerHTML = '';
    
    // Clear cache
    if (typeof BreakdownCache !== 'undefined') {
        BreakdownCache.clear();
    }
    
    console.log('%c🚪 User logged out', 'color: #fbbf24; font-weight: bold;');
}

/* ============================================
   INITIALIZATION
   ============================================ */

/**
 * Initialize the application
 */
async function initializeApp() {
    console.log('%c🚀 Submit Tracker v3.0', 'color: #6ee7b7; font-size: 18px; font-weight: bold;');
    console.log('%c⚡ Live Data Mode - No Demo', 'color: #fbbf24; font-size: 12px;');

    // Cache DOM elements
    elements.contentArea = document.getElementById('contentArea');
    elements.shiftFilter = document.getElementById('shiftFilter');
    elements.locFilter = document.getElementById('locFilter');
    elements.datePicker = document.getElementById('datePicker');
    elements.searchInput = document.getElementById('searchInput');
    elements.mainHeader = document.getElementById('mainHeader');
    elements.silentUpdate = document.getElementById('silentUpdate');
    elements.statusIndicator = document.getElementById('statusIndicator');
    elements.statusDot = document.getElementById('statusDot');
    elements.statusText = document.getElementById('statusText');

    // Set default date to today
    elements.datePicker.value = new Date().toISOString().split('T')[0];

    // Set initial status
    updateStatusIndicator('loading');

    // Initial data fetch
    fetchData(true);

    // Auto-refresh every 10 seconds
    setInterval(() => fetchData(false), CONFIG.REFRESH_INTERVAL);

    // Keyboard shortcut: Ctrl/Cmd + K → focus search
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            elements.searchInput.focus();
        }
    });
}

/**
 * Update status indicator
 */
function updateStatusIndicator(status) {
    const { statusIndicator: indicator, statusDot: dot, statusText: text } = elements;

    indicator.className = 'status-indicator ' + status;
    dot.className = 'status-dot ' + status + '-dot';

    const labels = {
        live:    'LIVE - Connected',
        demo:    'DEMO MODE',
        error:   'CONNECTION ERROR',
        loading: 'CONNECTING...'
    };
    text.textContent = labels[status] ?? 'CONNECTING...';
}

/* ============================================
   DATA FETCHING
   ============================================ */

/**
 * Fetch dashboard data from API
 */
async function fetchData(showLoader = false, isManual = false) {
    if (state.isLoading && !isManual) return;

    const apiUrl = state.customApiUrl || CONFIG.API_URL;
    const date = formatDateForAPI(elements.datePicker.value);
    const fetchUrl = `${apiUrl}?date=${date}`;

    console.log(`\n%c📡 Fetching Data...`, 'color: #a5b4fc; font-weight: bold;');
    console.log(`URL: ${fetchUrl}`);

    try {
        state.isLoading = true;
        if (showLoader || isManual) showLoadingState(true);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

        const response = await fetch(fetchUrl, {
            signal: controller.signal,
            mode: 'cors',
            headers: { 'Accept': 'application/json' }
        });

        clearTimeout(timeoutId);

        console.log(`📊 Response Status: ${response.status} ${response.statusText}`);

        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        let json;
        try {
            json = await response.json();
            console.log('✅ JSON Parsed Successfully');
        } catch (parseError) {
            console.error('❌ JSON Parse Failed:', parseError);
            throw new Error('Invalid JSON response');
        }

        const newData = json.data || {};

        if (Object.keys(newData).length === 0) {
            console.warn('⚠️ Empty data received');
            showError('No data available for selected date');
            state.rawData = {};
        } else {
            state.rawData = newData;
            updateStatusIndicator('live');
        }

        // Apply user filter
        state.filteredData = filterDataByUser(state.rawData);

        // Calculate hash for change detection
        const newDataHash = generateDataHash(state.filteredData);

        if (newDataHash !== state.lastDataHash) {
            console.log('🔄 Data changed — updating UI...');
            state.lastDataHash = newDataHash;

            if (state.isFirstLoad || isManual) {
                updateFilters();
                await renderDashboard();
                state.isFirstLoad = false;
                if (showLoader || isManual) showLoadingState(false);
            } else {
                showSilentUpdateNotification();
                smartUpdateUI();
            }
        } else {
            console.log('✋ No changes detected');
            if (showLoader || isManual) showLoadingState(false);
        }

        state.lastError = null;

    } catch (error) {
        console.error('❌ Fetch Error:', error.message);
        state.lastError = error.message;
        updateStatusIndicator('error');
        showError(error.message);
        
        if (showLoader || isManual || state.isFirstLoad) {
            showLoadingState(false);
            state.isFirstLoad = false;
        }

    } finally {
        state.isLoading = false;
    }
}

/**
 * Fetch breakdown data for Shift Supervisor
 */
async function fetchBreakdownData(type, params = {}) {
    const date = formatDateForAPI(elements.datePicker.value);
    const cacheKey = `${type}_${JSON.stringify(params)}_${date}`;
    
    // Check cache first
    if (typeof BreakdownCache !== 'undefined') {
        const cached = BreakdownCache.get(cacheKey);
        if (cached) {
            console.log(`✅ Breakdown loaded from cache: ${type}`);
            return cached;
        }
    }
    
    try {
        const apiUrl = CONFIG.API_URL;
        let url = `${apiUrl}?action=breakdown&date=${date}&type=${type}`;
        
        if (params.shift) url += `&shift=${params.shift}`;
        if (params.room) url += `&room=${params.room}`;
        if (params.tlName) url += `&tlName=${encodeURIComponent(params.tlName)}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        // Cache the result
        if (typeof BreakdownCache !== 'undefined' && data.success) {
            BreakdownCache.set(cacheKey, data.breakdown, CONFIG.CACHE_DURATION);
        }
        
        return data.success ? data.breakdown : null;
        
    } catch (error) {
        console.error(`❌ Failed to fetch breakdown ${type}:`, error);
        return null;
    }
}

/**
 * Manual refresh triggered by date picker
 */
function manualRefresh() {
    console.log('🔄 Manual Refresh triggered...');
    // Clear cache
    if (typeof BreakdownCache !== 'undefined') {
        BreakdownCache.clear();
    }
    fetchData(true, true);
}

/* ============================================
   FILTERING & PERMISSIONS
   ============================================ */

/**
 * Filter data based on user permissions
 */
function filterDataByUser(data) {
    if (!state.currentUser) {
        console.log('🔓 No current user - showing all data');
        return data;
    }
    
    const user = state.currentUser;
    const roleConfig = getRoleConfig(user.role);
    
    console.log('🔐 Filtering data for:', user.username, 'Role:', roleConfig.label);
    
    // Supervisors see everything
    if (user.role === 'supervisors' && user.permission === 'all') {
        console.log('👁️ Supervisor - showing all data');
        return data;
    }
    
    // Shift Supervisor sees only their shift
    if (user.role === 'shift_supervisor') {
        const filteredData = {};
        const userShift = user.username.split(' ')[0]; // Extract shift from username
        
        console.log('👁️ Shift Supervisor - filtering for shift:', userShift);
        
        for (const [shift, locations] of Object.entries(data)) {
            if (shift === userShift) {
                filteredData[shift] = locations;
            }
        }
        
        return filteredData;
    }
    
    // QC sees only their team
    if (user.role === 'Qc' || user.permission === 'only') {
        const filteredData = {};
        const userTeamName = user.username;
        let teamsFound = 0;
        
        console.log('🔍 QC User - looking for team:', userTeamName);
        
        for (const [shift, locations] of Object.entries(data)) {
            filteredData[shift] = {};
            
            for (const [location, teams] of Object.entries(locations)) {
                filteredData[shift][location] = {};
                
                for (const [teamName, teamData] of Object.entries(teams)) {
                    const teamBaseName = teamName.replace(/\s*\([A-Z]{1,3}\)\s*$/, '').trim();
                    
                    if (teamBaseName === userTeamName) {
                        filteredData[shift][location][teamName] = teamData;
                        teamsFound++;
                        console.log(`  ✅ Match found: "${teamName}"`);
                    }
                }
                
                if (Object.keys(filteredData[shift][location]).length === 0) {
                    delete filteredData[shift][location];
                }
            }
            
            if (Object.keys(filteredData[shift]).length === 0) {
                delete filteredData[shift];
            }
        }
        
        console.log(`📊 QC Filter Result: Found ${teamsFound} team(s)`);
        return filteredData;
    }
    
    // Default: show all
    return data;
}

/* ============================================
   RENDERING
   ============================================ */

/**
 * Render the complete dashboard
 */
async function renderDashboard() {
    const selectedShift = elements.shiftFilter.value;
    const selectedLocation = elements.locFilter.value;
    
    console.log('🎨 Rendering Dashboard...', {
        shifts: Object.keys(state.filteredData).length,
        currentUser: state.currentUser?.username,
        userRole: state.currentUser?.role
    });
    
    elements.contentArea.innerHTML = '';
    
    if (Object.keys(state.filteredData).length === 0) {
        elements.contentArea.innerHTML = `
            <div class="empty-state" style="padding: 80px; text-align: center;">
                <i class="fas fa-inbox" style="font-size: 56px; margin-bottom: 20px; opacity: 0.25; display: block;"></i>
                <p style="font-size: 16px;">
                    ${state.currentUser && (state.currentUser.role === 'Qc' || state.currentUser.permission === 'only')
                        ? 'No data found for your team. Please contact your supervisor.' 
                        : 'No data available for selected date.'}
                </p>
            </div>
        `;
        return;
    }
    
    // Render based on user role
    const userRole = state.currentUser?.role;
    
    if (userRole === 'shift_supervisor') {
        await renderShiftSupervisorDashboard(selectedShift);
    } else {
        renderStandardDashboard(selectedShift, selectedLocation);
    }
}

/**
 * Render Shift Supervisor Dashboard with Breakdowns
 */
async function renderShiftSupervisorDashboard(selectedShift) {
    const date = formatDateForAPI(elements.datePicker.value);
    
    // Fetch breakdown data
    const breakdown = await fetchBreakdownData('shift', { shift: selectedShift !== 'all' ? selectedShift : null });
    
    if (!breakdown) {
        console.error('❌ Failed to load breakdown data');
        return;
    }
    
    // Calculate stats
    const totalActive = breakdown.totalActiveUsers || 0;
    const totalSubmitted = breakdown.totalSubmitted || 0;
    const totalNotSubmitted = breakdown.totalNotSubmitted || 0;
    const productivityRate = totalActive > 0 ? Math.round((totalSubmitted / totalActive) * 100) : 0;
    
    // Render hero stats
    const heroStatsHTML = `
        <div class="hero-stats">
            <div class="stat-card total" onclick="showBreakdown('activeUsers')" style="cursor: pointer;">
                <div class="stat-icon"><i class="fas fa-users"></i></div>
                <div class="stat-info">
                    <span class="stat-label">Total Active Users</span>
                    <span class="stat-value">${formatNumber(totalActive)}</span>
                </div>
            </div>
            <div class="stat-card submitted" onclick="showBreakdown('submitted')" style="cursor: pointer;">
                <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                <div class="stat-info">
                    <span class="stat-label">Total Submitted Tasks</span>
                    <span class="stat-value">${formatNumber(totalSubmitted)}</span>
                </div>
            </div>
            <div class="stat-card not-submitted" onclick="showBreakdown('notSubmitted')" style="cursor: pointer;">
                <div class="stat-icon"><i class="fas fa-clock"></i></div>
                <div class="stat-info">
                    <span class="stat-label">Pending Submissions</span>
                    <span class="stat-value">${formatNumber(totalNotSubmitted)}</span>
                </div>
            </div>
            <div class="stat-card productivity">
                <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                <div class="stat-info">
                    <span class="stat-label">Productivity Rate</span>
                    <span class="stat-value">${productivityRate}%</span>
                </div>
            </div>
        </div>
    `;
    
    // Render rooms breakdown
    let roomsHTML = '';
    for (const [roomName, roomData] of Object.entries(breakdown.rooms || {})) {
        const roomSubmitted = roomData.submitted || 0;
        const roomNotSubmitted = roomData.notSubmitted || 0;
        const roomTotal = roomSubmitted + roomNotSubmitted;
        const roomProductivity = roomTotal > 0 ? Math.round((roomSubmitted / roomTotal) * 100) : 0;
        
        roomsHTML += `
            <div class="room-card" onclick="showRoomBreakdown('${roomName}')">
                <div class="room-header">
                    <h3>${getLocationDisplayName(roomName)}</h3>
                    <span class="room-productivity">${roomProductivity}%</span>
                </div>
                <div class="room-stats">
                    <div class="room-stat submitted">
                        <i class="fas fa-check"></i>
                        <span>${roomSubmitted} Submitted</span>
                    </div>
                    <div class="room-stat pending">
                        <i class="fas fa-clock"></i>
                        <span>${roomNotSubmitted} Pending</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Render modality breakdown
    let modalityHTML = '';
    for (const [modalityName, modalityData] of Object.entries(breakdown.modalityBreakdown || {})) {
        const modalityTotal = modalityData.total || 0;
        const modalityFP = modalityData.FP || 0;
        const modalityQA = modalityData.QA || 0;
        
        modalityHTML += `
            <div class="modality-card">
                <h4>${modalityName}</h4>
                <div class="modality-stats">
                    <div class="modality-stat">
                        <span class="label">Total:</span>
                        <span class="value">${modalityTotal}</span>
                    </div>
                    <div class="modality-stat fp">
                        <span class="label">FP:</span>
                        <span class="value">${modalityFP}</span>
                    </div>
                    <div class="modality-stat qa">
                        <span class="label">QA:</span>
                        <span class="value">${modalityQA}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Combine all HTML
    elements.contentArea.innerHTML = `
        <div class="shift-supervisor-dashboard">
            ${heroStatsHTML}
            
            <div class="breakdown-section">
                <h2><i class="fas fa-building"></i> Rooms Breakdown</h2>
                <div class="rooms-grid">
                    ${roomsHTML}
                </div>
            </div>
            
            <div class="breakdown-section">
                <h2><i class="fas fa-layer-group"></i> Modality Breakdown</h2>
                <div class="modality-grid">
                    ${modalityHTML}
                </div>
            </div>
        </div>
    `;
}

/**
 * Render Standard Dashboard (Supervisors & QCs)
 */
function renderStandardDashboard(selectedShift, selectedLocation) {
    const isGroupView = selectedLocation !== 'all' && CONFIG.LOCATION_GROUPS.hasOwnProperty(selectedLocation);
    let globalAnimationIndex = 0;
    
    for (const [shift, locations] of Object.entries(state.filteredData)) {
        if (selectedShift !== 'all' && shift !== selectedShift) continue;
        
        const shiftWrapper = document.createElement('div');
        shiftWrapper.innerHTML = `<div class="shift-tag"><i class="fas fa-clock"></i> Shift: ${shift}</div>`;
        
        if (isGroupView) {
            const groupSection = createGroupedLocationSection(selectedLocation, shift, locations, globalAnimationIndex);
            if (groupSection) shiftWrapper.appendChild(groupSection);
        } else {
            const renderedLocations = new Set();
            
            // First pass: render location groups
            Object.keys(CONFIG.LOCATION_GROUPS).forEach(groupName => {
                if (selectedLocation !== 'all' && selectedLocation !== groupName) return;
                
                const groupMembers = CONFIG.LOCATION_GROUPS[groupName];
                const availableMembers = groupMembers.filter(loc => locations.hasOwnProperty(loc));
                
                if (availableMembers.length > 0) {
                    globalAnimationIndex++;
                    const groupSection = createGroupedLocationSection(groupName, shift, locations, globalAnimationIndex, availableMembers);
                    shiftWrapper.appendChild(groupSection);
                    availableMembers.forEach(loc => renderedLocations.add(loc));
                }
            });
            
            // Second pass: render standalone locations
            for (const [locName, teams] of Object.entries(locations)) {
                if (selectedLocation !== 'all' && locName !== selectedLocation) continue;
                if (renderedLocations.has(locName)) continue;
                
                globalAnimationIndex++;
                const locationSection = createLocationSection(locName, teams, shift, globalAnimationIndex * CONFIG.ANIMATION_STAGGER_DELAY);
                shiftWrapper.appendChild(locationSection);
            }
        }
        
        elements.contentArea.appendChild(shiftWrapper);
    }
}

/**
 * Create grouped location section
 */
function createGroupedLocationSection(groupName, shift, allLocations, delayIndex, specificRooms = null) {
    const roomsToRender = specificRooms || getGroupLocations(groupName);
    const availableRooms = roomsToRender.filter(room => allLocations.hasOwnProperty(room));
    
    if (availableRooms.length === 0) return null;
    
    const section = document.createElement('div');
    section.className = 'location-section';
    section.style.animationDelay = `${delayIndex * CONFIG.ANIMATION_STAGGER_DELAY}ms`;
    
    let totalSubmitted = 0, totalNotSubmitted = 0, roomData = {};
    
    availableRooms.forEach(roomName => {
        const teams = allLocations[roomName];
        roomData[roomName] = teams;
        Object.values(teams).forEach(team => {
            totalSubmitted += team.submitted.length;
            totalNotSubmitted += team.notSubmitted.length;
        });
    });
    
    const total = totalSubmitted + totalNotSubmitted;
    const percentage = total > 0 ? Math.round((totalSubmitted / total) * 100) : 0;
    
    let roomsHTML = '';
    availableRooms.forEach((roomName, idx) => {
        roomsHTML += `
            <div class="room-subsection" style="animation: sectionAppear 0.5s ease ${(delayIndex * CONFIG.ANIMATION_STAGGER_DELAY) + ((idx + 1) * 100)}ms backwards;">
                <div class="room-title"><i class="fas fa-door-open"></i> ${roomName}</div>
                ${createTeamsGridHTML(roomData[roomName], shift, roomName, idx)}
            </div>
        `;
    });
    
    section.innerHTML = `
        <div class="location-title">
            <div class="location-icon"><i class="fas fa-building"></i></div>
            ${groupName}
            <span style="font-size: 14px; color: var(--text-muted); font-weight: 600;">(${availableRooms.length} rooms)</span>
        </div>
        ${createHeroStatsHTML({ submitted: totalSubmitted, notSubmitted: totalNotSubmitted, total, percentage })}
        <div class="room-group">${roomsHTML}</div>
    `;
    
    return section;
}

/**
 * Create individual location section
 */
function createLocationSection(locName, teams, shift, delay) {
    const section = document.createElement('div');
    section.className = 'location-section';
    section.style.animationDelay = `${delay}ms`;
    
    const stats = calculateLocationStats(teams);
    
    section.innerHTML = `
        <div class="location-title">
            <div class="location-icon"><i class="fas fa-map-marker-alt"></i></div>
            ${locName}
        </div>
        ${createHeroStatsHTML(stats)}
        ${createTeamsGridHTML(teams, shift, locName)}
    `;
    
    return section;
}

/**
 * Calculate location stats
 */
function calculateLocationStats(teams) {
    let totalSubmitted = 0, totalNotSubmitted = 0;
    Object.values(teams).forEach(team => {
        totalSubmitted += team.submitted.length;
        totalNotSubmitted += team.notSubmitted.length;
    });
    const total = totalSubmitted + totalNotSubmitted;
    return {
        submitted: totalSubmitted,
        notSubmitted: totalNotSubmitted,
        total,
        percentage: total > 0 ? Math.round((totalSubmitted / total) * 100) : 0
    };
}

/**
 * Create hero stats HTML
 */
function createHeroStatsHTML(stats) {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (stats.percentage / 100) * circumference;
    
    return `
        <div class="hero-stats">
            <div class="stat-card submitted" style="animation-delay: 0.1s;">
                <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                <div class="stat-info">
                    <span class="stat-label">Submitted</span>
                    <span class="stat-value">${stats.submitted}</span>
                </div>
            </div>
            <div class="stat-card not-submitted" style="animation-delay: 0.2s;">
                <div class="stat-icon"><i class="fas fa-exclamation-circle"></i></div>
                <div class="stat-info">
                    <span class="stat-label">Pending</span>
                    <span class="stat-value">${stats.notSubmitted}</span>
                </div>
            </div>
            <div class="stat-card total" style="animation-delay: 0.3s;">
                <div class="stat-icon"><i class="fas fa-users"></i></div>
                <div class="stat-info">
                    <span class="stat-label">Total Users</span>
                    <span class="stat-value">${stats.total}</span>
                </div>
            </div>
            <div class="progress-ring-container" style="animation-delay: 0.4s;">
                <div class="ring-wrapper">
                    <svg class="progress-ring-svg" viewBox="0 0 120 120">
                        <circle class="ring-bg" cx="60" cy="60" r="${radius}"/>
                        <circle class="ring-progress" cx="60" cy="60" r="${radius}"
                                style="stroke-dashoffset: ${dashOffset};"/>
                    </svg>
                    <div class="ring-center">
                        <div class="ring-percentage">${stats.percentage}%</div>
                        <div class="ring-label">Complete</div>
                    </div>
                </div>
                <div class="ring-details">
                    <div class="detail-row"><span class="detail-dot done"></span><span>${stats.submitted} Completed</span></div>
                    <div class="detail-row"><span class="detail-dot pending"></span><span>${stats.notSubmitted} Remaining</span></div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Create teams grid HTML
 */
function createTeamsGridHTML(teams, shift, locName, roomIndex = 0) {
    let teamsHTML = '<div class="teams-grid">';
    let cardIndex = 0;
    
    for (const [tlName, teamData] of Object.entries(teams)) {
        const tlID = generateCardID(shift, locName, tlName);
        const isActive = state.openTeams.has(tlID) ? 'active' : '';
        
        const filteredNotSubmitted = teamData.notSubmitted.filter(u => matchesSearch(u.email, u.pc));
        const filteredSubmitted = teamData.submitted.filter(u => matchesSearch(u.email, u.pc));
        
        if (state.searchTerm && filteredNotSubmitted.length === 0 && filteredSubmitted.length === 0) continue;
        
        cardIndex++;
        const baseDelay = (roomIndex + 1) * 60 + cardIndex * 60;
        
        teamsHTML += `
            <div class="team-card ${isActive}" id="${tlID}" style="animation-delay: ${baseDelay}ms;">
                <div class="team-header" onclick="toggleTeam('${tlID}')">
                    <div class="tl-info">
                        <span class="team-name"><i class="fas fa-user-tie"></i> ${tlName}</span>
                        <div class="tl-badge-container">
                            <span class="badge badge-done"><span class="badge-dot"></span>Done: ${filteredSubmitted.length}</span>
                            <span class="badge badge-not"><span class="badge-dot"></span>Pending: ${filteredNotSubmitted.length}</span>
                        </div>
                    </div>
                    <div class="chevron-icon"><i class="fas fa-chevron-down"></i></div>
                </div>
                <div class="team-content">
                    <div class="content-inner">
                        <div class="split-view">
                            <div class="column">
                                <div class="col-title not-submit">
                                    <i class="fas fa-clock"></i>Pending
                                    <span class="col-count">${filteredNotSubmitted.length}</span>
                                </div>
                                ${filteredNotSubmitted.length > 0
            ? filteredNotSubmitted.map((u, idx) => createUserBoxHTML(u, 'not-sub', idx)).join('')
            : '<div class="empty-state">No pending users</div>'}
                            </div>
                            <div class="column">
                                <div class="col-title submit">
                                    <i class="fas fa-check-double"></i>Submitted
                                    <span class="col-count">${filteredSubmitted.length}</span>
                                </div>
                                ${filteredSubmitted.length > 0
            ? filteredSubmitted.map((u, idx) => createUserBoxHTML(u, 'sub', idx)).join('')
            : '<div class="empty-state">No submissions yet</div>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    teamsHTML += '</div>';
    return teamsHTML;
}

/**
 * Create user box HTML
 */
function createUserBoxHTML(user, type, index) {
    return `
        <div class="user-box ${type}-box" style="animation-delay: ${index * 40}ms;">
            <span class="u-email">${escapeHTML(user.email)}</span>
            <span class="u-meta"><i class="fas fa-desktop"></i>PC: ${escapeHTML(user.pc)}</span>
        </div>
    `;
}

/* ============================================
   BREAKDOWN MODALS
   ============================================ */

/**
 * Show breakdown modal
 */
async function showBreakdown(type) {
    const modal = document.getElementById('breakdownModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');
    
    modal.style.display = 'flex';
    
    let title = '';
    let content = '';
    
    switch(type) {
        case 'activeUsers':
            title = 'Total Active Users Breakdown';
            content = await generateActiveUsersBreakdown();
            break;
        case 'submitted':
            title = 'Submitted Tasks Breakdown';
            content = await generateSubmittedBreakdown();
            break;
        case 'notSubmitted':
            title = 'Pending Submissions';
            content = await generateNotSubmittedBreakdown();
            break;
    }
    
    modalTitle.textContent = title;
    modalContent.innerHTML = content;
}

/**
 * Show room breakdown
 */
async function showRoomBreakdown(roomName) {
    const modal = document.getElementById('breakdownModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');
    
    modal.style.display = 'flex';
    modalTitle.textContent = `Room Breakdown: ${getLocationDisplayName(roomName)}`;
    
    const breakdown = await fetchBreakdownData('room', { room: roomName });
    
    if (breakdown) {
        modalContent.innerHTML = generateRoomBreakdownHTML(roomName, breakdown);
    } else {
        modalContent.innerHTML = '<p class="error">Failed to load room breakdown</p>';
    }
}

/**
 * Close breakdown modal
 */
function closeBreakdownModal() {
    const modal = document.getElementById('breakdownModal');
    modal.style.display = 'none';
}

/* ============================================
   UTILITY FUNCTIONS
   ============================================ */

function formatDateForAPI(dateString) {
    return dateString.split('-').reverse().join('-');
}

function generateDataHash(data) {
    let hash = '';
    Object.keys(data).forEach(shift => {
        Object.keys(data[shift]).forEach(loc => {
            Object.values(data[shift][loc]).forEach(team => {
                hash += `${team.submitted.length}-${team.notSubmitted.length}`;
            });
        });
    });
    return hash;
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function generateCardID(shift, locName, tlName) {
    return `card-${shift}-${locName}-${tlName}`.replace(/\s+/g, '-');
}

function updateFilters() {
    const shifts = new Set();
    const locations = new Set();
    
    const dataToUse = state.filteredData && Object.keys(state.filteredData).length > 0 
        ? state.filteredData 
        : state.rawData;
    
    Object.keys(dataToUse).forEach(shift => {
        shifts.add(shift);
        Object.keys(dataToUse[shift]).forEach(loc => locations.add(loc));
    });
    
    Object.keys(CONFIG.LOCATION_GROUPS).forEach(groupName => locations.add(groupName));
    
    const currentShift = elements.shiftFilter.value;
    const currentLoc = elements.locFilter.value;
    
    elements.shiftFilter.innerHTML = '<option value="all">All Shifts</option>';
    Array.from(shifts).sort().forEach(shift => {
        const opt = document.createElement('option');
        opt.value = shift;
        opt.textContent = `Shift: ${shift}`;
        if (shift === currentShift) opt.selected = true;
        elements.shiftFilter.appendChild(opt);
    });
    
    elements.locFilter.innerHTML = '<option value="all">All Locations</option>';
    
    Object.keys(CONFIG.LOCATION_GROUPS).sort().forEach(groupName => {
        const opt = document.createElement('option');
        opt.value = groupName;
        opt.textContent = `📍 ${groupName}`;
        opt.style.fontWeight = 'bold';
        if (groupName === currentLoc) opt.selected = true;
        elements.locFilter.appendChild(opt);
    });
    
    const groupedLocs = new Set(Object.values(CONFIG.LOCATION_GROUPS).flat());
    Array.from(locations).filter(loc =>
        !groupedLocs.has(loc) && !Object.keys(CONFIG.LOCATION_GROUPS).includes(loc)
    ).sort().forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc;
        opt.textContent = loc;
        if (loc === currentLoc) opt.selected = true;
        elements.locFilter.appendChild(opt);
    });
}

function getGroupLocations(groupName) {
    return CONFIG.LOCATION_GROUPS[groupName] || [];
}

function handleSearch() {
    state.searchTerm = elements.searchInput.value.toLowerCase().trim();
    renderDashboard();
}

function matchesSearch(email, pc) {
    if (!state.searchTerm) return true;
    return (
        email.toLowerCase().includes(state.searchTerm) ||
        String(pc).toLowerCase().includes(state.searchTerm)
    );
}

function toggleTeam(tlID) {
    const card = document.getElementById(tlID);
    if (!card) return;
    
    if (card.classList.contains('active')) {
        card.classList.remove('active');
        state.openTeams.delete(tlID);
    } else {
        card.classList.add('active');
        state.openTeams.add(tlID);
    }
}

function showLoadingState(show) {
    if (!show) return;
    elements.contentArea.innerHTML = `
        <div id="loader">
            <div class="loader-spinner">
                <div class="spinner-ring"></div>
                <div class="loader-text">
                    Connecting to server<span class="loader-dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
            </div>
        </div>
    `;
}

function showError(message) {
    elements.contentArea.innerHTML = `
        <div class="error-state">
            <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
            <h2>Error</h2>
            <p>${message}</p>
            <button class="btn btn-primary" onclick="manualRefresh()">
                <i class="fas fa-redo"></i> Try Again
            </button>
        </div>
    `;
}

function showSilentUpdateNotification() {
    if (!elements.silentUpdate) return;
    elements.silentUpdate.classList.add('show');
    setTimeout(() => elements.silentUpdate.classList.remove('show'), 2500);
}

function smartUpdateUI() {
    document.querySelectorAll('.stat-value').forEach(el => {
        el.style.transform = 'scale(1.1)';
        setTimeout(() => (el.style.transform = 'scale(1)'), 200);
    });
    document.querySelectorAll('.ring-progress').forEach(el => {
        el.style.filter = 'drop-shadow(0 0 15px var(--accent-emerald-glow))';
        setTimeout(() => (el.style.filter = 'drop-shadow(0 0 10px var(--accent-emerald-glow))'), 500);
    });
}

function formatNumber(num) {
    return num?.toString()?.replace(/\B(?=(\d{3})+(?!\d))/g, ",") || "0";
}

/* ============================================
   BOOT
   ============================================ */
window.addEventListener('DOMContentLoaded', () => {
    loadLoginUsers();
});

// Close modal on outside click
window.onclick = function(event) {
    const modal = document.getElementById('breakdownModal');
    if (event.target === modal) {
        closeBreakdownModal();
    }
}
