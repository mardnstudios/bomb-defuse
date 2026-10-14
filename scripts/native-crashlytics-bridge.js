import { Capacitor } from "@capacitor/core";
import { FirebaseCrashlytics } from "@capacitor-firebase/crashlytics";

const bridge = Object.freeze({
  isNativePlatform: () => Capacitor.isNativePlatform(),
  setEnabled: enabled => FirebaseCrashlytics.setEnabled({ enabled }),
  deleteUnsentReports: () => FirebaseCrashlytics.deleteUnsentReports(),
});

Object.defineProperty(window, "BombDefuseNativeCrashlytics", {
  configurable: false,
  enumerable: false,
  value: bridge,
  writable: false,
});
