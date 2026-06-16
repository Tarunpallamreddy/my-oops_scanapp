import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoginScreen } from './src/screens/LoginScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { Settings } from './src/screens/Settings';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'Scan' | 'Settings'>('Scan');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  
  // Shared config states
  const [profileName, setProfileName] = useState<string>('Tarun Saiteja');
  const [profileEmail, setProfileEmail] = useState<string>('tarun@example.com');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // If not authenticated, force the beautiful login screen
  /*
  if (!isAuthenticated) {
    return (
      <LoginScreen
        theme={theme}
        onLogin={(name, email) => {
          setProfileName(name);
          setProfileEmail(email);
          setIsAuthenticated(true);
        }}
      />
    );
  }
  */

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

    return (
      <ScanScreen
        profileName={profileName}
        profileEmail={profileEmail}
        theme={theme}
        onOpenSettings={() => setCurrentScreen('Settings')}
      />
    );
  };

  return (
    <SafeAreaProvider>
      {renderContent()}
    </SafeAreaProvider>
  );
}
