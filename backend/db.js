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

    // Initialize Orders table if it does not exist
    const createOrdersQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Orders' AND xtype='U')
      CREATE TABLE Orders (
        orderNumber VARCHAR(50) PRIMARY KEY,
        serialNumber VARCHAR(50) NOT NULL,
        productName NVARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        orderedQty INT NOT NULL,
        openQty INT NOT NULL,
        fulfillmentDate VARCHAR(50) NOT NULL,
        backorderReason NVARCHAR(255)
      )
    `;
    await pool.request().query(createOrdersQuery);

    // Initialize Deliveries table if it does not exist
    const createDeliveriesQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Deliveries' AND xtype='U')
      CREATE TABLE Deliveries (
        deliveryNumber VARCHAR(50) PRIMARY KEY,
        orderNumber VARCHAR(50) NOT NULL,
        trackingNumber VARCHAR(50) NOT NULL,
        carrier VARCHAR(50) NOT NULL,
        packingList NVARCHAR(MAX) NOT NULL,
        deliveryStatus VARCHAR(50) NOT NULL,
        commercialInvoice VARCHAR(50) NOT NULL
      )
    `;
    await pool.request().query(createDeliveriesQuery);

    // Initialize Billing table if it does not exist
    const createBillingQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Billing' AND xtype='U')
      CREATE TABLE Billing (
        invoiceNumber VARCHAR(50) PRIMARY KEY,
        orderNumber VARCHAR(50) NOT NULL,
        billingAmount DECIMAL(18, 2) NOT NULL,
        paymentStatus VARCHAR(50) NOT NULL,
        invoiceDate VARCHAR(50) NOT NULL
      )
    `;
    await pool.request().query(createBillingQuery);
    console.log('[Database] Orders, Deliveries, and Billing tables checked/initialized in SQL Server.');

    return pool;
  } catch (err) {
    console.error('[Database] SQL Server Connection failed:', err.message);
    pool = null;
    throw err;
  }
}

// Auto-trigger connection at startup to verify configuration
getPool().catch(() => { });

async function seedOrderInsights(dbPool, serialNumber, productName = 'Enterprise Device Frame V2') {
  try {
    // Check if an order already exists for this serialNumber
    const orderCheck = await dbPool.request()
      .input('serialNumber', sql.VarChar(50), serialNumber)
      .query('SELECT orderNumber FROM Orders WHERE serialNumber = @serialNumber');

    if (orderCheck.recordset.length > 0) {
      return; // Already seeded
    }

    // Generate deterministic values based on serial number string
    const seed = String(serialNumber).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const orderNum = `5${String((seed % 900000000) + 100000000)}`;
    const delNum = `DEL-8${(seed % 900000) + 100000}`;
    const trackingNum = `TRK-${(seed % 90000000) + 10000000}`;
    const invoiceNum = `INV-9${(seed % 900000) + 100000}`;

    const statuses = ['Processing', 'Shipped', 'Backorder', 'Delivered'];
    const backorderReasons = ['Pending stock allocation', 'Component delay', 'High volume backlog', 'Logistics hold'];
    const carriers = ['FedEx Express', 'DHL Global', 'UPS Ground', 'USPS Priority'];
    const status = statuses[seed % statuses.length];
    const carrier = carriers[seed % carriers.length];

    const orderedQty = (seed % 5) + 1;
    const openQty = status === 'Backorder' ? (seed % orderedQty) + 1 : 0;
    const backorderReason = status === 'Backorder' ? backorderReasons[seed % backorderReasons.length] : null;

    const fulfillmentDaysOut = (seed % 10) + 2;
    const fulfillmentDate = new Date(Date.now() + fulfillmentDaysOut * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB');

    // 1. Insert Order
    await dbPool.request()
      .input('orderNumber', sql.VarChar(50), orderNum)
      .input('serialNumber', sql.VarChar(50), serialNumber)
      .input('productName', sql.NVarChar(255), productName)
      .input('status', sql.VarChar(50), status)
      .input('orderedQty', sql.Int, orderedQty)
      .input('openQty', sql.Int, openQty)
      .input('fulfillmentDate', sql.VarChar(50), fulfillmentDate)
      .input('backorderReason', sql.NVarChar(255), backorderReason)
      .query(`
        INSERT INTO Orders (orderNumber, serialNumber, productName, status, orderedQty, openQty, fulfillmentDate, backorderReason)
        VALUES (@orderNumber, @serialNumber, @productName, @status, @orderedQty, @openQty, @fulfillmentDate, @backorderReason)
      `);

    // 2. Insert Delivery
    const deliveryStatus = status === 'Delivered' ? 'Delivered' : status === 'Shipped' ? 'In Transit' : 'Pending Shipment';
    const packingList = JSON.stringify([
      { line: 10, item: productName, qty: orderedQty - openQty, unit: 'EA' }
    ]);
    await dbPool.request()
      .input('deliveryNumber', sql.VarChar(50), delNum)
      .input('orderNumber', sql.VarChar(50), orderNum)
      .input('trackingNumber', sql.VarChar(50), trackingNum)
      .input('carrier', sql.VarChar(50), carrier)
      .input('packingList', sql.NVarChar(sql.MAX), packingList)
      .input('deliveryStatus', sql.VarChar(50), deliveryStatus)
      .input('commercialInvoice', sql.VarChar(50), invoiceNum)
      .query(`
        INSERT INTO Deliveries (deliveryNumber, orderNumber, trackingNumber, carrier, packingList, deliveryStatus, commercialInvoice)
        VALUES (@deliveryNumber, @orderNumber, @trackingNumber, @carrier, @packingList, @deliveryStatus, @commercialInvoice)
      `);

    // 3. Insert Billing
    const amount = ((seed % 1500) + 150) * orderedQty;
    const paymentStatuses = ['Paid', 'Pending', 'Overdue'];
    const paymentStatus = paymentStatuses[seed % paymentStatuses.length];
    const invoiceDate = new Date(Date.now() - (seed % 10) * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB');

    await dbPool.request()
      .input('invoiceNumber', sql.VarChar(50), invoiceNum)
      .input('orderNumber', sql.VarChar(50), orderNum)
      .input('billingAmount', sql.Decimal(18, 2), amount)
      .input('paymentStatus', sql.VarChar(50), paymentStatus)
      .input('invoiceDate', sql.VarChar(50), invoiceDate)
      .query(`
        INSERT INTO Billing (invoiceNumber, orderNumber, billingAmount, paymentStatus, invoiceDate)
        VALUES (@invoiceNumber, @orderNumber, @billingAmount, @paymentStatus, @invoiceDate)
      `);

    console.log(`[Database] Seeded order insights for serial: ${serialNumber}`);
  } catch (err) {
    console.error(`[Database] Seeding order insights failed:`, err.message);
  }
}

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

      // Auto-seed mock order details
      const productName = scan.details?.serialApiData?.product || 'Enterprise Device Frame V2';
      await seedOrderInsights(dbPool, scan.data, productName);

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
      await dbPool.request().query('DELETE FROM Billing');
      await dbPool.request().query('DELETE FROM Deliveries');
      await dbPool.request().query('DELETE FROM Orders');
      await dbPool.request().query('DELETE FROM Scans');
      console.log('[Database] Cleared all table logs from SQL Server.');
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
  },

  // Seed mock order data directly
  async seedMockData(serialNumber, productName) {
    try {
      const dbPool = await getPool();
      await seedOrderInsights(dbPool, serialNumber, productName);
    } catch (err) {
      console.error('[Database] seedMockData failed:', err.message);
    }
  },

  // Retrieve Order details by serial
  async getOrderDetails(serialNumber) {
    try {
      const dbPool = await getPool();
      const result = await dbPool.request()
        .input('serialNumber', sql.VarChar(50), serialNumber)
        .query('SELECT * FROM Orders WHERE serialNumber = @serialNumber');
      return result.recordset[0] || null;
    } catch (err) {
      console.error('[Database] Failed to get order details:', err.message);
      return null;
    }
  },

  // Retrieve Delivery details by serial
  async getDeliveryDetailsBySerial(serialNumber) {
    try {
      const dbPool = await getPool();
      const result = await dbPool.request()
        .input('serialNumber', sql.VarChar(50), serialNumber)
        .query(`
          SELECT d.* FROM Deliveries d
          INNER JOIN Orders o ON d.orderNumber = o.orderNumber
          WHERE o.serialNumber = @serialNumber
        `);
      return result.recordset[0] || null;
    } catch (err) {
      console.error('[Database] Failed to get delivery details by serial:', err.message);
      return null;
    }
  },

  // Retrieve Billing details by serial
  async getBillingDetailsBySerial(serialNumber) {
    try {
      const dbPool = await getPool();
      const result = await dbPool.request()
        .input('serialNumber', sql.VarChar(50), serialNumber)
        .query(`
          SELECT b.* FROM Billing b
          INNER JOIN Orders o ON b.orderNumber = o.orderNumber
          WHERE o.serialNumber = @serialNumber
        `);
      return result.recordset[0] || null;
    } catch (err) {
      console.error('[Database] Failed to get billing details by serial:', err.message);
      return null;
    }
  },

  // Retrieve Serial number by order number
  async getSerialNumberByOrder(orderNumber) {
    try {
      const dbPool = await getPool();
      const result = await dbPool.request()
        .input('orderNumber', sql.VarChar(50), orderNumber)
        .query('SELECT serialNumber FROM Orders WHERE orderNumber = @orderNumber');
      return result.recordset[0]?.serialNumber || null;
    } catch (err) {
      console.error('[Database] Failed to get serial number by order:', err.message);
      return null;
    }
  }
};
