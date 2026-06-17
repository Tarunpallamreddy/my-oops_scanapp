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

  // Drawer Animation States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const drawerAnimation = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  const toggleDrawer = (open: boolean) => {
    if (open) {
      setIsDrawerOpen(true);
      Animated.timing(drawerAnimation, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(drawerAnimation, {
        toValue: -DRAWER_WIDTH,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setIsDrawerOpen(false);
      });
    }
  };

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
          onOpenDrawer={() => toggleDrawer(true)}
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
        onOpenDrawer={() => toggleDrawer(true)}
      />
    );
  };

  return (
    <SafeAreaProvider>
      <View style={[styles.container, { backgroundColor: isDark ? '#090d16' : '#f8fafc' }]}>
        {renderContent()}

        {/* Semi-transparent Backdrop overlay */}
        {isDrawerOpen && (
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => toggleDrawer(false)}
          >
            <View style={{ flex: 1 }} />
          </TouchableOpacity>
        )}

        {/* Collapsible Left Side Panel */}
        <Animated.View
          style={[
            styles.drawerContainer,
            {
              transform: [{ translateX: drawerAnimation }],
              backgroundColor: colors.bg,
              borderRightColor: colors.border,
            },
          ]}
        >
          {/* Brand Header */}
          <View style={[styles.drawerHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.logoIconWrapper}>
              <Text style={styles.logoIcon}>📷</Text>
            </View>
            <View>
              <Text style={[styles.brandName, { color: colors.text }]}>My Scan Hub</Text>
              <Text style={[styles.brandSubtitle, { color: colors.mutedText }]}>INTELLIGENCE HUB</Text>
            </View>
          </View>

          {/* Navigation Links */}
          <View style={styles.menuItems}>
            {/* Scan Hub Option */}
            <TouchableOpacity
              style={[
                styles.menuItem,
                currentScreen === 'Scan' && { backgroundColor: colors.activeBg },
              ]}
              onPress={() => {
                setCurrentScreen('Scan');
                toggleDrawer(false);
              }}
            >
              <Text style={{ fontSize: 18 }}>📷</Text>
              <Text style={[styles.menuItemText, { color: colors.text }]}>Scan Hub</Text>
            </TouchableOpacity>

            {/* Serial Search AI Assistant Option */}
            <TouchableOpacity
              style={[
                styles.menuItem,
                currentScreen === 'Chat' && { backgroundColor: colors.activeBg },
              ]}
              onPress={() => {
                // Open Chat with empty context for general inquiry
                setActiveSerialContext({ serialNumber: '', productName: '' });
                setCurrentScreen('Chat');
                toggleDrawer(false);
              }}
            >
              <Text style={{ fontSize: 18 }}>🤖</Text>
              <Text style={[styles.menuItemText, { color: colors.text }]}>Serial Search AI Assistant</Text>
            </TouchableOpacity>

            {/* Profile Option */}
            <TouchableOpacity
              style={[
                styles.menuItem,
                currentScreen === 'Settings' && { backgroundColor: colors.activeBg },
              ]}
              onPress={() => {
                setCurrentScreen('Settings');
                toggleDrawer(false);
              }}
            >
              <Text style={{ fontSize: 18 }}>👤</Text>
              <Text style={[styles.menuItemText, { color: colors.text }]}>Profile</Text>
            </TouchableOpacity>
          </View>

          {/* Footer User Profile Card */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Text style={[styles.profileName, { color: colors.text }]}>{profileName}</Text>
            <Text style={[styles.profileEmail, { color: colors.mutedText }]}>{profileEmail}</Text>
          </View>
        </Animated.View>
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
