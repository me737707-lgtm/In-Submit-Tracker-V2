/**
 * ============================================
 * SCRIPT.JS — Application Engine
 * ============================================
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
    currentUser: null,
    usersData: [],
    isLoggedIn: false,
    usersRefreshInterval: null,
    lastFetchTime: 0,
    cache: {}
};

/* ---- Cached DOM Elements ---- */
const elements = {};

/* ============================================
   LOGIN FUNCTIONS
   ============================================ */

/**
 * Load users from API using JSONP
 */
function loadLoginUsers(forceRefresh = false) {
    console.log('📥 Fetching users from API...');
    
    const callbackName = 'usersCallback_' + Date.now();
    const apiUrl = CONFIG.LOGIN_API_URL + '?action=users&callback=' + callbackName;
    
    window[callbackName] = function(data) {
        console.log('✅ Users response:', data);
        
        if (data && data.success && data.users && data.users.length > 0) {
            state.usersData = data.users;
            console.log('✅ Loaded ' + state.usersData.length + ' users');
        } else {
            console.error('❌ No users in response');
            state.usersData = [];
        }
        
        delete window[callbackName];
    };
    
    const script = document.createElement('script');
    script.src = apiUrl;
    script.onerror = function() {
        console.error('❌ Failed to load users script');
        state.usersData = [];
        delete window[callbackName];
    };
    
    document.body.appendChild(script);
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
    
    loginBtn.style.display = 'none';
    loginLoading.style.display = 'flex';
    loginError.style.display = 'none';
    
    if (!state.usersData || state.usersData.length === 0) {
        console.error('❌ No users loaded!');
        loginError.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>No users available. Please check your connection.</span>';
        loginError.style.display = 'flex';
        loginBtn.style.display = 'flex';
        loginLoading.style.display = 'none';
        return;
    }
    
    const user = state.usersData.find(u => 
        u.username.toString().toLowerCase() === username.toLowerCase() && 
        u.password.toString() === password
    );
    
    console.log('🔍 Search result:', user ? 'Found' : 'Not found');
    
    if (user) {
        state.currentUser = user;
        state.isLoggedIn = true;
        
        document.getElementById('loginOverlay').style.display = 'none';
        showUserInfo(user);
        initializeApp();
        
        const roleConfig = getRoleConfig(user.role);
        console.log('%c✅ Login successful: ' + user.username + ' (' + roleConfig.label + ')', 
                   'color: ' + roleConfig.color + '; font-weight: bold; font-size: 14px;');
    } else {
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
    
    if (state.usersRefreshInterval) {
        clearInterval(state.usersRefreshInterval);
        state.usersRefreshInterval = null;
    }
    
    if (elements.shiftFilter) elements.shiftFilter.value = 'all';
    if (elements.locFilter) elements.locFilter.value = 'all';
    if (elements.searchInput) elements.searchInput.value = '';
    state.searchTerm = '';
    
    const userInfo = document.getElementById('userInfo');
    if (userInfo) userInfo.style.display = 'none';
    
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
    
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) loginOverlay.style.display = 'flex';
    
    if (elements.contentArea) elements.contentArea.innerHTML = '';
    
    if (typeof BreakdownCache !== 'undefined') {
        BreakdownCache.clear();
    }
    
    console.log('%c🚪 User logged out', 'color: #fbbf24; font-weight: bold;');
}

/* ============================================
   INITIALIZATION
   ============================================ */

async function initializeApp() {
    console.log('%c🚀 Submit Tracker v3.0', 'color: #6ee7b7; font-size: 18px; font-weight: bold;');
    console.log('%c⚡ Live Data Mode - No Demo', 'color: #fbbf24; font-size: 12px;');

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

    elements.datePicker.value = new Date().toISOString().split('T')[0];

    updateStatusIndicator('loading');

    fetchData(true);

    setInterval(function() { fetchData(false); }, CONFIG.REFRESH_INTERVAL);

    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            elements.searchInput.focus();
        }
    });
}

function updateStatusIndicator(status) {
    const indicator = elements.statusIndicator;
    const dot = elements.statusDot;
    const text = elements.statusText;

    indicator.className = 'status-indicator ' + status;
    dot.className = 'status-dot ' + status + '-dot';

    const labels = {
        live:    'LIVE - Connected',
        demo:    'DEMO MODE',
        error:   'CONNECTION ERROR',
        loading: 'CONNECTING...'
    };
    text.textContent = labels[status] || 'CONNECTING...';
}

