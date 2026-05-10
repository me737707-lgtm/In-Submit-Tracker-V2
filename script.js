/**
 * ============================================
 * SCRIPT.JS — Application Engine (Full Version)
 * ============================================
 * Includes: Login System, Permissions, & Full UI Logic
 */

/* ---- Application State ---- */
const state = {
    rawData: {},
    openTeams: new Set(),
    searchTerm: '',
    lastDataHash: '',
    isFirstLoad: true,
    isLoading: false,
    useDemoData: false,
    lastError: null,
    customApiUrl: null
};

// Global user state
let currentUser = null;

/* ---- Cached DOM Elements ---- */
const elements = {};

/* ============================================
    AUTHENTICATION SYSTEM
   ============================================ */

/**
 * Handles the login process and transitions to the dashboard
 */
async function handleLogin() {
    const userField = document.getElementById('username');
    const passField = document.getElementById('password');
    const btn = document.getElementById('loginBtn');
    const errorDiv = document.getElementById('loginError');
    
    const user = userField.value.trim();
    const pass = passField.value;

    if(!user || !pass) {
        alert("Please enter both username and password.");
        return;
    }

    // UI Feedback
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
    errorDiv.style.display = 'none';
    
    // Google Apps Script Bridge
    if (typeof google !== 'undefined' && google.script) {
        google.script.run
            .withSuccessHandler(res => {
                if (res.success) {
                    currentUser = { 
                        name: user, 
                        role: res.role, 
                        permission: res.permission 
                    };
                    
                    // Transition UI
                    document.getElementById('loginOverlay').style.display = 'none';
                    document.getElementById('mainApp').style.display = 'block';
                    
                    // Fire up the engine
                    initializeApp(); 
                } else {
                    btn.disabled = false;
                    btn.innerText = 'Sign In';
                    errorDiv.style.display = 'block';
                    errorDiv.textContent = "Invalid credentials. Please try again.";
                }
            })
            .withFailureHandler(err => {
                btn.disabled = false;
                btn.innerText = 'Sign In';
                alert("Server connection failed: " + err);
            })
            .checkLogin(user, pass);
    } else {
        // Fallback for local testing/development
        console.warn("Google Script Environment not found. Using Dev Bypass...");
        setTimeout(() => {
            currentUser = { name: user, role: 'Admin', permission: 'all' };
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            initializeApp();
        }, 1000);
    }
}

/* ============================================
   INITIALIZATION
   ============================================ */
function initializeApp() {
    console.log('%c🚀 Submit Tracker v2.0', 'color: #6ee7b7; font-size: 18px; font-weight: bold;');
    console.log('%c⚠️ Enhanced Error Handling & Demo Mode', 'color: #fbbf24; font-size: 12px;');

    // Cache DOM elements
    elements.contentArea    = document.getElementById('contentArea');
    elements.shiftFilter    = document.getElementById('shiftFilter');
    elements.locFilter      = document.getElementById('locFilter');
    elements.datePicker     = document.getElementById('datePicker');
    elements.searchInput    = document.getElementById('searchInput');
    elements.mainHeader     = document.getElementById('mainHeader');
    elements.silentUpdate   = document.getElementById('silentUpdate');
    elements.statusIndicator = document.getElementById('statusIndicator');
    elements.statusDot      = document.getElementById('statusDot');
    elements.statusText     = document.getElementById('statusText');

    // Set default date to today
    elements.datePicker.value = new Date().toISOString().split('T')[0];

    // Set initial status
    updateStatusIndicator('loading');

    // Initial data fetch
    fetchData(true);

    // Auto-refresh
    setInterval(() => fetchData(false), CONFIG.REFRESH_INTERVAL);

    // Keyboard shortcut: Ctrl/Cmd + K → focus search
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            elements.searchInput.focus();
        }
    });
}

