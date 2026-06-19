import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Alert,
  Platform,
  TextInput,
  Modal,
  ScrollView,
  Linking,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as WebBrowser from 'expo-web-browser';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScannerOverlay } from './ScannerOverlay';
import { ScanHistoryCard } from './ScanHistoryCard';
import { ScanResult } from '../types';
import { submitScan, getScanHistory, clearScanHistory, updateSalesOrder, deleteScan } from '../api/api';

const LOCAL_SCANS_KEY = '@mygoscan:scans';

const ProfileIcon = ({ color }: { color: string }) => (
  <View style={{ width: 22, height: 22, justifyContent: 'center', alignItems: 'center' }}>
    {/* Head */}
    <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: color, marginBottom: 2 }} />
    {/* Body */}
    <View style={{ width: 14, height: 6, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderWidth: 2, borderColor: color, borderBottomWidth: 0 }} />
  </View>
);

// Local Helpers for Instant Mobile Side Parsing (0ms Latency)

function classifyCodeLocally(code: string, type: string): 'Barcode' | 'OCR Serial Number' | 'Web Link' | 'Text' {
  const codeStr = String(code).trim();
  const typeUpper = String(type).toUpperCase();

  // 1. Web Link
  if (/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(codeStr)) {
    return 'Web Link';
  }

  // 2. OCR Serial Number
  const isSerialFormat = ['CODE128', 'CODE39', 'CODE93', 'PDF417', 'DATA_MATRIX', 'AZTEC'].some(
    t => typeUpper.includes(t)
  );
  const isRetailNumeric = /^\d+$/.test(codeStr) && [6, 8, 12, 13].includes(codeStr.length);
  const isSerialPattern = /^[A-Z0-9\-_]{5,30}$/i.test(codeStr) && !isRetailNumeric;

  if (isSerialFormat || isSerialPattern || /^SN-/i.test(codeStr) || /^OCR/i.test(codeStr)) {
    return 'OCR Serial Number';
  }

  // 3. Barcode
  const isBarcodeType = [
    'EAN13', 'EAN8', 'UPC_A', 'UPC_E', 'CODE128', 'CODE39', 'CODE93',
    'ITF14', 'CODABAR', 'PDF417', 'AZTEC', 'DATA_MATRIX'
  ].some(t => typeUpper.includes(t));

  if (isBarcodeType) {
    return 'Barcode';
  }

  if (/^\d{8,14}$/.test(codeStr)) {
    return 'Barcode';
  }

  return 'Text';
}

function formatDigitalDateLocally(dateInput: string | Date): string {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      return new Date().toLocaleString();
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return new Date().toLocaleString();
  }
}

