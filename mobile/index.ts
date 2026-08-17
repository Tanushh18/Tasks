import notifee from '@notifee/react-native';
import { registerRootComponent } from 'expo';

import App from './App';
import { handleNotificationActionEvent } from './src/notifications/handleNotificationEvent';

// Must be registered outside the React tree, before the app mounts, or Android can't invoke it
// when the app is killed (e.g. tapping Mark Complete/Snooze on an alarm while the app isn't running).
notifee.onBackgroundEvent(handleNotificationActionEvent);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
