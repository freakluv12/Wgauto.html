console.log('🚀 WGauto CRM JavaScript loading...');

// Global variables
let currentUser = null;
let currentCarId = null;
let currentDate = new Date();
let allCars = [];
let allParts = [];
let filteredCars = [];
let filteredParts = [];
let currentPartId = null;

// Authentication functions (called from HTML onclick)
function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}

function showRegisterForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

async function attemptLogin() {
    const email = document.getElementById('loginEmail').value.trim();
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
            currentUser = data.user;
            showApp();
        } else {
            const error = await response.json();
            alert('Login failed: ' + (error.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('Cannot connect to server');
    }
}

async function attemptRegister() {
    const email = document.getElementById('registerEmail').value.trim();
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
            currentUser = data.user;
            showApp();
        } else {
            const error = await response.json();
            alert('Registration failed: ' + (error.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('Register error:', err);
        alert('Cannot connect to server');
    }
}

function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
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

// Navigation (called from HTML onclick)
function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    
    // Hide all nav items active state
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    // Show selected section
    document.getElementById(sectionName).classList.add('active');
    event.target.classList.add('active');
    
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

// API helper
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    const response = await fetch(endpoint, { ...defaultOptions, ...options });
    
    if (response.status === 401) {
        logout();
        return null;
    }

    return response;
}

// Helper functions
function getCurrencySymbol(currency) {
    const symbols = { USD: '$', EUR: '€', GEL: '₾' };
    return symbols[currency] || currency;
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Dashboard functions
async function loadDashboard() {
    try {
        const response = await apiCall('/api/stats/dashboard');
        if (!response || !response.ok) return;

        const data = await response.json();
        
        // Create stats grid
        let statsHTML = '';
        const currencies = ['USD', 'EUR', 'GEL'];
        const currencySymbols = { USD: '$', EUR: '€', GEL: '₾' };
        
        currencies.forEach(currency => {
            const income = data.income.find(i => i.currency === currency);
            const expense = data.expenses.find(e => e.currency === currency);
            
            const incomeAmount = income ? parseFloat(income.total) : 0;
            const expenseAmount = expense ? parseFloat(expense.total) : 0;
            
            statsHTML += `
                <div class="stat-card">
                    <div class="stat-value">${currencySymbols[currency]}${incomeAmount.toFixed(2)}</div>
                    <div class="stat-label">Income ${currency}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${currencySymbols[currency]}${expenseAmount.toFixed(2)}</div>
                    <div class="stat-label">Expenses ${currency}</div>
                </div>
            `;
        });

        const totalCars = data.cars.reduce((sum, car) => sum + parseInt(car.count), 0);
        statsHTML += `
            <div class="stat-card">
                <div class="stat-value">${totalCars}</div>
                <div class="stat-label">Total Cars</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${data.activeRentals}</div>
                <div class="stat-label">Active Rentals</div>
            </div>
        `;

        document.getElementById('statsGrid').innerHTML = statsHTML;
    } catch (error) {
        console.error('Dashboard error:', error);
        document.getElementById('statsGrid').innerHTML = '<div class="loading">Error loading dashboard</div>';
    }
}

// Cars functions (called from HTML onclick)
async function loadCars() {
    try {
        const response = await apiCall('/api/cars');
        if (!response || !response.ok) return;

        allCars = await response.json();
        filteredCars = [...allCars];
        displayCars();
    } catch (error) {
        console.error('Cars load error:', error);
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
                        <div class="car-title">${car.brand} ${car.model} ${car.year}</div>
                        <div class="car-status ${statusClass}">${car.status.toUpperCase()}</div>
                    </div>
                    <div style="color: #ccc;">
                        <div>VIN: ${car.vin || 'N/A'}</div>
                        <div>Price: ${getCurrencySymbol(car.currency)}${car.price}</div>
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
            car.year.toString().includes(searchTerm);
        
        const matchesStatus = !statusFilter || car.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    displayCars();
}

function filterCars() {
    searchCars();
}

// Modal functions (called from HTML onclick)
function showAddCarModal() {
    document.getElementById('addCarModal').style.display = 'block';
}

async function addCar() {
    const carData = {
        brand: document.getElementById('carBrand').value,
        model: document.getElementById('carModel').value,
        year: parseInt(document.getElementById('carYear').value),
        vin: document.getElementById('carVin').value,
        price: parseFloat(document.getElementById('carPrice').value),
        currency: document.getElementById('carCurrency').value
    };

    if (!carData.brand || !carData.model || !carData.price) {
        alert('Please fill required fields');
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
        }
    } catch (error) {
        alert('Error adding car: ' + error.message);
    }
}

// Simplified functions for other sections
async function loadRentals() {
    console.log('Loading rentals...');
}

async function loadParts() {
    console.log('Loading parts...');
}

async function loadUsers() {
    console.log('Loading users...');
}

function showCarDetails(carId) {
    console.log('Show car details:', carId);
}

function showAddRentalModal() {
    document.getElementById('addRentalModal').style.display = 'block';
}

function showAddPartModal() {
    document.getElementById('addPartModal').style.display = 'block';
}

// Initialize app
window.addEventListener('load', () => {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const tokenData = JSON.parse(atob(token.split('.')[1]));
            currentUser = { 
                id: tokenData.id, 
                email: tokenData.email, 
                role: tokenData.role 
            };
            showApp();
        } catch (error) {
            localStorage.removeItem('token');
            document.getElementById('authScreen').style.display = 'flex';
        }
    } else {
        document.getElementById('authScreen').style.display = 'flex';
    }
});

// Close modals when clicking outside
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
});

console.log('✅ JavaScript loaded successfully!');
