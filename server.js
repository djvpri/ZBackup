const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3456;
const BACKUP_DIR = '/data/workspace/backups';
const PGDUMP = process.env.PGDUMP_PATH || '/usr/lib/postgresql/18/bin/pg_dump';
const PSQL = process.env.PSQL_PATH || '/usr/lib/postgresql/18/bin/psql';

// ZBackup's own database
const ZBACKUP_DB_URL = process.env.ZBACKUP_DATABASE_URL || 'postgresql://postgres:byqtvULmVrhVVkGZspyUguEAARYGglSc@thomas.proxy.rlwy.net:59427/railway';

const pool = new Pool({ connectionString: ZBACKUP_DB_URL, ssl: { rejectUnauthorized: false } });

// Database configurations for backups
const DATABASES = {
  zgold: { name: 'ZGold', url: 'postgresql://postgres:avAxvrzoMbMeWYEdaHGAcijebqmMlUbI@thomas.proxy.rlwy.net:51347/railway' },
  zbengkel: { name: 'ZBengkel', url: 'postgresql://postgres:ULoqEurjjlYLHQcatzPQVAbqcxBUtWOS@thomas.proxy.rlwy.net:40453/railway' },
  zlaundry: { name: 'ZLaundry', url: 'postgresql://postgres:avAxvrzoMbMeWYEdaHGAcijebqmMlUbI@thomas.proxy.rlwy.net:51347/railway' },
  zone: { name: 'ZOne', url: 'postgresql://postgres:WZvgpslFxMAJCadgVoFSzDtXlRJJvuuh@thomas.proxy.rlwy.net:52406/railway' },
  zpos: { name: 'ZPos', url: 'postgresql://postgres:DKLUwgvXvCMARsxmGVVzmqjoEWftRMXI@thomas.proxy.rlwy.net:21745/railway' },
  zgym: { name: 'ZGym', url: 'postgresql://postgres:jpishRZlxQMjjwbjeLqKMKVXkOSDagAl@trolley.proxy.rlwy.net:53321/railway' },
  zbilliar: { name: 'ZBilliar', url: 'postgresql://postgres:BFrSBPxEQsGQHOYwISJyWZULxITFbZjB@reseau.proxy.rlwy.net:58490/railway' },
  zabsen: { name: 'ZAbsen', url: 'postgresql://postgres:yvKJPTqDTkUYXpgVIOiwldSzLiSEesqh@reseau.proxy.rlwy.net:55175/railway' },
  zrooms: { name: 'ZRooms', url: 'postgresql://postgres:bveeVUflSpQpDtCGhhlrTnGYXyckQocu@thomas.proxy.rlwy.net:56419/railway' },
  zresto: { name: 'ZResto', url: 'postgresql://postgres:KFlHwjvifsuEcVLdmpeFKaVkoLWOCzBw@thomas.proxy.rlwy.net:52649/railway' },
  zmedics: { name: 'ZMedics', url: 'postgresql://postgres:JKDYMQWBWMklQhyfxqrdYtbpOfvNCGVr@thomas.proxy.rlwy.net:58363/railway' },
  zface: { name: 'ZFace', url: 'postgresql://postgres:PcsLXUnLwEgTgzxoFhgalcMdUOCRsQgT@switchback.proxy.rlwy.net:12330/railway' },
  ztrader: { name: 'ZTrader', url: 'postgresql://postgres:yZZSAATIPVAYNuOrvJSpLWKGquFXIRFm@zephyr.proxy.rlwy.net:24711/railway' },
  zomet: { name: 'Zomet', url: 'postgresql://postgres:GLGkgYyxIzXbcRiNhJJiIAWjWrkjHnCd@yamanote.proxy.rlwy.net:23443/railway' },
  zbarber: { name: 'ZBarber', url: 'postgresql://postgres:JHRHrtxcwLrhVClfmDOixlrJWLDlOHka@ballast.proxy.rlwy.net:38041/railway' },
};

