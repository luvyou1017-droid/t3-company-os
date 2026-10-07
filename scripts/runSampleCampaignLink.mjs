import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Fictional fixtures only. No operational database or network access.
globalThis.localStorage = { data: new Map(), getItem(k) { return this.data.get(k) ?? null }, setItem(k,v) { this.data.set(k,String(v)) }, removeItem(k) { this.data.delete(k) } }
globalThis.fetch = async () => { throw Error('Network disabled in isolated linking tests') }
const vite = await createServer({ configFile:false, envDir:false, define:{ 'import.meta.env.VITE_SUPABASE_URL':'""', 'import.meta.env.VITE_SUPABASE_ANON_KEY':'""' }, server:{ middlewareMode:true, hmr:false }, appType:'custom' })
try {
  const model = await vite.ssrLoadModule('/src/features/samples/sampleOrderModel.ts')
  const provision = await vite.ssrLoadModule('/src/features/samples/sampleProvision.ts')
  const link = await vite.ssrLoadModule('/src/features/samples/sampleCampaignLink.ts')
  const { sampleSettlementCandidates } = await vite.ssrLoadModule('/src/features/samples/sampleSettlementCandidate.ts')
  const { makeSampleOrderStore } = await vite.ssrLoadModule('/src/features/samples/sampleOrderStore.ts')
  const { settlementService } = await vite.ssrLoadModule('/src/shared/services/settlementService.ts')
  const { storageService, STORAGE_KEYS } = await vite.ssrLoadModule('/src/shared/services/storageService.ts')
  const actor = { id:'fixture-manager', name:'테스트' }
  const campaign = { id:'fixture-campaign', campaignName:'가상 공구', sellerId:'fixture-seller', sellerName:'가상 셀러', productId:'fixture-product', productName:'가상 상품', endDate:'2026-09-30', status:'closed' }
  const draft = { itemConditionsVersion:2, primaryLineId:'loan', sellerId:campaign.sellerId, sellerName:campaign.sellerName, campaignId:'', campaignName:'', productId:campaign.productId, productName:campaign.productName, skuId:'fixture-sku-loan', brandName:'가상 브랜드', optionName:'대여 옵션', detailOption:'', quantity:1, recipient:'가상 수령인', phone:'01000000000', address:'격리 주소', purpose:'촬영', memo:'', deliveryMemo:'', payer:'seller', supportType:'full', supportAmount:null, supplierId:'fixture-supplier', costs:{sellerUnitPrice:20000,companyUnitCost:12000,capturedAt:'2026-10-07',source:'sku'}, provision:{...provision.blankProvision(),method:'대여',unitPrice:20000}, operations:provision.blankOperations(), additionalItems:[{lineId:'purchase',productId:campaign.productId,productName:campaign.productName,skuId:'fixture-sku-buy',optionName:'구매 옵션',detailOption:'',quantity:1,unitPrice:10000,provision:{...provision.blankProvision(),unitPrice:10000},supplierId:'fixture-supplier'}] }
  const order = {...model.createSampleOrder(draft,actor,'fixture-request','2026-10-01'),status:'수령완료',operations:{...draft.operations,itemLoans:{'fixture-request:loan':{loanStatus:'사용 중',shippedAt:'2026-10-01',collectionDate:'',collectionMemo:''}}}}
  const different = {...order,id:'fixture-other-product',productId:'other-product',productName:'다른 가상 상품',additionalItems:[]}
  const candidates = link.unlinkedSampleCandidates([different,order,{...order,id:'canceled',status:'취소'},{...order,id:'connected',campaignId:'other-campaign'},{...order,id:'other-seller',sellerId:'different-master-id'}],campaign)
  assert.deepEqual(candidates.map(item=>[item.order.id,item.productMatch]),[['fixture-request',true],['fixture-other-product',false]])
  assert.equal(link.sampleProductMatches(order,{...campaign,productId:'another',productName:'다른 상품',campaignProducts:[{productId:campaign.productId,productName:campaign.productName}]}),true)
  assert.equal(link.sameSampleSeller({...order,sellerId:''},campaign),true)
  const pendingTest={...order,additionalItems:[{...order.additionalItems[0],provision:{...order.additionalItems[0].provision,method:'테스트 후 진행',agreedTerms:'진행 확인 후 구매'}}]}
  assert.match(link.sampleLinkBlockReason(pendingTest),/진행 확정/)
  assert.equal(link.sampleLinkBlockReason({...pendingTest,operations:{...pendingTest.operations,itemFinancials:{'fixture-request:purchase':{...provision.blankOperations(),testStatus:'진행 확정'}}}}),'')

  let saved={revision:0,book:{schemaVersion:1,orders:[order,different]}}
  let writes=0
  const repo={read:async()=>structuredClone(saved),write:async(book,expected)=>{if(expected!==saved.revision)throw Error('CAS 충돌');writes++;saved={revision:saved.revision+1,book:structuredClone(book)};return structuredClone(saved)}}
  const store=makeSampleOrderStore(repo,async()=>actor)
  await assert.rejects(()=>store.connectCampaign(order.id,{...campaign,sellerId:'different-master-id'},order.history.length),/해당 셀러/)
  await assert.rejects(()=>store.connectCampaign(order.id,{...campaign,status:'settled'},order.history.length),/확정된 정산/)
  const frozenSettlement={id:'fixture-confirmed',campaignId:campaign.id,status:'approved',settlementConfirmed:true,calculationSnapshot:{fixture:'immutable'}}
  storageService.setItem(STORAGE_KEYS.settlements,[frozenSettlement])
  await assert.rejects(()=>store.connectCampaign(order.id,campaign,order.history.length),/확정된 정산/)
  assert.deepEqual(storageService.getItem(STORAGE_KEYS.settlements,[]),[frozenSettlement])
  storageService.setItem(STORAGE_KEYS.settlements,[])
  assert.equal(writes,0)
  const before=structuredClone(order)
  assert.equal(provision.needsCollection(order,campaign,'2026-10-07'),false)
  assert.equal(sampleSettlementCandidates(order,campaign.id).deductions.length,0)
  const concurrent=await Promise.allSettled([store.connectCampaign(order.id,campaign,order.history.length),store.connectCampaign(order.id,{...campaign,id:'competing-campaign'},order.history.length)])
  assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1, concurrent.map(result=>result.status==='rejected' ? String(result.reason) : 'fulfilled').join('; '))
  const connected=saved.book.orders.find(item=>item.id===order.id)
  assert.equal(connected.campaignId,campaign.id)
  assert.equal(connected.id,order.id)
  for(const key of ['skuId','productId','costs','priceSnapshot','provision','additionalItems','operations','recipient','phone','address']) assert.deepEqual(connected[key],before[key])
  assert.deepEqual(saved.book.orders.find(item=>item.id===different.id),different)
  assert.equal(connected.history.length,order.history.length+1)
  assert.equal(connected.settlementReflected,false)
  assert.deepEqual(settlementService.getDeductions(),[])
  assert.equal(provision.needsCollection(connected,campaign,'2026-10-07'),true)
  const deductions=sampleSettlementCandidates(connected,campaign.id).deductions
  assert.equal(deductions.length,1);assert.equal(deductions[0].amount,10000)
  assert.match(deductions[0].linkedData,/:item:purchase:/)
  await assert.rejects(()=>store.connectCampaign(order.id,campaign,order.history.length),/既存|기존 공구/)
  assert.equal(writes,1)
  const { SampleCampaignLinks }=await vite.ssrLoadModule('/src/pages/sales-data/SampleCampaignLinks.tsx')
  const html=renderToStaticMarkup(React.createElement(SampleCampaignLinks,{campaign,locked:false,disabled:false}))
  assert.ok(html.includes('일정 없이 요청한 샘플 연결'));assert.ok(html.includes('연결만으로 비용을 차감하지 않습니다.'))
  console.log('PASS same-seller/product and multi-product recommendations; equal-name different-ID exclusion; item-level test readiness')
  console.log('PASS no-schedule request -> explicit campaign link -> purchase settlement candidate + loan collection due; IDs/conditions/shipping/other records unchanged')
  console.log('PASS confirmed Snapshot lock, settled campaign lock, stale/concurrent/duplicate connection guards; no automatic settlement deductions')
} finally { await vite.close() }
