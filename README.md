# RecallCover — product-recall cover paid when the regulator's page lists the recall

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

When a product is recalled, the shop left with unsellable stock and the owner of
a now-dangerous appliance wait on the maker, the importer or an insurer's claim
desk. **RecallCover** sells fixed-sum cover against one event anyone can check:
the product-safety regulator lists a recall of this product. An underwriter
opens a pool for a product and 1–4 of its model identifiers, names a recall page
on a regulator's host the contract owner approved, and escrows every payout it
may owe; other backers may add collateral until the first sale and share pro
rata. Buyers pay a premium for one model. Anyone can ask GenLayer validators to
read the page: if it lists a recall of a model, quoted word for word, every
policy on that model can be paid at once, by anyone, while the other models stay
covered. If nothing is listed by the end of the cover, the backers get the
collateral back and share the premiums, but only after validators read the page one last time and agree
it lists no recall; while that reading cannot be made, nothing moves.

```
owner       ── deploy(sources) / set_source(host, name)          approved regulator hosts
underwriter ── open_pool(product, [models], url, premium, payout, units, hours) + payout × units ─▶ RecallCover
               url on an approved host (or its subdomain), else refused before any reading;
               validators read the page now: reachable, ≤ 20,000 characters, no model recalled yet
backer      ── back(pool, units) + payout × units   (until the first policy is sold)
buyer       ── buy(pool, model, count) + premium × count   (before the end; reads the page first:
               that model listed ─▶ recalled, nothing sold, premium sent straight back)
anyone      ── check(pool): validators read the page and agree on which models are recalled,
               each with a sentence naming it that each of them finds on its own copy
               recalled model ─▶ its policies claimable, its sales closed; other models still covered
anyone      ── claim(policy) ─▶ payout × count to the holder
anyone      ── release(stake): every model recalled, or after the end with one final reading
               (none ─▶ CLOSED) ─▶ premiums + unclaimed collateral, pro rata to units, last stake the remainder;
               page unavailable or unclear ─▶ reverts, pool stays ON (no lapse, ever)
anyone      ── settle_payout(payout, tx, finalize_tx) / payee ── recover(to)
```

## Live deployment