// Init database tables
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS backup_history (
        id SERIAL PRIMARY KEY,
        database VARCHAR(50) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        size_bytes BIGINT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'success',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS restore_history (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        source_db VARCHAR(50),
        target_db VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'success',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // Default admin (password: backup123)
    await pool.query(`
      INSERT INTO users (username, password_hash, role) 
      VALUES ('admin', '$2b$10$placeholder', 'admin')
      ON CONFLICT (username) DO NOTHING;
    `);
    // Default settings
    await pool.query(`
      INSERT INTO settings (key, value) VALUES 
        ('cron_schedule', '0 3 * * *'),
        ('retention_days', '30'),
        ('backup_dir', '/data/workspace/backups')
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log('✅ Database initialized');
  } catch (e) {
    console.error('❌ DB init failed:', e.message);
  }
}

// Simple password hash (not for production, use bcrypt in prod)
function simpleHash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// Basic Auth middleware
const AUTH_USER = process.env.BACKUP_USER || 'admin';
const AUTH_PASS = process.env.BACKUP_PASS || 'backup123';

function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="ZBackup Dashboard"');
    return res.status(401).send('Authentication required');
  }
  const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
  const [user, pass] = decoded.split(':');
  if (user !== AUTH_USER || pass !== AUTH_PASS) {
    return res.status(401).send('Invalid credentials');
  }
  next();
}

app.use(express.json());
app.use(auth);

// Helpers
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getDiskUsage() {
  try {
    const result = execSync("df -h /data/workspace | tail -1", { encoding: 'utf8' });
    const parts = result.trim().split(/\s+/);
    return { total: parts[1], used: parts[2], available: parts[3], percent: parts[4] };
  } catch { return { total: '?', used: '?', available: '?', percent: '?' }; }
}

function getBackupsFromDisk() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      const base = f.replace('.sql', '');
      // Match: dbname_YYYY-MM-DD_HHMM or dbname_YYYY-MM-DDTHH-MM-SS
      const m = base.match(/^(.+)_(\d{4}-\d{2}-\d{2})[T_](\d{2}[-:]?\d{2}[-:]?\d{2})$/);
      let dbName, timestamp;
      if (m) {
        dbName = m[1];
        timestamp = m[2] + '_' + m[3].replace(/:/g, '-');
      } else {
        const parts = base.split('_');
        timestamp = parts.slice(-2).join('_');
        dbName = parts.slice(0, -2).join('_');
      }
      return { filename: f, database: dbName, size: stat.size, sizeFormatted: formatSize(stat.size), createdAt: stat.mtime, timestamp };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

// API Routes

// GET /api/backups - List backups
app.get('/api/backups', async (req, res) => {
  try {
    const backups = getBackupsFromDisk();
    const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
    const grouped = {};
    backups.forEach(b => {
      if (!grouped[b.database]) grouped[b.database] = [];
      grouped[b.database].push(b);
    });
    res.json({
      backups,
      stats: {
        totalBackups: backups.length,
        totalDatabases: Object.keys(grouped).length,
        totalSize: formatSize(totalSize),
        totalSizeBytes: totalSize,
        disk: getDiskUsage(),
      },
      grouped,
      databases: Object.keys(DATABASES),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/databases - List all databases
app.get('/api/databases', (req, res) => {
  const dbs = Object.entries(DATABASES).map(([key, db]) => ({
    id: key, name: db.name, url: db.url.replace(/:[^@]+@/, ':***@'),
  }));
  res.json(dbs);
});

// POST /api/backup/:db - Backup single DB
app.post('/api/backup/:db', async (req, res) => {
  const db = req.params.db;
  if (!DATABASES[db]) return res.status(404).json({ error: 'Database not found' });
  const date = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const filename = `${db}_${date}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);
  try {
    execSync(`"${PGDUMP}" "${DATABASES[db].url}" --no-owner --no-privileges --clean --if-exists -f "${filepath}"`, { timeout: 60000, encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'require' } });
    if (fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
      const size = fs.statSync(filepath).size;
      // Save to DB
      await pool.query('INSERT INTO backup_history (database, filename, size_bytes, status) VALUES ($1, $2, $3, $4)', [db, filename, size, 'success']);
      res.json({ success: true, filename, size, sizeFormatted: formatSize(size) });
    } else {
      await pool.query('INSERT INTO backup_history (database, filename, status, error_message) VALUES ($1, $2, $3, $4)', [db, filename, 'failed', 'Empty file']);
      res.status(500).json({ error: 'Backup file is empty' });
    }
  } catch (e) {
    await pool.query('INSERT INTO backup_history (database, filename, status, error_message) VALUES ($1, $2, $3, $4)', [db, filename, 'failed', e.message]).catch(() => {});
    res.status(500).json({ error: e.message });
  }
});