/* ============================================
   DATA FETCHING
   ============================================ */

async function fetchData(showLoader, isManual) {
    if (state.isLoading && !isManual) return;

    const apiUrl = state.customApiUrl || CONFIG.API_URL;
    const date = formatDateForAPI(elements.datePicker.value);
    const fetchUrl = apiUrl + '?date=' + date;

    console.log('\n%c📡 Fetching Data...', 'color: #a5b4fc; font-weight: bold;');
    console.log('URL: ' + fetchUrl);

    try {
        state.isLoading = true;
        if (showLoader || isManual) showLoadingState(true);

        const controller = new AbortController();
        const timeoutId = setTimeout(function() { controller.abort(); }, CONFIG.REQUEST_TIMEOUT);

        const response = await fetch(fetchUrl, {
            signal: controller.signal,
            mode: 'cors',
            headers: { 'Accept': 'application/json' }
        });

        clearTimeout(timeoutId);

        console.log('📊 Response Status: ' + response.status + ' ' + response.statusText);

        if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + response.statusText);

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

        state.filteredData = filterDataByUser(state.rawData);

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

async function fetchBreakdownData(type, params) {
    params = params || {};
    const date = formatDateForAPI(elements.datePicker.value);
    const cacheKey = type + '_' + JSON.stringify(params) + '_' + date;
    
    if (typeof BreakdownCache !== 'undefined') {
        const cached = BreakdownCache.get(cacheKey);
        if (cached) {
            console.log('✅ Breakdown loaded from cache: ' + type);
            return cached;
        }
    }
    
    try {
        const apiUrl = CONFIG.API_URL;
        let url = apiUrl + '?action=breakdown&date=' + date + '&type=' + type;
        
        if (params.shift) url += '&shift=' + params.shift;
        if (params.room) url += '&room=' + params.room;
        if (params.tlName) url += '&tlName=' + encodeURIComponent(params.tlName);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error('HTTP ' + response.status);
        
        const data = await response.json();
        
        if (typeof BreakdownCache !== 'undefined' && data.success) {
            BreakdownCache.set(cacheKey, data.breakdown, CONFIG.CACHE_DURATION);
        }
        
        return data.success ? data.breakdown : null;
        
    } catch (error) {
        console.error('❌ Failed to fetch breakdown ' + type + ':', error);
        return null;
    }
}

function manualRefresh() {
    console.log('🔄 Manual Refresh triggered...');
    if (typeof BreakdownCache !== 'undefined') {
        BreakdownCache.clear();
    }
    fetchData(true, true);
}

/* ============================================
   FILTERING & PERMISSIONS
   ============================================ */

function filterDataByUser(data) {
    if (!state.currentUser) {
        console.log('🔓 No current user - showing all data');
        return data;
    }
    
    const user = state.currentUser;
    const roleConfig = getRoleConfig(user.role);
    
    console.log('🔐 Filtering data for:', user.username, 'Role:', roleConfig.label);
    
    if (user.role === 'supervisors' && user.permission === 'all') {
        console.log('👁️ Supervisor - showing all data');
        return data;
    }
    
    if (user.role === 'shift_supervisor') {
        const filteredData = {};
        const userShift = user.username.split(' ')[0];
        
        console.log('👁️ Shift Supervisor - filtering for shift:', userShift);
        
        for (const shift in data) {
            if (shift === userShift) {
                filteredData[shift] = data[shift];
            }
        }
        
        return filteredData;
    }
    
    if (user.role === 'Qc' || user.permission === 'only') {
        const filteredData = {};
        const userTeamName = user.username;
        let teamsFound = 0;
        
        console.log('🔍 QC User - looking for team:', userTeamName);
        
        for (const shift in data) {
            filteredData[shift] = {};
            
            for (const location in data[shift]) {
                filteredData[shift][location] = {};
                
                for (const teamName in data[shift][location]) {
                    const teamBaseName = teamName.replace(/\s*\([A-Z]{1,3}\)\s*$/, '').trim();
                    
                    if (teamBaseName === userTeamName) {
                        filteredData[shift][location][teamName] = data[shift][location][teamName];
                        teamsFound++;
                        console.log('  ✅ Match found: "' + teamName + '"');
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
        
        console.log('📊 QC Filter Result: Found ' + teamsFound + ' team(s)');
        return filteredData;
    }
    
    return data;
}

/* ============================================
   RENDERING
   ============================================ */

async function renderDashboard() {
    const selectedShift = elements.shiftFilter.value;
    const selectedLocation = elements.locFilter.value;
    
    console.log('🎨 Rendering Dashboard...', {
        shifts: Object.keys(state.filteredData).length,
        currentUser: state.currentUser ? state.currentUser.username : null,
        userRole: state.currentUser ? state.currentUser.role : null
    });
    
    elements.contentArea.innerHTML = '';
    
    if (Object.keys(state.filteredData).length === 0) {
        elements.contentArea.innerHTML = '<div class="empty-state" style="padding: 80px; text-align: center;"><i class="fas fa-inbox" style="font-size: 56px; margin-bottom: 20px; opacity: 0.25; display: block;"></i><p style="font-size: 16px;">' + (state.currentUser && (state.currentUser.role === 'Qc' || state.currentUser.permission === 'only') ? 'No data found for your team. Please contact your supervisor.' : 'No data available for selected date.') + '</p></div>';
        return;
    }
    
    const userRole = state.currentUser ? state.currentUser.role : null;
    
    if (userRole === 'shift_supervisor') {
        await renderShiftSupervisorDashboard(selectedShift);
    } else {
        renderStandardDashboard(selectedShift, selectedLocation);
    }
}

async function renderShiftSupervisorDashboard(selectedShift) {
    const date = formatDateForAPI(elements.datePicker.value);
    
    const breakdown = await fetchBreakdownData('shift', { shift: selectedShift !== 'all' ? selectedShift : null });
    
    if (!breakdown) {
        console.error('❌ Failed to load breakdown data');
        return;
    }
    
    const totalActive = breakdown.totalActiveUsers || 0;
    const totalSubmitted = breakdown.totalSubmitted || 0;
    const totalNotSubmitted = breakdown.totalNotSubmitted || 0;
    const productivityRate = totalActive > 0 ? Math.round((totalSubmitted / totalActive) * 100) : 0;
    
    const heroStatsHTML = '<div class="hero-stats">' +
        '<div class="stat-card total" onclick="showBreakdown(\'activeUsers\')" style="cursor: pointer;">' +
        '<div class="stat-icon"><i class="fas fa-users"></i></div>' +
        '<div class="stat-info"><span class="stat-label">Total Active Users</span><span class="stat-value">' + formatNumber(totalActive) + '</span></div>' +
        '</div>' +
        '<div class="stat-card submitted" onclick="showBreakdown(\'submitted\')" style="cursor: pointer;">' +
        '<div class="stat-icon"><i class="fas fa-check-circle"></i></div>' +
        '<div class="stat-info"><span class="stat-label">Total Submitted Tasks</span><span class="stat-value">' + formatNumber(totalSubmitted) + '</span></div>' +
        '</div>' +
        '<div class="stat-card not-submitted" onclick="showBreakdown(\'notSubmitted\')" style="cursor: pointer;">' +
        '<div class="stat-icon"><i class="fas fa-clock"></i></div>' +
        '<div class="stat-info"><span class="stat-label">Pending Submissions</span><span class="stat-value">' + formatNumber(totalNotSubmitted) + '</span></div>' +
        '</div>' +
        '<div class="stat-card productivity">' +
        '<div class="stat-icon"><i class="fas fa-chart-line"></i></div>' +
        '<div class="stat-info"><span class="stat-label">Productivity Rate</span><span class="stat-value">' + productivityRate + '%</span></div>' +
        '</div></div>';
    
    let roomsHTML = '';
    for (const roomName in breakdown.rooms) {
        const roomData = breakdown.rooms[roomName];
        const roomSubmitted = roomData.submitted || 0;
        const roomNotSubmitted = roomData.notSubmitted || 0;
        const roomTotal = roomSubmitted + roomNotSubmitted;
        const roomProductivity = roomTotal > 0 ? Math.round((roomSubmitted / roomTotal) * 100) : 0;
        
        roomsHTML += '<div class="room-card" onclick="showRoomBreakdown(\'' + roomName + '\')">' +
            '<div class="room-header"><h3>' + getLocationDisplayName(roomName) + '</h3><span class="room-productivity">' + roomProductivity + '%</span></div>' +
            '<div class="room-stats">' +
            '<div class="room-stat submitted"><i class="fas fa-check"></i><span>' + roomSubmitted + ' Submitted</span></div>' +
            '<div class="room-stat pending"><i class="fas fa-clock"></i><span>' + roomNotSubmitted + ' Pending</span></div>' +
            '</div></div>';
    }
    
    let modalityHTML = '';
    for (const modalityName in breakdown.modalityBreakdown) {
        const modalityData = breakdown.modalityBreakdown[modalityName];
        const modalityTotal = modalityData.total || 0;
        const modalityFP = modalityData.FP || 0;
        const modalityQA = modalityData.QA || 0;
        
        modalityHTML += '<div class="modality-card"><h4>' + modalityName + '</h4>' +
            '<div class="modality-stats">' +
            '<div class="modality-stat"><span class="label">Total:</span><span class="value">' + modalityTotal + '</span></div>' +
            '<div class="modality-stat fp"><span class="label">FP:</span><span class="value">' + modalityFP + '</span></div>' +
            '<div class="modality-stat qa"><span class="label">QA:</span><span class="value">' + modalityQA + '</span></div>' +
            '</div></div>';
    }
    
    elements.contentArea.innerHTML = '<div class="shift-supervisor-dashboard">' +
        heroStatsHTML +
        '<div class="breakdown-section"><h2><i class="fas fa-building"></i> Rooms Breakdown</h2><div class="rooms-grid">' + roomsHTML + '</div></div>' +
        '<div class="breakdown-section"><h2><i class="fas fa-layer-group"></i> Modality Breakdown</h2><div class="modality-grid">' + modalityHTML + '</div></div>' +
        '</div>';
}

function renderStandardDashboard(selectedShift, selectedLocation) {
    const isGroupView = selectedLocation !== 'all' && CONFIG.LOCATION_GROUPS.hasOwnProperty(selectedLocation);
    let globalAnimationIndex = 0;
    
    for (const shift in state.filteredData) {
        if (selectedShift !== 'all' && shift !== selectedShift) continue;
        
        const shiftWrapper = document.createElement('div');
        shiftWrapper.innerHTML = '<div class="shift-tag"><i class="fas fa-clock"></i> Shift: ' + shift + '</div>';
        
        if (isGroupView) {
            const groupSection = createGroupedLocationSection(selectedLocation, shift, state.filteredData[shift], globalAnimationIndex);
            if (groupSection) shiftWrapper.appendChild(groupSection);
        } else {
            const renderedLocations = new Set();
            
            Object.keys(CONFIG.LOCATION_GROUPS).forEach(function(groupName) {
                if (selectedLocation !== 'all' && selectedLocation !== groupName) return;
                
                const groupMembers = CONFIG.LOCATION_GROUPS[groupName];
                const availableMembers = groupMembers.filter(function(loc) { return state.filteredData[shift].hasOwnProperty(loc); });
                
                if (availableMembers.length > 0) {
                    globalAnimationIndex++;
                    const groupSection = createGroupedLocationSection(groupName, shift, state.filteredData[shift], globalAnimationIndex, availableMembers);
                    shiftWrapper.appendChild(groupSection);
                    availableMembers.forEach(function(loc) { renderedLocations.add(loc); });
                }
            });
            
            for (const locName in state.filteredData[shift]) {
                if (selectedLocation !== 'all' && locName !== selectedLocation) continue;
                if (renderedLocations.has(locName)) continue;
                
                globalAnimationIndex++;
                const locationSection = createLocationSection(locName, state.filteredData[shift][locName], shift, globalAnimationIndex * CONFIG.ANIMATION_STAGGER_DELAY);
                shiftWrapper.appendChild(locationSection);
            }
        }
        
        elements.contentArea.appendChild(shiftWrapper);
    }
}

function createGroupedLocationSection(groupName, shift, allLocations, delayIndex, specificRooms) {
    specificRooms = specificRooms || getGroupLocations(groupName);
    const availableRooms = specificRooms.filter(function(room) { return allLocations.hasOwnProperty(room); });
    
    if (availableRooms.length === 0) return null;
    
    const section = document.createElement('div');
    section.className = 'location-section';
    section.style.animationDelay = (delayIndex * CONFIG.ANIMATION_STAGGER_DELAY) + 'ms';
    
    let totalSubmitted = 0, totalNotSubmitted = 0, roomData = {};
    
    availableRooms.forEach(function(roomName) {
        const teams = allLocations[roomName];
        roomData[roomName] = teams;
        Object.keys(teams).forEach(function(teamName) {
            totalSubmitted += teams[teamName].submitted.length;
            totalNotSubmitted += teams[teamName].notSubmitted.length;
        });
    });
    
    const total = totalSubmitted + totalNotSubmitted;
    const percentage = total > 0 ? Math.round((totalSubmitted / total) * 100) : 0;
    
    let roomsHTML = '';
    availableRooms.forEach(function(roomName, idx) {
        roomsHTML += '<div class="room-subsection" style="animation: sectionAppear 0.5s ease ' + ((delayIndex * CONFIG.ANIMATION_STAGGER_DELAY) + ((idx + 1) * 100)) + 'ms backwards;">' +
            '<div class="room-title"><i class="fas fa-door-open"></i> ' + roomName + '</div>' +
            createTeamsGridHTML(roomData[roomName], shift, roomName, idx) +
            '</div>';
    });
    
    section.innerHTML = '<div class="location-title">' +
        '<div class="location-icon"><i class="fas fa-building"></i></div>' +
        groupName +
        '<span style="font-size: 14px; color: var(--text-muted); font-weight: 600;">(' + availableRooms.length + ' rooms)</span>' +
        '</div>' +
        createHeroStatsHTML({ submitted: totalSubmitted, notSubmitted: totalNotSubmitted, total: total, percentage: percentage }) +
        '<div class="room-group">' + roomsHTML + '</div>';
    
    return section;
}

function createLocationSection(locName, teams, shift, delay) {
    const section = document.createElement('div');
    section.className = 'location-section';
    section.style.animationDelay = delay + 'ms';
    
    const stats = calculateLocationStats(teams);
    
    section.innerHTML = '<div class="location-title">' +
        '<div class="location-icon"><i class="fas fa-map-marker-alt"></i></div>' +
        locName +
        '</div>' +
        createHeroStatsHTML(stats) +
        createTeamsGridHTML(teams, shift, locName);
    
    return section;
}

function calculateLocationStats(teams) {
    let totalSubmitted = 0, totalNotSubmitted = 0;
    Object.keys(teams).forEach(function(teamName) {
        totalSubmitted += teams[teamName].submitted.length;
        totalNotSubmitted += teams[teamName].notSubmitted.length;
    });
    const total = totalSubmitted + totalNotSubmitted;
    return {
        submitted: totalSubmitted,
        notSubmitted: totalNotSubmitted,
        total: total,
        percentage: total > 0 ? Math.round((totalSubmitted / total) * 100) : 0
    };
}

function createHeroStatsHTML(stats) {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (stats.percentage / 100) * circumference;
    
    return '<div class="hero-stats">' +
        '<div class="stat-card submitted" style="animation-delay: 0.1s;">' +
        '<div class="stat-icon"><i class="fas fa-check-circle"></i></div>' +
        '<div class="stat-info"><span class="stat-label">Submitted</span><span class="stat-value">' + stats.submitted + '</span></div>' +
        '</div>' +
        '<div class="stat-card not-submitted" style="animation-delay: 0.2s;">' +
        '<div class="stat-icon"><i class="fas fa-exclamation-circle"></i></div>' +
        '<div class="stat-info"><span class="stat-label">Pending</span><span class="stat-value">' + stats.notSubmitted + '</span></div>' +
        '</div>' +
        '<div class="stat-card total" style="animation-delay: 0.3s;">' +
        '<div class="stat-icon"><i class="fas fa-users"></i></div>' +
        '<div class="stat-info"><span class="stat-label">Total Users</span><span class="stat-value">' + stats.total + '</span></div>' +
        '</div>' +
        '<div class="progress-ring-container" style="animation-delay: 0.4s;">' +
        '<div class="ring-wrapper">' +
        '<svg class="progress-ring-svg" viewBox="0 0 120 120">' +
        '<circle class="ring-bg" cx="60" cy="60" r="' + radius + '"/>' +
        '<circle class="ring-progress" cx="60" cy="60" r="' + radius + '" style="stroke-dashoffset: ' + dashOffset + ';"/>' +
        '</svg>' +
        '<div class="ring-center"><div class="ring-percentage">' + stats.percentage + '%</div><div class="ring-label">Complete</div></div>' +
        '</div>' +
        '<div class="ring-details">' +
        '<div class="detail-row"><span class="detail-dot done"></span><span>' + stats.submitted + ' Completed</span></div>' +
        '<div class="detail-row"><span class="detail-dot pending"></span><span>' + stats.notSubmitted + ' Remaining</span></div>' +
        '</div></div></div>';
}

function createTeamsGridHTML(teams, shift, locName, roomIndex) {
    roomIndex = roomIndex || 0;
    let teamsHTML = '<div class="teams-grid">';
    let cardIndex = 0;
    
    for (const tlName in teams) {
        const teamData = teams[tlName];
        const tlID = generateCardID(shift, locName, tlName);
        const isActive = state.openTeams.has(tlID) ? 'active' : '';
        
        const filteredNotSubmitted = teamData.notSubmitted.filter(function(u) { return matchesSearch(u.email, u.pc); });
        const filteredSubmitted = teamData.submitted.filter(function(u) { return matchesSearch(u.email, u.pc); });
        
        if (state.searchTerm && filteredNotSubmitted.length === 0 && filteredSubmitted.length === 0) continue;
        
        cardIndex++;
        const baseDelay = ((roomIndex + 1) * 60) + (cardIndex * 60);
        
        teamsHTML += '<div class="team-card ' + isActive + '" id="' + tlID + '" style="animation-delay: ' + baseDelay + 'ms;">' +
            '<div class="team-header" onclick="toggleTeam(\'' + tlID + '\')">' +
            '<div class="tl-info">' +
            '<span class="team-name"><i class="fas fa-user-tie"></i> ' + tlName + '</span>' +
            '<div class="tl-badge-container">' +
            '<span class="badge badge-done"><span class="badge-dot"></span>Done: ' + filteredSubmitted.length + '</span>' +
            '<span class="badge badge-not"><span class="badge-dot"></span>Pending: ' + filteredNotSubmitted.length + '</span>' +
            '</div></div>' +
            '<div class="chevron-icon"><i class="fas fa-chevron-down"></i></div>' +
            '</div>' +
            '<div class="team-content">' +
            '<div class="content-inner">' +
            '<div class="split-view">' +
            '<div class="column">' +
            '<div class="col-title not-submit"><i class="fas fa-clock"></i>Pending<span class="col-count">' + filteredNotSubmitted.length + '</span></div>' +
            (filteredNotSubmitted.length > 0 ? filteredNotSubmitted.map(function(u, idx) { return createUserBoxHTML(u, 'not-sub', idx); }).join('') : '<div class="empty-state">No pending users</div>') +
            '</div>' +
            '<div class="column">' +
            '<div class="col-title submit"><i class="fas fa-check-double"></i>Submitted<span class="col-count">' + filteredSubmitted.length + '</span></div>' +
            (filteredSubmitted.length > 0 ? filteredSubmitted.map(function(u, idx) { return createUserBoxHTML(u, 'sub', idx); }).join('') : '<div class="empty-state">No submissions yet</div>') +
            '</div></div></div></div></div>';
    }
    
    teamsHTML += '</div>';
    return teamsHTML;
}

function createUserBoxHTML(user, type, index) {
    return '<div class="user-box ' + type + '-box" style="animation-delay: ' + (index * 40) + 'ms;">' +
        '<span class="u-email">' + escapeHTML(user.email) + '</span>' +
        '<span class="u-meta"><i class="fas fa-desktop"></i>PC: ' + escapeHTML(user.pc) + '</span>' +
        '</div>';
}

/* ============================================
   BREAKDOWN MODALS
   ============================================ */

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

async function showRoomBreakdown(roomName) {
    const modal = document.getElementById('breakdownModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');
    
    modal.style.display = 'flex';
    modalTitle.textContent = 'Room Breakdown: ' + getLocationDisplayName(roomName);
    
    const breakdown = await fetchBreakdownData('room', { room: roomName });
    
    if (breakdown) {
        modalContent.innerHTML = generateRoomBreakdownHTML(roomName, breakdown);
    } else {
        modalContent.innerHTML = '<p class="error">Failed to load room breakdown</p>';
    }
}

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
    Object.keys(data).forEach(function(shift) {
        Object.keys(data[shift]).forEach(function(loc) {
            Object.keys(data[shift][loc]).forEach(function(teamName) {
                hash += data[shift][loc][teamName].submitted.length + '-' + data[shift][loc][teamName].notSubmitted.length;
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
    return ('card-' + shift + '-' + locName + '-' + tlName).replace(/\s+/g, '-');
}

function updateFilters() {
    const shifts = new Set();
    const locations = new Set();
    
    const dataToUse = (state.filteredData && Object.keys(state.filteredData).length > 0) ? state.filteredData : state.rawData;
    
    Object.keys(dataToUse).forEach(function(shift) {
        shifts.add(shift);
        Object.keys(dataToUse[shift]).forEach(function(loc) { locations.add(loc); });
    });
    
    Object.keys(CONFIG.LOCATION_GROUPS).forEach(function(groupName) { locations.add(groupName); });
    
    const currentShift = elements.shiftFilter.value;
    const currentLoc = elements.locFilter.value;
    
    elements.shiftFilter.innerHTML = '<option value="all">All Shifts</option>';
    Array.from(shifts).sort().forEach(function(shift) {
        const opt = document.createElement('option');
        opt.value = shift;
        opt.textContent = 'Shift: ' + shift;
        if (shift === currentShift) opt.selected = true;
        elements.shiftFilter.appendChild(opt);
    });
    
    elements.locFilter.innerHTML = '<option value="all">All Locations</option>';
    
    Object.keys(CONFIG.LOCATION_GROUPS).sort().forEach(function(groupName) {
        const opt = document.createElement('option');
        opt.value = groupName;
        opt.textContent = '📍 ' + groupName;
        opt.style.fontWeight = 'bold';
        if (groupName === currentLoc) opt.selected = true;
        elements.locFilter.appendChild(opt);
    });
    
    const groupedLocs = new Set(Object.values(CONFIG.LOCATION_GROUPS).flat());
    Array.from(locations).filter(function(loc) {
        return !groupedLocs.has(loc) && !Object.keys(CONFIG.LOCATION_GROUPS).includes(loc);
    }).sort().forEach(function(loc) {
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
    return (email.toLowerCase().includes(state.searchTerm) || String(pc).toLowerCase().includes(state.searchTerm));
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
    elements.contentArea.innerHTML = '<div id="loader"><div class="loader-spinner"><div class="spinner-ring"></div><div class="loader-text">Connecting to server<span class="loader-dots"><span>.</span><span>.</span><span>.</span></span></div></div></div>';
}

function showError(message) {
    elements.contentArea.innerHTML = '<div class="error-state"><div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div><h2>Error</h2><p>' + message + '</p><button class="btn btn-primary" onclick="manualRefresh()"><i class="fas fa-redo"></i> Try Again</button></div>';
}

function showSilentUpdateNotification() {
    if (!elements.silentUpdate) return;
    elements.silentUpdate.classList.add('show');
    setTimeout(function() { elements.silentUpdate.classList.remove('show'); }, 2500);
}

function smartUpdateUI() {
    document.querySelectorAll('.stat-value').forEach(function(el) {
        el.style.transform = 'scale(1.1)';
        setTimeout(function() { el.style.transform = 'scale(1)'; }, 200);
    });
    document.querySelectorAll('.ring-progress').forEach(function(el) {
        el.style.filter = 'drop-shadow(0 0 15px var(--accent-emerald-glow))';
        setTimeout(function() { el.style.filter = 'drop-shadow(0 0 10px var(--accent-emerald-glow))'; }, 500);
    });
}

function formatNumber(num) {
    return num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "0";
}

/* ============================================
   BOOT
   ============================================ */
window.addEventListener('DOMContentLoaded', function() {
    loadLoginUsers();
});

window.onclick = function(event) {
    const modal = document.getElementById('breakdownModal');
    if (event.target === modal) {
        closeBreakdownModal();
    }
};
