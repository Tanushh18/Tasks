import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as pollsApi from "../../api/polls";
import { Button } from "../../components/Button";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import type { PollsStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<PollsStackParamList, "PollForm">;

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;

export function PollFormScreen({ navigation }: Props) {
  const { colors, spacing, typography, touchTarget } = useTheme();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [saving, setSaving] = useState(false);

  function updateOption(index: number, text: string) {
    setOptions((prev) => prev.map((opt, i) => (i === index ? text : opt)));
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, ""]);
  }

  function removeOption(index: number) {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((opt) => opt.trim()).filter((opt) => opt.length > 0);

    if (!trimmedQuestion) {
      Alert.alert("Add a question", "What do you want to ask?");
      return;
    }
    if (trimmedOptions.length < MIN_OPTIONS) {
      Alert.alert("Add more options", `A poll needs at least ${MIN_OPTIONS} options.`);
      return;
    }

    setSaving(true);
    try {
      await pollsApi.createPoll({ question: trimmedQuestion, options: trimmedOptions });
      navigation.goBack();
    } catch (err) {
      Alert.alert("We couldn't create this poll", getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer>
      <TextField
        label="Question"
        value={question}
        onChangeText={setQuestion}
        placeholder="e.g. Pizza or tacos for Friday?"
        maxLength={300}
      />

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.xs }]}>
        Options ({MIN_OPTIONS}-{MAX_OPTIONS})
      </Text>
      {options.map((option, index) => (
        <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }}>
          <View style={{ flex: 1 }}>
            <TextField
              label={`Option ${index + 1}`}
              value={option}
              onChangeText={(text) => updateOption(index, text)}
              placeholder={`Option ${index + 1}`}
              maxLength={120}
            />
          </View>
          {options.length > MIN_OPTIONS ? (
            <Pressable
              onPress={() => removeOption(index)}
              accessibilityRole="button"
              accessibilityLabel={`Remove option ${index + 1}`}
              hitSlop={8}
              style={{ minHeight: touchTarget.min, minWidth: touchTarget.min, alignItems: "center", justifyContent: "center", marginTop: spacing.md }}
            >
              <Ionicons name="close-circle" size={22} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {options.length < MAX_OPTIONS ? (
        <Button label="Add option" variant="secondary" onPress={addOption} style={{ marginBottom: spacing.xl }} />
      ) : null}

      <Button label="Create poll" onPress={handleSave} loading={saving} />
    </ScreenContainer>
  );
}
