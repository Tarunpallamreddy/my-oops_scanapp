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

  // 2. Barcode classification (standard native formats or pure numeric strings of typical barcode lengths)
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

  // 3. OCR Serial Number classification (alphanumeric containing mixed letters, numbers, or dashes/underscores)
  const isSerialPattern = /^[A-Z0-9\-_]{5,30}$/i.test(codeStr) && 
                          (/[A-Z]/i.test(codeStr) && /[0-9]/.test(codeStr) || codeStr.includes('-') || codeStr.includes('_'));
  
  if (isSerialPattern || /^SN-/i.test(codeStr) || /^OCR/i.test(codeStr)) {
    return 'OCR Serial Number';
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
app.post('/api/v1/scans', (req, res) => {
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

  db.save(scanRecord);

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
});

/**
 * Fetch scan history log list
 */
app.get('/api/v1/scans/history', (req, res) => {
  const scans = db.getAll();
  res.status(200).json(scans);
});

/**
 * Clear scan history database
 */
app.delete('/api/v1/scans', (req, res) => {
  db.clear();
  res.status(200).json({
    success: true,
    message: 'Scan history successfully cleared',
  });
});

// Bind server to 0.0.0.0 to make it accessible to local network devices (e.g. mobile phones on Wi-Fi)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`  My Go Scan Backend API Server started  `);
  console.log(`  Running on: http://localhost:${PORT}      `);
  console.log(`  External connections: http://0.0.0.0:${PORT}`);
  console.log(`=========================================`);
});
