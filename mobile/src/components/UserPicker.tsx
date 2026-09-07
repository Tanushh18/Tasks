import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { searchUsers, type UserSearchResult } from "../api/users";
import { useTheme } from "../theme/useTheme";

const SEARCH_DEBOUNCE_MS = 300;

type SingleProps = {
  mode: "single";
  value: UserSearchResult | null;
  onChange: (value: UserSearchResult | null) => void;
};

type MultiProps = {
  mode: "multi";
  value: UserSearchResult[];
  onChange: (value: UserSearchResult[]) => void;
};

type Props = (SingleProps | MultiProps) & {
  placeholder?: string;
  /** Excludes these ids from results — typically the current user. */
  excludeIds?: string[];
};

/**
 * Debounced-search picker for choosing one or more registered users by name. Selected people show
 * as removable chips above the input; matches appear as a dropdown list below it while typing.
 */
export function UserPicker(props: Props) {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();
  const { placeholder, excludeIds } = props;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  const selected: UserSearchResult[] = props.mode === "single" ? (props.value ? [props.value] : []) : props.value;

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const seq = ++requestSeq.current;
      try {
        const found = await searchUsers(trimmed);
        if (seq !== requestSeq.current) return;
        const selectedIds = new Set(selected.map((u) => u.id));
        setResults(found.filter((u) => !selectedIds.has(u.id) && !excludeIds?.includes(u.id)));
      } catch {
        if (seq === requestSeq.current) setResults([]);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, excludeIds]);

  function selectUser(user: UserSearchResult) {
    if (props.mode === "single") {
      props.onChange(user);
    } else {
      props.onChange([...props.value, user]);
    }
    setQuery("");
    setResults([]);
  }

  function removeUser(id: string) {
    if (props.mode === "single") {
      props.onChange(null);
    } else {
      props.onChange(props.value.filter((u) => u.id !== id));
    }
  }

  return (
    <View>
      {selected.length > 0 ? (
        <View style={[styles.chipRow, { marginBottom: spacing.sm }]}>
          {selected.map((user) => (
            <View
              key={user.id}
              style={[
                styles.chip,
                { backgroundColor: colors.primaryMuted, borderRadius: radius.pill, paddingHorizontal: spacing.md },
              ]}
            >
              <Text style={[typography.captionStrong, { color: colors.primary }]}>{user.name}</Text>
              <Pressable onPress={() => removeUser(user.id)} hitSlop={8} style={{ marginLeft: spacing.xs }}>
                <Ionicons name="close-circle" size={16} color={colors.primary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {props.mode === "single" && selected.length > 0 ? null : (
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
              minHeight: touchTarget.comfortable,
            },
          ]}
        >
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder ?? "Search people by name"}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Search people by name"
            style={[styles.searchInput, { color: colors.text, minHeight: touchTarget.comfortable }]}
          />
          {loading ? <ActivityIndicator size="small" color={colors.textFaint} /> : null}
        </View>
      )}

      {query.trim() && results.length > 0 ? (
        <View
          style={[
            styles.dropdown,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.xs },
          ]}
        >
          {results.map((user) => (
            <Pressable
              key={user.id}
              onPress={() => selectUser(user)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.dropdownRow,
                { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[typography.body, { color: colors.text }]}>{user.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : query.trim() && !loading ? (
        <Text style={[typography.caption, { color: colors.textFaint, marginTop: spacing.xs }]}>
          No matching people found.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", height: 32 },
  searchBar: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 16 },
  dropdown: { borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  dropdownRow: {},
});
