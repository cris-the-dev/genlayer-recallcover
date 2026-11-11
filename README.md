# RecallCover — product-recall cover paid when the regulator's page lists the recall

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

When a product is recalled, the shop left with unsellable stock and the owner of
a now-dangerous appliance wait on the maker, the importer or an insurer's claim
desk. **RecallCover** sells fixed-sum cover against one event anyone can check:
the product-safety regulator lists a recall of this product. An underwriter
opens a pool for one product, names the regulator's recall page and escrows
every payout it may owe. Buyers pay a premium. Anyone can ask GenLayer
validators to read the page: if it lists a recall of the product, quoted word
for word, every policy can be paid at once, by anyone. If nothing is listed by
the end of the cover, the underwriter gets the collateral back and keeps the
premiums, once validators read the page one last time.

```
underwriter ── open_pool(product, url, premium, payout, capacity, hours) + payout × capacity ─▶ RecallCover
               validators read the page now: reachable, ≤ 20,000 characters, no recall of the product yet
buyer       ── buy(pool, count) + premium × count   (before the end; reads the page first:
               a listed recall ─▶ RECALLED, nothing sold, premium sent straight back)
anyone      ── check(pool): validators read the page and agree on none / recalled,
               plus a sentence each of them finds on its own copy
               recalled ─▶ every policy claimable, sales closed
anyone      ── claim(policy) ─▶ payout × count to the holder
anyone      ── release(pool): RECALLED ─▶ premiums + unsold collateral to the underwriter
               ON after the end ─▶ one last reading; still nothing ─▶ CLOSED, everything to the underwriter
anyone      ── settle_payout(payout, tx, finalize_tx) / payee ── recover(to)
```

## Live deployment

