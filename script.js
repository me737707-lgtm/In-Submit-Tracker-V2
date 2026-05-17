/**
 * ============================================
 * APP.JS - Enterprise Dashboard Application
 * Optimized for Performance & Scalability
 * ============================================
 */

const App = {
  // State Management
  state: {
    currentUser: null,
    rawData: {},
    filteredData: {},
    isLoading: false,
    searchTerm: '',
    lastUpdate: null,
    cache: new Map(),
    refreshInterval: null
  },

  // DOM Elements Cache
  elements: {},

  /**
   * Initialize Application
   */
  async init() {
    console.log('%c🚀 Initializing Enterprise Dashboard...', 'color: #6ee7b7; font-weight: bold;');
    
    // Cache DOM elements
    this.cacheElements();
    
    // Set default date
    this.elements.datePicker.value = new Date().toISOString().split('T')[0];
    
    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();
    
    // Check for existing session
    const savedUser = sessionStorage.getItem('currentUser');
    if (savedUser) {
      this.state.currentUser = JSON.parse(savedUser);
      this.showMainApp();
    }
    
    // Hide loader
    setTimeout(() => {
      document.getElementById('appLoader').style.opacity = '0';
      setTimeout(() => {
        document.getElementById('appLoader').style.display = 'none';
      }, 300);
    }, 500);
  },

  /**
   * Cache DOM Elements for Performance
   */
  cacheElements() {
    this.elements = {
      loginScreen: document.getElementById('loginScreen'),
      appContainer: document.getElementById('appContainer'),
      loginForm: document.getElementById('loginForm'),
      loginError: document.getElementById('loginError'),
      loginErrorText: document.getElementById('loginErrorText'),
      loginLoading: document.getElementById('loginLoading'),
      loginBtn: document.getElementById('loginBtn'),
      username: document.getElementById('username'),
      password: document.getElementById('password'),
      contentArea: document.getElementById('contentArea'),
      metricsGrid: document.getElementById('metricsGrid'),
      shiftFilter: document.getElementById('shiftFilter'),
      locationFilter: document.getElementById('locationFilter'),
      datePicker: document.getElementById('datePicker'),
      searchInput: document.getElementById('searchInput'),
      userNameDisplay: document.getElementById('userNameDisplay'),
      userRoleDisplay: document.getElementById('userRoleDisplay'),
      userDropdown: document.getElementById('userDropdown'),
      sidebar: document.getElementById('sidebar'),
      adminNav: document.getElementById('adminNav'),
      dashboardView: document.getElementById('dashboardView'),
      userManagementView: document.getElementById('userManagementView')
    };
  },

  /**
   * Handle Login
   */
  async handleLogin(event) {
    event.preventDefault();
    
    const username = this.elements.username.value.trim();
    const password = this.elements.password.value.trim();
    
    // Show loading state
    this.elements.loginBtn.style.display = 'none';
    this.elements.loginLoading.style.display = 'flex';
    this.elements.loginError.style.display = 'none';
    
    try {
      const response = await this.apiCall('login', { username, password });
      
      if (response.success) {
        this.state.currentUser = response.user;
        sessionStorage.setItem('currentUser', JSON.stringify(response.user));
        
        this.showMainApp();
        this.showToast('Welcome back, ' + username + '!', 'success');
      } else {
        throw new Error(response.error || 'Login failed');
      }
    } catch (error) {
      this.elements.loginErrorText.textContent = error.message;
      this.elements.loginError.style.display = 'flex';
      this.elements.loginBtn.style.display = 'flex';
      this.elements.loginLoading.style.display = 'none';
    }
  },

  /**
   * Show Main Application
   */
  showMainApp() {
    this.elements.loginScreen.style.display = 'none';
    this.elements.appContainer.style.display = 'block';
    
    // Update UI with user info
    this.elements.userNameDisplay.textContent = this.state.currentUser.username;
    this.elements.userRoleDisplay.textContent = this.getRoleDisplayName(this.state.currentUser.role);
    
    // Show admin panel for admins
    if (this.state.currentUser.role === 'admin') {
      this.elements.adminNav.style.display = 'flex';
    }
    
    // Initialize dashboard
    this.initializeDashboard();
  },

  /**
   * Initialize Dashboard
   */
  async initializeDashboard() {
    await this.loadFilters();
    await this.fetchData(true);
    
    // Start auto-refresh
    if (CONFIG.FEATURES.ENABLE_AUTO_REFRESH) {
      this.state.refreshInterval = setInterval(() => {
        this.fetchData(false);
      }, CONFIG.REFRESH_INTERVAL);
    }
  },

  /**
   * Load Filters
   */
  async loadFilters() {
    // Load shifts
    CONFIG.SHIFTS.forEach(shift => {
      const option = document.createElement('option');
      option.value = shift;
      option.textContent = `Shift ${shift}`;
      this.elements.shiftFilter.appendChild(option);
    });
    
    // Load locations
    Object.keys(CONFIG.LOCATION_GROUPS).forEach(group => {
      const option = document.createElement('option');
      option.value = group;
      option.textContent = `📍 ${group}`;
      this.elements.locationFilter.appendChild(option);
    });
  },

  /**
   * Fetch Data with Caching
   */
  async fetchData(showLoader = false) {
    if (this.state.isLoading) return;
    
    const date = this.elements.datePicker.value.split('-').reverse().join('-');
    const cacheKey = `data_${date}_${this.state.currentUser.username}`;
    
    // Check cache
    const cached = this.state.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CONFIG.CACHE_TTL) {
      this.state.rawData = cached.data;
      this.applyFilters();
      return;
    }
    
    this.state.isLoading = true;
    if (showLoader) this.showLoading();
    
    try {
      const params = {
        date,
        username: this.state.currentUser.username,
        role: this.state.currentUser.role,
        assignedShift: this.state.currentUser.assignedShift
      };
      
      const response = await this.apiCall('dashboard', params);
      
      if (response.success || response.data) {
        this.state.rawData = response.data || {};
        this.state.lastUpdate = new Date();
        
        // Cache data
        this.state.cache.set(cacheKey, {
          data: this.state.rawData,
          timestamp: Date.now()
        });
        
        this.applyFilters();
        this.renderMetrics();
        this.renderContent();
        
        this.updateConnectionStatus('live');
      }
    } catch (error) {
      console.error('Fetch error:', error);
      this.updateConnectionStatus('error');
      this.showToast('Failed to load data: ' + error.message, 'error');
    } finally {
      this.state.isLoading = false;
      if (showLoader) this.hideLoading();
    }
  },

  /**
   * Apply Filters Based on Search
   */
  applyFilters() {
    const searchTerm = this.state.searchTerm.toLowerCase();
    
    if (!searchTerm) {
      this.state.filteredData = this.state.rawData;
      return;
    }
    
    // Deep filter
    this.state.filteredData = {};
    
    for (const [shift, locations] of Object.entries(this.state.rawData)) {
      this.state.filteredData[shift] = {};
      
      for (const [location, teams] of Object.entries(locations)) {
        this.state.filteredData[shift][location] = {};
        
        for (const [teamName, teamData] of Object.entries(teams)) {
          const filteredSubmitted = teamData.submitted.filter(u =>
            u.email.toLowerCase().includes(searchTerm) ||
            u.pc.toLowerCase().includes(searchTerm)
          );
          
          const filteredNotSubmitted = teamData.notSubmitted.filter(u =>
            u.email.toLowerCase().includes(searchTerm) ||
            u.pc.toLowerCase().includes(searchTerm)
          );
          
          if (filteredSubmitted.length > 0 || filteredNotSubmitted.length > 0) {
            this.state.filteredData[shift][location][teamName] = {
              submitted: filteredSubmitted,
              notSubmitted: filteredNotSubmitted
            };
          }
        }
        
        if (Object.keys(this.state.filteredData[shift][location]).length === 0) {
          delete this.state.filteredData[shift][location];
        }
      }
      
      if (Object.keys(this.state.filteredData[shift]).length === 0) {
        delete this.state.filteredData[shift];
      }
    }
  },

  /**
   * Render Metrics Cards
   */
  renderMetrics() {
    const data = this.state.filteredData;
    
    let totalActive = 0;
    let totalSubmitted = 0;
    let totalPending = 0;
    
    for (const shift of Object.values(data)) {
      for (const location of Object.values(shift)) {
        for (const team of Object.values(location)) {
          totalActive += team.submitted.length + team.notSubmitted.length;
          totalSubmitted += team.submitted.length;
          totalPending += team.notSubmitted.length;
        }
      }
    }
    
    const submissionRate = totalActive > 0 ? Math.round((totalSubmitted / totalActive) * 100) : 0;
    
    this.elements.metricsGrid.innerHTML = `
      <div class="metric-card" onclick="App.showMetricDetail('active')">
        <div class="metric-icon blue">
          <i class="fas fa-users"></i>
        </div>
        <div class="metric-content">
          <div class="metric-value">${totalActive}</div>
          <div class="metric-label">Total Active Users</div>
        </div>
      </div>
      
      <div class="metric-card" onclick="App.showMetricDetail('submitted')">
        <div class="metric-icon green">
          <i class="fas fa-check-circle"></i>
        </div>
        <div class="metric-content">
          <div class="metric-value">${totalSubmitted}</div>
          <div class="metric-label">Total Submitted</div>
        </div>
      </div>
      
      <div class="metric-card" onclick="App.showMetricDetail('pending')">
        <div class="metric-icon red">
          <i class="fas fa-clock"></i>
        </div>
        <div class="metric-content">
          <div class="metric-value">${totalPending}</div>
          <div class="metric-label">Pending</div>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-icon purple">
          <i class="fas fa-percentage"></i>
        </div>
        <div class="metric-content">
          <div class="metric-value">${submissionRate}%</div>
          <div class="metric-label">Submission Rate</div>
        </div>
        <div class="metric-progress">
          <div class="progress-bar" style="width: ${submissionRate}%"></div>
        </div>
      </div>
    `;
  },

  /**
   * Render Content
   */
  renderContent() {
    const data = this.state.filteredData;
    const selectedShift = this.elements.shiftFilter.value;
    const selectedLocation = this.elements.locationFilter.value;
    
    let html = '';
    
    for (const [shift, locations] of Object.entries(data)) {
      if (selectedShift !== 'all' && shift !== selectedShift) continue;
      
      html += `<div class="shift-section"><h3 class="shift-title"><i class="fas fa-clock"></i> Shift ${shift}</h3>`;
      
      for (const [location, teams] of Object.entries(locations)) {
        if (selectedLocation !== 'all' && 
            selectedLocation !== location && 
            !this.isLocationInGroup(location, selectedLocation)) continue;
        
        html += this.renderLocationSection(location, teams);
      }
      
      html += '</div>';
    }
    
    this.elements.contentArea.innerHTML = html || '<div class="empty-state"><i class="fas fa-inbox"></i><p>No data found</p></div>';
  },

  /**
   * Render Location Section
   */
  renderLocationSection(location, teams) {
    let totalSubmitted = 0;
    let totalPending = 0;
    
    for (const team of Object.values(teams)) {
      totalSubmitted += team.submitted.length;
      totalPending += team.notSubmitted.length;
    }
    
    const total = totalSubmitted + totalPending;
    const rate = total > 0 ? Math.round((totalSubmitted / total) * 100) : 0;
    
    return `
      <div class="location-card">
        <div class="location-header">
          <div class="location-title">
            <i class="fas fa-building"></i>
            <span>${location}</span>
          </div>
          <div class="location-stats">
            <span class="stat-badge green">${totalSubmitted} submitted</span>
            <span class="stat-badge red">${totalPending} pending</span>
            <span class="stat-badge blue">${total} total</span>
          </div>
        </div>
        
        <div class="teams-container">
          ${Object.entries(teams).map(([teamName, teamData]) => this.renderTeamCard(teamName, teamData)).join('')}
        </div>
      </div>
    `;
  },

  /**
   * Render Team Card
   */
  renderTeamCard(teamName, teamData) {
    const cardId = `team-${teamName.replace(/\s+/g, '-').toLowerCase()}`;
    
    return `
      <div class="team-card" id="${cardId}">
        <div class="team-header" onclick="App.toggleTeam('${cardId}')">
          <div class="team-info">
            <i class="fas fa-user-tie"></i>
            <span class="team-name">${teamName}</span>
            <div class="team-badges">
              <span class="badge green">${teamData.submitted.length} done</span>
              <span class="badge red">${teamData.notSubmitted.length} pending</span>
            </div>
          </div>
          <i class="fas fa-chevron-down chevron"></i>
        </div>
        
        <div class="team-content">
          <div class="team-columns">
            <div class="column pending">
              <h4><i class="fas fa-clock"></i> Pending (${teamData.notSubmitted.length})</h4>
              <div class="user-list">
                ${teamData.notSubmitted.map(u => this.renderUserBox(u, 'pending')).join('')}
              </div>
            </div>
            
            <div class="column submitted">
              <h4><i class="fas fa-check-double"></i> Submitted (${teamData.submitted.length})</h4>
              <div class="user-list">
                ${teamData.submitted.map(u => this.renderUserBox(u, 'submitted')).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Render User Box
   */
  renderUserBox(user, type) {
    return `
      <div class="user-box ${type}">
        <div class="user-email">${this.escapeHtml(user.email)}</div>
        <div class="user-pc"><i class="fas fa-desktop"></i> ${this.escapeHtml(user.pc)}</div>
      </div>
    `;
  },

  /**
   * Toggle Team Expansion
   */
  toggleTeam(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    
    card.classList.toggle('active');
  },

  /**
   * Filter Data
   */
  filterData() {
    this.renderContent();
  },

  /**
   * Debounced Search
   */
  debounceSearch() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.state.searchTerm = this.elements.searchInput.value;
      this.applyFilters();
      this.renderMetrics();
      this.renderContent();
    }, CONFIG.DEBOUNCE_DELAY);
  },

  /**
   * Manual Refresh
   */
  async manualRefresh() {
    // Clear cache for this date
    const date = this.elements.datePicker.value.split('-').reverse().join('-');
    const cacheKey = `data_${date}_${this.state.currentUser.username}`;
    this.state.cache.delete(cacheKey);
    
    await this.fetchData(true);
    this.showToast('Data refreshed', 'success');
  },

  /**
   * User Management
   */
  showUserManagement() {
    this.switchView('userManagementView');
    UserManagement.loadUsers();
  },

  showDashboard() {
    this.switchView('dashboardView');
  },

  switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(viewId).classList.add('active');
    event.target.closest('.nav-item')?.classList.add('active');
  },

  /**
   * API Call Helper
   */
  async apiCall(action, params = {}) {
    const url = `${CONFIG.API_URL}?action=${action}&${new URLSearchParams(params).toString()}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  },

  /**
   * Utility Functions
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  getRoleDisplayName(role) {
    const roles = {
      'admin': 'Administrator',
      'shift_supervisor': 'Shift Supervisor',
      'supervisor': 'Supervisor',
      'qc': 'Quality Controller'
    };
    return roles[role] || role;
  },

  isLocationInGroup(location, group) {
    const groupLocations = CONFIG.LOCATION_GROUPS[group];
    return groupLocations && groupLocations.includes(location);
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  updateConnectionStatus(status) {
    const chip = document.getElementById('connectionStatus');
    const dot = chip.querySelector('.status-dot');
    const text = chip.querySelector('.status-text');
    
    dot.className = `status-dot ${status}`;
    text.textContent = status === 'live' ? 'Live' : status === 'error' ? 'Error' : 'Loading';
  },

  showLoading() {
    this.elements.contentArea.innerHTML = `
      <div class="loading-container">
        <div class="spinner-ring large"></div>
        <p>Loading data...</p>
      </div>
    `;
  },

  hideLoading() {
    // Content is rendered elsewhere
  },

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.elements.searchInput.focus();
      }
      if (e.key === 'Escape') {
        this.elements.searchInput.blur();
        this.elements.userDropdown.classList.remove('show');
      }
    });
  },

  toggleSidebar() {
    this.elements.sidebar.classList.toggle('open');
  },

  toggleUserMenu() {
    this.elements.userDropdown.classList.toggle('show');
  },

  showProfile() {
    this.showToast('Profile feature coming soon', 'info');
  },

  showSettings() {
    this.showToast('Settings feature coming soon', 'info');
  },

  handleLogout() {
    sessionStorage.removeItem('currentUser');
    this.state.currentUser = null;
    this.state.rawData = {};
    this.state.filteredData = {};
    
    if (this.state.refreshInterval) {
      clearInterval(this.state.refreshInterval);
    }
    
    location.reload();
  },

  showMetricDetail(type) {
    this.showToast(`Showing ${type} details - Feature coming soon`, 'info');
  }
};

/**
 * ============================================
 * USER MANAGEMENT MODULE
 * ============================================
 */

