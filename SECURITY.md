# Bug Bounty Program

We offer rewards for responsibly disclosed security vulnerabilities. Rewards are paid in XCP.

| Severity | Reward | Examples |
|----------|--------|----------|
| Critical | Up to 2,500 XCP | Private key extraction, seed phrase exposure, unauthorized fund transfers, remote code execution, bypassing transaction signing approval |
| High | Up to 500 XCP | Session hijacking, authentication bypass, signature forgery, transaction manipulation, permission escalation allowing unauthorized actions |
| Medium | Up to 50 XCP | Sensitive data leakage (non-key material), clickjacking with security impact, CSP bypass, origin spoofing in provider API |

## Eligibility

To qualify for a reward, your report must:

- Describe a reproducible vulnerability with clear steps
- Include proof of concept (code, screenshots, or video)
- Affect the latest release on the main branch
- Not be a duplicate of a known issue or previously reported vulnerability
- Be reported privately via GitHub Security Advisories

## In Scope

- Browser extension code (background, content scripts, popup)
- Key derivation, encryption, and signing logic
- Provider API and dApp connection handling
- Session management and auto-lock
- Transaction construction and verification

## Out of Scope

- Vulnerabilities in third-party dependencies (report upstream, but let us know)
- Attacks requiring physical access to an unlocked device
- Social engineering or phishing attacks
- Denial of service without security impact
- Issues already documented in ADRs as known limitations
- Theoretical vulnerabilities without demonstrated impact

## Severity Definitions

**Critical**: Direct loss of funds or private keys. Attacker can steal assets, extract seeds/keys, or sign transactions without user consent.

**High**: Significant security impact but requires user interaction or specific conditions. Includes auth bypass, session theft, or transaction manipulation that could lead to fund loss with additional steps.

**Medium**: Security issues with limited direct impact. Information disclosure, UI spoofing that could mislead users, or bypasses of defense-in-depth measures.

**Low/Informational**: Best practice violations, minor issues, or hardening suggestions. These are appreciated but not eligible for rewards. We may acknowledge contributors in a security hall of fame.

## Rules

- Give us reasonable time to fix issues before public disclosure (90 days)
- Do not access or modify other users' data
- Do not perform attacks against infrastructure or other users
- One vulnerability per report (unless chained for impact)

## Hall of Fame

We recognize all valid security contributions, regardless of severity:

*No submissions yet — be the first!*
