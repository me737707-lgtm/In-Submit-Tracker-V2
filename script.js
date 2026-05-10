/**
 * ============================================
 * SCRIPT.JS — Application Engine
 * ============================================
 * Depends on: config.js (must be loaded first via defer)
 */

/* ---- Application State ---- */
const state = {
    rawData: {},           // البيانات الأصلية من الـ API
    filteredData: {},      // البيانات بعد الفلترة حسب صلاحية المستخدم
    openTeams: new Set(),
    searchTerm: '',
    lastDataHash: '',
    isFirstLoad: true,
    isLoading: false,
    useDemoData: false,
    lastError: null,
    customApiUrl: null,
    // Login state
    currentUser: null,
    usersData: [],
    isLoggedIn: false
};

/* ---- Cached DOM Elements ---- */
const elements = {};

/* ============================================
   LOGIN FUNCTIONS
   ============================================ */
async function loadLoginUsers(forceRefresh = false) {
    const apiUrl = CONFIG.LOGIN_API_URL + '?action=users';
    
    try {
        console.log('📥 Fetching users from API:', apiUrl);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout
        
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
            
            // احفظ الـ timestamp عشان نعرف آخر تحديث
            state.usersLastUpdate = new Date();
            
        } else {
            console.warn('⚠️ API returned success but no users, using demo users');
            state.usersData = CONFIG.DEMO_USERS || [];
        }
        
    } catch (error) {
        console.error('❌ Failed to load users from API:', error.message);
        console.warn('⚠️ Falling back to demo users');
        
        // استخدم الـ demo users كـ fallback
        if (CONFIG.DEMO_USERS && CONFIG.DEMO_USERS.length > 0) {
            state.usersData = CONFIG.DEMO_USERS;
        } else {
            state.usersData = [];
        }
        
        // اعرض رسالة خطأ في الـ console بس
        console.log('💡 Tip: Make sure the Google Apps Script is deployed and accessible');
    }
}

// دالة لتحديث المستخدمين في الخلفية كل 30 ثانية
function startUsersAutoRefresh() {
    setInterval(() => {
        if (state.isLoggedIn) {
            console.log('🔄 Auto-refreshing users list...');
            loadLoginUsers(true);
        }
    }, 30000); // كل 30 ثانية
}

function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const loginError = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');
    const loginLoading = document.getElementById('loginLoading');
    
    console.log('🔐 Login attempt for:', username);
    console.log('📋 Available users:', state.usersData.map(u => u.username).join(', '));
    
    // Show loading
    loginBtn.style.display = 'none';
    loginLoading.style.display = 'flex';
    loginError.style.display = 'none';
    
    // تأكد من إن عندنا users
    if (!state.usersData || state.usersData.length === 0) {
        console.error('❌ No users loaded!');
        loginError.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>No users available. Please check your connection.</span>';
        loginError.style.display = 'flex';
        loginBtn.style.display = 'flex';
        loginLoading.style.display = 'none';
        return;
    }
    
    // ابحث عن المستخدم (case-insensitive)
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
        
        // Show user info in header
        showUserInfo(user);
        
        // Initialize the app
        initializeApp();
        
        console.log(`%c✅ Login successful: ${user.username} (${user.role} - ${user.permission})`, 
                   'color: #6ee7b7; font-weight: bold; font-size: 14px;');
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

function showUserInfo(user) {
    const userInfo = document.getElementById('userInfo');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userRoleDisplay = document.getElementById('userRoleDisplay');
    
    userNameDisplay.textContent = user.username;
    userRoleDisplay.textContent = user.role === 'supervisors' ? 'SUPERVISOR' : 'QC';
    userRoleDisplay.className = 'user-role ' + (user.role === 'supervisors' ? 'supervisor' : 'qc');
    
    userInfo.style.display = 'flex';
}