function extractDateFromCodeLocally(code: string): string | null {
  const codeStr = String(code).trim();

  // 1. YYYY-MM-DD or YYYY/MM/DD
  const pattern1 = /\b(\d{4})[-/](\d{2})[-/](\d{2})\b/;
  const match1 = codeStr.match(pattern1);
  if (match1) {
    return `${match1[3]}-${match1[2]}-${match1[1]}`;
  }

  // 2. DD-MM-YYYY or DD/MM/YYYY
  const pattern2 = /\b(\d{2})[-/](\d{2})[-/](\d{4})\b/;
  const match2 = codeStr.match(pattern2);
  if (match2) {
    return `${match2[1]}-${match2[2]}-${match2[3]}`;
  }

  // 3. Serialized YYYYMMDD
  const patternDigits8 = /\b(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/;
  const matchDigits8 = codeStr.match(patternDigits8);
  if (matchDigits8) {
    const year = matchDigits8[0].substring(0, 4);
    const month = matchDigits8[0].substring(4, 6);
    const day = matchDigits8[0].substring(6, 8);
    return `${day}-${month}-${year}`;
  }

  // 4. Serialized YYMMDD
  const patternDigits6 = /\b(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/;
  const matchDigits6 = codeStr.match(patternDigits6);
  if (matchDigits6) {
    const year = '20' + matchDigits6[1];
    const month = matchDigits6[2];
    const day = matchDigits6[3];
    return `${day}-${month}-${year}`;
  }

  return null;
}

function parseCodeDetailsLocally(code: string, type: string, classification: string): any {
  const codeStr = String(code).trim();
  const typeUpper = String(type).toUpperCase();
  const details: any = {
    length: codeStr.length,
    characterSet: /^[0-9]+$/.test(codeStr) ? 'Numeric' : /^[a-zA-Z]+$/.test(codeStr) ? 'Alphabetic' : 'Alphanumeric',
  };

  // 1. EAN-13 GS1 Country of Origin and Checksum Lookup
  if (typeUpper.includes('EAN13') || typeUpper.includes('EAN-13') || (/^\d{13}$/.test(codeStr))) {
    const prefix = codeStr.substring(0, 3);
    const prefixNum = parseInt(prefix, 10);
    let country = 'Unknown GS1 Prefix';

    if (prefix === '978' || prefix === '979') country = 'Bookland (ISBN)';
    else if (prefixNum >= 0 && prefixNum <= 19) country = 'United States & Canada';
    else if (prefixNum >= 30 && prefixNum <= 39) country = 'United States';
    else if (prefixNum >= 300 && prefixNum <= 379) country = 'France';
    else if (prefixNum >= 400 && prefixNum <= 440) country = 'Germany';
    else if (prefixNum >= 450 && prefixNum <= 459 || prefixNum >= 490 && prefixNum <= 499) country = 'Japan';
    else if (prefixNum >= 500 && prefixNum <= 509) country = 'United Kingdom';
    else if (prefixNum >= 690 && prefixNum <= 699) country = 'China';
    else if (prefixNum >= 890) country = 'India';
    else if (prefixNum >= 880) country = 'South Korea';
    else if (prefixNum >= 760 && prefixNum <= 769) country = 'Switzerland';
    else if (prefixNum >= 800 && prefixNum <= 839) country = 'Italy';
    else if (prefixNum >= 840 && prefixNum <= 849) country = 'Spain';

    details.countryOfOrigin = country;

    if (codeStr.length === 13) {
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        sum += parseInt(codeStr[i], 10) * (i % 2 === 0 ? 1 : 3);
      }
      const calculatedCheck = (10 - (sum % 10)) % 10;
      const actualCheck = parseInt(codeStr[12], 10);
      details.checkDigit = actualCheck;
      details.isCheckDigitValid = calculatedCheck === actualCheck;
    }
  }

  // 2. Web Link URL parsing
  if (classification === 'Web Link') {
    try {
      const match = codeStr.match(/^https?:\/\/([^/?#]+)([^?#]*)/i);
      if (match) {
        details.protocol = codeStr.startsWith('https') ? 'HTTPS' : 'HTTP';
        details.host = match[1];
        details.path = match[2] || '/';
      }
    } catch (e) {
      // Ignore
    }
  }

  // 3. OCR Serial Number components separation
  if (classification === 'OCR Serial Number') {
    const match = codeStr.match(/^([A-Z]+)[-_]([0-9A-Z]+)$/i);
    if (match) {
      details.serialPrefix = match[1].toUpperCase();
      details.serialBody = match[2];
    } else {
      const letters = codeStr.replace(/[^a-zA-Z]/g, '');
      const digits = codeStr.replace(/[^0-9]/g, '');
      if (letters) details.serialLetters = letters.toUpperCase();
      if (digits) details.serialDigits = digits;
    }
  }

  return details;
}

function generateRedirectUrlLocally(code: string, classification: string): string {
  const codeStr = String(code).trim();
  if (classification === 'Web Link') {
    return codeStr;
  } else if (classification === 'Barcode') {
    return `https://barcodesdatabase.org/barcode/${encodeURIComponent(codeStr)}`;
  } else {
    return `https://www.google.com/search?q=${encodeURIComponent(codeStr)}`;
  }
}


interface ScanScreenProps {
  profileName: string;
  profileEmail: string;
  theme: 'dark' | 'light';
  onOpenChat: (serialNumber: string, productName: string) => void;
  onOpenSettings: () => void;
}

export function ScanScreen({
  profileName,
  profileEmail,
  theme,
  onOpenChat,
  onOpenSettings,
}: ScanScreenProps) {
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);

  // Animation value for AskMe button
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  const askMeScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.04],
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<boolean>(false);

  // Toggle visibility of the scan activity logs list
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [multiScanMode, setMultiScanMode] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sessionScanCount, setSessionScanCount] = useState<number>(0);

  // Ref cache to store codes scanned in the current active camera session
  const sessionScannedCodesRef = React.useRef<Set<string>>(new Set());

  // Refs for synchronous checks to prevent duplicate scans on rapid camera frames
  const lastScannedCodeRef = React.useRef<string>('');
  const lastScannedTimeRef = React.useRef<number>(0);
  const isAlertShowingRef = React.useRef<boolean>(false);

  const [scans, setScans] = useState<ScanResult[]>([]);
  const [sessionScans, setSessionScans] = useState<ScanResult[]>([]);
  const [selectedScanIds, setSelectedScanIds] = useState<Set<string>>(new Set());
  const [createdSalesOrder, setCreatedSalesOrder] = useState<{
    salesOrderNumber: string;
    items: ScanResult[];
  } | null>(null);

  const isLoadedRef = React.useRef<boolean>(false);

  const saveScansToStorage = (updatedScans: ScanResult[]) => {
    // Handled automatically by useEffect hook for high performance
  };

  const syncScansList = async (listToSync: ScanResult[], silent = true) => {
    const pendingScansList = listToSync.filter((item) => item.status !== 'synced');
    if (pendingScansList.length === 0) {
      if (!silent) {
        Alert.alert('Synced', 'All scans are already synchronized.');
      }
      return;
    }

    setIsSyncing(true);
    let successCount = 0;
    let lastError = '';

    for (const scan of pendingScansList) {
      try {
        const response = await submitScan(scan.data, scan.type);
        if (response.success) {
          successCount++;
          const serverId = response.data?.scanId;
          setScans((prev) => {
            const updated = prev.map((item) =>
              item.id === scan.id
                ? ({
                  ...item,
                  id: serverId || item.id,
                  status: 'synced',
                  classification: response.data?.classification,
                  scannedDateFormatted: response.data?.scannedDateFormatted,
                  extractedDate: response.data?.extractedDate,
                  redirectUrl: response.data?.redirectUrl,
                  details: response.data?.details,
                } as ScanResult)
                : item
            );
            saveScansToStorage(updated);
            return updated;
          });
        } else {
          lastError = response.error || 'Unknown server rejection';
          setScans((prev) => {
            const updated = prev.map((item) =>
              item.id === scan.id ? ({ ...item, status: 'failed' } as ScanResult) : item
            );
            saveScansToStorage(updated);
            return updated;
          });
        }
      } catch (e: any) {
        lastError = e.message || 'Network error';
        setScans((prev) => {
          const updated = prev.map((item) =>
            item.id === scan.id ? ({ ...item, status: 'failed' } as ScanResult) : item
          );
          saveScansToStorage(updated);
          return updated;
        });
      }
    }

    setIsSyncing(false);
    if (!silent) {
      if (successCount === 0 && lastError) {
        Alert.alert(
          'Sync Failed',
          `Could not reach the database server:\n\n"${lastError}"\n\nTroubleshooting checklist:\n1. Ensure your phone is on the SAME Wi-Fi network as the PC.\n2. Ensure your PC's Wi-Fi network is NOT set to 'Public' profile.\n3. Make sure the backend server window is running on your PC.`
        );
      } else {
        Alert.alert('Sync complete', `Successfully synchronized ${successCount} scan(s).`);
      }
    }
  };

  React.useEffect(() => {
    // 1. Load scans from AsyncStorage immediately for instant offline load
    AsyncStorage.getItem(LOCAL_SCANS_KEY)
      .then((stored) => {
        if (stored) {
          const parsed = JSON.parse(stored);
          setScans(parsed);

          // Try syncing any pending local scans right away in the background
          syncScansList(parsed, true);

          // 2. Fetch latest scans from server and merge them
          getScanHistory()
            .then((response) => {
              if (response.success && response.data) {
                setScans((currentScans) => {
                  const serverScans = response.data || [];
                  const mergedMap = new Map<string, ScanResult>();

                  // First add all server scans (which are synced)
                  serverScans.forEach(s => {
                    mergedMap.set(s.id, { ...s, status: 'synced' });
                  });

                  // Add local scans (preserving any pending/failed states)
                  currentScans.forEach(s => {
                    if (!mergedMap.has(s.id)) {
                      mergedMap.set(s.id, s);
                    } else if (s.status !== 'synced') {
                      mergedMap.set(s.id, { ...s, status: 'synced' });
                    }
                  });

                  const mergedList = Array.from(mergedMap.values()).sort(
                    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                  );

                  // Update local storage with the merged results
                  AsyncStorage.setItem(LOCAL_SCANS_KEY, JSON.stringify(mergedList)).catch(e => {
                    console.warn('Failed to save merged scans to AsyncStorage:', e);
                  });

                  // Trigger silent background sync in case any local scans were merged back
                  syncScansList(mergedList, true);

                  return mergedList;
                });
              }
              isLoadedRef.current = true;
            })
            .catch((err) => {
              console.warn('Failed to load scan history from server:', err);
              isLoadedRef.current = true;
            });
        } else {
          // If no local scans exist, fetch from server directly
          getScanHistory()
            .then((response) => {
              if (response.success && response.data) {
                const serverScans = response.data || [];
                setScans(serverScans);
                AsyncStorage.setItem(LOCAL_SCANS_KEY, JSON.stringify(serverScans)).catch(e => {
                  console.warn('Failed to save scans to AsyncStorage:', e);
                });
              }
              isLoadedRef.current = true;
            })
            .catch((err) => {
              console.warn('Failed to load scan history from server:', err);
              isLoadedRef.current = true;
            });
        }
      })
      .catch((err) => {
        console.warn('Failed to load local scans from AsyncStorage:', err);
        isLoadedRef.current = true;
      });
  }, []);

  React.useEffect(() => {
    if (isLoadedRef.current) {
      AsyncStorage.setItem(LOCAL_SCANS_KEY, JSON.stringify(scans)).catch(e => {
        console.warn('Failed to save scans to AsyncStorage:', e);
      });
    }
  }, [scans]);

  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [lastScannedTime, setLastScannedTime] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [singleScanResult, setSingleScanResult] = useState<ScanResult | null>(null);
  const [selectedScanDetails, setSelectedScanDetails] = useState<ScanResult | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);

  const handleDownloadPDF = async (url: string) => {
    if (!url) return;
    setDownloadingPdf(true);
    try {
      let filename = 'downloaded_document.pdf';
      try {
        const urlParts = url.split('/');
        const lastPart = urlParts[urlParts.length - 1].split('?')[0];
        if (lastPart && lastPart.toLowerCase().endsWith('.pdf')) {
          filename = lastPart;
        } else if (lastPart) {
          filename = lastPart + (lastPart.includes('.') ? '' : '.pdf');
        }
      } catch (e) {
        // Fallback
      }

      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      const downloadResult = await FileSystem.downloadAsync(url, fileUri);

      if (downloadResult.status !== 200) {
        throw new Error(`Failed to download file: Status code ${downloadResult.status}`);
      }

      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (!isSharingAvailable) {
        Alert.alert('Unsupported', 'Sharing / saving files is not available on this device');
        return;
      }

      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Save / Share PDF File',
        UTI: 'com.adobe.pdf',
      });
    } catch (error: any) {
      console.error('PDF Download Error:', error);
      Alert.alert('Download Failed', error?.message || 'Could not download the file.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const totalScans = scans.length;
  const syncedScans = scans.filter((s) => s.status === 'synced').length;
  const pendingScans = scans.filter((s) => s.status === 'pending').length;
  const failedScans = scans.filter((s) => s.status === 'failed').length;

  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? '#090d16' : '#f8fafc',
    headerBg: isDark ? '#090d16' : '#f8fafc', // Seamless background matching the screen color
    cardBg: isDark ? '#131a26' : '#ffffff',
    text: isDark ? '#f8fafc' : '#0f172a',
    mutedText: isDark ? '#475569' : '#64748b',
    border: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)',
    logBg: isDark ? '#0c101b' : '#f1f5f9',
    logBorder: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)',
  };

  const getClassificationStyles = (classification?: string) => {
    switch (classification) {
      case 'Barcode':
        return {
          bg: isDark ? 'rgba(148, 163, 184, 0.12)' : '#e2e8f0',
          text: isDark ? '#cbd5e1' : '#475569',
        };
      case 'OCR Serial Number':
        return {
          bg: isDark ? 'rgba(255, 104, 44, 0.12)' : 'rgba(255, 104, 44, 0.15)',
          text: '#ff682c',
        };
      case 'Web Link':
        return {
          bg: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(14, 165, 233, 0.15)',
          text: isDark ? '#38bdf8' : '#0284c7',
        };
      default:
        return {
          bg: isDark ? 'rgba(100, 116, 139, 0.1)' : '#f1f5f9',
          text: '#64748b',
        };
    }
  };

  const saveAndSubmitScan = async (data: string, type: string) => {
    const classification = classifyCodeLocally(data, type);
    const scannedDateFormatted = formatDigitalDateLocally(new Date());
    const extractedDate = extractDateFromCodeLocally(data);
    let details = parseCodeDetailsLocally(data, type, classification);
    const redirectUrl = generateRedirectUrlLocally(data, classification);

    const newScan: ScanResult = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      data: data,
      type: type.toUpperCase(),
      timestamp: new Date().toISOString(),
      status: 'pending',
      classification,
      scannedDateFormatted,
      extractedDate,
      redirectUrl,
      details,
    };

    setScans((prev) => {
      const updated = [newScan, ...prev];
      saveScansToStorage(updated);
      return updated;
    });

    if (multiScanMode) {
      setSessionScans((prev) => [newScan, ...prev]);
    } else {
      setSingleScanResult(newScan);
      // Auto browser redirection removed to display scan result details first!
    }

    // Perform background DB logging and update status
    submitScan(newScan.data, newScan.type)
      .then((response) => {
        const nextStatus: 'synced' | 'failed' = response.success ? 'synced' : 'failed';
        const serverId = response.data?.scanId;
        const serverDetails = response.data?.details;
        const serverRedirectUrl = response.data?.redirectUrl;
        const serverClassification = response.data?.classification;

        setScans((prev) => {
          const updated: ScanResult[] = prev.map((item) =>
            item.id === newScan.id
              ? ({
                ...item,
                id: serverId || item.id,
                status: nextStatus,
                details: serverDetails || item.details,
                redirectUrl: serverRedirectUrl || item.redirectUrl,
                classification: serverClassification || item.classification,
              } as ScanResult)
              : item
          );
          saveScansToStorage(updated);
          return updated;
        });

        if (multiScanMode) {
          setSessionScans((prev) =>
            prev.map((item) =>
              item.id === newScan.id
                ? ({
                  ...item,
                  id: serverId || item.id,
                  status: nextStatus,
                  details: serverDetails || item.details,
                  redirectUrl: serverRedirectUrl || item.redirectUrl,
                  classification: serverClassification || item.classification,
                } as ScanResult)
                : item
            )
          );
        } else {
          setSingleScanResult((prev) => {
            if (prev && prev.id === newScan.id) {
              return {
                ...prev,
                id: serverId || prev.id,
                status: nextStatus,
                details: serverDetails || prev.details,
                redirectUrl: serverRedirectUrl || prev.redirectUrl,
                classification: serverClassification || prev.classification,
              };
            }
            return prev;
          });
        }
      })
      .catch((err) => {
        setScans((prev) => {
          const updated: ScanResult[] = prev.map((item) =>
            item.id === newScan.id ? ({ ...item, status: 'failed' } as ScanResult) : item
          );
          saveScansToStorage(updated);
          return updated;
        });
        if (multiScanMode) {
          setSessionScans((prev) =>
            prev.map((item) =>
              item.id === newScan.id ? ({ ...item, status: 'failed' } as ScanResult) : item
            )
          );
        }
      });
  };

  const handleBarcodeScanned = async (result: { type: string; data: string }) => {
    const { type, data } = result;
    const now = Date.now();

    // Prevent duplicate processing if a duplicate alert dialog is active
    if (isAlertShowingRef.current) {
      return;
    }

    if (multiScanMode) {
      // Prevent rapid duplicate scan of the exact same code in the *current* active camera frame session
      // (This avoids triggering the duplicate alert pop-up repeatedly on every frame)
      if (sessionScannedCodesRef.current.has(data)) {
        return;
      }
    } else {
      // Prevent duplicate scans of the SAME barcode within a 2-second cooldown window.
      // We check the refs synchronously since React state updates are asynchronous.
      if (data === lastScannedCodeRef.current && now - lastScannedTimeRef.current < 2000) {
        return;
      }
      lastScannedCodeRef.current = data;
      lastScannedTimeRef.current = now;
    }

    // Check if the barcode was already scanned (exists in historical list)
    const isDuplicate = scans.some((item) => item.data === data);
    if (isDuplicate) {
      isAlertShowingRef.current = true;

      // Pause camera feed in single mode to allow user to handle the popup
      if (!multiScanMode) {
        setIsCameraActive(false);
      }

      Alert.alert(
        'Duplicate Barcode Detected',
        `The barcode:\n"${data}"\nhas already been scanned.\n\nDo you want to save it anyway?`,
        [
          {
            text: 'Deny (Don\'t Save)',
            style: 'cancel',
            onPress: () => {
              isAlertShowingRef.current = false;
              // Reset duplicate tracker refs so camera can scan again
              lastScannedCodeRef.current = '';
              lastScannedTimeRef.current = 0;
            }
          },
          {
            text: 'Allow (Save Duplicate)',
            style: 'default',
            onPress: () => {
              isAlertShowingRef.current = false;

              if (multiScanMode) {
                sessionScannedCodesRef.current.add(data);
                const count = sessionScannedCodesRef.current.size;
                setSessionScanCount(count);
                setToastMessage(`Scanned ${type}: ${data} (#${count} in batch)`);
              } else {
                setLastScannedCode(data);
                setLastScannedTime(Date.now());
                setToastMessage('');
              }

              // Reset toast message after 2.2 seconds
              setTimeout(() => {
                setToastMessage('');
              }, 2200);

              saveAndSubmitScan(data, type);
            }
          }
        ],
        { cancelable: false }
      );
      return;
    }

    // Non-duplicate scanning path
    if (multiScanMode) {
      sessionScannedCodesRef.current.add(data);
      const count = sessionScannedCodesRef.current.size;
      setSessionScanCount(count);
      setToastMessage(`Scanned ${type}: ${data} (#${count} in batch)`);
    } else {
      setLastScannedCode(data);
      setLastScannedTime(now);
      setIsCameraActive(false);
      setToastMessage('');
    }

    // Reset toast message after 2.2 seconds
    setTimeout(() => {
      setToastMessage('');
    }, 2200);

    saveAndSubmitScan(data, type);
  };

  const handleToggleCamera = async () => {
    if (isCameraActive) {
      setIsCameraActive(false);
      lastScannedCodeRef.current = '';
      lastScannedTimeRef.current = 0;
      setLastScannedCode('');
      setLastScannedTime(0);
      return;
    }

    if (!permission || !permission.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          'Camera Permission Required',
          'Scan Hub needs camera access to read barcodes and serial numbers.'
        );
        return;
      }
    }

    // Reset single scan card and current batch session scans when opening camera
    setSingleScanResult(null);
    setSessionScans([]);
    sessionScannedCodesRef.current.clear();
    lastScannedCodeRef.current = '';
    lastScannedTimeRef.current = 0;
    setLastScannedCode('');
    setLastScannedTime(0);
    setSessionScanCount(0);
    setIsCameraActive(true);
  };

  const clearHistory = () => {
    Alert.alert('Clear History', 'Are you sure you want to clear all scans?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: () => {
          setScans([]);
          setSessionScans([]);
          sessionScannedCodesRef.current.clear();
          setSessionScanCount(0);
          AsyncStorage.removeItem(LOCAL_SCANS_KEY).catch((err) => {
            console.warn('Failed to clear AsyncStorage scans:', err);
          });
          clearScanHistory().catch((err) => {
            console.warn('Failed to clear database logs:', err);
          });
        },
      },
    ]);
  };

  const handleDeleteScan = (id: string) => {
    Alert.alert('Delete Scan Log', 'Are you sure you want to delete this scan?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const scan = scans.find((s) => s.id === id);

          setScans((prev) => {
            const updated = prev.filter((item) => item.id !== id);
            saveScansToStorage(updated);
            return updated;
          });
          setSessionScans((prev) => prev.filter((item) => item.id !== id));

          if (scan) {
            sessionScannedCodesRef.current.delete(scan.data);
            const count = sessionScannedCodesRef.current.size;
            setSessionScanCount(count);
          }

          setSelectedScanIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });

          deleteScan(id).catch((err) => {
            console.warn('Failed to delete scan from backend:', err);
          });
        },
      },
    ]);
  };

  const handleSyncAll = () => {
    syncScansList(scans, false);
  };

  const handleToggleSelectScan = (id: string) => {
    const scan = scans.find(s => s.id === id);
    if (scan && (scan.salesOrder || scan.classification === 'Web Link')) {
      return;
    }

    setSelectedScanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreateSalesOrder = async () => {
    if (selectedScanIds.size === 0) {
      Alert.alert('No Scans Selected', 'Please select at least one scan log to create a sales order.');
      return;
    }

    const firstDigit = 5;
    const restDigits = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    const salesOrderNumber = `${firstDigit}${restDigits}`;

    const selectedIdsArray = Array.from(selectedScanIds);
    // Get items for success screen before we clear the IDs
    const itemsForSuccess = scans.filter((s) => selectedScanIds.has(s.id));

    try {
      // 1. Submit to server
      const apiRes = await updateSalesOrder(selectedIdsArray, salesOrderNumber);
      if (!apiRes.success) {
        throw new Error(apiRes.error || 'Failed to update server.');
      }

      // 2. Update local state
      const updatedScans = scans.map((scan) => {
        if (selectedScanIds.has(scan.id)) {
          return {
            ...scan,
            salesOrder: salesOrderNumber,
          };
        }
        return scan;
      });

      setScans(updatedScans);
      saveScansToStorage(updatedScans);

      // 3. Clear selected set
      setSelectedScanIds(new Set());

      // Show success page
      setCreatedSalesOrder({
        salesOrderNumber,
        items: itemsForSuccess,
      });
    } catch (e: any) {
      Alert.alert(
        'Update Error',
        `Failed to sync sales order with server: ${e.message || 'Unknown error'}. Storing locally instead.`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Fallback to local update
              const updatedScans = scans.map((scan) => {
                if (selectedScanIds.has(scan.id)) {
                  return {
                    ...scan,
                    salesOrder: salesOrderNumber,
                  };
                }
                return scan;
              });

              setScans(updatedScans);
              saveScansToStorage(updatedScans);
              setSelectedScanIds(new Set());

              setCreatedSalesOrder({
                salesOrderNumber,
                items: itemsForSuccess,
              });
            }
          }
        ]
      );
    }
  };

  const handleLiveQuerySerial = async (scan: ScanResult) => {
    try {
      const apiRes = await submitScan(scan.data, scan.type);
      if (apiRes.success && apiRes.data) {
        const serverDetails = apiRes.data.details;
        const serverId = apiRes.data.scanId;
        const serverRedirectUrl = apiRes.data.redirectUrl;
        const serverClassification = apiRes.data.classification;

        const updatedScan: ScanResult = {
          ...scan,
          id: serverId || scan.id,
          details: serverDetails || scan.details,
          redirectUrl: serverRedirectUrl || scan.redirectUrl,
          classification: serverClassification || scan.classification,
          status: 'synced',
        };

        setScans((prev) => {
          const next = prev.map((s) => (s.id === scan.id ? updatedScan : s));
          saveScansToStorage(next);
          return next;
        });

        if (singleScanResult && singleScanResult.id === scan.id) {
          setSingleScanResult(updatedScan);
        }

        if (selectedScanDetails && selectedScanDetails.id === scan.id) {
          setSelectedScanDetails(updatedScan);
        }

        setSessionScans((prev) =>
          prev.map((s) => (s.id === scan.id ? updatedScan : s))
        );

        if (serverDetails && serverDetails.serialApiData) {
          const apiData = serverDetails.serialApiData;
          Alert.alert(
            'Database Lookup Successful',
            `Product: ${apiData.product}\nStatus: ${apiData.status}\nSold to Party: ${apiData.soldToParty}\nShip to Party: ${apiData.shipToParty}`
          );
        } else {
          Alert.alert('Lookup Succeeded', 'Serial queried, but no database records found.');
        }
      } else {
        Alert.alert('Lookup Failed', apiRes.error || 'The serial number could not be found.');
      }
    } catch (e: any) {
      Alert.alert('Network Error', e.message || 'Failed to connect to the database server.');
    }
  };

  const renderScanDetailsModal = () => {
    if (!selectedScanDetails) return null;
    return (
      <Modal
        visible={selectedScanDetails !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedScanDetails(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: isDark ? '#0c101b' : '#ffffff',
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Scanned Details</Text>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}
                onPress={() => setSelectedScanDetails(null)}
              >
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* General Info Table */}
              <Text style={[styles.sectionTitle, { color: colors.text }]}>General Properties</Text>
              <View style={[styles.detailsTable, { borderColor: colors.border }]}>
                <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                  <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Serial Number</Text>
                  <Text style={[styles.tableValue, { color: colors.text, fontWeight: '700' }]} selectable={true}>
                    {selectedScanDetails.data}
                  </Text>
                </View>
                <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                  <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Scanned Date & Time</Text>
                  <Text style={[styles.tableValue, { color: colors.text }]}>
                    {selectedScanDetails.scannedDateFormatted || new Date(selectedScanDetails.timestamp).toLocaleString()}
                  </Text>
                </View>
                {selectedScanDetails.salesOrder && (
                  <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                    <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Sales Order</Text>
                    <Text style={[styles.tableValue, { color: '#ff682c', fontWeight: '700' }]} selectable={true}>
                      🛒 {selectedScanDetails.salesOrder}
                    </Text>
                  </View>
                )}
              </View>

              {/* AI Scan Insights in Modal */}
              {selectedScanDetails.details?.geminiAnalysis && (
                <>
                  <Text style={[styles.sectionTitle, { color: '#ff682c', marginTop: 20 }]}>✨ AI Scan Insights</Text>
                  <View style={[
                    styles.detailsTable,
                    {
                      borderColor: colors.border,
                      padding: 14,
                      backgroundColor: isDark ? 'rgba(255, 104, 44, 0.05)' : 'rgba(255, 104, 44, 0.03)'
                    }
                  ]}>
                    <Text style={{ color: colors.text, fontSize: 13, lineHeight: 18, fontStyle: 'italic' }}>
                      "{selectedScanDetails.details.geminiAnalysis}"
                    </Text>
                  </View>
                </>
              )}

              {/* Live Serial API Details in Modal */}
              {selectedScanDetails.details?.serialApiData && (
                selectedScanDetails.details.serialApiData.notFound ? (
                  <>
                    <Text style={[styles.sectionTitle, { color: '#f43f5e', marginTop: 20 }]}>API Serial Database Details</Text>
                    <View style={{ backgroundColor: isDark ? 'rgba(244, 63, 94, 0.06)' : 'rgba(244, 63, 94, 0.05)', borderColor: 'rgba(244, 63, 94, 0.15)', borderWidth: 1, padding: 12, borderRadius: 12, marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 16, marginRight: 8 }}>⚠️</Text>
                      <Text style={{ color: '#f43f5e', fontWeight: '700', fontSize: 13, flex: 1 }}>
                        Serial number not found in SAP database.
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[styles.sectionTitle, { color: '#ff682c', marginTop: 20 }]}>API Serial Database Details</Text>
                    <View style={[styles.detailsTable, { borderColor: colors.border }]}>
                      <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                        <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Product</Text>
                        <Text style={[styles.tableValue, { color: colors.text, fontWeight: '700' }]}>{selectedScanDetails.details.serialApiData.product}</Text>
                      </View>
                      <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                        <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Status</Text>
                        <Text style={[styles.tableValue, { color: '#10b981', fontWeight: '700' }]}>{selectedScanDetails.details.serialApiData.status}</Text>
                      </View>
                      <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                        <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Sold to Party</Text>
                        <Text style={[styles.tableValue, { color: colors.text }]}>{selectedScanDetails.details.serialApiData.soldToParty}</Text>
                      </View>
                      <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                        <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Ship to Party</Text>
                        <Text style={[styles.tableValue, { color: colors.text }]}>{selectedScanDetails.details.serialApiData.shipToParty}</Text>
                      </View>
                    </View>
                  </>
                )
              )}



              {/* Actions Panel inside Modal */}
              <View style={styles.modalActionContainer}>
                {selectedScanDetails.classification === 'OCR Serial Number' ? (
                  <TouchableOpacity
                    style={styles.modalOpenLinkBtn}
                    onPress={() => handleLiveQuerySerial(selectedScanDetails)}
                  >
                    <Text style={styles.modalOpenLinkBtnText}>
                      {selectedScanDetails.details?.serialApiData
                        ? selectedScanDetails.details.serialApiData.notFound
                          ? '🔄 Retry Query Database'
                          : '🔄 Refresh Serial Database'
                        : '🔍 Query Serial Database'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  !!selectedScanDetails.redirectUrl && (
                    <View style={{ width: '100%' }}>
                      <TouchableOpacity
                        style={styles.modalOpenLinkBtn}
                        onPress={() => {
                          if (selectedScanDetails.redirectUrl) {
                            WebBrowser.openBrowserAsync(selectedScanDetails.redirectUrl).catch((err) => {
                              console.warn('Could not open in-app browser:', err);
                            });
                          }
                        }}
                      >
                        <Text style={styles.modalOpenLinkBtnText}>🔗 Open Lookup / Search Link</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalOpenLinkBtn, { marginTop: 8, backgroundColor: '#ff682c' }]}
                        disabled={downloadingPdf}
                        onPress={() => {
                          if (selectedScanDetails.redirectUrl) {
                            if (selectedScanDetails.redirectUrl.toLowerCase().includes('.pdf')) {
                              handleDownloadPDF(selectedScanDetails.redirectUrl);
                            } else {
                              Linking.openURL(selectedScanDetails.redirectUrl).catch((err) => {
                                console.warn('Could not open system browser:', err);
                              });
                            }
                          }
                        }}
                      >
                        {downloadingPdf && selectedScanDetails.redirectUrl.toLowerCase().includes('.pdf') ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.modalOpenLinkBtnText}>
                            {selectedScanDetails.redirectUrl.toLowerCase().includes('.pdf')
                              ? '📥 Download / Save PDF'
                              : '📥 Open in System Browser'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderSalesOrderSuccessScreen = () => {
    if (!createdSalesOrder) return null;

    return (
      <SafeAreaView style={[styles.successContainer, { backgroundColor: colors.bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.bg} />

        <ScrollView contentContainerStyle={styles.successScroll} showsVerticalScrollIndicator={false}>
          {/* Tick Mark Container */}
          <View style={styles.successIconOuter}>
            <View style={styles.successIconInner}>
              <Text style={styles.successCheckmark}>✓</Text>
            </View>
          </View>

          <Text style={[styles.successTitle, { color: colors.text }]}>Sales Order Created</Text>
          <Text style={[styles.successSubtitle, { color: colors.mutedText }]}>
            Your sales order has been generated and synced successfully.
          </Text>

          {/* Sales Order Number Panel */}
          <View style={[styles.successOrderBox, { backgroundColor: isDark ? '#131a26' : '#ffffff', borderColor: colors.border }]}>
            <Text style={styles.successOrderLabel}>SALES ORDER NUMBER</Text>
            <Text style={styles.successOrderVal}>🛒 {createdSalesOrder.salesOrderNumber}</Text>
          </View>

          {/* Included Items List */}
          <Text style={[styles.successSectionTitle, { color: colors.text }]}>
            Associated Scans ({createdSalesOrder.items.length})
          </Text>

          <View style={[styles.successTable, { borderColor: colors.border, backgroundColor: isDark ? '#131a26' : '#ffffff' }]}>
            {createdSalesOrder.items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.successTableRow,
                  { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                  index === createdSalesOrder.items.length - 1 && { borderBottomWidth: 0 }
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.successItemData, { color: '#ff682c' }]} numberOfLines={1}>
                    {item.details?.serialApiData?.product || 'Unknown Product'}
                  </Text>
                  <Text style={[styles.successItemType, { color: colors.text, marginTop: 4 }]} numberOfLines={1}>
                    {item.data}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Action Button */}
          <TouchableOpacity
            style={styles.successDoneBtn}
            onPress={() => setCreatedSalesOrder(null)}
          >
            <Text style={styles.successDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  };

  if (createdSalesOrder) {
    return renderSalesOrderSuccessScreen();
  }

  // ----------------------------------------------------
  // FULL SCREEN LOGS VIEW (If showLogs === true)
  // ----------------------------------------------------
  if (showLogs) {
    const filteredScans = scans.filter(
      (scan) =>
        scan.data.toLowerCase().includes(searchQuery.toLowerCase()) ||
        scan.type.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.bg} />

        {/* Full-Screen Log Header */}
        <View style={[styles.header, { backgroundColor: colors.headerBg, borderColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Scan Logs</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Sync All button removed for automatic sync */}
            <TouchableOpacity
              onPress={clearHistory}
              style={[styles.clearBtn, { marginRight: 12 }]}
            >
              <Text style={styles.clearBtnText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.backButton, { marginRight: 0 }, !isDark && { backgroundColor: '#e2e8f0', borderColor: 'rgba(0,0,0,0.06)' }]}
              onPress={() => {
                setSearchQuery('');
                setShowLogs(false);
              }}
            >
              <Text style={[styles.backButtonText, { color: colors.text }]}>← Back</Text>
            </TouchableOpacity>
          </View>
        </View>



        {/* Real-time search bar */}
        <View style={[styles.searchPanel, { borderBottomColor: colors.border }]}>
          <TextInput
            style={[
              styles.searchInput,
              {
                backgroundColor: isDark ? '#131a26' : '#e2e8f0',
                color: colors.text,
              }
            ]}
            placeholder="Search scans by barcode data..."
            placeholderTextColor={isDark ? '#475569' : '#94a3b8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* History List and Floating action button */}
        <View style={{ flex: 1, position: 'relative' }}>
          <FlatList
            data={filteredScans}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ScanHistoryCard
                item={item}
                theme={theme}
                selected={selectedScanIds.has(item.id)}
                onToggleSelect={() => handleToggleSelectScan(item.id)}
                onDelete={() => handleDeleteScan(item.id)}
                onPress={() => setSelectedScanDetails(item)}
                onPressLink={() => {
                  if (item.redirectUrl) {
                    WebBrowser.openBrowserAsync(item.redirectUrl).catch((err) => {
                      console.warn('Could not open in-app browser:', err);
                    });
                  }
                }}
              />
            )}
            contentContainerStyle={styles.listContent}
            style={[styles.fullHistoryList, { backgroundColor: colors.logBg }]}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                  {searchQuery ? 'No matching scans found' : 'No recent scans'}
                </Text>
                <Text style={[styles.emptySubtext, { color: isDark ? '#334155' : '#64748b' }]}>
                  {searchQuery ? 'Try a different search term.' : 'Activate the camera to record serial numbers.'}
                </Text>
              </View>
            }
          />

          <TouchableOpacity
            style={[
              styles.createSalesOrderBtn,
              {
                backgroundColor: selectedScanIds.size > 0 ? '#ff682c' : (isDark ? '#1e293b' : '#cbd5e1'),
                borderColor: selectedScanIds.size > 0 ? '#ff7f4d' : (isDark ? '#334155' : '#94a3b8'),
                opacity: selectedScanIds.size > 0 ? 1 : 0.6,
              }
            ]}
            disabled={selectedScanIds.size === 0}
            onPress={handleCreateSalesOrder}
          >
            <Text style={[
              styles.createSalesOrderBtnText,
              { color: selectedScanIds.size > 0 ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b') }
            ]}>
              🛒 Create Sales Order {selectedScanIds.size > 0 ? `(${selectedScanIds.size})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
        {renderScanDetailsModal()}
      </SafeAreaView>
    );
  }

  // ----------------------------------------------------
  // CAMERA SCANNER SCREEN VIEW (If showLogs === false)
  // ----------------------------------------------------
  return (
    <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.bg} />

      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>MyScanHub</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Animated.View style={{ transform: [{ scale: askMeScale }] }}>
            <TouchableOpacity
              style={[
                styles.headerButton,
                {
                  backgroundColor: '#ff682c',
                  borderColor: '#ff7f4d',
                  marginRight: 10,
                  flexDirection: 'row',
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 20,
                  shadowColor: '#ff682c',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 5,
                  elevation: 5,
                }
              ]}
              onPress={() => onOpenChat('', '')}
            >
              <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>🎧 Chat with Agent</Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={{
              justifyContent: 'center',
              alignItems: 'center',
              padding: 8,
              marginLeft: 4,
            }}
            onPress={onOpenSettings}
          >
            <ProfileIcon color="#ff682c" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Mini Stats Panel at Top */}
      <View style={[styles.statsPanel, { backgroundColor: colors.bg }]}>
        <View style={[styles.statBox, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.statVal, { color: colors.text }]}>{totalScans}</Text>
          <Text style={styles.statLbl}>Total</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.statVal, styles.syncedText]}>{syncedScans}</Text>
          <Text style={styles.statLbl}>Synced</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.statVal, styles.pendingText]}>{pendingScans}</Text>
          <Text style={styles.statLbl}>Pending</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.statVal, styles.failedText]}>{failedScans}</Text>
          <Text style={styles.statLbl}>Failed</Text>
        </View>
      </View>


      {/* Camera Viewport Container - grows dynamically when logs are hidden */}
      <View style={[styles.viewportContainer, styles.viewportContainerExpanded]}>
        {/* Active Mode Indicator Badge (Overlay on the viewport) */}
        <View style={[styles.cameraModeIndicator, { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.95)' }]}>
          <Text style={[styles.cameraModeIndicatorText, { color: '#ff682c' }]}>
            {multiScanMode ? '● MULTI' : '● SINGLE'}
          </Text>
        </View>

        {isCameraActive ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={flash}
              barcodeScannerSettings={{
                barcodeTypes: [
                  'qr',
                  'code128',
                  'ean13',
                  'ean8',
                  'upc_a',
                  'upc_e',
                  'code39',
                  'code93',
                  'pdf417',
                  'itf14',
                  'codabar',
                  'aztec',
                  'datamatrix',
                ],
              }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <ScannerOverlay
              flash={flash}
              onToggleFlash={() => setFlash(!flash)}
            />

            {/* Scanned Items HUD Overlay for Multi Scan Mode */}
            {multiScanMode && sessionScans.length > 0 && (
              <View style={styles.cameraScannedHud}>
                <View style={styles.hudHeader}>
                  <Text style={styles.hudCountText}>Scanned Batch: {sessionScans.length} item(s)</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hudScrollContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {sessionScans.map((item) => (
                    <View key={item.id} style={styles.hudItemBadge}>
                      <Text style={styles.hudItemText} numberOfLines={1}>{item.data}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Notification Toast */}
            {!!toastMessage && (
              <View style={styles.toastOverlay}>
                <Text style={styles.toastText}>✓ {toastMessage}</Text>
              </View>
            )}
          </>
        ) : (
          <View style={[styles.cameraBackground, { backgroundColor: isDark ? '#0b0f19' : '#f1f5f9' }]}>
            {singleScanResult ? (
              /* Premium Result Card View */
              <View style={[styles.resultCardContainer, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                {/* Top Right Close Button */}
                <TouchableOpacity
                  style={[styles.resultCloseBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}
                  onPress={() => setSingleScanResult(null)}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>✕</Text>
                </TouchableOpacity>

                <Text style={[styles.resultTitle, { color: colors.text }]}>Scan Result</Text>

                <View style={styles.resultDetails}>
                  <View style={styles.resultRow}>
                    <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Format:</Text>
                    <Text style={[styles.resultValue, { color: colors.text }]}>{singleScanResult.type}</Text>
                  </View>

                  {!!singleScanResult.classification && (
                    <View style={styles.resultRow}>
                      <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Category:</Text>
                      <View style={[styles.classBadge, { alignSelf: 'center', backgroundColor: getClassificationStyles(singleScanResult.classification).bg }]}>
                        <Text style={[styles.classBadgeText, { color: getClassificationStyles(singleScanResult.classification).text }]}>{singleScanResult.classification}</Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.resultRow}>
                    <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Data / Serial:</Text>
                    <Text style={[styles.resultValueData, { color: colors.text }]} numberOfLines={2}>{singleScanResult.data}</Text>
                  </View>

                  {!!singleScanResult.extractedDate && (
                    <View style={styles.resultRow}>
                      <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Embedded Date:</Text>
                      <Text style={[styles.resultValue, { color: '#10b981' }]}>📅 {singleScanResult.extractedDate}</Text>
                    </View>
                  )}

                  <View style={styles.resultRow}>
                    <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Scanned At:</Text>
                    <Text style={[styles.resultValue, { color: colors.text }]}>{singleScanResult.scannedDateFormatted || new Date(singleScanResult.timestamp).toLocaleString()}</Text>
                  </View>

                  {!!singleScanResult.salesOrder && (
                    <View style={styles.resultRow}>
                      <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Sales Order:</Text>
                      <Text style={[styles.resultValue, { color: '#ff682c', fontWeight: '700' }]}>🛒 {singleScanResult.salesOrder}</Text>
                    </View>
                  )}

                  {/* Metadata Intelligence Panel */}
                  {singleScanResult.details && (
                    Object.keys(singleScanResult.details).some(k => !['length', 'characterSet'].includes(k))
                  ) && (
                      <View style={[styles.resultIntelSection, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                        <Text style={[styles.resultIntelTitle, { color: colors.mutedText }]}>METADATA DETAILS</Text>
                        {singleScanResult.details.countryOfOrigin && (
                          <View style={styles.resultRow}>
                            <Text style={[styles.resultLabel, { color: colors.mutedText }]}>GS1 Origin:</Text>
                            <Text style={[styles.resultValue, { color: colors.text }]}>{singleScanResult.details.countryOfOrigin}</Text>
                          </View>
                        )}
                        {singleScanResult.details.isCheckDigitValid !== undefined && (
                          <View style={styles.resultRow}>
                            <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Checksum:</Text>
                            <Text style={[styles.resultValue, { color: singleScanResult.details.isCheckDigitValid ? '#10b981' : '#f43f5e', fontWeight: '700' }]}>
                              {singleScanResult.details.isCheckDigitValid ? '✓ Valid' : '✗ Invalid'}
                            </Text>
                          </View>
                        )}
                        {singleScanResult.details.host && (
                          <View style={styles.resultRow}>
                            <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Host Domain:</Text>
                            <Text style={[styles.resultValue, { color: '#38bdf8' }]} numberOfLines={1}>{singleScanResult.details.host}</Text>
                          </View>
                        )}
                        {singleScanResult.details.serialPrefix && (
                          <View style={styles.resultRow}>
                            <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Serial Prefix:</Text>
                            <Text style={[styles.resultValue, { color: '#ff682c' }]}>{singleScanResult.details.serialPrefix}</Text>
                          </View>
                        )}
                        {singleScanResult.details.serialBody && (
                          <View style={styles.resultRow}>
                            <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Serial Body:</Text>
                            <Text style={[styles.resultValue, { color: colors.text }]}>{singleScanResult.details.serialBody}</Text>
                          </View>
                        )}
                        {/* Live Serial API Details */}
                        {singleScanResult.details?.serialApiData && (
                          singleScanResult.details.serialApiData.notFound ? (
                            <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', paddingTop: 8 }}>
                              <Text style={[styles.resultIntelTitle, { color: '#f43f5e', marginBottom: 6 }]}>API SERIAL DATABASE DETAILS</Text>
                              <View style={{ backgroundColor: isDark ? 'rgba(244, 63, 94, 0.06)' : 'rgba(244, 63, 94, 0.05)', borderColor: 'rgba(244, 63, 94, 0.15)', borderWidth: 1, padding: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={{ fontSize: 14, marginRight: 6 }}>⚠️</Text>
                                <Text style={{ color: '#f43f5e', fontWeight: '700', fontSize: 12, flex: 1 }}>
                                  Serial number not found in SAP database.
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', paddingTop: 8 }}>
                              <Text style={[styles.resultIntelTitle, { color: '#ff682c', marginBottom: 6 }]}>API SERIAL DATABASE DETAILS</Text>
                              <View style={styles.resultRow}>
                                <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Product:</Text>
                                <Text style={[styles.resultValue, { color: colors.text, fontWeight: '700' }]}>{singleScanResult.details.serialApiData.product}</Text>
                              </View>
                              <View style={styles.resultRow}>
                                <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Status:</Text>
                                <Text style={[styles.resultValue, { color: '#10b981', fontWeight: '700' }]}>{singleScanResult.details.serialApiData.status}</Text>
                              </View>
                              <View style={styles.resultRow}>
                                <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Sold to Party:</Text>
                                <Text style={[styles.resultValue, { color: colors.text }]}>{singleScanResult.details.serialApiData.soldToParty}</Text>
                              </View>
                              <View style={styles.resultRow}>
                                <Text style={[styles.resultLabel, { color: colors.mutedText }]}>Ship to Party:</Text>
                                <Text style={[styles.resultValue, { color: colors.text }]}>{singleScanResult.details.serialApiData.shipToParty}</Text>
                              </View>
                            </View>
                          )
                        )}

                        {/* AI Scan Insights */}
                        {singleScanResult.details?.geminiAnalysis && (
                          <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', paddingTop: 8 }}>
                            <Text style={[styles.resultIntelTitle, { color: '#ff682c', marginBottom: 6 }]}>✨ AI SCAN INSIGHTS</Text>
                            <View style={{
                              backgroundColor: isDark ? 'rgba(255, 104, 44, 0.05)' : 'rgba(255, 104, 44, 0.03)',
                              padding: 10,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: isDark ? 'rgba(255, 104, 44, 0.15)' : 'rgba(255, 104, 44, 0.1)'
                            }}>
                              <Text style={{ color: colors.text, fontSize: 12, lineHeight: 16, fontStyle: 'italic' }}>
                                "{singleScanResult.details.geminiAnalysis}"
                              </Text>
                            </View>
                          </View>
                        )}


                      </View>
                    )}
                </View>

                {/* Main Link/Redirect Action Button */}
                {singleScanResult.classification === 'OCR Serial Number' ? (
                  <TouchableOpacity
                    style={styles.openLinkBtn}
                    onPress={() => handleLiveQuerySerial(singleScanResult)}
                  >
                    <Text style={styles.openLinkBtnText}>
                      {singleScanResult.details?.serialApiData
                        ? singleScanResult.details.serialApiData.notFound
                          ? '🔄 Retry Query Database'
                          : '🔄 Refresh Serial Database'
                        : '🔍 Query Serial Database'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  !!singleScanResult.redirectUrl && (
                    <View style={{ width: '100%' }}>
                      <TouchableOpacity
                        style={styles.openLinkBtn}
                        onPress={() => {
                          if (singleScanResult.redirectUrl) {
                            WebBrowser.openBrowserAsync(singleScanResult.redirectUrl).catch((err) => {
                              console.warn('Could not open in-app browser:', err);
                            });
                          }
                        }}
                      >
                        <Text style={styles.openLinkBtnText}>🔗 Open Lookup / Search Link</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.openLinkBtn, { marginTop: 8, backgroundColor: '#ff682c' }]}
                        disabled={downloadingPdf}
                        onPress={() => {
                          if (singleScanResult.redirectUrl) {
                            if (singleScanResult.redirectUrl.toLowerCase().includes('.pdf')) {
                              handleDownloadPDF(singleScanResult.redirectUrl);
                            } else {
                              Linking.openURL(singleScanResult.redirectUrl).catch((err) => {
                                console.warn('Could not open system browser:', err);
                              });
                            }
                          }
                        }}
                      >
                        {downloadingPdf && singleScanResult.redirectUrl.toLowerCase().includes('.pdf') ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.openLinkBtnText}>
                            {singleScanResult.redirectUrl.toLowerCase().includes('.pdf')
                              ? '📥 Download / Save PDF'
                              : '📥 Open in System Browser'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )
                )}

                {singleScanResult.classification === 'OCR Serial Number' && (
                  <TouchableOpacity
                    style={[styles.openLinkBtn, { marginTop: 10, backgroundColor: isDark ? '#1e293b' : '#cbd5e1', shadowColor: 'transparent' }]}
                    onPress={() => {
                      onOpenChat(singleScanResult.data, singleScanResult.details?.serialApiData?.product || 'Enterprise Device Frame V2');
                    }}
                  >
                    <Text style={[styles.openLinkBtnText, { color: isDark ? '#ffffff' : '#0f172a' }]}>
                      🤖 Ask Serial Search AI Assistant
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.scanAgainBtn}
                  onPress={() => {
                    setSingleScanResult(null);
                    handleToggleCamera();
                  }}
                >
                  <Text style={styles.scanAgainBtnText}>Scan Again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Camera Inactive Placeholder */
              <>
                <Text style={styles.scannerIcon}>📷</Text>
                <Text style={[styles.cameraSubtext, { color: isDark ? '#475569' : '#64748b' }]}>
                  Tap "Start Scanning" to open camera feed
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      {/* Scan Mode Toggle Panel */}
      <View style={[styles.modePanel, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <Text style={[styles.modeLabel, { color: colors.mutedText }]}>Scan Mode</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[styles.modeToggleGroup, { backgroundColor: isDark ? '#131a26' : '#e2e8f0' }]}>
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                multiScanMode && styles.modeToggleBtnActive,
              ]}
              onPress={() => {
                setMultiScanMode(true);
                sessionScannedCodesRef.current.clear();
                setSessionScanCount(0);
              }}
            >
              <Text style={[styles.modeToggleText, multiScanMode && styles.modeToggleTextActive]}>
                Multi
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                !multiScanMode && styles.modeToggleBtnActive,
              ]}
              onPress={() => {
                setMultiScanMode(false);
                sessionScannedCodesRef.current.clear();
                setSessionScanCount(0);
              }}
            >
              <Text style={[styles.modeToggleText, !multiScanMode && styles.modeToggleTextActive]}>
                Single
              </Text>
            </TouchableOpacity>
          </View>

          {/* Floating sync button removed for automatic sync */}
        </View>
      </View>

      {/* Primary Scanning Activation Buttons */}
      <View style={[styles.actionPanel, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.primaryScanBtn, isCameraActive && styles.stopBtn]}
          onPress={handleToggleCamera}
        >
          <Text style={styles.primaryScanBtnText}>
            {isCameraActive ? 'Stop Scanner' : 'Start Scanning'}
          </Text>
        </TouchableOpacity>



        <TouchableOpacity
          style={[
            styles.showLogsBtn,
            { marginTop: 10 },
            !isDark && { backgroundColor: '#ffffff', borderColor: 'rgba(0,0,0,0.08)' }
          ]}
          onPress={() => setShowLogs(true)}
        >
          <Text style={[styles.showLogsBtnText, !isDark && { color: '#0f172a' }]}>
            📄 See Logs ({totalScans})
          </Text>
        </TouchableOpacity>
      </View>
      {renderScanDetailsModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#131a26',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#131a26',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonActive: {
    backgroundColor: '#ff682c',
    borderColor: '#ffa07a',
  },
  headerButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  headerButtonTextActive: {
    color: '#ffffff',
  },
  statsPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    marginHorizontal: 4,
    borderWidth: 1,
  },
  statVal: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLbl: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  syncedText: {
    color: '#10b981',
  },
  pendingText: {
    color: '#f59e0b',
  },
  failedText: {
    color: '#f43f5e',
  },
  viewportContainer: {
    height: 280,
    position: 'relative',
    backgroundColor: '#020617',
    overflow: 'hidden',
  },
  viewportContainerExpanded: {
    flex: 1,
    height: undefined,
  },
  cameraBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  scannerIcon: {
    fontSize: 48,
    opacity: 0.12,
    marginBottom: 16,
  },
  cameraText: {
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: 13,
    marginBottom: 4,
  },
  cameraSubtext: {
    fontSize: 12,
  },
  toastOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: '#ff682c',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#ff682c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  toastText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  modePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  modeLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  modeToggleGroup: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 3,
  },
  modeToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  modeToggleBtnActive: {
    backgroundColor: '#ff682c',
  },
  modeToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  modeToggleTextActive: {
    color: '#ffffff',
  },
  actionPanel: {
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    paddingHorizontal: 20,
    flexDirection: 'column',
    alignItems: 'stretch',
    borderTopWidth: 1,
  },
  primaryScanBtn: {
    backgroundColor: '#ff682c',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#ff682c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  stopBtn: {
    backgroundColor: '#d84e1b',
    shadowColor: '#d84e1b',
  },
  primaryScanBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  syncBannerPanel: {
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  syncBannerBtn: {
    flexDirection: 'row',
    backgroundColor: '#ff682c',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff682c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  syncBannerBtnDisabled: {
    backgroundColor: '#cc5220',
  },
  syncSpinner: {
    marginRight: 8,
  },
  syncBannerBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  showLogsBtn: {
    backgroundColor: '#131a26',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  showLogsBtnText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 90,
    paddingTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 30,
    lineHeight: 18,
  },
  clearBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearBtnText: {
    color: '#f43f5e',
    fontSize: 13,
    fontWeight: '600',
  },
  searchPanel: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchInput: {
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  fullHistoryList: {
    flex: 1,
  },
  resultCardContainer: {
    width: '90%',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'stretch',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  resultDetails: {
    marginBottom: 20,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  resultValue: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  resultValueData: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  classBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  classBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  openLinkBtn: {
    backgroundColor: '#ff682c',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#ff682c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  openLinkBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  scanAgainBtn: {
    borderColor: '#ff682c',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  scanAgainBtnText: {
    color: '#ff682c',
    fontSize: 13,
    fontWeight: '700',
  },
  resultIntelSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  resultIntelTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '85%',
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScroll: {
    paddingBottom: 20,
  },
  detailBlock: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  detailBlockLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  detailBlockData: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  detailsTable: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  tableLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  tableValue: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  modalActionContainer: {
    marginTop: 20,
  },
  modalOpenLinkBtn: {
    backgroundColor: '#ff682c',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#ff682c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  modalOpenLinkBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  resultCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  cameraModeIndicator: {
    position: 'absolute',
    top: 16,
    left: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 104, 44, 0.3)',
    zIndex: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  cameraModeIndicatorText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  batchCardContainer: {
    width: '90%',
    height: '90%',
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  batchTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  batchCloseBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  batchScrollList: {
    flex: 1,
  },
  batchListContent: {
    paddingBottom: 8,
  },
  batchItemRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  batchItemBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginRight: 8,
  },
  batchItemBadgeText: {
    fontSize: 8,
    fontWeight: '800',
  },
  batchItemDateText: {
    fontSize: 10,
    color: '#10b981',
    fontWeight: '600',
  },
  batchItemValueText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  miniSyncBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#ff682c',
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniSyncBtnDisabled: {
    backgroundColor: 'rgba(255, 104, 44, 0.4)',
  },
  miniSyncText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  createSalesOrderBtn: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createSalesOrderBtnText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  successContainer: {
    flex: 1,
  },
  successScroll: {
    paddingHorizontal: 24,
    paddingVertical: 40,
    alignItems: 'center',
  },
  successIconOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successIconInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  successCheckmark: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  successSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  successOrderBox: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  successOrderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ff682c',
    letterSpacing: 1,
    marginBottom: 8,
  },
  successOrderVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ff682c',
  },
  successSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    alignSelf: 'flex-start',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  successTable: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 40,
  },
  successTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
  successItemData: {
    fontSize: 14,
    fontWeight: '600',
  },
  successItemType: {
    fontSize: 11,
    fontWeight: '600',
  },
  successItemProduct: {
    fontSize: 11,
    marginLeft: 6,
    fontWeight: '600',
  },
  successDoneBtn: {
    backgroundColor: '#ff682c',
    paddingVertical: 14,
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#ff682c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  successDoneBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  cameraScannedHud: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(9, 13, 22, 0.85)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  hudHeader: {
    marginBottom: 8,
  },
  hudCountText: {
    color: '#ff682c',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  hudScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  hudItemBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    maxWidth: 150,
  },
  hudItemText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '700',
  },
});
