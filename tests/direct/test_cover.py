"""Opening a pool, buying cover, the page's verdict, claims, release to the underwriter and payout settlement."""

import json

import pytest

from tests.direct.conftest import (
    CLEAR,
    PAYOUT,
    PREMIUM,
    QUOTE,
    RECALLED_PAGE,
    SOURCES,
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
RECALL = {"body": RECALLED_PAGE, "recalled": [("K200", QUOTE)]}
END = "2030-01-31T10:00:00Z"

def test_open_and_buy(ev, direct_alice):
    p = ev.get_pool(0)
    assert (p["underwriter"].lower(), p["status"], p["sold"], p["free"]) == (to_hex(direct_alice).lower(), "ON", 3, 3 * PREMIUM + 10 * PAYOUT)
    assert p["ends_at"] == ts(END) and ([m["name"] for m in p["models"]], p["source"], p["source_name"]) == (["K200"], "regulator.example", "Product Safety Regulator (test)")
    assert [t["count"] for t in ev.get_policies(0, "", 0, 10)["items"]] == [2, 1]
    assert ev.get_readings(0, 0, 10)["items"][0]["answer"] == "none"
    assert ev.get_accounting()["expected_balance"] == 10 * PAYOUT + 3 * PREMIUM

@pytest.mark.parametrize(
    "kw, msg",
    [
        ({"product": "x"}, "3-120"),
        ({"url": "ftp://x"}, "https url"),
        ({"models": ["K"]}, "a model is 2-40"),
        ({"models": []}, "1-4 models"),
        ({"models": ["A1", "B2", "C3", "D4", "E5"]}, "1-4 models"),
        ({"models": ["K200", "k200"]}, "models must differ"),
        ({"premium": PAYOUT}, "0 < premium < payout"),
        ({"capacity": 1001}, "1-1000 units"),
        ({"hours": 0}, "1-8760 hours"),
        ({"value": 1}, "payout x units"),
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
    with direct_vm.expect_revert("a backer cannot buy"):
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
    with direct_vm.expect_revert("model K200 is not recalled: nothing to claim"):
        ev.claim(0)

def test_a_check_that_finds_nothing_changes_nothing(ev, direct_vm, direct_charlie):
    page(direct_vm)
    direct_vm.sender = direct_charlie
    assert ev.check(0) == 0
    assert ev.get_pool(0)["checks"] == 3 and len(ev.get_readings(0, 0, 10)["items"]) == 4

def test_a_recall_pays_every_holder(ev, direct_vm, direct_alice, direct_bob, direct_charlie, ledger):
    page(direct_vm, **RECALL)
    direct_vm.sender = direct_charlie
    assert ev.check(0) == 1
    p = ev.get_pool(0)
    assert (p["status"], p["recalled"], p["models"][0]["recalled"], p["models"][0]["quote"]) == ("ON", 1, True, QUOTE)
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
    with direct_vm.expect_revert("stake already released"):
        ev.release(0)
    with direct_vm.expect_revert("pool is CLOSED"):
        ev.check(0)

def test_buying_after_a_recall_returns_the_money(ev, direct_vm, direct_bob, ledger):
    page(direct_vm, **RECALL)
    assert buy(direct_vm, ev, direct_bob) == -1
    assert ledger.paid_to(direct_bob) == PREMIUM and ev.get_payout(0)["kind"] == "returned"
    assert (ev.get_pool(0)["recalled"], ev.get_pool(0)["sold"]) == (1, 3)
    assert ev.get_accounting()["expected_balance"] == 10 * PAYOUT + 3 * PREMIUM

def test_a_quote_that_is_not_on_the_page_reverts(ev, direct_vm, direct_charlie):
    page(direct_vm, body=RECALLED_PAGE, recalled=[("K200", "The K200 kettle is recalled.")])
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("quote is not on the page"):
        ev.check(0)
    assert ev.get_pool(0)["recalled"] == 0

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
    with direct_vm.expect_revert("model K200 is not recalled"):
        ev.claim(0)

def test_release_reads_the_page_one_last_time(ev, direct_vm, direct_alice, direct_bob, ledger):
    # Recalled by the end: holders are paid, the underwriter gets the rest.
    direct_vm.warp("2030-02-01T00:00:00Z")
    page(direct_vm, **RECALL)
    direct_vm.sender = direct_bob
    assert ev.release(0) == 3 * PREMIUM + 7 * PAYOUT
    tick(direct_vm)
    assert ev.get_pool(0)["status"] == "CLOSED" and ev.get_pool(0)["recalled"] == 1 and ev.claim(0) == 2 * PAYOUT

def test_no_release_without_a_final_reading(ev, direct_vm, direct_alice, direct_bob, ledger):
    # The page is gone at the end: nothing moves, however long after; the pool stays ON.
    page(direct_vm, status=404)
    direct_vm.sender = direct_bob
    for when in (END, "2030-03-02T10:00:01Z", "2031-06-01T00:00:00Z"):
        direct_vm.warp(when)
        with direct_vm.expect_revert("unavailable (HTTP 404)"):
            ev.release(0)
    assert (ev.get_pool(0)["status"], ev.get_pool(0)["released"], ledger.paid_to(direct_alice)) == ("ON", 0, 0)
    # A page that says nothing conclusive about the model does not close it either.
    page(direct_vm, body=RECALLED_PAGE, recalled=[("K200", "Acme T9 toaster: fire risk.")])
    with direct_vm.expect_revert("does not name model K200"):
        ev.release(0)
    # Once the page reads again, the final reading decides.
    page(direct_vm)
    assert ev.release(0) == 10 * PAYOUT + 3 * PREMIUM and ev.get_pool(0)["status"] == "CLOSED"


# ── The source: an approved regulator's host ───────────────────────────────


@pytest.mark.parametrize(
    "url",
    [
        "https://underwriter.example/recalls",  # the underwriter's own site
        "https://regulator.example.evil.example/recalls",  # approved name as a subdomain of another host
        "https://fake-regulator.example/recalls",  # approved name as a suffix
        "https://regulator.example@evil.example/recalls",  # user-info
        "https://regulator.example:8443/recalls",  # port
        "http://regulator.example/recalls",  # not https
    ],
)
def test_an_unapproved_source_is_refused_before_reading(ev, direct_vm, direct_alice, url):
    with direct_vm.expect_revert("approved regulator source" if url.startswith("https://") and "@" not in url and ":8443" not in url else "https url"):
        open_pool(direct_vm, ev, direct_alice, url=url)
    assert ev.get_pools(0, 10)["total"] == 1


def test_a_subdomain_of_an_approved_source_is_accepted(ev, direct_vm, direct_alice):
    assert open_pool(direct_vm, ev, direct_alice, url="https://www.regulator.example/recalls?page=2") == 1
    assert ev.get_pool(1)["source"] == "regulator.example"


def test_only_the_owner_approves_sources(ev, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("not authorised"):
        ev.set_source("underwriter.example", "Not a regulator")
    direct_vm.sender = direct_alice  # the deployer
    ev.set_source("other-regulator.example", "Other Regulator")
    assert ev.get_sources() == {"regulator.example": "Product Safety Regulator (test)", "other-regulator.example": "Other Regulator"}
    ev.set_source("regulator.example", "")  # withdrawn for new pools; pool 0 keeps its page
    with direct_vm.expect_revert("not an approved regulator source"):
        open_pool(direct_vm, ev, direct_alice)
    assert ev.get_pool(0)["url"] == "https://regulator.example/recalls"


def test_a_recall_quote_must_name_the_model(ev, direct_vm, direct_charlie):
    # K2000 is another model: the quote is on the page but does not name K200.
    body = "<html><body><ul><li>Brightway K2000 electric kettle: the base can overheat.</li></ul></body></html>"
    page(direct_vm, body=body, recalled=[("K200", "Brightway K2000 electric kettle: the base can overheat.")])
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("does not name model K200"):
        ev.check(0)
    assert ev.get_pool(0)["recalled"] == 0
    page(direct_vm, **RECALL)
    ev.check(0)
    page(direct_vm, body=RECALLED_PAGE + body, recalled=[("K200", QUOTE)])
    assert direct_vm.run_validator(leader_result={"recalled": [["K200", "Brightway K2000 electric kettle: the base can overheat."]]}) is False
    assert direct_vm.run_validator() is True


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
    assert direct_vm.run_validator(leader_result={"recalled": [["K200", "brightway k200  ELECTRIC kettle: the base can overheat"]]}) is True
    for bad in ({"recalled": [["K200", "K200 bad"]]}, {"recalled": [["K200", "The kettle is off sale."]]}, {"recalled": []}, {"recalled": [["K300", QUOTE]]}, {"recalled": [["K200", QUOTE], ["K200", QUOTE]]}, {"recalled": [QUOTE]}, ["recalled"]):
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
    with direct_vm.expect_revert("expected a list of recalled models"):
        ev.check(0)
    assert direct_vm.run_validator(leader_error="[LLM_ERROR] expected a list of recalled models") is False

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
    tx, fin = chain.pay(ev, 0, "buy", [0, 0, 1])
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

# ── v2: several underwriters back one pool ──────────────────────────────────

def test_backers_share_pro_rata_and_the_last_takes_the_remainder(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, ledger):
    direct_vm.warp("2030-01-01T10:00:00Z")
    direct_vm.sender = direct_alice
    c = direct_deploy("contracts/recall_cover.py", SOURCES)
    open_pool(direct_vm, c, direct_alice, capacity=1)  # Alice backs 1 unit
    direct_vm.sender, direct_vm.value = direct_bob, 2 * PAYOUT
    assert c.back(0, 2) == 1  # Bob backs 2 units: stake #1
    direct_vm.value = PAYOUT
    assert c.back(0, 1) == 1  # more units on the same stake
    direct_vm.value = 0
    p = c.get_pool(0)
    assert (p["capacity"], p["backers"]) == (4, 2) and [s["units"] for s in c.get_stakes(0, 0, 10)["items"]] == [1, 3]
    buy(direct_vm, c, direct_charlie)
    chain_balance(direct_vm, 4 * PAYOUT + PREMIUM)
    direct_vm.warp(END)
    page(direct_vm)
    direct_vm.sender = direct_charlie
    free = 4 * PAYOUT + PREMIUM
    assert c.release(1) == free * 3 // 4 and ledger.paid_to(direct_bob) == free * 3 // 4
    tick(direct_vm)
    assert c.release(0) == free - free * 3 // 4  # the last one takes the remainder
    assert c.get_accounting()["expected_balance"] == 0 and c.get_pool(0)["status"] == "CLOSED"

def test_backing_is_fixed_once_a_policy_is_sold(ev, direct_vm, direct_charlie):
    direct_vm.sender, direct_vm.value = direct_charlie, PAYOUT
    with direct_vm.expect_revert("backing is fixed"):
        ev.back(0, 1)

def test_back_validation(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.warp("2030-01-01T10:00:00Z")
    direct_vm.sender = direct_alice
    c = direct_deploy("contracts/recall_cover.py", SOURCES)
    open_pool(direct_vm, c, direct_alice, capacity=999)
    direct_vm.sender, direct_vm.value = direct_bob, 2 * PAYOUT
    with direct_vm.expect_revert("1-1 units"):
        c.back(0, 2)
    direct_vm.value = 1
    with direct_vm.expect_revert("payout x units"):
        c.back(0, 1)
    direct_vm.value = PAYOUT
    c.back(0, 1)
    with direct_vm.expect_revert("a backer cannot buy"):
        buy(direct_vm, c, direct_bob)

# ── v2: one pool, several models ────────────────────────────────────────────

K300_PAGE = RECALLED_PAGE.replace("</ul>", "<li>Brightway K300 travel kettle: the lid can open while boiling.</li></ul>")
K300 = "Brightway K300 travel kettle: the lid can open while boiling."

@pytest.fixture
def two(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    """Pool 0 covers K200 and K300 (10 units by Alice); Bob holds 2 on K200, Charlie 1 on K300."""
    direct_vm.warp("2030-01-01T10:00:00Z")
    direct_vm.sender = direct_alice
    c = direct_deploy("contracts/recall_cover.py", SOURCES)
    open_pool(direct_vm, c, direct_alice, product="Brightway electric kettles", models=["K200", "K300"])
    buy(direct_vm, c, direct_bob, count=2)
    buy(direct_vm, c, direct_charlie, model=1)
    chain_balance(direct_vm, 10 * PAYOUT + 3 * PREMIUM)
    return c

def test_a_recall_of_one_model_leaves_the_others_covered(two, direct_vm, direct_alice, direct_bob, direct_charlie, ledger):
    page(direct_vm, **RECALL)
    direct_vm.sender = direct_charlie
    assert two.check(0) == 1
    assert [m["recalled"] for m in two.get_pool(0)["models"]] == [True, False]
    assert two.claim(0) == 2 * PAYOUT
    tick(direct_vm)
    with direct_vm.expect_revert("model K300 is not recalled"):
        two.claim(1)
    with direct_vm.expect_revert("model K200 is recalled"):
        buy(direct_vm, two, direct_charlie)
    page(direct_vm)  # K300 still sells, and the next reading asks only for K300
    buy(direct_vm, two, direct_charlie, model=1)
    with direct_vm.expect_revert("cover runs until"):
        two.release(0)
    # Later the page adds K300: only that model is newly recalled.
    page(direct_vm, body=K300_PAGE, recalled=[("K300", K300)])
    assert two.check(0) == 2
    rows = two.get_readings(0, 0, 20)["items"]
    assert [(r["answer"], r["model"]) for r in rows[-2:]] == [("none", ""), ("recalled", "K300")]
    # Every model recalled: release closes at once, no reading; holders keep their claims.
    tick(direct_vm)
    assert two.release(0) == 4 * PREMIUM + 6 * PAYOUT and two.get_pool(0)["status"] == "CLOSED"
    tick(direct_vm)
    assert two.claim(1) == PAYOUT
    tick(direct_vm)
    assert two.claim(2) == PAYOUT and two.get_accounting()["expected_balance"] == 0

def test_validators_agree_on_which_models(two, direct_vm, direct_charlie):
    both = [("K200", QUOTE), ("K300", K300)]
    page(direct_vm, body=K300_PAGE, recalled=both)
    direct_vm.sender = direct_charlie
    assert two.check(0) == 2
    page(direct_vm, body=K300_PAGE, recalled=both)
    assert direct_vm.run_validator() is True
    assert direct_vm.run_validator(leader_result={"recalled": [["K200", QUOTE]]}) is False  # one model missing
    assert direct_vm.run_validator(leader_result={"recalled": [["K300", QUOTE], ["K200", K300]]}) is False  # quotes swapped
    with direct_vm.expect_revert("every model is recalled"):
        two.check(0)
