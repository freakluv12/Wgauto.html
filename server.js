const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static('public'));

// Initialize database
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'USER',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cars (
        id SERIAL PRIMARY KEY,
        brand VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        year INTEGER,
        vin VARCHAR(50),
        price DECIMAL(10,2),
        currency VARCHAR(3),
        status VARCHAR(20) DEFAULT 'active',
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        car_id INTEGER REFERENCES cars(id),
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(10) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        category VARCHAR(50),
        description TEXT,
        rental_id INTEGER,
        part_id INTEGER,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rentals (
        id SERIAL PRIMARY KEY,
        car_id INTEGER REFERENCES cars(id),
        user_id INTEGER REFERENCES users(id),
        client_name VARCHAR(200) NOT NULL,
        client_phone VARCHAR(50),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        daily_price DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        total_amount DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS parts (
        id SERIAL PRIMARY KEY,
        car_id INTEGER REFERENCES cars(id),
        user_id INTEGER REFERENCES users(id),
        name VARCHAR(200) NOT NULL,
        price DECIMAL(10,2),
        currency VARCHAR(3),
        status VARCHAR(20) DEFAULT 'available',
        storage_location VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sold_at TIMESTAMP
      )
    `);

    // Create admin user if not exists
    const adminExists = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@wgauto.com']);
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
        ['admin@wgauto.com', hashedPassword, 'ADMIN']
      );
      console.log('Admin user created: admin@wgauto.com / admin123');
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// AUTH ROUTES
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role',
      [email, hashedPassword]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);

    res.json({ token, user });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND active = true', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// DASHBOARD STATS
app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    const userFilter = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    // Income by currency
    const incomeQuery = `
      SELECT currency, SUM(amount) as total 
      FROM transactions 
      WHERE type = 'income' ${userFilter}
      GROUP BY currency
    `;
    const income = await pool.query(incomeQuery, params);

    // Expenses by currency
    const expenseQuery = `
      SELECT currency, SUM(amount) as total 
      FROM transactions 
      WHERE type = 'expense' ${userFilter}
      GROUP BY currency
    `;
    const expenses = await pool.query(expenseQuery, params);

    // Car counts
    const carsQuery = `
      SELECT status, COUNT(*) as count 
      FROM cars 
      WHERE 1=1 ${userFilter}
      GROUP BY status
    `;
    const cars = await pool.query(carsQuery, params);

    // Active rentals
    const activeRentalsQuery = `
      SELECT COUNT(*) as count 
      FROM rentals 
      WHERE status = 'active' ${userFilter}
    `;
    const activeRentals = await pool.query(activeRentalsQuery, params);

    res.json({
      income: income.rows,
      expenses: expenses.rows,
      cars: cars.rows,
      activeRentals: activeRentals.rows[0]?.count || 0
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// CARS ROUTES
app.get('/api/cars', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    const { search, status } = req.query;
    
    let query = userId ? 
      'SELECT * FROM cars WHERE user_id = $1' :
      'SELECT * FROM cars WHERE 1=1';
    let params = userId ? [userId] : [];
    let paramCount = params.length;

    // Add search filter
    if (search) {
      paramCount++;
      query += ` AND (LOWER(brand) LIKE $${paramCount} OR LOWER(model) LIKE $${paramCount} OR LOWER(vin) LIKE $${paramCount} OR CAST(year AS TEXT) LIKE $${paramCount})`;
      params.push(`%${search.toLowerCase()}%`);
    }

    // Add status filter
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get cars error:', error);
    res.status(500).json({ error: 'Failed to fetch cars' });
  }
});

app.get('/api/parts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    const { search, status, currency } = req.query;
    
    let query = userId ? 
      `SELECT p.*, c.brand, c.model, c.year 
       FROM parts p 
       JOIN cars c ON p.car_id = c.id 
       WHERE p.user_id = $1` :
      `SELECT p.*, c.brand, c.model, c.year 
       FROM parts p 
       JOIN cars c ON p.car_id = c.id 
       WHERE 1=1`;
    let params = userId ? [userId] : [];
    let paramCount = params.length;

    // Add search filter
    if (search) {
      paramCount++;
      query += ` AND (LOWER(p.name) LIKE $${paramCount} OR LOWER(c.brand) LIKE $${paramCount} OR LOWER(c.model) LIKE $${paramCount} OR LOWER(p.storage_location) LIKE $${paramCount})`;
      params.push(`%${search.toLowerCase()}%`);
    }

    // Add status filter
    if (status) {
      paramCount++;
      query += ` AND p.status = $${paramCount}`;
      params.push(status);
    }

    // Add currency filter
    if (currency) {
      paramCount++;
      query += ` AND p.currency = $${paramCount}`;
      params.push(currency);
    }

    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get parts error:', error);
    res.status(500).json({ error: 'Failed to fetch parts' });
  }
});

app.post('/api/cars', authenticateToken, async (req, res) => {
  try {
    const { brand, model, year, vin, price, currency } = req.body;
    
    const result = await pool.query(
      'INSERT INTO cars (brand, model, year, vin, price, currency, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [brand, model, year, vin, price, currency, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create car error:', error);
    res.status(500).json({ error: 'Failed to create car' });
  }
});

app.get('/api/cars/:id/details', authenticateToken, async (req, res) => {
  try {
    const carId = req.params.id;
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    
    // Get car info
    const carQuery = userId ? 
      'SELECT * FROM cars WHERE id = $1 AND user_id = $2' :
      'SELECT * FROM cars WHERE id = $1';
    const carParams = userId ? [carId, userId] : [carId];
    const car = await pool.query(carQuery, carParams);

    if (car.rows.length === 0) {
      return res.status(404).json({ error: 'Car not found' });
    }

    // Get transactions
    const transactionsQuery = `
      SELECT t.*, 'transaction' as source_type 
      FROM transactions t 
      WHERE t.car_id = $1 
      ORDER BY t.date DESC
    `;
    const transactions = await pool.query(transactionsQuery, [carId]);

    // Get rentals
    const rentalsQuery = `
      SELECT * FROM rentals 
      WHERE car_id = $1 
      ORDER BY created_at DESC
    `;
    const rentals = await pool.query(rentalsQuery, [carId]);

    // Get parts from this car
    const partsQuery = `
      SELECT * FROM parts 
      WHERE car_id = $1 
      ORDER BY created_at DESC
    `;
    const parts = await pool.query(partsQuery, [carId]);

    // Calculate profitability
    const profitQuery = `
      SELECT 
        currency,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses
      FROM transactions 
      WHERE car_id = $1 
      GROUP BY currency
    `;
    const profit = await pool.query(profitQuery, [carId]);

    res.json({
      car: car.rows[0],
      transactions: transactions.rows,
      rentals: rentals.rows,
      parts: parts.rows,
      profitability: profit.rows
    });
  } catch (error) {
    console.error('Get car details error:', error);
    res.status(500).json({ error: 'Failed to fetch car details' });
  }
});

app.post('/api/cars/:id/expense', authenticateToken, async (req, res) => {
  try {
    const { amount, currency, description, category } = req.body;
    const carId = req.params.id;

    // Validate required fields
    if (!amount || !currency || !category) {
      return res.status(400).json({ error: 'Amount, currency, and category are required' });
    }

    // Validate category
    const validCategories = ['repair', 'fuel', 'insurance', 'maintenance', 'parking', 'wash', 'parts', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Check if car exists and user has permission
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    const carQuery = userId ? 
      'SELECT id FROM cars WHERE id = $1 AND user_id = $2' :
      'SELECT id FROM cars WHERE id = $1';
    const carParams = userId ? [carId, userId] : [carId];
    const carCheck = await pool.query(carQuery, carParams);

    if (carCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Car not found or access denied' });
    }

    await pool.query(
      'INSERT INTO transactions (car_id, user_id, type, amount, currency, description, category) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [carId, req.user.id, 'expense', amount, currency, description || '', category]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Add expense error:', error);
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

app.post('/api/cars/:id/dismantle', authenticateToken, async (req, res) => {
  try {
    const carId = req.params.id;

    await pool.query('UPDATE cars SET status = $1 WHERE id = $2', ['dismantled', carId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Dismantle car error:', error);
    res.status(500).json({ error: 'Failed to dismantle car' });
  }
});

// RENTAL ROUTES
app.get('/api/rentals', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    const query = userId ? 
      `SELECT r.*, c.brand, c.model, c.year 
       FROM rentals r 
       JOIN cars c ON r.car_id = c.id 
       WHERE r.user_id = $1 
       ORDER BY r.created_at DESC` :
      `SELECT r.*, c.brand, c.model, c.year 
       FROM rentals r 
       JOIN cars c ON r.car_id = c.id 
       ORDER BY r.created_at DESC`;
    const params = userId ? [userId] : [];

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get rentals error:', error);
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

app.post('/api/rentals', authenticateToken, async (req, res) => {
  try {
    const { car_id, client_name, client_phone, start_date, end_date, daily_price, currency } = req.body;
    
    // Calculate total amount
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const total_amount = days * daily_price;

    const result = await pool.query(
      `INSERT INTO rentals (car_id, user_id, client_name, client_phone, start_date, end_date, daily_price, currency, total_amount) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [car_id, req.user.id, client_name, client_phone, start_date, end_date, daily_price, currency, total_amount]
    );

    // Update car status to rented
    await pool.query('UPDATE cars SET status = $1 WHERE id = $2', ['rented', car_id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create rental error:', error);
    res.status(500).json({ error: 'Failed to create rental' });
  }
});

