"""Opening a pool, buying cover, the page's verdict, claims, release to the underwriter and payout settlement."""

import json

import pytest

from tests.direct.conftest import (
    CLEAR,
    PAYOUT,
    PREMIUM,
    QUOTE,
    RECALLED_PAGE,
    buy,
    chain_balance,
    open_pool,
    page,
    tick,
    to_hex,
    ts,
)

OTHER = "0x" + "77" * 20
DAY = 86_400
RECALL = {"body": RECALLED_PAGE, "answer": "recalled", "quote": QUOTE}
END = "2030-01-31T10:00:00Z"

def test_open_and_buy(ev, direct_alice):
    p = ev.get_pool(0)
    assert (p["underwriter"].lower(), p["status"], p["sold"], p["free"]) == (to_hex(direct_alice).lower(), "ON", 3, 3 * PREMIUM + 10 * PAYOUT)
    assert p["ends_at"] == ts(END) and p["lapse_at"] == ts(END) + 30 * DAY
    assert [t["count"] for t in ev.get_policies(0, "", 0, 10)["items"]] == [2, 1]
    assert ev.get_readings(0, 0, 10)["items"][0]["answer"] == "none"
    assert ev.get_accounting()["expected_balance"] == 10 * PAYOUT + 3 * PREMIUM

@pytest.mark.parametrize(
    "kw, msg",
    [
        ({"product": "x"}, "3-120"),
        ({"url": "ftp://x"}, "http(s)"),
        ({"premium": PAYOUT}, "0 < premium < payout"),
        ({"capacity": 1001}, "capacity 1-1000"),
        ({"hours": 0}, "1-8760 hours"),
        ({"value": 1}, "payout x capacity"),
        (RECALL, "already announces a recall"),
        ({"status": 404}, "unavailable (HTTP 404)"),
        ({"body": "<p>" + "x " * 11000 + "</p>"}, "over 20000 characters"),
    ],
)
def test_open_validation(ev, direct_vm, direct_alice, kw, msg):
    with direct_vm.expect_revert(msg):
        open_pool(direct_vm, ev, direct_alice, **kw)
    assert ev.get_pools(0, 10)["total"] == 1

def test_buy_validation(ev, direct_vm, direct_alice, direct_bob):
    page(direct_vm)
    with direct_vm.expect_revert("exactly premium x count"):
        buy(direct_vm, ev, direct_bob, value=PREMIUM + 1)
    with direct_vm.expect_revert("1-10 policies"):
        buy(direct_vm, ev, direct_bob, count=11)
    with direct_vm.expect_revert("underwriter cannot buy"):
        buy(direct_vm, ev, direct_alice)
    open_pool(direct_vm, ev, direct_alice, capacity=2)
    buy(direct_vm, ev, direct_bob, pool=1, count=2)
    with direct_vm.expect_revert("0 left"):
        buy(direct_vm, ev, direct_bob, pool=1)
    direct_vm.warp(END)
    with direct_vm.expect_revert("cover ended"):
        buy(direct_vm, ev, direct_bob)

def test_nothing_to_claim_while_on(ev, direct_vm, direct_charlie):
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("pool is ON: nothing to claim"):
        ev.claim(0)

def test_a_check_that_finds_nothing_changes_nothing(ev, direct_vm, direct_charlie):
    page(direct_vm)
    direct_vm.sender = direct_charlie
    assert ev.check(0) == "ON"
    assert ev.get_pool(0)["checks"] == 3 and len(ev.get_readings(0, 0, 10)["items"]) == 4

