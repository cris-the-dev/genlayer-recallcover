# RecallCover — product-recall cover paid when the regulator's page lists the recall

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

When a product is recalled, the shop left with unsellable stock and the owner of
a now-dangerous appliance wait on the maker, the importer or an insurer's claim
desk. **RecallCover** sells fixed-sum cover against one event anyone can check:
the product-safety regulator lists a recall of this product. An underwriter
opens a pool for one product and its model identifier, names a recall page on
a regulator's host the contract owner approved, and escrows
every payout it may owe. Buyers pay a premium. Anyone can ask GenLayer
validators to read the page: if it lists a recall of the product, quoted word
for word, every policy can be paid at once, by anyone. If nothing is listed by
the end of the cover, the underwriter gets the collateral back and keeps the
premiums, but only after validators read the page one last time and agree
it lists no recall; while that reading cannot be made, nothing moves.

```
owner       ── deploy(sources) / set_source(host, name)          approved regulator hosts
underwriter ── open_pool(product, model, url, premium, payout, capacity, hours) + payout × capacity ─▶ RecallCover
               url on an approved host (or its subdomain), else refused before any reading;
               validators read the page now: reachable, ≤ 20,000 characters, no recall of the product yet
buyer       ── buy(pool, count) + premium × count   (before the end; reads the page first:
               a listed recall ─▶ RECALLED, nothing sold, premium sent straight back)
anyone      ── check(pool): validators read the page and agree on none / recalled,
               plus a sentence each of them finds on its own copy
               recalled ─▶ every policy claimable, sales closed
anyone      ── claim(policy) ─▶ payout × count to the holder
anyone      ── release(pool): RECALLED ─▶ premiums + unsold collateral to the underwriter
               ON after the end ─▶ final reading required; none ─▶ CLOSED, everything to the underwriter;
               page unavailable or unclear ─▶ reverts, pool stays ON (no lapse, ever)
anyone      ── settle_payout(payout, tx, finalize_tx) / payee ── recover(to)
```

## Live deployment

