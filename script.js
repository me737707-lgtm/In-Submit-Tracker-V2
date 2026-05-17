/**
 * ============================================
 * SCRIPT.JS — Application Engine (Corrected)
 * Compatible with: index.html + config.js + Code.gs
 * ============================================
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
  useDemoData: false,
  lastError: null,
  currentUser: null,
  usersData: [],
  isLoggedIn: false,
  usersRefreshInterval: null
};

/* ---- Cached DOM Elements ---- */
const elements = {};

/* ============================================
   LOGIN FUNCTIONS
   ============================================ */

async function loadLoginUsers() {
  const apiUrl = CONFIG.LOGIN_API_URL + '?action=users';
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (data.success && data.users && data.users.length > 0) {
      state.usersData = data.users;
    } else {
      state.usersData = CONFIG.DEMO_USERS || [];
    }
  } catch (error) {
    console.warn('⚠️ Using demo users (API failed):', error.message);
    state.usersData = CONFIG.DEMO_USERS || [];
  }
}

function handleLogin(event) {
  event.preventDefault();
  
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const loginError = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');
  const loginLoading = document.getElementById('loginLoading');
  
  // Show loading
  loginBtn.style.display = 'none';
  loginLoading.style.display = 'flex';
  loginError.style.display = 'none';
  
  // Find user (case-insensitive)
  const user = state.usersData.find(u =>
    u.username.toString().toLowerCase() === username.toLowerCase() &&
    u.password.toString() === password
  );
  
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
    
    console.log(`✅ Login: ${user.username} (${user.role})`);
  } else {
    // ❌ Login failed
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
  
  if (state.usersRefreshInterval) {
    clearInterval(state.usersRefreshInterval);
  }
  
  // Reset filters
  if (elements.shiftFilter) elements.shiftFilter.value = 'all';
  if (elements.locFilter) elements.locFilter.value = 'all';
  if (elements.searchInput) elements.searchInput.value = '';
  state.searchTerm = '';
  
  // Hide user info
  const userInfo = document.getElementById('userInfo');
  if (userInfo) userInfo.style.display = 'none';
  
  // Reset login form
  document.getElementById('loginLoading').style.display = 'none';
  document.getElementById('loginBtn').style.display = 'flex';
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  
  // Show login overlay
  document.getElementById('loginOverlay').style.display = 'flex';
  
  // Clear content
  if (elements.contentArea) elements.contentArea.innerHTML = '';
}

/* ============================================
   FILTER DATA BY USER PERMISSIONS
   ============================================ */

function filterDataByUser(data) {
  if (!state.currentUser) return data;
  
  // Supervisors with "all" see everything
  if (state.currentUser.role === 'supervisors' && state.currentUser.permission === 'all') {
    return data;
  }
  
  // QC users see only their team
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

/* ============================================
   INITIALIZATION
   ============================================ */

async function initializeApp() {
  console.log('🚀 Submit Tracker initializing...');
  
  // Load users first
  await loadLoginUsers();
  
  // Cache DOM elements
  elements.contentArea = document.getElementById('contentArea');
  elements.shiftFilter = document.getElementById('shiftFilter');
  elements.locFilter = document.getElementById('locFilter');
  elements.datePicker = document.getElementById('datePicker');
  elements.searchInput = document.getElementById('searchInput');
  elements.statusIndicator = document.getElementById('statusIndicator');
  elements.statusDot = document.getElementById('statusDot');
  elements.statusText = document.getElementById('statusText');
  elements.silentUpdate = document.getElementById('silentUpdate');
  
  // Set default date
  elements.datePicker.value = new Date().toISOString().split('T')[0];
  
  // Initial status
  updateStatusIndicator('loading');
  
  // Fetch data
  fetchData(true);
  
  // Auto-refresh
  setInterval(() => fetchData(false), CONFIG.REFRESH_INTERVAL);
  
  // Keyboard shortcut: Ctrl+K → search
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      elements.searchInput.focus();
    }
  });
}

function updateStatusIndicator(status) {
  const { statusIndicator, statusDot, statusText } = elements;
  if (!statusIndicator) return;
  
  statusIndicator.className = 'status-indicator ' + status;
  statusDot.className = 'status-dot ' + status + '-dot';
  
  const labels = {
    live: 'LIVE - Connected',
    demo: 'DEMO MODE',
    error: 'CONNECTION ERROR',
    loading: 'CONNECTING...'
  };
  statusText.textContent = labels[status] || 'CONNECTING...';
}

/* ============================================
   DATA FETCHING
   ============================================ */

