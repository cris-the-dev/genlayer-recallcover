// End-to-end on Testnet Bradbury (Phase 2), on the packed code that is deployed:
//
//   python deploy/shrink.py contracts/recall_cover.py build/recall_cover.py --pack
//   npm i genlayer-js@2.0.0-rc.2   # plus the estimateTransactionFees patch in app/README.md
//   GL_PK0=0x... GL_PK1=0x... GL_PK2=0x... node tests/integration/bradbury.mjs build/recall_cover.py [contract]
//
// GL_PK0 deploys with one approved regulator source, the host serving evidence/ (EVIDENCE), and
// underwrites (the regulator's page is evidence/recalls.html); GL_PK1 and GL_PK2 buy cover. Only the
// owner approves sources; a page on any other host is refused before it is read. A product the page already recalls cannot be covered. Kettle pool: the collateral
// must be payout x capacity, the underwriter cannot buy, a wrong premium is refused, nothing is
// claimable while the page says nothing; then the page is edited to announce the kettle's recall (the
// run waits for it); the next buy reads it, turns the pool RECALLED and sends that premium straight
// back, sales close, validators quote the recall, anyone sends each holder its payout once, and the underwriter gets the premiums and unsold collateral.
// Hair-dryer pool (its page is evidence/notices.html): cover for one hour, release refused before the
// end; then the page is taken down (the run waits for a 404) and release reverts, the pool stays ON
// and nothing moves; the page comes back, validators read it one last time and the underwriter gets
// everything back. Every payout settles from its own transfer.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createAccount, createClient, MessageType, encodeExternalMessageFeeParams } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const PREMIUM = 2n * 10n ** 13n, PAYOUT = 10n ** 14n, HOUR = 3600;
const EVIDENCE = process.env.EVIDENCE ?? "https://recallcover.cristhedev.com/evidence/";
const RECALLS = EVIDENCE + "recalls.html", NOTICES = EVIDENCE + "notices.html";
const HOST = new URL(EVIDENCE).host, SOURCES = new Map([[HOST, "RecallCover demo regulator (evidence pages)"]]);
const KETTLE = "Brightway K200 electric kettle", DRYER = "Halden H5 hair dryer", TOASTER = "Acme T9 two-slice toaster";
const CONSENSUS_MAIN = "0x2e2766cbc3e5e61ce93bbcdcbb3eacb82082a019";
const T_FINALIZED = "0x24196ec40f90671b7144e716978686b4f3c7d6b00b23da3971ef2b52af27d87f";
const PAYOUT_GAS = 100000n, PAYOUT_GAS_PRICE = 1000000000n;
// rpc.testnet-chain.genlayer.com (the chain default) does not serve gen_call; this one serves the same chain.
const endpoint = "https://rpc-bradbury.genlayer.com";
const a0 = createAccount(process.env.GL_PK0);
const a1 = createAccount(process.env.GL_PK1);
const a2 = createAccount(process.env.GL_PK2);
const c0 = createClient({ chain: testnetBradbury, endpoint, account: a0 });
const c1 = createClient({ chain: testnetBradbury, endpoint, account: a1 });
const c2 = createClient({ chain: testnetBradbury, endpoint, account: a2 });
const sha = (t) => createHash("sha256").update(t).digest("hex");
const page = async (url) => sha(Buffer.from(await (await fetch(url)).arrayBuffer()));
const fees = async (c, payee) => {
  const messageAllocations = payee && [{
    messageType: MessageType.External, onAcceptance: false, recipient: payee, budget: PAYOUT_GAS * PAYOUT_GAS_PRICE,
    callKey: "0x" + "00".repeat(32), feeParams: encodeExternalMessageFeeParams({ gasLimit: PAYOUT_GAS, maxGasPrice: PAYOUT_GAS_PRICE }),
  }];
  // A read, so retrying a dropped connection is safe.
  let e;
  for (let i = 0; !e; i++) {
    try { e = await c.estimateTransactionFees(payee ? { messageAllocations } : {}); }
    catch (err) { if (i >= 5 || !/fetch failed|ECONNRESET|timed out|socket/i.test(String(err?.details ?? err?.message))) throw err; await new Promise((r) => setTimeout(r, 10000)); }
  }
  return { distribution: e.distribution, feeValue: e.feeValue, ...(payee && { messageAllocations: e.messageAllocations }) };
};
// The public RPC drops connections now and then; retry the wait, never the write.
async function wait(c, hash, waitUntil = "decided") {
  for (let i = 0; ; i++) {
    try {
      return await c.waitForTransactionReceipt({ hash, waitUntil, interval: 10000, retries: 360 });
    } catch (e) {
      if (i >= 5 || !/fetch failed|ECONNRESET|timed out|socket/i.test(String(e?.details ?? e?.message))) throw e;
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}
const check = (ok, what) => {
  console.log(ok ? "  ok  " : "  FAIL", what);
  if (!ok) process.exit(1);
};
// A finalized leader timeout (NOT_VOTED) or vote without a majority (NO_MAJORITY) applied nothing, so sending the call again is safe. Bradbury still
// moves the value of such a transaction, and of a reverted one, into the contract, where
// get_accounting shows it as unaccounted.
let stray = 0n;
async function tx(c, label, functionName, args, { value = 0n, payee } = {}) {
  for (let i = 0; ; i++) {
    const hash = await c.writeContract({ address, functionName, args, value, fees: await fees(c, payee) });
    let r = await wait(c, hash);
    // NOT_VOTED / NO_MAJORITY can be an intermediate round (one such buy later finalized and ran on
    // Bradbury): wait for finality and retry only if it still applied nothing.
    if (r.txExecutionResultName === "NOT_VOTED" || r.resultName === "NO_MAJORITY") r = await wait(c, hash, "finalized");
    // NO_MAJORITY: validators did not agree, so nothing was applied even if the leader returned.
    const res = r.resultName === "NO_MAJORITY" ? "NO_MAJORITY" : r.txExecutionResultName;
    console.log(`${label}: ${hash} ${res}`);
    if (res !== "FINISHED_WITH_RETURN") stray += value;
    if ((res !== "NOT_VOTED" && res !== "NO_MAJORITY") || i >= 5) return { ...r, txExecutionResultName: res, hash };
  }
}
const ok = async (...a) => { const r = await tx(...a); check(r.txExecutionResultName === "FINISHED_WITH_RETURN", `${a[1]} succeeds`); return r; };
// A rejection is a transaction that ran and reverted, never one that was not voted on.
const fails = async (what, ...a) => check((await tx(...a)).txExecutionResultName === "FINISHED_WITH_ERROR", what);
// A read, so retrying a dropped connection is safe.
const read = async (functionName, args = []) => {
  let v;
  for (let i = 0; ; i++) {
    try { v = await c0.readContract({ address, functionName, args }); break; }
    catch (e) { if (i >= 5 || !/fetch failed|ECONNRESET|timed out|socket/i.test(String(e?.details ?? e?.message))) throw e; await new Promise((r) => setTimeout(r, 10000)); }
  }
  const plain = (x) => (x instanceof Map ? Object.fromEntries([...x].map(([k, y]) => [k, plain(y)])) : Array.isArray(x) ? x.map(plain) : x);
  return plain(v);
};
// RPC nodes behind the edge can lag the one that reported the receipt: re-read until `ok` holds (or give up).
async function settled(fn, args, ok) {
  for (let i = 0; ; i++) {
    const v = await read(fn, args);
    if (ok(v) || i >= 12) return v;
    await new Promise((r) => setTimeout(r, 10000));
  }
}
// Reads only, so retrying a dropped connection is safe.
const rpc = async (method, params) => {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "user-agent": "recallcover-e2e" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      return (await r.json()).result;
    } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 10000)); }
  }
};
// The consensus-layer transaction that finalized `hash`: it emits TransactionFinalized(txId).
async function finalizeTx(hash, fromBlock) {
  for (;;) {
    const to = BigInt(await rpc("eth_blockNumber", []));
    for (let b = fromBlock; b <= to; b += 1000n) {
      const end = b + 999n > to ? to : b + 999n;
      const logs = await rpc("eth_getLogs", [{ address: CONSENSUS_MAIN, topics: [T_FINALIZED, hash], fromBlock: "0x" + b.toString(16), toBlock: "0x" + end.toString(16) }]);
      if (logs?.length) return logs[0].transactionHash;
    }
    await new Promise((r) => setTimeout(r, 30000));
  }
}
async function settle(id, paid, fromBlock) {
  await wait(c0, paid.hash, "finalized");
  const fin = await finalizeTx(paid.hash, fromBlock);
  console.log(`finalized by ${fin}`);
  await ok(c2, `settle payout ${id}`, "settle_payout", [id, paid.hash, fin]);
  check((await settled("get_payout", [id], (x) => x.status === "DELIVERED")).status === "DELIVERED", `payout ${id} DELIVERED`);
  await fails("a payout settles once", c2, "settle again", "settle_payout", [id, paid.hash, fin]);
}

