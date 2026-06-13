const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'scans.json');

// Ensure database directory and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
}

// Load database scans into memory cache once at startup
let scansCache = [];
try {
  const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
  scansCache = JSON.parse(rawData);
  console.log(`[Database] Loaded ${scansCache.length} scans into memory cache.`);
} catch (err) {
  console.error('[Database] Error loading database file to cache:', err);
  scansCache = [];
}

// Write cache to database file asynchronously in background (non-blocking)
function saveCacheToDisk() {
  fs.writeFile(DATA_FILE, JSON.stringify(scansCache, null, 2), 'utf-8', (err) => {
    if (err) {
      console.error('[Database] Error writing database file in background:', err);
    }
  });
}

module.exports = {
  // Get all scans instantly from memory cache
  getAll() {
    return scansCache;
  },

  // Save scan instantly to memory cache, then persist asynchronously
  save(scan) {
    const exists = scansCache.some(s => s.id === scan.id);
    if (exists) {
      return scan;
    }

    // Prepend new scan to memory log cache
    scansCache.unshift(scan);
    
    // Save to disk in the background
    saveCacheToDisk();
    
    return scan;
  },

  // Clear cache instantly and clear disk asynchronously
  clear() {
    scansCache = [];
    saveCacheToDisk();
    return true;
  }
};
