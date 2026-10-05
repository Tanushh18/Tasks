import notifee from '@notifee/react-native';
import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';
import { runUpiHeadlessTask } from './src/expenses/upiExpenseSync';
import { registerUpiImportForegroundService } from './src/expenses/upiImportService';
import { handleNotificationActionEvent } from './src/notifications/handleNotificationEvent';
import { confirmOtaBoot } from './src/updates/githubOta';

// Must be registered outside the React tree, before the app mounts, or Android can't invoke it
// when the app is killed (e.g. tapping Mark Complete/Snooze on an alarm while the app isn't running).
notifee.onBackgroundEvent(handleNotificationActionEvent);

// Foreground-service runner for the UPI old-message import (keeps it running with the app in the
// background). Must also be registered at app entry.
registerUpiImportForegroundService();

// Started by the native SMS receiver (modules/sms-expense-reader) when a bank SMS arrives while the app is
// closed: saves it to Money with no UI. Harmless on APKs without the native module (never invoked).
AppRegistry.registerHeadlessTask('UpiSmsSync', () => async () => {
  // This process may never render the app, so it must confirm the OTA bundle itself or it would be rolled back.
  void confirmOtaBoot();
  try {
    await runUpiHeadlessTask();
  } catch {
    // The next app open / inbox scan retries.
  }
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
