const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const session = require('express-session');

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
    return res.status(401).json({ error: 'Não autenticado' });
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
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  try {
    const [rows] = await pool.query('SELECT id, username, role FROM users WHERE username = ? AND password = ?', [username, password]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Login inválido' });
    }

    const user = rows[0];
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

app.get('/api/session', (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null });
  }
  res.json({ user: req.session.user });
});

app.get('/api/dashboard', requireLogin, requireAdmin, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, username, role FROM users');
    const [services] = await pool.query('SELECT id, name, price FROM services');
    const [productions] = await pool.query('SELECT p.id, u.username AS user, p.service_name AS service, p.value, p.date FROM productions p JOIN users u ON p.user_id = u.id');
    const [points] = await pool.query('SELECT pt.id, u.username AS user, pt.type, pt.date FROM points pt JOIN users u ON pt.user_id = u.id');

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
    return res.status(400).json({ error: 'Dados de usuário incompletos' });
  }

  try {
    await pool.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, password, role]);
    const [rows] = await pool.query('SELECT id, username, role FROM users WHERE username = ?', [username]);
    res.json({ user: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

app.delete('/api/users/:id', requireLogin, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT username FROM users WHERE id = ?', [id]);
    if (!rows.length || rows[0].username === 'admin') {
      return res.status(400).json({ error: 'Não é possível apagar este usuário' });
    }
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao apagar usuário' });
  }
});

app.get('/api/services', requireLogin, async (req, res) => {
  try {
    const [services] = await pool.query('SELECT id, name, price FROM services');
    res.json({ services });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar serviços' });
  }
});

app.post('/api/services', requireLogin, requireAdmin, async (req, res) => {
  const { name, price } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
  }
  try {
    const [result] = await pool.query('INSERT INTO services (name, price) VALUES (?, ?)', [name, price]);
    res.json({ service: { id: result.insertId, name, price } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar serviço' });
  }
});

app.post('/api/productions', requireLogin, async (req, res) => {
  const { serviceId, customValue } = req.body;
  const userId = req.session.user.id;
  if (!serviceId) {
    return res.status(400).json({ error: 'Serviço obrigatório' });
  }
  try {
    const [serviceRows] = await pool.query('SELECT name, price FROM services WHERE id = ?', [serviceId]);
    if (!serviceRows.length) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }
    const service = serviceRows[0];
    const value = customValue ? Number(customValue) : Number(service.price);
    const serviceName = service.name;
    const date = new Date();
    await pool.query('INSERT INTO productions (user_id, service_id, service_name, value, date) VALUES (?, ?, ?, ?, ?)', [userId, serviceId, serviceName, value, date]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao registrar produção' });
  }
});

app.get('/api/employee/production', requireLogin, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [rows] = await pool.query('SELECT service_name AS service, value, date FROM productions WHERE user_id = ? ORDER BY date DESC', [userId]);
    res.json({ productions: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar produções' });
  }
});

app.post('/api/points', requireLogin, async (req, res) => {
  const { type } = req.body;
  const userId = req.session.user.id;
  if (!type) {
    return res.status(400).json({ error: 'Tipo de ponto necessário' });
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

app.listen(port, () => {
  console.log(`Servidor iniciado em http://localhost:${port}`);
});
