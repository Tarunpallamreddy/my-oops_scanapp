import { apiClient } from './client';
import { ApiResponse, ScanResult, ScanSubmitResponse } from '../types';

export const scanApi = {
  /**
   * Submits a newly scanned barcode or QR code to the backend.
   */
  submitScanData: async (
    code: string,
    type: string
  ): Promise<ApiResponse<ScanSubmitResponse>> => {
    return apiClient<ScanSubmitResponse>('/scans', {
      method: 'POST',
      body: JSON.stringify({
        code,
        type,
        deviceTimestamp: new Date().toISOString(),
      }),
    });
  },

  /**
   * Fetches recent scans from the server for synchronization check.
   */
  fetchScanHistory: async (): Promise<ApiResponse<ScanResult[]>> => {
    return apiClient<ScanResult[]>('/scans/history', {
      method: 'GET',
    });
  },

  /**
   * Updates scans with a generated 10-digit Sales Order number.
   */
  updateSalesOrder: async (
    scanIds: string[],
    salesOrder: string
  ): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient<{ success: boolean }>('/scans/sales-order', {
      method: 'POST',
      body: JSON.stringify({
        scanIds,
        salesOrder,
      }),
    });
  },

  /**
   * Sends a user query about a scanned item to the Sales Intelligence Chat API.
   */
  sendChatInquiry: async (
    serialNumber: string,
    message: string
  ): Promise<ApiResponse<{ success: boolean; category: string; responseText: string }>> => {
    return apiClient<{ success: boolean; category: string; responseText: string }>('/chat', {
      method: 'POST',
      body: JSON.stringify({
        serialNumber,
        message,
      }),
    });
  },
};
