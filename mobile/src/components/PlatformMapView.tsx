// react-native-maps has no web renderer at all (it throws on import), so
// this native implementation is only ever bundled for iOS/Android. Web gets
// PlatformMapView.web.tsx instead via Metro's platform extension resolution.
export { default, Marker, PROVIDER_DEFAULT, UrlTile } from "react-native-maps";
