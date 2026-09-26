/**
 * Every connection proof the wallet signs for itself begins with this line, and a site may never
 * ask the wallet to sign a message that does: otherwise a site could obtain, through ordinary
 * message signing, a proof that looks like one the wallet issued on connect.
 */
export const CONNECTION_PROOF_PREFIX = 'xcp-wallet\n';
