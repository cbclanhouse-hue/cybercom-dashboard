const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'cybercom_dashboard',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);
const userOptionalColumns = {
  display_name: false,
  photo: false
};

function getOptionalUserSelect(alias = null) {
  const prefix = alias ? `${alias}.` : '';

  return [
    userOptionalColumns.display_name ? `${prefix}display_name AS display_name` : 'NULL AS display_name',
    userOptionalColumns.photo ? `${prefix}photo AS photo` : 'NULL AS photo'
  ].join(', ');
}

function getUserSelectFields(includePassword = false, alias = null) {
  const prefix = alias ? `${alias}.` : '';
  const fields = [
    `${prefix}id AS id`,
    `${prefix}username AS username`
  ];

  if (includePassword) {
    fields.push(`${prefix}password AS password`);
  }

  fields.push(`${prefix}role AS role`);
  fields.push(getOptionalUserSelect(alias));

  return fields.join(', ');
}

async function refreshUserOptionalColumns() {
  const [rows] = await pool.query('SHOW COLUMNS FROM users');
  const columnNames = new Set(rows.map((row) => row.Field));

  userOptionalColumns.display_name = columnNames.has('display_name');
  userOptionalColumns.photo = columnNames.has('photo');
}

async function ensureColumn(tableName, columnName, definition) {
  const [rows] = await pool.query(`
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    LIMIT 1
  `, [dbConfig.database, tableName, columnName]);

  if (!rows.length) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function ensureDatabaseSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin', 'employee') NOT NULL DEFAULT 'employee'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS productions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      service_id INT NOT NULL,
      service_name VARCHAR(150) NOT NULL,
      value DECIMAL(10,2) NOT NULL,
      date DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS points (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type VARCHAR(100) NOT NULL,
      date DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await ensureColumn('users', 'display_name', 'VARCHAR(150) DEFAULT NULL');
  await ensureColumn('users', 'photo', 'VARCHAR(255) DEFAULT NULL');
  await refreshUserOptionalColumns();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function isHashedPassword(password) {
  return typeof password === 'string' && password.startsWith('scrypt:');
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword) return false;

  if (!isHashedPassword(storedPassword)) {
    return password === storedPassword;
  }

  const [, salt, storedHash] = storedPassword.split(':');
  if (!salt || !storedHash) return false;

  const derivedHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derivedHash, 'hex'), Buffer.from(storedHash, 'hex'));
}

async function loadSessionUser(userId) {
  const [rows] = await pool.query(
    `SELECT ${getUserSelectFields(false)} FROM users WHERE id = ?`,
    [userId]
  );

  return rows[0] || null;
}

// Configuracao do multer para upload de fotos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads', 'profiles');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `user_${req.session.user.id}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Apenas imagens sao permitidas (jpeg, jpg, png, gif)'));
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'cybercom-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Nao autenticado' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario e senha sao obrigatorios' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT ${getUserSelectFields(true)} FROM users WHERE username = ?`,
      [username]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'Login invalido' });
    }

    const dbUser = rows[0];
    if (!verifyPassword(password, dbUser.password)) {
      return res.status(401).json({ error: 'Login invalido' });
    }

    if (!isHashedPassword(dbUser.password)) {
      await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashPassword(password), dbUser.id]);
    }

    const user = await loadSessionUser(dbUser.id);
    req.session.user = user;
    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/session', async (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null });
  }

  try {
    const user = await loadSessionUser(req.session.user.id);
    if (!user) {
      req.session.destroy(() => {
        res.json({ user: null });
      });
      return;
    }

    req.session.user = user;
    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao carregar sessao' });
  }
});

