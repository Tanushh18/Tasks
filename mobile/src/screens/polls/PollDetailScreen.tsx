import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as pollsApi from "../../api/polls";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SkeletonLines } from "../../components/Skeleton";
import { ErrorState } from "../../components/StateViews";
import type { PollsStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<PollsStackParamList, "PollDetail">;

export function PollDetailScreen({ route }: Props) {
  const { pollId } = route.params;
  const { colors, spacing, radius, typography, touchTarget } = useTheme();
  const { user } = useAuth();

  const [poll, setPoll] = useState<pollsApi.Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPoll(await pollsApi.getPoll(pollId));
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load this poll."));
    } finally {
      setLoading(false);
    }
  }, [pollId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleVote(optionIndex: number) {
    if (!poll || poll.closed || voting) return;
    setVoting(true);
    try {
      setPoll(await pollsApi.votePoll(poll.id, optionIndex));
    } catch (err) {
      Alert.alert("We couldn't record your vote", getApiErrorMessage(err));
    } finally {
      setVoting(false);
    }
  }

  async function handleClose() {
    if (!poll) return;
    setClosing(true);
    try {
      setPoll(await pollsApi.closePoll(poll.id));
    } catch (err) {
      Alert.alert("We couldn't close this poll", getApiErrorMessage(err));
    } finally {
      setClosing(false);
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <SkeletonLines count={5} />
      </ScreenContainer>
    );
  }

  if (error || !poll) {
    return (
      <ScreenContainer>
        <ErrorState message={error ?? "Poll not found."} onRetry={load} />
      </ScreenContainer>
    );
  }

  const hasVoted = poll.myVote !== null;
  const canVote = !poll.closed;
  const isCreator = poll.createdBy?.id === user?.id;

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
        {poll.question}
      </Text>
      <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xl }]}>
        {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}
        {poll.createdBy ? ` · by ${poll.createdBy.name}` : ""}
        {poll.closed ? " · closed" : ""}
      </Text>

      {poll.options.map((option, index) => {
        const count = poll.counts[index] ?? 0;
        const percent = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
        const isMine = poll.myVote === index;
        const showResults = poll.closed || hasVoted;

        const content = (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: isMine ? 2 : 1,
              borderColor: isMine ? colors.primary : colors.border,
              padding: spacing.md,
              marginBottom: spacing.md,
              minHeight: touchTarget.large,
              justifyContent: "center",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={[typography.bodyStrong, { color: colors.text, flexShrink: 1 }]}>{option}</Text>
              {isMine ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
              {showResults ? (
                <Text style={[typography.captionStrong, { color: colors.textMuted, marginLeft: spacing.sm }]}>
                  {percent}%
                </Text>
              ) : null}
            </View>
            {showResults ? (
              <View
                style={{
                  height: 8,
                  borderRadius: radius.pill,
                  backgroundColor: colors.surfaceAlt,
                  marginTop: spacing.sm,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    width: `${percent}%`,
                    borderRadius: radius.pill,
                    backgroundColor: isMine ? colors.primary : colors.primaryMuted,
                  }}
                />
              </View>
            ) : null}
          </View>
        );

        if (!canVote || hasVoted) {
          return <View key={index}>{content}</View>;
        }

        return (
          <Pressable
            key={index}
            onPress={() => handleVote(index)}
            disabled={voting}
            accessibilityRole="button"
            accessibilityLabel={`Vote for ${option}`}
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
          >
            {content}
          </Pressable>
        );
      })}

      {canVote && hasVoted ? (
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
          You voted. Results are shown above.
        </Text>
      ) : null}

      {isCreator && !poll.closed ? (
        <Button
          label="Close poll"
          variant="secondary"
          onPress={handleClose}
          loading={closing}
          style={{ marginTop: spacing.xl }}
        />
      ) : null}
    </ScreenContainer>
  );
}
