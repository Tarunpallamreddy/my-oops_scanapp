import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { ScanResult } from '../types';

interface ScanHistoryCardProps {
  item: ScanResult;
  theme: 'dark' | 'light';
  onPress?: () => void;
  onPressLink?: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
  onDelete?: () => void;
}

export function ScanHistoryCard({
  item,
  theme,
  onPress,
  onPressLink,
  selected = false,
  onToggleSelect,
  onDelete,
}: ScanHistoryCardProps) {
  const isDark = theme === 'dark';

  // Format the time as fallback if scannedDateFormatted doesn't exist
  const formattedTime = item.scannedDateFormatted || new Date(item.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Determine classification color/background styles
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

  const classStyles = getClassificationStyles(item.classification);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.historyCard,
        {
          backgroundColor: isDark ? '#131a26' : '#ffffff',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)',
          shadowColor: isDark ? 'transparent' : '#0f172a',
          shadowOpacity: isDark ? 0 : 0.05,
          elevation: isDark ? 0 : 1,
        },
      ]}
    >
      {onToggleSelect && (
        <TouchableOpacity
          activeOpacity={0.6}
          disabled={!!item.salesOrder}
          style={styles.checkboxContainer}
          onPress={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: item.salesOrder
                  ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)')
                  : selected
                  ? '#ff682c'
                  : isDark
                  ? 'rgba(255, 255, 255, 0.25)'
                  : 'rgba(0, 0, 0, 0.25)',
                backgroundColor: item.salesOrder
                  ? (isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)')
                  : selected
                  ? '#ff682c'
                  : 'transparent',
              },
            ]}
          >
            {selected && <Text style={styles.checkboxCheck}>✓</Text>}
          </View>
        </TouchableOpacity>
      )}
      <View style={styles.cardInfo}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.typeTagRow}>
            {!!item.classification && (
              <View style={[styles.classBadge, { backgroundColor: classStyles.bg, marginLeft: 0 }]}>
                <Text style={[styles.classBadgeText, { color: classStyles.text }]}>
                  {item.classification}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.cardTime, { color: isDark ? '#475569' : '#64748b' }]}>
            {formattedTime}
          </Text>
        </View>
        {item.classification === 'Web Link' ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onPressLink?.();
            }}
            style={styles.linkWrapper}
          >
            <Text style={[styles.cardData, { color: isDark ? '#38bdf8' : '#0284c7', textDecorationLine: 'underline' }]} numberOfLines={1}>
              🔗 {item.data}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.cardData, { color: isDark ? '#f1f5f9' : '#0f172a' }]} numberOfLines={1}>
            {item.data}
          </Text>
        )}

        {/* Display Extracted Date if found inside barcode/OCR */}
        {!!item.extractedDate && (
          <View style={[styles.extractedDateBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.06)' : 'rgba(16, 185, 129, 0.08)' }]}>
            <Text style={styles.extractedDateText}>
              📅 Digital Date: {item.extractedDate}
            </Text>
          </View>
        )}

        {/* Display Live API serial info if available */}
        {item.details?.serialApiData && (
          item.details.serialApiData.notFound ? (
            <View style={[styles.apiDataBadge, { backgroundColor: isDark ? 'rgba(244, 63, 94, 0.05)' : 'rgba(244, 63, 94, 0.08)', borderColor: 'rgba(244, 63, 94, 0.15)' }]}>
              <Text style={[styles.apiProductText, { color: '#f43f5e', fontSize: 11 }]}>
                ⚠️ Serial number not found in SAP database
              </Text>
            </View>
          ) : (
            <View style={styles.apiDataBadge}>
              <Text style={[styles.apiProductText, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                📦 {item.details.serialApiData.product}
              </Text>
              <Text style={styles.apiDetailText}>
                Status: {item.details.serialApiData.status} • Sold to: {item.details.serialApiData.soldToParty}
              </Text>
            </View>
          )
        )}

        {/* Display Sales Order if present */}
        {!!item.salesOrder && (
          <View style={[styles.salesOrderBadge, { backgroundColor: isDark ? 'rgba(255, 104, 44, 0.08)' : 'rgba(255, 104, 44, 0.12)' }]}>
            <Text style={[styles.salesOrderText, { color: '#ff682c' }]}>
              🛒 Sales Order: {item.salesOrder}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.rightActionsRow}>
        {onDelete && (
          <TouchableOpacity
            activeOpacity={0.6}
            style={[
              styles.deleteButton,
              {
                backgroundColor: isDark ? 'rgba(244, 63, 94, 0.12)' : 'rgba(244, 63, 94, 0.08)',
                borderColor: isDark ? 'rgba(244, 63, 94, 0.2)' : 'rgba(244, 63, 94, 0.15)',
              }
            ]}
            onPress={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Text style={styles.deleteButtonText}>🗑️</Text>
          </TouchableOpacity>
        )}
        <Text style={{ color: '#ff682c', fontSize: 12, fontWeight: '700', marginLeft: 8 }}>📄 Details →</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  historyCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  cardInfo: {
    flex: 1,
    marginRight: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  typeTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardType: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  classBadge: {
    marginLeft: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  classBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  cardTime: {
    fontSize: 11,
    fontWeight: '500',
  },
  cardData: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  linkWrapper: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  extractedDateBadge: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
  },
  extractedDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10b981',
  },
  cardStatusContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeSynced: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  badgeSyncedLight: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.15)',
  },
  badgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  badgePendingLight: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.15)',
  },
  badgeFailed: {
    backgroundColor: 'rgba(244, 63, 94, 0.06)',
    borderColor: 'rgba(244, 63, 94, 0.25)',
  },
  badgeFailedLight: {
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
    borderColor: 'rgba(244, 63, 94, 0.15)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  textSynced: {
    color: '#10b981',
  },
  textPending: {
    color: '#f59e0b',
  },
  textFailed: {
    color: '#f43f5e',
  },
  apiDataBadge: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 104, 44, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 104, 44, 0.15)',
  },
  apiProductText: {
    fontSize: 12,
    fontWeight: '700',
  },
  apiDetailText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  checkboxContainer: {
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxCheck: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  salesOrderBadge: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255, 104, 44, 0.25)',
  },
  salesOrderText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 13,
  },
});

