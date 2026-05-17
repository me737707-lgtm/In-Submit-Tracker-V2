 * ============================================
 * SCRIPT.JS — Application Engine V3.0
 * ============================================
 * ✅ NO DEMO MODE - Production Only
 */

/* ---- Application State ---- */
const state = {
    rawData: {},
    filteredData: {},
    shiftSupervisorData: null, // ✅ NEW
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
    
    // ✅ NEW: Performance optimization
    dataCache: {},
    lastFetchTime: null
};

/* ---- Cached DOM Elements ---- */
const elements = {};

/* ============================================
   LOGIN FUNCTIONS (Optimized)
   ============================================ */
async function loadLoginUsers(forceRefresh = false) {
    const apiUrl = CONFIG.LOGIN_API_URL + '?action=users';
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
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
            state.usersLastUpdate = new Date();
        } else {
            console.error('❌ No users returned from API');
            state.usersData = [];
        }
        
    } catch (error) {
        console.error('❌ Failed to load users:', error.message);
        state.usersData = [];
    }
}

function startUsersAutoRefresh() {
    if (state.usersRefreshInterval) clearInterval(state.usersRefreshInterval);
    
    state.usersRefreshInterval = setInterval(() => {
        if (state.isLoggedIn) loadLoginUsers(true);
    }, 30000);
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
        
        console.log(`%c✅ Login: ${user.username} (${user.role})`, 'color: #6ee7b7');
    } else {
        loginError.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>Invalid credentials</span>';
        loginError.style.display = 'flex';
        loginBtn.style.display = 'flex';
        loginLoading.style.display = 'none';
    }
}

function showUserInfo(user) {
    const userInfo = document.getElementById('userInfo');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userRoleDisplay = document.getElementById('userRoleDisplay');
    
    userNameDisplay.textContent = user.username;
    
    const roleConfig = CONFIG.USER_MANAGEMENT.roles[user.role] || CONFIG.USER_MANAGEMENT.roles['qc'];
    userRoleDisplay.textContent = roleConfig.label;
    userRoleDisplay.className = `user-role ${user.role}`;
    userRoleDisplay.style.color = roleConfig.color;
    
    userInfo.style.display = 'flex';
}

function handleLogout() {
    state.currentUser = null;
    state.isLoggedIn = false;
    state.rawData = {};
    state.filteredData = {};
    state.shiftSupervisorData = null;
    
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
    
    ['loginLoading', 'loginBtn', 'loginError', 'usernameInput', 'passwordInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id.includes('Loading')) el.style.display = 'none';
            else if (id.includes('Btn')) el.style.display = 'flex';
            else if (id.includes('Error')) el.style.display = 'none';
            else el.value = '';
        }
    });
    
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) loginOverlay.style.display = 'flex';
    
    if (elements.contentArea) elements.contentArea.innerHTML = '';
    
    // Hide shift supervisor dashboard
    const ssDashboard = document.getElementById('shiftSupervisorDashboard');
    if (ssDashboard) ssDashboard.style.display = 'none';
}

/* ============================================
   ✅ UPDATED: Filter Data by User Permissions
   ============================================ */
function filterDataByUser(data) {
    if (!state.currentUser) return data;
    
    const role = state.currentUser.role;
    const permission = state.currentUser.permission;
    
    // Admin & Supervisors with "all" see everything
    if ((role === 'admin' || role === 'supervisors') && permission === 'all') {
        return data;
    }
    
    // ✅ NEW: Shift Supervisor sees their shift only
    if (role === 'shift_supervisor') {
        const userShift = state.currentUser.shift;
        if (userShift && data[userShift]) {
            return { [userShift]: data[userShift] };
        }
        return data;
    }
    
    // QC users see only their team
    if (role === 'qc' || permission === 'only') {
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

/* ============================================
   INITIALIZATION
   ============================================ */
async function initializeApp() {
    console.log('%c🚀 Submit Tracker V3.0', 'color: #6ee7b7; font-size: 18px; font-weight: bold;');
    
    await loadLoginUsers();
    startUsersAutoRefresh();

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

    // ✅ NEW: Check if user is Shift Supervisor and load their dashboard
    if (state.currentUser && state.currentUser.role === 'shift_supervisor') {
        fetchShiftSupervisorData();
    }

    fetchData(true);

    setInterval(() => fetchData(false), CONFIG.REFRESH_INTERVAL);

    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            elements.searchInput.focus();
        }
        // ESC to close modal
        if (e.key === 'Escape') closeModal();
    });
}

