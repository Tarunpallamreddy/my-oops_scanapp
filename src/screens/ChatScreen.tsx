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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendChatMessage } from '../api/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface ChatScreenProps {
  serialNumber?: string;
  productName?: string;
  theme: 'dark' | 'light';
  onClose: () => void;
  onOpenDrawer: () => void;
}

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
            <Text key={`h-${i}`} style={[styles.inlineTableHeaderText, { color: '#ff682c' }]}>{h}</Text>
          ))}
        </View>
        {/* Rows */}
        {rows.map((row, rowIdx) => (
          <View key={`row-${rowIdx}`} style={[styles.inlineTableRow, { borderBottomColor: colors.border }, rowIdx === rows.length - 1 && { borderBottomWidth: 0 }]}>
            {row.map((cell, cellIdx) => {
              const isBold = cell.startsWith('**') && cell.endsWith('**');
              const cleanCell = cell.replace(/\*\*/g, '').replace(/`/g, '');
              return (
                <Text key={`c-${cellIdx}`} style={[styles.inlineTableCellText, { color: colors.text }, isBold && { fontWeight: '700' }]}>
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

  // Add greeting when chat context updates
  useEffect(() => {
    const greetingText = activeSerial
      ? `Hello! I am your **Sales Order AI Intelligence AI Assistant**.\n\nI have loaded the context for Serial Number **${activeSerial}** (${activeProduct || 'Unknown Product'}).\n\nHow can I help you today? You can check order fulfillment details, shipping tracking logs, or invoice records.`
      : `Hello! I am your **Sales Order AI Intelligence AI Assistant**.\n\nI don't have an active scanned serial context. Please type a serial or sales order number (e.g. \`ORD-5100511\`) to fetch its order fulfillment, tracking logs, or billing records.`;
    
    setMessages([
      {
        id: 'greet',
        sender: 'assistant',
        text: greetingText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }, [activeSerial, activeProduct]);

  // Scroll to bottom on new messages
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, loading]);


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

    setMessages((prev) => [...prev, userMsg]);
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
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: Date.now().toString() + '-err',
          sender: 'assistant',
          text: `⚠️ **Inquiry Failed**: ${apiRes.error || 'The server returned an error.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (e: any) {
      const errorMsg: ChatMessage = {
        id: Date.now().toString() + '-err-network',
        sender: 'assistant',
        text: `⚠️ **Connection Error**: ${e.message || 'Could not connect to the Sales Intelligence backend.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
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

          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Sales Order AI Assistance</Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedText }]}>AI Sales Intelligence</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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

      {/* Active Context Card */}
      <View style={[styles.contextCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.contextTitle, { color: colors.text }]} numberOfLines={1}>
              Active Context: {activeSerial || 'None'}
            </Text>
            <Text style={[styles.contextSub, { color: colors.mutedText }]} numberOfLines={1}>
              {activeSerial ? (activeProduct || 'Unknown Product') : 'Enter Serial # or Sales Order # to query'}
            </Text>
          </View>
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
                  ]}
                >
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
                    EyeScan is searching database...
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.headerBg, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.inputBg, color: colors.inputColor }]}
            placeholder="Ask order status, delivery, billing..."
            placeholderTextColor={isDark ? '#475569' : '#94a3b8'}
            value={inputText}
            onChangeText={setInputText}
            editable={!loading}
            onSubmitEditing={() => handleSendMessage()}
          />
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
    paddingTop: Platform.OS === 'android' ? 12 : 12,
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
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
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
    width: '100%',
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
    borderRadius: 22,
    paddingHorizontal: 18,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 10,
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
  },
  inlineTableHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    flex: 1,
    textAlign: 'left',
  },
  inlineTableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    justifyContent: 'space-between',
  },
  inlineTableCellText: {
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
    textAlign: 'left',
  },
});
