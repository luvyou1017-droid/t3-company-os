# Settlement copy / OrderHub report fix (base198)

- Text copy no longer depends on successful Storage/link generation. Both copy paths include the same currently valid link, or explicitly warn that the link is missing. No invented Drive URL or public upload fallback.
- Combined clipboard.write is invoked during the user gesture with promised PNG/HTML data. Font embed CSS reused, PNG reused for 30 seconds only when DOM/dimensions/export class unchanged, render ratio reduced from desktop2 to1.5. No measured live latency claim.
- Supplied Juwangsan workbook previously failed even with test18%: detail sheet won header selection and summary 상품합계 was not recognized. Exact OrderHub three-sheet format now prioritizes 일별 상품요약 once. Distinct options no longer group by price alone. Existing rate-based calculation unchanged; missing rate still blocks pending confirmation.
- Actual workbook test: 3 options,31 units,supplier product amount883386; explicit synthetic18% input yields1077300. No production rate set/changed. Safe seller workbook uses order-detail sheet, excludes supplier prices/internal summaries.
- Event labels changed to deduction/payment; payment add uses existing company_manager_prepaid reimbursement ONLY. Sample expenses may be entered manually; no sample-policy or automated linkage changes.
- Build, P0 regression and actual workbook tests pass. Existing historical snapshots/data untouched. Browser clipboard performance/permissions and live Storage still unverified; Storage configuration remains the blocker for missing order links.