App: https://recallcover.cristhedev.com (pools, their readings with quotes, policies and every role's actions; source in [`app/`](app/))  
Testnet Bradbury Phase 2 (chainId 4221, GenVM v0.3): [`0xBD749A903cd6505486CAD428c6B2C2ea0e5D1387`](https://explorer-bradbury.genlayer.com/address/0xBD749A903cd6505486CAD428c6B2C2ea0e5D1387)

## Bradbury evidence

Run by [`tests/integration/bradbury.mjs`](tests/integration/bradbury.mjs) on Bradbury Phase 2 (all checks passed). Contract `0xBD749A903cd6505486CAD428c6B2C2ea0e5D1387` (deploy [`0xd5699946…`](https://explorer-bradbury.genlayer.com/tx/0xd56999464f0360989913bce24ad56b242051f439f68540dc0ea6dffbe6dceac7)), code `build/recall_cover.py` (sha256 `d0646620…`). Underwriter and two buyers are separate accounts. The regulator's page is served from [`evidence/`](evidence/); mid-run [`recalls.html`](evidence/recalls.html) was replaced by [`recalls-k200.html`](evidence/recalls-k200.html), which adds the kettle recall, and the run waited for it.

| Step | Transaction | Outcome |
|---|---|---|
| open a pool for the recalled toaster | [`0xc58516b3…`](https://explorer-bradbury.genlayer.com/tx/0xc58516b3997f76ba3b8a8216924e536fbe8fec7b799c8a1373a043ada3ca3432) | reverts: the page already lists the Acme T9 toaster recall |
| open the hair-dryer pool (1 hour) | [`0x94e593cc…`](https://explorer-bradbury.genlayer.com/tx/0x94e593cc0b40b75178e474439b2db61073d4983983e92f234aa031eb41abb485) | ok: pool #0, 3 × 0.0001 GEN escrowed, cover ends in 1 h |
| buy 1 hair-dryer policy | [`0xfa28ff68…`](https://explorer-bradbury.genlayer.com/tx/0xfa28ff686ff3a8f6a95933482afbdf7e9606187a5286d21dc7c8449be8bc34ed) | ok: policy #0, 0.00002 GEN premium |
| open the kettle pool short of collateral | [`0xd35e4080…`](https://explorer-bradbury.genlayer.com/tx/0xd35e4080930f6099f5a7bc040459bedd2d137809d0c9fd4a7ec2092dcb261a93) | rejected: collateral must be payout × capacity |
| open the kettle pool | [`0xd7885c38…`](https://explorer-bradbury.genlayer.com/tx/0xd7885c38470ae7eb1290e1983f979f32a73072356f43d4365c552a38e73a797a) | ok: pool #1 (Brightway K200), 5 × 0.0001 GEN escrowed, page read: no recall |
| buy as the underwriter | [`0xd7707797…`](https://explorer-bradbury.genlayer.com/tx/0xd7707797b73a3722ad40728f87ce1b41bb82636e82ba6533c65ae876c0065ba2) | rejected: the underwriter cannot buy |
| buy 2 policies paying for 1 | [`0xc0382205…`](https://explorer-bradbury.genlayer.com/tx/0xc038220570a26ca73322bafee60efd2919ed3b691794c6c5c7a06f1078111b89) | rejected: send exactly premium × count |
| buy 2 kettle policies | [`0x56ea287c…`](https://explorer-bradbury.genlayer.com/tx/0x56ea287ca5c0a198ee904c9e40cc82962a11c3854ced95c63f3acd5d3f959337) | ok: policy #1 |
| buy 1 kettle policy | [`0x2e7982bc…`](https://explorer-bradbury.genlayer.com/tx/0x2e7982bca8c1da86435cae2d3bab02d038cc3ecb252686dd67d9ee3bc9a66109) | ok: policy #2 |
| claim while on | [`0x90365240…`](https://explorer-bradbury.genlayer.com/tx/0x903652408dfdb7c5cc03684e0ee7f9f1f4abf39eb0327fbfb03281781167d08f) | rejected: pool is ON, nothing to claim |
| read the page (nothing yet) | [`0x8c6bcbdc…`](https://explorer-bradbury.genlayer.com/tx/0x8c6bcbdcf019c0153e6f94e33ab84d625e921b117982437a3b4cb6475a1ece14) | `none`: still ON, 3 policies sold |
| buy after the recall is listed (reads the page, premium sent back) | [`0xb0404753…`](https://explorer-bradbury.genlayer.com/tx/0xb0404753a56fec8e7ef86cdd5116ca9908ab8a6aca3f8b52548d697b6202899d) | **`recalled`**, quoted: “The Brightway K200 electric kettle is recalled because the base can overheat and melt.” Pool RECALLED, nothing sold, 0.00002 GEN premium returned = payout 0 |
| buy again | [`0x0a0fc082…`](https://explorer-bradbury.genlayer.com/tx/0x0a0fc082ee4a89c159d491d48e6e5e91d9ab55f54ee719cbdd7fcb09fe0101bb) | rejected: sales closed |
| read the page again | [`0x19563407…`](https://explorer-bradbury.genlayer.com/tx/0x19563407ff6a2ebfe1ced98587c56cbe537f253118dc191a20a49ee0f25450ed) | rejected: pool already RECALLED |
| claim policy for 2 (anyone sends it) | [`0xd582f577…`](https://explorer-bradbury.genlayer.com/tx/0xd582f577146643cfbcf648552eabbe59b3f9091f6d3300132e44365bb536ff28) | 0.0002 GEN to the holder = payout 1 (sent by another account) |
| claim it again | [`0xd88da589…`](https://explorer-bradbury.genlayer.com/tx/0xd88da589b9aa462531b2e07210b6753fa5aafc4d9ce5367eb628f3457bb0071f) | rejected: already claimed |
| claim policy for 1 | [`0x2648eabf…`](https://explorer-bradbury.genlayer.com/tx/0x2648eabf8250310fc7deaee8aadb5ac72fc8f0e2ba6be8769a0b7a072724b831) | 0.0001 GEN to the holder = payout 2 |
| release the kettle pool | [`0x5d141901…`](https://explorer-bradbury.genlayer.com/tx/0x5d14190101239d8502c8391c7df05f06c547f0f8a27004bc8dfc39313a027532) | 3 premiums + 2 unsold payouts = 0.00026 GEN to the underwriter = payout 3 |
| release the hair-dryer pool early | [`0xb2c1e41f…`](https://explorer-bradbury.genlayer.com/tx/0xb2c1e41f1c6b128118a6dee3e842706c59c26331f521640008de8ec8a5360215) | rejected: the cover has not ended |
| release the hair-dryer pool | [`0xb75e6789…`](https://explorer-bradbury.genlayer.com/tx/0xb75e67893a185fc94286b0dcd5ce31f1b3690542c328e074a924a9d8095304f7) | **after the end, one last reading: `none`, CLOSED**, 0.00032 GEN (premium + collateral) to the underwriter = payout 4 |

Every payout was settled from its own transfer once the paying transaction finalized:

| Payout | Kind | Paid by | Finalized by | `settle_payout` | Result |
|---|---|---|---|---|---|
| 0 | returned → buyer (late kettle buy, premium back) | [`0xb0404753…`](https://explorer-bradbury.genlayer.com/tx/0xb0404753a56fec8e7ef86cdd5116ca9908ab8a6aca3f8b52548d697b6202899d) | [`0x0418b0f0…`](https://explorer-bradbury.genlayer.com/tx/0x0418b0f04a3f1ae87901ba3f2a10985c647ea660a74dd73bb1657ce39c53e423) | [`0xbf03dca3…`](https://explorer-bradbury.genlayer.com/tx/0xbf03dca3ebf644ced654636d85529a71f276547cd2842808f95d21c69e0df1cb) | DELIVERED |
| 1 | claim → holder (kettle, 2 policies) | [`0xd582f577…`](https://explorer-bradbury.genlayer.com/tx/0xd582f577146643cfbcf648552eabbe59b3f9091f6d3300132e44365bb536ff28) | [`0x5ea7a5da…`](https://explorer-bradbury.genlayer.com/tx/0x5ea7a5da53e43f8dbf38f833bde5ff1b3d87f593d5f0799a2a6b524fa166ee27) | [`0xee01b6e2…`](https://explorer-bradbury.genlayer.com/tx/0xee01b6e2fd32dd78084585e672037f238034a75de92c15fbf6f216a09a67045b) | DELIVERED |
| 2 | claim → holder (kettle, 1 policy) | [`0x2648eabf…`](https://explorer-bradbury.genlayer.com/tx/0x2648eabf8250310fc7deaee8aadb5ac72fc8f0e2ba6be8769a0b7a072724b831) | [`0x3ef1af9f…`](https://explorer-bradbury.genlayer.com/tx/0x3ef1af9f0ff53a4ea8506da571f789a902d473f90418290702ac6d16a304d2c5) | [`0xf9a91f99…`](https://explorer-bradbury.genlayer.com/tx/0xf9a91f99142b9d6b17573a01cacd1b64a525157dbd79060ff89be602b0eabcfe) | DELIVERED |
| 3 | release → underwriter (kettle: 3 premiums + 2 unsold payouts) | [`0x5d141901…`](https://explorer-bradbury.genlayer.com/tx/0x5d14190101239d8502c8391c7df05f06c547f0f8a27004bc8dfc39313a027532) | [`0x5e26889f…`](https://explorer-bradbury.genlayer.com/tx/0x5e26889fa1019d176e407ff84b8b5bc690dc5d51e15f1d1fb3b546190552c2fd) | [`0x40932d26…`](https://explorer-bradbury.genlayer.com/tx/0x40932d26cb28e1805970e9c8782267101c6806f4c898f8f1d4b18c43f4076873) | DELIVERED |
| 4 | release → underwriter (hair dryer: premium + collateral) | [`0xb75e6789…`](https://explorer-bradbury.genlayer.com/tx/0xb75e67893a185fc94286b0dcd5ce31f1b3690542c328e074a924a9d8095304f7) | [`0x2b4f0603…`](https://explorer-bradbury.genlayer.com/tx/0x2b4f06037348e2c6b3bfe8ea7a3f70520bf5a12e039de5dfac57cdb164c3d19b) | [`0xf8b4ef72…`](https://explorer-bradbury.genlayer.com/tx/0xf8b4ef72a25cc373d647fe658454c054cabf73b87e504480b45d9022e8f76b6a) | DELIVERED |

Settling the same payout again is rejected ([`0x808e1a67…`](https://explorer-bradbury.genlayer.com/tx/0x808e1a674cc5e1593c40757dea3d3e6e2a3e6a9b8c6b222b003e277de6a099fa), [`0x28ee615f…`](https://explorer-bradbury.genlayer.com/tx/0x28ee615fd6f72d1b3f2aa3b352949a8ab3e501a76b0d07e9242615716bb842f9), [`0x66cc4eff…`](https://explorer-bradbury.genlayer.com/tx/0x66cc4effa42e318e6007c2977acba620fbe01a13520ff01e167f68742e56149e), [`0xf54b8aeb…`](https://explorer-bradbury.genlayer.com/tx/0xf54b8aeb816460b3c3fa2d960def289982b912c02bf873e3a569741e6374dd1d), [`0xca47ac67…`](https://explorer-bradbury.genlayer.com/tx/0xca47ac67739e6cb47788384d4a32cb93bda8761fc8562c1969e07629eb4b2661)). Afterwards `get_accounting` reports `unaccounted: 0.00096` GEN: exactly the value attached to the five rejected payable transactions (the toaster pool's 0.0005 collateral, the short 0.0004 collateral, and three 0.00002 premiums: the underwriter's buy, the underpaid buy, the buy after the recall). On Bradbury a reverted payable transaction leaves its value in the contract; the contract never recorded it, so no one can withdraw it, and the E2E counts it explicitly.

## How the page is read

1. **The regulator's page, whole.** Each validator fetches the URL itself
   (served HTML, no JavaScript). Visible text over 20,000 characters is
   refused, never cut, so a recall at the bottom of a long list is never
   missed. A page that cannot be fetched reverts the reading; it is never
   taken as "no recall".
2. **One narrow question.** The LLM sees the product (brand and model) and the
   page, fenced as data, and answers `none` or `recalled`. Recalls of other
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
- A page that cannot be read for 30 days after the end is released without a
  reading, so the collateral is never stuck.
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
| `open_pool(product, url, premium, payout, capacity, hours)` payable | underwriter | `0 < premium < payout`; capacity 1–1,000; 1–8,760 h; exactly `payout × capacity`; reads the page |
| `buy(pool_id, count)` payable | anyone but the underwriter | before the end, 1–10, exactly `premium × count`; reads the page; returns -1 and the premium if recalled |
| `check(pool_id)` | anyone | during the cover; reads the page; returns the status |
| `claim(policy_id)` | anyone | pays the holder once `RECALLED` |
| `release(pool_id)` | anyone | `RECALLED`, or after `ends_at` (reads the page); once |
| `settle_payout(payout_id, tx_hash, finalize_tx)` / `recover(to)` | anyone / payee | |
| `get_pool`, `get_pools(start, limit)`, `get_policy`, `get_policies(pool_id or -1, holder or "", start, limit)`, `get_readings(pool_id, start, limit)`, `get_payout`, `get_payouts(start, limit, only_unsettled)`, `get_accounting`, `get_recoverable` | view | |

## Run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
genvm-lint check contracts/recall_cover.py
pytest tests/direct -v                         # 33 tests
# end-to-end on Bradbury Phase 2, against the packed code (keys in GL_PK0..2)
python deploy/shrink.py contracts/recall_cover.py build/recall_cover.py --pack
npm i genlayer-js@2.0.0-rc.2   # plus the fee-estimate patch in app/README.md
node tests/integration/bradbury.mjs build/recall_cover.py
```

Bradbury rejects deploys above ~20 KB of code; deploy the output of
`deploy/shrink.py` (AST-checked, 31.0 KB → 8.4 KB packed). CI re-runs all
direct tests against the packed code. The E2E regulator page is in
[`evidence/`](evidence/), served at `https://recallcover.cristhedev.com/evidence/recalls.html`;
it is replaced by `recalls-k200.html` (the kettle's recall added) mid-run.

## Tests (33 direct, Bradbury E2E)

- **Opening and buying** — validation of product, url, premium/payout, capacity, hours and collateral; a product already recalled cannot be covered; exact premium, policy cap, no buying by the underwriter or after the end; buying after a recall returns the premium.
- **The page decides** — nothing claimable while the page says nothing; a reading that finds nothing changes nothing; a recall pays every holder once and closes sales; a quote that is not on the page reverts.
- **Release** — refused before the end (to the second), reads the page one last time (a late recall pays holders), pays premiums and unsold collateral after a recall, closes an unreadable pool 30 days after the end (to the second), once only.
- **Consensus (validator replay)** — agreement on the status, the quote must be on each validator's own copy (case and spacing ignored), an unreachable page is agreed and reverts, an LLM error is never agreed.
- **Settlement** — delivered claims and returned premiums, failed claims and recovery to another address; wrong method, args, sender, time, result, or a transaction that sent nothing are rejected and the payout stays `SENT`.
- **App** — `check-actions.mjs`: controls per role, pool state and time, payout amounts per policy, escaping, exact GEN amounts beyond 2^53.

## License

MIT
