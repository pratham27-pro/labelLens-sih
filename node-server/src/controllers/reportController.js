import * as reportService from "../services/reportService.js";
import { SecurityScopingError } from "../services/dataScopingService.js";

/**
 * Create an INSPECTION_SUMMARY report for an inspection (Controller / Director)
 */
export async function createReport(req, reply) {
  try {
    const { inspectionId } = req.body || {};
    if (!inspectionId) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "inspectionId is required",
      });
    }

    const report = await reportService.createInspectionSummaryReport(
      req.user,
      inspectionId
    );
    if (!report) {
      return reply.code(404).send({
        error: "Not Found",
        message: `Inspection '${inspectionId}' not found`,
      });
    }

    return reply.code(201).send({ message: "Report created", report });
  } catch (error) {
    if (error instanceof SecurityScopingError) {
      return reply.code(403).send({
        error: "Forbidden",
        message: error.message,
      });
    }
    req.log.error(error);
    return reply.code(500).send({
      error: "Internal Server Error",
      message: "Failed to create report",
    });
  }
}
