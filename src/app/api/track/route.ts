import { maskPhone, getSessionUser } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { CATEGORY_LABELS } from "@/lib/constants";
import { districtByCode } from "@/lib/districts";
import { accessLevelFor, publicStatusNote } from "@/lib/citizen";
import { getRecentTrackable } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Status tracking with layered access:
 *  - OWNER (signed-in reporter or holder of the tracking code) and GOVERNMENT:
 *    full record, history notes, contact masked, no raw coordinates.
 *  - PUBLIC_LIMITED (ID alone): status timeline only — no description, no notes,
 *    no personal data. This prevents strangers from reading someone's report.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const type = (url.searchParams.get("type") ?? "").toUpperCase();
    const suppliedCode = url.searchParams.get("code")?.trim() || null;
    if (!id) return fail("Provide an incident or SOS ID", 422);
    if (!["INCIDENT", "SOS"].includes(type)) return fail("type must be INCIDENT or SOS", 422);

    const result = await getRecentTrackable(type as "INCIDENT" | "SOS", id);
    if (!result) return fail("No record found for that ID", 404);

    const user = await getSessionUser().catch(() => null);
    const access = accessLevelFor({
      user,
      reporterUserId: result.record.reporterUserId ?? null,
      trackingCodeHash: result.record.trackingCodeHash ?? null,
      suppliedCode,
    });
    const full = access === "OWNER" || access === "GOVERNMENT";

    const timeline = result.events.map((event) => ({
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: full ? event.note : publicStatusNote(event.action),
      actorRole: full ? event.actorRole : "OFFICIAL",
      createdAt: event.createdAt,
    }));
    const latest = timeline[0] ?? null;

    if (result.kind === "INCIDENT") {
      const record = result.record;
      const district = districtByCode(record.districtCode);
      const base = {
        publicId: record.publicId,
        category: record.category,
        categoryLabel: CATEGORY_LABELS[record.category] ?? record.category,
        status: record.status,
        district: district?.name ?? record.districtCode,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        verifiedAt: record.verifiedAt,
        resolvedAt: record.resolvedAt,
        dataClass: record.dataClass,
        accessLevel: access,
        latestUpdate: latest ? { status: latest.toStatus, note: latest.note, at: latest.createdAt } : null,
        requiresCode: !full && Boolean(record.trackingCodeHash),
        hasTrackingCode: Boolean(record.trackingCodeHash),
        linkedToAccount: record.reporterUserId !== null,
      };

      return ok(
        {
          kind: "INCIDENT",
          accessLevel: access,
          record: full
            ? {
                ...base,
                description: record.description,
                locationName: record.locationName,
                reportedSeverity: record.reportedSeverity,
                assessedSeverity: record.assessedSeverity,
                contactPhoneMasked: maskPhone(record.contactPhone),
                contactName: record.contactName,
                resolutionNote: record.resolutionNote,
                photoUrl: record.photoUrl,
              }
            : {
                ...base,
                locationName: null,
                reportedSeverity: null,
                assessedSeverity: null,
                description: null,
                contactPhoneMasked: null,
                resolutionNote: null,
                photoUrl: null,
              },
          events: timeline,
          note: full
            ? "You can see the full record because you hold the tracking code or are signed in as its reporter. Contact numbers stay masked."
            : "For privacy, the report's description, location, notes and personal details are hidden. Enter the tracking code issued at submission, or sign in as the reporter, to see them.",
        },
        undefined,
        "Tracking information retrieved successfully",
      );
    }

    const record = result.record;
    const district = districtByCode(record.districtCode);
    const base = {
      publicId: record.publicId,
      status: record.status,
      priority: record.priority,
      emergencyType: record.emergencyType,
      district: district?.name ?? record.districtCode,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      resolvedAt: record.resolvedAt,
      assignedTeamName: record.assignedTeamName,
      dataClass: record.dataClass,
      accessLevel: access,
      latestUpdate: latest ? { status: latest.toStatus, note: latest.note, at: latest.createdAt } : null,
      requiresCode: !full && Boolean(record.trackingCodeHash),
      hasTrackingCode: Boolean(record.trackingCodeHash),
      linkedToAccount: record.reporterUserId !== null,
    };

    return ok(
      {
        kind: "SOS",
        accessLevel: access,
        record: full
          ? {
              ...base,
              description: record.description,
              locationName: record.locationName,
              resolutionNote: record.resolutionNote,
              phoneMasked: maskPhone(record.phone),
              aiSummary: record.aiSummary,
            }
          : { ...base, description: null, locationName: null, resolutionNote: null, phoneMasked: null, aiSummary: null },
        events: timeline,
        note: full
          ? "An SOS submission does not guarantee dispatch. Call 112 / 108 / 101 directly in a life-threatening emergency."
          : "For privacy, the emergency description and personal details are hidden. Enter the tracking code, or sign in, to view them. An SOS submission does not guarantee dispatch — call 112 / 108 / 101 in a life-threatening emergency.",
      },
      undefined,
      "Tracking information retrieved successfully",
    );
  } catch (error) {
    return handleError(error);
  }
}
