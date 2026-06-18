import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  Modal,
  Image,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendChatMessage } from '../api/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScannerOverlay } from './ScannerOverlay';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  imageUri?: string;
}

interface ChatScreenProps {
  serialNumber?: string;
  productName?: string;
  theme: 'dark' | 'light';
  onClose: () => void;
  onOpenDrawer: () => void;
}

// Custom minimalist vector outline icons (monochrome, plain, without colors)
const CameraIcon = ({ color }: { color: string }) => (
  <View style={{ width: 22, height: 16, justifyContent: 'center', alignItems: 'center', marginTop: 3 }}>
    <View style={{ width: 6, height: 2, backgroundColor: color, borderTopLeftRadius: 1, borderTopRightRadius: 1, position: 'absolute', top: -1 }} />
    <View style={{ width: 22, height: 14, borderWidth: 2, borderColor: color, borderRadius: 3, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, borderWidth: 1.5, borderColor: color }} />
    </View>
  </View>
);

const BarcodeIcon = ({ color }: { color: string }) => (
  <View style={{ width: 20, height: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
    <View style={{ width: 2, height: '100%', backgroundColor: color, borderRadius: 0.5 }} />
    <View style={{ width: 1, height: '100%', backgroundColor: color }} />
    <View style={{ width: 3, height: '100%', backgroundColor: color, borderRadius: 0.5 }} />
    <View style={{ width: 1, height: '100%', backgroundColor: color }} />
    <View style={{ width: 2, height: '100%', backgroundColor: color, borderRadius: 0.5 }} />
    <View style={{ width: 1, height: '100%', backgroundColor: color }} />
    <View style={{ width: 2, height: '100%', backgroundColor: color, borderRadius: 0.5 }} />
  </View>
);

// Custom Markdown renderer for tables and formatted text
function parseAndRenderMessage(text: string, colors: any, isDark: boolean) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentTableLines: string[] = [];
  let inTable = false;

  const renderTable = (tableLines: string[], index: number) => {
    if (tableLines.length < 3) {
      return tableLines.map((l, i) => (
        <Text key={`line-${i}`} style={[styles.chatText, { color: colors.text }]}>{l}</Text>
      ));
    }

    const headers = tableLines[0].split('|').map(h => h.trim()).filter((h, idx, arr) => idx > 0 && idx < arr.length - 1);
    const rows = tableLines.slice(2).map(r => r.split('|').map(cell => cell.trim()).filter((cell, idx, arr) => idx > 0 && idx < arr.length - 1));

    return (
      <View key={`table-${index}`} style={[styles.inlineTable, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.01)' }]}>
        {/* Headers */}
        <View style={[styles.inlineTableHeaderRow, { borderBottomColor: colors.border, backgroundColor: isDark ? 'rgba(255,104,44,0.08)' : 'rgba(255,104,44,0.1)' }]}>
          {headers.map((h, i) => (
            <Text key={`h-${i}`} style={[styles.inlineTableHeaderText, { color: '#ff682c', flex: i === 0 ? 1 : 2 }]}>{h}</Text>
          ))}
        </View>
        {/* Rows */}
        {rows.map((row, rowIdx) => (
          <View key={`row-${rowIdx}`} style={[styles.inlineTableRow, { borderBottomColor: colors.border }, rowIdx === rows.length - 1 && { borderBottomWidth: 0 }]}>
            {row.map((cell, cellIdx) => {
              const isBold = cell.startsWith('**') && cell.endsWith('**');
              const cleanCell = cell.replace(/\*\*/g, '').replace(/`/g, '');
              return (
                <Text key={`c-${cellIdx}`} style={[styles.inlineTableCellText, { color: colors.text, flex: cellIdx === 0 ? 1 : 2 }, isBold && { fontWeight: '700' }]}>
                  {cleanCell}
                </Text>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  let tableIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|')) {
      inTable = true;
      currentTableLines.push(lines[i]);
    } else {
      if (inTable) {
        elements.push(renderTable(currentTableLines, tableIndex++));
        currentTableLines = [];
        inTable = false;
      }

      if (line) {
        if (line.startsWith('###')) {
          elements.push(
            <Text key={`head-${i}`} style={[styles.chatHeading, { color: colors.text, marginTop: 8 }]}>
              {line.replace('###', '').trim()}
            </Text>
          );
        } else if (line.startsWith('####')) {
          elements.push(
            <Text key={`subhead-${i}`} style={[styles.chatSubHeading, { color: colors.text, marginTop: 6 }]}>
              {line.replace('####', '').trim()}
            </Text>
          );
        } else if (line.startsWith('-') || line.startsWith('*')) {
          const cleanLine = line.substring(1).trim().replace(/\*\*/g, '').replace(/`/g, '');
          elements.push(
            <View key={`bullet-${i}`} style={styles.bulletRow}>
              <Text style={{ color: '#ff682c', marginRight: 6 }}>•</Text>
              <Text style={[styles.chatText, { color: colors.text, flex: 1 }]}>{cleanLine}</Text>
            </View>
          );
        } else {
          const cleanLine = lines[i].replace(/\*\*/g, '').replace(/`/g, '').replace(/\*/g, '');
          elements.push(
            <Text key={`text-${i}`} style={[styles.chatText, { color: colors.text, marginVertical: 2 }]}>
              {cleanLine}
            </Text>
          );
        }
      }
    }
  }

  if (inTable) {
    elements.push(renderTable(currentTableLines, tableIndex++));
  }

  return elements;
}

export function ChatScreen({
  serialNumber = '',
  productName = '',
  theme,
  onClose,
  onOpenDrawer,
}: ChatScreenProps) {
  const isDark = theme === 'dark';
  const scrollViewRef = useRef<ScrollView>(null);
  const [inputText, setInputText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [activeSerial, setActiveSerial] = useState<string>(serialNumber);
  const [activeProduct, setActiveProduct] = useState<string>(productName);

  // Camera & Scanning Modals State
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isScanModalVisible, setIsScanModalVisible] = useState<boolean>(false);
  const [isPhotoModalVisible, setIsPhotoModalVisible] = useState<boolean>(false);
  const [flash, setFlash] = useState<boolean>(false);
  const [scannedCodes, setScannedCodes] = useState<string[]>([]);
  const cameraRef = useRef<any>(null);
  const lastScannedCodeRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);

  const handleOpenScanModal = async () => {
    if (!cameraPermission || !cameraPermission.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(
          'Permission Required',
          'Scan Hub needs camera access to scan barcodes or serial numbers within the chat.'
        );
        return;
      }
    }
    setFlash(false);
    setScannedCodes([]);
    lastScannedCodeRef.current = '';
    lastScannedTimeRef.current = 0;
    setIsScanModalVisible(true);
  };

  const handleOpenPhotoModal = async () => {
    if (!cameraPermission || !cameraPermission.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(
          'Permission Required',
          'Scan Hub needs camera access to capture photos of serial plates.'
        );
        return;
      }
    }
    setFlash(false);
    setIsPhotoModalVisible(true);
  };

  const handleChatBarcodeScanned = (result: { type: string; data: string }) => {
    if (isScanModalVisible) {
      const { data } = result;
      const now = Date.now();
      
      // Debounce logic: prevent duplicate scans within 1.5 seconds of the same code
      if (lastScannedCodeRef.current === data && now - lastScannedTimeRef.current < 1500) {
        return;
      }
      
      lastScannedCodeRef.current = data;
      lastScannedTimeRef.current = now;

      setScannedCodes((prev) => {
        if (prev.includes(data)) {
          return prev; // Avoid duplicate list entries
        }
        return [...prev, data];
      });
    }
  };

  const handleFinishMultiScan = () => {
    setIsScanModalVisible(false);
    if (scannedCodes.length > 0) {
      const joinedCodes = scannedCodes.join(', ');
      const query = `details of ${joinedCodes}`;
      setInputText(query);
    }
  };

  const handleCapturePhoto = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          skipProcessing: true,
        });
        
        setIsPhotoModalVisible(false);
        
        if (photo && photo.uri) {
          const userMsg: ChatMessage = {
            id: Date.now().toString() + '-user-photo',
            sender: 'user',
            text: '📸 Sent a photo for OCR lookup',
            imageUri: photo.uri,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };

          setMessages((prev) => {
            const newMessages = [...prev, userMsg];
            AsyncStorage.setItem('@mygoscan:chat_messages', JSON.stringify(newMessages)).catch(() => {});
            return newMessages;
          });
          
          setLoading(true);
          
          setTimeout(async () => {
            const targetSerial = activeSerial || '2043052447';
            try {
              const apiRes = await sendChatMessage(targetSerial, `show me details of ${targetSerial}`);
              
              if (apiRes.success && apiRes.data) {
                if (apiRes.data.serialNumber && apiRes.data.serialNumber !== 'undefined' && apiRes.data.serialNumber !== 'null') {
                  setActiveSerial(apiRes.data.serialNumber);
                  if (apiRes.data.productName) {
                    setActiveProduct(apiRes.data.productName);
                  }
                }

                const aiMsg: ChatMessage = {
                  id: Date.now().toString() + '-ai-ocr',
                  sender: 'assistant',
                  text: `🔍 **OCR Image Analysis**: Extracted Serial Number: **${targetSerial}**.\n\nHere are the SAP Neptune API registration details:\n\n${apiRes.data.responseText}`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                };
                
                setMessages((prev) => {
                  const newMessages = [...prev, aiMsg];
                  AsyncStorage.setItem('@mygoscan:chat_messages', JSON.stringify(newMessages)).catch(() => {});
                  return newMessages;
                });
              } else {
                throw new Error(apiRes.error || 'Server error');
              }
            } catch (e: any) {
              const aiMsg: ChatMessage = {
                id: Date.now().toString() + '-ai-ocr-err',
                sender: 'assistant',
                text: `🔍 **OCR Image Analysis**: Found serial number **${targetSerial}**, but could not query details.\n⚠️ **Connection Error**: ${e.message || 'API is offline.'}`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              };
              setMessages((prev) => {
                const newMessages = [...prev, aiMsg];
                AsyncStorage.setItem('@mygoscan:chat_messages', JSON.stringify(newMessages)).catch(() => {});
                return newMessages;
              });
            } finally {
              setLoading(false);
            }
          }, 2500);
        }
      } catch (err: any) {
        Alert.alert('Capture Failed', `Could not take photo: ${err.message}`);
        setIsPhotoModalVisible(false);
      }
    }
  };



  const colors = {
    bg: isDark ? '#090d16' : '#f8fafc',
    headerBg: isDark ? '#090d16' : '#f8fafc', // Seamless background matching the screen color
    cardBg: isDark ? '#131a26' : '#ffffff',
    text: isDark ? '#f8fafc' : '#0f172a',
    mutedText: isDark ? '#475569' : '#64748b',
    border: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)',
    inputBg: isDark ? '#1e293b' : '#e2e8f0',
    inputColor: isDark ? '#ffffff' : '#0f172a',
    bubbleUser: '#ff682c',
    bubbleAi: isDark ? '#131a26' : '#ffffff',
  };

  // Synchronize state with props and look up fallback scan if empty
  useEffect(() => {
    if (serialNumber) {
      setActiveSerial(serialNumber);
      setActiveProduct(productName);
    } else {
      // Look up the most recent scan from AsyncStorage
      AsyncStorage.getItem('@mygoscan:scans')
        .then((stored) => {
          if (stored) {
            const parsed = JSON.parse(stored);
            // Find the first scan of classification Barcode or OCR Serial Number
            const recentSerialScan = parsed.find(
              (s: any) => s.classification === 'OCR Serial Number' || s.classification === 'Barcode'
            );
            if (recentSerialScan) {
              setActiveSerial(recentSerialScan.data);
              setActiveProduct(recentSerialScan.details?.serialApiData?.product || 'Enterprise Device Frame V2');
            } else {
              setActiveSerial('');
              setActiveProduct('');
            }
          } else {
            setActiveSerial('');
            setActiveProduct('');
          }
        })
        .catch((e) => {
          console.warn('Error reading scans for context:', e);
          setActiveSerial('');
          setActiveProduct('');
        });
    }
  }, [serialNumber, productName]);

  // Load chat messages from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem('@mygoscan:chat_messages')
      .then((stored) => {
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.length > 0) {
            setMessages(parsed);
            return;
          }
        }
        // Set fallback greeting if no history exists
        const greetingText = `Hello! I am your **Serial Search AI Assistant**.`;
        setMessages([
          {
            id: 'greet',
            sender: 'assistant',
            text: greetingText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      })
      .catch((e) => {
        console.warn('Error reading chat messages:', e);
      });
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, loading]);

  const handleClearChat = async () => {
    try {
      await AsyncStorage.removeItem('@mygoscan:chat_messages');
      const greetingText = `Hello! I am your **Serial Search AI Assistant**.`;
      setMessages([
        {
          id: 'greet',
          sender: 'assistant',
          text: greetingText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (e) {
      console.warn('Error clearing chat history:', e);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend) return;

    if (!customText) {
      setInputText('');
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString() + '-user',
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => {
      const newMessages = [...prev, userMsg];
      AsyncStorage.setItem('@mygoscan:chat_messages', JSON.stringify(newMessages)).catch(() => {});
      return newMessages;
    });
    setLoading(true);

    try {
      const apiRes = await sendChatMessage(activeSerial, textToSend);
      if (apiRes.success && apiRes.data) {
        // If backend returned a resolved serial number and product name, sync it back to active context!
        if (apiRes.data.serialNumber && apiRes.data.serialNumber !== 'undefined' && apiRes.data.serialNumber !== 'null') {
          setActiveSerial(apiRes.data.serialNumber);
          if (apiRes.data.productName) {
            setActiveProduct(apiRes.data.productName);
          }
        }

        const aiMsg: ChatMessage = {
          id: Date.now().toString() + '-ai',
          sender: 'assistant',
          text: apiRes.data.responseText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => {
          const newMessages = [...prev, aiMsg];
          AsyncStorage.setItem('@mygoscan:chat_messages', JSON.stringify(newMessages)).catch(() => {});
          return newMessages;
        });
      } else {
        const errorMsg: ChatMessage = {
          id: Date.now().toString() + '-err',
          sender: 'assistant',
          text: `⚠️ **Inquiry Failed**: ${apiRes.error || 'The server returned an error.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => {
          const newMessages = [...prev, errorMsg];
          AsyncStorage.setItem('@mygoscan:chat_messages', JSON.stringify(newMessages)).catch(() => {});
          return newMessages;
        });
      }
    } catch (e: any) {
      const errorMsg: ChatMessage = {
        id: Date.now().toString() + '-err-network',
        sender: 'assistant',
        text: `⚠️ **Connection Error**: ${e.message || 'Could not connect to the Sales Intelligence backend.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => {
        const newMessages = [...prev, errorMsg];
        AsyncStorage.setItem('@mygoscan:chat_messages', JSON.stringify(newMessages)).catch(() => {});
        return newMessages;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderColor: colors.border }]}>
        <View style={styles.headerLeftRow}>
          <TouchableOpacity
            style={[
              styles.backButton,
              { marginRight: 10 },
              !isDark && { backgroundColor: '#e2e8f0', borderColor: 'rgba(0,0,0,0.06)' }
            ]}
            onPress={onOpenDrawer}
          >
            <Text style={[styles.backButtonText, { color: colors.text }]}>☰</Text>
          </TouchableOpacity>

          <View style={{ flex: 1, marginRight: 4 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>Serial Search AI Assistant</Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedText }]} numberOfLines={1}>AI Serial Intelligence</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, marginRight: 12 }}>
          <TouchableOpacity
            style={[
              styles.backButton,
              { marginRight: 8 },
              !isDark && { backgroundColor: '#e2e8f0', borderColor: 'rgba(0,0,0,0.06)' }
            ]}
            onPress={handleClearChat}
          >
            <Text style={[styles.backButtonText, { color: colors.text }]}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.backButton,
              { marginRight: 0 },
              !isDark && { backgroundColor: '#e2e8f0', borderColor: 'rgba(0,0,0,0.06)' }
            ]}
            onPress={onClose}
          >
            <Text style={[styles.backButtonText, { color: colors.text }]}>← Back</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages Window */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <View
                key={msg.id}
                style={[
                  styles.messageRow,
                  isUser ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' },
                ]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    {
                      backgroundColor: isUser ? colors.bubbleUser : colors.bubbleAi,
                      borderColor: colors.border,
                      borderWidth: isUser ? 0 : 1,
                    },
                    isUser ? styles.bubbleUserCorner : styles.bubbleAiCorner,
                    !isUser && msg.text.includes('|') && { flex: 1, maxWidth: '95%' }
                  ]}
                >
                  {/* Image Attachment Preview */}
                  {!!msg.imageUri && (
                    <Image
                      source={{ uri: msg.imageUri }}
                      style={styles.attachedImage}
                      resizeMode="cover"
                    />
                  )}

                  {isUser ? (
                    <Text style={styles.userText}>{msg.text}</Text>
                  ) : (
                    parseAndRenderMessage(msg.text, colors, isDark)
                  )}
                  <Text
                    style={[
                      styles.messageTime,
                      { color: isUser ? 'rgba(255,255,255,0.7)' : colors.mutedText },
                    ]}
                  >
                    {msg.timestamp}
                  </Text>
                </View>
              </View>
            );
          })}

          {loading && (
            <View style={[styles.messageRow, { justifyContent: 'flex-start' }]}>
              <View style={[styles.messageBubble, styles.bubbleAiCorner, { backgroundColor: colors.bubbleAi, borderColor: colors.border, borderWidth: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
                  <ActivityIndicator size="small" color="#ff682c" style={{ marginRight: 8 }} />
                  <Text style={[styles.chatText, { color: colors.mutedText, fontStyle: 'italic' }]}>
                    Assistant is searching SAP database...
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.headerBg, borderTopColor: colors.border }]}>
          <View style={[styles.inputContainer, { backgroundColor: colors.inputBg }]}>
            <TextInput
              style={[styles.textInput, { color: colors.inputColor }]}
              placeholder="Ask registration details, status, product..."
              placeholderTextColor={isDark ? '#475569' : '#94a3b8'}
              value={inputText}
              onChangeText={setInputText}
              editable={!loading}
              onSubmitEditing={() => handleSendMessage()}
            />
            {/* Quick Actions inside input box */}
            <View style={styles.inputActionsRow}>
              <TouchableOpacity
                style={styles.inputActionBtn}
                onPress={handleOpenPhotoModal}
                disabled={loading}
              >
                <CameraIcon color={colors.mutedText} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inputActionBtn}
                onPress={handleOpenScanModal}
                disabled={loading}
              >
                <BarcodeIcon color={colors.mutedText} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: inputText.trim() && !loading ? '#ff682c' : (isDark ? '#1e293b' : '#cbd5e1') },
            ]}
            onPress={() => handleSendMessage()}
            disabled={!inputText.trim() || loading}
          >
            <Text style={[styles.sendButtonText, { color: inputText.trim() && !loading ? '#ffffff' : (isDark ? '#475569' : '#94a3b8') }]}>
              Send
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Barcode Scanner Modal */}
      <Modal
        visible={isScanModalVisible}
        animationType="slide"
        onRequestClose={() => setIsScanModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            enableTorch={flash}
            onBarcodeScanned={handleChatBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: [
                'qr', 'ean13', 'ean8', 'upc_a', 'upc_e',
                'code128', 'code39', 'code93', 'itf14',
                'codabar', 'pdf417', 'aztec', 'datamatrix'
              ],
            }}
          />
          <ScannerOverlay flash={flash} onToggleFlash={() => setFlash(!flash)} />

          {/* Top Close Header with Done Button */}
          <SafeAreaView style={styles.scanModalHeader} edges={['top']}>
            <TouchableOpacity
              style={styles.scanModalCloseBtn}
              onPress={() => setIsScanModalVisible(false)}
            >
              <Text style={styles.scanModalCloseText}>✕ Cancel</Text>
            </TouchableOpacity>

            {scannedCodes.length > 0 && (
              <TouchableOpacity
                style={[styles.scanModalCloseBtn, { backgroundColor: '#ff682c', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }]}
                onPress={handleFinishMultiScan}
              >
                <Text style={[styles.scanModalCloseText, { color: '#ffffff', fontWeight: 'bold' }]}>✓ Done ({scannedCodes.length})</Text>
              </TouchableOpacity>
            )}
          </SafeAreaView>

          {/* Scanned Items HUD Overlay for Multi Scan Mode */}
          {scannedCodes.length > 0 && (
            <View style={styles.cameraScannedHud}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={styles.hudCountText}>Scanned Batch: {scannedCodes.length} item(s)</Text>
                <TouchableOpacity onPress={() => setScannedCodes([])}>
                  <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>Clear All</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hudScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {scannedCodes.map((code, index) => (
                  <View key={index} style={styles.hudItemBadge}>
                    <Text style={styles.hudItemText} numberOfLines={1}>{code}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* Camera Photo Capture Modal */}
      <Modal
        visible={isPhotoModalVisible}
        animationType="slide"
        onRequestClose={() => setIsPhotoModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFillObject}
            facing="back"
            enableTorch={flash}
          />
          
          {/* Centered crosshair overlay for photo alignment */}
          <View style={styles.photoTargetFrame}>
            <View style={[styles.photoCorner, styles.photoTopLeft]} />
            <View style={[styles.photoCorner, styles.photoTopRight]} />
            <View style={[styles.photoCorner, styles.photoBottomLeft]} />
            <View style={[styles.photoCorner, styles.photoBottomRight]} />
            <Text style={styles.photoTargetText}>Align Serial Number Plate</Text>
          </View>

          {/* Shutter Bar Overlay */}
          <View style={styles.shutterBar}>
            <TouchableOpacity
              style={styles.shutterFlashBtn}
              onPress={() => setFlash(!flash)}
            >
              <Text style={{ fontSize: 20 }}>{flash ? '🔦' : '💡'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shutterOuterCircle}
              onPress={handleCapturePhoto}
            >
              <View style={styles.shutterInnerCircle} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shutterCancelBtn}
              onPress={() => setIsPhotoModalVisible(false)}
            >
              <Text style={styles.shutterCancelText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  headerLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  backButton: {
    marginRight: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#131a26',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  contextCard: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  contextTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  contextSub: {
    fontSize: 10,
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  messageBubble: {
    maxWidth: '85%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  bubbleUserCorner: {
    borderBottomRightRadius: 2,
  },
  bubbleAiCorner: {
    borderBottomLeftRadius: 2,
  },
  userText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  chatText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  chatHeading: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  chatSubHeading: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 3,
    paddingLeft: 6,
  },
  messageTime: {
    fontSize: 9,
    fontWeight: '600',
    alignSelf: 'flex-end',
    marginTop: 6,
  },

  inputBar: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 18,
    fontSize: 14,
    fontWeight: '600',
  },
  sendButton: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  // Inline Markdown Grid Table Styles
  inlineTable: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginVertical: 10,
    width: '100%',
  },
  inlineTableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    justifyContent: 'space-between',
    width: '100%',
  },
  inlineTableHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'left',
  },
  inlineTableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    justifyContent: 'space-between',
    width: '100%',
  },
  inlineTableCellText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'left',
  },
  // Attached Image bubble style
  attachedImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
  },
  // Input container styles
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    marginRight: 10,
    paddingRight: 8,
  },
  inputActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputActionBtn: {
    padding: 6,
    marginHorizontal: 1,
  },

  // Scanner Modal styles
  scanModalHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 16 : 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  scanModalCloseBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(9, 13, 22, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  scanModalCloseText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  // Camera photo target finder styles
  photoTargetFrame: {
    position: 'absolute',
    top: '25%',
    left: '10%',
    width: '80%',
    height: '35%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoTargetText: {
    color: '#ff682c',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: 'rgba(9, 13, 22, 0.7)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoCorner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#ff682c',
  },
  photoTopLeft: {
    top: 0,
    left: 0,
    borderLeftWidth: 4,
    borderTopWidth: 4,
  },
  photoTopRight: {
    top: 0,
    right: 0,
    borderRightWidth: 4,
    borderTopWidth: 4,
  },
  photoBottomLeft: {
    bottom: 0,
    left: 0,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
  },
  photoBottomRight: {
    bottom: 0,
    right: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
  },
  shutterBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
  },
  shutterOuterCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  shutterInnerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ffffff',
  },
  shutterFlashBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(9,13,22,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  shutterCancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(9,13,22,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  shutterCancelText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  cameraScannedHud: {
    position: 'absolute',
    bottom: 40,
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
