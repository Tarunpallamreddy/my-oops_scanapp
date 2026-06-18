import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Text,
  Platform,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ScanScreen } from './src/screens/ScanScreen';
import { Settings } from './src/screens/Settings';
import { ChatScreen } from './src/screens/ChatScreen';

const DRAWER_WIDTH = 280;

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'Scan' | 'Settings' | 'Chat'>('Scan');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [activeSerialContext, setActiveSerialContext] = useState<{ serialNumber: string; productName: string }>({
    serialNumber: '',
    productName: '',
  });
  
  // Shared config states
  const [profileName, setProfileName] = useState<string>('Tarun Pallamreddy');
  const [profileEmail, setProfileEmail] = useState<string>('tarun.pallamreddy@mygoconsulting.com');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');



  const isDark = theme === 'dark';

  const colors = {
    bg: isDark ? '#090d16' : '#ffffff',
    cardBg: isDark ? '#131a26' : '#f8fafc',
    activeBg: isDark ? '#1e293b' : '#e2e8f0',
    text: isDark ? '#f8fafc' : '#0f172a',
    mutedText: isDark ? '#64748b' : '#94a3b8',
    border: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
  };

  const renderContent = () => {
    if (currentScreen === 'Settings') {
      return (
        <Settings
          profileName={profileName}
          setProfileName={setProfileName}
          profileEmail={profileEmail}
          setProfileEmail={setProfileEmail}
          theme={theme}
          setTheme={setTheme}
          onClose={() => setCurrentScreen('Scan')}
          onLogout={() => {
            setIsAuthenticated(false);
            setCurrentScreen('Scan');
          }}
        />
      );
    }

    if (currentScreen === 'Chat') {
      return (
        <ChatScreen
          serialNumber={activeSerialContext.serialNumber}
          productName={activeSerialContext.productName}
          theme={theme}
          onClose={() => setCurrentScreen('Scan')}
        />
      );
    }

    return (
      <ScanScreen
        profileName={profileName}
        profileEmail={profileEmail}
        theme={theme}
        onOpenChat={(serialNumber, productName) => {
          setActiveSerialContext({ serialNumber, productName });
          setCurrentScreen('Chat');
        }}
        onOpenSettings={() => setCurrentScreen('Settings')}
      />
    );
  };

  return (
    <SafeAreaProvider>
      <View style={[styles.container, { backgroundColor: isDark ? '#090d16' : '#f8fafc' }]}>
        {renderContent()}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 9999,
  },
  drawerContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    borderRightWidth: 1,
    zIndex: 10000,
    paddingTop: Platform.OS === 'ios' ? 85 : 65,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  logoIcon: {
    fontSize: 28,
  },
  logoIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ff682c',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  menuItems: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 12,
  },
  footer: {
    paddingVertical: 20,
    borderTopWidth: 1,
    marginBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  profileName: {
    fontSize: 13,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 10,
    marginTop: 2,
  },
});
