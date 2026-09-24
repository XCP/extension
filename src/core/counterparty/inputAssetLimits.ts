/**
 * Cap on per-input attached-asset lookups on an approval screen. Inputs past it are reported
 * unknown, never assumed empty — so any intent that requires every input to be proven asset-free
 * must bound its own input count by this, or its extra inputs can only ever ask for a retry.
 *
 * A dependency-free module so the pure intent parser can share it without importing the API client.
 */
export const MAX_ASSET_LOOKUP_INPUTS = 30;
