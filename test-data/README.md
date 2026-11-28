# Sample import files

Fictitious files to try the imports in real conditions (no real person, account or bank number). The unit tests
read them by file name (`tests/fixtures/testData.ts`), so moving a file between folders breaks nothing.

| Folder | What it holds | Import it into |
|---|---|---|
| `investments/history/` | Transaction histories of brokers and exchanges (trades, dividends, fees, deposits) | An investment or crypto account, **History** mode |
| `investments/snapshots/` | Holdings at one date (asset, quantity, unit cost) | An investment or crypto account, **Snapshot** mode |
| `investments/broker-exports/` | Exports in each provider's own format, recognised automatically | The matching account, **History** mode |
| `bank/` | Bank statements for the cash flow | A **checking** or **savings** account (below) |

## Bank statements (`bank/`)

| File | Format | Account |
|---|---|---|
| `boursobank_checking_2026.csv` | BoursoBank export with its categories: 6 months (May–Oct 2026), salary, rent, subscriptions (Netflix price rise in September), groceries, transfers to the Livret A and the PEA, a donation, home help | Checking account |
| `debit_credit_checking_2026.csv` | Debit / Credit columns, French dates and decimals (Crédit Agricole, LCL, Société Générale style) | Checking account |
| `revolut_2026.csv` | Revolut-like export (English, signed amounts) | Checking account |
| `generic_debit_credit_2025.csv` | Short statement with Debit / Credit / Balance columns | Checking account |
| `boursobank_official_2025.csv` | Two lines in the BoursoBank format | Checking account |
| `generic_statement_2025.ofx` | OFX ("Money" format) statement | Checking account |
| `livret_a_operations_2026.csv` | Operations of a Livret A (monthly transfers in, yearly interest, one withdrawal) | Savings account, **Its operations** |
| `livret_a_balances_2026.csv` | Month-end balances of the same Livret A | Savings account, **Its current balance** |

To try one: **Import** (or **Import a statement** in Cash flow) → choose the bank → choose or create the checking or
savings account → drop the file. The same files can be given to the assistant, which imports them with
`preview_transaction_import` then `import_transactions` (with your confirmation).
