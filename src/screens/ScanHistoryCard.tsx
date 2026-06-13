import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { ScanResult } from '../types';

interface ScanHistoryCardProps {
  item: ScanResult;
  theme: 'dark' | 'light';
  onPress?: () => void;
  onPressLink?: () => void;
}

export function ScanHistoryCard({ item, theme, onPress, onPressLink }: ScanHistoryCardProps) {
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
      <View style={styles.cardInfo}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.typeTagRow}>
            <Text style={[styles.cardType, { color: isDark ? '#ffa07a' : '#ff682c' }]}>
              {item.type}
            </Text>
            {!!item.classification && (
              <View style={[styles.classBadge, { backgroundColor: classStyles.bg }]}>
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
        {item.redirectUrl ? (
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
});

