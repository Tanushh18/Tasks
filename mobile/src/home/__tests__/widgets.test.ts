import AsyncStorage from "@react-native-async-storage/async-storage";
import { setStorageScope } from "../../offline/scope";
import { getWidgetPrefs } from "../widgets";

const STORAGE_KEY = "dt_home_widget_prefs";

describe("home widget preferences", () => {
  beforeEach(async () => {
    setStorageScope("widgets-user");
    await AsyncStorage.clear();
  });

  it("puts the Leads widget on the dashboard by default", async () => {
    const prefs = await getWidgetPrefs();
    expect(prefs.order).toContain("leads");
    expect(prefs.hidden).not.toContain("leads");
  });

  it("slots Leads in after Money for someone whose saved layout predates it, instead of burying it last", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ["today", "money", "comingUp", "activity"], hidden: [] })
    );

    const prefs = await getWidgetPrefs();
    expect(prefs.order).toEqual(["today", "money", "leads", "comingUp", "activity"]);
  });

  it("respects a custom order and a deliberately hidden widget", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ["activity", "comingUp", "money", "today"], hidden: ["comingUp"] })
    );

    const prefs = await getWidgetPrefs();
    // Follows the widget that precedes it by default (Money), wherever the person moved that.
    expect(prefs.order).toEqual(["activity", "comingUp", "money", "leads", "today"]);
    expect(prefs.hidden).toEqual(["comingUp"]);
  });

  it("drops widget ids that no longer exist", async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ["today", "retired", "money", "leads", "comingUp", "activity"], hidden: ["retired"] })
    );

    const prefs = await getWidgetPrefs();
    expect(prefs.order).not.toContain("retired");
    expect(prefs.hidden).toEqual([]);
  });
});
