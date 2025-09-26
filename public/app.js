// Global variables
let currentUser = null;
let currentCarId = null;
let currentPartId = null;
let currentDate = new Date();
let allCars = [];
let allParts = [];
let allRentals = [];
let filteredCars = [];
let filteredParts = [];

// Initialize app on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
});

// Authentication functions
function checkAuthStatus() {
    const token = localStorage.getItem('token');
    if (token) {
        // Verify token by making a test API call
        apiCall('/api/stats/dashboard').then(response => {
            if (response) {
                // Token is valid, show app
                const userEmail = localStorage.getItem('userEmail');
                const userRole = localStorage.getItem('userRole');
                if (userEmail && userRole) {
                    currentUser = { email: userEmail, role: userRole };
                    showApp();
                } else {
                    showAuth();
                }
            } else {
                showAuth();
            }
        }).catch(() => {
            showAuth();
        });
    } else {
        showAuth();
    }
}

function showAuth() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
}

function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}

function showRegisterForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

async function attemptLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        alert('Please enter email and password');
        return;
    }

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('userEmail', data.user.email);
            localStorage.setItem('userRole', data.user.role);
            currentUser = data.user;
            showApp();
        } else {
            const error = await response.json();
            alert('Login failed: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login error: Cannot connect to server');
    }
}

async function attemptRegister() {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    if (!email || !password) {
        alert('Please enter email and password');
        return;
    }

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('userEmail', data.user.email);
            localStorage.setItem('userRole', data.user.role);
            currentUser = data.user;
            showApp();
        } else {
            const error = await response.json();
            alert('Registration failed: ' + error.error);
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('Registration error: Cannot connect to server');
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    currentUser = null;
    showAuth();
}

function showApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'flex';
    document.getElementById('userEmail').textContent = currentUser.email;
    
    if (currentUser.role === 'ADMIN') {
        document.getElementById('adminNav').style.display = 'block';
    }
    
    loadDashboard();
}

// API helper function
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    try {
        const response = await fetch(endpoint, { ...defaultOptions, ...options });
        
        if (response.status === 401) {
            logout();
            return null;
        }

        return response;
    } catch (error) {
        console.error('API call error:', error);
        return null;
    }
}

// Navigation functions
function showSection(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => section.classList.remove('active'));
    
    // Hide all nav items active state
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    // Show selected section
    document.getElementById(sectionName).classList.add('active');
    
    // Find and activate the corresponding nav item
    const navButtons = document.querySelectorAll('.nav-item');
    navButtons.forEach(button => {
        if (button.onclick && button.onclick.toString().includes(sectionName)) {
            button.classList.add('active');
        }
    });
    
    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        cars: 'Cars',
        rentals: 'Rentals',
        parts: 'Parts Inventory',
        admin: 'Admin Panel'
    };
    document.getElementById('pageTitle').textContent = titles[sectionName];

    // Load section data
    switch(sectionName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'cars':
            loadCars();
            break;
        case 'rentals':
            loadRentals();
            break;
        case 'parts':
            loadParts();
            break;
        case 'admin':
            loadUsers();
            break;
    }
}

// Dashboard functions
async function loadDashboard() {
    try {
        const response = await apiCall('/api/stats/dashboard');
        if (!response) return;

        const data = await response.json();
        
        // Create stats grid
        let statsHTML = '';
        
        // Income and expense cards
        const currencies = ['USD', 'EUR', 'GEL'];
        const currencySymbols = { USD: '$', EUR: '€', GEL: '₾' };
        
        currencies.forEach(currency => {
            const income = data.income.find(i => i.currency === currency);
            const expense = data.expenses.find(e => e.currency === currency);
            
            const incomeAmount = income ? parseFloat(income.total) : 0;
            const expenseAmount = expense ? parseFloat(expense.total) : 0;
            const profit = incomeAmount - expenseAmount;
            
            if (incomeAmount > 0 || expenseAmount > 0) {
                statsHTML += `
                    <div class="stat-card">
                        <div class="stat-value">${currencySymbols[currency]}${incomeAmount.toFixed(2)}</div>
                        <div class="stat-label">Income ${currency}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${currencySymbols[currency]}${expenseAmount.toFixed(2)}</div>
                        <div class="stat-label">Expenses ${currency}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" style="color: ${profit >= 0 ? '#4CAF50' : '#f44336'}">${currencySymbols[currency]}${profit.toFixed(2)}</div>
                        <div class="stat-label">Profit ${currency}</div>
                    </div>
                `;
            }
        });

        // Car status stats
        const totalCars = data.cars.reduce((sum, car) => sum + parseInt(car.count), 0);
        const activeCars = data.cars.find(c => c.status === 'active')?.count || 0;
        const rentedCars = data.cars.find(c => c.status === 'rented')?.count || 0;
        
        statsHTML += `
            <div class="stat-card">
                <div class="stat-value">${totalCars}</div>
                <div class="stat-label">Total Cars</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${activeCars}</div>
                <div class="stat-label">Active Cars</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${data.activeRentals}</div>
                <div class="stat-label">Active Rentals</div>
            </div>
        `;

        document.getElementById('statsGrid').innerHTML = statsHTML;

    } catch (error) {
        console.error('Dashboard load error:', error);
        document.getElementById('statsGrid').innerHTML = '<div class="loading">Error loading dashboard data</div>';
    }
}