def test_a_recall_pays_every_holder(ev, direct_vm, direct_alice, direct_bob, direct_charlie, ledger):
    page(direct_vm, **RECALL)
    direct_vm.sender = direct_charlie
    assert ev.check(0) == "RECALLED"
    p = ev.get_pool(0)
    assert (p["status"], p["quote"]) == ("RECALLED", QUOTE)
    assert ev.get_readings(0, 0, 10)["items"][-1]["answer"] == "recalled"
    # Anyone sends each holder its payout, once.
    assert ev.claim(0) == 2 * PAYOUT and ledger.paid_to(direct_bob) == 2 * PAYOUT
    tick(direct_vm)
    with direct_vm.expect_revert("already claimed"):
        ev.claim(0)
    # Release returns premiums and unsold collateral at once, holders unaffected.
    assert ev.release(0) == 3 * PREMIUM + 7 * PAYOUT and ledger.paid_to(direct_alice) == 3 * PREMIUM + 7 * PAYOUT
    tick(direct_vm)
    assert ev.claim(1) == PAYOUT and ledger.paid_to(direct_charlie) == PAYOUT
    assert ev.get_accounting()["expected_balance"] == 0
    with direct_vm.expect_revert("pool already released"):
        ev.release(0)
    with direct_vm.expect_revert("pool is RECALLED"):
        ev.check(0)

def test_buying_after_a_recall_returns_the_money(ev, direct_vm, direct_bob, ledger):
    page(direct_vm, **RECALL)
    assert buy(direct_vm, ev, direct_bob) == -1
    assert ledger.paid_to(direct_bob) == PREMIUM and ev.get_payout(0)["kind"] == "returned"
    assert (ev.get_pool(0)["status"], ev.get_pool(0)["sold"]) == ("RECALLED", 3)
    assert ev.get_accounting()["expected_balance"] == 10 * PAYOUT + 3 * PREMIUM

def test_a_quote_that_is_not_on_the_page_reverts(ev, direct_vm, direct_charlie):
    page(direct_vm, body=RECALLED_PAGE, answer="recalled", quote="The K200 kettle is recalled.")
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("quote is not on the page"):
        ev.check(0)
    assert ev.get_pool(0)["status"] == "ON"

def test_release_after_the_end(ev, direct_vm, direct_alice, direct_charlie, ledger):
    direct_vm.sender = direct_charlie
    page(direct_vm)
    direct_vm.warp("2030-01-31T09:59:59Z")
    with direct_vm.expect_revert("cover runs until 2030-01-31 10:00 UTC"):
        ev.release(0)
    direct_vm.warp(END)
    with direct_vm.expect_revert("release reads the page"):
        ev.check(0)
    assert ev.release(0) == 10 * PAYOUT + 3 * PREMIUM
    assert ledger.paid_to(direct_alice) == 10 * PAYOUT + 3 * PREMIUM and ev.get_payout(0)["kind"] == "release"
    assert (ev.get_pool(0)["status"], ev.get_accounting()["expected_balance"]) == ("CLOSED", 0)
    with direct_vm.expect_revert("pool is CLOSED"):
        ev.claim(0)

def test_release_reads_the_page_one_last_time(ev, direct_vm, direct_alice, direct_bob, ledger):
    # Recalled by the end: holders are paid, the underwriter gets the rest.
    direct_vm.warp("2030-02-01T00:00:00Z")
    page(direct_vm, **RECALL)
    direct_vm.sender = direct_bob
    assert ev.release(0) == 3 * PREMIUM + 7 * PAYOUT
    tick(direct_vm)
    assert ev.get_pool(0)["status"] == "RECALLED" and ev.claim(0) == 2 * PAYOUT

def test_unreadable_pool_closes_after_30_days(ev, direct_vm, direct_alice, direct_bob, ledger):
    page(direct_vm, status=404)
    direct_vm.sender = direct_bob
    direct_vm.warp("2030-03-02T10:00:00Z")
    with direct_vm.expect_revert("unavailable (HTTP 404)"):
        ev.release(0)
    direct_vm.warp("2030-03-02T10:00:01Z")
    assert ev.release(0) == 10 * PAYOUT + 3 * PREMIUM and ev.get_pool(0)["status"] == "CLOSED"

def test_a_payout_needs_the_balance(ev, direct_vm, direct_bob):
    page(direct_vm, **RECALL)
    direct_vm.sender = direct_bob
    ev.check(0)
    chain_balance(direct_vm, PAYOUT)
    with direct_vm.expect_revert("contract balance below payout"):
        ev.claim(0)
    assert ev.get_policy(0)["status"] == "HELD"

# ── Consensus ───────────────────────────────────────────────────────────────

