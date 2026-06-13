export interface ScanResult {
  id: string;
  data: string;
  type: string; // e.g. 'QR_CODE', 'BARCODE'
  timestamp: string; // ISO string
  status: 'pending' | 'synced' | 'failed';
  classification?: 'Barcode' | 'OCR Serial Number' | 'Web Link' | 'Text';
  scannedDateFormatted?: string;
  extractedDate?: string | null;
  redirectUrl?: string | null;
  details?: any;
}

export interface ScannerState {
  hasPermission: boolean | null;
  scanned: boolean;
  flashMode: 'on' | 'off';
  isScanning: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
}

export interface ScanSubmitResponse {
  scanId: string;
  processedAt: string;
  verified: boolean;
  classification?: 'Barcode' | 'OCR Serial Number' | 'Web Link' | 'Text';
  scannedDateFormatted?: string;
  extractedDate?: string | null;
  redirectUrl?: string | null;
  details?: any;
}