// Cars functions
async function loadCars() {
    try {
        const response = await apiCall('/api/cars');
        if (!response) return;

        allCars = await response.json();
        filteredCars = [...allCars];
        displayCars();
    } catch (error) {
        console.error('Cars load error:', error);
        document.getElementById('carsGrid').innerHTML = '<div class="loading">Error loading cars</div>';
    }
}

function displayCars() {
    let carsHTML = '';

    if (filteredCars.length === 0) {
        carsHTML = '<div class="loading">No cars found</div>';
    } else {
        filteredCars.forEach(car => {
            const statusClass = `status-${car.status}`;
            carsHTML += `
                <div class="car-card" onclick="showCarDetails(${car.id})">
                    <div class="car-header">
                        <div class="car-title">${car.brand} ${car.model} ${car.year || ''}</div>
                        <div class="car-status ${statusClass}">${car.status.toUpperCase()}</div>
                    </div>
                    <div style="color: #ccc;">
                        <div>VIN: ${car.vin || 'N/A'}</div>
                        <div>Price: ${getCurrencySymbol(car.currency)}${car.price || 0}</div>
                    </div>
                </div>
            `;
        });
    }

    document.getElementById('carsGrid').innerHTML = carsHTML;
}

function searchCars() {
    const searchTerm = document.getElementById('carSearch').value.toLowerCase();
    const statusFilter = document.getElementById('carStatusFilter').value;

    filteredCars = allCars.filter(car => {
        const matchesSearch = !searchTerm || 
            car.brand.toLowerCase().includes(searchTerm) ||
            car.model.toLowerCase().includes(searchTerm) ||
            (car.vin && car.vin.toLowerCase().includes(searchTerm)) ||
            (car.year && car.year.toString().includes(searchTerm));
        
        const matchesStatus = !statusFilter || car.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    displayCars();
}

function filterCars() {
    searchCars();
}

function getCurrencySymbol(currency) {
    const symbols = { USD: '$', EUR: '€', GEL: '₾' };
    return symbols[currency] || currency;
}

function showAddCarModal() {
    document.getElementById('addCarModal').style.display = 'block';
}

async function addCar() {
    const carData = {
        brand: document.getElementById('carBrand').value,
        model: document.getElementById('carModel').value,
        year: parseInt(document.getElementById('carYear').value) || null,
        vin: document.getElementById('carVin').value,
        price: parseFloat(document.getElementById('carPrice').value) || null,
        currency: document.getElementById('carCurrency').value
    };

    if (!carData.brand || !carData.model) {
        alert('Brand and model are required');
        return;
    }

    try {
        const response = await apiCall('/api/cars', {
            method: 'POST',
            body: JSON.stringify(carData)
        });

        if (response && response.ok) {
            closeModal('addCarModal');
            loadCars();
            // Clear form
            document.getElementById('carBrand').value = '';
            document.getElementById('carModel').value = '';
            document.getElementById('carYear').value = '';
            document.getElementById('carVin').value = '';
            document.getElementById('carPrice').value = '';
        } else {
            alert('Failed to add car');
        }
    } catch (error) {
        alert('Error adding car: ' + error.message);
    }
}

async function showCarDetails(carId) {
    currentCarId = carId;
    
    try {
        const response = await apiCall(`/api/cars/${carId}/details`);
        if (!response) return;

        const data = await response.json();
        const car = data.car;

        document.getElementById('carDetailsTitle').textContent = `${car.brand} ${car.model} ${car.year || ''}`;
        
        // Car info tab
        const carInfoHTML = `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                <div>
                    <strong>Brand:</strong> ${car.brand}<br>
                    <strong>Model:</strong> ${car.model}<br>
                    <strong>Year:</strong> ${car.year || 'N/A'}<br>
                    <strong>VIN:</strong> ${car.vin || 'N/A'}
                </div>
                <div>
                    <strong>Purchase Price:</strong> ${getCurrencySymbol(car.currency)}${car.price || 0}<br>
                    <strong>Status:</strong> ${car.status.toUpperCase()}<br>
                    <strong>Added:</strong> ${new Date(car.created_at).toLocaleDateString()}
                </div>
            </div>
        `;
        document.getElementById('carInfoContent').innerHTML = carInfoHTML;

        // Load profit summary
        displayCarProfitSummary(data.profitability);
        
        // Load transactions
        displayCarTransactions(data.transactions);
        
        // Load rentals
        displayCarRentals(data.rentals);
        
        // Load parts
        displayCarParts(data.parts);

        document.getElementById('carDetailsModal').style.display = 'block';
    } catch (error) {
        console.error('Car details error:', error);
        alert('Error loading car details');
    }
}

function displayCarProfitSummary(profitData) {
    let summaryHTML = '';
    
    if (profitData.length === 0) {
        summaryHTML = '<div class="profit-card"><div class="currency-label">No financial data</div></div>';
    } else {
        profitData.forEach(profit => {
            const income = parseFloat(profit.total_income) || 0;
            const expenses = parseFloat(profit.total_expenses) || 0;
            const net = income - expenses;
            
            summaryHTML += `
                <div class="profit-card">
                    <div class="currency-label">${profit.currency} Income</div>
                    <div class="amount positive">${getCurrencySymbol(profit.currency)}${income.toFixed(2)}</div>
                </div>
                <div class="profit-card">
                    <div class="currency-label">${profit.currency} Expenses</div>
                    <div class="amount negative">${getCurrencySymbol(profit.currency)}${expenses.toFixed(2)}</div>
                </div>
                <div class="profit-card">
                    <div class="currency-label">${profit.currency} Net</div>
                    <div class="amount ${net >= 0 ? 'positive' : 'negative'}">${getCurrencySymbol(profit.currency)}${net.toFixed(2)}</div>
                </div>
            `;
        });
    }
    
    document.getElementById('carProfitSummary').innerHTML = summaryHTML;
}

function displayCarTransactions(transactions) {
    let transactionsHTML = '';
    
    if (transactions.length === 0) {
        transactionsHTML = '<tr><td colspan="5">No transactions</td></tr>';
    } else {
        transactions.forEach(transaction => {
            const typeClass = transaction.type === 'income' ? 'positive' : 'negative';
            const typeSymbol = transaction.type === 'income' ? '+' : '-';
            
            transactionsHTML += `
                <tr>
                    <td>${new Date(transaction.date).toLocaleDateString()}</td>
                    <td>${transaction.type.toUpperCase()}</td>
                    <td class="amount ${typeClass}">${typeSymbol}${getCurrencySymbol(transaction.currency)}${transaction.amount}</td>
                    <td>${transaction.category || 'N/A'}</td>
                    <td>${transaction.description || ''}</td>
                </tr>
            `;
        });
    }
    
    document.querySelector('#carTransactions tbody').innerHTML = transactionsHTML;
}

function displayCarRentals(rentals) {
    let rentalsHTML = '';
    
    if (rentals.length === 0) {
        rentalsHTML = '<tr><td colspan="5">No rental history</td></tr>';
    } else {
        rentals.forEach(rental => {
            const startDate = new Date(rental.start_date).toLocaleDateString();
            const endDate = new Date(rental.end_date).toLocaleDateString();
            
            rentalsHTML += `
                <tr>
                    <td>${rental.client_name}</td>
                    <td>${startDate} - ${endDate}</td>
                    <td>${getCurrencySymbol(rental.currency)}${rental.daily_price}/day</td>
                    <td>${getCurrencySymbol(rental.currency)}${rental.total_amount}</td>
                    <td>${rental.status.toUpperCase()}</td>
                </tr>
            `;
        });
    }
    
    document.querySelector('#carRentalsTable tbody').innerHTML = rentalsHTML;
}

function displayCarParts(parts) {
    let partsHTML = '';
    
    if (parts.length === 0) {
        partsHTML = '<div class="loading">No parts from this car</div>';
    } else {
        const availableParts = parts.filter(p => p.status === 'available');
        const soldParts = parts.filter(p => p.status === 'sold');
        
        let totalCostBasis = 0;
        let totalSaleRevenue = 0;
        
        parts.forEach(part => {
            if (part.cost_basis) totalCostBasis += parseFloat(part.cost_basis);
            if (part.sale_price && part.status === 'sold') totalSaleRevenue += parseFloat(part.sale_price);
        });
        
        // Parts profit summary
        const partsProfitHTML = `
            <div class="profit-card">
                <div class="currency-label">Available Parts</div>
                <div class="amount">${availableParts.length}</div>
            </div>
            <div class="profit-card">
                <div class="currency-label">Sold Parts</div>
                <div class="amount">${soldParts.length}</div>
            </div>
            <div class="profit-card">
                <div class="currency-label">Parts Revenue</div>
                <div class="amount positive">$${totalSaleRevenue.toFixed(2)}</div>
            </div>
        `;
        document.getElementById('partsProfitSummary').innerHTML = partsProfitHTML;
        
        // Parts list
        partsHTML = '<h4>Parts List</h4>';
        parts.forEach(part => {
            const statusClass = part.status === 'sold' ? 'status-sold' : 'status-active';
            partsHTML += `
                <div style="background: #3d3d3d; padding: 10px; margin: 10px 0; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${part.name}</strong>
                            <div style="color: #ccc; font-size: 12px;">
                                Cost basis: ${part.cost_basis ? getCurrencySymbol(part.car_currency) + part.cost_basis : 'N/A'}
                                ${part.status === 'sold' ? ` | Sold for: ${getCurrencySymbol(part.sale_currency)}${part.sale_price}` : ''}
                            </div>
                        </div>
                        <div class="car-status ${statusClass}">${part.status.toUpperCase()}</div>
                    </div>
                </div>
            `;
        });
    }
    
    document.getElementById('carPartsList').innerHTML = partsHTML;
}

async function addExpense() {
    const expenseData = {
        amount: parseFloat(document.getElementById('expenseAmount').value),
        currency: document.getElementById('expenseCurrency').value,
        description: document.getElementById('expenseDescription').value,
        category: document.getElementById('expenseCategory').value
    };

    if (!expenseData.amount || !expenseData.currency || !expenseData.category) {
        alert('Amount, currency, and category are required');
        return;
    }

    try {
        const response = await apiCall(`/api/cars/${currentCarId}/expense`, {
            method: 'POST',
            body: JSON.stringify(expenseData)
        });

        if (response && response.ok) {
            // Clear form
            document.getElementById('expenseAmount').value = '';
            document.getElementById('expenseDescription').value = '';
            
            // Reload car details
            showCarDetails(currentCarId);
        } else {
            alert('Failed to add expense');
        }
    } catch (error) {
        alert('Error adding expense: ' + error.message);
    }
}

async function dismantleCar() {
    if (!confirm('Are you sure you want to dismantle this car? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await apiCall(`/api/cars/${currentCarId}/dismantle`, {
            method: 'POST'
        });

        if (response && response.ok) {
            alert('Car dismantled successfully');
            closeModal('carDetailsModal');
            loadCars();
        } else {
            alert('Failed to dismantle car');
        }
    } catch (error) {
        alert('Error dismantling car: ' + error.message);
    }
}

// Rentals functions
async function loadRentals() {
    try {
        const response = await apiCall('/api/rentals');
        if (!response) return;

        allRentals = await response.json();
        displayActiveRentals();
        displayRentalHistory();
        loadRentalCalendar();
        
        // Load available cars for rental form
        await loadAvailableCarsForRental();
    } catch (error) {
        console.error('Rentals load error:', error);
    }
}

function displayActiveRentals() {
    const activeRentals = allRentals.filter(r => r.status === 'active');
    let rentalsHTML = '';
    
    if (activeRentals.length === 0) {
        rentalsHTML = '<tr><td colspan="7">No active rentals</td></tr>';
    } else {
        activeRentals.forEach(rental => {
            rentalsHTML += `
                <tr>
                    <td>${rental.brand} ${rental.model} ${rental.year || ''}</td>
                    <td>${rental.client_name}<br><small>${rental.client_phone || ''}</small></td>
                    <td>${new Date(rental.start_date).toLocaleDateString()}</td>
                    <td>${new Date(rental.end_date).toLocaleDateString()}</td>
                    <td>${getCurrencySymbol(rental.currency)}${rental.daily_price}/day</td>
                    <td>${getCurrencySymbol(rental.currency)}${rental.total_amount}</td>
                    <td>
                        <button class="btn" onclick="completeRental(${rental.id})">Complete</button>
                    </td>
                </tr>
            `;
        });
    }
    
    document.querySelector('#activeRentalsTable tbody').innerHTML = rentalsHTML;
}

function displayRentalHistory() {
    const completedRentals = allRentals.filter(r => r.status === 'completed');
    let historyHTML = '';
    
    if (completedRentals.length === 0) {
        historyHTML = '<tr><td colspan="5">No rental history</td></tr>';
    } else {
        completedRentals.forEach(rental => {
            const startDate = new Date(rental.start_date).toLocaleDateString();
            const endDate = new Date(rental.end_date).toLocaleDateString();
            
            historyHTML += `
                <tr>
                    <td>${rental.brand} ${rental.model} ${rental.year || ''}</td>
                    <td>${rental.client_name}</td>
                    <td>${startDate} - ${endDate}</td>
                    <td>${getCurrencySymbol(rental.currency)}${rental.total_amount}</td>
                    <td>${rental.status.toUpperCase()}</td>
                </tr>
            `;
        });
    }
    
    document.querySelector('#historyTable tbody').innerHTML = historyHTML;
}

async function loadAvailableCarsForRental() {
    const response = await apiCall('/api/cars?status=active');
    if (!response) return;

    const availableCars = await response.json();
    let optionsHTML = '<option value="">Select a car...</option>';
    
    availableCars.forEach(car => {
        optionsHTML += `<option value="${car.id}">${car.brand} ${car.model} ${car.year || ''}</option>`;
    });
    
    document.getElementById('rentalCar').innerHTML = optionsHTML;
}

function showRentalTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('#rentals .tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Hide all tab buttons active state
    const tabButtons = document.querySelectorAll('#rentals .tab');
    tabButtons.forEach(button => button.classList.remove('active'));
    
    // Show selected tab
    if (tabName === 'active') {
        document.getElementById('activeRentals').classList.add('active');
        document.querySelector('#rentals .tab').classList.add('active');
    } else if (tabName === 'calendar') {
        document.getElementById('rentalCalendar').classList.add('active');
        document.querySelectorAll('#rentals .tab')[1].classList.add('active');
        loadRentalCalendar();
    } else if (tabName === 'history') {
        document.getElementById('rentalHistory').classList.add('active');
        document.querySelectorAll('#rentals .tab')[2].classList.add('active');
    }
}

function showAddRentalModal() {
    document.getElementById('addRentalModal').style.display = 'block';
    loadAvailableCarsForRental();
}

async function addRental() {
    const rentalData = {
        car_id: parseInt(document.getElementById('rentalCar').value),
        client_name: document.getElementById('rentalClient').value,
        client_phone: document.getElementById('rentalPhone').value,
        start_date: document.getElementById('rentalStart').value,
        end_date: document.getElementById('rentalEnd').value,
        daily_price: parseFloat(document.getElementById('rentalPrice').value),
        currency: document.getElementById('rentalCurrency').value
    };

    if (!rentalData.car_id || !rentalData.client_name || !rentalData.start_date || !rentalData.end_date || !rentalData.daily_price) {
        alert('Please fill in all required fields');
        return;
    }

    try {
        const response = await apiCall('/api/rentals', {
            method: 'POST',
            body: JSON.stringify(rentalData)
        });

        if (response && response.ok) {
            closeModal('addRentalModal');
            loadRentals();
            
            // Clear form
            document.getElementById('rentalCar').value = '';
            document.getElementById('rentalClient').value = '';
            document.getElementById('rentalPhone').value = '';
            document.getElementById('rentalStart').value = '';
            document.getElementById('rentalEnd').value = '';
            document.getElementById('rentalPrice').value = '';
        } else {
            alert('Failed to create rental');
        }
    } catch (error) {
        alert('Error creating rental: ' + error.message);
    }
}

async function completeRental(rentalId) {
    if (!confirm('Complete this rental? This will generate rental income.')) {
        return;
    }

    try {
        const response = await apiCall(`/api/rentals/${rentalId}/complete`, {
            method: 'POST'
        });

        if (response && response.ok) {
            alert('Rental completed successfully');
            loadRentals();
            loadDashboard(); // Refresh dashboard stats
        } else {
            alert('Failed to complete rental');
        }
    } catch (error) {
        alert('Error completing rental: ' + error.message);
    }
}

async function loadRentalCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    
    try {
        const response = await apiCall(`/api/rentals/calendar/${year}/${month}`);
        if (!response) return;

        const calendarRentals = await response.json();
        displayCalendar(year, month, calendarRentals);
    } catch (error) {
        console.error('Calendar load error:', error);
    }
}

