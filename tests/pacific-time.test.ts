import { expect, it } from "vitest";
import { pacificToIso, showPacific } from "@/lib/pacific-time";

it("reads the seller's start time as Pacific time", () => {
  expect(pacificToIso("2026-11-20T09:30")).toBe("2026-11-20T17:30:00.000Z"); // PST = UTC−8
  expect(pacificToIso("2026-07-01T09:30")).toBe("2026-07-01T16:30:00.000Z"); // PDT = UTC−7
  expect(showPacific("2026-11-20T17:30:00.000Z")).toMatch(/Nov 20, 9:30\sAM PST/);
  expect(() => pacificToIso("tomorrow")).toThrow();
});
