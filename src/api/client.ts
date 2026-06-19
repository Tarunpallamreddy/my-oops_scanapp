import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiResponse } from '../types';

let activeBaseUrl: string | null = null;

// Load cached active URL on client startup
AsyncStorage.getItem('@mygoscan:active_base_url').then(val => {
  if (val) {
    activeBaseUrl = val;
    console.log(`[API Client] Loaded cached active base URL from storage: ${activeBaseUrl}`);
  }
}).catch(() => {});

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

async function discoverBaseUrl(): Promise<string | null> {
  if (activeBaseUrl) return activeBaseUrl;
  
  const urls = getCandidateBaseUrls();
  console.log(`[API Client Discovery] Starting discovery on ${urls.length} candidates...`);
  
  const checks = urls.map(async (baseUrl) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        return baseUrl;
      }
    } catch (e) {
      // Ignore
    }
    return null;
  });

  const results = await Promise.all(checks);
  const workingUrl = results.find((r) => r !== null);
  if (workingUrl) {
    console.log(`[API Client Discovery] Successfully discovered active base URL: ${workingUrl}`);
    activeBaseUrl = workingUrl;
    await AsyncStorage.setItem('@mygoscan:active_base_url', workingUrl).catch(() => {});
    return workingUrl;
  }
  
  console.log(`[API Client Discovery] No active base URL could be discovered.`);
  return null;
}

async function verifyUrlHealth(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (e) {
    return false;
  }
}

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

  // Verify cached base URL is still healthy
  if (activeBaseUrl) {
    const isHealthy = await verifyUrlHealth(activeBaseUrl);
    if (!isHealthy) {
      console.log(`[API Client] Cached active base URL ${activeBaseUrl} is stale/unreachable. Clearing cache.`);
      activeBaseUrl = null;
      await AsyncStorage.removeItem('@mygoscan:active_base_url').catch(() => {});
    }
  }

  // If we don't have a cached active base URL, perform quick parallel discovery
  if (!activeBaseUrl) {
    await discoverBaseUrl();
  }

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
      
      // Use 20s for chat queries to allow for LLM and Neptune API processing, and 2.5s for normal requests.
      const controller = new AbortController();
      const timeoutMs = endpoint.includes('chat') ? 20000 : 2500;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
          AsyncStorage.setItem('@mygoscan:active_base_url', baseUrl).catch(() => {});
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
          AsyncStorage.setItem('@mygoscan:active_base_url', baseUrl).catch(() => {});
        }
        
        return { success: false, error, statusCode };
      }
    } catch (err: any) {
      console.log(`[API Client] Failed connection to ${url}: ${err.message}`);
      lastErrorMsg = err.message || `Failed to connect to ${baseUrl}`;
      lastStatusCode = 0;
      
      // If the cached activeBaseUrl failed connection, clear it
      if (baseUrl === activeBaseUrl) {
        console.log(`[API Client] Cached active base URL ${activeBaseUrl} failed connection. Clearing cache.`);
        activeBaseUrl = null;
        AsyncStorage.removeItem('@mygoscan:active_base_url').catch(() => {});
      }
      // Loop continues to try other fallback base URLs
    }
  }

  return {
    success: false,
    error: `Network error: ${lastErrorMsg}. Tried ${urlsToTry.length} endpoints.`,
    statusCode: lastStatusCode,
  };
}

