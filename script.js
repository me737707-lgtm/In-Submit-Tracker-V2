/**
 * ============================================
 * SCRIPT.JS — Application Engine v3.0
 * ============================================
 * NO DEMO MODE | Optimized | Role-Based Views
 */

/* ---- Application State ---- */
const state = {
    rawData: {},
    filteredData: {},
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
    currentView: 'dashboard', // dashboard | shift_supervisor | supervisor | qc
    currentShift: 'M',
    currentLocation: '',
    renderCache: new Map(),
    dataCache: new Map(),
    cacheTimestamp: 0
};

/* ---- Cached DOM Elements ---- */
const elements = {};

/* ============================================
   LOGIN FUNCTIONS
   ============================================ */
async function loadLoginUsers(forceRefresh = false) {
    const apiUrl = CONFIG.LOGIN_API_URL + '?action=users';
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(apiUrl, {
            signal: controller.signal,
            method: 'GET',
            headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' }
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success && data.users && data.users.length > 0) {
            state.usersData = data.users;
        } else {
            state.usersData = [];
        }
    } catch (error) {
        console.error('Failed to load users:', error.message);
        state.usersData = [];
    }
}

function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const loginError = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');
    const loginLoading = document.getElementById('loginLoading');

    loginBtn.style.display = 'none';
    loginLoading.style.display = 'flex';
    loginError.style.display = 'none';

    if (!state.usersData || state.usersData.length === 0) {
        loginError.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>No users available. Check connection.</span>';
        loginError.style.display = 'flex';
        loginBtn.style.display = 'flex';
        loginLoading.style.display = 'none';
        return;
    }

    const user = state.usersData.find(u => 
        u.username.toString().toLowerCase() === username.toLowerCase() && 
        u.password.toString() === password
    );

    if (user) {
        state.currentUser = user;
        state.isLoggedIn = true;
        document.getElementById('loginOverlay').style.display = 'none';
        showUserInfo(user);
        initializeApp();
    } else {
        loginError.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>Invalid username or password</span>';
        loginError.style.display = 'flex';
        loginBtn.style.display = 'flex';
        loginLoading.style.display = 'none';
    }
}

function showUserInfo(user) {
    const userInfo = document.getElementById('userInfo');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userRoleDisplay = document.getElementById('userRoleDisplay');
    const roleDisplay = document.getElementById('roleDisplay');

    userNameDisplay.textContent = user.username;

    let roleLabel = user.role === 'supervisors' ? 'SUPERVISOR' : 
                    user.role === 'shift_supervisor' ? 'SHIFT SUPERVISOR' : 'QC';
    userRoleDisplay.textContent = roleLabel;
    userRoleDisplay.className = 'user-role ' + user.role;

    roleDisplay.textContent = roleLabel + ' Dashboard';
    userInfo.style.display = 'flex';
}

function handleLogout() {
    state.currentUser = null;
    state.isLoggedIn = false;
    state.rawData = {};
    state.filteredData = {};
    state.currentView = 'dashboard';
    state.renderCache.clear();
    state.dataCache.clear();

    if (state.usersRefreshInterval) {
        clearInterval(state.usersRefreshInterval);
        state.usersRefreshInterval = null;
    }

    if (elements.shiftFilter) elements.shiftFilter.value = 'all';
    if (elements.locFilter) elements.locFilter.value = 'all';
    if (elements.searchInput) elements.searchInput.value = '';
    state.searchTerm = '';

    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('loginLoading').style.display = 'none';
    document.getElementById('loginBtn').style.display = 'flex';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('loginOverlay').style.display = 'flex';

    hideAllViews();
    if (elements.contentArea) elements.contentArea.innerHTML = '';
}

/* ============================================
   VIEW MANAGEMENT
   ============================================ */
function hideAllViews() {
    document.getElementById('shiftSupervisorView').style.display = 'none';
    document.getElementById('supervisorView').style.display = 'none';
    document.getElementById('qcView').style.display = 'none';
    if (elements.contentArea) elements.contentArea.style.display = 'none';
}

