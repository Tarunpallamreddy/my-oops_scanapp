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

/**
 * Updates scans with a generated 10-digit Sales Order number.
 * @param scanIds Array of scan IDs to update.
 * @param salesOrder The 10-digit Sales Order number to associate.
 * @returns Promise with ApiResponse.
 */
export async function updateSalesOrder(
  scanIds: string[],
  salesOrder: string
): Promise<ApiResponse<{ success: boolean }>> {
  return apiClient<{ success: boolean }>('/scans/sales-order', {
    method: 'POST',
    body: JSON.stringify({
      scanIds,
      salesOrder,
    }),
  });
}

/**
 * Sends a chat request to the Sales Intelligence backend orchestrator.
 * @param serialNumber The serial number context of the conversation.
 * @param message The user query string.
 * @returns Promise with ApiResponse containing chat category and response text.
 */
export async function sendChatMessage(
  serialNumber: string,
  message: string
): Promise<ApiResponse<{ success: boolean; category: string; responseText: string; serialNumber?: string | null; productName?: string | null }>> {
  return apiClient<{ success: boolean; category: string; responseText: string; serialNumber?: string | null; productName?: string | null }>('/chat', {
    method: 'POST',
    body: JSON.stringify({
      serialNumber,
      message,
    }),
  });
}