/* ============================================
   ✅ NEW: Fetch Shift Supervisor Data
   ============================================ */
async function fetchShiftSupervisorData() {
    if (!state.currentUser || state.currentUser.role !== 'shift_supervisor') return;
    
    const dateParam = formatDateForAPI(elements.datePicker.value);
    const userShift = state.currentUser.shift;
    
    if (!userShift) {
        console.error('❌ No shift assigned to this supervisor');
        return;
    }
    
    try {
        const apiUrl = `${CONFIG.API_URL}?action=shift_supervisor&date=${dateParam}&shift=${userShift}`;
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        if (result.success) {
            state.shiftSupervisorData = result;
            renderShiftSupervisorDashboard(result);
            
            // Show the dashboard section
            const ssSection = document.getElementById('shiftSupervisorDashboard');
            if (ssSection) ssSection.style.display = 'block';
        } else {
            console.error('❌ Failed to load shift supervisor data:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Error fetching shift supervisor data:', error);
    }
}

/* ============================================
   ✅ NEW: Render Shift Supervisor Dashboard
   ============================================ */
function renderShiftSupervisorDashboard(data) {
    // Update summary cards
    document.getElementById('ssTotalActive').textContent = data.summary.totalActiveUsers || 0;
    document.getElementById('ssTotalSubmitted').textContent = data.summary.totalSubmitted || 0;
    document.getElementById('ssTotalPending').textContent = data.summary.totalPending || 0;
    document.getElementById('ssTotalAbsent').textContent = data.summary.totalAbsentUsers || 0;
    
    // Update shift badge
    const shiftNames = { 'M': 'Morning', 'N': 'Night', 'ON': 'Overnight' };
    document.getElementById('ssShiftBadge').textContent = `${shiftNames[data.shift] || data.shift} Shift`;
    
    // Render status breakdown
    renderStatusBreakdown(data.statusBreakdown);
    
    // Render room breakdown
    renderRoomBreakdown(data.roomBreakdown);
    
    // Render task type breakdown
    renderTaskTypeBreakdown(data.taskTypeBreakdown);
}

function renderStatusBreakdown(statusBreakdown) {
    const container = document.getElementById('ssStatusGrid');
    if (!container) return;
    
    container.innerHTML = '';
    
    const statusLabels = {
        'P': { label: 'Present', color: '#6ee7b7', icon: 'fa-check' },
        'TP': { label: 'Training Partial', color: '#a5b4fc', icon: 'fa-graduation-cap' },
        'PT': { label: 'Partial Training', color: '#fbbf24', icon: 'fa-clock' },
        'T1': { label: 'Training 1', color: '#fb923c', icon: 'fa-book' },
        'T2': { label: 'Training 2', color: '#fb923c', icon: 'fa-book' },
        'T3': { label: 'Training 3', color: '#fb923c', icon: 'fa-book' },
        'T4': { label: 'Training 4', color: '#fb923c', icon: 'fa-book' },
        'T5': { label: 'Training 5', color: '#fb923c', icon: 'fa-book' },
        '0': { label: 'Absent', color: '#fb7185', icon: 'fa-user-minus' },
        'E': { label: 'Empty Device', color: '#ef4444', icon: 'fa-plug' }
    };
    
    for (const [status, count] of Object.entries(statusBreakdown)) {
        const config = statusLabels[status] || { label: status, color: '#94a3b8', icon: 'fa-question' };
        
        const card = document.createElement('div');
        card.className = 'ss-status-card';
        card.innerHTML = `
            <div class="ss-status-icon" style="background: ${config.color}20; color: ${config.color};">
                <i class="fas ${config.icon}"></i>
            </div>
            <div class="ss-status-info">
                <span class="ss-status-count">${count}</span>
                <span class="ss-status-label">${config.label}</span>
            </div>
        `;
        container.appendChild(card);
    }
}

function renderRoomBreakdown(roomBreakdown) {
    const container = document.getElementById('ssRoomGrid');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (const [room, data] of Object.entries(roomBreakdown)) {
        const percentage = data.count > 0 ? Math.round((data.submitted / data.count) * 100) : 0;
        
        const row = document.createElement('div');
        row.className = 'ss-room-row';
        row.onclick = () => showRoomDetails(room, data);
        row.innerHTML = `
            <div class="ss-room-name">
                <i class="fas fa-door-open"></i> ${room}
            </div>
            <div class="ss-room-stats">
                <div class="ss-room-stat submitted">
                    <span class="stat-num">${data.submitted}</span>
                    <span class="stat-label">Submitted</span>
                </div>
                <div class="ss-room-stat pending">
                    <span class="stat-num">${data.pending}</span>
                    <span class="stat-label">Pending</span>
                </div>
                <div class="ss-room-stat total">
                    <span class="stat-num">${data.count}</span>
                    <span class="stat-label">Total</span>
                </div>
            </div>
            <div class="ss-room-progress">
                <div class="progress-bar" style="width: ${percentage}%"></div>
                <span class="progress-text">${percentage}%</span>
            </div>
        `;
        container.appendChild(row);
    }
}

function renderTaskTypeBreakdown(taskTypeBreakdown) {
    const container = document.getElementById('ssTaskGrid');
    if (!container) return;
    
    container.innerHTML = '';
    
    const taskIcons = {
        'LIDAR': 'fa-satellite',
        'FP QA': 'fa-check-double',
        'Lane Line': 'fa-road',
        'FP': 'fa-edit',
        'QA': 'fa-clipboard-check'
    };
    
    for (const [taskType, data] of Object.entries(taskTypeBreakdown)) {
        const percentage = data.count > 0 ? Math.round((data.submitted / data.count) * 100) : 0;
        const icon = taskIcons[taskType] || 'fa-tasks';
        
        const card = document.createElement('div');
        card.className = 'ss-task-card';
        card.onclick = () => showTaskTypeDetails(taskType, data);
        card.innerHTML = `
            <div class="ss-task-icon">
                <i class="fas ${icon}"></i>
            </div>
            <div class="ss-task-info">
                <span class="ss-task-name">${taskType}</span>
                <div class="ss-task-stats">
                    <span class="submitted">${data.submitted} done</span>
                    <span class="pending">${data.pending} pending</span>
                </div>
            </div>
            <div class="ss-task-progress">
                <div class="progress-ring-small" data-progress="${percentage}">
                    <svg viewBox="0 0 36 36">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none" stroke="#334155" stroke-width="3"/>
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none" stroke="#6ee7b7" stroke-width="3"
                              stroke-dasharray="${percentage}, 100"/>
                    </svg>
                    <span>${percentage}%</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    }
}

/* ============================================
   ✅ NEW: Modal Functions for Breakdown Details
   ============================================ */
function showBreakdown(type) {
    const modal = document.getElementById('breakdownModal');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    
    if (!state.shiftSupervisorData) return;
    
    let content = '';
    
    switch(type) {
        case 'activeUsers':
            title.innerHTML = '<i class="fas fa-users"></i> Active Users Breakdown';
            content = generateActiveUsersBreakdownHTML(state.shiftSupervisorData.roomBreakdown);
            break;
        case 'submitted':
            title.innerHTML = '<i class="fas fa-check-circle"></i> Submitted Tasks Breakdown';
            content = generateSubmittedBreakdownHTML(state.shiftSupervisorData.taskTypeBreakdown);
            break;
        case 'pending':
            title.innerHTML = '<i class="fas fa-clock"></i> Pending Tasks Breakdown';
            content = generatePendingBreakdownHTML(state.shiftSupervisorData.roomBreakdown);
            break;
    }
    
    body.innerHTML = content;
    modal.style.display = 'flex';
}

function showRoomDetails(roomName, roomData) {
    const modal = document.getElementById('breakdownModal');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    
    title.innerHTML = `<i class="fas fa-door-open"></i> ${roomName} - Details`;
    
    body.innerHTML = `
        <div class="breakdown-detail">
            <div class="detail-header">
                <div class="detail-stat">
                    <span class="detail-value">${roomData.count}</span>
                    <span class="detail-label">Total Users</span>
                </div>
                <div class="detail-stat submitted">
                    <span class="detail-value">${roomData.submitted}</span>
                    <span class="detail-label">Submitted</span>
                </div>
                <div class="detail-stat pending">
                    <span class="detail-value">${roomData.pending}</span>
                    <span class="detail-label">Pending</span>
                </div>
            </div>
            <div class="completion-rate">
                <label>Completion Rate:</label>
                <div class="progress-bar-large">
                    <div class="fill" style="width: ${roomData.count > 0 ? Math.round((roomData.submitted/roomData.count)*100) : 0}%"></div>
                </div>
                <span class="rate-text">${roomData.count > 0 ? Math.round((roomData.submitted/roomData.count)*100) : 0}%</span>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function showTaskTypeDetails(taskType, taskData) {
    const modal = document.getElementById('breakdownModal');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    
    title.innerHTML = `<i class="fas fa-tasks"></i> ${taskType} - Task Breakdown`;
    
    body.innerHTML = `
        <div class="breakdown-detail">
            <div class="detail-header">
                <div class="detail-stat">
                    <span class="detail-value">${taskData.count}</span>
                    <span class="detail-label">Total Tasks</span>
                </div>
                <div class="detail-stat submitted">
                    <span class="detail-value">${taskData.submitted}</span>
                    <span class="detail-label">Completed</span>
                </div>
                <div class="detail-stat pending">
                    <span class="detail-value">${taskData.pending}</span>
                    <span class="detail-label">In Progress</span>
                </div>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('breakdownModal');
    if (modal) modal.style.display = 'none';
}

// Helper functions for generating HTML
function generateActiveUsersBreakdownHTML(roomBreakdown) {
    let html = '<div class="breakdown-grid">';
    for (const [room, data] of Object.entries(roomBreakdown)) {
        html += `
            <div class="breakdown-item">
                <h4><i class="fas fa-door-open"></i> ${room}</h4>
                <p>Total: <strong>${data.count}</strong></p>
                <p>Submitted: <strong class="submitted">${data.submitted}</strong></p>
                <p>Pending: <strong class="pending">${data.pending}</strong></p>
            </div>
        `;
    }
    html += '</div>';
    return html;
}

function generateSubmittedBreakdownHTML(taskTypeBreakdown) {
    let html = '<div class="breakdown-grid">';
    for (const [task, data] of Object.entries(taskTypeBreakdown)) {
        html += `
            <div class="breakdown-item">
                <h4><i class="fas fa-tasks"></i> ${task}</h4>
                <p>Completed: <strong class="submitted">${data.submitted}</strong></p>
                <p>Pending: <strong class="pending">${data.pending}</strong></p>
            </div>
        `;
    }
    html += '</div>';
    return html;
}

function generatePendingBreakdownHTML(roomBreakdown) {
    let html = '<div class="breakdown-grid">';
    for (const [room, data] of Object.entries(roomBreakdown)) {
        if (data.pending > 0) {
            html += `
                <div class="breakdown-item warning">
                    <h4><i class="fas fa-exclamation-triangle"></i> ${room}</h4>
                    <p>Pending Users: <strong class="pending">${data.pending}</strong></p>
                </div>
            `;
        }
    }
    html += '</div>';
    return html;
}

/* ============================================
   DATA FETCHING (Optimized - No Demo Fallback)
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

        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        let json;
        try {
            json = await response.json();
        } catch (parseError) {
            throw new Error('Invalid JSON response from server');
        }

        const newData = json.data || {};

        if (Object.keys(newData).length === 0) {
            // ❌ NO MORE DEMO FALLBACK - Show error instead
            throw new Error('No data available for this date. Please check the source sheet.');
        }

        state.rawData = newData;
        state.filteredData = filterDataByUser(state.rawData);
        
        // ✅ Also refresh shift supervisor data if applicable
        if (state.currentUser && state.currentUser.role === 'shift_supervisor') {
            fetchShiftSupervisorData();
        }

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

        updateStatusIndicator('live');
        state.lastError = null;
        state.lastFetchTime = new Date();

    } catch (error) {
        console.error('❌ Fetch Error:', error.message);
        state.lastError = error.message;
        updateStatusIndicator('error');

        let errorTitle = 'Connection Error';
        let errorDetails = error.message;
        let is404Error = false;

        if (error.name === 'AbortError') {
            errorTitle = 'Request Timeout';
            errorDetails = `Server took too long (> ${CONFIG.REQUEST_TIMEOUT/1000}s)`;
        } else if (error.message.includes('404')) {
            errorTitle = 'API Not Found (404)';
            is404Error = true;
        } else if (error.message.includes('Failed to fetch')) {
            errorTitle = 'Network Error';
            errorDetails = 'Check your internet connection';
        }

        if (showLoader || isManual || state.isFirstLoad) {
            showErrorState(errorTitle, errorDetails, error, is404Error);
            state.isFirstLoad = false;
        }
    } finally {
        state.isLoading = false;
    }
}

/** Manual refresh triggered by date picker or button */
function manualRefresh() {
    fetchData(true, true);
    
    // Also refresh shift supervisor data
    if (state.currentUser && state.currentUser.role === 'shift_supervisor') {
        fetchShiftSupervisorData();
    }
}

/** Use custom API URL from error state input */
function useCustomApiUrl() {
    const input = document.getElementById('customApiUrlInput');
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
                    Loading data<span class="loader-dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
            </div>
        </div>
    `;
}

function showErrorState(title, message, error, is404 = false) {
    const timestamp = new Date().toLocaleTimeString();
    const currentUrl = state.customApiUrl || CONFIG.API_URL;

    let solutionHTML = '';
    if (is404) {
        solutionHTML = `
            <div class="solution-box">
                <div class="solution-title"><i class="fas fa-lightbulb"></i> How to Fix This Error</div>
                <ul class="solution-list">
                    <li><strong>Check the Google Apps Script URL</strong> — Make sure it's correct</li>
                    <li><strong>Redeploy the script</strong> — Deploy → Manage deployments → Edit → Redeploy</li>
                    <li><strong>Check permissions</strong> — Ensure "Anyone" can access</li>
                    <li><strong>Use a working URL below</strong> — Enter a valid API URL</li>
                </ul>
            </div>
            <div class="api-url-input-group">
                <label class="api-url-label" for="customApiUrlInput">
                    <i class="fas fa-link"></i> Enter New API URL
                </label>
                <input type="text" id="customApiUrlInput" class="api-url-input"
                       placeholder="https://script.google.com/macros/s/YOUR_ID/exec">
                <button class="btn btn-success" onclick="useCustomApiUrl()" style="margin-top: 10px;">
                    <i class="fas fa-plug"></i> Connect
                </button>
            </div>
        `;
    }

    elements.contentArea.innerHTML = `
        <div class="error-state">
            <div class="error-header">
                <div class="error-icon">
                    <i class="fas ${is404 ? 'fa-unlink' : 'fa-exclamation-triangle'}"></i>
                </div>
                <div class="error-title-section">
                    <div class="error-code">${is404 ? '404' : '⚠'}</div>
                    <div class="error-title">${title}</div>
                    <div class="error-subtitle">${message}</div>
                </div>
            </div>
            <div class="error-message">
                <strong>Error:</strong> ${message}<br><br>
                <strong>Solution:</strong> Check your connection and try again.
            </div>
            <div class="error-actions">
                <button class="btn btn-primary" onclick="manualRefresh()">
                    <i class="fas fa-redo"></i> Try Again
                </button>
            </div>
            ${solutionHTML}
            <div class="debug-info">
                <strong>Technical Details:</strong><br>
                Time: ${timestamp}<br>
                Error: ${error?.message ?? 'N/A'}<br>
                URL: ${currentUrl.substring(0, 60)}...
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
    document.querySelectorAll('.ring-progress').forEach(el => {
        el.style.filter = 'drop-shadow(0 0 15px var(--accent-emerald-glow))';
        setTimeout(() => (el.style.filter = 'drop-shadow(0 0 10px var(--accent-emerald-glow))'), 500);
    });
    
    // Also update shift supervisor numbers smoothly
    if (state.shiftSupervisorData) {
        animateValue('ssTotalActive', state.shiftSupervisorData.summary.totalActiveUsers);
        animateValue('ssTotalSubmitted', state.shiftSupervisorData.summary.totalSubmitted);
        animateValue('ssTotalPending', state.shiftSupervisorData.summary.totalPending);
    }
}

// Helper to animate number changes
function animateValue(elementId, endValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const startValue = parseInt(el.textContent) || 0;
    const duration = 500;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const currentValue = Math.floor(startValue + (endValue - startValue) * progress);
        el.textContent = currentValue;
        
        if (progress < 1) requestAnimationFrame(update);
    }
    
    requestAnimationFrame(update);
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

/* ============================================
   SEARCH (with Debounce)
   ============================================ */
let searchTimeout;
function handleSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        state.searchTerm = elements.searchInput.value.toLowerCase().trim();
        renderData();
    }, CONFIG.UI.debounceDelay || 300); // Debounce delay
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
   RENDERING (Optimized)
   ============================================ */
function renderData() {
    const selectedShift = elements.shiftFilter.value;
    const selectedLocation = elements.locFilter.value;

    const dataToRender = state.filteredData && Object.keys(state.filteredData).length > 0 
        ? state.filteredData 
        : state.rawData;

    elements.contentArea.innerHTML = '';

    if (Object.keys(dataToRender).length === 0) {
        elements.contentArea.innerHTML = `
            <div class="empty-state" style="padding: 80px; text-align: center;">
                <i class="fas fa-inbox" style="font-size: 56px; margin-bottom: 20px; opacity: 0.25;"></i>
                <p style="font-size: 16px;">No data available for this selection.</p>
            </div>
        `;
        return;
    }

    const isGroupView = selectedLocation !== 'all' && CONFIG.LOCATION_GROUPS.hasOwnProperty(selectedLocation);
    let globalAnimationIndex = 0;

    for (const [shift, locations] of Object.entries(dataToRender)) {
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

        elements.contentArea.appendChild(shiftWrapper);
    }
}

/* ---- Grouped Section ---- */
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

/* ---- Individual Location Section ---- */
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
    return {
        submitted: totalSubmitted,
        notSubmitted: totalNotSubmitted,
        total,
        percentage: total > 0 ? Math.round((totalSubmitted / total) * 100) : 0
    };
}

/* ---- Hero Stats Bar + Progress Ring ---- */
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

/* ---- Teams Grid ---- */
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

/* ---- User Box ---- */
function createUserBoxHTML(user, type, index) {
    return `
        <div class="user-box ${type}-box" style="animation-delay: ${index * 40}ms;">
            <span class="u-email">${escapeHTML(user.email)}</span>
            <span class="u-meta"><i class="fas fa-desktop"></i>PC: ${escapeHTML(user.pc)}</span>
        </div>
    `;
}

/* ============================================
   BOOT
   ============================================ */
window.addEventListener('DOMContentLoaded', () => {
    loadLoginUsers();
});