app.post('/api/rentals/:id/complete', authenticateToken, async (req, res) => {
  try {
    const rentalId = req.params.id;

    // Get rental details
    const rental = await pool.query('SELECT * FROM rentals WHERE id = $1', [rentalId]);
    if (rental.rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    const rentalData = rental.rows[0];

    // Update rental status
    await pool.query(
      'UPDATE rentals SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['completed', rentalId]
    );

    // Create income transaction
    await pool.query(
      `INSERT INTO transactions (car_id, user_id, type, amount, currency, category, description, rental_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        rentalData.car_id,
        req.user.id,
        'income',
        rentalData.total_amount,
        rentalData.currency,
        'rental',
        `Rental income from ${rentalData.client_name}`,
        rentalId
      ]
    );

    // Update car status back to active
    await pool.query('UPDATE cars SET status = $1 WHERE id = $2', ['active', rentalData.car_id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Complete rental error:', error);
    res.status(500).json({ error: 'Failed to complete rental' });
  }
});

// Get calendar data for a specific month
app.get('/api/rentals/calendar/:year/:month', authenticateToken, async (req, res) => {
  try {
    const { year, month } = req.params;
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    
    const query = userId ? 
      `SELECT r.*, c.brand, c.model 
       FROM rentals r 
       JOIN cars c ON r.car_id = c.id 
       WHERE r.user_id = $1 AND 
       (EXTRACT(YEAR FROM start_date) = $2 AND EXTRACT(MONTH FROM start_date) = $3)
       OR (EXTRACT(YEAR FROM end_date) = $2 AND EXTRACT(MONTH FROM end_date) = $3)
       OR (start_date <= $4 AND end_date >= $5)` :
      `SELECT r.*, c.brand, c.model 
       FROM rentals r 
       JOIN cars c ON r.car_id = c.id 
       WHERE (EXTRACT(YEAR FROM start_date) = $1 AND EXTRACT(MONTH FROM start_date) = $2)
       OR (EXTRACT(YEAR FROM end_date) = $1 AND EXTRACT(MONTH FROM end_date) = $2)
       OR (start_date <= $3 AND end_date >= $4)`;

    const firstDay = `${year}-${month.padStart(2, '0')}-01`;
    const lastDay = `${year}-${month.padStart(2, '0')}-31`;
    
    const params = userId ? 
      [userId, year, month, lastDay, firstDay] :
      [year, month, lastDay, firstDay];

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get calendar error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

// PARTS ROUTES - moved above, integrated with searchd = c.id 
       ORDER BY p.created_at DESC`;
    const params = userId ? [userId] : [];

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get parts error:', error);
    res.status(500).json({ error: 'Failed to fetch parts' });
  }
});

app.post('/api/parts', authenticateToken, async (req, res) => {
  try {
    const { car_id, name, price, currency, storage_location } = req.body;
    
    const result = await pool.query(
      'INSERT INTO parts (car_id, user_id, name, price, currency, storage_location) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [car_id, req.user.id, name, price, currency, storage_location]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create part error:', error);
    res.status(500).json({ error: 'Failed to create part' });
  }
});

app.post('/api/parts/:id/sell', authenticateToken, async (req, res) => {
  try {
    const partId = req.params.id;

    // Get part details
    const part = await pool.query('SELECT * FROM parts WHERE id = $1', [partId]);
    if (part.rows.length === 0) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const partData = part.rows[0];

    // Update part status
    await pool.query(
      'UPDATE parts SET status = $1, sold_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['sold', partId]
    );

    // Create income transaction
    await pool.query(
      `INSERT INTO transactions (car_id, user_id, type, amount, currency, category, description, part_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        partData.car_id,
        req.user.id,
        'income',
        partData.price,
        partData.currency,
        'parts',
        `Part sale: ${partData.name}`,
        partId
      ]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Sell part error:', error);
    res.status(500).json({ error: 'Failed to sell part' });
  }
});

// ADMIN ROUTES
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, role, active, created_at FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.put('/api/admin/users/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    await pool.query('UPDATE users SET active = NOT active WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Toggle user error:', error);
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
});

// Start server
initDB().then(() => {
  app.listen(port, () => {
    console.log(`WGauto CRM Server running on port ${port}`);
  });
});

module.exports = app;