function handleLogout() {
    state.currentUser = null;
    state.isLoggedIn = false;
    state.rawData = {};
    state.filteredData = {};
    
    // Clear filters
    elements.shiftFilter.value = 'all';
    elements.locFilter.value = 'all';
    elements.searchInput.value = '';
    state.searchTerm = '';
    
    // Hide user info
    document.getElementById('userInfo').style.display = 'none';
    
    // Show login overlay
    document.getElementById('loginOverlay').style.display = 'flex';
    
    // Clear form
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('loginError').style.display = 'none';
    
    // Clear content
    elements.contentArea.innerHTML = '';
    
    console.log('%c🚪 User logged out', 'color: #fbbf24; font-weight: bold;');
}

/* ============================================
   ✅ FILTER DATA BY USER PERMISSIONS (مصحح)
   ============================================ */
function filterDataByUser(data) {
    if (!state.currentUser) {
        console.log('🔓 No current user - showing all data');
        return data;
    }
    
    console.log('🔐 Filtering data for:', state.currentUser.username, 'Role:', state.currentUser.role, 'Permission:', state.currentUser.permission);
    
    // Supervisors with "all" permission see everything
    if (state.currentUser.role === 'supervisors' && state.currentUser.permission === 'all') {
        console.log('👁️ Supervisor - showing all data');
        return data;
    }
    
    // QC users see only their team
    if (state.currentUser.role === 'Qc' || state.currentUser.permission === 'only') {
        const filteredData = {};
        const userTeamName = state.currentUser.username; // e.g., "Asmaa Khaled"
        let teamsFound = 0;
        
        console.log('🔍 QC User - looking for team matching:', userTeamName);
        
        // Search for team that matches the username + " (M)" or " (N)" or " (ON)"
        for (const [shift, locations] of Object.entries(data)) {
            filteredData[shift] = {};
            
            for (const [location, teams] of Object.entries(locations)) {
                filteredData[shift][location] = {};
                
                for (const [teamName, teamData] of Object.entries(teams)) {
                    // Team name format: "Asmaa Khaled (M)" should match username "Asmaa Khaled"
                    // Remove any suffix like " (M)", " (N)", " (ON)" from team name for comparison
                    const teamBaseName = teamName.replace(/\s*\([A-Z]{1,3}\)\s*$/, '').trim();
                    
                    if (teamBaseName === userTeamName) {
                        filteredData[shift][location][teamName] = teamData;
                        teamsFound++;
                        console.log(`  ✅ Match found: "${teamName}" for user "${userTeamName}"`);
                    }
                }
                
                // Remove empty locations
                if (Object.keys(filteredData[shift][location]).length === 0) {
                    delete filteredData[shift][location];
                }
            }
            
            // Remove empty shifts
            if (Object.keys(filteredData[shift]).length === 0) {
                delete filteredData[shift];
            }
        }
        
        console.log(`📊 QC Filter Result: Found ${teamsFound} team(s) for user "${userTeamName}"`);
        return filteredData;
    }
    
    // Default: show all
    console.log('⚠️ Unknown role/permission - showing all data');
    return data;
}

/* ============================================
   INITIALIZATION
   ============================================ */
