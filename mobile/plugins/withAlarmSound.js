const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/** Copies assets/sounds/alarm.wav into the Android res/raw directory during prebuild, so it can
 * be referenced as a notification channel sound ("alarm") instead of relying on the OS default. */
module.exports = function withAlarmSound(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const srcPath = path.join(config.modRequest.projectRoot, "assets", "sounds", "alarm.wav");
      const rawDir = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "res", "raw");
      fs.mkdirSync(rawDir, { recursive: true });
      fs.copyFileSync(srcPath, path.join(rawDir, "alarm.wav"));
      return config;
    },
  ]);
};
