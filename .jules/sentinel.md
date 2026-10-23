## 2026-05-18 - OWASP CSV Formula & Command Injection Triggers
**Vulnerability:** CSV exports previously escaped basic formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) but missed DDE/Command execution triggers (`%`, `|`) and leading whitespace before formula triggers (`   =SUM(1)`). Additionally, naive string escaping could corrupt pure numeric strings (`"-100"`).
**Learning:** Spreadsheet applications (Excel, Calc, Sheets) strip leading spaces before evaluating formula triggers and support DDE execution via `%` and `|`.
**Prevention:** Use `^\s*[=+\-@%\t\r|]` to match triggers after whitespace, and verify the string is not purely numeric (`^\s*[-+]?\d+(\.\d+)?\s*$`) before prepending a single quote `'`.