function updateStatusIndicator(status) {
    const { statusIndicator: indicator, statusDot: dot, statusText: text } = elements;
    if (!indicator) return;

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
async function fetchData(showLoader = false, isManual = false) {
    if (state.isLoading && !isManual) return;

    const apiUrl  = state.customApiUrl || CONFIG.API_URL;
    const date    = formatDateForAPI(elements.datePicker.value);
    const fetchUrl = `${apiUrl}?date=${date}`;

    console.log(`\n%c📡 Fetching Data...`, 'color: #a5b4fc; font-weight: bold;');
    console.log(`URL: ${fetchUrl}`);

    try {
        state.isLoading = true;
        if (showLoader || isManual) showLoadingState(true);

        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

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
        } catch (parseError) {
            throw new Error('Invalid JSON response from server');
        }

        const newData = json.data || {};

        if (Object.keys(newData).length === 0) {
            console.warn('⚠️ Empty data received — switching to demo mode');
            state.useDemoData = true;
            state.rawData     = CONFIG.DEMO_DATA;
            updateStatusIndicator('demo');
        } else {
            state.useDemoData = false;
            state.rawData     = newData;
            updateStatusIndicator('live');
        }

        const newDataHash = generateDataHash(state.rawData);

        if (newDataHash !== state.lastDataHash) {
            console.log('🔄 Data changed — updating UI...');
            state.lastDataHash = newDataHash;

            if (state.isFirstLoad || isManual) {
                updateFilters();
                renderData();
                state.isFirstLoad = false;
                if (showLoader || isManual) showLoadingState(false);
            } else {
                showSilentUpdateNotification();
                smartUpdateUI();
                renderData(); // Dynamic re-render on data change
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

        let errorTitle   = 'Unknown Error';
        let errorDetails = error.message;
        let is404Error   = false;

        if (error.name === 'AbortError') {
            errorTitle   = 'Request Timeout';
            errorDetails = `Server took too long to respond (> ${CONFIG.REQUEST_TIMEOUT / 1000}s).`;
        } else if (error.message.includes('404')) {
            errorTitle   = 'API Not Found (404)';
            is404Error   = true;
        }

        if (!state.useDemoData) {
            state.useDemoData = true;
            state.rawData     = CONFIG.DEMO_DATA;
            updateFilters();
            renderData();
        }

        if (showLoader || isManual || state.isFirstLoad) {
            showErrorState(errorTitle, errorDetails, error, is404Error);
            state.isFirstLoad = false;
        }

    } finally {
        state.isLoading = false;
    }
}

function manualRefresh() {
    fetchData(true, true);
}

function useCustomApiUrl() {
    const input  = document.getElementById('customApiUrlInput');
    const newUrl = input.value.trim();
    if (!newUrl) { alert('Please enter a valid API URL'); return; }
    state.customApiUrl = newUrl;
    manualRefresh();
}

/* ============================================
   STATE DISPLAY HELPERS
   ============================================ */
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

function showErrorState(title, message, error, is404 = false) {
    const timestamp  = new Date().toLocaleTimeString();
    const currentUrl = state.customApiUrl || CONFIG.API_URL;

    let solutionHTML = '';
    if (is404) {
        solutionHTML = `
            <div class="solution-box">
                <div class="solution-title"><i class="fas fa-lightbulb"></i> How to Fix This Error (404)</div>
                <ul class="solution-list">
                    <li><strong>Check the Script URL</strong> — Make sure it's correct.</li>
                    <li><strong>Redeploy</strong> — Go to Google Apps Script → Deploy → Manage.</li>
                    <li><strong>Permissions</strong> — Ensure "Anyone" can access.</li>
                </ul>
            </div>
            <div class="api-url-input-group">
                <input type="text" id="customApiUrlInput" class="api-url-input" placeholder="Enter New URL...">
                <button class="btn btn-success" onclick="useCustomApiUrl()" style="margin-top: 10px;">Connect</button>
            </div>
        `;
    }

    elements.contentArea.innerHTML = `
        <div class="error-state">
            <div class="error-header">
                <div class="error-icon"><i class="fas ${is404 ? 'fa-unlink' : 'fa-exclamation-triangle'}"></i></div>
                <div class="error-title-section">
                    <div class="error-code">${is404 ? '404' : '⚠'}</div>
                    <div class="error-title">${title}</div>
                </div>
            </div>
            <div class="error-message">
                <strong>Status:</strong> Running in <span style="color: var(--accent-yellow);">DEMO MODE</span>.
            </div>
            <div class="error-actions">
                <button class="btn btn-primary" onclick="manualRefresh()"><i class="fas fa-redo"></i> Try Again</button>
                <button class="btn btn-success" onclick="loadDemoOnly()"><i class="fas fa-eye"></i> Demo Dashboard</button>
            </div>
            ${solutionHTML}
            <div class="debug-info">
                <strong>🔍 Technical Details:</strong><br>
                Timestamp: ${timestamp}<br>
                Error: ${error?.message || 'N/A'}<br>
                Attempted URL: ${currentUrl.substring(0, 50)}...
            </div>
        </div>
    `;
}

function loadDemoOnly() {
    state.useDemoData = true;
    state.rawData     = CONFIG.DEMO_DATA;
    updateStatusIndicator('demo');
    updateFilters();
    renderData();
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
}

/* ============================================
   UTILITY HELPERS
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

/* ============================================
   FILTER MANAGEMENT
   ============================================ */
function updateFilters() {
    const shifts    = new Set();
    const locations = new Set();

    Object.keys(state.rawData).forEach(shift => {
        shifts.add(shift);
        Object.keys(state.rawData[shift]).forEach(loc => locations.add(loc));
    });

    Object.keys(CONFIG.LOCATION_GROUPS).forEach(groupName => locations.add(groupName));

    const currentShift = elements.shiftFilter.value;
    const currentLoc   = elements.locFilter.value;

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
        if (groupName === currentLoc) opt.selected = true;
        elements.locFilter.appendChild(opt);
    });

    const groupedLocs = new Set(Object.values(CONFIG.LOCATION_GROUPS).flat());
    Array.from(locations).filter(loc => 
        !groupedLocs.has(loc) && !CONFIG.LOCATION_GROUPS[loc]
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

/* ============================================
   SEARCH
   ============================================ */
function handleSearch() {
    state.searchTerm = elements.searchInput.value.toLowerCase().trim();
    renderData();
}

function matchesSearch(email, pc) {
    if (!state.searchTerm) return true;
    return (
        email.toLowerCase().includes(state.searchTerm) ||
        String(pc).toLowerCase().includes(state.searchTerm)
    );
}

/* ============================================
   ACCORDION TOGGLE
   ============================================ */
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

/* ============================================
   RENDERING
   ============================================ */
function renderData() {
    const selectedShift    = elements.shiftFilter.value;
    const selectedLocation = elements.locFilter.value;

    elements.contentArea.innerHTML = '';

    if (Object.keys(state.rawData).length === 0) {
        elements.contentArea.innerHTML = `<div class="empty-state"><p>No data available.</p></div>`;
        return;
    }

    const isGroupView = selectedLocation !== 'all' && CONFIG.LOCATION_GROUPS.hasOwnProperty(selectedLocation);
    let globalAnimationIndex = 0;

    for (const [shift, locations] of Object.entries(state.rawData)) {
        if (selectedShift !== 'all' && shift !== selectedShift) continue;

        const shiftWrapper = document.createElement('div');
        shiftWrapper.innerHTML = `<div class="shift-tag"><i class="fas fa-clock"></i> Shift: ${shift}</div>`;

        if (isGroupView) {
            const groupSection = createGroupedLocationSection(selectedLocation, shift, locations, globalAnimationIndex);
            if (groupSection) shiftWrapper.appendChild(groupSection);
        } else {
            const renderedLocations = new Set();
            Object.keys(CONFIG.LOCATION_GROUPS).forEach(groupName => {
                if (selectedLocation !== 'all' && selectedLocation !== groupName) return;
                const members = CONFIG.LOCATION_GROUPS[groupName];
                const available = members.filter(loc => locations.hasOwnProperty(loc));
                if (available.length > 0) {
                    globalAnimationIndex++;
                    const groupSection = createGroupedLocationSection(groupName, shift, locations, globalAnimationIndex, available);
                    if(groupSection) {
                        shiftWrapper.appendChild(groupSection);
                        available.forEach(loc => renderedLocations.add(loc));
                    }
                }
            });

            for (const [locName, teams] of Object.entries(locations)) {
                if (selectedLocation !== 'all' && locName !== selectedLocation) continue;
                if (renderedLocations.has(locName)) continue;
                globalAnimationIndex++;
                shiftWrapper.appendChild(createLocationSection(locName, teams, shift, globalAnimationIndex * CONFIG.ANIMATION_STAGGER_DELAY));
            }
        }
        elements.contentArea.appendChild(shiftWrapper);
    }
}

function createGroupedLocationSection(groupName, shift, allLocations, delayIndex, specificRooms = null) {
    const roomsToRender  = specificRooms || getGroupLocations(groupName);
    const availableRooms = roomsToRender.filter(room => allLocations.hasOwnProperty(room));
    if (availableRooms.length === 0) return null;

    const section = document.createElement('div');
    section.className = 'location-section';
    section.style.animationDelay = `${delayIndex * CONFIG.ANIMATION_STAGGER_DELAY}ms`;

    let s = 0, n = 0, roomsHTML = '';
    availableRooms.forEach((roomName, idx) => {
        const teams = allLocations[roomName];
        Object.values(teams).forEach(t => { s += t.submitted.length; n += t.notSubmitted.length; });
        
        // Pass room index for stagger
        const grid = createTeamsGridHTML(teams, shift, roomName, idx);
        if(!grid.includes('No teams authorized')) {
            roomsHTML += `<div class="room-subsection">
                <div class="room-title"><i class="fas fa-door-open"></i> ${roomName}</div>
                ${grid}
            </div>`;
        }
    });

    if(!roomsHTML) return null;
    const total = s + n;
    const perc  = total > 0 ? Math.round((s / total) * 100) : 0;

    section.innerHTML = `
        <div class="location-title"><i class="fas fa-building"></i> ${groupName} <span>(${availableRooms.length} rooms)</span></div>
        ${createHeroStatsHTML({ submitted: s, notSubmitted: n, total, percentage: perc })}
        <div class="room-group">${roomsHTML}</div>
    `;
    return section;
}

function createLocationSection(locName, teams, shift, delay) {
    const stats = calculateLocationStats(teams);
    const grid = createTeamsGridHTML(teams, shift, locName);
    
    // Don't render empty sections if permissions hide all teams
    if(grid.includes('No teams authorized')) return document.createDocumentFragment();

    const section = document.createElement('div');
    section.className = 'location-section';
    section.style.animationDelay = `${delay}ms`;
    section.innerHTML = `
        <div class="location-title"><i class="fas fa-map-marker-alt"></i> ${locName}</div>
        ${createHeroStatsHTML(stats)}
        ${grid}
    `;
    return section;
}

function calculateLocationStats(teams) {
    let s = 0, n = 0;
    Object.values(teams).forEach(t => { s += t.submitted.length; n += t.notSubmitted.length; });
    const total = s + n;
    return { submitted: s, notSubmitted: n, total, percentage: total > 0 ? Math.round((s / total) * 100) : 0 };
}

function createHeroStatsHTML(stats) {
    const radius = 54;
    const circ   = 2 * Math.PI * radius;
    const offset = circ - (stats.percentage / 100) * circ;

    return `
        <div class="hero-stats">
            <div class="stat-card submitted"><div class="stat-value">${stats.submitted}</div><div class="stat-label">Submitted</div></div>
            <div class="stat-card not-submitted"><div class="stat-value">${stats.notSubmitted}</div><div class="stat-label">Pending</div></div>
            <div class="progress-ring-container">
                <svg viewBox="0 0 120 120"><circle class="ring-bg" cx="60" cy="60" r="${radius}"/><circle class="ring-progress" cx="60" cy="60" r="${radius}" style="stroke-dashoffset: ${offset}"/></svg>
                <div class="ring-center"><div class="ring-percentage">${stats.percentage}%</div></div>
            </div>
        </div>
    `;
}

function createTeamsGridHTML(teams, shift, locName, roomIndex = 0) {
    let teamsHTML = '<div class="teams-grid">';
    let cardIndex = 0;
    let visibleCards = 0;

    for (const [tlName, teamData] of Object.entries(teams)) {
        
        // --- PERMISSION FILTERING ---
        if (currentUser && currentUser.role === 'Qc' && currentUser.permission === 'only') {
            if (!tlName.toLowerCase().includes(currentUser.name.toLowerCase())) continue;
        }

        const tlID = generateCardID(shift, locName, tlName);
        const isActive = state.openTeams.has(tlID) ? 'active' : '';

        const fNot = teamData.notSubmitted.filter(u => matchesSearch(u.email, u.pc));
        const fSub = teamData.submitted.filter(u => matchesSearch(u.email, u.pc));

        if (state.searchTerm && fNot.length === 0 && fSub.length === 0) continue;

        cardIndex++;
        visibleCards++;
        const delay = (roomIndex + 1) * 60 + cardIndex * 60;

        teamsHTML += `
            <div class="team-card ${isActive}" id="${tlID}" style="animation-delay: ${delay}ms;">
                <div class="team-header" onclick="toggleTeam('${tlID}')">
                    <span class="team-name"><i class="fas fa-user-tie"></i> ${tlName}</span>
                    <div class="tl-badge-container">
                        <span class="badge badge-done">Done: ${fSub.length}</span>
                        <span class="badge badge-not">Pending: ${fNot.length}</span>
                    </div>
                    <i class="fas fa-chevron-down chevron-icon"></i>
                </div>
                <div class="team-content">
                    <div class="split-view">
                        <div class="column">
                            <div class="col-title not-submit">Pending (${fNot.length})</div>
                            ${fNot.map((u, i) => createUserBoxHTML(u, 'not-sub', i)).join('') || '<div class="empty-state">No pending</div>'}
                        </div>
                        <div class="column">
                            <div class="col-title submit">Submitted (${fSub.length})</div>
                            ${fSub.map((u, i) => createUserBoxHTML(u, 'sub', i)).join('') || '<div class="empty-state">No submissions</div>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    return visibleCards > 0 ? (teamsHTML + '</div>') : '<div class="empty-state">No teams authorized.</div>';
}

function createUserBoxHTML(user, type, index) {
    return `<div class="user-box ${type}-box" style="animation-delay: ${index * 40}ms;">
        <span class="u-email">${escapeHTML(user.email)}</span>
        <span class="u-meta"><i class="fas fa-desktop"></i>PC: ${escapeHTML(user.pc)}</span>
    </div>`;
}

/* ============================================
   BOOT
   ============================================ */
// Note: initializeApp is now called after handleLogin success.
