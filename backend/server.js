const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for mobile application connections
app.use(cors());

// HTTP Request Logger
app.use(morgan('dev'));

// JSON Body Parser
app.use(express.json());

/**
 * Healthcheck route
 */
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Classifies a scanned code.
 * @param {string} code 
 * @param {string} type 
 * @returns {'Barcode' | 'OCR Serial Number' | 'Web Link' | 'Text'}
 */
function classifyCode(code, type) {
  const codeStr = String(code).trim();
  const typeUpper = String(type).toUpperCase();

  // 1. Web Link classification
  if (/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(codeStr)) {
    return 'Web Link';
  }

  // 2. OCR Serial Number classification
  const isSerialFormat = ['CODE128', 'CODE39', 'CODE93', 'PDF417', 'DATA_MATRIX', 'AZTEC'].some(
    t => typeUpper.includes(t)
  );
  const isRetailNumeric = /^\d+$/.test(codeStr) && [6, 8, 12, 13].includes(codeStr.length);
  const isSerialPattern = /^[A-Z0-9\-_]{5,30}$/i.test(codeStr) && !isRetailNumeric;
  
  if (isSerialFormat || isSerialPattern || /^SN-/i.test(codeStr) || /^OCR/i.test(codeStr)) {
    return 'OCR Serial Number';
  }

  // 3. Barcode classification (standard native formats or pure numeric strings of typical barcode lengths)
  const isBarcodeType = [
    'EAN13', 'EAN8', 'UPC_A', 'UPC_E', 'CODE128', 'CODE39', 'CODE93', 
    'ITF14', 'CODABAR', 'PDF417', 'AZTEC', 'DATA_MATRIX'
  ].some(t => typeUpper.includes(t));

  if (isBarcodeType) {
    return 'Barcode';
  }

  if (/^\d{8,14}$/.test(codeStr)) {
    return 'Barcode';
  }

  // 4. General Text
  return 'Text';
}

/**
 * Formats a timestamp into digital format "DD-MM-YYYY HH:mm:ss"
 * @param {string | Date} dateInput 
 * @returns {string}
 */
function formatDigitalDate(dateInput) {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      return new Date().toLocaleString();
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return new Date().toLocaleString();
  }
}

/**
 * Generates mock details for serial number query.
 * @param {string} serialNumber 
 * @returns {object}
 */
function getMockSerialDetails(serialNumber) {
  const seed = String(serialNumber).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const products = [
    'Enterprise Scanner Frame V2',
    'High-Performance Handheld PDA',
    'Thermal Label Printer XP-420',
    'Rugged Logistics Tablet Pro',
    'Industrial IoT Gateway Hub'
  ];
  const manufacturers = ['MyGo Solutions Ltd.', 'LogiTech Manufacturing', 'Global RFID Systems', 'Apex Device Corp'];
  
  const productName = products[seed % products.length];
  const manufacturer = manufacturers[seed % manufacturers.length];
  const warrantyYears = (seed % 3) + 1;
  const warrantyExpirationDate = new Date();
  warrantyExpirationDate.setFullYear(warrantyExpirationDate.getFullYear() + warrantyYears);
  
  const daysAgo = (seed % 150) + 30;
  const manufactureDate = formatDigitalDate(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000));

  return {
    serialNumber: serialNumber,
    productName: productName,
    manufacturer: manufacturer,
    manufactureDate: manufactureDate,
    warrantyStatus: seed % 2 === 0 ? 'Active Warranty' : 'Expired Warranty',
    warrantyExpiration: warrantyExpirationDate.toISOString().split('T')[0],
    batchNumber: `BATCH-${(seed % 900) + 100}-A`,
    status: seed % 4 === 0 ? 'Passed Quality Check' : 'In Service'
  };
}

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Retrieves an OAuth 2.0 access token using credentials.
 * Tries client_credentials first, then password grant, across possible endpoints.
 * @returns {Promise<string|null>}
 */
