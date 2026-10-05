const { withGradleProperties } = require("@expo/config-plugins");

/** Gives the Gradle daemon (and the Kotlin/KSP compilers that run inside it) enough memory. The default
 * Expo template caps Metaspace at 512 MB, which makes `expo-updates:kspReleaseKotlin` fail with
 * "OutOfMemoryError: Metaspace" when the APK is built on a GitHub Actions runner. */
const SETTINGS = {
  "org.gradle.jvmargs": "-Xmx3584m -XX:MaxMetaspaceSize=1536m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8",
  "kotlin.daemon.jvmargs": "-Xmx2048m -XX:MaxMetaspaceSize=1024m",
};

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === "property" && item.key in SETTINGS));
    for (const [key, value] of Object.entries(SETTINGS)) cfg.modResults.push({ type: "property", key, value });
    return cfg;
  });
};
