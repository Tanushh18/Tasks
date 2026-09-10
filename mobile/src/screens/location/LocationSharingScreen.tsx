import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT, UrlTile } from "react-native-maps";
import * as locationApi from "../../api/location";
import type { ShareDuration } from "../../api/location";
import type { UserSearchResult } from "../../api/users";
import { getApiErrorMessage } from "../../api/client";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { UserPicker } from "../../components/UserPicker";
import { startLocationTracking, stopLocationTracking } from "../../location/backgroundLocationTask";
import { useTheme } from "../../theme/useTheme";

const DURATION_OPTIONS: { label: string; value: ShareDuration }[] = [
  { label: "Share for 1 hour", value: "1h" },
  { label: "Share until tonight", value: "tonight" },
  { label: "Share continuously", value: "continuous" },
];

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "Sharing continuously";
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return "Expired";
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `Expires in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `Expires in ${hours}h`;
}

const POLL_INTERVAL_MS = 10000;

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Haversine distance in kilometers between two coordinates. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function LocationSharingScreen() {
  const { colors, spacing, radius, typography, feature } = useTheme();

  const [shares, setShares] = useState<locationApi.LocationShares | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [durationSheetVisible, setDurationSheetVisible] = useState(false);
  const mapRef = useRef<MapView | null>(null);

  const hasLoadedOnce = useRef(false);
  const load = useCallback(async () => {
    try {
      const result = await locationApi.getShares();
      setShares(result);
      setError(null);
      hasLoadedOnce.current = true;
    } catch (err) {
      // Once we have data, this screen polls — a transient failure mid-poll is fine to skip
      // silently. But the very first load has nothing to fall back on, so that one needs to
      // be visible rather than leaving the screen stuck on a skeleton forever.
      if (!hasLoadedOnce.current) {
        setError(getApiErrorMessage(err, "We couldn't load location sharing."));
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== "granted") return;
          const position = await Location.getCurrentPositionAsync({});
          setMyLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        } catch {
          // Distance is a nice-to-have; skip silently if it can't be determined.
        }
      })();
    }, [])
  );

  async function handleStartSharing(duration: ShareDuration) {
    if (!selectedUser) return;
    setDurationSheetVisible(false);
    setStarting(true);
    try {
      await locationApi.startSharing(selectedUser.id, duration);
      const started = await startLocationTracking();
      if (!started) {
        Alert.alert(
          "Location permission needed",
          "We need location access to share your position. Please allow it in Settings."
        );
      }
      setSelectedUser(null);
      await load();
    } catch (err) {
      Alert.alert("Couldn't start sharing", getApiErrorMessage(err));
    } finally {
      setStarting(false);
    }
  }

  const markers = useMemo(
    () =>
      (shares?.sharedWithMe ?? []).filter(
        (person): person is typeof person & { lat: number; lng: number } => person.lat != null && person.lng != null
      ),
    [shares]
  );

  useEffect(() => {
    if (view !== "map" || markers.length === 0) return;
    mapRef.current?.fitToCoordinates(
      markers.map((m) => ({ latitude: m.lat, longitude: m.lng })),
      { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
    );
  }, [view, markers]);

  async function handleStopSharing(toUserId: string) {
    setStoppingId(toUserId);
    try {
      await locationApi.stopSharing(toUserId);
      const result = await locationApi.getShares();
      setShares(result);
      if (result.sharingWith.length === 0) {
        await stopLocationTracking();
      }
    } catch (err) {
      Alert.alert("Couldn't stop sharing", getApiErrorMessage(err));
    } finally {
      setStoppingId(null);
    }
  }

  if (error && shares === null) {
    return (
      <ScreenContainer>
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            load();
          }}
        />
      </ScreenContainer>
    );
  }

  if (shares === null) {
    return (
      <ScreenContainer>
        <SkeletonLines count={4} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <SectionHeader title="Share my location" subtitle="Pick someone to share your live location with" />
      <View style={{ marginBottom: spacing.md }}>
        <UserPicker mode="single" value={selectedUser} onChange={setSelectedUser} placeholder="Search people by name" />
      </View>
      <Button
        label="Share my location"
        onPress={() => setDurationSheetVisible(true)}
        disabled={!selectedUser}
        loading={starting}
        style={{ marginBottom: spacing.xl }}
      />

      <SectionHeader title="Sharing with" />
      {shares && shares.sharingWith.length > 0 ? (
        shares.sharingWith.map((person) => (
          <Card key={person.id} style={{ marginBottom: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>{person.name}</Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                {formatExpiry(person.expiresAt)}
              </Text>
            </View>
            <Button
              label="Stop sharing"
              variant="secondary"
              size="regular"
              loading={stoppingId === person.id}
              onPress={() => handleStopSharing(person.id)}
            />
          </Card>
        ))
      ) : (
        <EmptyState
          title="Not sharing with anyone"
          subtitle="Choose someone above to start."
          icon="location-outline"
          tone={feature.location.solid}
          toneMuted={feature.location.muted}
        />
      )}

      <BottomSheet
        visible={durationSheetVisible}
        onClose={() => setDurationSheetVisible(false)}
        title="Share my location"
        subtitle={selectedUser ? `Choose how long to share with ${selectedUser.name}` : undefined}
        scrollable={false}
      >
        <View>
          {DURATION_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => handleStartSharing(option.value)}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              style={({ pressed }) => [
                styles.durationRow,
                {
                  minHeight: 48,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.md,
                  backgroundColor: pressed ? colors.surfaceAlt : "transparent",
                },
              ]}
            >
              <Text style={[typography.body, { color: colors.text }]}>{option.label}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setDurationSheetVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={({ pressed }) => [
              styles.durationRow,
              {
                minHeight: 48,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                backgroundColor: pressed ? colors.surfaceAlt : "transparent",
              },
            ]}
          >
            <Text style={[typography.body, { color: colors.danger }]}>Cancel</Text>
          </Pressable>
        </View>
      </BottomSheet>

      <View style={{ marginTop: spacing.xl, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <SectionHeader title="Shared with me" />
        <View style={[styles.toggleRow, { marginBottom: spacing.md }]}>
          <Pressable
            onPress={() => setView("list")}
            accessibilityRole="button"
            accessibilityState={{ selected: view === "list" }}
            style={[
              styles.chip,
              {
                backgroundColor: view === "list" ? colors.primary : colors.surfaceAlt,
                borderRadius: radius.pill,
              },
            ]}
          >
            <Text style={[typography.captionStrong, { color: view === "list" ? colors.onPrimary : colors.textMuted }]}>
              List
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setView("map")}
            accessibilityRole="button"
            accessibilityState={{ selected: view === "map" }}
            style={[
              styles.chip,
              {
                backgroundColor: view === "map" ? colors.primary : colors.surfaceAlt,
                borderRadius: radius.pill,
              },
            ]}
          >
            <Text style={[typography.captionStrong, { color: view === "map" ? colors.onPrimary : colors.textMuted }]}>
              Map
            </Text>
          </Pressable>
        </View>
      </View>

      {view === "list" ? (
        shares && shares.sharedWithMe.length > 0 ? (
          shares.sharedWithMe.map((person) => (
            <Card key={person.id} style={{ marginBottom: spacing.md }}>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>{person.name}</Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                {person.updatedAt ? `Updated ${formatRelativeTime(person.updatedAt)}` : "No location yet"}
              </Text>
              {person.lat != null && person.lng != null ? (
                <Text style={[typography.caption, { color: colors.textFaint, marginTop: 2 }]}>
                  {person.lat.toFixed(4)}, {person.lng.toFixed(4)}
                  {myLocation ? ` · ~${distanceKm(myLocation, { lat: person.lat, lng: person.lng }).toFixed(1)} km away` : ""}
                </Text>
              ) : null}
            </Card>
          ))
        ) : (
          <EmptyState
            title="Nobody is sharing with you"
            subtitle="When someone shares their location, it'll show up here."
            icon="people-outline"
            tone={feature.location.solid}
            toneMuted={feature.location.muted}
          />
        )
      ) : (
        <View style={[styles.mapContainer, { borderRadius: radius.lg }]}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={Platform.OS === "ios" ? PROVIDER_DEFAULT : undefined}
            mapType={Platform.OS === "android" ? "none" : undefined}
          >
            {Platform.OS === "android" ? (
              <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />
            ) : null}
            {markers.map((person) => (
              <Marker
                key={person.id}
                title={person.name}
                coordinate={{ latitude: person.lat, longitude: person.lng }}
              />
            ))}
          </MapView>
          <View style={[styles.attribution, { backgroundColor: colors.overlay }]}>
            <Text style={{ color: "#FFFFFF", fontSize: 10 }}>© OpenStreetMap contributors</Text>
          </View>
          {markers.length === 0 ? (
            <View style={styles.mapEmptyOverlay}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>No locations to show yet.</Text>
            </View>
          ) : null}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  durationRow: { justifyContent: "center" },
  toggleRow: { flexDirection: "row", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  mapContainer: { height: 320, overflow: "hidden" },
  attribution: { position: "absolute", right: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  mapEmptyOverlay: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", paddingTop: 24 },
});