App: https://recallcover.cristhedev.com (pools, their readings with quotes, policies and every role's actions; source in [`app/`](app/))  
Testnet Bradbury Phase 2 (chainId 4221, GenVM v0.3): [`0xd7Fd31C47c5A70AF9227ee7A2D501ac3e897A912`](https://explorer-bradbury.genlayer.com/address/0xd7Fd31C47c5A70AF9227ee7A2D501ac3e897A912) (v2.0.0: several backers, several models per pool; see [MILESTONE.md](MILESTONE.md)). Earlier deployments: v1.1.0 `0x1c1d82D6541B2c8Edc8f1C8e98E252b7C2a0D882`, v1.0.0 `0xBD749A903cd6505486CAD428c6B2C2ea0e5D1387`.

## Bradbury evidence

Run by [`tests/integration/bradbury.mjs`](tests/integration/bradbury.mjs) on Bradbury Phase 2 (all checks passed). Contract `0xd7Fd31C47c5A70AF9227ee7A2D501ac3e897A912` (deploy [`0xa2ee0ee5…`](https://explorer-bradbury.genlayer.com/tx/0xa2ee0ee53c8882e8a6cc5feeeb566927d3c524a01a0b3f3f60e30f3a9a7c1c86)), code `build/recall_cover.py` (sha256 `1fff1c3b…`), deployed with one approved source: `recallcover.cristhedev.com`. Underwriter, a second backer and a buyer are separate accounts. Pool #0 covers a hair dryer (page [`notices.html`](evidence/notices.html)), backed by the underwriter (3 units) and a second backer (1 unit). Pool #1 covers two models, Brightway K200 and K300, on [`kettles.html`](evidence/kettles.html); mid-run it was replaced by [`kettles-k200.html`](evidence/kettles-k200.html), which lists the K200 recall only, and the run waited for it. After the hair-dryer cover ended its page was taken down (404): release reverted and the pool stayed ON; once the page was back, release read it and paid both backers pro rata.

| Step | Transaction | Outcome |
|---|---|---|
| approve a source as a buyer | [`0x3191c024…`](https://explorer-bradbury.genlayer.com/tx/0x3191c02455f71d48c4524c360b9b4687d44ea06a1f02ced62e976293f53564f3) | rejected: only the owner approves sources |
| open a pool on the seller's own site | [`0x6e350146…`](https://explorer-bradbury.genlayer.com/tx/0x6e35014660d09ba6a79890e5b7aa2cc042f261898d48dc6550a846790ee89b69) | rejected: a page on an unapproved host is refused |
| open a pool for 5 models | [`0x9c0be032…`](https://explorer-bradbury.genlayer.com/tx/0x9c0be032b22e7845e854017abcd23a1cb8a2b3d5fec8274aee976c8bed062631) | rejected: at most 4 models |
| open a pool for K200 twice | [`0x2a318461…`](https://explorer-bradbury.genlayer.com/tx/0x2a31846105582714442d3d935cfd986686d52604d2d150875fead4307ffa7735) | rejected: models must differ |
| open a pool for the recalled toaster | [`0xe2f10896…`](https://explorer-bradbury.genlayer.com/tx/0xe2f10896320c644e0b2c06477dfe2bf8f2d8dca62f5425398f7aafc38e8b1c5b) | rejected: a product the page already recalls cannot be covered |
| open the hair-dryer pool (1 hour, 3 units) | [`0xe8b37d94…`](https://explorer-bradbury.genlayer.com/tx/0xe8b37d94f5df5bfa9391c7a6a5ef339369633fdf5e9e1d353ea141c14726dfc1) | ok: pool #0, 3 × 0.0001 GEN escrowed by the underwriter |
| back with less than payout | [`0xfb223a5d…`](https://explorer-bradbury.genlayer.com/tx/0xfb223a5d0af35e63fbd472a0326c16cde5f88a043bda1aebfcd6669a00aa88ef) | rejected: backing must be payout x units |
| back the hair-dryer pool with 1 unit | [`0xeaac026f…`](https://explorer-bradbury.genlayer.com/tx/0xeaac026f26807ef375ea49348b6084769cb5854c976ceee9870b24610f45fa34) | ok: the backer adds 1 unit, 0.0001 GEN |
| buy as a backer | [`0x2c9e25ba…`](https://explorer-bradbury.genlayer.com/tx/0x2c9e25ba28a028cd26df4a2a3c08ba3d2e0885cb986be34b7c58377faff8ba55) | rejected: a backer cannot buy |
| buy 1 hair-dryer policy | [`0xe0067990…`](https://explorer-bradbury.genlayer.com/tx/0xe0067990a4ac57756c00738adf1cb19f7c07da3f1ae1a670441b573a966be13b) | ok: 0.00002 GEN premium |
| back after a sale | [`0x892dc28c…`](https://explorer-bradbury.genlayer.com/tx/0x892dc28c605536c46b60e2d291d8faa194d291e1f943b30632467f914cc3bb48) | rejected: backing is fixed once a policy is sold; 4 units from 2 backers |
| open the kettle pool short of collateral | [`0xf24a6dc5…`](https://explorer-bradbury.genlayer.com/tx/0xf24a6dc5d0191c0904c065ea0e4c596661b8dede3879fbc7a1c0526dae5b6255) | rejected: the collateral must be payout x units |
| open the kettle pool (K200, K300; 1 hour) | [`0x59013b82…`](https://explorer-bradbury.genlayer.com/tx/0x59013b824ba26b5c3da5d425a333a1f3e7a11eb288f3628c80e380c462368394) | ok: kettle pool is #1 |
| buy model 2 | [`0xe39155bf…`](https://explorer-bradbury.genlayer.com/tx/0xe39155bf6dc8387a7509051a94857052ab53777397d128a355d70f27fd38b3c9) | rejected: a model that does not exist is refused |
| buy 2 K200 policies paying for 1 | [`0xa9a90f77…`](https://explorer-bradbury.genlayer.com/tx/0xa9a90f777d643b4efde1ca03528731409cb3f5d335ab17cbbb4ed37a0022ee92) | rejected: the premium must be premium x count |
| buy 2 K200 policies | [`0x5697cd5e…`](https://explorer-bradbury.genlayer.com/tx/0x5697cd5effd3dafb281cfc468f8c40c22a215fc3816359b137493ed60252bf30) | ok |
| buy 1 K300 policy | [`0x2770e1a3…`](https://explorer-bradbury.genlayer.com/tx/0x2770e1a30322f9b520859d17ffd26e9f72563ac7af7e894f8a6ec06e6bacaa70) | ok |
| claim while on | [`0xe270782c…`](https://explorer-bradbury.genlayer.com/tx/0xe270782c08b9f8ff011d348cb0b7d6840980899b4da2c1116ad2a758952c4879) | rejected: nothing is claimable while the page says nothing |
| buy K200 after the recall is listed (reads the page, premium sent back) | [`0x35a7d2f6…`](https://explorer-bradbury.genlayer.com/tx/0x35a7d2f68a2213d7332402f6d6d1e97666bc307eb569e5f8eef2f850bf3a4f5a) | **K200 `recalled`, K300 still covered**, nothing sold, 0.00002 GEN premium returned = payout 0; quoted: “Brightway K200 electric kettleThe Brightway K200 electric kettle is recalled because the base can overheat and melt.” |
| buy K200 again | [`0xdee86c2d…`](https://explorer-bradbury.genlayer.com/tx/0xdee86c2dacef04619ee228f846d0ec2744f834da7c0c0baa3c1375b66ff82c0c) | rejected: K200 sales close once recalled |
| buy 1 more K300 policy | [`0xa2493717…`](https://explorer-bradbury.genlayer.com/tx/0xa24937179b3328e8385f0a9b116ffb3cfc3bc72a59543cd8e66e1df3430a19db) | ok |
| claim the K200 policy for 2 (anyone sends it) | [`0x5c479888…`](https://explorer-bradbury.genlayer.com/tx/0x5c4798880854698d47ba2a34afbf8403a2c8ad37e0ff57df61ddb10597153be8) | 0.0002 GEN to the holder = payout 1 (sent by another account) |
| claim it again | [`0x87308258…`](https://explorer-bradbury.genlayer.com/tx/0x87308258dc5d86cde1851964de16a39353d4cc237b8dd826d4e9e558e5612d36) | rejected: a policy is claimed once |
| claim the K300 policy | [`0xe5389ef2…`](https://explorer-bradbury.genlayer.com/tx/0xe5389ef26e2152a7968b9d0cc58e10be5157dde6ec655d0ee899908cfa1c768c) | rejected: a K300 policy is not claimable |
| release the kettle pool early | [`0xc10f79a7…`](https://explorer-bradbury.genlayer.com/tx/0xc10f79a76a6c055a3ea21be4629b8be95f400d072f8d27e376c0d0ab0e46d6c5) | rejected: release is refused before the cover ends |
| release the kettle pool (final reading) | [`0x0607927e…`](https://explorer-bradbury.genlayer.com/tx/0x0607927e1c27660042c1fa6c2eeb3354887a5c27fac2703030ac8881290af284) | after the end, one last reading: CLOSED; 0.00038 GEN (premiums + collateral no K200 policy claims) to the underwriter = payout 2 |
| release while the page is unavailable | [`0x11be2f74…`](https://explorer-bradbury.genlayer.com/tx/0x11be2f7455efa6ff5bf0c83d7b22c516635c034c7cac02cbc7f963528da1c474) | **reverts: page 404, no final reading; pool stays ON with its collateral** |
| release the backer's share | [`0x0258043e…`](https://explorer-bradbury.genlayer.com/tx/0x0258043e6314440279a1a3a92e73134ddbc96e6fe27b7edb15192a4235402d92) | final reading `none`, CLOSED; 1 of 4 units: 0.000105 GEN to the backer = payout 3 |
| release it again | [`0x55871de0…`](https://explorer-bradbury.genlayer.com/tx/0x55871de0962eaf818bcd535c89b9ccebdaeec34001f8f93d7fe2b0a735f031d7) | rejected: a share is released once |
| release the underwriter's share | [`0x7ad3fd44…`](https://explorer-bradbury.genlayer.com/tx/0x7ad3fd44c2365cf21d8de3f357289f7e0fed0ca3186816d58829b1d5f66927ff) | 3 of 4 units, the remainder: 0.000315 GEN to the underwriter = payout 4 |

Every payout was settled from its own transfer once the paying transaction finalized:

| Payout | Kind | Finalized by | `settle_payout` | Result |
|---|---|---|---|---|
| 0 | returned → buyer (K200 bought after the recall) | [`0x4bf4d8a8…`](https://explorer-bradbury.genlayer.com/tx/0x4bf4d8a8583273fdda0f1fa772eff53ec62cef3c4be39448ef6f69ca1aea205a) | [`0xfb815971…`](https://explorer-bradbury.genlayer.com/tx/0xfb81597126d4656bc3ead5cb210d6ddbb60aa6be868c013d3728fb38896aeb4e) | DELIVERED |
| 1 | claim → holder (K200, 2 policies) | [`0x3e45e75e…`](https://explorer-bradbury.genlayer.com/tx/0x3e45e75eb1fc60efb12b648010d43a4af281a282ec1a6afa3a72149a68732117) | [`0x8b433eb3…`](https://explorer-bradbury.genlayer.com/tx/0x8b433eb342e752dd6a9d686bdb6b658b54676abc8e8541fcf950992f58378603) | DELIVERED |
| 2 | release → underwriter (kettle pool) | [`0x704063e1…`](https://explorer-bradbury.genlayer.com/tx/0x704063e115c357932b71b65845ca4db7d8626285cdae3d670ca8c384171253cf) | [`0xa83cfcb6…`](https://explorer-bradbury.genlayer.com/tx/0xa83cfcb6ecc6cf5aaa7b1f688f2509d13b340ae0cd727ea7c191b8ddaa553db9) | DELIVERED |
| 3 | release → backer (hair dryer, 1 unit) | [`0x29411de8…`](https://explorer-bradbury.genlayer.com/tx/0x29411de8c3efee7262adfd8b1b95648eb2e8dbac802abde8c99bd549c6ecca38) | [`0x5bfa4627…`](https://explorer-bradbury.genlayer.com/tx/0x5bfa4627e54b26216ddc2e3f08678e868bee4cf1f37560527f91b410c64b2938) | DELIVERED |
| 4 | release → underwriter (hair dryer, 3 units) | [`0x70f85e25…`](https://explorer-bradbury.genlayer.com/tx/0x70f85e25333e531febbe7adeef780cb98ccd1c72100d3657d19682b3e3f82ff4) | [`0x4ff91842…`](https://explorer-bradbury.genlayer.com/tx/0x4ff9184254c9c5676acdb278e57231b8560491bcb0e2fe8717be8585efb27dc7) | DELIVERED |

Settling the same payout again is rejected ([`0x78b79674…`](https://explorer-bradbury.genlayer.com/tx/0x78b79674b2611cdc3482a8303dfc10e30ecea53425db462ee4d0c820f2232f23), [`0xea9cbc50…`](https://explorer-bradbury.genlayer.com/tx/0xea9cbc50af25d48137e00a972ee6c79bc003d2fc13649af4ac0c92598d588d1a), [`0x7d6f75f8…`](https://explorer-bradbury.genlayer.com/tx/0x7d6f75f84d8b1167af1c908b198f5266094bea5b0730b2f90fbe17bd5b4b5edb), [`0x75dcf4ab…`](https://explorer-bradbury.genlayer.com/tx/0x75dcf4abd8a8209ece8a48f106f4d49cde01fa83b78e80e9a485debf78bb386c), [`0x3e15b6a6…`](https://explorer-bradbury.genlayer.com/tx/0x3e15b6a60f5c2d2b990695a8057224e337125be80036e39d5a31c56915413b28)). On Bradbury a reverted payable transaction leaves its value in the contract; the contract never recorded it, so no one can withdraw it. The E2E checks the balance equals what the contract expects to hold plus exactly that value (0.00268 GEN).

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
Each pool shows its product, its models with their status and quote, recall
page, premium and payout, its backers and their units, every reading, and its
policies. Back appears until the first sale; buy (with a model picker) and check
only during the cover; release per stake after the end or once every model is
recalled; a pay button per held policy only once its model is recalled. The open form shows the collateral it will escrow.
GEN amounts use BigInt only. "Settle" finds the paying transaction and looks up
its finalization from the `TransactionFinalized` log.
`node app/check-actions.mjs app/index.html` (CI) asserts the controls per role,
pool state and time, escaping, and exact money formatting.

## API

| Method | Who | Notes |
|---|---|---|
| `set_source(host, name)` | owner | approve a host (and subdomains); empty name withdraws it |
| `open_pool(product, models, url, premium, payout, units, hours)` payable | underwriter | url on an approved host; 1–4 distinct models, 2–40 letters, digits or `./-`; `0 < premium < payout`; units 1–1,000; 1–8,760 h; exactly `payout × units`; reads the page |
| `back(pool_id, units)` payable | anyone | before the first sale and the end; exactly `payout × units`; capacity ≤ 1,000 |
| `buy(pool_id, model, count)` payable | anyone but a backer | before the end, 1–10, exactly `premium × count`; reads the page; returns -1 and the premium if that model is recalled |
| `check(pool_id)` | anyone | during the cover; reads the page; returns how many models are recalled |
| `claim(policy_id)` | anyone | pays the holder once `RECALLED` |
| `release(stake_id)` | anyone | every model recalled, or after `ends_at` (one final reading for the pool); pays that stake's pro-rata share; once |
| `settle_payout(payout_id, tx_hash, finalize_tx)` / `recover(to)` | anyone / payee | |
| `get_pool`, `get_pools(start, limit)`, `get_stake`, `get_stakes(pool_id, start, limit)`, `get_policy`, `get_policies(pool_id or -1, holder or "", start, limit)`, `get_readings(pool_id, start, limit)`, `get_payout`, `get_payouts(start, limit, only_unsettled)`, `get_accounting`, `get_recoverable`, `get_sources` | view | |

## Run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
genvm-lint check contracts/recall_cover.py
pytest tests/direct -v                         # 51 tests
# end-to-end on Bradbury Phase 2, against the packed code (keys in GL_PK0..2)
python deploy/shrink.py contracts/recall_cover.py build/recall_cover.py --pack
npm i genlayer-js@2.0.0-rc.2   # plus the fee-estimate patch in app/README.md
node tests/integration/bradbury.mjs build/recall_cover.py
```

Bradbury rejects deploys above ~20 KB of code; deploy the output of
`deploy/shrink.py` (AST-checked, 41.3 KB → 10.4 KB packed). CI re-runs all
direct tests against the packed code. The E2E regulator page is in
[`evidence/`](evidence/), served at `https://recallcover.cristhedev.com/evidence/`; `kettles.html`
is replaced by `kettles-k200.html` (the K200 recall added) mid-run, and
`notices.html` (the hair-dryer pool's page) is taken down and restored to show
that release waits for a final reading.

## Tests (51 direct, Bradbury E2E)

- **Sources and model** — a seller's page, look-alike or parent domain, user-info, a port or plain http are refused before reading; a subdomain of an approved host is accepted; only the owner approves sources; a recall quote that does not name the model (K2000 vs K200) reverts and is rejected by validators.
- **Opening and buying** — validation of product, model, url, premium/payout, capacity, hours and collateral; a product already recalled cannot be covered; exact premium, policy cap, no buying by the underwriter or after the end; buying after a recall returns the premium.
- **The page decides** — nothing claimable while the page says nothing; a reading that finds nothing changes nothing; a recall pays every holder once and closes sales; a quote that is not on the page reverts.
- **Release** — refused before the end (to the second), reads the page one last time (a late recall pays holders), pays premiums and unsold collateral after a recall, never releases without a final reading (page 404 at the end, 30 days and years later: reverts, pool stays ON), once only.
- **Consensus (validator replay)** — agreement on the status, the quote must be on each validator's own copy (case and spacing ignored), an unreachable page is agreed and reverts, an LLM error is never agreed.
- **Settlement** — delivered claims and returned premiums, failed claims and recovery to another address; wrong method, args, sender, time, result, or a transaction that sent nothing are rejected and the payout stays `SENT`.
- **App** — `check-actions.mjs`: controls per role, pool state and time, payout amounts per policy, escaping, exact GEN amounts beyond 2^53.

## License

MIT
