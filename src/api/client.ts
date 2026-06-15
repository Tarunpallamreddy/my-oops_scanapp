import { NativeModules, Platform } from 'react-native';
import { ApiResponse } from '../types';

const getBaseUrl = () => {
  const scriptURL = NativeModules.SourceCode?.scriptURL || '';

  // Match host/IP from any URL protocol, e.g., http://192.168.10.159:8081 or exp://192.168.10.159:8081
  const match = scriptURL.match(/^[a-z]+:\/\/([^:/]+)/i);
  if (match && match[1]) {
    let host = match[1];
    // If host resolves to a local loopback but the app is on a physical device,
    // route it directly to your PC's active local IP address.
    if (host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2') {
      return 'http://192.168.10.159:3000/api/v1';
    }
    return `http://${host}:3000/api/v1`;
  }

  // Fallback default (your PC's actual local IP address on the network)
  return 'http://192.168.10.159:3000/api/v1';
};

const BASE_URL = getBaseUrl();

interface RequestConfig extends RequestInit {
  params?: Record<string, string>;
}

export async function apiClient<T>(
  endpoint: string,
  config: RequestConfig = {}
): Promise<ApiResponse<T>> {
  const { params, headers, ...restOfConfig } = config;

  // Construct URL with query parameters
  let url = `${BASE_URL}${endpoint}`;
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  // Set up default headers
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Merge custom headers
  const mergedHeaders = {
    ...defaultHeaders,
    ...headers,
  };

  try {
    const response = await fetch(url, {
      headers: mergedHeaders,
      ...restOfConfig,
    });

    const statusCode = response.status;
    let data: T | undefined;
    let error: string | undefined;

    if (response.ok) {
      try {
        data = await response.json();
      } catch (e) {
        // If response is empty or invalid JSON
        data = {} as T;
      }
      return { success: true, data, statusCode };
    } else {
      try {
        const errJson = await response.json();
        error = errJson.message || `API request failed with status ${statusCode}`;
      } catch (e) {
        error = `HTTP error ${statusCode}`;
      }
      return { success: false, error, statusCode };
    }
  } catch (err: any) {
    // Attempt local loopback fallback if the initial network call failed
    const fallbackHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
    const fallbackUrl = url.replace(/http:\/\/[^:/]+/, `http://${fallbackHost}`);

    if (url !== fallbackUrl) {
      console.log(`[API Client] Initial call failed. Attempting loopback fallback: ${fallbackUrl}`);
      try {
        const response = await fetch(fallbackUrl, {
          headers: mergedHeaders,
          ...restOfConfig,
        });
        const statusCode = response.status;
        if (response.ok) {
          let data: T;
          try {
            data = await response.json();
          } catch (e) {
            data = {} as T;
          }
          return { success: true, data, statusCode };
        } else {
          let error: string;
          try {
            const errJson = await response.json();
            error = errJson.message || `API request failed with status ${statusCode}`;
          } catch (e) {
            error = `HTTP error ${statusCode}`;
          }
          return { success: false, error, statusCode };
        }
      } catch (fallbackErr: any) {
        console.warn(`[API Client] Loopback fallback also failed:`, fallbackErr.message);
      }
    }

    return {
      success: false,
      error: err.message || 'Network error occurred. Please check your connection.',
      statusCode: 0,
    };
  }
}
