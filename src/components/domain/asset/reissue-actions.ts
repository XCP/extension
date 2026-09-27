/**
 * Which of an owner's reissue actions counterparty-core will accept for an asset.
 *
 * `issuance.validate` refuses every reissuance while a fairminter is live ("cannot issue during
 * fair minting"), refuses new supply and a second supply lock once `locked` is set, and refuses
 * any issuance that writes a description once `description_locked` is set. A transfer carries no
 * quantity and no description, so only the fairminter blocks it. Ownership is the caller's check.
 *
 * Shared by the asset page and the owned-asset menu so the two cannot offer different actions.
 */
export interface ReissueState {
  locked: boolean;
  descriptionLocked: boolean;
  /** Unknown reads as false, as on the asset page: core still refuses if one is in fact open. */
  fairMinting: boolean;
}

export interface ReissueActions {
  /** Issue Supply and Lock Supply. */
  supply: boolean;
  /** Update Description and Lock Description. */
  description: boolean;
  /** Transfer Ownership. */
  transfer: boolean;
}

export function reissueActions({ locked, descriptionLocked, fairMinting }: ReissueState): ReissueActions {
  if (fairMinting) return { supply: false, description: false, transfer: false };
  return { supply: !locked, description: !descriptionLocked, transfer: true };
}
