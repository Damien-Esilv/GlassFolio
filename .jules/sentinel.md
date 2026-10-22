## 2026-03-31 - Proof-of-Work Challenge Replay Vulnerability in Anti-Bot Primitives
**Vulnerability:** WebCrypto Proof-of-Work verification (`verifyProofOfWork`) validated SHA-256 hash output but ignored the embedded challenge timestamp, allowing attackers to solve a PoW challenge once and replay the same telemetry (`powChallenge`, `powNonce`, `powHash`) indefinitely.
**Learning:** In stateless WebCrypto PoW challenge schemes (`gf-pow:<timestamp_base36>:<random_b64>`), hash validation alone does not guarantee challenge freshness.
**Prevention:** Always parse and enforce maximum age (`maxAgeMs`, default 10m) and clock-skew bounds when verifying PoW challenges.
