# Seller-checkout shipping and supply basis

Scope: OrderHub supplier settlement workbook and seller-checkout document only.

Root causes: supplier-settlement parser returned after daily item grouping without reading 정산일반 shipping. Seller receivable document always subtracted commission from row netSales, with no explicit already-net seller supply basis. It ignored SKU currentTradeTerms.sellerSupplyPrice. Supplier reports were also reverse-grossed regardless of channel.

Change: 정산일반 exact summary labels read once, validate product sum and total; no summing repeated summaries/details. Seller-checkout parsing preserves file unit prices rather than reverse grossing. Reviewed sellerSupplyPrice copied from SKU commercial terms or explicitly entered, then frozen in upload terms with sellerCheckoutPricingVersion=2. New seller-checkout imports require reviewed supply prices; never infer company cost as seller supply. Documents and copied message use supply*net quantity+shipping without second commission. Missing price stays review-required. Non-seller and legacy terms use old calculations. Existing imports/snapshots are not migrated or written.

Validation: scripts/runSellerCheckoutRegression.mjs on exact supplied (1).xlsx: raw883386/shipping88000/total971386; quantities12/13/6; user-confirmed supply8674/24812/49624=>724388+88000=812388. Rate changes do not double subtract; missing supply blocks confirmation; returns and explicit shipping tested; legacy/supplier calculations preserved. Inputs unchanged. 15/15 settlement-document tests; production build passed.

Limits: no authenticated production record or saved SKU-price inspection; no production writes or browser clipboard verification. No claim that the actual old settlement has been updated. Unconfirmed affected records need original re-upload and reviewed supply confirmation; confirmed records require existing revision workflow. No migrations. Original attachment unchanged.
