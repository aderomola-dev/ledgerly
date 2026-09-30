/**
 * ==========================================================================
 * Ledgerly — Modern Personal Finance Engine
 * Clean, Modular Vanilla JavaScript ES6+ Architecture
 * ==========================================================================
 */

(function () {
    'use strict';

    /* --- 1. State Management & Constants --- */
const STORAGE_KEY_SETTINGS = 'ledgerly_settings_v1';

const API_BASE_URL = '/api';

    // Category Visual Mapping (Icons & Colors)
    const CATEGORY_MAP = {
        'Food': { icon: '🍔', color: '#f59e0b', bg: '#fef3c7' },
        'Transport': { icon: '🚗', color: '#3b82f6', bg: '#eff6ff' },
        'Shopping': { icon: '🛍️', color: '#ec4899', bg: '#fdf2f8' },
        'Bills': { icon: '💡', color: '#8b5cf6', bg: '#f5f3ff' },
        'Entertainment': { icon: '🎬', color: '#06b6d4', bg: '#ecfeff' },
        'Education': { icon: '📚', color: '#10b981', bg: '#ecfdf5' },
        'Health': { icon: '💊', color: '#ef4444', bg: '#fef2f2' },
        'Salary': { icon: '💼', color: '#059669', bg: '#ecfdf5' },
        'Business': { icon: '📈', color: '#6366f1', bg: '#eef2ff' },
        'Other': { icon: '🏷️', color: '#64748b', bg: '#f1f5f9' }
    };

    // Main App State
    let state = {
        transactions: [],
        accounts: [],
        categories: [],
        analytics: {
            summary: { totalBalance: 0, totalIncome: 0, totalExpenses: 0, totalSavings: 0 },
            categories: [],
            months: [],
            status: 'loading',
            error: ''
        },
        settings: {
            userName: 'Alex Adebayo',
            currency: '₦'
        },
        activeTab: 'dashboard-view',
        pendingDeleteId: null,
        authMode: 'login',
        charts: {
            overview: null,
            category: null,
            analyticsFlow: null,
            analyticsCat: null
        }
    };

    /* --- 2. Helper Utilities --- */

    /**
     * Format currency amount with commas and chosen symbol
     */
    function formatCurrency(amount, includeSymbol = true) {
        const num = Number(amount) || 0;
        const formatted = num.toLocaleString('en-NG', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
        return includeSymbol ? `${state.settings.currency}${formatted}` : formatted;
    }

    /**
     * Format date nicely: e.g. "Sep 27, 2026"
     */
    function formatDate(dateStr) {
        if (!dateStr) return '—';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    /**
     * Generate unique ID
     */
    function generateId() {
        return 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    }

    /**
     * Toast notification utility
     */
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        } else if (type === 'error') {
            iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
        } else {
            iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        }

        toast.innerHTML = `${iconSvg} <span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 200);
        }, 3200);
    }

    /**
     * Prevent XSS by escaping HTML entities
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /* --- 3. Persistence (LocalStorage) --- */

    function getAuthToken() {
        return localStorage.getItem('ledgerly_auth_token');
    }

    function setAuthToken(token) {
        if (!token) {
            localStorage.removeItem('ledgerly_auth_token');
            return;
        }
        localStorage.setItem('ledgerly_auth_token', token);
    }

    function clearAuthToken() {
        localStorage.removeItem('ledgerly_auth_token');
    }

    function showLoginScreen(message = '') {
        document.getElementById('auth-screen')?.removeAttribute('hidden');
        document.querySelector('.app-container')?.classList.add('is-locked');
        const error = document.getElementById('login-error');
        if (error) error.textContent = message;
    }

    function hideLoginScreen() {
        document.getElementById('auth-screen')?.setAttribute('hidden', '');
        document.querySelector('.app-container')?.classList.remove('is-locked');
        const error = document.getElementById('login-error');
        if (error) error.textContent = '';
    }

    function setAuthMode(mode) {
        state.authMode = mode;
        const registering = mode === 'register';
        document.getElementById('login-title').textContent = registering ? 'Create your account' : 'Sign in';
        document.getElementById('auth-description').textContent = registering
            ? 'Create a Ledgerly account to securely manage your finances.'
            : 'Use your Ledgerly account credentials to continue.';
        document.getElementById('register-name-group').hidden = !registering;
        document.getElementById('register-name').required = registering;
        document.getElementById('login-password').autocomplete = registering ? 'new-password' : 'current-password';
        document.getElementById('auth-password-help').hidden = !registering;
        document.getElementById('login-submit').textContent = registering ? 'Create account' : 'Sign in';
        document.getElementById('auth-mode-toggle').textContent = registering ? 'I already have an account' : 'Create an account';
        document.getElementById('login-error').textContent = '';
    }

    async function handleLoginSubmit(event) {
        event.preventDefault();
        const passwordField = document.getElementById('login-password');
        const button = document.getElementById('login-submit');
        if (button) button.disabled = true;
        const credentials = {
            email: document.getElementById('login-email').value,
            password: passwordField.value
        };
        const registering = state.authMode === 'register';
        const response = await authenticate(credentials, registering);
        passwordField.value = '';
        if (button) button.disabled = false;
        if (!response) return;

        try {
            const profile = await apiRequest('/settings');
            state.settings.userName = profile.data.userName || response.user?.fullName || state.settings.userName;
            saveSettings();
            hideLoginScreen();
            await initializeAuthenticatedApp();
        } catch (error) {
            clearAuthToken();
            showLoginScreen(error.message || 'Unable to load your account.');
        }
        event.currentTarget.reset();
        setAuthMode('login');
    }

    async function authenticate(credentials, registering) {
        const errorElement = document.getElementById('login-error');
        try {
            const response = await fetch(`${API_BASE_URL}/auth/${registering ? 'register' : 'login'}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(registering
                    ? { ...credentials, fullName: document.getElementById('register-name').value }
                    : credentials)
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Authentication failed.');
            setAuthToken(result.data.token);
            state.settings.userName = result.data.user.fullName || state.settings.userName;
            return result.data;
        } catch (error) {
            if (errorElement) errorElement.textContent = error.message || 'Unable to authenticate.';
            return null;
        }
    }

    function logout() {
        clearAuthToken();
        state.transactions = [];
        state.accounts = [];
        state.categories = [];
        state.analytics.summary = { totalBalance: 0, totalIncome: 0, totalExpenses: 0, totalSavings: 0 };
        state.analytics.categories = [];
        state.analytics.months = [];
        Object.values(state.charts).forEach((chart) => chart?.destroy());
        state.charts = { overview: null, category: null, analyticsFlow: null, analyticsCat: null };
        showLoginScreen();
    }

    function getAuthHeaders() {
        const token = getAuthToken();
        return {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        };
    }

    async function apiRequest(path, options = {}) {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers: {
                ...options.headers,
                ...getAuthHeaders()
            }
        });

        if (response.status === 401) {
            clearAuthToken();
            showLoginScreen('Your session expired. Sign in again.');
        }

        let result;
        try {
            result = await response.json();
        } catch {
            result = {};
        }

        if (!response.ok) {
            throw new Error(result.error || `Request failed (${response.status})`);
        }

        return result;
    }

    async function loadTransactions() {
        try {
            const result = await apiRequest('/transactions');
            state.transactions = Array.isArray(result.data) ? result.data.map(normalizeApiTransaction) : [];
            return true;
        } catch (error) {
            console.error('Error loading transactions from API:', error);
            showToast('Failed to load transactions from server', 'error');
            return false;
        }
    }

    function normalizeApiTransaction(tx) {
        const categoryName = tx.category || 'Other';
        return {
            id: String(tx.id),
            categoryId: tx.category_id ? String(tx.category_id) : '',
            accountId: tx.account_id ? String(tx.account_id) : '',
            name: tx.name || '',
            amount: Number(tx.amount) || 0,
            type: tx.type || 'expense',
            category: categoryName,
            date: tx.date ? new Date(tx.date).toISOString().split('T')[0] : '',
            notes: tx.notes || '',
            createdAt: Date.now()
        };
    }

    function setAnalyticsStatus(status, message = '') {
        state.analytics.status = status;
        state.analytics.error = message;
        document.querySelectorAll('.analytics-status').forEach((element) => {
            element.classList.toggle('is-error', status === 'error');
            element.classList.toggle('is-success', status === 'success');
            element.setAttribute('aria-busy', status === 'loading' ? 'true' : 'false');
            element.setAttribute('role', status === 'error' ? 'button' : 'status');
            element.setAttribute('tabindex', status === 'error' ? '0' : '-1');
            element.setAttribute('aria-label', status === 'error' ? `${message} Retry analytics` : message);
            element.textContent = status === 'loading'
                ? 'Loading live financial analytics…'
                : status === 'error' ? `${message} Retry` : message;
            element.hidden = status === 'success';
        });
    }

    function attachAnalyticsRetry() {
        document.querySelectorAll('.analytics-status').forEach((element) => {
            const retry = () => {
                if (state.analytics.status === 'error') {
                    refreshAnalytics().then(refreshAllViews);
                }
            };
            element.addEventListener('click', retry);
            element.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    retry();
                }
            });
        });
    }

    async function refreshAnalytics() {
        setAnalyticsStatus('loading');
        try {
            const [summary, categories, monthly] = await Promise.all([
                apiRequest('/analytics/summary'),
                apiRequest('/analytics/categories'),
                apiRequest('/analytics/monthly')
            ]);

            state.analytics.summary = summary.data || { totalBalance: 0, totalIncome: 0, totalExpenses: 0, totalSavings: 0 };
            state.analytics.categories = Array.isArray(categories.data?.categories) ? categories.data.categories : [];
            state.analytics.months = Array.isArray(monthly.data?.months) ? monthly.data.months : [];
            setAnalyticsStatus('success');
            return true;
        } catch (error) {
            console.error('Error loading live analytics:', error);
            setAnalyticsStatus('error', `Live analytics could not be loaded. ${error.message || 'Check your connection and try again.'}`);
            return false;
        }
    }

    async function refreshDashboardData() {
        await Promise.all([loadTransactions(), refreshAnalytics()]);
        refreshAllViews();
    }

    async function loadAccounts() {
        try {
            const result = await apiRequest('/accounts');
            state.accounts = Array.isArray(result.data) ? result.data : [];

            const accountSelect = document.getElementById('form-account');
            if (!accountSelect) return;

            accountSelect.innerHTML = state.accounts.length
                ? `<option value="" disabled>Select account</option>${state.accounts.map((account) => `
                    <option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} — ${escapeHtml(account.type)} (${escapeHtml(account.currency)})</option>
                `).join('')}`
                : '<option value="" disabled selected>No accounts available</option>';

            accountSelect.disabled = state.accounts.length === 0;
            if (state.accounts.length === 1) accountSelect.value = state.accounts[0].id;
        } catch (error) {
            console.error('Error loading accounts:', error);
            state.accounts = [];
            const accountSelect = document.getElementById('form-account');
            if (accountSelect) {
                accountSelect.innerHTML = '<option value="" disabled selected>Accounts could not be loaded</option>';
                accountSelect.disabled = true;
            }
            showToast('Failed to load accounts', 'error');
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(state.settings));
        } catch (e) {
            console.error('Error saving settings to localStorage:', e);
        }
    }

    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
            if (raw) {
                state.settings = { ...state.settings, ...JSON.parse(raw) };
            }
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }

    /* --- 4. Transaction Operations (CRUD) --- */

    async function addTransaction(txData) {
        try {
            const result = await apiRequest('/transactions', {
                method: 'POST',
                body: JSON.stringify({
                    account_id: txData.accountId,
                    category_id: txData.category ? Number(txData.category) : null,
                    amount: Math.abs(parseFloat(txData.amount)),
                    type: txData.type,
                    name: txData.name.trim(),
                    date: txData.date
                })
            });

            await refreshDashboardData();

            showToast(`Added "${txData.name}" successfully!`, 'success');

            return result.data;
        } catch (error) {
            console.error('Error creating transaction:', error);
            showToast('Failed to save transaction to server', 'error');
            return null;
        }
    }

    async function editTransaction(id, updatedData) {
        try {
            await apiRequest(`/transactions/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    account_id: updatedData.accountId,
                    category_id: updatedData.category ? Number(updatedData.category) : null,
                    amount: Math.abs(parseFloat(updatedData.amount)),
                    type: updatedData.type,
                    name: updatedData.name.trim(),
                    date: updatedData.date
                })
            });

            await refreshDashboardData();
            showToast(`Updated "${updatedData.name}"`, 'success');
            return true;
        } catch (error) {
            console.error('Error updating transaction:', error);
            showToast('Failed to update transaction on server', 'error');
            return false;
        }
    }

    async function deleteTransaction(id) {
        try {
            const target = state.transactions.find(t => t.id === id);
            if (!target) return;

            await apiRequest(`/transactions/${id}`, {
                method: 'DELETE',
            });

            await refreshDashboardData();
            showToast(`Deleted "${target.name}"`, 'info');
        } catch (error) {
            console.error('Error deleting transaction:', error);
            showToast('Failed to delete transaction from server', 'error');
        }
    }

    function loadDemoData() {
        showToast('Sample data is disabled. Add a real transaction to your account instead.', 'info');
    }

    async function clearAllTransactions() {
        try {
            for (const transaction of [...state.transactions]) {
                await apiRequest(`/transactions/${transaction.id}`, { method: 'DELETE' });
            }
            await refreshDashboardData();
            showToast('All transaction records cleared.', 'info');
        } catch (error) {
            console.error('Error clearing transactions:', error);
            showToast('Some transactions could not be deleted. The list has been refreshed.', 'error');
            await refreshDashboardData();
        }
    }

    /* --- 5. Calculation Engine --- */

    function calculateFinancialMetrics(transactionsList = state.transactions) {
        const summary = state.analytics.summary;
        const totalIncome = Number(summary.totalIncome) || 0;
        const totalExpenses = Number(summary.totalExpenses) || 0;
        let incomeCount = 0;
        let expenseCount = 0;

        transactionsList.forEach(tx => {
            if (tx.type === 'income') {
                incomeCount++;
            } else if (tx.type === 'expense') {
                expenseCount++;
            }
        });

        const totalBalance = Number(summary.totalBalance) || 0;
        const netSavings = Number(summary.totalSavings) || 0;
        const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((netSavings / totalIncome) * 100)) : 0;

        const categorySpending = Object.fromEntries(
            state.analytics.categories.map(({ category, amount }) => [category, Number(amount) || 0])
        );

        // Find top spending category
        let topCategory = 'None';
        let topCategoryAmount = 0;
        for (const [cat, amt] of Object.entries(categorySpending)) {
            if (amt > topCategoryAmount) {
                topCategoryAmount = amt;
                topCategory = cat;
            }
        }
        const topCategoryPercent = Number(state.analytics.categories[0]?.percentage) || 0;
        const expenseAmounts = transactionsList
            .filter(tx => tx.type === 'expense')
            .map(tx => Number(tx.amount) || 0);
        const avgExpense = expenseAmounts.length > 0
            ? expenseAmounts.reduce((total, amount) => total + amount, 0) / expenseAmounts.length
            : 0;

        return {
            totalBalance,
            totalIncome,
            totalExpenses,
            netSavings,
            savingsRate,
            incomeCount,
            expenseCount,
            totalCount: incomeCount + expenseCount,
            categorySpending,
            topCategory,
            topCategoryAmount,
            topCategoryPercent,
            avgExpense
        };
    }

    /* --- 6. View Rendering Functions --- */

    /**
     * Refresh all dashboard cards, tables, badge counts, and charts
     */
    function refreshAllViews() {
        updateHeaderAndSidebar();
        updateDashboardCards();
        renderDashboardRecentTable();
        renderFullTransactionsTable();
        updateAnalyticsView();
        updateCharts();
    }

    function updateHeaderAndSidebar() {
        // Greeting & Current Date
        const now = new Date();
        const hours = now.getHours();
        let greeting = 'Good morning';
        if (hours >= 12 && hours < 17) greeting = 'Good afternoon';
        else if (hours >= 17) greeting = 'Good evening';

        const greetingEl = document.getElementById('greeting-text');
        if (greetingEl) {
            greetingEl.textContent = `${greeting}, ${state.settings.userName.split(' ')[0]} 👋`;
        }

        const dateEl = document.getElementById('current-date-display');
        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            });
        }

        // Sidebar Elements
        const navCountBadge = document.getElementById('nav-tx-count');
        if (navCountBadge) navCountBadge.textContent = state.transactions.length;

        const metrics = calculateFinancialMetrics();
        const sidebarNet = document.getElementById('sidebar-net-balance');
        if (sidebarNet) sidebarNet.textContent = formatCurrency(metrics.totalBalance);

        const sidebarUser = document.getElementById('sidebar-username');
        if (sidebarUser) sidebarUser.textContent = state.settings.userName;

        const sidebarAvatar = document.getElementById('sidebar-avatar');
        if (sidebarAvatar) {
            const initials = state.settings.userName
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .substring(0, 2);
            sidebarAvatar.textContent = initials || 'ME';
        }

        // Form currency prefix
        const formPrefix = document.getElementById('form-currency-prefix');
        if (formPrefix) formPrefix.textContent = state.settings.currency;
    }

    function updateDashboardCards() {
        const metrics = calculateFinancialMetrics();

        // 1. Total Balance
        const balanceEl = document.getElementById('card-total-balance');
        if (balanceEl) balanceEl.textContent = formatCurrency(metrics.totalBalance);

        const balanceTrendBadge = document.getElementById('balance-trend-badge');
        if (balanceTrendBadge) {
            if (metrics.totalBalance >= 0) {
                balanceTrendBadge.className = 'trend-badge positive';
                balanceTrendBadge.textContent = 'Healthy';
            } else {
                balanceTrendBadge.className = 'trend-badge negative';
                balanceTrendBadge.textContent = 'Deficit';
            }
        }

        // 2. Total Income
        const incomeEl = document.getElementById('card-total-income');
        if (incomeEl) incomeEl.textContent = formatCurrency(metrics.totalIncome);

        const incomeCountEl = document.getElementById('income-tx-count');
        if (incomeCountEl) incomeCountEl.textContent = `${metrics.incomeCount} inflow${metrics.incomeCount === 1 ? '' : 's'}`;

        // 3. Total Expenses
        const expenseEl = document.getElementById('card-total-expenses');
        if (expenseEl) expenseEl.textContent = formatCurrency(metrics.totalExpenses);

        const expenseCountEl = document.getElementById('expense-tx-count');
        if (expenseCountEl) expenseCountEl.textContent = `${metrics.expenseCount} outflow${metrics.expenseCount === 1 ? '' : 's'}`;

        // 4. Net Savings
        const savingsEl = document.getElementById('card-total-savings');
        if (savingsEl) savingsEl.textContent = formatCurrency(metrics.netSavings);

        const savingsRateEl = document.getElementById('card-savings-rate');
        if (savingsRateEl) {
            savingsRateEl.textContent = `${metrics.savingsRate}% rate`;
            if (metrics.savingsRate >= 20) {
                savingsRateEl.className = 'trend-badge positive';
            } else if (metrics.savingsRate > 0) {
                savingsRateEl.className = 'trend-badge neutral';
            } else {
                savingsRateEl.className = 'trend-badge negative';
            }
        }
    }

    function createTransactionRowHTML(tx) {
        const catInfo = CATEGORY_MAP[tx.category] || CATEGORY_MAP['Other'];
        const isIncome = tx.type === 'income';
        const sign = isIncome ? '+' : '-';
        const amountClass = isIncome ? 'income' : 'expense';

        return `
            <tr data-id="${escapeHtml(tx.id)}">
                <td>
                    <div class="tx-name-cell">
                        <div class="tx-category-icon" style="background-color: ${catInfo.bg};">
                            ${catInfo.icon}
                        </div>
                        <div class="tx-title-group">
                            <span class="tx-main-title">${escapeHtml(tx.name)}</span>
                            ${tx.notes ? `<span class="tx-notes-sub">${escapeHtml(tx.notes)}</span>` : ''}
                        </div>
                    </div>
                </td>
                <td>
                    <span class="tx-category-badge">${escapeHtml(tx.category)}</span>
                </td>
                <td class="tx-date-cell">
                    ${formatDate(tx.date)}
                </td>
                <td>
                    <span class="tx-type-pill ${tx.type}">
                        ${isIncome ? '↑ Inflow' : '↓ Outflow'}
                    </span>
                </td>
                <td class="tx-amount-cell ${amountClass} text-right">
                    ${sign} ${formatCurrency(tx.amount)}
                </td>
                <td class="tx-actions-cell text-center">
                    <button class="btn-icon-action action-edit" data-action="edit" data-id="${escapeHtml(tx.id)}" title="Edit Transaction" aria-label="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-icon-action action-delete" data-action="delete" data-id="${escapeHtml(tx.id)}" title="Delete Transaction" aria-label="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }

    function renderDashboardRecentTable() {
        const tbody = document.getElementById('dashboard-tx-tbody');
        const emptyState = document.getElementById('dashboard-empty-state');
        const table = document.getElementById('dashboard-tx-table');
        if (!tbody) return;

        const searchKeyword = (document.getElementById('dash-search-input')?.value || '').toLowerCase().trim();
        const typeFilter = document.getElementById('dash-type-filter')?.value || 'all';

        let list = [...state.transactions];

        // Apply mini-search & type filter
        if (searchKeyword) {
            list = list.filter(t => 
                t.name.toLowerCase().includes(searchKeyword) ||
                (t.notes && t.notes.toLowerCase().includes(searchKeyword)) ||
                t.category.toLowerCase().includes(searchKeyword)
            );
        }
        if (typeFilter !== 'all') {
            list = list.filter(t => t.type === typeFilter);
        }

        // Top 6 recent items on main dashboard
        const recentList = list.slice(0, 6);

        if (state.transactions.length === 0) {
            table.style.display = 'none';
            emptyState.style.display = 'flex';
        } else if (recentList.length === 0) {
            table.style.display = 'none';
            emptyState.style.display = 'flex';
            emptyState.querySelector('.empty-title').textContent = 'No matching transactions';
            emptyState.querySelector('.empty-desc').textContent = 'Try adjusting your search query or type filter.';
        } else {
            table.style.display = 'table';
            emptyState.style.display = 'none';
            tbody.innerHTML = recentList.map(createTransactionRowHTML).join('');
        }
    }

    function renderFullTransactionsTable() {
        const tbody = document.getElementById('full-tx-tbody');
        const emptyState = document.getElementById('full-empty-state');
        const table = document.getElementById('full-tx-table');
        const summaryBar = document.getElementById('filter-summary-bar');
        const countText = document.getElementById('filter-result-count');
        if (!tbody) return;

        const searchKeyword = (document.getElementById('full-search-input')?.value || '').toLowerCase().trim();
        const typeFilter = document.getElementById('filter-type-select')?.value || 'all';
        const categoryFilter = document.getElementById('filter-category-select')?.value || 'all';
        const dateFilter = document.getElementById('filter-date-select')?.value || 'all';
        const sortFilter = document.getElementById('filter-sort-select')?.value || 'date-desc';

        let list = [...state.transactions];

        // 1. Search Query
        if (searchKeyword) {
            list = list.filter(t => 
                t.name.toLowerCase().includes(searchKeyword) ||
                (t.notes && t.notes.toLowerCase().includes(searchKeyword)) ||
                t.category.toLowerCase().includes(searchKeyword)
            );
        }

        // 2. Type Filter
        if (typeFilter !== 'all') {
            list = list.filter(t => t.type === typeFilter);
        }

        // 3. Category Filter
        if (categoryFilter !== 'all') {
            list = list.filter(t => t.category.toLowerCase() === categoryFilter.toLowerCase());
        }

        // 4. Date Filter
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        if (dateFilter === 'this-month') {
            list = list.filter(t => {
                if (!t.date) return false;
                const [y, m] = t.date.split('-').map(Number);
                return y === currentYear && (m - 1) === currentMonth;
            });
        } else if (dateFilter === 'last-month') {
            const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            list = list.filter(t => {
                if (!t.date) return false;
                const [y, m] = t.date.split('-').map(Number);
                return y === lastMonthYear && (m - 1) === lastMonth;
            });
        } else if (dateFilter === 'this-year') {
            list = list.filter(t => {
                if (!t.date) return false;
                const [y] = t.date.split('-').map(Number);
                return y === currentYear;
            });
        }

        // 5. Sorting
        list.sort((a, b) => {
            if (sortFilter === 'date-desc') {
                return (b.date || '').localeCompare(a.date || '') || (b.createdAt - a.createdAt);
            } else if (sortFilter === 'date-asc') {
                return (a.date || '').localeCompare(b.date || '') || (a.createdAt - b.createdAt);
            } else if (sortFilter === 'amount-desc') {
                return b.amount - a.amount;
            } else if (sortFilter === 'amount-asc') {
                return a.amount - b.amount;
            }
            return 0;
        });

        // Update summary bar
        const isFiltered = searchKeyword !== '' || typeFilter !== 'all' || categoryFilter !== 'all' || dateFilter !== 'all';
        if (isFiltered) {
            summaryBar.style.display = 'block';
            countText.textContent = `Found ${list.length} transaction${list.length === 1 ? '' : 's'} matching criteria`;
        } else {
            summaryBar.style.display = 'none';
        }

        if (list.length === 0) {
            table.style.display = 'none';
            emptyState.style.display = 'flex';
        } else {
            table.style.display = 'table';
            emptyState.style.display = 'none';
            tbody.innerHTML = list.map(createTransactionRowHTML).join('');
        }
    }

    function updateAnalyticsView() {
        const metrics = calculateFinancialMetrics();

        // Top Category
        const topCatEl = document.getElementById('analytics-top-category');
        const topAmtEl = document.getElementById('analytics-top-category-amount');
        const topPctEl = document.getElementById('analytics-top-category-percent');
        if (topCatEl) topCatEl.textContent = metrics.topCategory;
        if (topAmtEl) topAmtEl.textContent = formatCurrency(metrics.topCategoryAmount);
        if (topPctEl) topPctEl.textContent = `${metrics.topCategoryPercent}% of total expenses`;

        // Total Count & Ratio
        const countEl = document.getElementById('analytics-total-tx-count');
        const ratioEl = document.getElementById('analytics-tx-ratio');
        if (countEl) countEl.textContent = metrics.totalCount;
        if (ratioEl) ratioEl.textContent = `${metrics.incomeCount} Inflows / ${metrics.expenseCount} Outflows`;

        // Savings Rate
        const rateEl = document.getElementById('analytics-savings-rate');
        const badgeEl = document.getElementById('analytics-savings-badge');
        if (rateEl) rateEl.textContent = `${metrics.savingsRate}%`;
        if (badgeEl) {
            if (metrics.savingsRate >= 25) {
                badgeEl.textContent = 'Excellent';
                badgeEl.className = 'stat-badge positive';
            } else if (metrics.savingsRate > 0) {
                badgeEl.textContent = 'Moderate';
                badgeEl.className = 'stat-badge neutral';
            } else {
                badgeEl.textContent = 'Negative';
                badgeEl.className = 'stat-badge';
            }
        }

        // Avg Expense
        const avgEl = document.getElementById('analytics-avg-expense');
        if (avgEl) avgEl.textContent = formatCurrency(metrics.avgExpense);

        // Category Progress Breakdown List
        const listContainer = document.getElementById('category-progress-list');
        if (listContainer) {
            const sortedCats = state.analytics.categories;

            if (sortedCats.length === 0) {
                listContainer.innerHTML = `<p class="text-muted" style="padding: 20px 0; text-align: center;">No category spending recorded yet.</p>`;
            } else {
                listContainer.innerHTML = sortedCats.map(({ category: cat, amount: amt, percentage: apiPercentage }) => {
                    const catInfo = CATEGORY_MAP[cat] || CATEGORY_MAP['Other'];
                    const pct = Number(apiPercentage) || 0;
                    return `
                        <div class="cat-progress-item">
                            <div class="cat-progress-header">
                                <span class="cat-progress-name">
                                    <span>${catInfo.icon}</span>
                                    <span>${escapeHtml(cat)}</span>
                                    <span class="cat-progress-percentage">(${pct}%)</span>
                                </span>
                                <span class="cat-progress-amount">${formatCurrency(amt)}</span>
                            </div>
                            <div class="cat-progress-bar-bg">
                                <div class="cat-progress-bar-fill" style="width: ${pct}%; background-color: ${catInfo.color};"></div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    /* --- 7. Chart.js Visualizations --- */

    function getMonthlyAggregatedData() {
        const months = state.analytics.months;

        return {
            labels: months.map(({ month }) => {
                const [year, monthNumber] = month.split('-').map(Number);
                return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            }),
            incomeData: months.map(({ income }) => Number(income) || 0),
            expenseData: months.map(({ expenses }) => Number(expenses) || 0)
        };
    }

    function getCategoryDoughnutData() {
        const categories = state.analytics.categories;
        const labels = categories.map(({ category }) => category);
        const data = categories.map(({ amount }) => Number(amount) || 0);
        const backgroundColors = labels.map(l => (CATEGORY_MAP[l] ? CATEGORY_MAP[l].color : '#94a3b8'));

        if (labels.length === 0) {
            return {
                labels: ['No spending'],
                data: [0],
                backgroundColors: ['#e2e8f0']
            };
        }

        return { labels, data, backgroundColors };
    }

    function updateCharts() {
        if (typeof Chart === 'undefined') return;

        // 1. Dashboard Overview Chart (Bar / Grouped)
        const overviewCanvas = document.getElementById('overviewChart');
        if (overviewCanvas) {
            if (state.charts.overview) {
                state.charts.overview.destroy();
            }

            const monthData = getMonthlyAggregatedData();
            state.charts.overview = new Chart(overviewCanvas, {
                type: 'bar',
                data: {
                    labels: monthData.labels,
                    datasets: [
                        {
                            label: 'Income',
                            data: monthData.incomeData,
                            backgroundColor: '#10b981',
                            borderRadius: 6,
                            borderSkipped: false
                        },
                        {
                            label: 'Expense',
                            data: monthData.expenseData,
                            backgroundColor: '#f43f5e',
                            borderRadius: 6,
                            borderSkipped: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                            align: 'end',
                            labels: {
                                boxWidth: 12,
                                font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600', size: 12 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (ctx) {
                                    return ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 } }
                        },
                        y: {
                            grid: { color: '#f1f5f9' },
                            ticks: {
                                font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
                                callback: function (val) {
                                    return val >= 1000000 ? `${state.settings.currency}${(val / 1000000).toFixed(1)}M` : 
                                           val >= 1000 ? `${state.settings.currency}${(val / 1000).toFixed(0)}k` : `${state.settings.currency}${val}`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // 2. Dashboard Category Doughnut Chart
        const catCanvas = document.getElementById('categoryChart');
        if (catCanvas) {
            if (state.charts.category) {
                state.charts.category.destroy();
            }

            const catData = getCategoryDoughnutData();
            state.charts.category = new Chart(catCanvas, {
                type: 'doughnut',
                data: {
                    labels: catData.labels,
                    datasets: [{
                        data: catData.data,
                        backgroundColor: catData.backgroundColors,
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                boxWidth: 10,
                                font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600', size: 11 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (ctx) {
                                    return ` ${ctx.label}: ${formatCurrency(ctx.raw)}`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // 3. Analytics Cash Flow Trends (Line Chart)
        const flowCanvas = document.getElementById('analyticsCashFlowChart');
        if (flowCanvas) {
            if (state.charts.analyticsFlow) {
                state.charts.analyticsFlow.destroy();
            }

            const monthData = getMonthlyAggregatedData();
            state.charts.analyticsFlow = new Chart(flowCanvas, {
                type: 'line',
                data: {
                    labels: monthData.labels,
                    datasets: [
                        {
                            label: 'Total Inflow',
                            data: monthData.incomeData,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.08)',
                            fill: true,
                            tension: 0.35,
                            pointRadius: 4,
                            pointHoverRadius: 6
                        },
                        {
                            label: 'Total Outflow',
                            data: monthData.expenseData,
                            borderColor: '#f43f5e',
                            backgroundColor: 'rgba(244, 63, 94, 0.08)',
                            fill: true,
                            tension: 0.35,
                            pointRadius: 4,
                            pointHoverRadius: 6
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                            align: 'end',
                            labels: {
                                boxWidth: 12,
                                font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600' }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (ctx) {
                                    return ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            grid: { color: '#f1f5f9' },
                            ticks: {
                                callback: function (val) {
                                    return val >= 1000 ? `${state.settings.currency}${(val / 1000).toFixed(0)}k` : `${state.settings.currency}${val}`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // 4. Analytics Full Category Polar / Doughnut
        const analyticsCatCanvas = document.getElementById('analyticsCategoryChart');
        if (analyticsCatCanvas) {
            if (state.charts.analyticsCat) {
                state.charts.analyticsCat.destroy();
            }

            const catData = getCategoryDoughnutData();
            state.charts.analyticsCat = new Chart(analyticsCatCanvas, {
                type: 'doughnut',
                data: {
                    labels: catData.labels,
                    datasets: [{
                        data: catData.data,
                        backgroundColor: catData.backgroundColors,
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 12,
                                font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: '600' }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (ctx) {
                                    return ` ${ctx.label}: ${formatCurrency(ctx.raw)}`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    /* --- 8. Modals Management & Form Validation --- */

    const txModal = document.getElementById('transaction-modal');
    const deleteModal = document.getElementById('delete-modal');
    const txForm = document.getElementById('transaction-form');

    function openAddModal() {
        txForm.reset();
        document.getElementById('form-edit-id').value = '';
        document.getElementById('modal-title').textContent = 'Add New Transaction';
        document.getElementById('modal-subtitle').textContent = 'Enter details to record income or expense';
        document.getElementById('save-btn-text').textContent = 'Save Transaction';
        document.getElementById('type-expense').checked = true;
        const accountSelect = document.getElementById('form-account');
        if (accountSelect) accountSelect.value = state.accounts.length === 1 ? state.accounts[0].id : '';
        document.getElementById('form-date').value = new Date().toISOString().split('T')[0];
        
        clearFormErrors();
        openModalBackdrop(txModal);
        document.getElementById('form-name').focus();
    }

    function openEditModal(id) {
        const tx = state.transactions.find(t => t.id === id);
        if (!tx) return;

        txForm.reset();
        document.getElementById('form-edit-id').value = tx.id;
        document.getElementById('modal-title').textContent = 'Edit Transaction';
        document.getElementById('modal-subtitle').textContent = 'Modify transaction attributes and values';
        document.getElementById('save-btn-text').textContent = 'Update Transaction';

        if (tx.type === 'income') {
            document.getElementById('type-income').checked = true;
        } else {
            document.getElementById('type-expense').checked = true;
        }

        document.getElementById('form-name').value = tx.name;
        document.getElementById('form-amount').value = tx.amount;
        document.getElementById('form-date').value = tx.date;
        document.getElementById('form-account').value = tx.accountId || '';
        document.getElementById('form-category').value = tx.categoryId || '';
        document.getElementById('form-notes').value = tx.notes || '';

        clearFormErrors();
        openModalBackdrop(txModal);
    }

    function openDeleteModal(id) {
        const tx = state.transactions.find(t => t.id === id);
        if (!tx) return;

        state.pendingDeleteId = id;
        document.getElementById('delete-tx-name').textContent = `"${tx.name}" (${formatCurrency(tx.amount)})`;
        openModalBackdrop(deleteModal);
    }

    function openModalBackdrop(modalElement) {
        if (!modalElement) return;
        modalElement.classList.add('active');
        modalElement.setAttribute('aria-hidden', 'false');
    }

    function closeModalBackdrop(modalElement) {
        if (!modalElement) return;
        modalElement.classList.remove('active');
        modalElement.setAttribute('aria-hidden', 'true');
    }

    function clearFormErrors() {
        document.querySelectorAll('.form-group').forEach(el => el.classList.remove('has-error'));
    }

    function validateTransactionForm() {
        clearFormErrors();
        let isValid = true;

        const nameInput = document.getElementById('form-name');
        const amountInput = document.getElementById('form-amount');
        const dateInput = document.getElementById('form-date');
        const categoryInput = document.getElementById('form-category');
        const accountInput = document.getElementById('form-account');

        if (!nameInput.value.trim()) {
            nameInput.closest('.form-group').classList.add('has-error');
            isValid = false;
        }

        const amountVal = parseFloat(amountInput.value);
        if (isNaN(amountVal) || amountVal <= 0) {
            amountInput.closest('.form-group').classList.add('has-error');
            isValid = false;
        }

        if (!dateInput.value) {
            dateInput.closest('.form-group').classList.add('has-error');
            isValid = false;
        }

        if (!accountInput.value) {
            accountInput.closest('.form-group').classList.add('has-error');
            isValid = false;
        }

        return isValid;
    }

    /* --- 9. Export & Import Capabilities --- */

    function exportToCSV() {
        if (state.transactions.length === 0) {
            showToast('No transactions to export', 'error');
            return;
        }

        const headers = ['ID', 'Name', 'Type', 'Category', 'Amount', 'Date', 'Notes'];
        const rows = state.transactions.map(t => [
            `"${t.id}"`,
            `"${(t.name || '').replace(/"/g, '""')}"`,
            `"${t.type}"`,
            `"${t.category}"`,
            t.amount,
            `"${t.date}"`,
            `"${(t.notes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `ledgerly_transactions_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast('Exported transactions to CSV!', 'success');
    }

    function exportToJSON() {
        if (state.transactions.length === 0) {
            showToast('No transactions to export', 'error');
            return;
        }

        const exportData = {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            settings: state.settings,
            transactions: state.transactions
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ledgerly_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Exported backup to JSON!', 'success');
    }

    function handleImportJSON(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const parsed = JSON.parse(e.target.result);
                if (Array.isArray(parsed.transactions)) {
                    const importedTransactions = parsed.transactions;
                    if (parsed.settings) {
                        state.settings = { ...state.settings, ...parsed.settings };
                        saveSettings();
                    }
                    importTransactions(importedTransactions);
                } else if (Array.isArray(parsed)) {
                        importTransactions(parsed);
                } else {
                    showToast('Invalid Ledgerly JSON file format', 'error');
                }
            } catch (err) {
                console.error('Import error:', err);
                showToast('Could not parse JSON file', 'error');
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    async function importTransactions(transactions) {
        try {
            for (const transaction of transactions) {
                const accountId = transaction.accountId || transaction.account_id ||
                    (state.accounts.length === 1 ? state.accounts[0].id : null);
                if (!accountId) {
                    throw new Error('Each imported transaction must include an account because multiple accounts are available.');
                }
                const categoryId = transaction.categoryId || transaction.category_id ||
                    state.categories?.find(category => category.name === transaction.category)?.id;
                await apiRequest('/transactions', {
                    method: 'POST',
                    body: JSON.stringify({
                        account_id: accountId,
                        category_id: categoryId ? Number(categoryId) : null,
                        amount: Math.abs(Number(transaction.amount) || 0),
                        type: transaction.type,
                        name: String(transaction.name || '').trim(),
                        date: transaction.date
                    })
                });
            }
            await refreshDashboardData();
            showToast(`Successfully imported ${transactions.length} transactions to PostgreSQL.`, 'success');
        } catch (error) {
            console.error('Transaction import failed:', error);
            await refreshDashboardData();
            showToast('Import stopped before all transactions could be saved.', 'error');
        }
    }

    /* --- 10. Navigation & Tabs System --- */

    function switchView(targetTabId) {
        state.activeTab = targetTabId;

        // Update nav links
        document.querySelectorAll('.nav-link').forEach(btn => {
            if (btn.dataset.tab === targetTabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update view sections
        document.querySelectorAll('.view-section').forEach(sec => {
            if (sec.id === targetTabId) {
                sec.classList.add('active');
            } else {
                sec.classList.remove('active');
            }
        });

        // Close mobile sidebar if opened
        closeMobileSidebar();

        // Refresh charts on tab switch
        setTimeout(updateCharts, 50);
    }

    function openMobileSidebar() {
        document.getElementById('sidebar')?.classList.add('open');
        document.getElementById('sidebar-backdrop')?.classList.add('active');
    }

    function closeMobileSidebar() {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebar-backdrop')?.classList.remove('active');
    }

    /* --- 11. Event Listeners Setup --- */

    function attachEventListeners() {
        document.getElementById('login-form')?.addEventListener('submit', handleLoginSubmit);
        document.getElementById('logout-btn')?.addEventListener('click', logout);
        document.getElementById('auth-mode-toggle')?.addEventListener('click', () => {
            setAuthMode(state.authMode === 'login' ? 'register' : 'login');
        });

        // Tab Navigation
        document.querySelectorAll('.nav-link').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                if (tab) switchView(tab);
            });
        });

        // Quick Dashboard "View All" link
        document.getElementById('dash-view-all-tx-btn')?.addEventListener('click', () => {
            switchView('transactions-view');
        });

        // Mobile Sidebar Toggles
        document.getElementById('mobile-menu-btn')?.addEventListener('click', openMobileSidebar);
        document.getElementById('close-sidebar-btn')?.addEventListener('click', closeMobileSidebar);
        document.getElementById('sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);

        // Modal Open Triggers
        document.getElementById('open-add-modal-btn')?.addEventListener('click', openAddModal);
        document.getElementById('tx-page-add-btn')?.addEventListener('click', openAddModal);
        document.getElementById('empty-add-transaction-btn')?.addEventListener('click', openAddModal);
        document.querySelectorAll('#dashboard-tx-tbody, #full-tx-tbody').forEach((tbody) => {
            tbody.addEventListener('click', (event) => {
                const actionButton = event.target.closest('[data-action][data-id]');
                if (!actionButton) return;
                if (actionButton.dataset.action === 'edit') openEditModal(actionButton.dataset.id);
                if (actionButton.dataset.action === 'delete') openDeleteModal(actionButton.dataset.id);
            });
        });

        // Modal Close Triggers
        document.getElementById('close-modal-btn')?.addEventListener('click', () => closeModalBackdrop(txModal));
        document.getElementById('cancel-modal-btn')?.addEventListener('click', () => closeModalBackdrop(txModal));
        document.getElementById('cancel-delete-btn')?.addEventListener('click', () => closeModalBackdrop(deleteModal));

        // Click outside modal dialog to close
        [txModal, deleteModal].forEach(m => {
            if (!m) return;
            m.addEventListener('click', (e) => {
                if (e.target === m) closeModalBackdrop(m);
            });
        });

        // ESC Key to close active modals
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModalBackdrop(txModal);
                closeModalBackdrop(deleteModal);
                closeMobileSidebar();
            }
        });

        // Add / Edit Form Submit
       txForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!validateTransactionForm()) return;

            const editId = document.getElementById('form-edit-id').value;
            const txData = {
                name: document.getElementById('form-name').value,
                amount: document.getElementById('form-amount').value,
                type: document.querySelector('input[name="tx-type"]:checked').value,
                accountId: document.getElementById('form-account').value,
                category: document.getElementById('form-category').value,
                date: document.getElementById('form-date').value,
                notes: document.getElementById('form-notes').value
            };

            if (editId) {
                await editTransaction(editId, txData);
            } else {
                await addTransaction(txData);
            }

            closeModalBackdrop(txModal);
        });

        // Delete Confirm Button
        document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
            if (state.pendingDeleteId) {
                await deleteTransaction(state.pendingDeleteId);
                state.pendingDeleteId = null;
            }
            closeModalBackdrop(deleteModal);
        });

        // Search & Filter Events (Dashboard mini)
        document.getElementById('dash-search-input')?.addEventListener('input', renderDashboardRecentTable);
        document.getElementById('dash-type-filter')?.addEventListener('change', renderDashboardRecentTable);

        // Search & Filter Events (Full Transactions)
        document.getElementById('full-search-input')?.addEventListener('input', renderFullTransactionsTable);
        document.getElementById('filter-type-select')?.addEventListener('change', renderFullTransactionsTable);
        document.getElementById('filter-category-select')?.addEventListener('change', renderFullTransactionsTable);
        document.getElementById('filter-date-select')?.addEventListener('change', renderFullTransactionsTable);
        document.getElementById('filter-sort-select')?.addEventListener('change', renderFullTransactionsTable);

        // Reset Filter Buttons
        const resetFilters = () => {
            const s = document.getElementById('full-search-input');
            const t = document.getElementById('filter-type-select');
            const c = document.getElementById('filter-category-select');
            const d = document.getElementById('filter-date-select');
            const so = document.getElementById('filter-sort-select');
            if (s) s.value = '';
            if (t) t.value = 'all';
            if (c) c.value = 'all';
            if (d) d.value = 'all';
            if (so) so.value = 'date-desc';
            renderFullTransactionsTable();
        };

        document.getElementById('reset-filters-btn')?.addEventListener('click', resetFilters);
        document.getElementById('clear-filters-action-btn')?.addEventListener('click', resetFilters);

        // Demo Data buttons
        document.getElementById('load-sample-header-btn')?.addEventListener('click', loadDemoData);
        document.getElementById('settings-load-demo-btn')?.addEventListener('click', loadDemoData);

        // Reset All Data
        document.getElementById('clear-all-data-btn')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete ALL transactions permanently?')) {
                clearAllTransactions();
            }
        });

        // Export / Import Events
        document.getElementById('export-csv-btn')?.addEventListener('click', exportToCSV);
        document.getElementById('export-json-btn')?.addEventListener('click', exportToJSON);
        document.getElementById('import-json-input')?.addEventListener('change', handleImportJSON);

        // Profile Settings Form
        document.getElementById('profile-settings-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('settings-user-name');
            const currInput = document.getElementById('settings-currency-select');
            const userName = nameInput?.value.trim();
            if (!userName) {
                showToast('Please enter a valid profile name.', 'error');
                return;
            }
            try {
                const result = await apiRequest('/settings', {
                    method: 'PUT',
                    body: JSON.stringify({ userName })
                });
                state.settings.userName = result.data.userName;
            } catch (error) {
                console.error('Error saving profile settings:', error);
                showToast('Failed to save your profile name.', 'error');
                return;
            }
            if (currInput) state.settings.currency = currInput.value || '₦';
            saveSettings();
            refreshAllViews();
            showToast('Settings saved successfully!', 'success');
        });
    }

    /* --- 12. Public API & Initialization --- */

    window.LedgerlyApp = {
        handleEditClick: openEditModal,
        handleDeleteClick: openDeleteModal
    };
    window.loadSampleTransactions = loadDemoData;

    // App Bootstrapper
    async function init() {
        loadSettings();
        try {
            localStorage.removeItem('ledgerly_transactions_v1');
        } catch (error) {
            console.warn('Could not clear the obsolete local transaction cache:', error);
        }
        attachEventListeners();
        attachAnalyticsRetry();

        if (!getAuthToken()) {
            showLoginScreen();
            return;
        }

        try {
            const profile = await apiRequest('/settings');
            state.settings.userName = profile.data.userName || state.settings.userName;
            hideLoginScreen();
            await initializeAuthenticatedApp();
        } catch {
            clearAuthToken();
            showLoginScreen('Sign in to continue.');
        }
    }

    async function initializeAuthenticatedApp() {
        await Promise.all([loadAccounts(), loadCategories(), loadTransactions(), refreshAnalytics()]);
        const nameField = document.getElementById('settings-user-name');
        if (nameField) nameField.value = state.settings.userName;
        const currField = document.getElementById('settings-currency-select');
        if (currField) currField.value = state.settings.currency;
        refreshAllViews();
    }

    async function loadCategories() {
                try {
                        const result = await apiRequest('/categories');
                        state.categories = Array.isArray(result.data) ? result.data : [];

                        const categorySelect = document.getElementById('form-category');
                        if (!categorySelect) return;

                        categorySelect.innerHTML = `
                            <option value="">No category</option>
                                ${state.categories.map(category => `
                                        <option value="${category.id}">
                                                ${escapeHtml(category.name)}
                                        </option>
                                `).join('')}
                        `;
                } catch (error) {
                        console.error('Error loading categories:', error);
                        showToast('Failed to load categories', 'error');
                }
        }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