async function getOAuthToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 10000) {
    return cachedToken;
  }

  const user = 'CR5ORCA3OPT';
  const pass = 'Qwectg$24g';
  const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');

  const endpoints = [
    'https://dispatchq.amo-inc.com/neptune/oauth/token',
    'https://dispatchq.amo-inc.com/neptune/api/oauth/token',
    'https://dispatchq.amo-inc.com/neptune/oauth2/token',
    'https://dispatchq.amo-inc.com/neptune/api/oauth2/token',
    'https://dispatchq.amo-inc.com/sap/bc/sec/oauth2/token'
  ];

  for (const tokenUrl of endpoints) {
    // 1. Try client_credentials with Basic Auth header
    try {
      console.log(`[OAuth] Attempting client_credentials at ${tokenUrl}`);
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(3000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.access_token) {
          cachedToken = data.access_token;
          const expiresIn = data.expires_in || 3600;
          tokenExpiresAt = Date.now() + expiresIn * 1000;
          console.log(`[OAuth Success] Got token from ${tokenUrl} (expires in ${expiresIn}s)`);
          return cachedToken;
        }
      }
    } catch (err) {
      console.log(`[OAuth Detail] client_credentials failed on ${tokenUrl}: ${err.message}`);
    }

    // 2. Try client_credentials with body params
    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=client_credentials&client_id=${encodeURIComponent(user)}&client_secret=${encodeURIComponent(pass)}`,
        signal: AbortSignal.timeout(3000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.access_token) {
          cachedToken = data.access_token;
          const expiresIn = data.expires_in || 3600;
          tokenExpiresAt = Date.now() + expiresIn * 1000;
          console.log(`[OAuth Success] Got token via body params from ${tokenUrl} (expires in ${expiresIn}s)`);
          return cachedToken;
        }
      }
    } catch (err) {
      console.log(`[OAuth Detail] client_credentials body params failed on ${tokenUrl}: ${err.message}`);
    }

    // 3. Try password grant
    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=password&username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`,
        signal: AbortSignal.timeout(3000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.access_token) {
          cachedToken = data.access_token;
          const expiresIn = data.expires_in || 3600;
          tokenExpiresAt = Date.now() + expiresIn * 1000;
          console.log(`[OAuth Success] Got token via password grant from ${tokenUrl} (expires in ${expiresIn}s)`);
          return cachedToken;
        }
      }
    } catch (err) {
      console.log(`[OAuth Detail] password grant failed on ${tokenUrl}: ${err.message}`);
    }
  }

  console.warn('[OAuth] All OAuth 2.0 token attempts failed. Falling back to Basic Authentication.');
  return null;
}

/**
 * Extracts the matched row from various potential response schemas.
 */
function extractItemFromResponse(data) {
  if (!data) return null;
  
  let list = null;
  if (data.result && Array.isArray(data.result.GT_RESULT)) {
    list = data.result.GT_RESULT;
  } else if (Array.isArray(data.GT_RESULT)) {
    list = data.GT_RESULT;
  } else if (data.result && Array.isArray(data.result.it_sernr)) {
    list = data.result.it_sernr;
  } else if (Array.isArray(data.it_sernr)) {
    list = data.it_sernr;
  } else if (data.result && Array.isArray(data.result.IT_SERNR)) {
    list = data.result.IT_SERNR;
  } else if (Array.isArray(data.IT_SERNR)) {
    list = data.IT_SERNR;
  }
  
  if (list && list.length > 0) {
    return list[0];
  }
  return null;
}

/**
 * Fetches serial number details from the live SAP Neptune API.
 * Falls back to mock details if the serial number is not found or API fails.
 * @param {string} serialNumber
 * @returns {Promise<object>}
 */
