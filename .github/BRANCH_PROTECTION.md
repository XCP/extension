# Branch Protection Rules

## Setting Up Branch Protection for `main`

To ensure code quality and prevent broken code from being merged, configure the following branch protection rules in your GitHub repository:

### 1. Navigate to Settings
- Go to your repository on GitHub
- Click on **Settings** → **Branches**
- Click **Add rule** or edit existing rule for `main` branch

### 2. Required Settings

#### Branch name pattern
- Set to: `main`

#### Protect matching branches
Enable the following options:

✅ **Require a pull request before merging**
- ✅ Require approvals: 1 (or more based on team size)
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require review from CODEOWNERS (optional)

✅ **Require status checks to pass before merging**
- ✅ Require branches to be up to date before merging
- Add these required status checks:
  - `Lint and Type Check`
  - `Unit Tests`
  - `E2E Tests (Batch 1)`
  - `E2E Tests (Batch 2)`
  - `E2E Tests (Batch 3)`
  - `E2E Tests (Batch 4)`
  - `Test Summary`
  - `Security Audit`

✅ **Require conversation resolution before merging**

✅ **Require signed commits** (optional but recommended)

✅ **Require linear history** (optional - prevents merge commits)

✅ **Include administrators** (recommended for consistency)

✅ **Restrict who can push to matching branches** (optional)
- Add specific users or teams who can push directly

### 3. Additional Recommendations

#### For `develop` branch (if using git-flow):
- Apply similar rules but potentially less strict
- May allow direct pushes from certain team members
- Fewer required reviewers

#### For feature branches:
- No protection rules needed
- Developers work freely
- PR to `develop` or `main` triggers checks

## GitHub Actions Status Badges

Add these badges to your README.md to show test status:

```markdown
![Tests](https://github.com/XCP/extension/actions/workflows/pr-tests.yml/badge.svg)
![Security](https://github.com/XCP/extension/actions/workflows/pr-tests.yml/badge.svg?job=security-check)
```

## Handling Test Failures

### For Contributors:
1. Check the GitHub Actions tab for detailed logs
2. Download test artifacts for failed tests
3. Run tests locally: `npm test`
4. Fix issues and push updates

### For Maintainers:
1. Never bypass failing required checks
2. If tests are flaky, improve test stability
3. Use "Re-run failed jobs" for transient failures
4. Consider increasing retries in workflow if needed

## Monitoring

### Success Metrics:
- PR merge time < 1 hour after approval
- Test success rate > 95%
- No security vulnerabilities in dependencies

### Review GitHub Actions usage:
- Monitor monthly Action minutes
- Optimize workflow if exceeding limits
- Consider self-hosted runners for heavy usage

## Troubleshooting

### Common Issues:

**Tests pass locally but fail in CI:**
- Check Node.js version matches
- Ensure all dependencies are committed
- Review environment variables
- Check for hardcoded paths

**Long test execution times:**
- Review batch distribution
- Consider more parallel jobs
- Optimize slow tests
- Use test caching

**Security audit failures:**
- Run `npm audit fix` locally
- Update dependencies regularly
- Use `overrides` in package.json for false positives
- Document known issues that can't be fixed