def test_validators_agree_on_the_status(ev, direct_vm, direct_charlie):
    page(direct_vm, **RECALL)
    direct_vm.sender = direct_charlie
    ev.check(0)
    assert direct_vm.run_validator() is True
    page(direct_vm)  # the page another validator saw says nothing
    assert direct_vm.run_validator() is False

def test_the_quote_must_be_on_each_validators_page(ev, direct_vm, direct_charlie):
    page(direct_vm, **RECALL)
    direct_vm.sender = direct_charlie
    ev.check(0)
    page(direct_vm, **RECALL)
    assert direct_vm.run_validator(leader_result={"status": "recalled", "quote": "brightway k200  ELECTRIC kettle: the base can overheat"}) is True
    for bad in ({"status": "recalled", "quote": "K200 bad"}, {"status": "recalled", "quote": "The kettle is off sale."}, {"status": "none", "quote": QUOTE}, {"status": "maybe", "quote": ""}, ["recalled"]):
        assert direct_vm.run_validator(leader_result=bad) is False

def test_an_unreachable_page_is_agreed_and_reverts(ev, direct_vm, direct_charlie):
    page(direct_vm, status=503)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("unavailable (HTTP 503)"):
        ev.check(0)
    assert direct_vm.run_validator(leader_error="[EXTERNAL] recall page unavailable (HTTP 503)") is True
    assert direct_vm.run_validator(leader_error="[EXTERNAL] recall page unavailable (HTTP 404)") is False

def test_an_llm_error_is_never_agreed(ev, direct_vm, direct_charlie):
    direct_vm.clear_mocks()
    direct_vm.mock_web(r"regulator\.example", {"status": 200, "body": CLEAR})
    direct_vm.mock_llm(r"announces a recall", json.dumps({"status": "unclear"}))
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("expected status"):
        ev.check(0)
    assert direct_vm.run_validator(leader_error="[LLM_ERROR] expected status none or recalled") is False

# ── Each payout settles from its own transfer ───────────────────────────────

def recalled(ev, vm, bob):
    page(vm, **RECALL)
    vm.sender = bob
    ev.check(0)
    tick(vm)
    ev.claim(0)

def test_delivered_claim_settles(ev, direct_vm, direct_bob, chain):
    recalled(ev, direct_vm, direct_bob)
    tx, fin = chain.pay(ev, 0, "claim", [0])
    assert ev.settle_payout(0, tx, fin) == "DELIVERED"
    with direct_vm.expect_revert("already settled"):
        ev.settle_payout(0, tx, fin)

def test_returned_premium_settles_from_buy(ev, direct_vm, direct_bob, chain):
    page(direct_vm, **RECALL)
    buy(direct_vm, ev, direct_bob)
    tx, fin = chain.pay(ev, 0, "buy", [0, 1])
    assert ev.settle_payout(0, tx, fin) == "DELIVERED"

def test_failed_claim_is_recoverable(ev, direct_vm, direct_bob, chain, ledger):
    recalled(ev, direct_vm, direct_bob)
    tx, fin = chain.pay(ev, 0, "claim", [0], delivered=False)
    assert ev.settle_payout(0, tx, fin) == "FAILED"
    assert ev.get_recoverable(to_hex(direct_bob)) == 2 * PAYOUT
    tick(direct_vm)
    direct_vm.sender = direct_bob
    assert ev.recover(OTHER) == 2 * PAYOUT and ledger.paid_to(OTHER) == 2 * PAYOUT
    with direct_vm.expect_revert("nothing to recover"):
        ev.recover(OTHER)

@pytest.mark.parametrize(
    "kw",
    [{"method": "release"}, {"args": [1]}, {"sender": "0x" + "99" * 20}, {"at": 1}, {"result": 2}, {"delivered": None}],
)
def test_settle_rejects_a_transaction_that_is_not_this_payout(kw, ev, direct_vm, direct_bob, chain):
    recalled(ev, direct_vm, direct_bob)
    method, a = kw.pop("method", "claim"), kw.pop("args", [0])
    tx, fin = chain.pay(ev, 0, method, a, **{"delivered": False, **kw})
    with direct_vm.expect_revert("did not create this payout"):
        ev.settle_payout(0, tx, fin)
    assert ev.get_payout(0)["status"] == "SENT"