App: https://recallcover.cristhedev.com (pools, their readings with quotes, policies and every role's actions; source in [`app/`](app/))  
Testnet Bradbury Phase 2 (chainId 4221, GenVM v0.3): [`0x1c1d82D6541B2c8Edc8f1C8e98E252b7C2a0D882`](https://explorer-bradbury.genlayer.com/address/0x1c1d82D6541B2c8Edc8f1C8e98E252b7C2a0D882) (v1.1.0). The v1.0.0 deployment without the source registry and with the lapse, `0xBD749A903cd6505486CAD428c6B2C2ea0e5D1387`, is retired.

## Bradbury evidence

Run by [`tests/integration/bradbury.mjs`](tests/integration/bradbury.mjs) on Bradbury Phase 2 (all checks passed). Contract `0x1c1d82D6541B2c8Edc8f1C8e98E252b7C2a0D882` (deploy [`0xb2832d4b…`](https://explorer-bradbury.genlayer.com/tx/0xb2832d4bd7635a8eb0a096b85b1ce9d15eb7f99e07195d6c068fa5d9515064ed)), code `build/recall_cover.py` (sha256 `94d5ec2b…`), deployed with one approved source: `recallcover.cristhedev.com`. Underwriter and two buyers are separate accounts. The regulator's page is served from [`evidence/`](evidence/); mid-run [`recalls.html`](evidence/recalls.html) was replaced by [`recalls-k200.html`](evidence/recalls-k200.html), which adds the kettle recall, and the run waited for it. After the hair-dryer cover ended, its page [`notices.html`](evidence/notices.html) was taken down (404): release reverted and the pool stayed ON; once the page was back, release read it and closed the pool.

| Step | Transaction | Outcome |
|---|---|---|
| approve a source as a buyer | [`0x60b1d73a…`](https://explorer-bradbury.genlayer.com/tx/0x60b1d73a0e700f8395a1555c0dee9d62de329f2960f5789de2e1ae3190aa3269) | rejected: only the owner approves sources |
| open a pool on the seller's own site | [`0xd266948d…`](https://explorer-bradbury.genlayer.com/tx/0xd266948d57744ca459b662ee31fc2b9b372284e979362aeef3c51b4352b37aa0) | rejected before reading: host is not an approved source |
| open a pool on the parent domain | [`0xa28f96d5…`](https://explorer-bradbury.genlayer.com/tx/0xa28f96d55173b62d7a3783cafd957baab5e9748054682e9faf6da1887254c526) | rejected before reading: parent domain is not the approved source |
| open a pool for model K300 | [`0x984dabea…`](https://explorer-bradbury.genlayer.com/tx/0x984dabea5ccf9d0f2a6e546bb38df89305d77e652d65755b8776d8671cddfb6e) | rejected: the model must be part of the product name |
| open a pool for the recalled toaster | [`0x15c1705d…`](https://explorer-bradbury.genlayer.com/tx/0x15c1705d86ed144ee7aa81a837bed9f07ee37e9dc5ca0704d25637b1e435b96a) | reverts: the page already lists the Acme T9 toaster recall |
| open the hair-dryer pool (1 hour) | [`0x0e60c167…`](https://explorer-bradbury.genlayer.com/tx/0x0e60c167b3c14f9b01d6dd5d70dfcdf7084ba61e5e4d5f5984fef8b62fc9f433) | ok: pool #0, 3 × 0.0001 GEN escrowed, cover ends in 1 h |
| buy 1 hair-dryer policy | [`0xf6bc5183…`](https://explorer-bradbury.genlayer.com/tx/0xf6bc5183fbfb40a55550ee1b9a68809f5ceff01283c065b93b5013e054da02fe) | ok: policy #0, 0.00002 GEN premium |
| open the kettle pool short of collateral | [`0xb50724a3…`](https://explorer-bradbury.genlayer.com/tx/0xb50724a39b769dcc8101c75e45b864d34f24f53d0f9095999ae9db5f8b2fbbd7) | rejected: collateral must be payout × capacity |
| open the kettle pool | [`0x936c8b85…`](https://explorer-bradbury.genlayer.com/tx/0x936c8b854f01e5197e5b79cab4beeefa5bc35f054ba441b3e9e780e57bc90146) | ok: pool #1 (Brightway K200), 5 × 0.0001 GEN escrowed, page read: no recall |
| buy as the underwriter | [`0xb73e8cbf…`](https://explorer-bradbury.genlayer.com/tx/0xb73e8cbf9df3838cf5f337c34f3e8dd8f51a9d5c24103c38a7538424ba9e7e73) | rejected: the underwriter cannot buy |
| buy 2 policies paying for 1 | [`0xf9738bdb…`](https://explorer-bradbury.genlayer.com/tx/0xf9738bdbf96579d702973e8006c405bdecb3a005cb14d553780505c7fb28d2fd) | rejected: send exactly premium × count |
| buy 2 kettle policies | [`0xcb613fb6…`](https://explorer-bradbury.genlayer.com/tx/0xcb613fb63accc4a1f6609b41a4703bbdb894f9c10c435481ded765dfb0550775) | ok: policy #1 |
| buy 1 kettle policy | [`0x73b5eae2…`](https://explorer-bradbury.genlayer.com/tx/0x73b5eae21138c5b20846acf70b3a6200480f5233e2cac7c772b15d1ce173cfd5) | ok: policy #2 |
| claim while on | [`0xb851674f…`](https://explorer-bradbury.genlayer.com/tx/0xb851674fd7a2c16a34b970cdb9af7314bd6c0d0ef09248decf7e07e852ccf976) | rejected: pool is ON, nothing to claim |
| read the page (nothing yet) | [`0x67484e02…`](https://explorer-bradbury.genlayer.com/tx/0x67484e0294f6992ed8998d51300d5f54d769e6f6861580ac65b29c5f43f26025) | `none`: still ON, 3 policies sold |
| buy after the recall is listed (reads the page, premium sent back) | [`0x2ea4a693…`](https://explorer-bradbury.genlayer.com/tx/0x2ea4a693d178788b4c296b02813870191712647532b2a671c6618f3d78907756) | **`recalled`**, quoted: “The Brightway K200 electric kettle is recalled because the base can overheat and melt.” Pool RECALLED, nothing sold, 0.00002 GEN premium returned = payout 0 |
| buy again | [`0xa364eec2…`](https://explorer-bradbury.genlayer.com/tx/0xa364eec2b338d73f1d6f5f2abacd09e6d8a395e94cdbd53e57d39da9d4f36274) | rejected: sales closed |
| read the page again | [`0x2af197ab…`](https://explorer-bradbury.genlayer.com/tx/0x2af197ab7c2577c2998b6b3e12d5e15f3afbb81e0715f005f5b7838eeb9fc325) | rejected: pool already RECALLED |
| claim policy for 2 (anyone sends it) | [`0xd4542830…`](https://explorer-bradbury.genlayer.com/tx/0xd45428301fb7890b79b13c7651b496967716d0282b70fa4b79126c5f3eb18a3c) | 0.0002 GEN to the holder = payout 1 (sent by another account) |
| claim it again | [`0x6ddb9aa6…`](https://explorer-bradbury.genlayer.com/tx/0x6ddb9aa6653d2616dbd63cf2648895a7f25e5885cc1ced03c5f643c7a63d9c99) | rejected: already claimed |
| claim policy for 1 | [`0x6fea27ea…`](https://explorer-bradbury.genlayer.com/tx/0x6fea27ea5ccb3060772f55e245e3481791bd6fc010f6ac675aaa290030bc698e) | 0.0001 GEN to the holder = payout 2 |
| release the kettle pool | [`0x7aeeb9cf…`](https://explorer-bradbury.genlayer.com/tx/0x7aeeb9cfc83c7de8daca27e79d3df52122de487ed538fa1c962c95b147159f9e) | 3 premiums + 2 unsold payouts = 0.00026 GEN to the underwriter = payout 3 |
| release the hair-dryer pool early | [`0x3a404fd1…`](https://explorer-bradbury.genlayer.com/tx/0x3a404fd120aaa0a857af600620c5f7cca4fc264486361bfc2673e30f8459f175) | rejected: the cover has not ended |
| release while the page is unavailable | [`0xe63908f0…`](https://explorer-bradbury.genlayer.com/tx/0xe63908f0707fd8546b09261fd15959e575f3c61e566bd2887cb885591c32cd10) | **reverts: page 404, no final reading; pool stays ON with its collateral** |
| release the hair-dryer pool | [`0x965d9dcf…`](https://explorer-bradbury.genlayer.com/tx/0x965d9dcf8a7781d92a5bbdcc2c9d8f25aeb280e985b64dbcf426059aa83a3861) | **after the end, one last reading: `none`, CLOSED**, 0.00032 GEN (premium + collateral) to the underwriter = payout 4 |

Every payout was settled from its own transfer once the paying transaction finalized:

| Payout | Kind | Paid by | Finalized by | `settle_payout` | Result |
|---|---|---|---|---|---|
| 0 | returned → buyer (late kettle buy, premium back) | [`0x2ea4a693…`](https://explorer-bradbury.genlayer.com/tx/0x2ea4a693d178788b4c296b02813870191712647532b2a671c6618f3d78907756) | [`0xc8ec2333…`](https://explorer-bradbury.genlayer.com/tx/0xc8ec233334561920f53be39728cf11c0af73c794fad5a2be03737794b1eb5689) | [`0x15c1716e…`](https://explorer-bradbury.genlayer.com/tx/0x15c1716e69888e3aa9a4f37cd44d8157e6dce142111ac89ea61d55ed96766d98) | DELIVERED |
| 1 | claim → holder (kettle, 2 policies) | [`0xd4542830…`](https://explorer-bradbury.genlayer.com/tx/0xd45428301fb7890b79b13c7651b496967716d0282b70fa4b79126c5f3eb18a3c) | [`0x736ba7aa…`](https://explorer-bradbury.genlayer.com/tx/0x736ba7aa65fb8b23cda6c70ea0d73612eb4648b203bed469b7fffc002394031d) | [`0xaa70d150…`](https://explorer-bradbury.genlayer.com/tx/0xaa70d150fbf7e250dc9fb5c74f413357cb983a42100003a098c6b4ef2d975cd1) | DELIVERED |
| 2 | claim → holder (kettle, 1 policy) | [`0x6fea27ea…`](https://explorer-bradbury.genlayer.com/tx/0x6fea27ea5ccb3060772f55e245e3481791bd6fc010f6ac675aaa290030bc698e) | [`0x079481a9…`](https://explorer-bradbury.genlayer.com/tx/0x079481a9e147f23838cf7f45a1ed6630b4ac67296f288fdffe3ba2ec16531806) | [`0x2b69e87a…`](https://explorer-bradbury.genlayer.com/tx/0x2b69e87abdf0bc8d953001b3576e112e239b43065495ac2d22872a8cfe24321b) | DELIVERED |
| 3 | release → underwriter (kettle: 3 premiums + 2 unsold payouts) | [`0x7aeeb9cf…`](https://explorer-bradbury.genlayer.com/tx/0x7aeeb9cfc83c7de8daca27e79d3df52122de487ed538fa1c962c95b147159f9e) | [`0x65a47198…`](https://explorer-bradbury.genlayer.com/tx/0x65a47198ddff237b7a8d6dab5998bee4752020296e27031aa7671d37f70c9f12) | [`0xd2986604…`](https://explorer-bradbury.genlayer.com/tx/0xd2986604f87e3b050795cc1a087aa5beeb0789b088eb560d5416284c67c6bf8f) | DELIVERED |
| 4 | release → underwriter (hair dryer: premium + collateral) | [`0x965d9dcf…`](https://explorer-bradbury.genlayer.com/tx/0x965d9dcf8a7781d92a5bbdcc2c9d8f25aeb280e985b64dbcf426059aa83a3861) | [`0xd5686c45…`](https://explorer-bradbury.genlayer.com/tx/0xd5686c4576b63afc67648593e2195e07d02238b6571ea0fb92203040cf9991d0) | [`0x3dd54732…`](https://explorer-bradbury.genlayer.com/tx/0x3dd547326b6cb8520653e72defee15d3753d02e211358b4ca2acd1e4a568eab8) | DELIVERED |

Settling the same payout again is rejected ([`0x8713341d…`](https://explorer-bradbury.genlayer.com/tx/0x8713341d5772dc7f64d2b8a858db932708f9dd5264a0cc4c21c271de26eca2b7), [`0xbbb549ff…`](https://explorer-bradbury.genlayer.com/tx/0xbbb549ffa4210cb3ebcebbc8ed86c3d9752282e2f812fbbd9a3bc95ff723b05f), [`0x684f8061…`](https://explorer-bradbury.genlayer.com/tx/0x684f8061e0ad99e3a8becd69d972dddf54a17a6d73488fe86838fa43c28a43b5), [`0x5be29b33…`](https://explorer-bradbury.genlayer.com/tx/0x5be29b33183429ed20d95d24f19b16925b123628044ef6050fedb396d5eb9fdc), [`0x03063f9d…`](https://explorer-bradbury.genlayer.com/tx/0x03063f9d80ac087ea64ba391940e3a714e7a09c2b85cf8caa1a3d9c877623849)). On Bradbury a reverted payable transaction leaves its value in the contract; the contract never recorded it, so no one can withdraw it. The E2E checks the balance equals what the contract expects to hold plus exactly that value (0.00246 GEN).

## Which page counts

- **Approved regulators only.** The owner (the deployer) keeps a registry of
  regulator hosts under names buyers see (`get_sources`). A page must be
  `https://` on an approved host or one of its subdomains, with no user name
  or port. A seller's own site, a look-alike or parent domain is refused
  before it is read, so it can never decide a pool. Withdrawing a host only
  stops new pools.
- **The exact product.** The underwriter gives the model identifier, which
  must be part of the product name (`K200` in "Brightway K200 electric
  kettle"). A recall counts only if the quoted sentence names that model as
  a whole token: a recall of the K2000 does not pay K200 holders, and the
  leader's result is rejected by validators otherwise.

## How the page is read

1. **The regulator's page, whole.** Each validator fetches the URL itself
   (served HTML, no JavaScript). Visible text over 20,000 characters is
   refused, never cut, so a recall at the bottom of a long list is never
   missed. A page that cannot be fetched reverts the reading; it is never
   taken as "no recall".
2. **One narrow question.** The LLM sees the product, its model identifier and
   the page, fenced as data, and answers `none` or `recalled`. Recalls of other
   brands or models, investigations and warnings without a recall are `none`;
   a listed batch or date range of the product counts.
3. **Quoted, then checked by text.** A `recalled` answer must copy the
   sentence that says so. The contract checks the quote is on the page
   (ignoring case, spacing and markup); a quote that is not there is an LLM
   error and reverts.
4. **Consensus on the status.** Every validator reads the page itself and
   accepts the leader's result only if its own answer is the same status and
   the leader's quote is on its own copy. An unreachable page is agreed on only
   when a validator reproduces the error; an LLM error never is.
5. **Opening and buying read first.** A product the page already recalls
   cannot be covered, and a buyer cannot buy cover after the recall is listed:
   the reading inside `buy` turns the pool `RECALLED` and returns the premium.

## Where the money goes

- Collateral (payout × capacity) is escrowed at opening; premiums join it.
- **Recalled:** each policy's holder is paid payout × count (`claim`, sent by
  anyone). `release` pays the underwriter the premiums and the collateral of
  unsold policies at once; holders' payouts stay for them.
- **No recall by the end:** `release` reads the page one last time; still
  nothing, the pool is `CLOSED` and the underwriter gets all the collateral
  and every premium. A recall listed by then pays holders instead.
- **No final reading, no release.** If the page cannot be fetched, or the
  reading is an LLM error, `release` reverts and the pool stays `ON` with its
  collateral, for as long as it takes; there is no lapse. Holders lose
  nothing while the regulator's page is down.
- The underwriter cannot buy its own cover; 1–10 policies per purchase,
  `premium × count` exactly; `0 < premium < payout`.
- Each paying transaction has one payee.

## Payments and settlement

Every transfer is a recorded payout (with its sender and creation time). A
payout is judged by its own transfer, never by the contract balance:
`settle_payout(payout_id, tx_hash, finalize_tx)` has validators read the paying
transaction (it must be this contract's `claim` for that policy, its `release`
or `buy` for that pool, or a `recover`, sent by the recorded sender at the
recorded time, and finalized with a successful result) and the consensus
transaction that finalized it, and check that the transfer to the payee was
executed. Delivered payouts are `DELIVERED`; a failed one is `FAILED` and its
amount becomes recoverable by the payee, who sends it anywhere with `recover`.
`get_accounting` (balance vs. `expected_balance`) is informational only.

## Limits

- The page decides. Cover pays for a listed recall, not for a loss; buyers see
  which page and which product wording they buy against.
- Pages are fetched as served; a page built by JavaScript reads as empty text
  and is likely to be read as `none`. Regulators' search pages often are:
  name a static list or the product's own notice page.
- A recall listed after the release is too late: the underwriter was paid.
- The registry is only as trustworthy as its owner. A regulator page that
  moves for good leaves the collateral locked until it can be read again.

## The app

https://recallcover.cristhedev.com ([`app/`](app/)) reads the **finalized**
state and treats a write as done only when it is `FINALIZED` with
`FINISHED_WITH_RETURN` **and** reading the contract back shows the change.
Each pool shows its product, recall page, premium and payout, collateral,
every reading with its quote, and its policies. Buy and check appear only
during the cover; release after the end or once recalled; a pay button per held
policy only once recalled. The open form shows the collateral it will escrow.
GEN amounts use BigInt only. "Settle" finds the paying transaction and looks up
its finalization from the `TransactionFinalized` log.
`node app/check-actions.mjs app/index.html` (CI) asserts the controls per role,
pool state and time, escaping, and exact money formatting.

## API

| Method | Who | Notes |
|---|---|---|
| `set_source(host, name)` | owner | approve a host (and subdomains); empty name withdraws it |
| `open_pool(product, model, url, premium, payout, capacity, hours)` payable | underwriter | url on an approved host; `model` 2–40 chars, part of the product name; `0 < premium < payout`; capacity 1–1,000; 1–8,760 h; exactly `payout × capacity`; reads the page |
| `buy(pool_id, count)` payable | anyone but the underwriter | before the end, 1–10, exactly `premium × count`; reads the page; returns -1 and the premium if recalled |
| `check(pool_id)` | anyone | during the cover; reads the page; returns the status |
| `claim(policy_id)` | anyone | pays the holder once `RECALLED` |
| `release(pool_id)` | anyone | `RECALLED`, or after `ends_at` (reads the page); once |
| `settle_payout(payout_id, tx_hash, finalize_tx)` / `recover(to)` | anyone / payee | |
| `get_pool`, `get_pools(start, limit)`, `get_policy`, `get_policies(pool_id or -1, holder or "", start, limit)`, `get_readings(pool_id, start, limit)`, `get_payout`, `get_payouts(start, limit, only_unsettled)`, `get_accounting`, `get_recoverable`, `get_sources` | view | |

## Run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
genvm-lint check contracts/recall_cover.py
pytest tests/direct -v                         # 44 tests
# end-to-end on Bradbury Phase 2, against the packed code (keys in GL_PK0..2)
python deploy/shrink.py contracts/recall_cover.py build/recall_cover.py --pack
npm i genlayer-js@2.0.0-rc.2   # plus the fee-estimate patch in app/README.md
node tests/integration/bradbury.mjs build/recall_cover.py
```

Bradbury rejects deploys above ~20 KB of code; deploy the output of
`deploy/shrink.py` (AST-checked, 34.5 KB → 9.2 KB packed). CI re-runs all
direct tests against the packed code. The E2E regulator page is in
[`evidence/`](evidence/), served at `https://recallcover.cristhedev.com/evidence/recalls.html`;
it is replaced by `recalls-k200.html` (the kettle's recall added) mid-run, and
`notices.html` (the hair-dryer pool's page) is taken down and restored to show
that release waits for a final reading.

## Tests (44 direct, Bradbury E2E)

- **Sources and model** — a seller's page, look-alike or parent domain, user-info, a port or plain http are refused before reading; a subdomain of an approved host is accepted; only the owner approves sources; a recall quote that does not name the model (K2000 vs K200) reverts and is rejected by validators.
- **Opening and buying** — validation of product, model, url, premium/payout, capacity, hours and collateral; a product already recalled cannot be covered; exact premium, policy cap, no buying by the underwriter or after the end; buying after a recall returns the premium.
- **The page decides** — nothing claimable while the page says nothing; a reading that finds nothing changes nothing; a recall pays every holder once and closes sales; a quote that is not on the page reverts.
- **Release** — refused before the end (to the second), reads the page one last time (a late recall pays holders), pays premiums and unsold collateral after a recall, never releases without a final reading (page 404 at the end, 30 days and years later: reverts, pool stays ON), once only.
- **Consensus (validator replay)** — agreement on the status, the quote must be on each validator's own copy (case and spacing ignored), an unreachable page is agreed and reverts, an LLM error is never agreed.
- **Settlement** — delivered claims and returned premiums, failed claims and recovery to another address; wrong method, args, sender, time, result, or a transaction that sent nothing are rejected and the payout stays `SENT`.
- **App** — `check-actions.mjs`: controls per role, pool state and time, payout amounts per policy, escaping, exact GEN amounts beyond 2^53.

## License

MIT