async function fetchData(showLoader = false, isManual = false) {
  if (state.isLoading && !isManual) return;
  
  const apiUrl = CONFIG.API_URL;
  const date = formatDateForAPI(elements.datePicker.value);
  const fetchUrl = `${apiUrl}?date=${date}`;
  
  try {
    state.isLoading = true;
    if (showLoader || isManual) showLoadingState(true);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
    
    const response = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const json = await response.json();
    const newData = json.data || {};
    
    if (Object.keys(newData).length === 0) {
      state.useDemoData = true;
      state.rawData = CONFIG.DEMO_DATA;
      updateStatusIndicator('demo');
    } else {
      state.useDemoData = false;
      state.rawData = newData;
      updateStatusIndicator('live');
    }
    
    // Apply user filtering
    state.filteredData = filterDataByUser(state.rawData);
    
    // Render
    const newDataHash = generateDataHash(state.filteredData);
    if (newDataHash !== state.lastDataHash) {
      state.lastDataHash = newDataHash;
      if (state.isFirstLoad || isManual) {
        updateFilters();
        renderData();
        state.isFirstLoad = false;
        if (showLoader || isManual) showLoadingState(false);
      } else {
        showSilentUpdate();
      }
    }
    
    state.lastError = null;
    
  } catch (error) {
    console.error('❌ Fetch error:', error.message);
    state.lastError = error.message;
    updateStatusIndicator('error');
    
    // Fallback to demo
    if (!state.useDemoData) {
      state.useDemoData = true;
      state.rawData = CONFIG.DEMO_DATA;
      state.filteredData = filterDataByUser(state.rawData);
      updateFilters();
      renderData();
    }
    
    if (showLoader || isManual || state.isFirstLoad) {
      showErrorState('Connection Error', error.message, error);
      state.isFirstLoad = false;
    }
  } finally {
    state.isLoading = false;
  }
}

function manualRefresh() {
  fetchData(true, true);
}

/* ============================================
   STATE DISPLAY HELPERS
   ============================================ */

function showLoadingState(show) {
  if (!show || !elements.contentArea) return;
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
  if (!elements.contentArea) return;
  elements.contentArea.innerHTML = `
    <div class="error-state">
      <div class="error-header">
        <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
        <div class="error-title-section">
          <div class="error-code">⚠</div>
          <div class="error-title">${title}</div>
          <div class="error-subtitle">${message}</div>
        </div>
      </div>
      <div class="error-message">
        <strong>Status:</strong> Running in <span style="color:var(--accent-yellow)">DEMO MODE</span><br>
        You can still explore all features!
      </div>
      <div class="error-actions">
        <button class="btn btn-primary" onclick="manualRefresh()">
          <i class="fas fa-redo"></i> Try Again
        </button>
        <button class="btn btn-success" onclick="loadDemoOnly()">
          <i class="fas fa-eye"></i> Show Demo Dashboard
        </button>
      </div>
    </div>
  `;
}

function loadDemoOnly() {
  state.useDemoData = true;
  state.rawData = CONFIG.DEMO_DATA;
  state.filteredData = filterDataByUser(state.rawData);
  updateStatusIndicator('demo');
  updateFilters();
  renderData();
}

