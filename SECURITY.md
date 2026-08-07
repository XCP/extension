# Security

## Reporting a vulnerability

Report privately via [GitHub Security Advisories](https://github.com/XCP/extension/security/advisories/new).

We read every report and fix what is real, whether or not a reward is attached.

## The bug bounty is paused

**Paused August 2026.** No new submissions are eligible for a reward until it reopens.

We are receiving a high volume of automated, agent-generated submissions. Most are technically
competent and most describe real code — that is not the problem. The problem is that they arrive as
security advisories when what they are is patches:

- written against `main` rather than a published release, so a report can describe code that was
  fixed hours before it was filed;
- often restating a limitation we document ourselves, sometimes quoting the very comment that
  documents it — reading our notes back to us with a severity label attached;
- filed under embargo, where they cannot be discussed in the open or simply merged.

A private advisory costs a maintainer far more than an issue does. It has to be triaged alone, on a
clock, in a channel built for coordinated disclosure — and coordinated disclosure is not what most
of these need. They need a patch.

So the rules below have not changed much. What has changed is the volume arriving through the wrong
door, and the reward is what points at that door.

### Send these as issues or pull requests instead

If your finding is any of the following, open an [issue](https://github.com/XCP/extension/issues) or
a pull request. It will be read sooner, discussed in the open, and credited the same:

- a limitation this repository documents in a comment, an ADR, or a header;
- a hardening suggestion, a missing check, or a defence-in-depth improvement;
- anything you could have fixed yourself in the time it took to write it up.

Use the advisory channel when there is a way to take a user's funds or keys, that user-visible
outcome is demonstrated, and telling us privately first actually protects someone.

### When it reopens

Three things will be true of it:

1. **A proof of concept against a tagged release.** Already the rule; it will be enforced rather
   than assumed. `main` is developed in the open and is not the product anyone is running.
2. **A documented limitation needs a demonstrated loss.** Citing the comment that describes a gap is
   not a finding. Show a user losing something.
3. **Tiered by demonstrated impact.** "This guard is skipped here" and "here is BTC leaving the
   wallet" are not the same report and will not be paid the same.

## Scope

**In scope**

- Browser extension code (background, content scripts, popup)
- Key derivation, encryption, and signing logic
- Provider API and dApp connection handling
- Session management and auto-lock
- Transaction construction and verification

**Out of scope**

- Vulnerabilities in third-party dependencies (report upstream, but let us know)
- Attacks requiring physical access to an unlocked device
- Social engineering or phishing attacks
- Denial of service without security impact
- Limitations already documented in the code, in an ADR, or in this file
- Theoretical vulnerabilities without demonstrated impact
- Behaviour already fixed on `main` at the time of the report

## Severity

**Critical**: Direct loss of funds or private keys. An attacker can steal assets, extract seeds or
keys, or get a transaction signed without the user's consent.

**High**: Significant impact, but requires user interaction or specific conditions — auth bypass,
session theft, or transaction manipulation that leads to fund loss with additional steps.

**Medium**: Limited direct impact. Information disclosure, UI spoofing that could mislead a user, or
a bypass of a defence-in-depth measure.

**Low / Informational**: Best practices, minor issues, hardening. Appreciated, credited, never
rewarded — and better sent as a pull request.

## Rules

- Give us reasonable time to fix before public disclosure (90 days)
- Do not access or modify other users' data
- Do not attack our infrastructure or other users
- One vulnerability per report, unless chained for impact

## Hall of Fame

We recognise valid security contributions regardless of severity, and regardless of which channel
they arrived through.

| Contributor | Finding | Reference |
|-------------|---------|-----------|
| Niftyboss | Password memory cleanup | [#178](https://github.com/XCP/extension/pull/178) |
| refangga1337 | Approval summary priced a PSBT without regard to what the signature committed to | [GHSA-xm3c-v5fj-mxqv](https://github.com/XCP/extension/security/advisories/GHSA-xm3c-v5fj-mxqv) |
| refangga1337 | Attached-asset warning suppressible by padding a PSBT past the lookup cap | [GHSA-6mmc-r2hj-qq43](https://github.com/XCP/extension/security/advisories/GHSA-6mmc-r2hj-qq43) |
| goat | Decode API could override byte-derived output addresses on the PSBT approval screen | [#256](https://github.com/XCP/extension/pull/256) |
