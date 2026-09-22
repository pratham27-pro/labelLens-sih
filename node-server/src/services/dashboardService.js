import prisma from "../config/db.js";
import { ROLES } from "../constants/rbac.js";
import { SecurityScopingError } from "./dataScopingService.js";

// ---------------------------------------------------------------------------
// Helper: insensitive string match for district/state fields
// ---------------------------------------------------------------------------
function districtWhere(district) {
  return { equals: String(district).trim(), mode: "insensitive" };
}
function stateWhere(state) {
  return { equals: String(state).trim(), mode: "insensitive" };
}

// Midnight local time today — used for "scans today" counters.
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns dashboard compliance analytics for a Controller's jurisdiction.
 * Scope: the controller's STATE when set, falling back to their DISTRICT.
 * Fails closed when neither hierarchical attribute is assigned.
 * Used by CONTROLLER role (`dashboard:jurisdiction`).
 *
 * @param {import("../constants/rbac.js").AuthenticatedUserContext} user
 */
export async function getJurisdictionDashboard(user) {
  const hasState = !!user.state && String(user.state).trim();
  const hasDistrict = !!user.district && String(user.district).trim();

  if (!hasState && !hasDistrict) {
    throw new SecurityScopingError(
      "CONTROLLER has no assigned state or district. Jurisdiction dashboard unavailable."
    );
  }

  // Hierarchical scope: prefer state (command-center view), fall back to district.
  const scope = hasState
    ? { inspector: { state: stateWhere(user.state) } }
    : { inspector: { district: districtWhere(user.district) } };
  const scopeLabel = hasState ? "STATE" : "DISTRICT";
  const scopeValue = hasState ? user.state.trim() : user.district.trim();

  const [
    totalInspections,
    compliantCount,
    nonCompliantCount,
    totalViolations,
    majorViolations,
    inspectorsInScope,
    pendingComplaints,
    recentInspections,
    escalatedComplaints,
    escalatedInspections,
    majorViolationInspections,
  ] = await Promise.all([
    prisma.inspection.count({ where: scope }),
    prisma.inspection.count({ where: { ...scope, status: "COMPLIANT" } }),
    prisma.inspection.count({ where: { ...scope, status: "NON_COMPLIANT" } }),
    prisma.violation.count({ where: { inspection: scope } }),
    prisma.violation.count({ where: { severity: "MAJOR", inspection: scope } }),
    prisma.user.findMany({
      where: hasState
        ? { role: ROLES.INSPECTOR, state: stateWhere(user.state) }
        : { role: ROLES.INSPECTOR, district: districtWhere(user.district) },
      select: {
        id: true,
        fullName: true,
        email: true,
        badgeNumber: true,
        employeeId: true,
        district: true,
        _count: { select: { inspections: true } },
      },
    }),
    prisma.complaint.count({
      where: hasState
        ? { state: stateWhere(user.state), status: "PENDING" }
        : { district: districtWhere(user.district), status: "PENDING" },
    }),
    prisma.inspection.findMany({
      where: scope,
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        complianceScore: true,
        createdAt: true,
        inspector: { select: { fullName: true, badgeNumber: true } },
        product: { select: { brandName: true, commodityName: true } },
      },
    }),
    // ESCALATED complaints needing administrative action
    prisma.complaint.findMany({
      where: hasState
        ? { state: stateWhere(user.state), status: "ESCALATED" }
        : { district: districtWhere(user.district), status: "ESCALATED" },
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        district: true,
        createdAt: true,
        consumer: { select: { id: true, fullName: true } },
        inspection: { select: { id: true, status: true, complianceScore: true } },
      },
    }),
    // Escalation hub part 1: inspections flagged ESCALATED by reviewers
    prisma.inspection.findMany({
      where: { ...scope, status: "ESCALATED" },
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        complianceScore: true,
        createdAt: true,
        annotatedImagePath: true,
        imagePath: true,
        inspector: { select: { id: true, fullName: true, badgeNumber: true, district: true } },
        product: { select: { brandName: true, commodityName: true } },
        violations: { select: { id: true, ruleCode: true, severity: true, title: true } },
      },
    }),
    // Escalation hub part 2: inspections carrying MAJOR violations
    prisma.inspection.findMany({
      where: { ...scope, violations: { some: { severity: "MAJOR" } } },
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        complianceScore: true,
        createdAt: true,
        annotatedImagePath: true,
        imagePath: true,
        inspector: { select: { id: true, fullName: true, badgeNumber: true, district: true } },
        product: { select: { brandName: true, commodityName: true } },
        violations: { select: { id: true, ruleCode: true, severity: true, title: true } },
      },
    }),
  ]);

  // District breakdown: aggregate per-inspector results by district.
  // Prisma cannot groupBy through a relation, so group on inspectorId and
  // join the (small) inspector→district mapping in memory.
  const perInspector = await prisma.inspection.groupBy({
    by: ["inspectorId"],
    where: scope,
    _count: { id: true },
    _avg: { complianceScore: true },
  });

  const inspectorDistricts = new Map(
    inspectorsInScope.map((i) => [i.id, i.district || "Unassigned"])
  );
  const districtMap = new Map();
  for (const row of perInspector) {
    const district = inspectorDistricts.get(row.inspectorId) || "Unassigned";
    const entry = districtMap.get(district) || {
      district,
      total_inspections: 0,
      avg_compliance_score: 0,
    };
    const prevTotal = entry.total_inspections;
    const prevAvg = entry.avg_compliance_score;
    const rowTotal = row._count.id;
    const rowAvg = row._avg.complianceScore ?? 0;
    entry.total_inspections = prevTotal + rowTotal;
    entry.avg_compliance_score =
      prevTotal + rowTotal > 0
        ? Number(
            (
              (prevAvg * prevTotal + rowAvg * rowTotal) /
              (prevTotal + rowTotal)
            ).toFixed(2)
          )
        : 0;
    districtMap.set(district, entry);
  }
  const districtBreakdown = [...districtMap.values()].sort(
    (a, b) => b.total_inspections - a.total_inspections
  );

  // Pending complaints per district across the state
  const complaintGroups = await prisma.complaint.groupBy({
    by: ["district"],
    where: hasState
      ? { state: stateWhere(user.state), status: "PENDING" }
      : { district: districtWhere(user.district), status: "PENDING" },
    _count: { id: true },
  });
  const pendingByDistrict = new Map(
    complaintGroups.map((g) => [g.district || "Unassigned", g._count.id])
  );
  for (const row of districtBreakdown) {
    row.pending_complaints = pendingByDistrict.get(row.district) || 0;
  }

  // Top offender organizations: manufacturers whose products drew the most
  // MAJOR violations in scope. Violations join to organizations only through
  // inspections, so group on inspectionId then aggregate by manufacturer.
  const majorViolationGroups = await prisma.violation.groupBy({
    by: ["inspectionId"],
    where: { severity: "MAJOR", inspection: scope },
    _count: { id: true },
  });
  const inspectionIds = majorViolationGroups.map((g) => g.inspectionId);
  const inspectionsWithOrg = await prisma.inspection.findMany({
    where: { id: { in: inspectionIds } },
    select: {
      manufacturerId: true,
      manufacturer: { select: { id: true, name: true, type: true, state: true } },
    },
  });
  const violationCountByInspection = new Map(
    majorViolationGroups.map((g) => [g.inspectionId, g._count.id])
  );
  const orgMap = new Map();
  for (const insp of inspectionsWithOrg) {
    const count = violationCountByInspection.get(insp.id) || 0;
    const org = insp.manufacturer;
    const key = org?.id || "__UNAFFILIATED__";
    const entry = orgMap.get(key) || {
      organization_id: org?.id || null,
      organization_name: org?.name || "Unaffiliated / Local Brand",
      organization_type: org?.type || "UNKNOWN",
      major_violations: 0,
    };
    entry.major_violations += count;
    orgMap.set(key, entry);
  }
  const topOffenders = [...orgMap.values()]
    .sort((a, b) => b.major_violations - a.major_violations)
    .slice(0, 8);

  // Escalation hub = reviewer-escalated records OR inspections carrying
  // MAJOR violations (de-duplicated, newest first).
  const hubMap = new Map();
  for (const insp of [...escalatedInspections, ...majorViolationInspections]) {
    if (!hubMap.has(insp.id)) hubMap.set(insp.id, insp);
  }
  const escalationHub = [...hubMap.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 12);

  const complianceRate =
    totalInspections > 0
      ? Number(((compliantCount / totalInspections) * 100).toFixed(2))
      : 100.0;

  return {
    scope: scopeLabel,
    state: hasState ? user.state.trim() : null,
    district: hasDistrict ? user.district.trim() : null,
    metrics: {
      total_inspections: totalInspections,
      compliant_inspections: compliantCount,
      non_compliant_inspections: nonCompliantCount,
      compliance_rate_percent: complianceRate,
      total_violations_detected: totalViolations,
      major_violations: majorViolations,
      active_inspectors_count: inspectorsInScope.length,
      pending_consumer_complaints: pendingComplaints,
      escalated_complaints_count: escalatedComplaints.length,
      escalation_hub_count: escalationHub.length,
    },
    district_breakdown: districtBreakdown,
    top_offenders: topOffenders,
    escalation_hub: escalationHub,
    escalated_complaints: escalatedComplaints,
    inspectors: inspectorsInScope,
    recent_inspections: recentInspections,
  };
}