let address = process.argv[3];
if (!address) {
  const hash = await c0.deployContract({ code: readFileSync(process.argv[2], "utf8"), args: [SOURCES], fees: await fees(c0) });
  const r = await wait(c0, hash);
  address = r.txDataDecoded?.contractAddress;
  console.log(`deploy: ${hash} ${r.txExecutionResultName} -> ${address}`);
  check(r.txExecutionResultName === "FINISHED_WITH_RETURN", "deployed");
}
const fromBlock = BigInt(await rpc("eth_blockNumber", []));
stray = BigInt((await read("get_accounting")).unaccounted);
const uw = a0.address, b1 = a1.address, b2 = a2.address, low = (x) => x?.toLowerCase();
const now = () => Math.floor(Date.now() / 1000);
const pool = Number((await read("get_pools", [0, 1])).total), pol = Number((await read("get_policies", [-1, "", 0, 1])).total);
const pid = Number((await read("get_accounting")).payout_count);
const text = async (url) => (await fetch(url, { cache: "no-store" })).text();
check(!(await text(RECALLS)).includes("K200"), "the regulator's page does not list the kettle yet");

// Sources: only approved hosts, approved only by the owner.
check(JSON.stringify(await read("get_sources")).includes(HOST), `${HOST} is the approved source`);
await fails("only the owner approves sources", c1, "approve a source as a buyer", "set_source", ["seller.cristhedev.com", "Seller"]);
await fails("a page on an unapproved host is refused", c0, "open a pool on the seller's own site", "open_pool", [KETTLE, "K200", RECALLS.replace(HOST, "seller.cristhedev.com"), PREMIUM, PAYOUT, 5, 720], { value: 5n * PAYOUT });
await fails("the parent domain is not the approved source", c0, "open a pool on the parent domain", "open_pool", [KETTLE, "K200", RECALLS.replace(HOST, "cristhedev.com"), PREMIUM, PAYOUT, 5, 720], { value: 5n * PAYOUT });
await fails("the model must be part of the product name", c0, "open a pool for model K300", "open_pool", [KETTLE, "K300", RECALLS, PREMIUM, PAYOUT, 5, 720], { value: 5n * PAYOUT });