async function fetchSerialDataInternal(serialNumber) {
  const serialItems = [
    { SERIAL: serialNumber }
  ];
  const padded = serialNumber.padStart(18, '0');
  if (padded !== serialNumber) {
    serialItems.push({ SERIAL: padded });
  }

  // Try multiple request payload formats
  const payloads = [
    // 1. Key-Value array table representation with GT_INPUT and SERIAL field
    [
      { KEY: "GT_INPUT", VALUE: JSON.stringify(serialItems) }
    ]
  ];

  const url = 'https://dispatchq.amo-inc.com/neptune/api/getserialdetails/getSerialDetails?sap-client=050';
  const user = 'CR5ORCA3OPT';
  const pass = 'Qwectg$24g';
  const basicAuthHeader = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');

  // Try fetching token
  let token = null;
  try {
    token = await getOAuthToken();
  } catch (tokenErr) {
    console.warn('[OAuth Error] Failed to get OAuth token:', tokenErr.message);
  }

  // Construct auth configurations to attempt
  const authConfigs = [];
  if (token) {
    authConfigs.push({ name: 'OAuth Bearer', header: `Bearer ${token}` });
  }
  authConfigs.push({ name: 'Basic Authentication', header: basicAuthHeader });

  // Try each authorization mechanism and payload format combination
  for (const auth of authConfigs) {
    for (let i = 0; i < payloads.length; i++) {
      const payload = payloads[i];
      try {
        console.log(`[API Lookup] Trying ${auth.name} with payload format #${i + 1} for serial ${serialNumber}...`);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': auth.header
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
          const data = await response.json();
          const item = extractItemFromResponse(data);
          if (item) {
            console.log(`[API Lookup Success] Serial ${serialNumber} successfully retrieved using ${auth.name} (Format #${i + 1}).`);
            return {
              serialNumber: serialNumber,
              product: item.MATNR || item.MAKTX || 'Unknown Product',
              status: item.SYS_STATUS_DESC || item.USR_STATUS_DESC || item.ASTTX || item.TXT30 || 'Unknown Status',
              soldToParty: item.SOP_NAME1 || item.SOLDTOPARTY || item.KUNAG || 'Unknown Sold-to Party',
              shipToParty: item.SH_NAME1 || item.SHIPTOPARTY || item.KUNWE || 'Unknown Ship-to Party',
              isRealData: true
            };
          } else {
            console.log(`[API Lookup] ${auth.name} with format #${i + 1} returned empty list.`);
          }
        } else {
          console.warn(`[API Lookup Warning] ${auth.name} format #${i + 1} failed with status ${response.status}: ${response.statusText}`);
        }
      } catch (err) {
        console.error(`[API Lookup Error] ${auth.name} format #${i + 1} exception for ${serialNumber}:`, err.message);
      }
    }
  }

  console.log(`[API Lookup Fail] Serial ${serialNumber} not found under any configuration.`);

  return {
    serialNumber: serialNumber,
    isRealData: false,
    notFound: true
  };
}

/**
 * Extracts any date pattern found within the barcode data or OCR number
 * @param {string} code 
 * @returns {string | null}
 */
