import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';

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

  const colors = {
    bg: isDark ? '#090d16' : '#f8fafc',
    headerBg: isDark ? '#090d16' : '#ffffff',
    cardBg: isDark ? '#131a26' : '#ffffff',
    text: isDark ? '#f8fafc' : '#0f172a',
    mutedText: isDark ? '#475569' : '#64748b',
    border: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)',
    inputBg: isDark ? '#1e293b' : '#e2e8f0',
    inputColor: isDark ? '#ffffff' : '#0f172a',
  };

  return (
    <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderColor: colors.border }]}>
        <View style={styles.headerLeftRow}>
          <TouchableOpacity style={[styles.backButton, !isDark && { backgroundColor: '#e2e8f0', borderColor: 'rgba(0,0,0,0.06)' }]} onPress={onClose}>
            <Text style={[styles.backButtonText, { color: colors.text }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Profile Card */}
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Profile Settings</Text>
          <View style={styles.formGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Name</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.inputBg, color: colors.inputColor }]}
              value={profileName}
              onChangeText={setProfileName}
              placeholder="Your Name"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
            />
          </View>
          <View style={styles.formGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Email</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.inputBg, color: colors.inputColor }]}
              value={profileEmail}
              onChangeText={setProfileEmail}
              placeholder="Your Email"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Theme Card */}
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border, marginTop: 20 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
          <Text style={[styles.inputLabel, { color: colors.text, marginBottom: 12 }]}>Choose Theme</Text>
          <View style={styles.themeRow}>
            <TouchableOpacity
              style={[
                styles.themeBtn,
                isDark && styles.themeBtnActive,
                !isDark && { borderColor: 'rgba(0,0,0,0.1)' },
              ]}
              onPress={() => setTheme('dark')}
            >
              <Text style={[styles.themeBtnText, isDark && styles.themeBtnTextActive]}>🌙 Dark Mode</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.themeBtn,
                !isDark && styles.themeBtnActiveLight,
                isDark && { borderColor: 'rgba(255,255,255,0.08)' },
              ]}
              onPress={() => setTheme('light')}
            >
              <Text style={[styles.themeBtnText, !isDark && styles.themeBtnTextActiveLight]}>☀️ Light Mode</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity style={styles.saveBtn} onPress={onClose}>
          <Text style={styles.saveBtnText}>Save Settings</Text>
        </TouchableOpacity>

        {/* Log Out Button */}
        {!!onLogout && (
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <Text style={styles.logoutBtnText}>🚪 Log Out</Text>
          </TouchableOpacity>
        )}
      </View>
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
  content: {
    flex: 1,
    padding: 20,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  formGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '600',
  },
  themeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  themeBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  themeBtnActive: {
    backgroundColor: '#ff682c', // Dynamic brand orange
    borderColor: '#ffa07a',
  },
  themeBtnActiveLight: {
    backgroundColor: '#ff682c', // Dynamic brand orange
    borderColor: '#ffa07a',
  },
  themeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  themeBtnTextActive: {
    color: '#ffffff',
  },
  themeBtnTextActiveLight: {
    color: '#ffffff',
  },
  saveBtn: {
    backgroundColor: '#ff682c', // Dynamic brand orange
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 30,
    shadowColor: '#ff682c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  logoutBtn: {
    borderColor: '#f43f5e',
    borderWidth: 1.5,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  logoutBtnText: {
    color: '#f43f5e',
    fontSize: 15,
    fontWeight: '700',
  },
});
