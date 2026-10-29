## 2025-05-10 - CSV Formula Injection Mitigation Location
**Vulnerability:** CSV Formula Injection (OWASP).
**Learning:** Formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) must be escaped when generating/exporting CSVs (`objectsToCSV`), never during CSV parsing (`parseCSV`). Escaping during parsing corrupts legitimate application data like negative amounts (`-100`) or handles (`@user`).
**Prevention:** Keep input parsing raw and apply formula escaping exclusively in output serialization.
