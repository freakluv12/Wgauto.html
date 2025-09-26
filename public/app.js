/* app.js for WGauto CRM
   Works with backend routes exactly as provided:
   /api/auth/register, /api/auth/login
   /api/stats/dashboard
   /api/cars, /api/cars/:id/details, /api/cars/:id/expense, /api/cars/:id/dismantle
   /api/rentals, /api/rentals/:id/complete, /api/rentals/calendar/:year/:month
   /api/parts, /api/parts/:id/sell
   /api/admin/users, /api/admin/users/:id/toggle
*/

/* ========== Конфигурация ========== */
const API_BASE = '/api'; // если бекенд на том же домене, оставь '/api'. Иначе 'https://your-domain.com/api'

/* ========== Глобальные переменные ========== */
let currentUser = null;
let allCars = [];
let filteredCars = [];
let allParts = [];
let filteredParts = [];
let currentCarId = null;
let calendarState = { year: (new Date()).getFullYear(), month: (new Date()).getMonth() + 1 }; // month: 1..12

/* ========== Утилиты ========== */
function getToken() { return localStorage.getItem('token'); }
function setToken(t) { if (t) localStorage.setItem('token', t); else localStorage.removeItem('token'); }

async function apiCall(path, opts = {}) {
    const headers = opts.headers || {};
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API_BASE + path, { ...opts, headers });
    if (res.status === 401) { // unauthorized — logout
        performLogout();
        throw new Error('Unauthorized');
    }
    if (!res.ok) {
        const text = await res.text().catch(()=>null);
        try {
            const json = text ? JSON.parse(text) : null;
            throw new Error(json?.error || json?.message || (text || res.statusText));
        } catch (e) {
            throw new Error(text || res.statusText);
        }
    }
    // If no content
    if (res.status === 204) return null;
    return res.json().catch(()=>null);
}

function qs(id) { return document.getElementById(id); }
function hideAllSections() {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
}
function setActiveNav(buttonElement) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (buttonElement) buttonElement.classList.add('active');
}

/* ========== Модалки ========== */
function openModal(id) { qs(id).style.display = 'block'; }
function closeModal(id) { qs(id).style.display = 'none'; }

