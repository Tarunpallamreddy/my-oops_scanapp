import React, { useState } from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ScanScreen } from './src/screens/ScanScreen';
import { Settings } from './src/screens/Settings';
import { ChatScreen } from './src/screens/ChatScreen';

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
});
