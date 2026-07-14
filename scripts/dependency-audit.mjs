import { spawnSync } from 'node:child_process';

const severityOrder = ['info', 'low', 'moderate', 'high', 'critical'];
const failSeverities = new Set(['high', 'critical']);

const audit = spawnSync('pnpm', ['audit', '--prod', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (audit.error) {
  console.error(`Dependency audit could not start: ${audit.error.message}`);
  process.exit(1);
}

let auditReport;

try {
  auditReport = audit.stdout.trim() ? JSON.parse(audit.stdout) : null;
} catch (error) {
  console.error('Dependency audit returned non-JSON output.');
  if (audit.stderr.trim()) {
    console.error(audit.stderr.trim());
  }
  process.exit(1);
}

if (!auditReport) {
  if (audit.status === 0) {
    console.info('Production dependency audit passed. No advisories reported.');
    process.exit(0);
  }

  console.error('Dependency audit failed without a parseable advisory report.');
  if (audit.stderr.trim()) {
    console.error(audit.stderr.trim());
  }
  process.exit(audit.status ?? 1);
}

const vulnerabilities = auditReport.metadata?.vulnerabilities ?? {};
const advisories = Object.values(auditReport.advisories ?? {});
const counts = Object.fromEntries(severityOrder.map((severity) => [severity, vulnerabilities[severity] ?? 0]));
const blockingCount = [...failSeverities].reduce((total, severity) => total + counts[severity], 0);

console.info('Production dependency audit summary:');
for (const severity of severityOrder) {
  console.info(`- ${severity}: ${counts[severity]}`);
}

if (advisories.length > 0) {
  console.info('\nProduction dependency advisories:');

  for (const advisory of advisories.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))) {
    const pathCount = advisory.findings?.reduce((total, finding) => total + (finding.paths?.length ?? 0), 0) ?? 0;
    const samplePath = advisory.findings?.flatMap((finding) => finding.paths ?? [])[0];

    console.info(`- [${advisory.severity}] ${advisory.module_name}: ${advisory.title}`);
    console.info(`  advisory: ${advisory.github_advisory_id ?? advisory.id ?? 'unknown'}`);
    console.info(`  vulnerable: ${advisory.vulnerable_versions ?? 'unknown'}; patched: ${advisory.patched_versions ?? 'unknown'}`);
    console.info(`  paths: ${pathCount}`);

    if (samplePath) {
      console.info(`  sample path: ${samplePath}`);
    }

    if (advisory.url) {
      console.info(`  url: ${advisory.url}`);
    }
  }
}

if (blockingCount > 0) {
  console.error('\nProduction dependency audit failed because High or Critical advisories are present.');
  process.exit(1);
}

if (audit.status !== 0 && advisories.length === 0) {
  console.error('\nDependency audit command failed without reported advisories.');
  if (audit.stderr.trim()) {
    console.error(audit.stderr.trim());
  }
  process.exit(audit.status ?? 1);
}

console.info('\nProduction dependency security gate passed. No High or Critical advisories were found.');
