const {
  classifyCode,
  formatDigitalDate,
  extractDateFromCode,
  parseCodeDetails
} = require('./utils');

describe('classifyCode()', () => {
  test('should classify valid URLs as "Web Link"', () => {
    expect(classifyCode('https://google.com', 'text')).toBe('Web Link');
    expect(classifyCode('http://192.168.1.1:3000/api/v1/chat?x=y', 'QR_CODE')).toBe('Web Link');
  });

  test('should classify potential serial numbers as "OCR Serial Number"', () => {
    expect(classifyCode('SN-123456', 'text')).toBe('OCR Serial Number');
    expect(classifyCode('OCR502447', 'text')).toBe('OCR Serial Number');
    expect(classifyCode('ABC123XYZ', 'CODE39')).toBe('OCR Serial Number');
    expect(classifyCode('2043052447', 'CODE128')).toBe('OCR Serial Number');
  });

  test('should classify standard numeric codes as "Barcode"', () => {
    expect(classifyCode('12345678', 'EAN8')).toBe('Barcode');
    expect(classifyCode('8901072002489', 'EAN13')).toBe('Barcode');
    expect(classifyCode('9780134685991', 'UPC_A')).toBe('Barcode');
  });

  test('should fallback to "Text" for random text messages', () => {
    expect(classifyCode('Hello world', 'text')).toBe('Text');
    expect(classifyCode('Show me status', 'text')).toBe('Text');
  });
});

describe('formatDigitalDate()', () => {
  test('should format valid dates into digital format', () => {
    const formatted = formatDigitalDate('2026-06-18T10:00:00Z');
    // Assert DD-MM-YYYY HH:mm:ss format
    expect(formatted).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/);
  });

  test('should return localized date fallback for invalid inputs', () => {
    const invalidDate = formatDigitalDate('not-a-valid-date');
    expect(invalidDate).toBeDefined();
    expect(typeof invalidDate).toBe('string');
  });
});

describe('extractDateFromCode()', () => {
  test('should extract dates from YYYY-MM-DD or YYYY/MM/DD formats', () => {
    expect(extractDateFromCode('ABC-2026-06-18-XYZ')).toBe('18-06-2026');
    expect(extractDateFromCode('2026/06/18')).toBe('18-06-2026');
  });

  test('should extract dates from DD-MM-YYYY or DD/MM/YYYY formats', () => {
    expect(extractDateFromCode('OCR-18-06-2026')).toBe('18-06-2026');
    expect(extractDateFromCode('18/06/2026')).toBe('18-06-2026');
  });

  test('should extract dates from YYYYMMDD serialized formats', () => {
    expect(extractDateFromCode('SN-20260618-999')).toBe('18-06-2026');
  });

  test('should extract dates from YYMMDD serialized formats', () => {
    expect(extractDateFromCode('BAR-260618')).toBe('18-06-2026');
  });

  test('should return null when no date pattern is found', () => {
    expect(extractDateFromCode('2043052447')).toBeNull();
    expect(extractDateFromCode('abcde-12345')).toBeNull();
  });
});

describe('parseCodeDetails()', () => {
  test('should parse EAN-13 GS1 country prefixes correctly', () => {
    expect(parseCodeDetails('0012345678905', 'EAN13', 'Barcode').countryOfOrigin).toBe('United States & Canada');
    expect(parseCodeDetails('3001234567891', 'EAN13', 'Barcode').countryOfOrigin).toBe('France');
    expect(parseCodeDetails('4001234567892', 'EAN13', 'Barcode').countryOfOrigin).toBe('Germany');
    expect(parseCodeDetails('4901234567893', 'EAN13', 'Barcode').countryOfOrigin).toBe('Japan');
    expect(parseCodeDetails('5001234567894', 'EAN-13', 'Barcode').countryOfOrigin).toBe('United Kingdom');
    expect(parseCodeDetails('6901234567895', 'EAN-13', 'Barcode').countryOfOrigin).toBe('China');
    expect(parseCodeDetails('8901234567896', 'EAN-13', 'Barcode').countryOfOrigin).toBe('India');
  });

  test('should validate checksums for EAN-13 barcodes', () => {
    const validResult = parseCodeDetails('9780134685991', 'EAN13', 'Barcode');
    expect(validResult.checkDigit).toBe(1);
    expect(validResult.isCheckDigitValid).toBe(true);

    const invalidResult = parseCodeDetails('9780134685990', 'EAN13', 'Barcode');
    expect(invalidResult.isCheckDigitValid).toBe(false);
  });

  test('should parse web link protocols, hostnames, and paths', () => {
    const webDetails = parseCodeDetails('https://mygosolutions.com/products/scanner', 'text', 'Web Link');
    expect(webDetails.protocol).toBe('HTTPS');
    expect(webDetails.host).toBe('mygosolutions.com');
    expect(webDetails.path).toBe('/products/scanner');
  });

  test('should segment OCR serial numbers into prefixes and body', () => {
    const ocrDetails = parseCodeDetails('ABC-12345XYZ', 'text', 'OCR Serial Number');
    expect(ocrDetails.serialPrefix).toBe('ABC');
    expect(ocrDetails.serialBody).toBe('12345XYZ');

    const ocrNoDelimiter = parseCodeDetails('XY12345', 'text', 'OCR Serial Number');
    expect(ocrNoDelimiter.serialLetters).toBe('XY');
    expect(ocrNoDelimiter.serialDigits).toBe('12345');
  });
});
