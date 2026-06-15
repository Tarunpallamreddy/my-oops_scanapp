import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Animated, Easing, Dimensions, TouchableOpacity } from 'react-native';

const { width } = Dimensions.get('window');
const TARGET_SIZE = width * 0.7;

interface ScannerOverlayProps {
  flash?: boolean;
  onToggleFlash?: () => void;
}

export function ScannerOverlay({ flash = false, onToggleFlash }: ScannerOverlayProps) {
  const lineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startAnimation = () => {
      lineAnim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(lineAnim, {
            toValue: 1,
            duration: 2500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(lineAnim, {
            toValue: 0,
            duration: 2500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    startAnimation();
  }, [lineAnim]);

  const translateY = lineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TARGET_SIZE - 4],
  });

  return (
    <View style={style.container}>
      {/* Top Mask */}
      <View style={[style.mask, style.topMask]} />

      {/* Middle Row */}
      <View style={style.middleRow}>
        {/* Left Mask */}
        <View style={style.mask} />

        {/* Viewfinder Target */}
        <View style={style.viewfinder}>
          {/* Viewfinder Corners */}
          <View style={[style.corner, style.topLeft]} />
          <View style={[style.corner, style.topRight]} />
          <View style={[style.corner, style.bottomLeft]} />
          <View style={[style.corner, style.bottomRight]} />

          {/* Laser Scanner Line */}
          <Animated.View
            style={[
              style.laser,
              {
                transform: [{ translateY }],
              },
            ]}
          />
        </View>

        {/* Right Mask */}
        <View style={[style.mask, style.rightMask]}>
          {onToggleFlash && (
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                style.flashBtn,
                flash && style.flashBtnActive
              ]}
              onPress={onToggleFlash}
            >
              <Text style={style.flashIcon}>{flash ? '🔦' : '💡'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Bottom Mask */}
      <View style={[style.mask, style.bottomMask]}>
        <Text style={style.hintText}>Align barcode / QR code within the frame</Text>
        <Text style={style.subHintText}>Scanning will start automatically</Text>
      </View>
    </View>
  );
}

const style = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  mask: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 22, 0.75)', // Deep slate translucent mask
  },
  topMask: {
    flex: 1.2,
  },
  bottomMask: {
    flex: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  middleRow: {
    flexDirection: 'row',
    height: TARGET_SIZE,
  },
  viewfinder: {
    width: TARGET_SIZE,
    height: TARGET_SIZE,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#ff682c', // Vibrant brand orange
    borderWidth: 0,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: 0,
    right: 0,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 12,
  },
  laser: {
    height: 2.5,
    width: '90%',
    alignSelf: 'center',
    backgroundColor: '#ff682c',
    borderRadius: 2,
    shadowColor: '#ff682c',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },
  hintText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 20,
    letterSpacing: 0.5,
  },
  subHintText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  rightMask: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  flashBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(9, 13, 22, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  flashBtnActive: {
    backgroundColor: '#ff682c',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  flashIcon: {
    fontSize: 18,
  },
});
