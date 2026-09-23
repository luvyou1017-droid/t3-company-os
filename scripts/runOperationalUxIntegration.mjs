import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import XLSX from 'xlsx'
import { createServer } from 'vite'

// In-memory repositories and synthetic orders only. No production credentials or writes.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
let passed = 0
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`) }
try {
  const { buildBaljumoaWorkbook, BALJUMOA_COLUMNS } = await server.ssrLoadModule('/src/features/samples/baljumoaExport.ts')
  const { detailOptionCandidates } = await server.ssrLoadModule('/src/features/productMaster/utils/detailOptionCandidates.ts')
  const { resolveSupplyAudience } = await server.ssrLoadModule('/src/shared/utils/supplyAudience.ts')
  const { campaignSettlementStage } = await server.ssrLoadModule('/src/shared/utils/campaignSettlementStage.ts')
  const { getCampaignTiming } = await server.ssrLoadModule('/src/features/campaignSchedules/scheduleStatus.ts')
  const { sanitizeSellerWorkbook, aggregatedSellerWorkbook } = await server.ssrLoadModule('/src/shared/utils/sellerOrderExcel.ts')
  const { createSampleOrder, validateSampleDraft, reserveSampleExport } = await server.ssrLoadModule('/src/features/samples/sampleOrderModel.ts')
  const { makeSampleOrderStore } = await server.ssrLoadModule('/src/features/samples/sampleOrderStore.ts')
  const fixture = { id: 'SAMPLE-202609-test1', requestedAt: '2026-09-21T01:00:00Z', status: '발주대기', sellerId: '', sellerName: '', targetType: 'vendor', targetDisplayName: '테스트 벤더', supplyAudience: 'vendor', campaignId: '', campaignName: '', productId: 'p1', skuId: 'sku1', brandName: '브랜드', productName: '=HYPERLINK("https://invalid")', optionName: '민트', detailOption: '2단', quantity: 2, recipient: '테스트 수령인', phone: '01000000000', address: '테스트 주소', purpose: '촬영', payer: 'company', supportType: 'full', supportAmount: null, memo: '', deliveryMemo: '', costs: { companyUnitCost: 22000, sellerUnitPrice: 30000, source: 'sku', capturedAt: '2026-09-21T00:00:00Z' }, history: [], settlementReflected: false }
  const fixtureBefore = JSON.stringify(fixture)
  await check('세부옵션 후보만 추출, 기존 분류·SKU 불변', () => {
    const sku = { id: 'legacy', optionName: '밀레마 베이지 2단 3개', productName: '밀레마' }
    assert.deepEqual(detailOptionCandidates(sku), { 컬러: '베이지', 사이즈: '2단', 구성: '3개' })
    assert.equal(sku.optionValues, undefined)
    assert.deepEqual(detailOptionCandidates({ ...sku, optionValues: { 컬러: '화이트' } }), {})
  })
  await check('종료일만 있는 공구 D+N / 미정', () => {
    assert.equal(getCampaignTiming({ endDate: '2026-09-18' }, '2026-09-21').detail, '종료 후 3일')
    assert.equal(getCampaignTiming({ startDate: '2026-09-01' }, '2026-09-21').detail, '종료일 확인 필요')
  })
  await check('KPI 명시된 거래구분만 분류, 충돌·근거 없음 보류', () => {
    assert.equal(resolveSupplyAudience({ supplyAudience: 'seller' }), 'seller')
    assert.equal(resolveSupplyAudience({ settlementVendorName: '거래처' }), 'vendor')
    assert.equal(resolveSupplyAudience({ supplyAudience: 'vendor' }, { supplyAudience: 'seller' }), 'unknown')
    assert.equal(resolveSupplyAudience({ sellerName: '셀러(벤더)' }), 'unknown')
  })
  await check('일정 정산 단계는 기존 값에서 표시만 계산', () => {
    const campaign = { endDate: '2026-08-01' }
    assert.equal(campaignSettlementStage(campaign, undefined, undefined, '2026-09-21'), '판매데이터 대기')
    assert.equal(campaignSettlementStage(campaign, undefined, { reviewStatus: '확정 완료' }), '판매데이터 확인')
    assert.equal(campaignSettlementStage(campaign, { status: 'draft' }), '정산서 작성중')
    assert.equal(campaignSettlementStage(campaign, { settlementConfirmed: true }), '정산서 작성 완료')
    assert.equal(campaignSettlementStage(campaign, { sellerPaymentRequestStatus: 'approval_pending' }), '대표 승인 대기')
    assert.equal(campaignSettlementStage(campaign, { sellerPaymentRequestStatus: 'approved' }), '입금 대기')
    assert.equal(campaignSettlementStage(campaign, { status: 'completed' }), '지급 완료')
    assert.deepEqual(campaign, { endDate: '2026-08-01' })
  })
  await check('발주모아 28개 컬럼·Supply·노란 10칸·2행·스타일 보존', async () => {
    const template = new Uint8Array(await fs.readFile('public/templates/baljumoa-manual.xlsx'))
    const bytes = buildBaljumoaWorkbook(template, [fixture, { ...fixture, id: 'SAMPLE-202609-test2', quantity: 3 }])
    const workbook = XLSX.read(bytes, { type: 'array' })
    assert.deepEqual(workbook.SheetNames, ['Supply'])
    const sheet = workbook.Sheets.Supply
    assert.deepEqual(XLSX.utils.sheet_to_json(sheet, { header: 1 })[0], BALJUMOA_COLUMNS)
    assert.equal(sheet.A2.v, fixture.id); assert.equal(sheet.D2.v, fixture.recipient)
    assert.equal(sheet.E2.v, '01000000000'); assert.equal(sheet.E2.t, 's')
    assert.equal(sheet.F2.v, fixture.recipient); assert.equal(sheet.G2.v, fixture.phone)
    assert.equal(sheet.K2.v, fixture.productName); assert.equal(sheet.K2.f, undefined)
    assert.equal(sheet.L2.v, '민트 / 2단'); assert.equal(sheet.M3.v, 3)
    assert.equal(sheet.H2?.v, undefined); assert.equal(sheet.A4?.v, undefined)
    const date = XLSX.SSF.parse_date_code(sheet.B2.v); assert.deepEqual([date.y,date.m,date.d], [2026,9,21])
    const before = XLSX.CFB.read(template, { type: 'array' }); const after = XLSX.CFB.read(bytes, { type: 'array' })
    for (const path of before.FullPaths.filter(path => path.endsWith('.xml') && !path.endsWith('sheet1.xml'))) {
      assert.deepEqual(Buffer.from(XLSX.CFB.find(before, path).content), Buffer.from(XLSX.CFB.find(after, path).content), path)
    }
    assert.equal(JSON.stringify(fixture), fixtureBefore)
  })
  await check('셀러 Excel 내부컬럼·수식·숨김시트·메모 유출 차단', () => {
    const book = XLSX.utils.book_new()
    const source = XLSX.utils.aoa_to_sheet([['주문번호','구매자명','연락처','주소','상품명','옵션','수량','결제금액','회사 실제 원가','매니저 배분액','알수없는내부필드'], ['0001','테스트','01000000000','테스트 주소','상품','민트',2,40000,22000,8000,'secret']])
    source.E2.f = 'HYPERLINK("https://invalid","상품")'; source.E2.c = [{ a: '내부', t: '회사마진' }]
    XLSX.utils.book_append_sheet(book, source, '주문내역')
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['회사 마진'],[8000]]), '내부정산')
    const safe = XLSX.read(sanitizeSellerWorkbook(XLSX.write(book, { type:'array', bookType:'xlsx' })), { type:'array' })
    assert.equal(safe.SheetNames.length, 1)
    const sheet = safe.Sheets[safe.SheetNames[0]]
    const values = XLSX.utils.sheet_to_json(sheet, { header:1 })
    assert.equal(values[0].length, 8); assert.equal(sheet.C2.v, '01000000000')
    assert.equal(sheet.E2.f, undefined); assert.equal(sheet.E2.c, undefined)
    assert.ok(!JSON.stringify(values).includes('secret'))
    const aggregate = XLSX.read(aggregatedSellerWorkbook([{ productName:'상품',optionName:'민트',quantity:2,unitPrice:20000,grossSales:40000,canceledQuantity:0,refundedQuantity:0,netQuantity:2,netSales:40000,settlementSupplyPrice:22000,totalCommissionRate:40 }]),{type:'array'})
    assert.ok(!JSON.stringify(XLSX.utils.sheet_to_json(aggregate.Sheets[aggregate.SheetNames[0]])).includes('공급'))
  })
  await check('셀러 링크 14일 TTL·생성파일만 교체·원본 보존 (Storage 모의)', async () => {
    const { supabase } = await server.ssrLoadModule('/src/shared/lib/supabase.ts')
    const { sellerSettlementFileService: service } = await server.ssrLoadModule('/src/shared/services/sellerSettlementFileService.ts')
    assert.ok(supabase, 'Existing public configuration required; no network calls made')
    const originalFrom = supabase.storage.from
    const calls = []
    const expiry = Math.floor(Date.now()/1000) + 14*24*60*60
    const token = `header.${Buffer.from(JSON.stringify({exp:expiry})).toString('base64url')}.signature`
    supabase.storage.from = bucket => {
      assert.equal(bucket, 'seller-documents')
      return {
        upload: async (path, bytes, options) => { calls.push(['upload',path]); assert.equal(options.upsert,false); assert.ok(bytes.length); return {error:null} },
        createSignedUrl: async (path, ttl) => { assert.equal(ttl,14*24*60*60); return {data:{signedUrl:`https://test.invalid/file?token=${token}`},error:null} },
        remove: async paths => { calls.push(['remove',...paths]); return {error:null} },
      }
    }
    try {
      const old = 'settlement-exports/seller-safe/old/v1/test.xlsx'
      const result = await service.generateSellerExcel({sellerExcelExport:{path:old}},[], 'test-settlement',2)
      assert.equal(result.version,2); assert.equal(result.expiresAt,new Date(expiry*1000).toISOString())
      assert.equal(calls[0][0],'upload'); assert.deepEqual(calls[1],['remove',old])
      await assert.rejects(service.revokeGenerated('settlement-exports/campaigns/original.xlsx'),/생성 파일/)
    } finally { supabase.storage.from = originalFrom }
  })
  await check('베벤더/미지정 등록, 이후 셀러 연결 시 배송·비용 Snapshot 유지', async () => {
    validateSampleDraft(fixture)
    validateSampleDraft({ ...fixture, targetType: 'unspecified', targetDisplayName: '' })
    assert.throws(() => validateSampleDraft({ ...fixture, targetType: 'seller' }), /셀러/)
    const actor = { id: 'test', name: '테스트' }
    let stored = { book: { schemaVersion:1, orders: [createSampleOrder(fixture, actor, fixture.id, fixture.requestedAt)] }, revision: 1 }
    const store = makeSampleOrderStore({ read: async () => structuredClone(stored), write: async (book, revision) => { assert.equal(revision,stored.revision); stored = { book,revision:revision+1 }; return structuredClone(stored) } }, async () => actor)
    await store.connectSeller(fixture.id, { id: 'existing-seller', name: '셀러' }, 1)
    assert.equal(stored.book.orders[0].sellerId, 'existing-seller')
    assert.equal(stored.book.orders[0].address, fixture.address)
    assert.deepEqual(stored.book.orders[0].costs, fixture.costs)
    await assert.rejects(store.connectSeller(fixture.id, { id:'other', name:'다른 셀러' },2))
  })
  await check('동일 샘플 중복발주 차단 / 원본 요청 불변', () => {
    const book = reserveSampleExport({ schemaVersion:1, orders:[fixture] }, [fixture.id], 'batch', { id:'test',name:'test' }, fixture.requestedAt)
    assert.throws(() => reserveSampleExport(book,[fixture.id],'second',{id:'test',name:'test'},fixture.requestedAt), /중복/)
    assert.equal(JSON.stringify(fixture),fixtureBefore)
  })
  await check('빠른 SKU 실제 서비스 저장·재조회·중복 방지·샘플 전용 승격', async () => {
    const { SupabaseProductRepository } = await server.ssrLoadModule('/src/features/productMaster/repositories/SupabaseProductRepository.ts')
    const { LocalProductRepository } = await server.ssrLoadModule('/src/features/productMaster/repositories/LocalProductRepository.ts')
    const originalSku = { id:'old-sku',productId:'p1',optionName:'2단',optionValues:{컬러:'화이트'},active:true, lifecycleStatus:'active',supplyPrice:22000 }
    let products = [{ id:'p1',brandId:'brand1',brandName:'브랜드',productName:'빨래바구니',active:true, lifecycleStatus:'active',version:2,skus:[originalSku] }]
    const original = JSON.stringify(originalSku)
    const methods = ['listProducts','getProductById','updateProduct','createProduct']
    const classes = [SupabaseProductRepository,LocalProductRepository]
    const backups = classes.map(Class => Object.fromEntries(methods.map(name => [name,Class.prototype[name]])))
    for (const Class of classes) {
      Class.prototype.listProducts = async () => structuredClone(products)
      Class.prototype.getProductById = async id => structuredClone(products.find(item => item.id === id) ?? null)
      Class.prototype.updateProduct = async (product,expected) => {
        assert.equal(products.find(item => item.id === product.id).version,expected)
        products = products.map(item => item.id === product.id ? structuredClone(product) : item)
        return structuredClone(product)
      }
      Class.prototype.createProduct = async product => { products.push(structuredClone(product)); return product }
    }
    try {
      const { productService } = await server.ssrLoadModule('/src/features/productMaster/services/productService.ts')
      const input = { productId:'p1',brandName:'브랜드',productName:'빨래바구니',optionName:'3단',detailOption:'베이지',vendorName:'공급사',companySupplyPrice:22000,sellerSupplyPrice:30000 }
      const result = await productService.registerQuickSku(input)
      assert.equal(result.created,true); assert.equal(result.product.id,'p1')
      assert.ok(products[0].skus.some(item => item.id === result.sku.id))
      assert.equal(JSON.stringify(products[0].skus[0]),original)
      const again = await productService.registerQuickSku(input)
      assert.equal(again.created,false); assert.equal(again.sku.id,result.sku.id)
      assert.equal(products[0].skus.length,2)
      const sample = await productService.registerQuickSku({ ...input, productId:undefined, productName:'촬영용 집게',sampleOnly:true })
      assert.equal(sample.product.sampleOnly,true); assert.equal(sample.sku.sampleOnly,true)
      assert.ok(!(await productService.listProducts()).some(item => item.id === sample.product.id))
      assert.ok((await productService.listProductsForImport()).some(item => item.id === sample.product.id))
      // Promotion changes flags on the same records, without a second SKU.
      const promoted = { ...sample.product, sampleOnly:false, skus:sample.product.skus.map(item => ({ ...item,sampleOnly:false })), version:sample.product.version+1 }
      products = products.map(item => item.id === promoted.id ? promoted : item)
      const visible = (await productService.listProducts()).find(item => item.id === promoted.id)
      assert.equal(visible.skus[0].id,sample.sku.id)
    } finally { classes.forEach((Class,index) => Object.assign(Class.prototype,backups[index])) }
  })
} finally { await server.close() }
console.log(`${passed} integration checks passed. Production/browser/actual Baljumoa upload NOT tested.`)
