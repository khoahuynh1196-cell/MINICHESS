/**
 * Fastify composition root will be introduced with the server integration step.
 * Domain and application code must not import this module.
 */
export { applyRunCommand, createInMemoryRunRepository, createRun, type CreateRunInput, type RunCommandInput, type RunCommandResult, type RunRecord, type RunRepository } from "./application/run-commands.js";