async function initializeApp() {
    console.log('%c🚀 Submit Tracker v2.0', 'color: #6ee7b7; font-size: 18px; font-weight: bold;');
    console.log('%c⚠️ Enhanced Error Handling & Demo Mode', 'color: #fbbf24; font-size: 12px;');

    // Load login users first
    await loadLoginUsers();
    
    // ✅ ابدأ الـ auto-refresh
    startUsersAutoRefresh();

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
    console.log(`ShowLoader: ${showLoader} | Manual: ${isManual}`);

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
            console.log('✅ JSON Parsed Successfully:', json);
        } catch (parseError) {
            console.error('❌ JSON Parse Failed:', parseError);
            throw new Error('Invalid JSON response');
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

        // ✅ تطبيق الفلترة حسب صلاحية المستخدم وتخزين النتيجة
        state.filteredData = filterDataByUser(state.rawData);

        // ✅ استخدام البيانات المفلترة لحساب الـ hash والعرض
        const newDataHash = generateDataHash(state.filteredData);

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
            errorDetails = `Server took too long to respond (> ${CONFIG.REQUEST_TIMEOUT / 1000}s). The API might be slow or offline.`;
        } else if (error.message.includes('404')) {
            errorTitle   = 'API Not Found (404)';
            errorDetails = `The Google Apps Script URL doesn't exist or has been deleted.`;
            is404Error   = true;
        } else if (error.message.includes('HTTP')) {
            errorTitle   = 'Server Error';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            errorTitle   = 'Network Error';
            errorDetails = 'Cannot connect to the server. Check your internet connection or CORS settings.';
        }

        // Fall back to demo data
        if (!state.useDemoData) {
            console.log('🔄 Switching to DEMO DATA mode...');
            state.useDemoData = true;
            state.rawData     = CONFIG.DEMO_DATA;
            state.filteredData = filterDataByUser(state.rawData);
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

/** Triggered by the date picker and the "Try Again" button. */
function manualRefresh() {
    console.log('🔄 Manual Refresh triggered...');
    fetchData(true, true);
}

/** Tries to connect to a URL the user typed into the error-state input. */
function useCustomApiUrl() {
    const input  = document.getElementById('customApiUrlInput');
    const newUrl = input.value.trim();

    if (!newUrl) { alert('Please enter a valid API URL'); return; }

    console.log('🔧 Setting custom API URL:', newUrl);
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
                <div class="solution-title">
                    <i class="fas fa-lightbulb"></i>
                    How to Fix This Error (404)
                </div>
                <ul class="solution-list">
                    <li><strong>Check the Google Apps Script URL</strong> — Make sure it's correct and not deleted</li>
                    <li><strong>Redeploy the script</strong> — Go to Google Apps Script → Deploy → Manage deployments → Edit → Redeploy</li>
                    <li><strong>Check permissions</strong> — Ensure "Anyone" can access the script</li>
                    <li><strong>Use a working URL below</strong> — Enter a valid API URL in the field below</li>
                    <li><strong>Or use Demo Mode</strong> — The dashboard is currently showing sample data</li>
                </ul>
            </div>
            <div class="api-url-input-group">
                <label class="api-url-label" for="customApiUrlInput">
                    <i class="fas fa-link"></i> Enter New API URL (Optional)
                </label>
                <input type="text"
                       id="customApiUrlInput"
                       class="api-url-input"
                       placeholder="https://script.google.com/macros/s/YOUR_ID/exec"
                       value="">
                <button class="btn btn-success" onclick="useCustomApiUrl()" style="margin-top: 10px;">
                    <i class="fas fa-plug"></i> Connect to This URL
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
                <strong>What happened:</strong> ${message}<br><br>
                <strong>Current status:</strong> Dashboard is running in
                <span style="color: var(--accent-yellow); font-weight: bold;">DEMO MODE</span>
                with sample data.<br>
                You can still explore all features and test the interface!
            </div>
            <div class="error-actions">
                <button class="btn btn-primary" onclick="manualRefresh()">
                    <i class="fas fa-redo"></i> Try Again
                </button>
                <button class="btn btn-success" onclick="loadDemoOnly()">
                    <i class="fas fa-eye"></i> Show Demo Dashboard
                </button>
            </div>
            ${solutionHTML}
            <div class="debug-info">
                <strong>🔍 Technical Details:</strong><br>
                ────────────────────────────────<br>
                Timestamp: ${timestamp}<br>
                Error Type: ${error?.name ?? 'Unknown'}<br>
                Error Message: ${error?.message ?? 'N/A'}<br>
                Using Demo Data: ${state.useDemoData ? '✅ Yes' : 'No'}<br>
                API URL Attempted: ${currentUrl.substring(0, 60)}...<br>
                Request Timeout: ${CONFIG.REQUEST_TIMEOUT / 1000}s<br>
                ────────────────────────────────<br>
                <br>
                💡 <strong>Tip:</strong> Open browser Console (F12) for more details
            </div>
        </div>
    `;
}

/** Switches to demo data without trying to connect. */
function loadDemoOnly() {
    console.log('🎭 Loading Demo Dashboard only...');
    state.useDemoData = true;
    state.rawData     = CONFIG.DEMO_DATA;
    state.filteredData = filterDataByUser(state.rawData);
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
    document.querySelectorAll('.ring-progress').forEach(el => {
        el.style.filter = 'drop-shadow(0 0 15px var(--accent-emerald-glow))';
        setTimeout(() => (el.style.filter = 'drop-shadow(0 0 10px var(--accent-emerald-glow))'), 500);
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

    // ✅ استخدام البيانات المفلترة لبناء الفلاتر
    const dataToUse = state.filteredData && Object.keys(state.filteredData).length > 0 
        ? state.filteredData 
        : state.rawData;

    Object.keys(dataToUse).forEach(shift => {
        shifts.add(shift);
        Object.keys(dataToUse[shift]).forEach(loc => locations.add(loc));
    });

    // Add any configured group names that aren't already locations
    Object.keys(CONFIG.LOCATION_GROUPS).forEach(groupName => locations.add(groupName));

    const currentShift = elements.shiftFilter.value;
    const currentLoc   = elements.locFilter.value;

    // Rebuild shift filter
    elements.shiftFilter.innerHTML = '<option value="all">All Shifts</option>';
    Array.from(shifts).sort().forEach(shift => {
        const opt = document.createElement('option');
        opt.value = shift;
        opt.textContent = `Shift: ${shift}`;
        if (shift === currentShift) opt.selected = true;
        elements.shiftFilter.appendChild(opt);
    });

    // Rebuild location filter
    elements.locFilter.innerHTML = '<option value="all">All Locations</option>';

    if (state.useDemoData) {
        const demoOpt = document.createElement('option');
        demoOpt.value = '__demo__';
        demoOpt.textContent = '📦 Demo Data Mode';
        demoOpt.style.fontWeight = 'bold';
        demoOpt.style.color = '#fbbf24';
        elements.locFilter.appendChild(demoOpt);
    }

    // Add configured location groups first
    Object.keys(CONFIG.LOCATION_GROUPS).sort().forEach(groupName => {
        const opt = document.createElement('option');
        opt.value = groupName;
        opt.textContent = `📍 ${groupName}`;
        opt.style.fontWeight = 'bold';
        if (groupName === currentLoc) opt.selected = true;
        elements.locFilter.appendChild(opt);
    });

    // Add remaining individual locations that aren't inside a group
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

    // ✅ لو المستخدم QC، نقيد الفلاتر
    if (state.currentUser && (state.currentUser.role === 'Qc' || state.currentUser.permission === 'only')) {
        // نخفي الـ location filter لأن الـ QC مش المفروض يقلب بين اللوكيشنز
        // أو نخليه موجود بس مقفل
        console.log('🔒 QC User - filters restricted');
    }
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
   ✅ RENDERING (مصحح - يستخدم البيانات المفلترة)
   ============================================ */
function renderData() {
    const selectedShift    = elements.shiftFilter.value;
    const selectedLocation = elements.locFilter.value;

    // ✅ استخدام البيانات المفلترة للعرض
    const dataToRender = state.filteredData && Object.keys(state.filteredData).length > 0 
        ? state.filteredData 
        : state.rawData;

    console.log('🎨 Rendering Dashboard...', { 
        useDemo: state.useDemoData, 
        shifts: Object.keys(dataToRender).length,
        currentUser: state.currentUser?.username,
        userRole: state.currentUser?.role,
        isFiltered: state.filteredData && Object.keys(state.filteredData).length > 0
    });

    elements.contentArea.innerHTML = '';

    if (Object.keys(dataToRender).length === 0) {
        elements.contentArea.innerHTML = `
            <div class="empty-state" style="padding: 80px; text-align: center;">
                <i class="fas fa-inbox" style="font-size: 56px; margin-bottom: 20px; opacity: 0.25; display: block;"></i>
                <p style="font-size: 16px;">
                    ${state.currentUser && (state.currentUser.role === 'Qc' || state.currentUser.permission === 'only')
                        ? 'No data found for your team. Please contact your supervisor.' 
                        : 'No data available.'}
                </p>
            </div>
        `;
        return;
    }

    const isGroupView = selectedLocation !== 'all' && CONFIG.LOCATION_GROUPS.hasOwnProperty(selectedLocation);
    let globalAnimationIndex = 0;

    // ✅ التكرار على البيانات المفلترة
    for (const [shift, locations] of Object.entries(dataToRender)) {
        if (selectedShift !== 'all' && shift !== selectedShift) continue;

        const shiftWrapper = document.createElement('div');
        shiftWrapper.innerHTML = `<div class="shift-tag"><i class="fas fa-clock"></i> Shift: ${shift}</div>`;

        if (isGroupView) {
            const groupSection = createGroupedLocationSection(selectedLocation, shift, locations, globalAnimationIndex);
            if (groupSection) shiftWrapper.appendChild(groupSection);
        } else {
            const renderedLocations = new Set();

            // First pass: render configured location groups
            Object.keys(CONFIG.LOCATION_GROUPS).forEach(groupName => {
                if (selectedLocation !== 'all' && selectedLocation !== groupName) return;

                const groupMembers      = CONFIG.LOCATION_GROUPS[groupName];
                const availableMembers  = groupMembers.filter(loc => locations.hasOwnProperty(loc));

                if (availableMembers.length > 0) {
                    globalAnimationIndex++;
                    const groupSection = createGroupedLocationSection(groupName, shift, locations, globalAnimationIndex, availableMembers);
                    shiftWrapper.appendChild(groupSection);
                    availableMembers.forEach(loc => renderedLocations.add(loc));
                }
            });

            // Second pass: render standalone locations not part of any group
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

/* ---- Grouped Section (e.g. "Saint Fatima" containing multiple rooms) ---- */
function createGroupedLocationSection(groupName, shift, allLocations, delayIndex, specificRooms = null) {
    const roomsToRender  = specificRooms || getGroupLocations(groupName);
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
            totalSubmitted    += team.submitted.length;
            totalNotSubmitted += team.notSubmitted.length;
        });
    });

    const total      = totalSubmitted + totalNotSubmitted;
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
            ${state.useDemoData ? '<span class="demo-badge">DEMO DATA</span>' : ''}
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
            ${state.useDemoData ? '<span class="demo-badge">DEMO</span>' : ''}
        </div>
        ${createHeroStatsHTML(stats)}
        ${createTeamsGridHTML(teams, shift, locName)}
    `;

    return section;
}

function calculateLocationStats(teams) {
    let totalSubmitted = 0, totalNotSubmitted = 0;
    Object.values(teams).forEach(team => {
        totalSubmitted    += team.submitted.length;
        totalNotSubmitted += team.notSubmitted.length;
    });
    const total = totalSubmitted + totalNotSubmitted;
    return {
        submitted:    totalSubmitted,
        notSubmitted: totalNotSubmitted,
        total,
        percentage: total > 0 ? Math.round((totalSubmitted / total) * 100) : 0
    };
}

/* ---- Hero Stats Bar + Progress Ring ---- */
function createHeroStatsHTML(stats) {
    const radius       = 54;
    const circumference = 2 * Math.PI * radius;
    const dashOffset   = circumference - (stats.percentage / 100) * circumference;

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
    let teamsHTML  = '<div class="teams-grid">';
    let cardIndex  = 0;

    for (const [tlName, teamData] of Object.entries(teams)) {
        const tlID  = generateCardID(shift, locName, tlName);
        const isActive = state.openTeams.has(tlID) ? 'active' : '';

        const filteredNotSubmitted = teamData.notSubmitted.filter(u => matchesSearch(u.email, u.pc));
        const filteredSubmitted    = teamData.submitted.filter(u => matchesSearch(u.email, u.pc));

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
    // Load login users immediately
    loadLoginUsers();
});
