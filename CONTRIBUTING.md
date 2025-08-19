# Contributing to XCP Wallet Extension

Thank you for your interest in contributing to the XCP Wallet Extension! We welcome contributions from the community.

## 📋 Prerequisites

- Node.js 20 or higher
- npm 10 or higher
- Git
- Chrome or Firefox browser for testing

## 🚀 Getting Started

1. **Fork the repository**
   - Visit [https://github.com/XCP/extension](https://github.com/XCP/extension)
   - Click the "Fork" button in the top right

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/extension.git
   cd extension
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Build the extension**
   ```bash
   npm run build
   ```

5. **Run tests**
   ```bash
   npm test
   ```

## 🔧 Development Workflow

### Running the Extension

```bash
# For Chrome
npm run dev

# For Firefox
npm run dev:firefox
```

### Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run E2E tests only
npm run test:e2e

# Run specific test file
npx playwright test e2e/wallet-creation.spec.ts
```

### Type Checking

```bash
npm run compile
```

## 📝 Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, readable code
   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation as needed

3. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```
   
   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation changes
   - `style:` Code style changes (formatting, etc.)
   - `refactor:` Code refactoring
   - `test:` Test additions or changes
   - `chore:` Maintenance tasks

4. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request**
   - Go to [https://github.com/XCP/extension/pulls](https://github.com/XCP/extension/pulls)
   - Click "New Pull Request"
   - Select your fork and branch
   - Fill out the PR template
   - Wait for CI checks to pass

## ✅ PR Requirements

Before submitting a PR, ensure:

- [ ] All tests pass (`npm test`)
- [ ] No TypeScript errors (`npm run compile`)
- [ ] Code follows project style
- [ ] New features have tests
- [ ] Documentation is updated
- [ ] Commit messages follow convention
- [ ] PR description explains changes

## 🐛 Reporting Issues

### Before Opening an Issue

1. Search [existing issues](https://github.com/XCP/extension/issues) to avoid duplicates
2. Try to reproduce with the latest version
3. Collect relevant information:
   - Browser and version
   - Extension version
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable

### Opening an Issue

Use the appropriate issue template:
- **Bug Report**: For reporting bugs
- **Feature Request**: For suggesting new features
- **Question**: For general questions

## 💻 Code Style

### TypeScript
- Use TypeScript for all new code
- Define proper types (avoid `any`)
- Use interfaces for object shapes
- Follow existing patterns

### React
- Use functional components
- Use hooks for state management
- Keep components focused and small
- Use proper prop types

### Testing
- Write tests for new features
- Maintain test coverage
- Use descriptive test names
- Test edge cases

## 🔒 Security

### Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities.

Email security concerns to: security@[domain] (update this)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Security Best Practices

- Never commit secrets or private keys
- Sanitize user inputs
- Use secure random number generation
- Follow crypto best practices
- Review dependencies for vulnerabilities

## 📚 Resources

- [Project Documentation](https://github.com/XCP/extension/blob/main/README.md)
- [WXT Documentation](https://wxt.dev/)
- [Counterparty Protocol](https://counterparty.io/)
- [Bitcoin Developer Guide](https://developer.bitcoin.org/)

## 🤝 Community

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md)
- Be respectful and constructive
- Help others when you can
- Share knowledge and learn together

## 📄 License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT License).

## 🙏 Thank You!

Your contributions help make the XCP Wallet better for everyone. We appreciate your time and effort!

---

Questions? Feel free to [open an issue](https://github.com/XCP/extension/issues) or reach out to the maintainers.