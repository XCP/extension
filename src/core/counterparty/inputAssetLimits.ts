/**
 * Cap on per-input attached-asset lookups on an approval screen. Inputs past it are reported
 * unknown (`overLimit`), never assumed empty — so any intent that requires every input to be
 * proven asset-free must bound its own input count by this. Retrying cannot clear the cap, so
 * the approval screen says so instead of offering a retry.
 *
 * The ledger is asked which inputs hold anything in batches of 20, so an empty input costs no
 * balance lookup of its own; what the cap still bounds is the parent-transaction check each signed
 * empty input needs (pendingAttachments.ts). Sixty covers a full 20-item cart with forty funding
 * UTXOs.
 *
 * A dependency-free module so the pure intent parser can share it without importing the API client.
 */
export const MAX_ASSET_LOOKUP_INPUTS = 60;
