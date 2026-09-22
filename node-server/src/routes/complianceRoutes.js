import * as inspectionController from "../controllers/inspectionController.js";
import * as complaintController from "../controllers/complaintController.js";
import * as dashboardController from "../controllers/dashboardController.js";
import * as reportController from "../controllers/reportController.js";
import {
  authenticateToken,
  requirePermission,
  requireAnyPermission,
  requireRoles,
} from "../middleware/auth.js";
import { PERMISSIONS, ROLES } from "../constants/rbac.js";

/**
 * LMPC Legal Metrology Compliance RBAC & Scoped Routes
 */
async function complianceRoutes(fastify, options) {
  // --- Scoped Inspections Management ---

  // List inspections (scoped by role & jurisdiction)
  fastify.get(
    "/compliance/inspections",
    {
      preHandler: [
        authenticateToken,
        requireAnyPermission(
          PERMISSIONS.SCAN_VIEW_OWN,
          PERMISSIONS.SCAN_VIEW_JURISDICTION,
          PERMISSIONS.SCAN_VIEW_ORG,
          PERMISSIONS.DASHBOARD_GLOBAL
        ),
      ],
    },
    inspectionController.listInspections
  );

  // Retrieve single inspection with IDOR / jurisdiction scoping check
  fastify.get(
    "/compliance/inspections/:id",
    {
      preHandler: [
        authenticateToken,
        requireAnyPermission(
          PERMISSIONS.SCAN_VIEW_OWN,
          PERMISSIONS.SCAN_VIEW_JURISDICTION,
          PERMISSIONS.SCAN_VIEW_ORG,
          PERMISSIONS.DASHBOARD_GLOBAL
        ),
      ],
    },
    inspectionController.getInspectionById
  );

  // Create new inspection record (Inspectors)
  fastify.post(
    "/compliance/inspections",
    {
      preHandler: [
        authenticateToken,
        requirePermission(PERMISSIONS.SCAN_CREATE),
      ],
    },
    inspectionController.createInspection
  );

  // Confirm or modify violation (Reviewers)
  fastify.patch(
    "/compliance/inspections/:inspectionId/violations/:violationId",
    {
      preHandler: [
        authenticateToken,
        requirePermission(PERMISSIONS.VIOLATION_CONFIRM),
      ],
    },
    inspectionController.confirmViolation
  );

  // Assign Reviewer to inspection (Directors / Controllers)
  fastify.post(
    "/compliance/inspections/:inspectionId/reviewer",
    {
      preHandler: [
        authenticateToken,
        requireAnyPermission(PERMISSIONS.USER_MANAGE, PERMISSIONS.ROLE_MANAGE),
      ],
    },
    inspectionController.assignReviewer
  );

  // Escalate inspection to Controller (Reviewers, via their violation-confirm authority)
  fastify.patch(
    "/compliance/inspections/:inspectionId/escalate",
    {
      preHandler: [
        authenticateToken,
        requirePermission(PERMISSIONS.VIOLATION_CONFIRM),
      ],
    },
    inspectionController.escalateInspection
  );

  // Approve AI result (Reviewers)
  fastify.patch(
    "/compliance/inspections/:inspectionId/approve",
    {
      preHandler: [
        authenticateToken,
        requirePermission(PERMISSIONS.VIOLATION_CONFIRM),
      ],
    },
    inspectionController.approveInspection
  );

  // Create an INSPECTION_SUMMARY report (Controllers / Directors / drafters)
  fastify.post(
    "/compliance/reports",
    {
      preHandler: [
        authenticateToken,
        requireAnyPermission(
          PERMISSIONS.REPORT_APPROVE,
          PERMISSIONS.REPORT_DRAFT,
          PERMISSIONS.REPORT_EXPORT
        ),
      ],
    },
    reportController.createReport
  );

  // --- Consumer Complaints & Triage ---

  // File a complaint (Consumers)
  fastify.post(
    "/compliance/complaints",
    {
      preHandler: [
        authenticateToken,
        requirePermission(PERMISSIONS.COMPLAINT_FILE),
      ],
    },
    complaintController.fileComplaint
  );

  // List complaints (scoped to consumer, reviewer, or jurisdiction).
  // REVIEWER, CONTROLLER, and INSPECTOR are admitted through their existing
  // scan-view permissions and receive only the RLS scope produced by
  // getComplaintScope (INSPECTOR: district-scoped complaints for their
  // follow-up inbox). None of them gain complaint triage permission from
  // this read route.
  fastify.get(
    "/compliance/complaints",
    {
      preHandler: [
        authenticateToken,
        requireAnyPermission(
          PERMISSIONS.COMPLAINT_FILE,
          PERMISSIONS.COMPLAINT_TRIAGE,
          PERMISSIONS.DASHBOARD_GLOBAL,
          PERMISSIONS.SCAN_VIEW_ORG,
          PERMISSIONS.SCAN_VIEW_JURISDICTION,
          PERMISSIONS.SCAN_VIEW_OWN
        ),
      ],
    },
    complaintController.listComplaints
  );

  // Triage complaint (Consumers file & triage own; REVIEWER via violation-
  // confirm authority; CONTROLLER via report-approve authority). Data access
  // is still limited to the RLS scope from getComplaintScope.
  fastify.patch(
    "/compliance/complaints/:id/triage",
    {
      preHandler: [
        authenticateToken,
        requireAnyPermission(
          PERMISSIONS.COMPLAINT_TRIAGE,
          PERMISSIONS.VIOLATION_CONFIRM,
          PERMISSIONS.REPORT_APPROVE
        ),
      ],
    },
    complaintController.triageComplaint
  );

  // --- Executive & Regional Compliance Dashboards ---

  // Inspector Personal Dashboard
  fastify.get(
    "/compliance/dashboard/inspector",
    {
      preHandler: [
        authenticateToken,
        requireRoles(ROLES.INSPECTOR),
      ],
    },
    dashboardController.getInspectorDashboard
  );

  // Reviewer District Dashboard
  fastify.get(
    "/compliance/dashboard/reviewer",
    {
      preHandler: [
        authenticateToken,
        requireRoles(ROLES.REVIEWER),
      ],
    },
    dashboardController.getReviewerDashboard
  );

  // District Controller Dashboard
  fastify.get(
    "/compliance/dashboard/jurisdiction",
    {
      preHandler: [
        authenticateToken,
        requirePermission(PERMISSIONS.DASHBOARD_JURISDICTION),
      ],
    },
    dashboardController.getJurisdictionDashboard
  );

  // Director Global Dashboard
  fastify.get(
    "/compliance/dashboard/global",
    {
      preHandler: [
        authenticateToken,
        requirePermission(PERMISSIONS.DASHBOARD_GLOBAL),
      ],
    },
    dashboardController.getGlobalDashboard
  );
}

export default complianceRoutes;