function showSilentUpdate() {
  if (!elements.silentUpdate) return;
  elements.silentUpdate.classList.add('show');
  setTimeout(() => elements.silentUpdate.classList.remove('show'), 2500);
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
  
  const dataToUse = (state.filteredData && Object.keys(state.filteredData).length > 0)
    ? state.filteredData : state.rawData;
  
  Object.keys(dataToUse).forEach(shift => {
    shifts.add(shift);
    Object.keys(dataToUse[shift]).forEach(loc => locations.add(loc));
  });
  
  Object.keys(CONFIG.LOCATION_GROUPS).forEach(groupName => locations.add(groupName));
  
  // Rebuild shift filter
  elements.shiftFilter.innerHTML = '<option value="all">All Shifts</option>';
  Array.from(shifts).sort().forEach(shift => {
    const opt = document.createElement('option');
    opt.value = shift;
    opt.textContent = `Shift: ${shift}`;
    elements.shiftFilter.appendChild(opt);
  });
  
  // Rebuild location filter
  elements.locFilter.innerHTML = '<option value="all">All Locations</option>';
  Object.keys(CONFIG.LOCATION_GROUPS).sort().forEach(groupName => {
    const opt = document.createElement('option');
    opt.value = groupName;
    opt.textContent = `📍 ${groupName}`;
    opt.style.fontWeight = 'bold';
    elements.locFilter.appendChild(opt);
  });
  
  const groupedLocs = new Set(Object.values(CONFIG.LOCATION_GROUPS).flat());
  Array.from(locations).filter(loc =>
    !groupedLocs.has(loc) && !Object.keys(CONFIG.LOCATION_GROUPS).includes(loc)
  ).sort().forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc;
    opt.textContent = loc;
    elements.locFilter.appendChild(opt);
  });
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
  return email.toLowerCase().includes(state.searchTerm) || String(pc).toLowerCase().includes(state.searchTerm);
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
  const selectedShift = elements.shiftFilter.value;
  const selectedLocation = elements.locFilter.value;
  const dataToRender = (state.filteredData && Object.keys(state.filteredData).length > 0)
    ? state.filteredData : state.rawData;
  
  if (!elements.contentArea) return;
  elements.contentArea.innerHTML = '';
  
  if (Object.keys(dataToRender).length === 0) {
    elements.contentArea.innerHTML = `
      <div class="empty-state" style="padding:80px;text-align:center">
        <i class="fas fa-inbox" style="font-size:56px;margin-bottom:20px;opacity:0.25"></i>
        <p>No data available</p>
      </div>
    `;
    return;
  }
  
  const isGroupView = selectedLocation !== 'all' && CONFIG.LOCATION_GROUPS.hasOwnProperty(selectedLocation);
  let animationIndex = 0;
  
  for (const [shift, locations] of Object.entries(dataToRender)) {
    if (selectedShift !== 'all' && shift !== selectedShift) continue;
    
    const shiftWrapper = document.createElement('div');
    shiftWrapper.innerHTML = `<div class="shift-tag"><i class="fas fa-clock"></i> Shift: ${shift}</div>`;
    
    if (isGroupView) {
      const groupSection = createGroupedSection(selectedLocation, shift, locations, animationIndex);
      if (groupSection) shiftWrapper.appendChild(groupSection);
    } else {
      const rendered = new Set();
      
      // Render groups first
      Object.keys(CONFIG.LOCATION_GROUPS).forEach(groupName => {
        if (selectedLocation !== 'all' && selectedLocation !== groupName) return;
        const members = CONFIG.LOCATION_GROUPS[groupName].filter(loc => locations.hasOwnProperty(loc));
        if (members.length > 0) {
          animationIndex++;
          const section = createGroupedSection(groupName, shift, locations, animationIndex, members);
          shiftWrapper.appendChild(section);
          members.forEach(loc => rendered.add(loc));
        }
      });
      
      // Render standalone locations
      for (const [locName, teams] of Object.entries(locations)) {
        if (selectedLocation !== 'all' && locName !== selectedLocation) continue;
        if (rendered.has(locName)) continue;
        animationIndex++;
        const section = createLocationSection(locName, teams, shift, animationIndex * 80);
        shiftWrapper.appendChild(section);
      }
    }
    
    elements.contentArea.appendChild(shiftWrapper);
  }
}

function createGroupedSection(groupName, shift, allLocations, delayIndex, specificRooms = null) {
  const rooms = specificRooms || CONFIG.LOCATION_GROUPS[groupName];
  const available = rooms.filter(r => allLocations.hasOwnProperty(r));
  if (available.length === 0) return null;
  
  const section = document.createElement('div');
  section.className = 'location-section';
  section.style.animationDelay = `${delayIndex * 80}ms`;
  
  let totalSub = 0, totalPend = 0, roomData = {};
  available.forEach(room => {
    roomData[room] = allLocations[room];
    Object.values(allLocations[room]).forEach(team => {
      totalSub += team.submitted.length;
      totalPend += team.notSubmitted.length;
    });
  });
  
  const total = totalSub + totalPend;
  const pct = total > 0 ? Math.round((totalSub / total) * 100) : 0;
  
  let roomsHTML = '';
  available.forEach((room, idx) => {
    roomsHTML += `
      <div class="room-subsection" style="animation-delay:${(delayIndex * 80) + ((idx+1)*100)}ms">
        <div class="room-title"><i class="fas fa-door-open"></i> ${room}</div>
        ${createTeamsGrid(allLocations[room], shift, room, idx)}
      </div>
    `;
  });
  
  section.innerHTML = `
    <div class="location-title">
      <div class="location-icon"><i class="fas fa-building"></i></div>
      ${groupName}
      ${state.useDemoData ? '<span class="demo-badge">DEMO</span>' : ''}
      <span style="font-size:14px;color:var(--text-muted)">(${available.length} rooms)</span>
    </div>
    ${createHeroStats({ submitted: totalSub, notSubmitted: totalPend, total, percentage: pct })}
    <div class="room-group">${roomsHTML}</div>
  `;
  return section;
}