// The toaster is already recalled: no cover is sold for it.
await fails("a product the page already recalls cannot be covered", c0, "open a pool for the recalled toaster", "open_pool", [TOASTER, "T9", RECALLS, PREMIUM, PAYOUT, 5, 24], { value: 5n * PAYOUT });
// Hair dryer first: covered for one hour.
await ok(c0, "open the hair-dryer pool (1 hour)", "open_pool", [DRYER, "H5", NOTICES, PREMIUM, PAYOUT, 3, 1], { value: 3n * PAYOUT });
await ok(c1, "buy 1 hair-dryer policy", "buy", [pool, 1], { value: PREMIUM });

// Kettle: covered, then recalled on the regulator's page.
await fails("the collateral must be payout x capacity", c0, "open the kettle pool short of collateral", "open_pool", [KETTLE, "K200", RECALLS, PREMIUM, PAYOUT, 5, 720], { value: 4n * PAYOUT });
await ok(c0, "open the kettle pool", "open_pool", [KETTLE, "K200", RECALLS, PREMIUM, PAYOUT, 5, 720], { value: 5n * PAYOUT });
// A NOT_VOTED open may still have executed (one did on Bradbury): take the id of the last pool opened.
const K = Number((await settled("get_pools", [0, 1], (x) => Number(x.total) > pool + 1)).total) - 1;
check(K > pool && (await read("get_pool", [K])).model === "K200", `kettle pool is #${K}`);
await fails("the underwriter cannot buy", c0, "buy as the underwriter", "buy", [K, 1], { value: PREMIUM });
await fails("the premium must be premium x count", c1, "buy 2 policies paying for 1", "buy", [K, 2], { value: PREMIUM });
await ok(c1, "buy 2 kettle policies", "buy", [K, 2], { value: 2n * PREMIUM });
await ok(c2, "buy 1 kettle policy", "buy", [K, 1], { value: PREMIUM });
await fails("nothing is claimable while the page says nothing", c2, "claim while on", "claim", [pol + 1], { payee: b1 });
await ok(c2, "read the page (nothing yet)", "check", [K]);
let p = await settled("get_pool", [K], (x) => Number(x.checks) === 3);
check(p.status === "ON" && Number(p.sold) === 3, "still on; 3 policies sold");
console.log("waiting for the regulator's page to announce the K200 recall…");
while (!(await text(RECALLS)).includes("K200")) await new Promise((r) => setTimeout(r, 15000));
// The next buy reads the page first: it finds the recall, sells nothing and sends the premium back.
const late = await ok(c2, "buy after the recall is listed (reads the page, premium sent back)", "buy", [K, 1], { value: PREMIUM, payee: b2 });
p = await settled("get_pool", [K], (x) => x.status !== "ON");
check(p.status === "RECALLED" && Number(p.sold) === 3 && (await text(RECALLS)).replace(/<[^>]+>|\s+/g, "").toLowerCase().includes(p.quote.replace(/\s+/g, "").toLowerCase()), `RECALLED, nothing sold, quoted from the page: “${p.quote}”`);
await fails("sales close once recalled", c2, "buy again", "buy", [K, 1], { value: PREMIUM });
await fails("no reading once recalled", c2, "read the page again", "check", [K]);
const r1 = await ok(c2, "claim policy for 2 (anyone sends it)", "claim", [pol + 1], { payee: b1 });
await fails("a policy is claimed once", c2, "claim it again", "claim", [pol + 1], { payee: b1 });
const r2 = await ok(c1, "claim policy for 1", "claim", [pol + 2], { payee: b2 });
const relK = await ok(c1, "release the kettle pool", "release", [K], { payee: uw });

