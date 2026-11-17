import type { ExpoConfig } from "expo/config";
import { withAndroidManifest } from "expo/config-plugins";

export default ({ config }: { config: ExpoConfig }): ExpoConfig =>
  withAndroidManifest(
    {
      ...config,
      extra: {
        ...config.extra,
        nativeMapsConfigured: !!process.env.GOOGLE_MAPS_API_KEY,
      },
      android: {
        ...config.android,
        config: process.env.GOOGLE_MAPS_API_KEY
          ? { googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } }
          : undefined,
      },
    },
    (androidConfig) => {
      const application = androidConfig.modResults.manifest.application?.[0];
      if (application)
        application.$["android:usesCleartextTraffic"] =
          process.env.ALLOW_HTTP_DEMO === "true" ? "true" : "false";
      return androidConfig;
    },
  );