function createLocationSection(locName, teams, shift, delay) {
  const section = document.createElement('div');
  section.className = 'location-section';
  section.style.animationDelay = `${delay}ms`;
  
  const stats = calculateStats(teams);
  
  section.innerHTML = `
    <div class="location-title">
      <div class="location-icon"><i class="fas fa-map-marker-alt"></i></div>
      ${locName}
      ${state.useDemoData ? '<span class="demo-badge">DEMO</span>' : ''}
    </div>
    ${createHeroStats(stats)}
    ${createTeamsGrid(teams, shift, locName)}
  `;
  return section;
}

function calculateStats(teams) {
  let sub = 0, pend = 0;
  Object.values(teams).forEach(team => {
    sub += team.submitted.length;
    pend += team.notSubmitted.length;
  });
  const total = sub + pend;
  return {
    submitted: sub,
    notSubmitted: pend,
    total,
    percentage: total > 0 ? Math.round((sub / total) * 100) : 0
  };
}

function createHeroStats(stats) {
  const r = 54, c = 2 * Math.PI * r;
  const offset = c - (stats.percentage / 100) * c;
  
  return `
    <div class="hero-stats">
      <div class="stat-card submitted"><div class="stat-icon"><i class="fas fa-check-circle"></i></div><div class="stat-info"><span class="stat-label">Submitted</span><span class="stat-value">${stats.submitted}</span></div></div>
      <div class="stat-card not-submitted"><div class="stat-icon"><i class="fas fa-exclamation-circle"></i></div><div class="stat-info"><span class="stat-label">Pending</span><span class="stat-value">${stats.notSubmitted}</span></div></div>
      <div class="stat-card total"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-info"><span class="stat-label">Total</span><span class="stat-value">${stats.total}</span></div></div>
      <div class="progress-ring-container">
        <div class="ring-wrapper">
          <svg class="progress-ring-svg" viewBox="0 0 120 120">
            <circle class="ring-bg" cx="60" cy="60" r="${r}"/>
            <circle class="ring-progress" cx="60" cy="60" r="${r}" style="stroke-dashoffset:${offset}"/>
          </svg>
          <div class="ring-center"><div class="ring-percentage">${stats.percentage}%</div><div class="ring-label">Complete</div></div>
        </div>
        <div class="ring-details">
          <div class="detail-row"><span class="detail-dot done"></span><span>${stats.submitted} Done</span></div>
          <div class="detail-row"><span class="detail-dot pending"></span><span>${stats.notSubmitted} Remaining</span></div>
        </div>
      </div>
    </div>
  `;
}

function createTeamsGrid(teams, shift, locName, roomIdx = 0) {
  let html = '<div class="teams-grid">';
  let cardIdx = 0;
  
  for (const [tlName, teamData] of Object.entries(teams)) {
    const tlID = generateCardID(shift, locName, tlName);
    const active = state.openTeams.has(tlID) ? 'active' : '';
    
    const filteredPend = teamData.notSubmitted.filter(u => matchesSearch(u.email, u.pc));
    const filteredSub = teamData.submitted.filter(u => matchesSearch(u.email, u.pc));
    
    if (state.searchTerm && filteredPend.length === 0 && filteredSub.length === 0) continue;
    
    cardIdx++;
    const delay = (roomIdx + 1) * 60 + cardIdx * 60;
    
    html += `
      <div class="team-card ${active}" id="${tlID}" style="animation-delay:${delay}ms">
        <div class="team-header" onclick="toggleTeam('${tlID}')">
          <div class="tl-info">
            <span class="team-name"><i class="fas fa-user-tie"></i> ${tlName}</span>
            <div class="tl-badge-container">
              <span class="badge badge-done"><span class="badge-dot"></span>Done: ${filteredSub.length}</span>
              <span class="badge badge-not"><span class="badge-dot"></span>Pending: ${filteredPend.length}</span>
            </div>
          </div>
          <div class="chevron-icon"><i class="fas fa-chevron-down"></i></div>
        </div>
        <div class="team-content">
          <div class="content-inner">
            <div class="split-view">
              <div class="column">
                <div class="col-title not-submit"><i class="fas fa-clock"></i>Pending<span class="col-count">${filteredPend.length}</span></div>
                ${filteredPend.length > 0 ? filteredPend.map((u,i) => createUserBox(u,'not-sub',i)).join('') : '<div class="empty-state">No pending</div>'}
              </div>
              <div class="column">
                <div class="col-title submit"><i class="fas fa-check-double"></i>Submitted<span class="col-count">${filteredSub.length}</span></div>
                ${filteredSub.length > 0 ? filteredSub.map((u,i) => createUserBox(u,'sub',i)).join('') : '<div class="empty-state">No submissions</div>'}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

function createUserBox(user, type, index) {
  return `
    <div class="user-box ${type}-box" style="animation-delay:${index * 40}ms">
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
