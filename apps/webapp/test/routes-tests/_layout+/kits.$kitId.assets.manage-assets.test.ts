/**
 * Tests for the checked-out status inheritance predicate shared between
 * `updateKitAssets` and the "Add assets" picker dialog (#2969, #2972).
 *
 * @see {@link file://../../../../app/modules/kit/service.server.ts}
 * @see {@link file://../../../../app/routes/_layout+/kits.$kitId.assets.manage-assets.tsx}
 */
import { BookingStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// @vitest-environment node

vi.mock("~/database/db.server", () => ({
  db: {
    bookingAsset: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "~/database/db.server";
import {
  getEligibleCheckedOutBookingIds,
  willKitPropagateCheckout,
} from "~/modules/kit/service.server";

describe("getEligibleCheckedOutBookingIds & willKitPropagateCheckout (#2972)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the kit is genuinely out on a live booking (all prior slices checked out, at least one not checked in)", async () => {
    vi.mocked(db.bookingAsset.findMany).mockResolvedValue([
      {
        bookingId: "booking-1",
        checkedOutAt: new Date("2026-10-01T10:00:00Z"),
        checkedInAt: null,
      },
      {
        bookingId: "booking-1",
        checkedOutAt: new Date("2026-10-01T10:00:00Z"),
        checkedInAt: new Date("2026-10-02T10:00:00Z"),
      },
    ] as never);

    expect(
      await willKitPropagateCheckout({
        assetKitIds: ["ak-1", "ak-2"],
        organizationId: "org-1",
      })
    ).toBe(true);

    expect(db.bookingAsset.findMany).toHaveBeenCalledWith({
      where: {
        assetKitId: { in: ["ak-1", "ak-2"] },
        booking: {
          organizationId: "org-1",
          status: { in: [BookingStatus.ONGOING, BookingStatus.OVERDUE] },
        },
      },
      select: {
        bookingId: true,
        checkedOutAt: true,
        checkedInAt: true,
      },
    });
  });

  it("returns false when Kit.status is stale and no live booking holds checked-out slices", async () => {
    vi.mocked(db.bookingAsset.findMany).mockResolvedValue([] as never);

    expect(
      await willKitPropagateCheckout({
        assetKitIds: ["ak-1"],
        organizationId: "org-1",
      })
    ).toBe(false);
  });

  it("returns false when the kit has no existing members", async () => {
    expect(
      await willKitPropagateCheckout({
        assetKitIds: [],
        organizationId: "org-1",
      })
    ).toBe(false);
    expect(db.bookingAsset.findMany).not.toHaveBeenCalled();
  });

  it("returns false when a live booking exists but this kit was never scanned out or only partly scanned out", () => {
    // Booking is ONGOING (another item was scanned), but this kit's slices never left
    expect(
      getEligibleCheckedOutBookingIds([
        { bookingId: "booking-1", checkedOutAt: null, checkedInAt: null },
      ])
    ).toEqual([]);

    // Progressive checkout: one member left, one stayed behind
    expect(
      getEligibleCheckedOutBookingIds([
        {
          bookingId: "booking-1",
          checkedOutAt: new Date("2026-10-01T10:00:00Z"),
          checkedInAt: null,
        },
        { bookingId: "booking-1", checkedOutAt: null, checkedInAt: null },
      ])
    ).toEqual([]);

    // Every slice of this kit already came back on the live booking
    expect(
      getEligibleCheckedOutBookingIds([
        {
          bookingId: "booking-1",
          checkedOutAt: new Date("2026-10-01T10:00:00Z"),
          checkedInAt: new Date("2026-10-02T10:00:00Z"),
        },
      ])
    ).toEqual([]);
  });
});
