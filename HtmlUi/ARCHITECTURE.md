# Sales Docket HtmlUi Architecture

## Goal

Replace the fixed-row sheet UI with an HTML-first POS that:

- supports effectively unlimited line items
- preserves server-side persistence in Google Sheets
- keeps existing business rules from the current Sales Docket script
- generates multi-page PDF documents from a separate render layer
- removes checkbox-driven actions from the docket sheet

This design is based on the current Sales Docket `test` codebase, especially:

- [Code.js](C:\Users\toral\my-apps-script\systems\SalesDocket\test\Code.js:6379) `onEditInstallable`
- [Code.js](C:\Users\toral\my-apps-script\systems\SalesDocket\test\Code.js:2658) `bookSalesDocket`
- [Code.js](C:\Users\toral\my-apps-script\systems\SalesDocket\test\Code.js:4139) `saveAsQuotation`
- [Code.js](C:\Users\toral\my-apps-script\systems\SalesDocket\test\Code.js:4742) `populateSalesDocketWithJson`
- [Code.js](C:\Users\toral\my-apps-script\systems\SalesDocket\test\Code.js:2029) `updateVatTotalCell`

## Current Rules To Preserve

### Edit flow

The current sheet UI centers almost all user-facing behavior in `onEditInstallable`:

- product autofill when product cell changes
- protection of non-editable areas
- customer/email validation
- quotation loading
- export/domestic pricing mode
- booking and quotation commands
- line clearing when product cell is blanked

### Pricing and VAT behavior

The current total logic does not just apply one VAT rate blindly.

Relevant helpers:

- [Code.js](C:\Users\toral\my-apps-script\systems\SalesDocket\test\Code.js:84) `getApplicableVatRateForSheet_`
- [Code.js](C:\Users\toral\my-apps-script\systems\SalesDocket\test\Code.js:94) `getStandardMarketVatRateForSheet_`
- [Code.js](C:\Users\toral\my-apps-script\systems\SalesDocket\test\Code.js:56) `isExportMode_`
- [Code.js](C:\Users\toral\my-apps-script\systems\SalesDocket\test\Code.js:2029) `updateVatTotalCell`

Current exemption rules are hard-coded:

- descriptions containing `crate`
- `still` items on `Sales Docket - AQAU`
- product `Y0210`
- product `X0012`

Current meaning:

- exempt rows are treated as already-net rows
- export mode also makes all rows net
- totals are computed from gross line totals in column `F`
- net and VAT are derived line by line according to row-specific exemption logic

## Recommended Data Model

Use Sheets as normalized storage, not as the live visual form.

### Sheet: `Dockets`

One row per open or completed docket.

Columns:

1. `docket_id`
2. `status`
3. `company_code`
4. `title`
5. `document_number`
6. `quotation_number`
7. `customer_name`
8. `customer_email`
9. `order_number`
10. `payment_terms`
11. `pricing_mode`
12. `vat_rate_default`
13. `currency_code`
14. `subtotal_net`
15. `shipping_net`
16. `vat_amount`
17. `grand_total_gross`
18. `line_count`
19. `source_quotation_number`
20. `created_at`
21. `created_by`
22. `updated_at`
23. `updated_by`
24. `booked_at`
25. `booked_by`
26. `pdf_url`
27. `notes_json`

Status values:

- `draft`
- `quotation`
- `booked`
- `cancelled`
- `archived`

Pricing mode values:

- `domestic`
- `export`

### Sheet: `DocketLines`

One row per line item.

Columns:

1. `docket_id`
2. `line_id`
3. `sort_order`
4. `product_nr`
5. `full_detail`
6. `description`
7. `qty`
8. `unit_price_input`
9. `unit_price_net`
10. `unit_price_gross`
11. `line_total_net`
12. `line_total_gross`
13. `vat_rate_applied`
14. `tax_rule_code`
15. `is_tax_exempt`
16. `source`
17. `created_at`
18. `created_by`
19. `updated_at`
20. `updated_by`
21. `deleted_at`
22. `deleted_by`

Notes:

- `unit_price_input` stores what the user entered
- `unit_price_net` and `unit_price_gross` are normalized values used for totals and rendering
- line deletion should be soft-delete first
- UI should exclude deleted rows by default

### Sheet: `DocketAudit`

Append-only audit log.

Columns:

1. `event_id`
2. `docket_id`
3. `line_id`
4. `event_type`
5. `actor`
6. `event_at`
7. `payload_json`

Event examples:

- `docket_created`
- `header_updated`
- `line_added`
- `line_updated`
- `line_deleted`
- `quotation_saved`
- `quotation_loaded`
- `sale_booked`

### Sheet: `TaxRules`

Move exemption logic out of source code.

Columns:

1. `rule_code`
2. `match_type`
3. `match_value`
4. `company_code`
5. `pricing_mode`
6. `vat_rate_override`
7. `treat_as_net`
8. `active`
9. `notes`

Examples:

