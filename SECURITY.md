# Security reporting

Please do not put API keys, account data, private prompts or personal media in public issues, discussions, screenshots or logs.

If the repository's **Security → Report a vulnerability** option is available, use it to send a private report. Include the affected version, reproducible steps, impact and a minimal example with sensitive values removed. Do not publicly post exploit details while arranging a private report.

If private reporting is unavailable, contact the maintainer privately through an established channel; do not open a public issue containing the vulnerability or credentials. A dedicated reporting contact will be listed here once configured.

This app runs a local service and can connect to funded model-provider accounts. Keep the default loopback binding, review agent permissions and budgets, and do not expose the development server or MCP endpoint to an untrusted network. Remote hosting requires a separate authentication and network-security review.

If a credential may have been exposed, revoke or rotate it with the issuing provider. Deleting a message or Git commit does not revoke a key.
