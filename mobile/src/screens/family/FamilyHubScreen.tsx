import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as chatApi from "../../api/chat";
import * as contactsApi from "../../api/contacts";
import { listFamilyMembers, type UserSearchResult } from "../../api/users";
import { useAuth } from "../../auth/AuthContext";
import { AppHeader } from "../../components/AppHeader";
import { Card } from "../../components/Card";
import { FamilyAvatar } from "../../components/FamilyAvatar";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState } from "../../components/StateViews";
import { useFeatureFlags } from "../../features/FeatureFlagsContext";
import type { FamilyStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<FamilyStackParamList, "FamilyHub">;

function lastSeenLabel(iso?: string | null): string {
  if (!iso) return "Not active yet";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 5) return "Active now";
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Active ${days}d ago`;
}

/**
 * The landing screen for everything people-shaped — the family roster, plus
 * the way into contacts, chat and location.
 *
 * These used to be three separate bottom tabs. Folding them into one place
 * keeps the navigation family-centric (spec §3): you come here to reach a
 * person, and then choose how.
 */
export function FamilyHubScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, feature, touchTarget } = useTheme();
  const { user } = useAuth();
  const { flags } = useFeatureFlags();

  const [members, setMembers] = useState<UserSearchResult[]>([]);
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [family, contacts, conversations] = await Promise.all([
        listFamilyMembers(),
        flags.contacts ? contactsApi.listContacts() : Promise.resolve([]),
        flags.chat ? chatApi.listConversations() : Promise.resolve([]),
      ]);
      setMembers(family);
      setContactCount(flags.contacts ? contacts.length : null);
      setUnreadCount(conversations.reduce((sum, c) => sum + c.unreadCount, 0));
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load your family."));
    } finally {
      setLoading(false);
    }
  }, [flags.contacts, flags.chat]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const destinations = [
    flags.contacts
      ? {
          key: "contacts",
          icon: "people" as const,
          label: "Contacts",
          detail: contactCount === null ? "Your shared address book" : `${contactCount} saved`,
          tone: feature.contacts.solid,
          toneMuted: feature.contacts.muted,
          onPress: () => navigation.navigate("ContactsList"),
        }
      : null,
    flags.chat
      ? {
          key: "chat",
          icon: "chatbubbles" as const,
          label: "Chat",
          detail: unreadCount > 0 ? `${unreadCount} unread` : "Message your family",
          tone: feature.chat.solid,
          toneMuted: feature.chat.muted,
          onPress: () => navigation.navigate("ChatList"),
        }
      : null,
    flags.location
      ? {
          key: "location",
          icon: "location" as const,
          label: "Location",
          detail: "See who's sharing",
          tone: feature.location.solid,
          toneMuted: feature.location.muted,
          onPress: () => navigation.navigate("LocationSharing"),
        }
      : null,
  ].filter((d): d is NonNullable<typeof d> => d !== null);

  return (
    <View style={styles.flex}>
      <AppHeader
        title="Family"
        subtitle={members.length > 0 ? `${members.length + 1} people` : "Your private family space"}
      />

      <ScreenContainer onRefresh={load} refreshing={false}>
        <SectionHeader title="Everyone" />

        {loading ? (
          <SkeletonLines count={3} />
        ) : error ? (
          <Card>
            <Text style={[typography.body, { color: colors.textMuted }]}>{error}</Text>
          </Card>
        ) : members.length === 0 ? (
          <Card>
            <EmptyState
              icon="person-add-outline"
              tone={feature.contacts.solid}
              toneMuted={feature.contacts.muted}
              title="Just you so far"
              subtitle="When other family members join, they'll show up here."
            />
          </Card>
        ) : (
          <Card>
            {/* You first — people look for themselves to confirm which account they're on. */}
            {user ? (
              <View style={[styles.memberRow, { paddingBottom: spacing.md }]}>
                <FamilyAvatar name={user.name} presence="online" />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>{user.name} (you)</Text>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>Active now</Text>
                </View>
              </View>
            ) : null}

            {members.map((member, index) => (
              <View
                key={member.id}
                style={[
                  styles.memberRow,
                  {
                    paddingTop: spacing.md,
                    paddingBottom: index === members.length - 1 ? 0 : spacing.md,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <FamilyAvatar name={member.name} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>{member.name}</Text>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                    {lastSeenLabel(member.lastActiveAt)}
                  </Text>
                </View>
                {flags.chat ? (
                  <Pressable
                    onPress={() => navigation.navigate("ChatThread", { userId: member.id, name: member.name })}
                    accessibilityRole="button"
                    accessibilityLabel={`Message ${member.name}`}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.messageButton,
                      {
                        backgroundColor: feature.chat.muted,
                        borderRadius: radius.pill,
                        minWidth: touchTarget.min,
                        minHeight: touchTarget.min,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="chatbubble-ellipses" size={18} color={feature.chat.solid} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </Card>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Shared with your family" />
          {destinations.map((destination) => (
            <Pressable
              key={destination.key}
              onPress={destination.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${destination.label}. ${destination.detail}`}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, marginBottom: spacing.md }]}
            >
              <Card style={{ minHeight: touchTarget.large }}>
                <View style={styles.destinationRow}>
                  <View
                    style={[
                      styles.iconTile,
                      { backgroundColor: destination.toneMuted, borderRadius: radius.md },
                    ]}
                  >
                    <Ionicons name={destination.icon} size={20} color={destination.tone} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{destination.label}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                      {destination.detail}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  memberRow: { flexDirection: "row", alignItems: "center" },
  messageButton: { alignItems: "center", justifyContent: "center" },
  destinationRow: { flexDirection: "row", alignItems: "center" },
  iconTile: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