function displayCalendar(year, month, rentals) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    
    document.getElementById('calendarTitle').textContent = `${monthNames[month - 1]} ${year}`;
    
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    let calendarHTML = '';
    
    // Calendar headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        calendarHTML += `<div class="calendar-header">${day}</div>`;
    });
    
    // Calendar days
    for (let i = 0; i < 42; i++) {
        const currentDay = new Date(startDate);
        currentDay.setDate(startDate.getDate() + i);
        
        const isCurrentMonth = currentDay.getMonth() === month - 1;
        const dayClass = isCurrentMonth ? 'calendar-day' : 'calendar-day other-month';
        
        // Check for rentals on this day
        const dayRentals = rentals.filter(rental => {
            const rentalStart = new Date(rental.start_date);
            const rentalEnd = new Date(rental.end_date);
            return currentDay >= rentalStart && currentDay <= rentalEnd;
        });
        
        let rentalIndicator = '';
        if (dayRentals.length > 0) {
            rentalIndicator = `<div class="rental-indicator" title="${dayRentals.map(r => r.brand + ' ' + r.model + ' - ' + r.client_name).join(', ')}"></div>`;
        }
        
        calendarHTML += `
            <div class="${dayClass}">
                ${currentDay.getDate()}
                ${rentalIndicator}
            </div>
        `;
    }
    
    document.getElementById('calendar').innerHTML = calendarHTML;
}

function changeMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    loadRentalCalendar();
}

// Parts functions
async function loadParts() {
    try {
        const response = await apiCall('/api/parts');
        if (!response) return;

        allParts = await response.json();
        filteredParts = [...allParts];
        displayParts();
        
        // Load dismantled cars for add part form
        await loadDismantledCarsForParts();
    } catch (error) {
        console.error('Parts load error:', error);
        document.querySelector('#partsTable tbody').innerHTML = '<tr><td colspan="7">Error loading parts</td></tr>';
    }
}

function displayParts() {
    let partsHTML = '';
    
    if (filteredParts.length === 0) {
        partsHTML = '<tr><td colspan="7">No parts found</td></tr>';
    } else {
        filteredParts.forEach(part => {
            const costBasis = part.cost_basis ? `${getCurrencySymbol(part.car_currency)}${part.cost_basis}` : 'N/A';
            const salePrice = part.sale_price ? `${getCurrencySymbol(part.sale_currency)}${part.sale_price}` : 'N/A';
            const statusClass = part.status === 'sold' ? 'status-sold' : 'status-active';
            
            let actions = '';
            if (part.status === 'available') {
                actions = `<button class="btn" onclick="showSellPartModal(${part.id})">Sell</button>`;
            } else {
                actions = `<span style="color: #ccc;">Sold to ${part.buyer || 'N/A'}</span>`;
            }
            
            partsHTML += `
                <tr>
                    <td>${part.name}</td>
                    <td>${part.brand} ${part.model} ${part.year || ''}</td>
                    <td>${costBasis}</td>
                    <td>${salePrice}</td>
                    <td>${part.storage_location || 'N/A'}</td>
                    <td><span class="car-status ${statusClass}">${part.status.toUpperCase()}</span></td>
                    <td>${actions}</td>
                </tr>
            `;
        });
    }
    
    document.querySelector('#partsTable tbody').innerHTML = partsHTML;
}

