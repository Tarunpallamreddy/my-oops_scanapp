import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface LoginScreenProps {
  theme: 'dark' | 'light';
  onLogin: (name: string, email: string) => void;
}

export function LoginScreen({ theme, onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // To switch between login and register flow simulated views
  const [isRegistering, setIsRegistering] = useState(false);

  // Validation state
  const [errors, setErrors] = useState<{ email?: string; password?: string; name?: string }>({});

  const isDark = theme === 'dark';

  const colors = {
    bg: isDark ? '#090d16' : '#f8fafc',
    cardBg: isDark ? '#131a26' : '#ffffff',
    text: isDark ? '#f8fafc' : '#0f172a',
    mutedText: isDark ? '#64748b' : '#94a3b8',
    border: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.08)',
    inputBg: isDark ? '#1e293b' : '#f1f5f9',
    inputColor: isDark ? '#ffffff' : '#0f172a',
    socialBg: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
  };

  const validate = () => {
    const newErrors: typeof errors = {};

    if (isRegistering && !name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      const displayName = name.trim() || email.split('@')[0];
      onLogin(displayName, email.trim().toLowerCase());
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.bg }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardContainer}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Brand Header */}
            <View style={styles.brandContainer}>
              <View style={styles.brandIconWrapper}>
                <Text style={styles.brandLogoIcon}>📷</Text>
                <View style={styles.laserLine} />
              </View>
              <Text style={[styles.brandName, { color: colors.text }]}>MyGo Scan</Text>
              <Text style={[styles.brandSubtitle, { color: colors.mutedText }]}>
                OCR & Barcode Intelligence Hub
              </Text>
            </View>

            {/* Login Card Form */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {isRegistering ? 'Create Account' : 'Welcome Back'}
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.mutedText }]}>
                {isRegistering ? 'Sign up to get started' : 'Sign in to access your dashboard'}
              </Text>

              {isRegistering && (
                <View style={styles.formGroup}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>Full Name</Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      { backgroundColor: colors.inputBg, color: colors.inputColor },
                      !!errors.name && styles.inputErrorBorder,
                    ]}
                    value={name}
                    onChangeText={(text) => {
                      setName(text);
                      if (errors.name) setErrors(prev => ({ ...prev, name: undefined }));
                    }}
                    placeholder="John Doe"
                    placeholderTextColor={isDark ? '#475569' : '#94a3b8'}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  {!!errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Email Address</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    { backgroundColor: colors.inputBg, color: colors.inputColor },
                    !!errors.email && styles.inputErrorBorder,
                  ]}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errors.email) setErrors(prev => ({ ...prev, email: undefined }));
                  }}
                  placeholder="name@company.com"
                  placeholderTextColor={isDark ? '#475569' : '#94a3b8'}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {!!errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
              </View>

              <View style={styles.formGroup}>
                <View style={styles.passwordHeader}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>Password</Text>
                  {!isRegistering && (
                    <TouchableOpacity onPress={() => alert('Demo Feature: Enter any 6+ char password.')}>
                      <Text style={styles.forgotPasswordLink}>Forgot?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={[
                    styles.textInput,
                    { backgroundColor: colors.inputBg, color: colors.inputColor },
                    !!errors.password && styles.inputErrorBorder,
                  ]}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) setErrors(prev => ({ ...prev, password: undefined }));
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={isDark ? '#475569' : '#94a3b8'}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {!!errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
              </View>

              {/* Submit Button */}
              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
                <Text style={styles.submitBtnText}>
                  {isRegistering ? 'Sign Up' : 'Sign In'}
                </Text>
              </TouchableOpacity>

              {/* Navigation Switch */}
              <View style={styles.switchContainer}>
                <Text style={[styles.switchText, { color: colors.mutedText }]}>
                  {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
                </Text>
                <TouchableOpacity onPress={() => {
                  setIsRegistering(!isRegistering);
                  setErrors({});
                }}>
                  <Text style={styles.switchLink}>
                    {isRegistering ? 'Sign In' : 'Sign Up'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Social Authentication divider */}
            <View style={styles.dividerContainer}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.mutedText }]}>OR CONTINUE WITH</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Social Buttons */}
            <View style={styles.socialButtonsContainer}>
              <TouchableOpacity
                style={[styles.socialBtn, { backgroundColor: colors.socialBg, borderColor: colors.border }]}
                onPress={() => onLogin('Google Guest', 'google@example.com')}
              >
                <Text style={[styles.socialBtnText, { color: colors.text }]}>🌐 Google</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.socialBtn, { backgroundColor: colors.socialBg, borderColor: colors.border }]}
                onPress={() => onLogin('Apple Guest', 'apple@example.com')}
              >
                <Text style={[styles.socialBtnText, { color: colors.text }]}> Apple</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  brandIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#ff682c',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  brandLogoIcon: {
    fontSize: 32,
  },
  laserLine: {
    position: 'absolute',
    height: 3,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    top: '50%',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
  brandName: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  textInput: {
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '600',
  },
  inputErrorBorder: {
    borderWidth: 1.5,
    borderColor: '#f43f5e',
  },
  errorText: {
    color: '#f43f5e',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  forgotPasswordLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ff682c',
  },
  submitBtn: {
    backgroundColor: '#ff682c',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#ff682c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  switchText: {
    fontSize: 12,
    fontWeight: '600',
  },
  switchLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ff682c',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 16,
  },
  socialButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  socialBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  socialBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
