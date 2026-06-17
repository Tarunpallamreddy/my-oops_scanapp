import { NativeModules, Platform } from 'react-native';
import { ApiResponse } from '../types';

let activeBaseUrl: string | null = null;

const getCandidateBaseUrls = () => {
  const urls: string[] = [];

  // 1. Script URL host
  const scriptURL = NativeModules.SourceCode?.scriptURL || '';
  const match = scriptURL.match(/^[a-z]+:\/\/([^:/]+)/i);
  if (match && match[1]) {
    const host = match[1];
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '10.0.2.2') {
      urls.push(`http://${host}:3000/api/v1`);
    }
  }

  // 2. Current host Wi-Fi IP (Current active IP of the computer running backend)
  urls.push('http://192.168.1.5:3000/api/v1');

  // 3. Emulator loopback
  urls.push('http://10.0.2.2:3000/api/v1');

  // 4. Localhost / 127.0.0.1 (Used if ADB port forwarding is enabled)
  urls.push('http://localhost:3000/api/v1');
  urls.push('http://127.0.0.1:3000/api/v1');

  // 5. Previous hardcoded fallback IP
  urls.push('http://192.168.10.159:3000/api/v1');

  // Deduplicate while keeping order
  return Array.from(new Set(urls));
};

interface RequestConfig extends RequestInit {
  params?: Record<string, string>;
}

export async function apiClient<T>(
  endpoint: string,
  config: RequestConfig = {}
): Promise<ApiResponse<T>> {
  const { params, headers, ...restOfConfig } = config;

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

  // If we have a cached working base URL, prioritize it, then fallback to others
  const urlsToTry = activeBaseUrl
    ? [activeBaseUrl, ...getCandidateBaseUrls().filter((u) => u !== activeBaseUrl)]
    : getCandidateBaseUrls();

  let lastErrorMsg = 'No base URLs to try';
  let lastStatusCode = 0;

  for (const baseUrl of urlsToTry) {
    let url = `${baseUrl}${endpoint}`;
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    try {
      console.log(`[API Client] Trying request to: ${url}`);
      
      // Use a short 2.5 second timeout during URL discovery to fail quickly
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const response = await fetch(url, {
        headers: mergedHeaders,
        ...restOfConfig,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const statusCode = response.status;
      let data: T | undefined;
      let error: string | undefined;

      if (response.ok) {
        try {
          data = await response.json();
        } catch (e) {
          data = {} as T;
        }
        
        // Cache the successful base URL
        if (activeBaseUrl !== baseUrl) {
          console.log(`[API Client] Connection success. Caching active base URL: ${baseUrl}`);
          activeBaseUrl = baseUrl;
        }
        
        return { success: true, data, statusCode };
      } else {
        try {
          const errJson = await response.json();
          error = errJson.message || `API request failed with status ${statusCode}`;
        } catch (e) {
          error = `HTTP error ${statusCode}`;
        }
        
        // If the server returns a non-ok HTTP status (e.g. 404, 500), the server IS reachable.
        // Therefore, we should cache this baseUrl as the active one and return the error.
        if (activeBaseUrl !== baseUrl) {
          console.log(`[API Client] Connected to server but got status ${statusCode}. Caching active base URL: ${baseUrl}`);
          activeBaseUrl = baseUrl;
        }
        
        return { success: false, error, statusCode };
      }
    } catch (err: any) {
      console.log(`[API Client] Failed connection to ${url}: ${err.message}`);
      lastErrorMsg = err.message || `Failed to connect to ${baseUrl}`;
      lastStatusCode = 0;
      // Loop continues to try other fallback base URLs
    }
  }

  return {
    success: false,
    error: `Network error: ${lastErrorMsg}. Tried ${urlsToTry.length} endpoints.`,
    statusCode: lastStatusCode,
  };
}