function showView(viewName) {
    hideAllViews();
    state.currentView = viewName;

    if (viewName === 'shift_supervisor') {
        document.getElementById('shiftSupervisorView').style.display = 'block';
        document.getElementById('controlsArea').style.display = 'none';
    } else if (viewName === 'supervisor') {
        document.getElementById('supervisorView').style.display = 'block';
    } else if (viewName === 'qc') {
        document.getElementById('qcView').style.display = 'block';
    } else {
        if (elements.contentArea) elements.contentArea.style.display = 'block';
    }
}

/* ============================================
   INITIALIZATION
   ============================================ */
async function initializeApp() {
    console.log('%c🚀 Submit Tracker v3.0', 'color: #6ee7b7; font-size: 18px; font-weight: bold;');

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

    // Set default date
    elements.datePicker.value = new Date().toISOString().split('T')[0];
    updateStatusIndicator('loading');

    // Route by role
    const role = state.currentUser ? state.currentUser.role : '';

    if (role === 'shift_supervisor') {
        // Shift Supervisor: determine shift from username or default
        state.currentShift = 'M'; // Default, can be enhanced
        showView('shift_supervisor');
        fetchShiftSupervisorData(true);
    } else if (role === 'supervisors') {
        showView('dashboard');
        elements.contentArea.style.display = 'block';
        fetchData(true);
    } else if (role === 'Qc') {
        showView('dashboard');
        elements.contentArea.style.display = 'block';
        fetchData(true);
    } else {
        showView('dashboard');
        elements.contentArea.style.display = 'block';
        fetchData(true);
    }

    // Auto-refresh
    setInterval(() => {
        if (state.currentView === 'shift_supervisor') {
            fetchShiftSupervisorData(false);
        } else {
            fetchData(false);
        }
    }, CONFIG.REFRESH_INTERVAL);

    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            elements.searchInput.focus();
        }
    });

    // Disable ambient orbs on mobile
    if (window.innerWidth < 768) {
        document.getElementById('orb1').style.display = 'none';
        document.getElementById('orb2').style.display = 'none';
        document.getElementById('orb3').style.display = 'none';
    }
}

function updateStatusIndicator(status) {
    const { statusIndicator: indicator, statusDot: dot, statusText: text } = elements;
    indicator.className = 'status-indicator ' + status;
    dot.className = 'status-dot ' + status + '-dot';
    const labels = {
        live: 'LIVE - Connected',
        error: 'CONNECTION ERROR',
        loading: 'CONNECTING...'
    };
    text.textContent = labels[status] ?? 'CONNECTING...';
}

/* ============================================
   DATA FETCHING — ROLE BASED
   ============================================ */
async function fetchData(showLoader = false, isManual = false) {
    if (state.isLoading && !isManual) return;

    const apiUrl = state.customApiUrl || CONFIG.API_URL;
    const date = formatDateForAPI(elements.datePicker.value);
    const fetchUrl = `${apiUrl}?date=${date}`;

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

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        const newData = json.data || {};

        if (Object.keys(newData).length === 0) {
            throw new Error('No data available for this date');
        }

        state.rawData = newData;
        state.filteredData = filterDataByUser(state.rawData);
        updateStatusIndicator('live');

        const newDataHash = generateDataHash(state.filteredData);
        if (newDataHash !== state.lastDataHash) {
            state.lastDataHash = newDataHash;
            if (state.isFirstLoad || isManual) {
                updateFilters();
                renderData();
                state.isFirstLoad = false;
                if (showLoader || isManual) showLoadingState(false);
            } else {
                showSilentUpdateNotification();
                smartUpdateUI();
            }
        } else {
            if (showLoader || isManual) showLoadingState(false);
        }
        state.lastError = null;

    } catch (error) {
        console.error('Fetch Error:', error.message);
        state.lastError = error.message;
        updateStatusIndicator('error');

        let errorTitle = 'Connection Error';
        let errorDetails = error.message;

        if (error.name === 'AbortError') {
            errorTitle = 'Request Timeout';
            errorDetails = 'Server took too long to respond.';
        } else if (error.message.includes('404')) {
            errorTitle = 'API Not Found';
            errorDetails = 'The API URL does not exist.';
        } else if (error.message.includes('Failed to fetch')) {
            errorTitle = 'Network Error';
            errorDetails = 'Cannot connect to the server.';
        }

        if (showLoader || isManual || state.isFirstLoad) {
            showErrorState(errorTitle, errorDetails, error);
            state.isFirstLoad = false;
        }
    } finally {
        state.isLoading = false;
    }
}

