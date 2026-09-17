import { describe, expect, it } from "vitest";
import { projectDocumentDiscoverySettingChanged } from "../../src/renderer/projectDocumentsRefresh";

describe("projectDocumentDiscoverySettingChanged (#501 slice 8 blocker fix)", () => {
  it("never fires on the initial (null) observation", () => {
    expect(projectDocumentDiscoverySettingChanged(null, false)).toBe(false);
    expect(projectDocumentDiscoverySettingChanged(null, true)).toBe(false);
  });

  it("fires when the observed value actually changes", () => {
    expect(projectDocumentDiscoverySettingChanged(false, true)).toBe(true);
    expect(projectDocumentDiscoverySettingChanged(true, false)).toBe(true);
  });

  it("does not fire when the value is unchanged", () => {
    expect(projectDocumentDiscoverySettingChanged(true, true)).toBe(false);
    expect(projectDocumentDiscoverySettingChanged(false, false)).toBe(false);
  });
});
