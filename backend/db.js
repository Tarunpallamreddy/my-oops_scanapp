const sql = require('mssql');
const { dbConfig } = require('./config');

// Initialize database pool
let pool = null;

async function getPool() {
  if (pool) return pool;
  try {
    console.log('[Database] Connecting to Microsoft SQL Server...');
    try {
      pool = await sql.connect(dbConfig);
    } catch (connectErr) {
      if (connectErr.message.includes("database") || connectErr.message.includes("Cannot open database")) {
        console.log(`[Database] Database '${dbConfig.database}' might not exist. Attempting to create it...`);
        const masterConfig = { ...dbConfig, database: 'master' };
        const tempPool = await sql.connect(masterConfig);
        await tempPool.request().query(`IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '${dbConfig.database}') CREATE DATABASE [${dbConfig.database}]`);
        await tempPool.close();
        console.log(`[Database] Database '${dbConfig.database}' verified/created. Connecting...`);
        pool = await sql.connect(dbConfig);
      } else {
        throw connectErr;
      }
    }
    console.log('[Database] Connected successfully.');
    
    // Initialize Scans table if it does not exist
    const createTableQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Scans' AND xtype='U')
      CREATE TABLE Scans (
        id VARCHAR(50) PRIMARY KEY,
        data NVARCHAR(MAX) NOT NULL,
        type VARCHAR(50) NOT NULL,
        timestamp VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        classification VARCHAR(50),
        scannedDateFormatted VARCHAR(50),
        extractedDate VARCHAR(50),
        redirectUrl NVARCHAR(MAX),
        details NVARCHAR(MAX)
      )
    `;
    await pool.request().query(createTableQuery);
    console.log('[Database] Scans table checked/initialized in SQL Server.');

    // Verify and add salesOrder column if it doesn't exist
    const checkAlterQuery = `
      IF EXISTS (SELECT * FROM sysobjects WHERE name='Scans' AND xtype='U')
      AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Scans') AND name = 'salesOrder')
      BEGIN
        ALTER TABLE Scans ADD salesOrder VARCHAR(50);
      END
    `;
    await pool.request().query(checkAlterQuery);
    
    return pool;
  } catch (err) {
    console.error('[Database] SQL Server Connection failed:', err.message);
    pool = null;
    throw err;
  }
}

// Auto-trigger connection at startup to verify configuration
getPool().catch(() => {});

module.exports = {
  // Get all scans asynchronously
  async getAll() {
    try {
      const dbPool = await getPool();
      const result = await dbPool.request().query('SELECT * FROM Scans ORDER BY timestamp DESC');
      
      // Map rows, parsing the stringified details JSON
      return result.recordset.map(row => ({
        ...row,
        details: row.details ? JSON.parse(row.details) : null
      }));
    } catch (err) {
      console.error('[Database] Failed to retrieve scans from SQL Server:', err.message);
      return [];
    }
  },

  // Save scan asynchronously
  async save(scan) {
    try {
      const dbPool = await getPool();
      
      // Check if it already exists to prevent duplication
      const existsCheck = await dbPool.request()
        .input('id', sql.VarChar(50), scan.id)
        .query('SELECT 1 FROM Scans WHERE id = @id');
      
      if (existsCheck.recordset.length > 0) {
        return scan;
      }
      
      // Insert new scan
      const insertQuery = `
        INSERT INTO Scans (id, data, type, timestamp, status, classification, scannedDateFormatted, extractedDate, redirectUrl, details, salesOrder)
        VALUES (@id, @data, @type, @timestamp, @status, @classification, @scannedDateFormatted, @extractedDate, @redirectUrl, @details, @salesOrder)
      `;
      
      await dbPool.request()
        .input('id', sql.VarChar(50), scan.id)
        .input('data', sql.NVarChar(sql.MAX), scan.data)
        .input('type', sql.VarChar(50), scan.type)
        .input('timestamp', sql.VarChar(50), scan.timestamp)
        .input('status', sql.VarChar(20), scan.status)
        .input('classification', sql.VarChar(50), scan.classification || null)
        .input('scannedDateFormatted', sql.VarChar(50), scan.scannedDateFormatted || null)
        .input('extractedDate', sql.VarChar(50), scan.extractedDate || null)
        .input('redirectUrl', sql.NVarChar(sql.MAX), scan.redirectUrl || null)
        .input('details', sql.NVarChar(sql.MAX), scan.details ? JSON.stringify(scan.details) : null)
        .input('salesOrder', sql.VarChar(50), scan.salesOrder || null)
        .query(insertQuery);
        
      console.log(`[Database] Scanned item saved to SQL Server: ${scan.data}`);
      return scan;
    } catch (err) {
      console.error('[Database] Save failed in SQL Server:', err.message);
      throw err;
    }
  },

  // Clear history asynchronously
  async clear() {
    try {
      const dbPool = await getPool();
      await dbPool.request().query('DELETE FROM Scans');
      console.log('[Database] Cleared all scans from SQL Server.');
      return true;
    } catch (err) {
      console.error('[Database] Clear failed in SQL Server:', err.message);
      return false;
    }
  },

  // Update sales order on a list of scans
  async updateSalesOrder(scanIds, salesOrder) {
    try {
      const dbPool = await getPool();
      const request = dbPool.request();
      request.input('salesOrder', sql.VarChar(50), salesOrder);
      
      const idParams = [];
      scanIds.forEach((id, index) => {
        const paramName = `id_${index}`;
        request.input(paramName, sql.VarChar(50), id);
        idParams.push(`@${paramName}`);
      });
      
      const updateQuery = `
        UPDATE Scans 
        SET salesOrder = @salesOrder 
        WHERE id IN (${idParams.join(', ')})
      `;
      
      await request.query(updateQuery);
      console.log(`[Database] Updated sales order ${salesOrder} for ${scanIds.length} scans.`);
      return true;
    } catch (err) {
      console.error('[Database] Failed to update sales order in SQL Server:', err.message);
      throw err;
    }
  }
};