const UserManagement = {
  async loadUsers() {
    try {
      const response = await App.apiCall('users');
      const tbody = document.getElementById('usersTableBody');
      
      if (response.success && response.users) {
        tbody.innerHTML = response.users.map(user => `
          <tr>
            <td><strong>${user.username}</strong></td>
            <td><span class="role-badge">${user.role}</span></td>
            <td>${user.permission}</td>
            <td>${user.assignedShift || '-'}</td>
            <td>${new Date(user.createdAt).toLocaleDateString()}</td>
            <td>
              <button class="icon-btn" onclick="UserManagement.editUser('${user.username}')" title="Edit">
                <i class="fas fa-edit"></i>
              </button>
              <button class="icon-btn danger" onclick="UserManagement.deleteUser('${user.username}')" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        `).join('');
      }
    } catch (error) {
      App.showToast('Failed to load users: ' + error.message, 'error');
    }
  },

  showCreateModal() {
    const modal = document.getElementById('modalOverlay');
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Create New User</h2>
          <button class="modal-close" onclick="App.closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          <form id="createUserForm" onsubmit="UserManagement.createUser(event)">
            <div class="form-group">
              <label>Username</label>
              <input type="text" name="username" required class="md3-input">
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" name="password" required class="md3-input">
            </div>
            <div class="form-group">
              <label>Role</label>
              <select name="role" required class="md3-select">
                <option value="qc">QC</option>
                <option value="supervisor">Supervisor</option>
                <option value="shift_supervisor">Shift Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div class="form-group">
              <label>Permission</label>
              <select name="permission" class="md3-select">
                <option value="only">Only</option>
                <option value="all">All</option>
              </select>
            </div>
            <div class="form-group">
              <label>Assigned Shift (for Shift Supervisors)</label>
              <select name="assignedShift" class="md3-select">
                <option value="">None</option>
                <option value="M">Morning (M)</option>
                <option value="N">Night (N)</option>
                <option value="ON">Overnight (ON)</option>
              </select>
            </div>
            <div class="modal-actions">
              <button type="button" class="md3-button" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="md3-button md3-button-primary">Create User</button>
            </div>
          </form>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
  },

  async createUser(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const params = Object.fromEntries(formData);
    
    try {
      const response = await App.apiCall('createUser', params);
      
      if (response.success) {
        App.showToast('User created successfully', 'success');
        App.closeModal();
        this.loadUsers();
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      App.showToast('Failed to create user: ' + error.message, 'error');
    }
  },

  async deleteUser(username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;
    
    try {
      const response = await App.apiCall('deleteUser', { username });
      
      if (response.success) {
        App.showToast('User deleted successfully', 'success');
        this.loadUsers();
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      App.showToast('Failed to delete user: ' + error.message, 'error');
    }
  },

  editUser(username) {
    App.showToast('Edit user feature coming soon', 'info');
  }
};

/**
 * ============================================
 * APP INITIALIZATION
 * ============================================
 */

// Extend App with modal close
App.closeModal = function() {
  document.getElementById('modalOverlay').style.display = 'none';
};

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.user-menu')) {
    document.getElementById('userDropdown')?.classList.remove('show');
  }
});