// POST /api/backup-all - Backup all
app.post('/api/backup-all', async (req, res) => {
  const results = [];
  const date = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  for (const [key, db] of Object.entries(DATABASES)) {
    const filename = `${key}_${date}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);
    try {
      execSync(`"${PGDUMP}" "${db.url}" --no-owner --no-privileges --clean --if-exists -f "${filepath}"`, { timeout: 60000, encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'require' } });
      const size = fs.existsSync(filepath) ? fs.statSync(filepath).size : 0;
      await pool.query('INSERT INTO backup_history (database, filename, size_bytes, status) VALUES ($1, $2, $3, $4)', [key, filename, size, 'success']).catch(() => {});
      results.push({ database: key, success: size > 0, filename, size: formatSize(size) });
    } catch {
      await pool.query('INSERT INTO backup_history (database, filename, status, error_message) VALUES ($1, $2, $3, $4)', [key, filename, 'failed', 'Backup failed']).catch(() => {});
      results.push({ database: key, success: false, error: 'Backup failed' });
    }
  }
  res.json({ total: results.length, success: results.filter(r => r.success).length, results });
});

// POST /api/restore/:filename - Restore backup
app.post('/api/restore/:filename', async (req, res) => {
  const { filename } = req.params;
  const { targetDb } = req.body;
  if (!filename.endsWith('.sql')) return res.status(400).json({ error: 'Invalid file' });
  if (!targetDb || !DATABASES[targetDb]) return res.status(400).json({ error: 'Invalid target database' });
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Backup file not found' });
  const backupDb = filename.split('_').slice(0, -2).join('_');
  try {
    execSync(`"${PSQL}" "${DATABASES[targetDb].url}" -f "${filepath}"`, { timeout: 120000, encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'require' } });
    await pool.query('INSERT INTO restore_history (filename, source_db, target_db, status) VALUES ($1, $2, $3, $4)', [filename, backupDb, targetDb, 'success']);
    res.json({ success: true, restoredTo: targetDb, filename });
  } catch (e) {
    await pool.query('INSERT INTO restore_history (filename, source_db, target_db, status, error_message) VALUES ($1, $2, $3, $4, $5)', [filename, backupDb, targetDb, 'failed', e.message]).catch(() => {});
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/backup/:filename - Delete backup
app.delete('/api/backup/:filename', (req, res) => {
  const filepath = path.join(BACKUP_DIR, req.params.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' });
  if (!req.params.filename.endsWith('.sql')) return res.status(400).json({ error: 'Invalid file' });
  try {
    fs.unlinkSync(filepath);
    res.json({ success: true, deleted: req.params.filename });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/download/:filename - Download backup
app.get('/api/download/:filename', (req, res) => {
  const filepath = path.join(BACKUP_DIR, req.params.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' });
  if (!req.params.filename.endsWith('.sql')) return res.status(400).json({ error: 'Invalid file' });
  res.download(filepath);
});

// GET /api/stats - Stats from DB
app.get('/api/stats', async (req, res) => {
  try {
    const backups = getBackupsFromDisk();
    const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recent = backups.filter(b => b.createdAt > weekAgo);
    const days = {};
    backups.forEach(b => { const day = b.createdAt.toISOString().slice(0, 10); days[day] = (days[day] || 0) + 1; });
    res.json({
      totalBackups: backups.length,
      totalSize: formatSize(totalSize),
      disk: getDiskUsage(),
      recentBackups: recent.length,
      backupDays: days,
      oldestBackup: backups.length > 0 ? backups[backups.length - 1].createdAt : null,
      newestBackup: backups.length > 0 ? backups[0].createdAt : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/history - Backup/restore history from DB
app.get('/api/history', async (req, res) => {
  try {
    const backups = await pool.query('SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 100');
    const restores = await pool.query('SELECT * FROM restore_history ORDER BY created_at DESC LIMIT 100');
    res.json({ backups: backups.rows, restores: restores.rows });
  } catch (e) { res.json({ backups: [], restores: [] }); }
});

// GET /api/logs - Recent logs
app.get('/api/logs', (req, res) => {
  const logPath = path.join(BACKUP_DIR, 'backup.log');
  if (!fs.existsSync(logPath)) return res.json({ logs: [] });
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim()).slice(-100);
  res.json({ logs: lines });
});

// Debug endpoint
app.get('/api/debug', (req, res) => {
  res.json({ 
    pgdump: PGDUMP, 
    psql: PSQL,
    pgsslmode: process.env.PGSSLMODE || 'NOT SET',
    nodeEnv: process.env.NODE_ENV,
    dbsCount: Object.keys(DATABASES).length
  });
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// Start
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 ZBackup Dashboard running at http://localhost:${PORT}`);
  });
});
