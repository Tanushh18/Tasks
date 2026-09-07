import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { NoteFormScreen } from "../screens/notes/NoteFormScreen";
import { NotesListScreen } from "../screens/notes/NotesListScreen";
import type { NotesStackParamList } from "./types";

const Stack = createNativeStackNavigator<NotesStackParamList>();

export function NotesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="NotesList" component={NotesListScreen} />
      <Stack.Screen name="NoteForm" component={NoteFormScreen} options={{ headerShown: true, title: "" }} />
    </Stack.Navigator>
  );
}
