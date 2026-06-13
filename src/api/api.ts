import { apiClient } from './client';
import { ApiResponse, ScanResult, ScanSubmitResponse } from '../types';

/**
 * Basic API utility functions for the Scan application.
 * Directly integrates with the client config and endpoints.
 */

/**
 * Submits a scanned item (barcode or QR code) to the server.
 * @param code The scanned string content.
 * @param type The type of scan (e.g. 'QR_CODE', 'BARCODE_UPC').
 * @returns Promise with ApiResponse containing the submission response.
 */
export async function submitScan(
  code: string,
  type: string
): Promise<ApiResponse<ScanSubmitResponse>> {
  return apiClient<ScanSubmitResponse>('/scans', {
    method: 'POST',
    body: JSON.stringify({
      code,
      type,
      deviceTimestamp: new Date().toISOString(),
    }),
  });
}

/**
 * Fetches the recent scan history from the server.
 * @returns Promise with ApiResponse containing an array of scan results.
 */
export async function getScanHistory(): Promise<ApiResponse<ScanResult[]>> {
  return apiClient<ScanResult[]>('/scans/history', {
    method: 'GET',
  });
}

/**
 * Clears the scan history on the server database.
 * @returns Promise with ApiResponse containing status.
 */
export async function clearScanHistory(): Promise<ApiResponse<{ success: boolean }>> {
  return apiClient<{ success: boolean }>('/scans', {
    method: 'DELETE',
  });
}
