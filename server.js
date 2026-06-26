const express = require('express');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const basicAuth = require('basic-auth');

const app = express();
const PORT = process.env.PORT || 3456;
const BACKUP_DIR = '/data/workspace/backups';
const PGDUMP = '/usr/lib/postgresql/18/bin/pg_dump';
const AUTH_USER = process.env.BACKUP_USER || 'admin';
const AUTH_PASS = process.env.BACKUP_PASS || 'backup123';

// Basic Auth middleware
function auth(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.name !== AUTH_USER || user.pass !== AUTH_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="ZBackup Dashboard"');
    return res.status(401).send('Authentication required');
  }
  next();
}

app.use(express.json());
app.use(auth);

// Database configurations
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

// Get all backup files
function getBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      const parts = f.replace('.sql', '').split('_');
      const timestamp = parts.slice(-2).join('_');
      const dbName = parts.slice(0, -2).join('_');
      return {
        filename: f,
        database: dbName,
        size: stat.size,
        sizeFormatted: formatSize(stat.size),
        createdAt: stat.mtime,
        timestamp: timestamp,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
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

// API Routes

// GET /api/backups - List all backups
app.get('/api/backups', (req, res) => {
  const backups = getBackups();
  
  // Group by database
  const grouped = {};
  backups.forEach(b => {
    if (!grouped[b.database]) grouped[b.database] = [];
    grouped[b.database].push(b);
  });
  
  // Stats
  const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
  const databases = Object.keys(grouped);
  const lastBackup = backups.length > 0 ? backups[0] : null;
  
  res.json({
    backups,
    stats: {
      totalBackups: backups.length,
      totalDatabases: databases.length,
      totalSize: formatSize(totalSize),
      totalSizeBytes: totalSize,
      lastBackup: lastBackup ? { database: lastBackup.database, date: lastBackup.createdAt } : null,
      disk: getDiskUsage(),
    },
    grouped,
    databases: Object.keys(DATABASES),
  });
});

// GET /api/databases - List all databases
app.get('/api/databases', (req, res) => {
  const dbs = Object.entries(DATABASES).map(([key, db]) => ({
    id: key,
    name: db.name,
    url: db.url.replace(/:[^@]+@/, ':***@'), // Mask password
  }));
  res.json(dbs);
});

// POST /api/backup/:db - Run backup for specific database
app.post('/api/backup/:db', (req, res) => {
  const db = req.params.db;
  if (!DATABASES[db]) return res.status(404).json({ error: 'Database not found' });
  
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${db}_${date}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);
  
  try {
    execSync(`"${PGDUMP}" "${DATABASES[db].url}" --no-owner --no-privileges --clean --if-exists -f "${filepath}"`, {
      timeout: 60000,
      encoding: 'utf8',
    });
    
    if (fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
      const stat = fs.statSync(filepath);
      res.json({ success: true, filename, size: stat.size, sizeFormatted: formatSize(stat.size) });
    } else {
      res.status(500).json({ error: 'Backup file is empty' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/backup-all - Run backup for all databases
app.post('/api/backup-all', (req, res) => {
  const results = [];
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  
  for (const [key, db] of Object.entries(DATABASES)) {
    const filename = `${key}_${date}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);
    try {
      execSync(`"${PGDUMP}" "${db.url}" --no-owner --no-privileges --clean --if-exists -f "${filepath}"`, {
        timeout: 60000,
        encoding: 'utf8',
      });
      const size = fs.existsSync(filepath) ? fs.statSync(filepath).size : 0;
      results.push({ database: key, success: size > 0, filename, size: formatSize(size) });
    } catch {
      results.push({ database: key, success: false, error: 'Backup failed' });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  res.json({ total: results.length, success: successCount, results });
});

// DELETE /api/backup/:filename - Delete a backup file
app.delete('/api/backup/:filename', (req, res) => {
  const filepath = path.join(BACKUP_DIR, req.params.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' });
  if (!req.params.filename.endsWith('.sql')) return res.status(400).json({ error: 'Invalid file' });
  
  try {
    fs.unlinkSync(filepath);
    res.json({ success: true, deleted: req.params.filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/restore/:filename - Restore a backup to a database
app.post('/api/restore/:filename', (req, res) => {
  const { filename } = req.params;
  const { targetDb } = req.body;
  
  if (!filename.endsWith('.sql')) return res.status(400).json({ error: 'Invalid file' });
  if (!targetDb || !DATABASES[targetDb]) return res.status(400).json({ error: 'Invalid target database' });
  
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Backup file not found' });
  
  // Check if backup is for the same database
  const backupDb = filename.split('_').slice(0, -2).join('_');
  
  try {
    const psql = PGDUMP.replace('pg_dump', 'psql');
    execSync(`${psql} "${DATABASES[targetDb].url}" -f "${filepath}"`, {
      timeout: 120000, // 2 minutes for restore
      encoding: 'utf8',
    });
    res.json({ success: true, restoredTo: targetDb, filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/download/:filename - Download a backup file
app.get('/api/download/:filename', (req, res) => {
  const filepath = path.join(BACKUP_DIR, req.params.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' });
  if (!req.params.filename.endsWith('.sql')) return res.status(400).json({ error: 'Invalid file' });
  
  res.download(filepath);
});

// GET /api/stats - Get system stats
app.get('/api/stats', (req, res) => {
  const backups = getBackups();
  const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
  
  // Recent activity (last 7 days)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = backups.filter(b => b.createdAt > weekAgo);
  
  // Backup frequency
  const days = {};
  backups.forEach(b => {
    const day = b.createdAt.toISOString().slice(0, 10);
    days[day] = (days[day] || 0) + 1;
  });
  
  res.json({
    totalBackups: backups.length,
    totalSize: formatSize(totalSize),
    disk: getDiskUsage(),
    recentBackups: recent.length,
    backupDays: days,
    oldestBackup: backups.length > 0 ? backups[backups.length - 1].createdAt : null,
    newestBackup: backups.length > 0 ? backups[0].createdAt : null,
  });
});

// GET /api/logs - Get recent backup logs
app.get('/api/logs', (req, res) => {
  const logPath = path.join(BACKUP_DIR, 'backup.log');
  if (!fs.existsSync(logPath)) return res.json({ logs: [] });
  
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim()).slice(-100);
  res.json({ logs: lines });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all: serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 ZBackup Dashboard running at http://localhost:${PORT}`);
});