function searchParts() {
    const searchTerm = document.getElementById('partSearch').value.toLowerCase();
    const statusFilter = document.getElementById('partStatusFilter').value;
    const currencyFilter = document.getElementById('partCurrencyFilter').value;

    filteredParts = allParts.filter(part => {
        const matchesSearch = !searchTerm || 
            part.name.toLowerCase().includes(searchTerm) ||
            part.brand.toLowerCase().includes(searchTerm) ||
            part.model.toLowerCase().includes(searchTerm) ||
            (part.storage_location && part.storage_location.toLowerCase().includes(searchTerm)) ||
            (part.buyer && part.buyer.toLowerCase().includes(searchTerm));
        
        const matchesStatus = !statusFilter || part.status === statusFilter;
        const matchesCurrency = !currencyFilter || part.currency === currencyFilter || part.sale_currency === currencyFilter;

        return matchesSearch && matchesStatus && matchesCurrency;
    });

    displayParts();
}

function filterParts() {
    searchParts();
}

async function loadDismantledCarsForParts() {
    const response = await apiCall('/api/cars?status=dismantled');
    if (!response) return;

    const dismantledCars = await response.json();
    let optionsHTML = '<option value="">Select dismantled car...</option>';
    
    dismantledCars.forEach(car => {
        optionsHTML += `<option value="${car.id}">${car.brand} ${car.model} ${car.year || ''}</option>`;
    });
    
    document.getElementById('partCar').innerHTML = optionsHTML;
}