// Hair dryer: nothing announced by the end, so the underwriter gets everything back.
await fails("release is refused before the cover ends", c1, "release the hair-dryer pool early", "release", [pool], { payee: uw });
p = await read("get_pool", [pool]);
const left = Number(p.ends_at) - now() + 60;
if (left > 0) { console.log(`waiting ${Math.ceil(left / 60)} min for the hair-dryer cover to end…`); await new Promise((r) => setTimeout(r, left * 1000)); }
console.log("waiting for the hair-dryer page to be taken down…");
while ((await fetch(NOTICES, { cache: "no-store" })).status !== 404) await new Promise((r) => setTimeout(r, 15000));
await fails("no release without a final reading", c1, "release while the page is unavailable", "release", [pool], { payee: uw });
p = await read("get_pool", [pool]);
check(p.status === "ON" && !p.released, "still ON, collateral held");
console.log("waiting for the hair-dryer page to come back…");
while ((await fetch(NOTICES, { cache: "no-store" })).status !== 200) await new Promise((r) => setTimeout(r, 15000));
const relD = await ok(c1, "release the hair-dryer pool", "release", [pool], { payee: uw });
p = await settled("get_pool", [pool], (x) => x.released);
check(p.status === "CLOSED", "CLOSED with no recall; the underwriter keeps the premium");

const ps = [];
for (let i = 0; i < 5; i++) ps.push(await settled("get_payout", [pid + i], (x) => !!x?.kind));
const want = [["returned", PREMIUM, b2], ["claim", 2n * PAYOUT, b1], ["claim", PAYOUT, b2], ["release", 3n * PREMIUM + 2n * PAYOUT, uw], ["release", PREMIUM + 3n * PAYOUT, uw]];
want.forEach(([kind, amount, to], i) => check(ps[i].kind === kind && BigInt(ps[i].amount) === amount && low(ps[i].to) === low(to), `payout ${pid + i}: ${kind} ${amount} to ${to.slice(0, 8)}`));
for (const [i, t] of [late, r1, r2, relK, relD].entries()) await settle(pid + i, t, fromBlock);
check(BigInt((await read("get_accounting")).unaccounted) === stray, `balance matches what the contract expects to hold (+${stray} from unexecuted or reverted txs)`);
console.log("contract", address, "pools", pool, K);