async function fetchShiftSupervisorData(showLoader = false) {
    if (state.isLoading && !showLoader) return;

    const apiUrl = state.customApiUrl || CONFIG.API_URL;
    const date = formatDateForAPI(elements.datePicker.value);
    const shift = state.currentShift;
    const fetchUrl = `${apiUrl}?date=${date}&role=shift_supervisor&shift=${shift}`;

    try {
        state.isLoading = true;
        if (showLoader) showLoadingState(true);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

        const response = await fetch(fetchUrl, {
            signal: controller.signal,
            mode: 'cors',
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();

        if (json.data) {
            state.rawData = json.data;
            updateStatusIndicator('live');
            renderShiftSupervisorView(json.data);
        }
        state.lastError = null;

    } catch (error) {
        console.error('Shift Supervisor Fetch Error:', error.message);
        state.lastError = error.message;
        updateStatusIndicator('error');
        if (showLoader) {
            showErrorState('Connection Error', error.message, error);
        }
    } finally {
        state.isLoading = false;
        if (showLoader) showLoadingState(false);
    }
}

async function fetchSupervisorRoomData(location) {
    const apiUrl = state.customApiUrl || CONFIG.API_URL;
    const date = formatDateForAPI(elements.datePicker.value);
    const fetchUrl = `${apiUrl}?date=${date}&role=supervisor&location=${encodeURIComponent(location)}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
        const response = await fetch(fetchUrl, {
            signal: controller.signal,
            mode: 'cors',
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        if (json.data) renderSupervisorView(json.data);
    } catch (error) {
        console.error('Supervisor Fetch Error:', error.message);
    }
}

async function fetchQCTeamData(teamName) {
    const apiUrl = state.customApiUrl || CONFIG.API_URL;
    const date = formatDateForAPI(elements.datePicker.value);
    const fetchUrl = `${apiUrl}?date=${date}&role=qc&username=${encodeURIComponent(teamName)}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
        const response = await fetch(fetchUrl, {
            signal: controller.signal,
            mode: 'cors',
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        if (json.data) renderQCView(json.data);
    } catch (error) {
        console.error('QC Fetch Error:', error.message);
    }
}

function manualRefresh() {
    if (state.currentView === 'shift_supervisor') {
        fetchShiftSupervisorData(true);
    } else {
        fetchData(true, true);
    }
}

/* ============================================
   SHIFT SUPERVISOR VIEW RENDERER
   ============================================ */
function renderShiftSupervisorView(data) {
    const container = document.getElementById('ssSummaryGrid');
    const breakdownContainer = document.getElementById('ssBreakdownContainer');
    const shiftBadge = document.getElementById('ssShiftBadge');
    const dateEl = document.getElementById('ssDate');

    // Update header
    const shiftInfo = CONFIG.SHIFTS[data.shift] || CONFIG.SHIFTS['M'];
    shiftBadge.innerHTML = `<i class="fas ${shiftInfo.icon}"></i><span>${shiftInfo.label} Shift</span>`;
    shiftBadge.style.borderColor = shiftInfo.color;
    shiftBadge.style.color = shiftInfo.color;
    dateEl.textContent = data.date;

    // Summary Cards
    const activePct = data.activeUsers.total > 0 ? 100 : 0;
    const submitPct = data.activeUsers.total > 0 ? Math.round((data.submittedTasks.total / data.activeUsers.total) * 100) : 0;
    const trainingTotal = Object.values(data.training).reduce((a, b) => a + b, 0);

    container.innerHTML = `
        <div class="ss-card active-card" onclick="toggleBreakdown('active')">
            <div class="ss-card-icon"><i class="fas fa-users"></i></div>
            <div class="ss-card-info">
                <span class="ss-card-label">Total Active Users</span>
                <span class="ss-card-value">${data.activeUsers.total}</span>
                <span class="ss-card-sub">Present & Productive</span>
            </div>
            <div class="ss-card-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>

        <div class="ss-card submit-card" onclick="toggleBreakdown('submitted')">
            <div class="ss-card-icon"><i class="fas fa-check-double"></i></div>
            <div class="ss-card-info">
                <span class="ss-card-label">Total Submitted Tasks</span>
                <span class="ss-card-value">${data.submittedTasks.total}</span>
                <span class="ss-card-sub">${submitPct}% of active users</span>
            </div>
            <div class="ss-card-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>

        <div class="ss-card training-card" onclick="toggleBreakdown('training')">
            <div class="ss-card-icon"><i class="fas fa-graduation-cap"></i></div>
            <div class="ss-card-info">
                <span class="ss-card-label">Training</span>
                <span class="ss-card-value">${trainingTotal}</span>
                <span class="ss-card-sub">T1-T5 Breakdown</span>
            </div>
            <div class="ss-card-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>

        <div class="ss-card pending-card" onclick="toggleBreakdown('pending')">
            <div class="ss-card-icon"><i class="fas fa-clock"></i></div>
            <div class="ss-card-info">
                <span class="ss-card-label">Not Submitted</span>
                <span class="ss-card-value">${data.notSubmitted.total}</span>
                <span class="ss-card-sub">Pending submissions</span>
            </div>
            <div class="ss-card-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>
    `;

    // Store data for breakdown toggles
    state.ssData = data;

    // Initial breakdown: show active users by room
    renderSSBreakdown('active');
}

function toggleBreakdown(type) {
    renderSSBreakdown(type);
}

function renderSSBreakdown(type) {
    const container = document.getElementById('ssBreakdownContainer');
    const data = state.ssData;
    if (!data) return;

    let html = '';

    if (type === 'active') {
        html = `
            <div class="breakdown-section">
                <h3><i class="fas fa-users"></i> Active Users Breakdown by Room</h3>
                <div class="breakdown-grid">
                    ${Object.entries(data.activeUsers.byRoom).map(([room, count]) => `
                        <div class="breakdown-item">
                            <span class="breakdown-name">${room}</span>
                            <span class="breakdown-value">${count}</span>
                            <div class="breakdown-bar">
                                <div class="breakdown-fill" style="width: ${data.activeUsers.total > 0 ? (count / data.activeUsers.total * 100) : 0}%"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="breakdown-total">
                    <span>Total Active: <strong>${data.activeUsers.total}</strong></span>
                </div>
            </div>
        `;
    } else if (type === 'submitted') {
        html = `
            <div class="breakdown-section">
                <h3><i class="fas fa-tasks"></i> Submitted Tasks Breakdown</h3>
                ${Object.entries(data.submittedTasks.byType).map(([typeName, typeData]) => {
                    if (typeData.total === 0) return '';
                    const typeInfo = CONFIG.TASK_TYPES[typeName] || CONFIG.TASK_TYPES['Other'];
                    return `
                        <div class="task-type-block">
                            <div class="task-type-header" style="color: ${typeInfo.color}">
                                <i class="fas ${typeInfo.icon}"></i>
                                <span>${typeInfo.label}</span>
                                <span class="task-type-total">${typeData.total}</span>
                            </div>
                            <div class="task-status-grid">
                                <div class="task-status-item fp">
                                    <span class="status-label">First Pass</span>
                                    <span class="status-value">${typeData.FP}</span>
                                </div>
                                <div class="task-status-item qa">
                                    <span class="status-label">QA</span>
                                    <span class="status-value">${typeData.QA}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
                <div class="breakdown-total">
                    <span>Total Submitted: <strong>${data.submittedTasks.total}</strong></span>
                </div>
            </div>
        `;
    } else if (type === 'training') {
        html = `
            <div class="breakdown-section">
                <h3><i class="fas fa-graduation-cap"></i> Training Breakdown</h3>
                <div class="training-grid">
                    ${Object.entries(data.training).map(([tKey, count]) => {
                        const tInfo = CONFIG.TRAINING_TYPES[tKey] || { label: tKey, color: '#ccc' };
                        return `
                            <div class="training-item" style="border-color: ${tInfo.color}">
                                <span class="training-label" style="color: ${tInfo.color}">${tInfo.label}</span>
                                <span class="training-value">${count}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    } else if (type === 'pending') {
        html = `
            <div class="breakdown-section">
                <h3><i class="fas fa-clock"></i> Not Submitted Breakdown by Room</h3>
                <div class="breakdown-grid">
                    ${Object.entries(data.notSubmitted.byRoom).map(([room, count]) => `
                        <div class="breakdown-item pending-item">
                            <span class="breakdown-name">${room}</span>
                            <span class="breakdown-value">${count}</span>
                            <div class="breakdown-bar">
                                <div class="breakdown-fill pending-fill" style="width: ${data.notSubmitted.total > 0 ? (count / data.notSubmitted.total * 100) : 0}%"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="breakdown-total">
                    <span>Total Pending: <strong>${data.notSubmitted.total}</strong></span>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

/* ============================================
   SUPERVISOR ROOM VIEW RENDERER
   ============================================ */
function renderSupervisorView(data) {
    document.getElementById('svLocationTitle').textContent = data.location + ' Breakdown';
    document.getElementById('svTotals').innerHTML = `
        <span class="sv-total-item submitted"><i class="fas fa-check"></i> ${data.totals.submitted}</span>
        <span class="sv-total-item pending"><i class="fas fa-clock"></i> ${data.totals.notSubmitted}</span>
        <span class="sv-total-item total"><i class="fas fa-users"></i> ${data.totals.total}</span>
    `;

    const container = document.getElementById('svTeamsContainer');
    let html = '';

    for (const [teamName, teamData] of Object.entries(data.teams)) {
        const teamSubmitted = teamData.submitted.length;
        const teamPending = teamData.notSubmitted.length;
        const teamTotal = teamSubmitted + teamPending;
        const teamPct = teamTotal > 0 ? Math.round((teamSubmitted / teamTotal) * 100) : 0;

        html += `
            <div class="sv-team-card">
                <div class="sv-team-header">
                    <span class="sv-team-name"><i class="fas fa-user-tie"></i> ${teamName}</span>
                    <div class="sv-team-badges">
                        <span class="sv-badge done">Done: ${teamSubmitted}</span>
                        <span class="sv-badge pending">Pending: ${teamPending}</span>
                    </div>
                </div>
                <div class="sv-team-progress">
                    <div class="sv-progress-bar">
                        <div class="sv-progress-fill" style="width: ${teamPct}%"></div>
                    </div>
                    <span class="sv-progress-text">${teamPct}% Complete</span>
                </div>
                <div class="sv-team-users">
                    ${teamData.submitted.map(u => `
                        <div class="sv-user submitted-user">
                            <span class="sv-user-email">${escapeHTML(u.email)}</span>
                            <span class="sv-user-meta">${u.taskType} | ${u.status}</span>
                        </div>
                    `).join('')}
                    ${teamData.notSubmitted.map(u => `
                        <div class="sv-user pending-user">
                            <span class="sv-user-email">${escapeHTML(u.email)}</span>
                            <span class="sv-user-meta">Pending</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

/* ============================================
   QC TEAM VIEW RENDERER
   ============================================ */
function renderQCView(data) {
    document.getElementById('qcTeamTitle').textContent = data.team + ' — QC Breakdown';
    document.getElementById('qcTotals').innerHTML = `
        <span class="qc-total-item"><i class="fas fa-check-double"></i> Total: ${data.totals.submitted}</span>
        <span class="qc-total-item fp"><i class="fas fa-check"></i> FP: ${data.totals.byStatus.FP}</span>
        <span class="qc-total-item qa"><i class="fas fa-search"></i> QA: ${data.totals.byStatus.QA}</span>
    `;

    // Task type breakdown
    const breakdownEl = document.getElementById('qcTaskBreakdown');
    let breakdownHtml = '<div class="qc-breakdown-grid">';
    for (const [typeName, typeData] of Object.entries(data.totals.byTaskType)) {
        if (typeData.total === 0) continue;
        const typeInfo = CONFIG.TASK_TYPES[typeName] || CONFIG.TASK_TYPES['Other'];
        breakdownHtml += `
            <div class="qc-breakdown-card" style="border-color: ${typeInfo.color}">
                <div class="qc-breakdown-header" style="color: ${typeInfo.color}">
                    <i class="fas ${typeInfo.icon}"></i>
                    <span>${typeInfo.label}</span>
                </div>
                <div class="qc-breakdown-stats">
                    <div class="qc-stat"><span class="qc-stat-label">FP</span><span class="qc-stat-value">${typeData.FP}</span></div>
                    <div class="qc-stat"><span class="qc-stat-label">QA</span><span class="qc-stat-value">${typeData.QA}</span></div>
                    <div class="qc-stat"><span class="qc-stat-label">Total</span><span class="qc-stat-value">${typeData.total}</span></div>
                </div>
            </div>
        `;
    }
    breakdownHtml += '</div>';
    breakdownEl.innerHTML = breakdownHtml;

    // Users list
    const usersEl = document.getElementById('qcUsersContainer');
    let usersHtml = '<div class="qc-users-grid">';
    data.submittedUsers.forEach((u, idx) => {
        const statusInfo = CONFIG.STATUS_TYPES[u.status] || { color: '#ccc', icon: 'fa-circle' };
        usersHtml += `
            <div class="qc-user-card" style="animation-delay: ${idx * 40}ms">
                <div class="qc-user-status" style="color: ${statusInfo.color}">
                    <i class="fas ${statusInfo.icon}"></i>
                    <span>${u.status}</span>
                </div>
                <div class="qc-user-info">
                    <span class="qc-user-email">${escapeHTML(u.email)}</span>
                    <span class="qc-user-name">${escapeHTML(u.name)}</span>
                </div>
                <div class="qc-user-meta">
                    <span class="qc-user-type">${u.taskType}</span>
                    <span class="qc-user-pc"><i class="fas fa-desktop"></i> ${u.pc}</span>
                </div>
            </div>
        `;
    });
    usersHtml += '</div>';
    usersEl.innerHTML = usersHtml;
}

/* ============================================
   DEFAULT DASHBOARD RENDERER (Optimized)
   ============================================ */
function filterDataByUser(data) {
    if (!state.currentUser) return data;

    if (state.currentUser.role === 'supervisors' && state.currentUser.permission === 'all') {
        return data;
    }

    if (state.currentUser.role === 'Qc' || state.currentUser.permission === 'only') {
        const filteredData = {};
        const userTeamName = state.currentUser.username;

        for (const [shift, locations] of Object.entries(data)) {
            filteredData[shift] = {};
            for (const [location, teams] of Object.entries(locations)) {
                filteredData[shift][location] = {};
                for (const [teamName, teamData] of Object.entries(teams)) {
                    const teamBaseName = teamName.replace(/\s*\([A-Z]{1,3}\)\s*$/, '').trim();
                    if (teamBaseName === userTeamName) {
                        filteredData[shift][location][teamName] = teamData;
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
        return filteredData;
    }

    return data;
}

function renderData() {
    const selectedShift = elements.shiftFilter.value;
    const selectedLocation = elements.locFilter.value;
    const dataToRender = state.filteredData && Object.keys(state.filteredData).length > 0 
        ? state.filteredData : state.rawData;

    if (Object.keys(dataToRender).length === 0) {
        elements.contentArea.innerHTML = `
            <div class="empty-state" style="padding: 80px; text-align: center;">
                <i class="fas fa-inbox" style="font-size: 56px; margin-bottom: 20px; opacity: 0.25; display: block;"></i>
                <p style="font-size: 16px;">No data available for this date.</p>
            </div>
        `;
        return;
    }

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    let globalAnimationIndex = 0;

    for (const [shift, locations] of Object.entries(dataToRender)) {
        if (selectedShift !== 'all' && shift !== selectedShift) continue;

        const shiftWrapper = document.createElement('div');
        shiftWrapper.innerHTML = `<div class="shift-tag"><i class="fas fa-clock"></i> Shift: ${shift}</div>`;

        const isGroupView = selectedLocation !== 'all' && CONFIG.LOCATION_GROUPS.hasOwnProperty(selectedLocation);

        if (isGroupView) {
            const groupSection = createGroupedLocationSection(selectedLocation, shift, locations, globalAnimationIndex);
            if (groupSection) shiftWrapper.appendChild(groupSection);
        } else {
            const renderedLocations = new Set();

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

            for (const [locName, teams] of Object.entries(locations)) {
                if (selectedLocation !== 'all' && locName !== selectedLocation) continue;
                if (renderedLocations.has(locName)) continue;
                globalAnimationIndex++;
                const locationSection = createLocationSection(locName, teams, shift, globalAnimationIndex * CONFIG.ANIMATION_STAGGER_DELAY);
                shiftWrapper.appendChild(locationSection);
            }
        }

        fragment.appendChild(shiftWrapper);
    }

    elements.contentArea.innerHTML = '';
    elements.contentArea.appendChild(fragment);
}

/* ---- Reuse existing helper functions ---- */
function createGroupedLocationSection(groupName, shift, allLocations, delayIndex, specificRooms = null) {
    const roomsToRender = specificRooms || (CONFIG.LOCATION_GROUPS[groupName] || []);
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

function calculateLocationStats(teams) {
    let totalSubmitted = 0, totalNotSubmitted = 0;
    Object.values(teams).forEach(team => {
        totalSubmitted += team.submitted.length;
        totalNotSubmitted += team.notSubmitted.length;
    });
    const total = totalSubmitted + totalNotSubmitted;
    return { submitted: totalSubmitted, notSubmitted: totalNotSubmitted, total, percentage: total > 0 ? Math.round((totalSubmitted / total) * 100) : 0 };
}

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
                        <circle class="ring-progress" cx="60" cy="60" r="${radius}" style="stroke-dashoffset: ${dashOffset};"/>
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

function createUserBoxHTML(user, type, index) {
    return `
        <div class="user-box ${type}-box" style="animation-delay: ${index * 40}ms;">
            <span class="u-email">${escapeHTML(user.email)}</span>
            <span class="u-meta"><i class="fas fa-desktop"></i>PC: ${escapeHTML(user.pc)}</span>
        </div>
    `;
}

/* ============================================
   FILTER & SEARCH
   ============================================ */
let searchTimeout = null;
function handleSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        state.searchTerm = elements.searchInput.value.toLowerCase().trim();
        renderData();
    }, CONFIG.DEBOUNCE_DELAY);
}

function matchesSearch(email, pc) {
    if (!state.searchTerm) return true;
    return (email.toLowerCase().includes(state.searchTerm) || String(pc).toLowerCase().includes(state.searchTerm));
}

function updateFilters() {
    const shifts = new Set();
    const locations = new Set();
    const dataToUse = state.filteredData && Object.keys(state.filteredData).length > 0 
        ? state.filteredData : state.rawData;

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
    Array.from(locations).filter(loc => !groupedLocs.has(loc) && !Object.keys(CONFIG.LOCATION_GROUPS).includes(loc)).sort().forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc;
        opt.textContent = loc;
        if (loc === currentLoc) opt.selected = true;
        elements.locFilter.appendChild(opt);
    });
}

function handleShiftChange() {
    if (state.currentUser && state.currentUser.role === 'shift_supervisor') {
        state.currentShift = elements.shiftFilter.value === 'all' ? 'M' : elements.shiftFilter.value;
        fetchShiftSupervisorData(true);
    } else {
        renderData();
    }
}

function handleLocationChange() {
    const role = state.currentUser ? state.currentUser.role : '';
    const loc = elements.locFilter.value;

    if (role === 'supervisors' && loc !== 'all') {
        fetchSupervisorRoomData(loc);
        showView('supervisor');
    } else {
        renderData();
    }
}

/* ============================================
   UI HELPERS
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

function showLoadingState(show) {
    if (!show) return;
    elements.contentArea.innerHTML = `
        <div id="loader">
            <div class="loader-spinner">
                <div class="spinner-ring"></div>
                <div class="loader-text">Loading data<span class="loader-dots"><span>.</span><span>.</span><span>.</span></span></div>
            </div>
        </div>
    `;
}

function showErrorState(title, message, error) {
    const timestamp = new Date().toLocaleTimeString();
    const currentUrl = state.customApiUrl || CONFIG.API_URL;

    elements.contentArea.innerHTML = `
        <div class="error-state">
            <div class="error-header">
                <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="error-title-section">
                    <div class="error-title">${title}</div>
                    <div class="error-subtitle">${message}</div>
                </div>
            </div>
            <div class="error-actions">
                <button class="btn btn-primary" onclick="manualRefresh()">
                    <i class="fas fa-redo"></i> Try Again
                </button>
            </div>
            <div class="debug-info">
                <strong>Technical Details:</strong><br>
                Timestamp: ${timestamp}<br>
                Error: ${error?.message ?? 'N/A'}<br>
                API URL: ${currentUrl.substring(0, 60)}...<br>
            </div>
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
   BOOT
   ============================================ */
window.addEventListener('DOMContentLoaded', () => {
    loadLoginUsers();
});
