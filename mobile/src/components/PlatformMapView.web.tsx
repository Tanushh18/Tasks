import React from "react";
import { StyleSheet, Text, View } from "react-native";

// react-native-maps ships no web build, so this stands in for it in the
// browser dev preview only — real devices/simulators get the actual map.
export default function MapView({ children, style }: { children?: React.ReactNode; style?: any }) {
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={styles.text}>Map preview isn't available in the browser — run on a device/simulator to see it.</Text>
      {children}
    </View>
  );
}

export function Marker() {
  return null;
}

export function UrlTile() {
  return null;
}

export const PROVIDER_DEFAULT = "default";

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
    padding: 16,
  },
  text: {
    textAlign: "center",
    color: "#475569",
  },
});