function showAddPartModal() {
    document.getElementById('addPartModal').style.display = 'block';
    loadDismantledCarsForParts();
}

async function addPart() {
    const partData = {
        car_id: parseInt(document.getElementById('partCar').value),
        name: document.getElementById('partName').value,
        estimated_price: parseFloat(document.getElementById('partPrice').value) || null,
        currency: document.getElementById('partCurrency').value,
        storage_location: document.getElementById('partLocation').value
    };

    if (!partData.car_id || !partData.name) {
        alert('Car and part name are required');
        return;
    }

    try {
        const response = await apiCall('/api/parts', {
            method: 'POST',
            body: JSON.stringify(partData)
        });

        if (response && response.ok) {
            closeModal('addPartModal');
            loadParts();
            
            // Clear form
            document.getElementById('partCar').value = '';
            document.getElementById('partName').value = '';
            document.getElementById('partPrice').value = '';
            document.getElementById('partLocation').value = '';
        } else {
            const error = await response.json();
            alert('Failed to add part: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error adding part: ' + error.message);
    }
}

function showSellPartModal(partId) {
    currentPartId = partId;
    const part = allParts.find(p => p.id === partId);
    
    if (!part) {
        alert('Part not found');
        return;
    }
    
    document.getElementById('sellPartTitle').textContent = `Sell: ${part.name}`;
    
    const partInfoHTML = `
        <div><strong>Part:</strong> ${part.name}</div>
        <div><strong>Source Car:</strong> ${part.brand} ${part.model} ${part.year || ''}</div>
        <div><strong>Cost Basis:</strong> ${part.cost_basis ? getCurrencySymbol(part.car_currency) + part.cost_basis : 'N/A'}</div>
        <div><strong>Estimated Value:</strong> ${part.estimated_price ? getCurrencySymbol(part.currency) + part.estimated_price : 'N/A'}</div>
        <div><strong>Location:</strong> ${part.storage_location || 'N/A'}</div>
    `;
    document.getElementById('sellPartInfo').innerHTML = partInfoHTML;
    
    // Pre-fill with estimated price if available
    if (part.estimated_price) {
        document.getElementById('sellPartPrice').value = part.estimated_price;
        document.getElementById('sellPartCurrency').value = part.currency;
    }
    
    document.getElementById('sellPartModal').style.display = 'block';
}

async function confirmSellPart() {
    const saleData = {
        sale_price: parseFloat(document.getElementById('sellPartPrice').value),
        sale_currency: document.getElementById('sellPartCurrency').value,
        buyer: document.getElementById('sellPartBuyer').value,
        notes: document.getElementById('sellPartNotes').value
    };

    if (!saleData.sale_price || !saleData.sale_currency) {
        alert('Sale price and currency are required');
        return;
    }

    try {
        const response = await apiCall(`/api/parts/${currentPartId}/sell`, {
            method: 'POST',
            body: JSON.stringify(saleData)
        });

        if (response && response.ok) {
            closeModal('sellPartModal');
            loadParts();
            loadDashboard(); // Refresh dashboard stats
            
            // Clear form
            document.getElementById('sellPartPrice').value = '';
            document.getElementById('sellPartBuyer').value = '';
            document.getElementById('sellPartNotes').value = '';
            
            alert('Part sold successfully!');
        } else {
            const error = await response.json();
            alert('Failed to sell part: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error selling part: ' + error.message);
    }
}

// Admin functions
async function loadUsers() {
    if (currentUser.role !== 'ADMIN') {
        document.querySelector('#usersTable tbody').innerHTML = '<tr><td colspan="5">Access denied</td></tr>';
        return;
    }

    try {
        const response = await apiCall('/api/admin/users');
        if (!response) return;

        const users = await response.json();
        let usersHTML = '';
        
        if (users.length === 0) {
            usersHTML = '<tr><td colspan="5">No users found</td></tr>';
        } else {
            users.forEach(user => {
                const statusClass = user.active ? 'status-active' : 'status-sold';
                const statusText = user.active ? 'ACTIVE' : 'INACTIVE';
                const actionText = user.active ? 'Deactivate' : 'Activate';
                
                usersHTML += `
                    <tr>
                        <td>${user.email}</td>
                        <td>${user.role}</td>
                        <td><span class="car-status ${statusClass}">${statusText}</span></td>
                        <td>${new Date(user.created_at).toLocaleDateString()}</td>
                        <td>
                            <button class="btn btn-danger" onclick="toggleUserStatus(${user.id})">${actionText}</button>
                        </td>
                    </tr>
                `;
            });
        }
        
        document.querySelector('#usersTable tbody').innerHTML = usersHTML;
    } catch (error) {
        console.error('Users load error:', error);
        document.querySelector('#usersTable tbody').innerHTML = '<tr><td colspan="5">Error loading users</td></tr>';
    }
}

async function toggleUserStatus(userId) {
    if (!confirm('Are you sure you want to toggle this user\'s status?')) {
        return;
    }

    try {
        const response = await apiCall(`/api/admin/users/${userId}/toggle`, {
            method: 'PUT'
        });

        if (response && response.ok) {
            loadUsers(); // Reload users list
        } else {
            alert('Failed to toggle user status');
        }
    } catch (error) {
        alert('Error toggling user status: ' + error.message);
    }
}

// Tab functions for car details modal
function showCarTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('#carDetailsModal .tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Hide all tab buttons active state
    const tabButtons = document.querySelectorAll('#carDetailsModal .tab');
    tabButtons.forEach(button => button.classList.remove('active'));
    
    // Show selected tab
    const tabMap = {
        'info': 0,
        'finances': 1,
        'dismantling': 2,
        'rentals': 3
    };
    
    document.getElementById(`car${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
    document.querySelectorAll('#carDetailsModal .tab')[tabMap[tabName]].classList.add('active');
}

// Modal functions
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Close modals when clicking outside
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Handle Enter key in forms
document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        const activeElement = document.activeElement;
        
        // Login form
        if (activeElement.id === 'loginEmail' || activeElement.id === 'loginPassword') {
            attemptLogin();
        }
        
        // Register form
        if (activeElement.id === 'registerEmail' || activeElement.id === 'registerPassword') {
            attemptRegister();
        }
    }
});

// Utility functions
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}

function formatCurrency(amount, currency) {
    return getCurrencySymbol(currency) + parseFloat(amount).toFixed(2);
}

// Auto-refresh dashboard every 30 seconds when it's active
setInterval(() => {
    const dashboardSection = document.getElementById('dashboard');
    if (dashboardSection && dashboardSection.classList.contains('active')) {
        loadDashboard();
    }
}, 30000);
