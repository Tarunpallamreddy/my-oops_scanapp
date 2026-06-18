const { extractItemFromResponse } = require('./neptune-api');

describe('extractItemFromResponse()', () => {
  const mockItem = { SERIAL: '2043052447', MATNR: 'ZCB0000240-12', USR_STATUS_DESC: 'Sold' };

  test('should return null for null/undefined or empty payload', () => {
    expect(extractItemFromResponse(null)).toBeNull();
    expect(extractItemFromResponse(undefined)).toBeNull();
    expect(extractItemFromResponse({})).toBeNull();
  });

  test('should extract from data.result.GT_RESULT', () => {
    const payload = { result: { GT_RESULT: [mockItem] } };
    expect(extractItemFromResponse(payload)).toEqual(mockItem);
  });

  test('should extract from data.GT_RESULT', () => {
    const payload = { GT_RESULT: [mockItem] };
    expect(extractItemFromResponse(payload)).toEqual(mockItem);
  });

  test('should extract from data.result.it_sernr', () => {
    const payload = { result: { it_sernr: [mockItem] } };
    expect(extractItemFromResponse(payload)).toEqual(mockItem);
  });

  test('should extract from data.it_sernr', () => {
    const payload = { it_sernr: [mockItem] };
    expect(extractItemFromResponse(payload)).toEqual(mockItem);
  });

  test('should extract from data.result.IT_SERNR', () => {
    const payload = { result: { IT_SERNR: [mockItem] } };
    expect(extractItemFromResponse(payload)).toEqual(mockItem);
  });

  test('should extract from data.IT_SERNR', () => {
    const payload = { IT_SERNR: [mockItem] };
    expect(extractItemFromResponse(payload)).toEqual(mockItem);
  });

  test('should return null if list is empty', () => {
    const payload = { GT_RESULT: [] };
    expect(extractItemFromResponse(payload)).toBeNull();
  });

  test('should return null if the target property is not an array', () => {
    const payload = { GT_RESULT: 'not-an-array' };
    expect(extractItemFromResponse(payload)).toBeNull();
  });
});
