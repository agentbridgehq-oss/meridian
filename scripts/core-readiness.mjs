#!/usr/bin/env node
import { buildCoreReadinessReport } from '../lib/core-readiness.mjs';

const report = buildCoreReadinessReport();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.stagingInfrastructureReady) process.exitCode = 1;