/**
 * Returns global nation-wide compliance analytics for the DIRECTOR.
 * Entirely aggregated (no raw inspection rows leave the DB). Supports an
 * optional lookback window in days (7 / 30 / YTD) that filters every metric.
 *
 * @param {import("../constants/rbac.js").AuthenticatedUserContext} user
 * @param {{ days?: number|string }} [options]
 */
export async function getGlobalDashboard(user, options = {}) {
  // Acceptable windows: 7, 30, or year-to-date (computed). Anything else
  // defaults to 30.
  let days = parseInt(options.days, 10);
  if (!Number.isFinite(days) || days <= 0) days = 30;
  days = Math.min(days, 366);

  let rangeStart;
  if (options.days === "ytd") {
    rangeStart = new Date(new Date().getFullYear(), 0, 1);
  } else {
    rangeStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
  const rangeWhere = { createdAt: { gte: rangeStart } };

  const [
    totalInspections,
    compliantCount,
    nonCompliantCount,
    totalViolations,
    totalOfficers,
    totalComplaints,
    topViolationRules,
    perInspectorAgg,
    inspectorsStates,
    complaintCountInRange,
    reportGroupsInRange,
    inspectionDates,
    reportDates,
  ] = await Promise.all([
    prisma.inspection.count({ where: rangeWhere }),
    prisma.inspection.count({ where: { ...rangeWhere, status: "COMPLIANT" } }),
    prisma.inspection.count({ where: { ...rangeWhere, status: "NON_COMPLIANT" } }),
    prisma.violation.count({ where: { inspection: rangeWhere } }),
    prisma.user.count({
      where: {
        role: { in: [ROLES.INSPECTOR, ROLES.CONTROLLER, ROLES.REVIEWER] },
      },
    }),
    prisma.complaint.count(),
    prisma.violation.groupBy({
      by: ["ruleCode", "severity"],
      where: { inspection: rangeWhere },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 8,
    }),
    // State leaderboard: Prisma cannot groupBy through the inspector
    // relation, so group on inspectorId and join the (small) inspector →
    // state mapping in memory.
    prisma.inspection.groupBy({
      by: ["inspectorId"],
      where: rangeWhere,
      _count: { id: true },
      _avg: { complianceScore: true },
    }),
    prisma.user.findMany({
      where: { role: { in: [ROLES.INSPECTOR, ROLES.CONTROLLER] } },
      select: { id: true, state: true },
    }),
    prisma.complaint.count({ where: rangeWhere }),
    prisma.report.groupBy({
      by: ["reportType"],
      where: rangeWhere,
      _count: { id: true },
    }),
    // Enforcement velocity: single-column date fetches bucketed in memory
    // (bounded by the range window; far cheaper than raw row downloads).
    prisma.inspection.findMany({
      where: rangeWhere,
      select: { createdAt: true },
    }),
    prisma.report.findMany({
      where: rangeWhere,
      select: { createdAt: true },
    }),
  ]);

  // --- State leaderboard ----------------------------------------------------
  const stateByInspector = new Map(
    inspectorsStates
      .filter((i) => i.state)
      .map((i) => [i.id, i.state.trim()])
  );
  const stateMap = new Map();
  for (const row of perInspectorAgg) {
    const state = stateByInspector.get(row.inspectorId);
    if (!state) continue; // inspections without a state-affiliated inspector
    const entry = stateMap.get(state) || {
      state,
      total_inspections: 0,
      avg_compliance_score: 0,
    };
    const prevTotal = entry.total_inspections;
    const prevAvg = entry.avg_compliance_score;
    const rowTotal = row._count.id;
    const rowAvg = row._avg.complianceScore ?? 0;
    entry.total_inspections = prevTotal + rowTotal;
    entry.avg_compliance_score =
      prevTotal + rowTotal > 0
        ? Number(
            (
              (prevAvg * prevTotal + rowAvg * rowTotal) /
              (prevTotal + rowTotal)
            ).toFixed(2)
          )
        : 0;
    stateMap.set(state, entry);
  }
  const stateLeaderboard = [...stateMap.values()].sort(
    (a, b) => b.avg_compliance_score - a.avg_compliance_score
  );

  // --- Enforcement velocity (daily buckets) ---------------------------------
  const bucketFor = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const velocity = new Map();
  for (const { createdAt } of inspectionDates) {
    const key = bucketFor(createdAt);
    const entry = velocity.get(key) || { date: key, inspections: 0, reports: 0 };
    entry.inspections += 1;
    velocity.set(key, entry);
  }
  for (const { createdAt } of reportDates) {
    const key = bucketFor(createdAt);
    const entry = velocity.get(key) || { date: key, inspections: 0, reports: 0 };
    entry.reports += 1;
    velocity.set(key, entry);
  }
  const enforcementVelocity = [...velocity.values()].sort((a, b) =>
    a.date < b.date ? -1 : 1
  );

  const complianceRate =
    totalInspections > 0
      ? Number(((compliantCount / totalInspections) * 100).toFixed(2))
      : 100.0;

  return {
    scope: "GLOBAL",
    range: {
      days: options.days === "ytd" ? "ytd" : days,
      start: rangeStart.toISOString(),
    },
    metrics: {
      total_inspections: totalInspections,
      compliant_inspections: compliantCount,
      non_compliant_inspections: nonCompliantCount,
      overall_compliance_rate_percent: complianceRate,
      total_violations_recorded: totalViolations,
      total_active_enforcement_officers: totalOfficers,
      total_consumer_complaints: totalComplaints,
      complaints_in_range: complaintCountInRange,
      reports_in_range: reportGroupsInRange.reduce((sum, g) => sum + g._count.id, 0),
    },
    state_leaderboard: stateLeaderboard,
    top_statutory_violations: topViolationRules.map((v) => ({
      rule_code: v.ruleCode,
      severity: v.severity,
      occurrences: v._count.id,
    })),
    enforcement_velocity: enforcementVelocity,
  };
}

/**
 * Returns personal dashboard stats for an individual INSPECTOR.
 * Scoped strictly to inspections where inspectorId === user.id.
 *
 * @param {import("../constants/rbac.js").AuthenticatedUserContext} user
 */
export async function getInspectorDashboard(user) {
  if (user.role.toUpperCase() !== ROLES.INSPECTOR) {
    throw new SecurityScopingError("Inspector dashboard is restricted to INSPECTOR role.");
  }

  const ownScope = { inspectorId: user.id };

  const [
    totalInspections,
    compliantCount,
    nonCompliantCount,
    pendingCount,
    totalViolations,
    majorViolations,
    triagedComplaints,
    recentInspections,
    topViolationRules,
    assignedTasks,
    scansToday,
  ] = await Promise.all([
    prisma.inspection.count({ where: ownScope }),
    prisma.inspection.count({ where: { ...ownScope, status: "COMPLIANT" } }),
    prisma.inspection.count({ where: { ...ownScope, status: "NON_COMPLIANT" } }),
    prisma.inspection.count({ where: { ...ownScope, status: "PENDING" } }),
    prisma.violation.count({ where: { inspection: ownScope } }),
    prisma.violation.count({ where: { severity: "MAJOR", inspection: ownScope } }),
    // TRIAGED complaints in their district (assigned to them to act on)
    user.district
      ? prisma.complaint.count({
          where: {
            district: districtWhere(user.district),
            status: "TRIAGED",
          },
        })
      : Promise.resolve(0),
    prisma.inspection.findMany({
      where: ownScope,
      take: 12,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        complianceScore: true,
        createdAt: true,
        imagePath: true,
        annotatedImagePath: true,
        product: {
          select: {
            id: true,
            brandName: true,
            commodityName: true,
            category: true,
          },
        },
        manufacturer: {
          select: { id: true, name: true, type: true },
        },
        violations: {
          select: { id: true, ruleCode: true, severity: true, title: true },
        },
        reviewer: {
          select: { id: true, fullName: true },
        },
      },
    }),
    prisma.violation.groupBy({
      by: ["ruleCode", "severity"],
      where: { inspection: ownScope },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
    // Unresolved TRIAGED complaints in the inspector's district — tasks to
    // complete. inspectionId: null means no field inspection has been
    // produced for the complaint yet.
    user.district
      ? prisma.complaint.findMany({
          where: {
            district: districtWhere(user.district),
            status: "TRIAGED",
            inspectionId: null,
          },
          take: 20,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            district: true,
            createdAt: true,
            consumer: {
              select: { id: true, fullName: true },
            },
          },
        })
      : Promise.resolve([]),
    prisma.inspection.count({
      where: { ...ownScope, createdAt: { gte: startOfToday() } },
    }),
  ]);

  const complianceRate =
    totalInspections > 0
      ? Number(((compliantCount / totalInspections) * 100).toFixed(2))
      : 100.0;

  return {
    scope: "INSPECTOR",
    inspector: {
      id: user.id,
      fullName: user.fullName,
      district: user.district,
      state: user.state,
      badgeNumber: user.badgeNumber,
      employeeId: user.employeeId,
    },
    metrics: {
      total_inspections: totalInspections,
      compliant_inspections: compliantCount,
      non_compliant_inspections: nonCompliantCount,
      pending_inspections: pendingCount,
      compliance_rate_percent: complianceRate,
      total_violations_detected: totalViolations,
      major_violations: majorViolations,
      triaged_complaints_in_district: triagedComplaints,
      scans_today: scansToday,
    },
    recent_inspections: recentInspections,
    assigned_tasks: assignedTasks,
    top_violated_rules: topViolationRules.map((v) => ({
      rule_code: v.ruleCode,
      severity: v.severity,
      occurrences: v._count.id,
    })),
  };
}

/**
 * Returns district-level compliance dashboard for a REVIEWER.
 * Shows all inspections in their district (for validation queue),
 * plus PENDING complaints for triage.
 *
 * @param {import("../constants/rbac.js").AuthenticatedUserContext} user
 */
export async function getReviewerDashboard(user) {
  if (user.role.toUpperCase() !== ROLES.REVIEWER) {
    throw new SecurityScopingError("Reviewer dashboard is restricted to REVIEWER role.");
  }

  if (!user.district) {
    throw new SecurityScopingError(
      "REVIEWER account has no assigned district. Dashboard unavailable.",
      { role: user.role, userId: user.id }
    );
  }

  const districtScope = {
    inspector: { district: districtWhere(user.district) },
  };

  const [
    totalDistrictInspections,
    nonCompliantCount,
    compliantCount,
    pendingReviewCount,
    totalViolations,
    pendingComplaints,
    myAssignedCount,
    validationQueue,
    topViolationRules,
    complaintInbox,
    scansToday,
  ] = await Promise.all([
    // All district inspections
    prisma.inspection.count({ where: districtScope }),
    // Non-compliant = need review
    prisma.inspection.count({ where: { ...districtScope, status: "NON_COMPLIANT" } }),
    prisma.inspection.count({ where: { ...districtScope, status: "COMPLIANT" } }),
    // Inspections with no reviewer assigned yet
    prisma.inspection.count({ where: { ...districtScope, reviewerId: null } }),
    // All violations in district
    prisma.violation.count({ where: { inspection: districtScope } }),
    // PENDING complaints in district for triage
    prisma.complaint.count({
      where: {
        district: districtWhere(user.district),
        status: "PENDING",
      },
    }),
    // Inspections already assigned to this reviewer
    prisma.inspection.count({ where: { reviewerId: user.id } }),
    // Validation queue: most recent unreviewed non-compliant inspections in district
    prisma.inspection.findMany({
      where: { ...districtScope, status: "NON_COMPLIANT", reviewerId: null },
      take: 15,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        complianceScore: true,
        createdAt: true,
        reviewerId: true,
        annotatedImagePath: true,
        imagePath: true,
        inspector: {
          select: { id: true, fullName: true, badgeNumber: true, district: true },
        },
        reviewer: {
          select: { id: true, fullName: true },
        },
        product: {
          select: { id: true, brandName: true, commodityName: true, category: true },
        },
        violations: {
          select: { id: true, ruleCode: true, severity: true, title: true, description: true },
        },
      },
    }),
    // Top violated rules across district
    prisma.violation.groupBy({
      by: ["ruleCode", "severity"],
      where: { inspection: districtScope },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
    // Triage inbox: PENDING + TRIAGED complaints in district
    prisma.complaint.findMany({
      where: {
        district: districtWhere(user.district),
        status: { in: ["PENDING", "TRIAGED"] },
      },
      take: 30,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        district: true,
        createdAt: true,
        consumer: {
          select: { id: true, fullName: true },
        },
        inspection: {
          select: { id: true, status: true, complianceScore: true },
        },
      },
    }),
    prisma.inspection.count({
      where: { ...districtScope, createdAt: { gte: startOfToday() } },
    }),
  ]);

  const complianceRate =
    totalDistrictInspections > 0
      ? Number(((compliantCount / totalDistrictInspections) * 100).toFixed(2))
      : 100.0;

  return {
    scope: "REVIEWER",
    reviewer: {
      id: user.id,
      fullName: user.fullName,
      district: user.district,
      state: user.state,
    },
    metrics: {
      total_district_inspections: totalDistrictInspections,
      compliant_inspections: compliantCount,
      non_compliant_inspections: nonCompliantCount,
      compliance_rate_percent: complianceRate,
      pending_review_unassigned: pendingReviewCount,
      my_assigned_inspections: myAssignedCount,
      total_district_violations: totalViolations,
      pending_complaints_to_triage: pendingComplaints,
      open_complaints: complaintInbox.length,
      scans_today: scansToday,
    },
    validation_queue: validationQueue,
    complaint_inbox: complaintInbox,
    top_violated_rules: topViolationRules.map((v) => ({
      rule_code: v.ruleCode,
      severity: v.severity,
      occurrences: v._count.id,
    })),
  };
}
