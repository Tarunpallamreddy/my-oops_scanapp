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
};
