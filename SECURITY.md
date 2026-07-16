# Security Policy

## Reporting vulnerabilities

Do not report security vulnerabilities in public issues.

Use GitHub private vulnerability reporting if it is enabled on the repository.
If it is not enabled, contact the IntraQ maintainers directly through the
private contact channel listed on the repository or organization profile.

Include:

- affected version or commit;
- clear reproduction steps;
- expected impact;
- whether credentials, tenant data, or source data may be exposed;
- any temporary mitigation you found.

## Supported versions

Security fixes are prioritized for the latest public release.

## Secret handling

- Never commit `.env` files.
- Never commit API keys, database passwords, OAuth tokens, customer data, or
  private operational docs.
- Use `.env.example` as the local template.
- Rotate any secret that was accidentally committed or shared.

## Deployment note

The default quickstart is for local evaluation. Production self-hosting requires
strong secrets, HTTPS termination, database backups, access controls, and regular
dependency/security updates.