| rule_code | match_type | match_value | company_code | pricing_mode | vat_rate_override | treat_as_net | active | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crate_keyword` | `description_contains` | `crate` | `` | `` | `0` | `TRUE` | `TRUE` | crate rows exempt |
| `aqau_still_keyword` | `description_contains` | `still` | `AQAU` | `` | `0` | `TRUE` | `TRUE` | AU still water exempt |
| `penalty_y0210` | `product_nr` | `Y0210` | `` | `` | `0` | `TRUE` | `TRUE` | penalty exempt |
| `shipping_x0012` | `product_nr` | `X0012` | `` | `` | `0` | `TRUE` | `TRUE` | shipping line exempt |

This sheet should be the source for row-level VAT behavior.

### Sheet: `RenderQueue` or dedicated render workbook

Do not use `Dockets` or `DocketLines` as the print layout.

Use either:

- one hidden render sheet per company template
- or one dedicated render workbook per output family

The render step should:

- take a `docket_id`
- load header and lines
- page-break lines across as many pages as needed
- write totals and footer into the template
- export PDF

## Totals Algorithm

The new backend should reproduce current total behavior, but from normalized rows.

### Inputs

- docket pricing mode
- company default VAT rate
- tax rules from `TaxRules`
- line `qty`
- line `unit_price_input`
- product number
- description

### Per-line resolution

For each line:

1. Determine applicable tax rule from `TaxRules`.
2. Determine effective VAT rate:
   - `0` for export mode
   - `0` for matching exempt rules
   - otherwise docket default VAT rate
3. Normalize entered price:
   - in domestic mode, user-facing price is gross unless explicit net mode is chosen later
   - in export mode, price is treated as net
4. Compute:
   - `unit_price_net`
   - `unit_price_gross`
   - `line_total_net`
   - `line_total_gross`

### Docket totals

Aggregate across active lines:

- `subtotal_net = sum(line_total_net for non-shipping lines)`
- `shipping_net = sum(line_total_net for shipping-class lines)`
- `vat_amount = sum(line_total_gross - line_total_net)`
- `grand_total_gross = sum(line_total_gross)`

This replaces the current fragile dependence on:

- `F38`
- `F39`
- `F40`
- `F41`
- `F42`

Those cells can still be populated in the render layer via named ranges.

## UI Behavior

### Required line-item actions

The HTML UI must support:

- add line
- edit product
- edit description where allowed
- edit quantity
- edit price
- delete line
- reorder lines later if needed

### Delete behavior

Delete should mean:

- mark row deleted in `DocketLines`
- append `line_deleted` audit event
- recalculate docket totals
- refresh UI list immediately

This is better than the current sheet behavior, which is just:

- clear `B:E` when product is removed

### Edit validation

The new backend should preserve the existing intent of `isEditAllowed_` and the special rules in `onEditInstallable`, but as API validation.

Preserve:

- customer and email fields editable
- payment/order fields editable
- product entry editable
- timber restrictions on description edits
- validation that lines with product must have quantity and total before quotation or booking

Move from A1-based gating to field-based validation.

## API Contract

### Docket

- `createDocket(companyCode)`
- `listOpenDockets(companyCode)`
- `loadDocket(docketId)`
- `saveHeader(docketId, headerPatch)`
- `deleteDocket(docketId)` optional

### Lines

- `addLine(docketId, productNr)`
- `updateLine(docketId, lineId, patch)`
- `deleteLine(docketId, lineId)`
- `restoreLine(docketId, lineId)` optional
- `recalculateDocket(docketId)`

### Product support

- `searchProducts(query)`
- `getProductDefaults(productNr, docketId)`

### Workflow

- `saveQuotation(docketId)`
- `loadQuotationIntoDocket(quotationNr, docketId)`
- `bookSale(docketId)`
- `generatePdf(docketId)`

## Mapping From `onEditInstallable`

Current trigger behavior should be refactored like this:

- `C5` export/domestic switch
  - old: trigger branch
  - new: `saveHeader` updates `pricing_mode`, then `recalculateDocket`

- `B8:B37` product entry
  - old: write full detail, description, unit price into row
  - new: `addLine` or `updateLine(product_nr)`

- `C8:C37` timber protection
  - old: restore blocked edit
  - new: validation in `updateLine(description)`

- `F44` book sales checkbox
  - old: checkbox
  - new: client button -> `bookSale(docketId)`

- `F45` save quotation checkbox
  - old: checkbox
  - new: client button -> `saveQuotation(docketId)`

- `F46` retrieve quotation dropdown
  - old: dropdown with JSON load
  - new: quotation picker -> `loadQuotationIntoDocket`

- row clearing
  - old: clear row cells
  - new: `deleteLine`

## PDF Rendering Strategy

Recommended:

1. Build a render DTO from `Dockets` + active `DocketLines`.
2. Fill a dedicated render template sheet.
3. Repeat the line section across multiple pages as needed.
4. Populate totals and footer via named ranges.
5. Export PDF.

Named ranges are still useful here:

- `render_title`
- `render_document_number`
- `render_customer_name`
- `render_customer_email`
- `render_order_number`
- `render_payment_terms`
- `render_subtotal`
- `render_shipping`
- `render_vat_rate`
- `render_vat_amount`
- `render_grand_total`

## First Implementation Slice

The first safe build step should be:

1. Create `Dockets`
2. Create `DocketLines`
3. Create `TaxRules`
4. Implement:
   - `createDocket`
   - `loadDocket`
   - `saveHeader`
   - `addLine`
   - `updateLine`
   - `deleteLine`
   - `recalculateDocket`
5. Port current VAT/exemption logic into `TaxRules` + resolver function

That is enough to replace the current fixed-row data-entry model while leaving quotation and booking for the next slice.

## Recommendation

Do not extend the current form sheet below row 37.

Use:

- normalized Sheets tables for persistence
- HTML UI for operations
- render template for PDF output

This gives:

- unlimited lines
- explicit delete/edit semantics
- safer totals
- maintainable tax-rule configuration
- easier migration of the existing business logic
