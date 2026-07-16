# Sales Data

## Workflow

Sales Data manages sales files or manual sales rows received from brands before settlement.

The workflow is:

1. Check whether the brand sales file was received.
2. Upload file metadata or enter sales rows manually.
3. Review option-level quantity and revenue.
4. Check cancellations and refunds.
5. Validate the data.
6. Confirm the sales data.
7. Mark the record ready for settlement.

## Campaign Connection

Every `SalesDataImport` and `SalesDataRow` has `campaignId`.

The Sales Data page, Campaign Detail sales tab, and My Work records all read the same shared service data through `salesDataService`.

## Upload and Manual Entry

Upload mode stores only file metadata:

- file name
- file size
- uploaded by
- uploaded at
- source type

The actual file is not stored in localStorage.

Manual mode stores option-level sales rows directly:

- option name
- quantity
- unit price
- canceled quantity
- refunded quantity

Totals are recalculated from rows.

## Validation Rules

Validation is implemented in `src/shared/utils/salesData.ts`.

Rules:

- Quantity cannot be negative.
- Unit price must be greater than 0.
- Canceled quantity cannot exceed quantity.
- Refunded quantity cannot exceed quantity.
- Net quantity cannot be negative.
- Option name is required.
- Row totals must match import header totals.
- Uploaded product name mismatch creates a warning.
- Sales period mismatch creates a warning.

Validation results are grouped as:

- `valid`
- `warning`
- `error`

Sales data cannot be confirmed while an error exists.

## localStorage Structure

Sales Data uses only `storageService`.

Keys:

- `t3_company_os_sales_data_imports`
- `t3_company_os_sales_data_rows`

## Settlement Preparation

Confirmed Sales Data moves to `정산 가능`.

The `정산 생성 준비` action marks the import as `정산 생성됨` and creates a My Work item for settlement preparation. The actual Settlement service is still a future step.

## Replacement Points

When real Excel parsing is introduced, replace the mock row generation inside the Sales Data upload flow.

When Supabase is introduced, replace:

- `storageService.ts`
- `salesDataService.ts`

Pages should continue calling the service layer instead of localStorage or Supabase directly.

## Mocked in This Version

- Excel parsing
- CSV parsing
- File storage
- AI API analysis
- Settlement creation
- Supabase persistence

The AI analysis card is rule-based and uses current sales rows plus validation results.
