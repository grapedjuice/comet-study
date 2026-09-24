# Security and threat model

Assets: identity, private schedules, group content, uploaded files, provider secrets. Threats: IDOR, CSRF, token replay, privilege escalation, capacity races, schedule inference, malicious files, source poisoning, secret leakage and abusive delivery.

Controls required before release: server authorization; exact verified utdallas.edu domain; hashed single-use verification and session tokens; secure HTTP-only cookies; same-origin mutation checks; persisted rate limits; strict validation; transactional capacity enforcement; privacy-safe matches; quarantined uploads and signed downloads; redacted request-ID logging. Auth design is pending implementation and independent review.

No exposed Nebula credential will be read, reused, or tested. Rotation status is **unknown/unconfirmed**. Live access is blocked until a newly issued secret is installed securely.

Production must reject fixture/development adapters and insecure defaults. Demo seeds are opt-in and prohibited in production. No public deployment or paid resource provisioning is authorized by local build work alone.

Account export/deletion, retention schedules, incident response, backup restore, CSP and provider-specific threat boundaries are release gates; not yet implemented.

