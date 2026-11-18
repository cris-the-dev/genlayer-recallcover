# Milestone: RecallCover v2 — pools backed by several underwriters, covering several models

Base version: [`v1.1.0`](https://github.com/cris-the-dev/genlayer-recallcover/tree/v1.1.0) (accepted).
Full diff: https://github.com/cris-the-dev/genlayer-recallcover/compare/v1.1.0...v2.0.0

## Summary

v1 had one underwriter fund one pool for one model. Recall risk is not sold that
way:

1. **Underwriters share risk.** v2 lets other underwriters **back** a pool with
   more units before the first policy is sold. Capacity is the sum of all units;
   premiums and unclaimed collateral are paid out **pro rata to units**, the last
   payout taking the remainder so no wei is left behind. Backing is fixed once a
   policy is sold, so nobody joins after seeing the risk.
2. **A product line has several models.** v2 covers 1–4 models in one pool.
   Validators agree on **which** models the page recalls, each with its own quote
   naming that model. A recalled model's policies become claimable; the others stay
   covered and keep selling.

## What changed

| Area | v1.1.0 | v2 |
|---|---|---|
| Opening | `open_pool(product, model, url, premium, payout, capacity, hours)` | `open_pool(product, [models], url, premium, payout, units, hours)`: 1–4 distinct models |
| Backing | one underwriter | `back(pool, units)` by others until the first sale; `get_stakes` |
| Buying | `buy(pool, count)` | `buy(pool, model, count)`; a recalled model refuses and returns the premium |
| Reading | `none` / `recalled` + quote | list of recalled models, one quote each that must name the model |
| Recall | whole pool RECALLED | only that model's policies claimable; other models still covered |
| Release | `release(pool)` to the one underwriter | `release(stake)` per backer, pro rata, after one final conclusive reading; last stake gets the remainder |
| Views | `get_pool` | `get_pool` with `models` and their status/quote, `get_stakes` |
| App | one model, one underwriter | model picker, backing form, per-model status, per-stake release |
| Tests | 44 direct | 51 direct (backing, pro-rata rounding, partial recall, refusals) |
| E2E | one-model recall | two backers paid pro rata, K200 recalled while K300 stays covered, page down at release |

## Why pro rata is safe

Every backer escrows payout × units, so the pool can always pay every policy it
sold. Shares are computed from units only after the final reading, when nothing
more can be claimed; the last stake to release takes what is left, so rounding
never strands or overdraws money.

## Evidence

Bradbury Phase 2 run, transaction by transaction: [README → Bradbury evidence](README.md#bradbury-evidence).
Live app: https://recallcover.cristhedev.com
