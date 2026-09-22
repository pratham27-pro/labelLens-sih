import * as dashboardService from "../services/dashboardService.js";
import { SecurityScopingError } from "../services/dataScopingService.js";

/**
 * INSPECTOR Personal Dashboard handler
 */
export async function getInspectorDashboard(req, reply) {
  try {
    const stats = await dashboardService.getInspectorDashboard(req.user);
    return reply.code(200).send(stats);
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
      details: error.message,
      message: "Failed to retrieve inspector dashboard",
    });
  }
}

/**
 * REVIEWER District Dashboard handler
 */
export async function getReviewerDashboard(req, reply) {
  try {
    const stats = await dashboardService.getReviewerDashboard(req.user);
    return reply.code(200).send(stats);
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
      details: error.message,
      message: "Failed to retrieve reviewer dashboard",
    });
  }
}

/**
 * CONTROLLER Jurisdiction Dashboard handler
 */
export async function getJurisdictionDashboard(req, reply) {
  try {
    const stats = await dashboardService.getJurisdictionDashboard(req.user);
    return reply.code(200).send(stats);
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
      details: error.message,
      message: "Failed to retrieve jurisdiction dashboard",
    });
  }
}

/**
 * DIRECTOR Global Dashboard handler
 */
export async function getGlobalDashboard(req, reply) {
  try {
    const stats = await dashboardService.getGlobalDashboard(req.user, {
      days: req.query?.days,
    });
    return reply.code(200).send(stats);
  } catch (error) {
    req.log.error(error);
    return reply.code(500).send({
      error: "Internal Server Error",
      details: error.message,
      message: "Failed to retrieve global dashboard",
    });
  }
}
