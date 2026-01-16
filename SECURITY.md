# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Convoy, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

Email: **[your-email@example.com]** (replace with your actual security contact)

Or use GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/hamzatekin/convoy/security)
2. Click "Report a vulnerability"
3. Fill out the form with details

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity, typically 1-4 weeks
- **Disclosure**: Coordinated with reporter after fix is released

## Security Scope

### In Scope

- SQL injection vulnerabilities
- Authentication/authorization bypasses
- Sensitive data exposure
- Server-side request forgery (SSRF)
- Denial of service (DoS) vulnerabilities
- Insecure defaults that could lead to data exposure

### Out of Scope

- Vulnerabilities in dependencies (report to the dependency maintainers)
- Social engineering attacks
- Physical attacks
- Issues in the playground/demo app (unless they affect the core library)

## Security Best Practices

When using Convoy in production:

1. **Use HTTPS** — Always run behind TLS in production
2. **Validate auth in createContext** — Never trust client-provided auth without verification
3. **Use parameterized queries** — The `db.raw()` escape hatch requires manual SQL safety
4. **Limit SSE subscriptions** — Configure `maxSubscriptions` to prevent resource exhaustion
5. **Keep dependencies updated** — Run `npm audit` regularly

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.0.x   | ✅ Yes    |

As the project matures, we'll maintain security updates for the latest minor version.
