import { describe, expect, it } from "vitest";
import {
  loadDemoBundle,
  loadDraftFixture,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { hasValidOverlayHash } from "@/src/domain/canon-overlay";
import { hasValidSnapshotHash } from "@/src/domain/simulation";

describe("filesystem demo fixtures", () => {
  it("loads and validates every registry entry", async () => {
    const { registry } = await loadDemoBundle();
    const drafts = await Promise.all(registry.drafts.map(({ id }) => loadDraftFixture(id)));
    const overlays = await Promise.all(
      registry.overlays.map(({ id }) => loadOverlayFixture(id)),
    );
    const snapshots = await Promise.all(
      registry.snapshots.map(({ id }) => loadSnapshotFixture(id)),
    );

    expect(drafts).toHaveLength(7);
    expect(overlays.every(hasValidOverlayHash)).toBe(true);
    expect(snapshots.every(hasValidSnapshotHash)).toBe(true);
  });

  it("binds each snapshot to its complete overlay authority", async () => {
    const [overlayV0, overlayV1, s0, s0r, s1, s2, helen] = await Promise.all([
      loadOverlayFixture("overlay.v0"),
      loadOverlayFixture("overlay.v1.red-sail"),
      loadSnapshotFixture("snapshot.s0"),
      loadSnapshotFixture("snapshot.s0r"),
      loadSnapshotFixture("snapshot.s1"),
      loadSnapshotFixture("snapshot.s2"),
      loadSnapshotFixture("snapshot.helen_s0"),
    ]);

    expect([s0.overlayVersion, s0.canonHash]).toEqual([overlayV0.version, overlayV0.hash]);
    expect([helen.overlayVersion, helen.canonHash]).toEqual([
      overlayV0.version,
      overlayV0.hash,
    ]);
    for (const snapshot of [s0r, s1, s2]) {
      expect([snapshot.overlayVersion, snapshot.canonHash]).toEqual([
        overlayV1.version,
        overlayV1.hash,
      ]);
    }
    expect(s0r.turnIndex).toBe(s0.turnIndex);
    expect(s0r.variables).toEqual(s0.variables);
    expect(s0r.stateHash).not.toBe(s0.stateHash);
  });

  it("fails closed on an unknown fixture ID", async () => {
    await expect(loadDraftFixture("draft.missing")).rejects.toThrow(
      "Unknown drafts fixture: draft.missing",
    );
  });
});
