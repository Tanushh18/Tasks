// The API client now reads/writes its on-device cache through AsyncStorage, whose native module
// doesn't exist under Jest. The official in-memory mock stands in for it.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
