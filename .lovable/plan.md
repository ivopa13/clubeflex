

## Diagnose

The root cause is clear from the data:

- Invoices like `000610980`, `000610985`, etc. **do not exist** in the database (confirmed by query).
- They were deleted in the cleanup (pre-2026 data removal).
- However, the payment queries in `DatabaseService.cs` filter by **payment date** (`crr.DATA >= '2026-01-01'`), not by **invoice date**.
- So payments made in 2026 for old invoices (created before 2026) are still being sent, but the corresponding invoices no longer exist.
- This produces ~3,069 errors per execution, wasting ~2 hours of processing time each run.

## Root Cause

```text
GetNewPaymentsAsync:    WHERE crr.DATA >= '2026-01-01'     -- filters by PAYMENT date
GetCashPaymentsAsync:   WHERE m.DATA >= '2026-01-01'       -- filters by INVOICE date (OK)
GetClearedChecksAsync:  WHERE c.DEPOSITO >= '2026-01-01'   -- filters by DEPOSIT date

Problem: GetNewPaymentsAsync joins CONTARECEBERREC -> CONTARECEBER -> MOVENDA
         but only filters crr.DATA (payment date), not m.DATA (invoice date).
         Old invoices had payments recorded in 2026, so they pass the filter.
```

## Plan

### 1. `DatabaseService.cs` - `GetNewPaymentsAsync` (line ~362)

Add a filter on the invoice date to ensure only payments for invoices within the sync window are sent:

```sql
-- Current:
WHERE crr.VALOR > 0
AND crr.DATA >= '2026-01-01'

-- New:
WHERE crr.VALOR > 0
AND crr.DATA >= '2026-01-01'
AND m.DATA >= '2026-01-01'          -- NEW: exclude payments for old invoices
AND m.CODCLI <> 3005                -- NEW: match invoice filter exclusion
AND TRIM(m.CODTIPOMOVIMENTO) IN ('000000007','000000018','000000064','007','018','064','7','18','64')
```

The key addition is `AND m.DATA >= '{fromDate}'` which ensures we only send payments whose parent invoice also falls within the sync date range. This mirrors the filter already used in `GetNewInvoicesAsync`.

Also add the `CODCLI <> 3005` and `CODTIPOMOVIMENTO` filters to match invoice eligibility (a payment for an excluded invoice type would also fail).

### 2. `DatabaseService.cs` - `GetClearedChecksAsync` (line ~564)

Same logic -- add invoice date filter:

```sql
-- Current:
WHERE c.DEPOSITO IS NOT NULL
AND (c.RETORNOU IS NULL OR c.RETORNOU <> 'S')
AND c.VALOR > 0
AND m.CODCLI <> 3005
AND c.DEPOSITO >= '2026-01-01'

-- New (add):
AND m.DATA >= '2026-01-01'          -- NEW: exclude checks for old invoices
AND TRIM(m.CODTIPOMOVIMENTO) IN ('000000007','000000018','000000064','007','018','064','7','18','64')
```

### 3. `GetCashPaymentsAsync` - Already OK

This method already filters by `m.DATA` (invoice date), so it does not have the problem.

### 4. No changes needed in Edge Functions or database

The fix is entirely in the C# integrator. The Edge Functions are working correctly -- they return "invoice not found" because the invoice genuinely doesn't exist.

### Expected Impact

- Eliminates ~3,069 errors per execution
- Reduces execution time from ~2 hours to ~30 minutes (only real data processed)
- No data loss -- these payments reference invoices that no longer exist anyway

### Technical Details

Files to modify:
- `ClubeFlex.Integrador/Services/DatabaseService.cs` (2 methods)

