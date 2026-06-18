import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface SettingsProps {
  profileName: string;
  setProfileName: (name: string) => void;
  profileEmail: string;
  setProfileEmail: (email: string) => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  onClose: () => void;
  onLogout?: () => void;
}

export function Settings({
  profileName,
  setProfileName,
  profileEmail,
  setProfileEmail,
  theme,
  setTheme,
  onClose,
  onLogout,
}: SettingsProps) {
  const isDark = theme === 'dark';
  const [pushEnabled, setPushEnabled] = useState<boolean>(true);

  const colors = {
    bg: isDark ? '#090d16' : '#f0f4f6', // Premium light background
    headerBg: isDark ? '#090d16' : '#f0f4f6', // Seamless background matching the screen color
    cardBg: isDark ? '#131a26' : '#ffffff',
    text: isDark ? '#f8fafc' : '#0c3b4e', // Slate dark blue/teal
    mutedText: isDark ? '#64748b' : '#6b828a',
    border: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
    accent: '#f25c22', // HSL-tailored premium orange
  };

  const getInitials = (name: string) => {
    if (!name) return 'TP';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.bg }]} edges={['bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.headerBg} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <TouchableOpacity 
          style={[styles.backButton, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.05)' }]} 
          onPress={onClose} 
          activeOpacity={0.7}
        >
          <Text style={[styles.backButtonText, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        </View>
        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={[styles.avatarContainer, { backgroundColor: colors.accent }]}>
            <Text style={styles.avatarText}>{getInitials(profileName)}</Text>
            <TouchableOpacity style={styles.cameraOverlay} activeOpacity={0.8}>
              <Text style={styles.cameraIcon}>📸</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.profileInfo}>
            <TextInput
              style={[styles.profileNameInput, { color: colors.text }]}
              value={profileName}
              onChangeText={setProfileName}
              placeholder="Enter Name"
              placeholderTextColor={colors.mutedText}
              autoCapitalize="words"
            />
            <Text style={[styles.profileMutedText, { color: colors.mutedText }]}>
              Tap name to edit
            </Text>
          </View>
        </View>



        {/* Preferences Section */}
        <Text style={[styles.sectionHeader, { color: colors.mutedText }]}>PREFERENCES</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <TouchableOpacity 
            style={[styles.rowContainer, { borderBottomWidth: 1, borderBottomColor: colors.border }]}
            activeOpacity={0.7}
            onPress={() => setPushEnabled(!pushEnabled)}
          >
            <Text style={styles.rowIcon}>📱</Text>
            <Text style={[styles.rowText, { color: colors.text }]}>Push notifications</Text>
            <View style={styles.rowRightSide}>
              <Text style={[styles.rowValueText, { color: colors.mutedText }]}>
                {pushEnabled ? 'On' : 'Off'}
              </Text>
              <Text style={[styles.rowArrow, { color: colors.mutedText }]}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.rowContainer}
            activeOpacity={0.7}
            onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Text style={styles.rowIcon}>{theme === 'dark' ? '🌙' : '☀️'}</Text>
            <Text style={[styles.rowText, { color: colors.text }]}>Theme</Text>
            <View style={styles.rowRightSide}>
              <Text style={[styles.rowValueText, { color: colors.mutedText }]}>
                {theme === 'dark' ? 'Dark' : 'Light'}
              </Text>
              <Text style={[styles.rowArrow, { color: colors.mutedText }]}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        {!!onLogout && (
          <TouchableOpacity style={styles.signOutBtn} onPress={onLogout} activeOpacity={0.7}>
            <Text style={styles.signOutBtnText}>Sign out</Text>
          </TouchableOpacity>
        )}

        {/* Footer */}
        <Text style={[styles.versionText, { color: colors.mutedText }]}>
          MYSCANHUB · v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 16,
    paddingBottom: 16,
    height: Platform.OS === 'android' ? 80 : 88,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 10,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 16,
    bottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: -1,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerRightPlaceholder: {
    width: 40,
  },
  scrollContent: {
    padding: 20,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 24,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#ffffff',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#f0f3f4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  cameraIcon: {
    fontSize: 12,
  },
  profileInfo: {
    marginLeft: 20,
    flex: 1,
    justifyContent: 'center',
  },
  profileNameInput: {
    fontSize: 22,
    fontWeight: '800',
    padding: 0,
    margin: 0,
  },
  profileMutedText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    opacity: 0.7,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
    marginLeft: 4,
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    height: 54,
  },
  rowIcon: {
    fontSize: 18,
    marginRight: 14,
    width: 24,
    textAlign: 'center',
  },
  rowContent: {
    flex: 1,
  },
  rowInput: {
    fontSize: 14,
    fontWeight: '600',
    padding: 0,
    margin: 0,
  },
  rowText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  rowRightSide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowValueText: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 8,
  },
  rowArrow: {
    fontSize: 18,
    fontWeight: '400',
    opacity: 0.5,
  },
  signOutBtn: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#ef4444',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 16,
  },
  signOutBtnText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '700',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 10,
    marginBottom: 30,
    opacity: 0.6,
  },
});
