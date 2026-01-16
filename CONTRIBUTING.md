# Contributing to Convoy

Thanks for your interest in contributing to Convoy! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js >= 18.19 (or Bun)
- A running PostgreSQL instance
- Git

### Getting Started

1. Clone the repo:

   ```bash
   git clone https://github.com/hamzatekin/convoy.git
   cd convoy
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up the playground database:

   ```bash
   cp playground/.env.example playground/.env
   # Edit playground/.env with your DATABASE_URL
   ```

4. Build the project:

   ```bash
   npm run build
   ```

5. Run the playground:
   ```bash
   npm run playground:convoy:dev
   ```

### Project Structure

```
convoy/
├── src/                 # Core library source
│   ├── client.ts        # Browser client
│   ├── react.ts         # React hooks
│   ├── server.ts        # Server runtime (createDb, query, mutation)
│   ├── node.ts          # Node.js HTTP handler
│   ├── schema/          # Schema definition (defineTable, defineSchema)
│   └── errors.ts        # Error types
├── bin/                 # CLI entry point
├── playground/          # Demo app for testing
├── tests/               # Test suite
└── dist/                # Compiled output
```

## Making Changes

### Running Tests

```bash
npm test              # Run all tests
npm run typecheck     # Type check
npm run format        # Format code with Prettier
```

### Code Style

- We use Prettier for formatting (runs on commit via Husky)
- TypeScript strict mode is enabled
- Prefer explicit types over `any`
- Keep functions small and focused

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add db.delete() method
fix: handle SSE reconnect on network change
docs: add transaction examples to README
```

## Pull Request Process

1. **Fork the repo** and create your branch from `main`
2. **Make your changes** with tests if applicable
3. **Run the test suite** to ensure nothing is broken
4. **Update documentation** if you're changing behavior
5. **Open a PR** with a clear description of what you changed and why

### PR Checklist

- [ ] Tests pass (`npm test`)
- [ ] Types check (`npm run typecheck`)
- [ ] Code is formatted (`npm run format`)
- [ ] Documentation updated if needed
- [ ] Commit messages are clear

## What to Work On

Check the [ROADMAP.md](./ROADMAP.md) for planned features. Good first issues are labeled in GitHub Issues.

**High-impact areas:**

- Core database operations (transactions, delete)
- CLI improvements
- Documentation and examples
- Test coverage

## Questions?

Open an issue or start a discussion. We're happy to help!

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