/* Закрыть модалку при клике на фон */
window.addEventListener('click', e => {
    if (e.target.classList && e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

/* ========== Аутентификация (функции, которые уже используются в HTML) ========== */
async function attemptLogin() {
    const email = qs('loginEmail').value.trim();
    const password = qs('loginPassword').value;
    if (!email || !password) { alert('Введите email и пароль'); return; }

    try {
        const data = await apiCall('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        setToken(data.token);
        currentUser = data.user;
        afterLogin();
    } catch (err) {
        console.error('login error', err);
        alert('Ошибка входа: ' + (err.message || 'неизвестная ошибка'));
    }
}

async function attemptRegister() {
    const email = qs('registerEmail').value.trim();
    const password = qs('registerPassword').value;
    if (!email || !password) { alert('Введите email и пароль'); return; }

    try {
        const data = await apiCall('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
        setToken(data.token);
        currentUser = data.user;
        afterLogin();
    } catch (err) {
        console.error('register error', err);
        alert('Ошибка регистрации: ' + (err.message || 'неизвестная ошибка'));
    }
}

function performLogout() {
    setToken(null);
    currentUser = null;
    qs('authScreen').style.display = 'flex';
    qs('appScreen').style.display = 'none';
}

/* ========== После успешного входа ========== */
async function afterLogin() {
    // Подгрузить профиль из токена, если нужно - токен уже содержит user на бекенде
    qs('authScreen').style.display = 'none';
    qs('appScreen').style.display = 'flex';
    // Поле с email
    try {
        // Если currentUser не задан (например при перезагрузке с локального токена), попытаемся декодировать токен
        if (!currentUser) {
            const tok = getToken();
            if (tok) {
                // безопасное извлечение payload (не проверяет подпись)
                const p = tok.split('.')[1];
                const json = JSON.parse(atob(p));
                currentUser = { id: json.id, email: json.email, role: json.role };
            }
        }
    } catch (e) { /* ignore */ }

    qs('userEmail').textContent = currentUser?.email || 'user';
    if (currentUser?.role === 'ADMIN') qs('adminNav').style.display = 'block';
    else qs('adminNav').style.display = 'none';

    // load default section
    showSectionClient('dashboard', document.querySelector('.nav-item.active'));
    // load dashboard data
    await loadDashboard();
}

/* ========== Навигация ========== */
function showSectionClient(sectionId, navBtn) {
    hideAllSections();
    qs(sectionId).classList.add('active');
    setActiveNav(navBtn);
    qs('pageTitle').textContent = {
        dashboard: 'Dashboard',
        cars: 'Cars',
        rentals: 'Rentals',
        parts: 'Parts Inventory',
        admin: 'Admin Panel'
    }[sectionId] || 'WGauto CRM';

    // Load data for section
    if (sectionId === 'dashboard') loadDashboard();
    if (sectionId === 'cars') loadCars();
    if (sectionId === 'rentals') loadRentals();
    if (sectionId === 'parts') loadParts();
    if (sectionId === 'admin') loadUsers();
}

/* ========== DASHBOARD ========== */
let incomeChart = null;
let expensesChart = null;

async function loadDashboard() {
    try {
        const data = await apiCall('/stats/dashboard');
        // data: { income: [{currency, total}], expenses: [...], cars: [{status, count}], activeRentals }
        // Fill stat cards (we have a #statsGrid element)
        const grid = qs('statsGrid');
        const totalCars = data.cars.reduce((s, c) => s + parseInt(c.count || 0), 0);
        const activeRentals = data.activeRentals || 0;

        const incomes = { USD:0, EUR:0, GEL:0 };
        (data.income || []).forEach(i => incomes[i.currency] = parseFloat(i.total || 0));
        const expenses = { USD:0, EUR:0, GEL:0 };
        (data.expenses || []).forEach(i => expenses[i.currency] = parseFloat(i.total || 0));

        grid.innerHTML = `
            <div class="stat-card"><div class="stat-value">₾${incomes.GEL.toFixed(2)}</div><div class="stat-label">Income GEL</div></div>
            <div class="stat-card"><div class="stat-value">₾${expenses.GEL.toFixed(2)}</div><div class="stat-label">Expenses GEL</div></div>
            <div class="stat-card"><div class="stat-value">$${incomes.USD.toFixed(2)}</div><div class="stat-label">Income USD</div></div>
            <div class="stat-card"><div class="stat-value">$${expenses.USD.toFixed(2)}</div><div class="stat-label">Expenses USD</div></div>
            <div class="stat-card"><div class="stat-value">€${incomes.EUR.toFixed(2)}</div><div class="stat-label">Income EUR</div></div>
            <div class="stat-card"><div class="stat-value">€${expenses.EUR.toFixed(2)}</div><div class="stat-label">Expenses EUR</div></div>
            <div class="stat-card"><div class="stat-value">${totalCars}</div><div class="stat-label">Total Cars</div></div>
            <div class="stat-card"><div class="stat-value">${activeRentals}</div><div class="stat-label">Active Rentals</div></div>
        `;

        // Transactions table (recent) - backend didn't provide dedicated endpoint, so we will fetch recent transactions by listing latest transactions from all cars via /api/cars and details -> but to keep it efficient, just show recent rentals and recent parts sales plus recent transactions per car when available.
        // Simpler: show last 10 transactions by scanning cars -> details (could be heavy). We'll instead show recent rentals and recent parts sales (faster).
        await renderRecentTransactions();

        // Charts: income vs expenses per currency (bar)
        renderDashboardCharts(data);
    } catch (err) {
        console.error('loadDashboard', err);
        qs('statsGrid').innerHTML = `<div class="loading">Ошибка загрузки статистики: ${err.message}</div>`;
    }
}

async function renderRecentTransactions() {
    try {
        // Get rentals and parts, then build recent rows
        const rentals = await apiCall('/rentals');
        const parts = await apiCall('/parts?status=sold');

        // Map to unified list
        const rows = [];

        (rentals || []).slice(0, 10).forEach(r => {
            rows.push({
                date: r.created_at || r.start_date,
                car: `${r.brand || ''} ${r.model || ''} ${r.year || ''}`.trim(),
                type: 'rental',
                amount: r.total_amount || 0,
                description: `Client: ${r.client_name || ''}`
            });
        });

        (parts || []).slice(0, 10).forEach(p => {
            rows.push({
                date: p.sold_at || p.created_at,
                car: `${p.brand || ''} ${p.model || ''}`.trim(),
                type: 'part sale',
                amount: p.sale_price || 0,
                description: `${p.name} ${p.buyer ? `to ${p.buyer}` : ''}`
            });
        });

        // sort by date desc
        rows.sort((a,b)=> new Date(b.date) - new Date(a.date));

        const tbody = qs('recentTransactions').querySelector('tbody');
        tbody.innerHTML = '';
        rows.slice(0, 20).forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(r.date).toLocaleString()}</td>
                <td>${r.car || ''}</td>
                <td>${r.type}</td>
                <td>${formatMoney(r.amount)}</td>
                <td>${r.description || ''}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.warn('renderRecentTransactions', err);
    }
}

function renderDashboardCharts(data) {
    // Prepare datasets
    const currencies = ['GEL','USD','EUR'];
    const incomeVals = currencies.map(c => parseFloat((data.income.find(i=>i.currency===c)?.total)||0));
    const expenseVals = currencies.map(c => parseFloat((data.expenses.find(i=>i.currency===c)?.total)||0));

    // Destroy old charts
    if (incomeChart) { incomeChart.destroy(); incomeChart = null; }
    if (expensesChart) { expensesChart.destroy(); expensesChart = null; }

    // Create canvas placeholders (in DOM place new canvases)
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '20px';
    container.style.marginTop = '20px';

    const c1 = document.createElement('canvas'); c1.id = 'incomeChart'; c1.style.maxWidth='350px';
    const c2 = document.createElement('canvas'); c2.id = 'expenseChart'; c2.style.maxWidth='350px';

    container.appendChild(c1); container.appendChild(c2);

    // place below statsGrid
    // remove previous chart area if exists
    const existing = document.getElementById('dashboardCharts');
    if (existing) existing.remove();

    const chartWrapper = document.createElement('div');
    chartWrapper.id = 'dashboardCharts';
    chartWrapper.appendChild(container);
    qs('dashboard').appendChild(chartWrapper);

    // create charts using Chart.js (must be included)
    try {
        incomeChart = new Chart(c1.getContext('2d'), {
            type: 'bar',
            data: {
                labels: currencies,
                datasets: [{
                    label: 'Income',
                    data: incomeVals
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });

        expensesChart = new Chart(c2.getContext('2d'), {
            type: 'bar',
            data: {
                labels: currencies,
                datasets: [{
                    label: 'Expenses',
                    data: expenseVals
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
    } catch (e) {
        console.warn('Chart.js not loaded or failed', e);
    }
}

/* ========== CARS ========== */
async function loadCars() {
    try {
        const search = qs('carSearch')?.value || '';
        const status = qs('carStatusFilter')?.value || '';
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        const rows = await apiCall('/cars' + (params.toString() ? '?'+params.toString() : ''));
        allCars = rows || [];
        filteredCars = [...allCars];
        displayCars();
        populateCarSelects();
    } catch (err) {
        console.error('loadCars', err);
        qs('carsGrid').innerHTML = `<div class="loading">Ошибка загрузки машин: ${err.message}</div>`;
    }
}

function displayCars() {
    const grid = qs('carsGrid');
    grid.innerHTML = '';
    if (!filteredCars.length) {
        grid.innerHTML = '<div class="loading">Нет машин</div>';
        return;
    }
    filteredCars.forEach(car => {
        const statusClass = `status-${car.status}`;
        const card = document.createElement('div');
        card.className = 'car-card';
        card.innerHTML = `
            <div class="car-header">
                <div class="car-title">${escapeHtml(car.brand)} ${escapeHtml(car.model)} ${car.year || ''}</div>
                <div class="car-status ${statusClass}">${(car.status||'').toUpperCase()}</div>
            </div>
            <div style="color:#ccc">
                <div>VIN: ${escapeHtml(car.vin || 'N/A')}</div>
                <div>Price: ${formatMoney(car.price)} ${car.currency || ''}</div>
            </div>
            <div style="margin-top:12px;">
                <button class="btn" onclick="event.stopPropagation(); openCarDetails(${car.id})">Open</button>
                <button class="btn btn-danger" onclick="event.stopPropagation(); dismantleCarConfirm(${car.id})">Dismantle</button>
            </div>
        `;
        card.addEventListener('click', () => openCarDetails(car.id));
        grid.appendChild(card);
    });
}

function searchCars() {
    const term = (qs('carSearch').value || '').toLowerCase();
    const statusFilter = qs('carStatusFilter').value || '';
    filteredCars = allCars.filter(c => {
        const matches = !term || (c.brand && c.brand.toLowerCase().includes(term)) ||
                        (c.model && c.model.toLowerCase().includes(term)) ||
                        (c.vin && c.vin.toLowerCase().includes(term)) ||
                        (c.year && c.year.toString().includes(term));
        const matchesStatus = !statusFilter || c.status === statusFilter;
        return matches && matchesStatus;
    });
    displayCars();
}

async function addCar() {
    const brand = qs('carBrand').value.trim();
    const model = qs('carModel').value.trim();
    const year = parseInt(qs('carYear').value) || null;
    const vin = qs('carVin').value.trim() || null;
    const price = parseFloat(qs('carPrice').value) || 0;
    const currency = qs('carCurrency').value || 'USD';

    if (!brand || !model || !price) { alert('Заполните бренд, модель и цену'); return; }

    try {
        await apiCall('/cars', { method: 'POST', body: JSON.stringify({ brand, model, year, vin, price, currency }) });
        closeModal('addCarModal');
        // clear form
        ['carBrand','carModel','carYear','carVin','carPrice'].forEach(id=>qs(id).value='');
        await loadCars();
    } catch (err) {
        alert('Ошибка добавления машины: ' + err.message);
    }
}

async function openCarDetails(carId) {
    currentCarId = carId;
    try {
        const data = await apiCall(`/cars/${carId}/details`);
        // fill details
        qs('carDetailsTitle').textContent = `${data.car.brand} ${data.car.model} ${data.car.year || ''}`;
        // Info tab
        const infoHtml = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                <div>
                    <strong>Brand:</strong> ${escapeHtml(data.car.brand)}<br>
                    <strong>Model:</strong> ${escapeHtml(data.car.model)}<br>
                    <strong>Year:</strong> ${data.car.year || ''}<br>
                    <strong>VIN:</strong> ${escapeHtml(data.car.vin || 'N/A')}<br>
                    <strong>Status:</strong> ${(data.car.status||'').toUpperCase()}
                </div>
                <div>
                    <strong>Purchase Price:</strong> ${formatMoney(data.car.price)} ${data.car.currency || ''}<br>
                    <strong>Added:</strong> ${new Date(data.car.created_at).toLocaleString()}<br>
                    <strong>Owner id:</strong> ${data.car.user_id || ''}
                </div>
            </div>
        `;
        qs('carInfoContent').innerHTML = infoHtml;
        // Finances
        renderCarProfitability(data.profitability || []);
        renderCarTransactions(data.transactions || []);
        renderRecentExpensesList(data.transactions || []);
        // Parts (dismantling)
        renderCarParts(data.parts || []);
        renderCarRentalsTable(data.rentals || []);
        // Show modal
        openModal('carDetailsModal');
    } catch (err) {
        alert('Не удалось получить детали машины: ' + err.message);
    }
}

function renderCarProfitability(rows) {
    const container = qs('carProfitSummary');
    container.innerHTML = '';
    if (!rows || !rows.length) {
        container.innerHTML = `<div class="profit-card"><div class="currency-label">Нет транзакций</div></div>`;
        return;
    }
    rows.forEach(r => {
        const income = parseFloat(r.total_income || 0);
        const expense = parseFloat(r.total_expenses || 0);
        const profit = income - expense;
        const el = document.createElement('div');
        el.className = 'profit-card';
        el.innerHTML = `<div class="currency-label">${r.currency}</div><div class="amount ${profit>=0?'positive':'negative'}">${profit.toFixed(2)}</div>`;
        container.appendChild(el);
    });
}

function renderCarTransactions(transactions) {
    const tbody = qs('carTransactions').querySelector('tbody');
    tbody.innerHTML = '';
    (transactions || []).forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(t.date).toLocaleString()}</td>
            <td>${t.type}</td>
            <td>${formatMoney(t.amount)} ${t.currency}</td>
            <td>${t.category || ''}</td>
            <td>${escapeHtml(t.description || '')}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderRecentExpensesList(transactions) {
    const box = qs('recentExpenses');
    box.innerHTML = '';
    const expenses = (transactions || []).filter(t=>t.type === 'expense').slice(0,20);
    if (!expenses.length) { box.innerHTML = '<div class="loading">No expenses</div>'; return; }
    expenses.forEach(e => {
        const div = document.createElement('div');
        div.style.padding = '8px';
        div.style.borderBottom = '1px solid #444';
        div.innerHTML = `<strong>${formatMoney(e.amount)} ${e.currency}</strong> — ${escapeHtml(e.category || e.description || '')} <div style="color:#888; font-size:12px">${new Date(e.date).toLocaleString()}</div>`;
        box.appendChild(div);
    });
}

function renderCarParts(parts) {
    const wrapper = qs('carPartsList');
    wrapper.innerHTML = '';
    if (!parts || !parts.length) { wrapper.innerHTML = '<div class="loading">No parts</div>'; return; }
    const table = document.createElement('table'); table.className='table';
    table.innerHTML = `<thead><tr><th>Name</th><th>Est Price</th><th>Location</th><th>Status</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    parts.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${escapeHtml(p.name)}</td><td>${formatMoney(p.estimated_price)} ${p.currency||''}</td><td>${escapeHtml(p.storage_location||'')}</td><td>${p.status}</td>`;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
}

function renderCarRentalsTable(rentals) {
    const tbody = qs('carRentalsTable').querySelector('tbody');
    tbody.innerHTML = '';
    (rentals || []).forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${escapeHtml(r.client_name)}</td><td>${r.start_date} — ${r.end_date}</td><td>${formatMoney(r.daily_price)} ${r.currency}</td><td>${formatMoney(r.total_amount)}</td><td>${r.status}</td>`;
        tbody.appendChild(tr);
    });
}

async function addExpense() {
    if (!currentCarId) { alert('Car not selected'); return; }
    const amount = parseFloat(qs('expenseAmount').value) || 0;
    const currency = qs('expenseCurrency').value;
    const category = qs('expenseCategory').value;
    const description = qs('expenseDescription').value || '';

    if (!amount || !currency || !category) { alert('Введите сумму, валюту и категорию'); return; }

    try {
        await apiCall(`/cars/${currentCarId}/expense`, { method: 'POST', body: JSON.stringify({ amount, currency, category, description }) });
        qs('expenseAmount').value = '';
        qs('expenseDescription').value = '';
        // reload details
        openCarDetails(currentCarId);
    } catch (err) {
        alert('Ошибка добавления расхода: ' + err.message);
    }
}

async function dismantleCarConfirm(carId) {
    if (!confirm('Действительно разобрать машину? Это переведёт статус в "dismantled".')) return;
    try {
        await apiCall(`/cars/${carId}/dismantle`, { method: 'POST' });
        await loadCars();
        if (currentCarId === carId) openCarDetails(carId);
    } catch (err) {
        alert('Ошибка при разборке: ' + err.message);
    }
}

/* ========== RENTALS ========== */
async function loadRentals() {
    try {
        const rows = await apiCall('/rentals');
        const tbody = qs('activeRentalsTable').querySelector('tbody');
        tbody.innerHTML = '';
        (rows || []).forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(r.brand||'') } ${escapeHtml(r.model||'')}</td>
                <td>${escapeHtml(r.client_name)}</td>
                <td>${r.start_date}</td>
                <td>${r.end_date}</td>
                <td>${formatMoney(r.daily_price)} ${r.currency}</td>
                <td>${formatMoney(r.total_amount)}</td>
                <td>
                    ${r.status === 'active' ? `<button class="btn" onclick="completeRental(${r.id})">Complete</button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });

        // calendar initial render
        renderCalendar(calendarState.year, calendarState.month);
    } catch (err) {
        console.error('loadRentals', err);
        qs('activeRentalsTable').querySelector('tbody').innerHTML = `<tr><td colspan="7">Ошибка: ${err.message}</td></tr>`;
    }
}

async function addRental() {
    const car_id = parseInt(qs('rentalCar').value);
    const client_name = qs('rentalClient').value.trim();
    const client_phone = qs('rentalPhone').value.trim();
    const start_date = qs('rentalStart').value;
    const end_date = qs('rentalEnd').value;
    const daily_price = parseFloat(qs('rentalPrice').value) || 0;
    const currency = qs('rentalCurrency').value;

    if (!car_id || !client_name || !start_date || !end_date || !daily_price) { alert('Заполните все поля'); return; }

    try {
        await apiCall('/rentals', { method: 'POST', body: JSON.stringify({ car_id, client_name, client_phone, start_date, end_date, daily_price, currency }) });
        closeModal('addRentalModal');
        // clear form
        ['rentalCar','rentalClient','rentalPhone','rentalStart','rentalEnd','rentalPrice'].forEach(id=>qs(id).value='');
        loadRentals();
        loadCars(); // status may change to rented
    } catch (err) {
        alert('Ошибка создания аренды: ' + err.message);
    }
}

async function completeRental(id) {
    if (!confirm('Завершить аренду и засчитать оплату?')) return;
    try {
        await apiCall(`/rentals/${id}/complete`, { method: 'POST' });
        loadRentals();
        loadDashboard();
    } catch (err) {
        alert('Ошибка завершения аренды: ' + err.message);
    }
}

/* Calendar navigation & render */
function changeMonth(delta) {
    calendarState.month += delta;
    if (calendarState.month < 1) { calendarState.month = 12; calendarState.year -= 1; }
    if (calendarState.month > 12) { calendarState.month = 1; calendarState.year += 1; }
    renderCalendar(calendarState.year, calendarState.month);
}

async function renderCalendar(year, month) {
    calendarState.year = year; calendarState.month = month;
    qs('calendarTitle').textContent = `${year} — ${String(month).padStart(2,'0')}`;
    const calendarElement = qs('calendar');
    calendarElement.innerHTML = '';
    // header days
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    days.forEach(d => {
        const h = document.createElement('div'); h.className='calendar-header'; h.textContent = d;
        calendarElement.appendChild(h);
    });

    // fetch rentals for month
    try {
        const rentals = await apiCall(`/rentals/calendar/${year}/${String(month).padStart(2,'0')}`);
        // build map day -> count
        const firstDay = new Date(year, month-1, 1);
        const firstWeekDay = firstDay.getDay();
        const daysInMonth = new Date(year, month, 0).getDate();

        // fill leading blanks
        for (let i=0;i<firstWeekDay;i++) {
            const el = document.createElement('div'); el.className='calendar-day other-month'; el.innerHTML = ''; calendarElement.appendChild(el);
        }

        const rentalsByDate = {}; // yyyy-mm-dd -> array
        (rentals||[]).forEach(r=>{
            // for simplicity, mark on start_date..end_date
            const start = new Date(r.start_date);
            const end = new Date(r.end_date);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
                if (d.getFullYear()===year && (d.getMonth()+1)===month) {
                    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    rentalsByDate[key] = rentalsByDate[key] || [];
                    rentalsByDate[key].push(r);
                }
            }
        });

        for (let day=1; day<=daysInMonth; day++) {
            const dateKey = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const el = document.createElement('div'); el.className='calendar-day';
            el.innerHTML = `<div style="font-weight:bold">${day}</div>`;
            if (rentalsByDate[dateKey]) {
                const count = rentalsByDate[dateKey].length;
                const indicator = document.createElement('div');
                indicator.className = 'rental-indicator';
                indicator.textContent = `${count} rent${count>1?'s':''}`;
                el.appendChild(indicator);
                // tooltip with rental details on hover
                el.title = rentalsByDate[dateKey].map(rr=>`${rr.brand||''} ${rr.model||''}: ${rr.client_name} (${rr.start_date}→${rr.end_date})`).join('\n');
            }
            calendarElement.appendChild(el);
        }
    } catch (err) {
        console.error('renderCalendar', err);
        calendarElement.innerHTML = `<div class="loading">Ошибка календаря: ${err.message}</div>`;
    }
}

/* ========== PARTS ========== */
async function loadParts() {
    try {
        const search = qs('partSearch')?.value || '';
        const status = qs('partStatusFilter')?.value || '';
        const currency = qs('partCurrencyFilter')?.value || '';
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        if (currency) params.append('currency', currency);
        const rows = await apiCall('/parts' + (params.toString() ? '?'+params.toString() : ''));
        allParts = rows || [];
        filteredParts = [...allParts];
        renderPartsTable();
        populatePartCarSelect();
    } catch (err) {
        console.error('loadParts', err);
        qs('partsTable').querySelector('tbody').innerHTML = `<tr><td colspan="7">Ошибка: ${err.message}</td></tr>`;
    }
}

function renderPartsTable() {
    const tbody = qs('partsTable').querySelector('tbody');
    tbody.innerHTML = '';
    (filteredParts || []).forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.brand||'')} ${escapeHtml(p.model||'')}</td><td>${formatMoney(p.cost_basis)}</td><td>${formatMoney(p.sale_price)}</td><td>${escapeHtml(p.storage_location||'')}</td><td>${p.status}</td>
            <td>
                ${p.status !== 'sold' ? `<button class="btn" onclick="openSellPartModal(${p.id})">Sell</button>` : `<button class="btn btn-danger" disabled>Sold</button>`}
            </td>`;
        tbody.appendChild(tr);
    });
}

async function addPart() {
    const car_id = parseInt(qs('partCar').value);
    const name = qs('partName').value.trim();
    const estimated_price = parseFloat(qs('partPrice').value) || null;
    const currency = qs('partCurrency').value;
    const storage_location = qs('partLocation').value.trim();

    if (!car_id || !name) { alert('Выберите машину и введите имя детали'); return; }

    try {
        await apiCall('/parts', { method: 'POST', body: JSON.stringify({ car_id, name, estimated_price, currency, storage_location }) });
        closeModal('addPartModal');
        ['partCar','partName','partPrice','partLocation'].forEach(id=>qs(id).value='');
        loadParts();
    } catch (err) {
        alert('Ошибка добавления детали: ' + err.message);
    }
}

function openSellPartModal(partId) {
    const part = allParts.find(p=>p.id===partId);
    if (!part) return alert('Part not found');
    qs('sellPartTitle').textContent = `Sell: ${part.name}`;
    qs('sellPartInfo').innerHTML = `
        <div><strong>Name:</strong> ${escapeHtml(part.name)}</div>
        <div><strong>Estimated:</strong> ${formatMoney(part.estimated_price)} ${part.currency||''}</div>
        <div><strong>Cost basis:</strong> ${formatMoney(part.cost_basis)} ${part.car_currency||''}</div>
    `;
    qs('sellPartPrice').value = part.sale_price || '';
    qs('sellPartCurrency').value = part.sale_currency || part.currency || 'USD';
    qs('sellPartBuyer').value = '';
    qs('sellPartNotes').value = '';
    qs('sellPartModal').dataset.partId = partId;
    openModal('sellPartModal');
}

async function confirmSellPart() {
    const partId = qs('sellPartModal').dataset.partId;
    const sale_price = parseFloat(qs('sellPartPrice').value) || 0;
    const sale_currency = qs('sellPartCurrency').value;
    const buyer = qs('sellPartBuyer').value.trim();
    const notes = qs('sellPartNotes').value.trim();

    if (!sale_price || !sale_currency) { alert('Введите цену и валюту'); return; }

    try {
        await apiCall(`/parts/${partId}/sell`, { method: 'POST', body: JSON.stringify({ sale_price, sale_currency, buyer, notes }) });
        closeModal('sellPartModal');
        loadParts();
        loadDashboard();
    } catch (err) {
        alert('Ошибка продажи детали: ' + err.message);
    }
}

/* ========== ADMIN ========== */
async function loadUsers() {
    try {
        const rows = await apiCall('/admin/users');
        const tbody = qs('usersTable').querySelector('tbody');
        tbody.innerHTML = '';
        (rows || []).forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escapeHtml(u.email)}</td><td>${u.role}</td><td>${u.active? 'active':'inactive'}</td><td>${new Date(u.created_at).toLocaleString()}</td>
                <td><button class="btn" onclick="toggleUser(${u.id})">Toggle</button></td>`;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('loadUsers', err);
        qs('usersTable').querySelector('tbody').innerHTML = `<tr><td colspan="5">Ошибка: ${err.message}</td></tr>`;
    }
}

async function toggleUser(id) {
    if (!confirm('Toggle user active/inactive?')) return;
    try {
        await apiCall(`/admin/users/${id}/toggle`, { method: 'PUT' });
        loadUsers();
    } catch (err) {
        alert('Ошибка: ' + err.message);
    }
}

/* ========== Helpers ========== */
function formatMoney(v) {
    if (v === null || typeof v === 'undefined' || isNaN(v)) return '-';
    return parseFloat(v).toFixed(2);
}
function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`=\/]/g, function (c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;', '/':'&#x2F;', '`':'&#x60;','=':'&#x3D;'}[c];
    });
}

/* Populate selects */
function populateCarSelects() {
    const sel = qs('rentalCar');
    if (!sel) return;
    sel.innerHTML = `<option value="">Select a car...</option>`;
    allCars.forEach(c => {
        if (c.status !== 'dismantled' && c.status !== 'sold') {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.brand} ${c.model} ${c.year || ''} (${c.status})`;
            sel.appendChild(opt);
        }
    });
    // Also populate partCar select for adding part
    populatePartCarSelect();
}

function populatePartCarSelect() {
    const sel = qs('partCar');
    if (!sel) return;
    sel.innerHTML = `<option value="">Select dismantled car...</option>`;
    allCars.filter(c => c.status === 'dismantled').forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.brand} ${c.model} ${c.year || ''} (id:${c.id})`;
        sel.appendChild(opt);
    });
}

/* ========== Init: bind UI events on DOMContentLoaded ========== */
document.addEventListener('DOMContentLoaded', () => {
    // wire up existing inline buttons to our functions (some already call attemptLogin/attemptRegister)
    // login/register functions are named attemptLogin/attemptRegister in HTML, so they will work.

    // logout button
    qs('logoutBtn').addEventListener('click', performLogout);

    // navigation: sidebar buttons already have onclick="showSection('...')" in your HTML; we will override to our function using event delegation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const t = e.currentTarget;
            const txt = t.textContent.trim().toLowerCase();
            // map by data / text
            if (t.onclick) {
                // leave as is if inline handler exists, but also call our function
            }
            // Determine section from button text or id
            if (t.textContent.includes('Dashboard') || t.textContent.includes('📊') || t.textContent.toLowerCase().includes('dashboard')) {
                showSectionClient('dashboard', t);
            } else if (t.textContent.includes('Cars') || t.textContent.includes('🚗')) {
                showSectionClient('cars', t);
            } else if (t.textContent.includes('Rentals') || t.textContent.includes('📅')) {
                showSectionClient('rentals', t);
            } else if (t.textContent.includes('Parts') || t.textContent.includes('🔧')) {
                showSectionClient('parts', t);
            } else if (t.textContent.includes('Admin') || t.textContent.includes('⚙️')) {
                showSectionClient('admin', t);
            }
        });
    });

    // Bind search/filter handlers
    if (qs('carSearch')) qs('carSearch').addEventListener('input', searchCars);
    if (qs('carStatusFilter')) qs('carStatusFilter').addEventListener('change', searchCars);
    if (qs('partSearch')) qs('partSearch').addEventListener('input', () => { loadParts(); });
    if (qs('partStatusFilter')) qs('partStatusFilter').addEventListener('change', () => { loadParts(); });
    if (qs('partCurrencyFilter')) qs('partCurrencyFilter').addEventListener('change', () => { loadParts(); });

    // bind add car button inside modal
    const addCarBtn = qs('addCarModal')?.querySelector('.btn');
    if (addCarBtn) addCarBtn.addEventListener('click', addCar);

    // bind rental creation
    const addRentalBtn = qs('addRentalModal')?.querySelector('.btn');
    if (addRentalBtn) addRentalBtn.addEventListener('click', addRental);

    // bind part creation
    const addPartBtn = qs('addPartModal')?.querySelector('.btn');
    if (addPartBtn) addPartBtn.addEventListener('click', addPart);

    // bind sell part confirm
    const sellPartBtn = qs('sellPartModal')?.querySelector('.btn');
    if (sellPartBtn) sellPartBtn.addEventListener('click', confirmSellPart);

    // car details tabs: attach tab switching inside modal
    document.querySelectorAll('#carDetailsModal .tab').forEach((tab, idx) => {
        tab.addEventListener('click', (e) => {
            // remove active from siblings
            const tabs = tab.parentElement.querySelectorAll('.tab');
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            // hide contents
            const contents = tab.parentElement.parentElement.querySelectorAll('.tab-content');
            contents.forEach(c => c.classList.remove('active'));
            // choose mapping by text
            const key = tab.textContent.trim().toLowerCase();
            if (key.includes('info')) qs('carInfo').classList.add('active');
            else if (key.includes('finances')) qs('carFinances').classList.add('active');
            else if (key.includes('dismantling')) qs('carDismantling').classList.add('active');
            else if (key.includes('rental')) qs('carRentals').classList.add('active');
        });
    });

    // If token exists, immediately try to restore
    if (getToken()) {
        afterLogin().catch(e => {
            console.warn('restore session failed', e);
            performLogout();
        });
    } else {
        // show auth screen if not logged
        qs('authScreen').style.display = 'flex';
        qs('appScreen').style.display = 'none';
    }
});

/* ========== Small security helper: prevent XSS in inserted user data ========== */
// escapeHtml used above

/* ========== End of file ========= */