app.get('/api/user/profile', requireLogin, async (req, res) => {
  try {
    const user = await loadSessionUser(req.session.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });

    req.session.user = user;
    res.json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

app.put('/api/user/profile', requireLogin, async (req, res) => {
  const { display_name, password } = req.body;
  try {
    if (password) {
      await pool.query('UPDATE users SET display_name = ?, password = ? WHERE id = ?', [
        display_name || null,
        hashPassword(password),
        req.session.user.id
      ]);
    } else {
      await pool.query('UPDATE users SET display_name = ? WHERE id = ?', [display_name || null, req.session.user.id]);
    }

    const user = await loadSessionUser(req.session.user.id);
    req.session.user = user;
    res.json({ user, success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

app.post('/api/user/photo', requireLogin, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  try {
    const [rows] = await pool.query('SELECT photo FROM users WHERE id = ?', [req.session.user.id]);
    if (rows[0].photo) {
      const oldPhoto = path.join(__dirname, 'public', rows[0].photo);
      if (fs.existsSync(oldPhoto)) fs.unlinkSync(oldPhoto);
    }
    const photoPath = `/uploads/profiles/${req.file.filename}`;
    await pool.query('UPDATE users SET photo = ? WHERE id = ?', [photoPath, req.session.user.id]);

    const user = await loadSessionUser(req.session.user.id);
    req.session.user = user;
    res.json({ photo: photoPath, user, success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar foto' });
  }
});

app.get('/api/dashboard', requireLogin, requireAdmin, async (req, res) => {
  try {
    const [users] = await pool.query(`SELECT ${getUserSelectFields(false)} FROM users`);
    const [services] = await pool.query('SELECT id, name, price FROM services');
    const [productions] = await pool.query('SELECT p.id, u.username AS user, p.service_name AS service, p.value, p.date FROM productions p JOIN users u ON p.user_id = u.id');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [points] = await pool.query(`
      SELECT pt.id, pt.user_id, u.username AS user, ${getOptionalUserSelect('u')}, pt.type, pt.date
      FROM points pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.date >= ? AND pt.date < ?
      ORDER BY pt.date ASC
    `, [today, tomorrow]);

    const totalProduction = productions.reduce((sum, item) => sum + Number(item.value), 0);
    const employeeCount = users.filter((u) => u.role === 'employee').length;

    res.json({ users, services, productions, points, totalProduction, employeeCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar dashboard' });
  }
});

app.post('/api/users', requireLogin, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Dados de usuario incompletos' });
  }

  try {
    await pool.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [
      username,
      hashPassword(password),
      role
    ]);
    const [rows] = await pool.query('SELECT id, username, role FROM users WHERE username = ?', [username]);
    res.json({ user: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar usuario' });
  }
});

app.delete('/api/users/:id', requireLogin, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT username FROM users WHERE id = ?', [id]);
    if (!rows.length || rows[0].username === 'admin') {
      return res.status(400).json({ error: 'Nao e possivel apagar este usuario' });
    }
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao apagar usuario' });
  }
});

app.get('/api/services', requireLogin, async (req, res) => {
  try {
    const [services] = await pool.query('SELECT id, name, price FROM services');
    res.json({ services });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar servicos' });
  }
});

app.post('/api/services', requireLogin, requireAdmin, async (req, res) => {
  const { name, price } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Nome e preco sao obrigatorios' });
  }
  try {
    const [result] = await pool.query('INSERT INTO services (name, price) VALUES (?, ?)', [name, price]);
    res.json({ service: { id: result.insertId, name, price } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar servico' });
  }
});

app.put('/api/services/:id', requireLogin, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, price } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Nome e preco sao obrigatorios' });
  }
  try {
    await pool.query('UPDATE services SET name = ?, price = ? WHERE id = ?', [name, price, id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar servico' });
  }
});

app.delete('/api/services/:id', requireLogin, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM services WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao apagar servico' });
  }
});

app.post('/api/productions', requireLogin, async (req, res) => {
  const { serviceId, customValue } = req.body;
  const userId = req.session.user.id;
  if (!serviceId) {
    return res.status(400).json({ error: 'Servico obrigatorio' });
  }
  try {
    const [serviceRows] = await pool.query('SELECT name, price FROM services WHERE id = ?', [serviceId]);
    if (!serviceRows.length) {
      return res.status(404).json({ error: 'Servico nao encontrado' });
    }
    const service = serviceRows[0];
    const value = customValue ? Number(customValue) : Number(service.price);
    const serviceName = service.name;
    const date = new Date();
    await pool.query('INSERT INTO productions (user_id, service_id, service_name, value, date) VALUES (?, ?, ?, ?, ?)', [userId, serviceId, serviceName, value, date]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao registrar producao' });
  }
});

app.get('/api/employee/production', requireLogin, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [rows] = await pool.query('SELECT service_name AS service, value, date FROM productions WHERE user_id = ? ORDER BY date DESC', [userId]);
    res.json({ productions: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar producoes' });
  }
});

app.post('/api/points', requireLogin, async (req, res) => {
  const { type } = req.body;
  const userId = req.session.user.id;
  if (!type) {
    return res.status(400).json({ error: 'Tipo de ponto necessario' });
  }
  try {
    const date = new Date();
    await pool.query('INSERT INTO points (user_id, type, date) VALUES (?, ?, ?)', [userId, type, date]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao registrar ponto' });
  }
});

app.get('/api/points', requireLogin, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT pt.id, u.username AS user, pt.type, pt.date FROM points pt JOIN users u ON pt.user_id = u.id ORDER BY pt.date DESC');
    res.json({ points: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar pontos' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

ensureDatabaseSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`Servidor iniciado em http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Erro ao preparar banco de dados:', error);
    process.exit(1);
  });