function extractDateFromCode(code) {
  const codeStr = String(code).trim();
  
  // 1. YYYY-MM-DD or YYYY/MM/DD
  const pattern1 = /\b(\d{4})[-/](\d{2})[-/](\d{2})\b/;
  const match1 = codeStr.match(pattern1);
  if (match1) {
    return `${match1[3]}-${match1[2]}-${match1[1]}`;
  }

  // 2. DD-MM-YYYY or DD/MM/YYYY
  const pattern2 = /\b(\d{2})[-/](\d{2})[-/](\d{4})\b/;
  const match2 = codeStr.match(pattern2);
  if (match2) {
    return `${match2[1]}-${match2[2]}-${match2[3]}`;
  }

  // 3. Serialized YYYYMMDD
  const patternDigits8 = /\b(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/;
  const matchDigits8 = codeStr.match(patternDigits8);
  if (matchDigits8) {
    const year = matchDigits8[0].substring(0, 4);
    const month = matchDigits8[0].substring(4, 6);
    const day = matchDigits8[0].substring(6, 8);
    return `${day}-${month}-${year}`;
  }

  // 4. Serialized YYMMDD
  const patternDigits6 = /\b(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/;
  const matchDigits6 = codeStr.match(patternDigits6);
  if (matchDigits6) {
    const year = '20' + matchDigits6[1];
    const month = matchDigits6[2];
    const day = matchDigits6[3];
    return `${day}-${month}-${year}`;
  }

  return null;
}

/**
 * Parses all rich digital metadata components from a scanned barcode or OCR string.
 * @param {string} code 
 * @param {string} type 
 * @param {'Barcode' | 'OCR Serial Number' | 'Web Link' | 'Text'} classification 
 * @returns {object}
 */
function parseCodeDetails(code, type, classification) {
  const codeStr = String(code).trim();
  const typeUpper = String(type).toUpperCase();
  const details = {
    length: codeStr.length,
    characterSet: /^[0-9]+$/.test(codeStr) ? 'Numeric' : /^[a-zA-Z]+$/.test(codeStr) ? 'Alphabetic' : 'Alphanumeric',
  };

  // 1. EAN-13 GS1 Country of Origin and Checksum Lookup
  if (typeUpper.includes('EAN13') || typeUpper.includes('EAN-13') || (/^\d{13}$/.test(codeStr))) {
    const prefix = codeStr.substring(0, 3);
    const prefixNum = parseInt(prefix, 10);
    let country = 'Unknown GS1 Prefix';

    if (prefix === '978' || prefix === '979') country = 'Bookland (ISBN)';
    else if (prefixNum >= 0 && prefixNum <= 19) country = 'United States & Canada';
    else if (prefixNum >= 30 && prefixNum <= 39) country = 'United States';
    else if (prefixNum >= 300 && prefixNum <= 379) country = 'France';
    else if (prefixNum >= 400 && prefixNum <= 440) country = 'Germany';
    else if (prefixNum >= 450 && prefixNum <= 459 || prefixNum >= 490 && prefixNum <= 499) country = 'Japan';
    else if (prefixNum >= 500 && prefixNum <= 509) country = 'United Kingdom';
    else if (prefixNum >= 690 && prefixNum <= 699) country = 'China';
    else if (prefixNum >= 890) country = 'India';
    else if (prefixNum >= 880) country = 'South Korea';
    else if (prefixNum >= 760 && prefixNum <= 769) country = 'Switzerland';
    else if (prefixNum >= 800 && prefixNum <= 839) country = 'Italy';
    else if (prefixNum >= 840 && prefixNum <= 849) country = 'Spain';

    details.countryOfOrigin = country;

    // Check digit calculation
    if (codeStr.length === 13) {
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        sum += parseInt(codeStr[i], 10) * (i % 2 === 0 ? 1 : 3);
      }
      const calculatedCheck = (10 - (sum % 10)) % 10;
      const actualCheck = parseInt(codeStr[12], 10);
      details.checkDigit = actualCheck;
      details.isCheckDigitValid = calculatedCheck === actualCheck;
    }
  }

  // 2. Web Link URL parsing
  if (classification === 'Web Link') {
    try {
      const match = codeStr.match(/^https?:\/\/([^/?#]+)([^?#]*)/i);
      if (match) {
        details.protocol = codeStr.startsWith('https') ? 'HTTPS' : 'HTTP';
        details.host = match[1];
        details.path = match[2] || '/';
      }
    } catch (e) {
      // Ignore
    }
  }

  // 3. OCR Serial Number components separation
  if (classification === 'OCR Serial Number') {
    const match = codeStr.match(/^([A-Z]+)[-_]([0-9A-Z]+)$/i);
    if (match) {
      details.serialPrefix = match[1].toUpperCase();
      details.serialBody = match[2];
    } else {
      const letters = codeStr.replace(/[^a-zA-Z]/g, '');
      const digits = codeStr.replace(/[^0-9]/g, '');
      if (letters) details.serialLetters = letters.toUpperCase();
      if (digits) details.serialDigits = digits;
    }
  }

  return details;
}

/**
 * Submit scanned barcode / serial
 * Body: { code: string, type: string, deviceTimestamp: string }
 */
app.post('/api/v1/scans', async (req, res) => {
  const { code, type, deviceTimestamp } = req.body;

  if (!code || !type) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request: "code" and "type" parameters are required.',
    });
  }

  const scanId = uuidv4();
  const processedAt = new Date().toISOString();

  // Classify and format data on the backend
  const classification = classifyCode(code, type);
  const scannedDateFormatted = formatDigitalDate(deviceTimestamp || processedAt);
  const extractedDate = extractDateFromCode(code);
  const details = parseCodeDetails(code, type, classification);

  if (classification === 'OCR Serial Number' || classification === 'Barcode') {
    details.serialApiData = await fetchSerialDataInternal(code);
  }

  // Generate redirect lookup URL based on classification
  let redirectUrl = null;
  if (classification === 'Web Link') {
    redirectUrl = code;
  } else if (classification === 'Barcode') {
    redirectUrl = `https://barcodesdatabase.org/barcode/${encodeURIComponent(code)}`;
  } else {
    // Alphanumeric OCR numbers or General Text get direct Google Search lookups
    redirectUrl = `https://www.google.com/search?q=${encodeURIComponent(code)}`;
  }

  // Create scan record matching updated ScanResult interface
  const scanRecord = {
    id: scanId,
    data: code,
    type: type.toUpperCase(),
    timestamp: deviceTimestamp || processedAt,
    status: 'synced',
    classification,
    scannedDateFormatted,
    extractedDate,
    redirectUrl,
    details,
  };

  try {
    await db.save(scanRecord);

    res.status(201).json({
      success: true,
      scanId: scanId,
      processedAt: processedAt,
      verified: true,
      classification,
      scannedDateFormatted,
      extractedDate,
      redirectUrl,
      details,
    });
  } catch (dbErr) {
    console.error('[Database Save Error] Failed to write scan record:', dbErr.message);
    res.status(500).json({
      success: false,
      error: `Failed to save scan in database: ${dbErr.message}`,
    });
  }
});

/**
 * Mock Serial Number Lookup Endpoint
 * GET /api/v1/serials/:serialNumber
 */
app.get('/api/v1/serials/:serialNumber', async (req, res) => {
  const serialNumber = req.params.serialNumber;
  
  if (!serialNumber) {
    return res.status(400).json({ success: false, error: 'serialNumber parameter is required' });
  }

  try {
    const details = await fetchSerialDataInternal(serialNumber);
    res.status(200).json(details);
  } catch (err) {
    console.error('[Serial Lookup Error] Failed to fetch live serial details:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Update sales order numbers on scan logs (batch or single)
 * Body: { scanIds: string[], salesOrder: string }
 */
app.post('/api/v1/scans/sales-order', async (req, res) => {
  const { scanIds, salesOrder } = req.body;

  if (!Array.isArray(scanIds) || scanIds.length === 0 || !salesOrder) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request: "scanIds" (array) and "salesOrder" (string) parameters are required.',
    });
  }

  try {
    await db.updateSalesOrder(scanIds, salesOrder);
    res.status(200).json({
      success: true,
      message: `Successfully updated sales order for ${scanIds.length} scans.`,
    });
  } catch (err) {
    console.error('[Sales Order Update Error] Failed to update in DB:', err.message);
    res.status(500).json({
      success: false,
      error: `Failed to update database: ${err.message}`,
    });
  }
});

/**
 * Fetch scan history log list
 */
app.get('/api/v1/scans/history', async (req, res) => {
  const scans = await db.getAll();
  res.status(200).json(scans);
});

/**
 * Clear scan history database
 */
app.delete('/api/v1/scans', async (req, res) => {
  await db.clear();
  res.status(200).json({
    success: true,
    message: 'Scan history successfully cleared',
  });
});

// Bind server to 0.0.0.0 to make it accessible to local network devices (e.g. mobile phones on Wi-Fi)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`  MyGo Scan Backend API Server started  `);
  console.log(`  Running on: http://localhost:${PORT}      `);
  console.log(`  External connections: http://0.0.0.0:${PORT}`);
  console.log(`=========================================`);
});
