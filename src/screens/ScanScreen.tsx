import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as WebBrowser from 'expo-web-browser';
import { ScannerOverlay } from './ScannerOverlay';
import { ScanHistoryCard } from './ScanHistoryCard';
import { ScanResult } from '../types';
import { submitScan, getScanHistory, clearScanHistory } from '../api/api';

// Local Helpers for Instant Mobile Side Parsing (0ms Latency)

function classifyCodeLocally(code: string, type: string): 'Barcode' | 'OCR Serial Number' | 'Web Link' | 'Text' {
  const codeStr = String(code).trim();
  const typeUpper = String(type).toUpperCase();

  // 1. Web Link
  if (/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(codeStr)) {
    return 'Web Link';
  }

  // 2. Barcode
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

  // 3. OCR Serial Number
  const isSerialPattern = /^[A-Z0-9\-_]{5,30}$/i.test(codeStr) &&
    (/[A-Z]/i.test(codeStr) && /[0-9]/.test(codeStr) || codeStr.includes('-') || codeStr.includes('_'));

  if (isSerialPattern || /^SN-/i.test(codeStr) || /^OCR/i.test(codeStr)) {
    return 'OCR Serial Number';
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
  onOpenSettings: () => void;
}

export function ScanScreen({
  profileName,
  profileEmail,
  theme,
  onOpenSettings,
}: ScanScreenProps) {
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
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

  const [scans, setScans] = useState<ScanResult[]>([]);
  const [sessionScans, setSessionScans] = useState<ScanResult[]>([]);

  React.useEffect(() => {
    getScanHistory()
      .then((response) => {
        if (response.success && response.data) {
          setScans(response.data);
        }
      })
      .catch((err) => {
        console.warn('Failed to load scan history:', err);
      });
  }, []);

  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [lastScannedTime, setLastScannedTime] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [singleScanResult, setSingleScanResult] = useState<ScanResult | null>(null);
  const [selectedScanDetails, setSelectedScanDetails] = useState<ScanResult | null>(null);

  const totalScans = scans.length;
  const syncedScans = scans.filter((s) => s.status === 'synced').length;
  const pendingScans = scans.filter((s) => s.status === 'pending').length;
  const failedScans = scans.filter((s) => s.status === 'failed').length;

  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? '#090d16' : '#f8fafc',
    headerBg: isDark ? '#090d16' : '#ffffff',
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

  const handleBarcodeScanned = async (result: { type: string; data: string }) => {
    const { type, data } = result;
    const now = Date.now();

    if (multiScanMode) {
      // Prevent duplicates in the current active camera session.
      if (sessionScannedCodesRef.current.has(data)) {
        return;
      }
      sessionScannedCodesRef.current.add(data);
      const count = sessionScannedCodesRef.current.size;
      setSessionScanCount(count);

      setToastMessage(`Scanned ${type}: ${data} (#${count} in batch)`);
    } else {
      // Prevent duplicate scans of the SAME barcode within a 2-second cooldown window.
      // We check the refs synchronously since React state updates are asynchronous.
      if (data === lastScannedCodeRef.current && now - lastScannedTimeRef.current < 2000) {
        return;
      }
      lastScannedCodeRef.current = data;
      lastScannedTimeRef.current = now;

      // Update state for rendering/history
      setLastScannedCode(data);
      setLastScannedTime(now);

      // Stop camera feed immediately in single scan mode
      setIsCameraActive(false);
      setToastMessage('');
    }

    // Reset toast message after 2.2 seconds
    const timer = setTimeout(() => {
      setToastMessage('');
    }, 2200);

    const classification = classifyCodeLocally(data, type);
    const scannedDateFormatted = formatDigitalDateLocally(new Date());
    const extractedDate = extractDateFromCodeLocally(data);
    const details = parseCodeDetailsLocally(data, type, classification);
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

    setScans((prev) => [newScan, ...prev]);

    if (multiScanMode) {
      setSessionScans((prev) => [newScan, ...prev]);
    } else {
      setSingleScanResult(newScan);
      if (newScan.redirectUrl) {
        WebBrowser.openBrowserAsync(newScan.redirectUrl).catch((err) => {
          console.warn('Could not open in-app browser:', err);
        });
      }
    }

    // Perform background DB logging and update status
    submitScan(newScan.data, newScan.type)
      .then((response) => {
        const nextStatus = response.success ? 'synced' : 'failed';
        setScans((prev) =>
          prev.map((item) =>
            item.id === newScan.id ? { ...item, status: nextStatus } : item
          )
        );
        if (multiScanMode) {
          setSessionScans((prev) =>
            prev.map((item) =>
              item.id === newScan.id ? { ...item, status: nextStatus } : item
            )
          );
        }
      })
      .catch((err) => {
        setScans((prev) =>
          prev.map((item) =>
            item.id === newScan.id ? { ...item, status: 'failed' } : item
          )
        );
        if (multiScanMode) {
          setSessionScans((prev) =>
            prev.map((item) =>
              item.id === newScan.id ? { ...item, status: 'failed' } : item
            )
          );
        }
      });
  };

  const handleToggleCamera = async () => {
    if (isCameraActive) {
      setIsCameraActive(false);
      lastScannedCodeRef.current = '';
      lastScannedTimeRef.current = 0;
      setLastScannedCode('');
      setLastScannedTime(0);

      if (multiScanMode && sessionScans.length > 0) {
        const count = sessionScans.length;
        Alert.alert(
          'Scan Complete',
          `${count} barcode${count === 1 ? ' has' : 's have'} been scanned.`
        );
      }
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

  const handleSyncAll = async () => {
    const pendingScansList = scans.filter((item) => item.status !== 'synced');
    if (pendingScansList.length === 0) {
      Alert.alert('Synced', 'All scans are already synchronized.');
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
          setScans((prev) =>
            prev.map((item) =>
              item.id === scan.id
                ? {
                  ...item,
                  status: 'synced',
                  classification: response.data?.classification,
                  scannedDateFormatted: response.data?.scannedDateFormatted,
                  extractedDate: response.data?.extractedDate,
                  redirectUrl: response.data?.redirectUrl,
                  details: response.data?.details,
                }
                : item
            )
          );
        } else {
          lastError = response.error || 'Unknown server rejection';
        }
      } catch (e: any) {
        lastError = e.message || 'Network error';
      }
    }

    setIsSyncing(false);
    if (successCount === 0 && lastError) {
      Alert.alert(
        'Sync Failed',
        `Could not reach the database server:\n\n"${lastError}"\n\nTroubleshooting checklist:\n1. Ensure your phone is on the SAME Wi-Fi network as the PC.\n2. Ensure your PC's Wi-Fi network is NOT set to 'Public' profile.\n3. Make sure the backend server window is running on your PC.`
      );
    } else {
      Alert.alert('Sync complete', `Successfully synchronized ${successCount} scan(s).`);
    }
  };

  const clearHistory = () => {
    Alert.alert('Clear History', 'Are you sure you want to clear all scans?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: () => {
          setScans([]);
          clearScanHistory().catch((err) => {
            console.warn('Failed to clear database logs:', err);
          });
        }
      },
    ]);
  };

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
            {scans.length > 0 && (
              <TouchableOpacity onPress={clearHistory} style={[styles.clearBtn, { marginRight: 12 }]}>
                <Text style={styles.clearBtnText}>Clear All</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.backButton, { marginRight: 0 }, !isDark && { backgroundColor: '#e2e8f0', borderColor: 'rgba(0,0,0,0.06)' }]}
              onPress={() => {
                setSearchQuery('');
                setShowLogs(false);
              }}
            >
              <Text style={[styles.backButtonText, { color: colors.text }]}>Back →</Text>
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

        {/* History List */}
        <FlatList
          data={filteredScans}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ScanHistoryCard
              item={item}
              theme={theme}
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>MyGo Scan</Text>
        <View style={styles.headerActionRow}>
          {isCameraActive && (
            <TouchableOpacity
              style={[
                styles.headerButton,
                flash && styles.headerButtonActive,
                !isDark && !flash && { backgroundColor: '#e2e8f0', borderColor: 'rgba(0,0,0,0.06)' },
              ]}
              onPress={() => setFlash(!flash)}
            >
              <Text style={[styles.headerButtonText, flash && styles.headerButtonTextActive]}>
                {flash ? '🔦 On' : '🔦 Off'}
              </Text>
            </TouchableOpacity>
          )}
          {/* Settings Symbol Trigger */}
          <TouchableOpacity
            style={[
              styles.headerButton,
              { marginLeft: 8 },
              !isDark && { backgroundColor: '#e2e8f0', borderColor: 'rgba(0,0,0,0.06)' },
            ]}
            onPress={onOpenSettings}
          >
            <Text style={[styles.headerButtonText, !isDark && { color: '#0f172a' }]}>⚙️</Text>
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
            {multiScanMode ? '● MULTI MODE ACTIVE' : '● SINGLE MODE ACTIVE'}
          </Text>
        </View>

        {isCameraActive ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={flash}
            barcodeScannerSettings={{
              barcodeTypes: [
                'qr',
                'code128',
                'ean13',
                'upc_a',
                'upc_e',
                'code39',
                'pdf417',
                'itf14',
                'codabar',
                'aztec',
              ],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          >
            <ScannerOverlay />

            {/* Notification Toast */}
            {!!toastMessage && (
              <View style={styles.toastOverlay}>
                <Text style={styles.toastText}>✓ {toastMessage}</Text>
              </View>
            )}
          </CameraView>
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
                      </View>
                    )}
                </View>

                {/* Main Link/Redirect Action Button */}
                {!!singleScanResult.redirectUrl && (
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
            ) : (sessionScans.length > 0) ? (
              /* Premium Batch Results List View */
              <View style={[styles.batchCardContainer, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                {/* Header Row */}
                <View style={styles.batchHeader}>
                  <Text style={[styles.batchTitle, { color: colors.text }]}>
                    Batch Results ({sessionScans.length})
                  </Text>
                  <TouchableOpacity
                    style={[styles.batchCloseBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}
                    onPress={() => {
                      setSessionScans([]);
                      sessionScannedCodesRef.current.clear();
                      setSessionScanCount(0);
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 11 }}>✕ Reset</Text>
                  </TouchableOpacity>
                </View>

                {/* Scanned Barcodes List */}
                <FlatList
                  data={sessionScans}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.batchListContent}
                  style={styles.batchScrollList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.batchItemRow,
                        { borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' }
                      ]}
                      onPress={() => setSelectedScanDetails(item)}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={[styles.batchItemBadge, { backgroundColor: getClassificationStyles(item.classification).bg }]}>
                            <Text style={[styles.batchItemBadgeText, { color: getClassificationStyles(item.classification).text }]}>
                              {item.type}
                            </Text>
                          </View>
                          {!!item.extractedDate && (
                            <Text style={styles.batchItemDateText}>📅 {item.extractedDate}</Text>
                          )}
                        </View>
                        {item.redirectUrl ? (
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              if (item.redirectUrl) {
                                WebBrowser.openBrowserAsync(item.redirectUrl).catch((err) => {
                                  console.warn('Could not open in-app browser:', err);
                                });
                              }
                            }}
                            style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
                          >
                            <Text style={[styles.batchItemValueText, { color: isDark ? '#38bdf8' : '#0284c7', textDecorationLine: 'underline' }]} numberOfLines={1}>
                              🔗 {item.data}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={[styles.batchItemValueText, { color: colors.text }]} numberOfLines={1}>
                            {item.data}
                          </Text>
                        )}
                      </View>
                      <Text style={{ color: '#ff682c', fontSize: 12, fontWeight: '700' }}>📄 Details →</Text>
                    </TouchableOpacity>
                  )}
                />
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

      {/* Scan Details Modal */}
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

            {selectedScanDetails && (
              <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* Main Data View */}
                <View style={[styles.detailBlock, { backgroundColor: isDark ? '#131a26' : '#f8fafc', borderColor: colors.border }]}>
                  <Text style={[styles.detailBlockLabel, { color: colors.mutedText }]}>SCANNED CODE</Text>
                  <Text style={[styles.detailBlockData, { color: colors.text }]} selectable={true}>
                    {selectedScanDetails.data}
                  </Text>
                </View>

                {/* General Info Table */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>General Properties</Text>
                <View style={[styles.detailsTable, { borderColor: colors.border }]}>
                  <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                    <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Format</Text>
                    <Text style={[styles.tableValue, { color: colors.text }]}>{selectedScanDetails.type}</Text>
                  </View>
                  {selectedScanDetails.classification && (
                    <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                      <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Classification</Text>
                      <View style={[styles.classBadge, { backgroundColor: getClassificationStyles(selectedScanDetails.classification).bg }]}>
                        <Text style={[styles.classBadgeText, { color: getClassificationStyles(selectedScanDetails.classification).text }]}>
                          {selectedScanDetails.classification}
                        </Text>
                      </View>
                    </View>
                  )}
                  <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                    <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Scanned Date</Text>
                    <Text style={[styles.tableValue, { color: colors.text }]}>
                      {selectedScanDetails.scannedDateFormatted || new Date(selectedScanDetails.timestamp).toLocaleString()}
                    </Text>
                  </View>
                  {selectedScanDetails.extractedDate && (
                    <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                      <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Embedded Date</Text>
                      <Text style={[styles.tableValue, { color: '#10b981', fontWeight: '700' }]}>
                        📅 {selectedScanDetails.extractedDate}
                      </Text>
                    </View>
                  )}
                  {selectedScanDetails.details?.length !== undefined && (
                    <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                      <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Character Count</Text>
                      <Text style={[styles.tableValue, { color: colors.text }]}>{selectedScanDetails.details.length} chars</Text>
                    </View>
                  )}
                  {selectedScanDetails.details?.characterSet && (
                    <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                      <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Character Set</Text>
                      <Text style={[styles.tableValue, { color: colors.text }]}>{selectedScanDetails.details.characterSet}</Text>
                    </View>
                  )}
                </View>

                {/* Rich Parsed Details */}
                {selectedScanDetails.details && (
                  Object.keys(selectedScanDetails.details).some(k => !['length', 'characterSet'].includes(k))
                ) && (
                    <>
                      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Parsed Intelligence</Text>
                      <View style={[styles.detailsTable, { borderColor: colors.border }]}>
                        {selectedScanDetails.details.countryOfOrigin && (
                          <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                            <Text style={[styles.tableLabel, { color: colors.mutedText }]}>GS1 Country of Origin</Text>
                            <Text style={[styles.tableValue, { color: colors.text, fontWeight: '700' }]}>
                              {selectedScanDetails.details.countryOfOrigin}
                            </Text>
                          </View>
                        )}
                        {selectedScanDetails.details.checkDigit !== undefined && (
                          <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                            <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Check Digit</Text>
                            <Text style={[styles.tableValue, { color: colors.text }]}>
                              {selectedScanDetails.details.checkDigit}
                            </Text>
                          </View>
                        )}
                        {selectedScanDetails.details.isCheckDigitValid !== undefined && (
                          <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                            <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Checksum Verification</Text>
                            <Text style={[styles.tableValue, { color: selectedScanDetails.details.isCheckDigitValid ? '#10b981' : '#f43f5e', fontWeight: '700' }]}>
                              {selectedScanDetails.details.isCheckDigitValid ? '✓ Valid Checksum' : '✗ Invalid Checksum'}
                            </Text>
                          </View>
                        )}
                        {selectedScanDetails.details.protocol && (
                          <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                            <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Protocol</Text>
                            <Text style={[styles.tableValue, { color: '#38bdf8', fontWeight: '700' }]}>
                              {selectedScanDetails.details.protocol}
                            </Text>
                          </View>
                        )}
                        {selectedScanDetails.details.host && (
                          <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                            <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Host Domain</Text>
                            <Text style={[styles.tableValue, { color: colors.text }]} numberOfLines={1}>
                              {selectedScanDetails.details.host}
                            </Text>
                          </View>
                        )}
                        {selectedScanDetails.details.path && (
                          <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                            <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Path</Text>
                            <Text style={[styles.tableValue, { color: colors.text }]} numberOfLines={1}>
                              {selectedScanDetails.details.path}
                            </Text>
                          </View>
                        )}
                        {selectedScanDetails.details.serialPrefix && (
                          <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                            <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Serial Prefix</Text>
                            <Text style={[styles.tableValue, { color: '#ff682c', fontWeight: '700' }]}>
                              {selectedScanDetails.details.serialPrefix}
                            </Text>
                          </View>
                        )}
                        {selectedScanDetails.details.serialBody && (
                          <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                            <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Serial Body</Text>
                            <Text style={[styles.tableValue, { color: colors.text, fontWeight: '700' }]}>
                              {selectedScanDetails.details.serialBody}
                            </Text>
                          </View>
                        )}
                        {selectedScanDetails.details.serialLetters && (
                          <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                            <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Serial Letters</Text>
                            <Text style={[styles.tableValue, { color: '#ff682c', fontWeight: '700' }]}>
                              {selectedScanDetails.details.serialLetters}
                            </Text>
                          </View>
                        )}
                        {selectedScanDetails.details.serialDigits && (
                          <View style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                            <Text style={[styles.tableLabel, { color: colors.mutedText }]}>Serial Digits</Text>
                            <Text style={[styles.tableValue, { color: colors.text, fontWeight: '700' }]}>
                              {selectedScanDetails.details.serialDigits}
                            </Text>
                          </View>
                        )}
                      </View>
                    </>
                  )}

                {/* Actions Panel inside Modal */}
                <View style={styles.modalActionContainer}>
                  {!!selectedScanDetails.redirectUrl && (
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
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
    paddingBottom: 24,
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
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
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
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
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
});
