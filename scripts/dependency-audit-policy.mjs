export const failSeverities = new Set(['high', 'critical']);

// Temporary release exception reviewed for ReTail 1.2.0. Keep this entry exact:
// package, advisory, severity, installed version, and Expo CLI-only paths must all match.
export const reviewedAdvisoryExceptions = Object.freeze([
  Object.freeze({
    packageName: 'node-forge',
    advisoryId: 'GHSA-86w9-cpqp-85rv',
    severity: 'high',
    allowedVersions: Object.freeze(['1.4.0']),
    allowedPathPattern: /(?:^|>)expo>@expo\/cli>(?:@expo\/code-signing-certificates>)?node-forge$/u,
    documentation: 'docs/security/NODE_FORGE_RELEASE_EXCEPTION.md',
  }),
]);

function advisoryId(advisory) {
  return advisory.github_advisory_id ?? String(advisory.id ?? '');
}

export function matchesReviewedAdvisoryException(advisory, exception) {
  if (
    advisory.module_name !== exception.packageName ||
    advisoryId(advisory) !== exception.advisoryId ||
    advisory.severity !== exception.severity
  ) {
    return false;
  }

  const findings = advisory.findings ?? [];
  if (findings.length === 0) {
    return false;
  }

  return findings.every((finding) => {
    if (!exception.allowedVersions.includes(finding.version)) {
      return false;
    }

    const paths = finding.paths ?? [];
    return paths.length > 0 && paths.every((path) => exception.allowedPathPattern.test(path));
  });
}

export function evaluateDependencyAdvisories(advisories) {
  const blockingAdvisories = [];
  const reviewedExceptions = [];

  for (const advisory of advisories) {
    if (!failSeverities.has(advisory.severity)) {
      continue;
    }

    const exception = reviewedAdvisoryExceptions.find((candidate) =>
      matchesReviewedAdvisoryException(advisory, candidate)
    );

    if (exception) {
      reviewedExceptions.push({ advisory, exception });
    } else {
      blockingAdvisories.push(advisory);
    }
  }

  return { blockingAdvisories, reviewedExceptions };
}
