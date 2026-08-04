/**
 * Utility functions for version handling
 */

/**
 * Formats a semantic version string to a shorter display format
 * Examples:
 * - "0.0.1" -> "v0.0"
 * - "0.1.0" -> "v0.1"
 * - "1.0.0" -> "v1.0"
 * - "1.2.3" -> "v1.2"
 * - "2.5.0" -> "v2.5"
 */
export function formatVersionDisplay(version: string): string {
  // Remove 'v' prefix if it exists
  const cleanVersion = version.replace(/^v/, '');

  // Split into parts
  const parts = cleanVersion.split('.');

  if (parts.length < 2) {
    return `v${cleanVersion}`;
  }

  const [major, minor] = parts;

  // For 0.x.x versions, show as v0.x
  if (major === '0') {
    return `v${major}.${minor}`;
  }

  // For other versions, show major.minor
  return `v${major}.${minor}`;
}

/**
 * Gets the formatted version from package.json
 */
export function getDisplayVersion(): string {
  const manifest = chrome.runtime.getManifest();
  return formatVersionDisplay(manifest.version);
}