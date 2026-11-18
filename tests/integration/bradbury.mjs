// End-to-end on Testnet Bradbury (Phase 2), on the packed code that is deployed (v2: backers, models):
//
//   python deploy/shrink.py contracts/recall_cover.py build/recall_cover.py --pack
//   npm i genlayer-js@2.0.0-rc.2   # plus the estimateTransactionFees patch in app/README.md
//   GL_PK0=0x... GL_PK1=0x... GL_PK2=0x... node tests/integration/bradbury.mjs build/recall_cover.py [contract]
//
// GL_PK0 deploys with one approved regulator source, the host serving evidence/ (EVIDENCE), and
// underwrites; GL_PK1 and GL_PK2 buy cover, GL_PK2 also backs a pool. Only the owner approves sources;
// a page on any other host is refused before it is read; 5 models, a repeated model and a product the
// page already recalls are refused. Hair-dryer pool (evidence/notices.html, one hour): GL_PK2 backs it
// with one more unit, a backer cannot buy, backing is fixed once a policy is sold. Kettle pool
// (evidence/kettles.html, one hour) covers K200 and K300: policies on both; nothing claimable while
// the page says nothing; then the page is edited to recall the K200 (the run waits for it): the next
// K200 buy reads it, sends that premium straight back and marks only the K200 recalled; K300 still
// sells; the K200 holder is paid, the K300 holder cannot claim. After the hour: the kettle pool is read
// one last time and its underwriter paid what no K200 policy claims. The hair-dryer page is taken down
// (the run waits for a 404) and release reverts; it comes back, validators read it, and both backers
// are paid pro rata to units, the last one the remainder. Every payout settles from its own transfer.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createAccount, createClient, MessageType, encodeExternalMessageFeeParams } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const PREMIUM = 2n * 10n ** 13n, PAYOUT = 10n ** 14n, HOUR = 3600;
const EVIDENCE = process.env.EVIDENCE ?? "https://recallcover.cristhedev.com/evidence/";
const RECALLS = EVIDENCE + "recalls.html", NOTICES = EVIDENCE + "notices.html", KETTLES = EVIDENCE + "kettles.html";
const HOST = new URL(EVIDENCE).host, SOURCES = new Map([[HOST, "RecallCover demo regulator (evidence pages)"]]);
const KETTLE = "Brightway electric kettles", DRYER = "Halden H5 hair dryer", TOASTER = "Acme T9 two-slice toaster";
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
// A dropped connection while sending: send again only if the account's nonce did not move (nothing went out).
async function send(c, req) {
  for (let i = 0; ; i++) {
    const n = await rpc("eth_getTransactionCount", [c.account.address, "pending"]);
    try { return await c.writeContract(req); }
    catch (e) {
      if (i >= 5 || !/fetch failed|ECONNRESET|timed out|socket/i.test(String(e?.details ?? e?.message))) throw e;
      await new Promise((r) => setTimeout(r, 15000));
      if ((await rpc("eth_getTransactionCount", [c.account.address, "pending"])) !== n) throw e;
    }
  }
}
let stray = 0n;
const NONE = new Set(["NO_MAJORITY", "MAJORITY_DISAGREE"]);
async function tx(c, label, functionName, args, { value = 0n, payee } = {}) {
  for (let i = 0; ; i++) {
    const hash = await send(c, { address, functionName, args, value, fees: await fees(c, payee) });
    let r = await wait(c, hash);
    // NOT_VOTED / NO_MAJORITY can be an intermediate round (one such buy later finalized and ran on
    // Bradbury): wait for finality and retry only if it still applied nothing.
    if (r.txExecutionResultName === "NOT_VOTED" || NONE.has(r.resultName)) r = await wait(c, hash, "finalized");
    // NO_MAJORITY / MAJORITY_DISAGREE (e.g. the leader's LLM quoted text not on the page, which no
    // validator accepts): nothing was applied, whatever the leader returned.
    const res = NONE.has(r.resultName) ? r.resultName : r.txExecutionResultName;
    console.log(`${label}: ${hash} ${res}`);
    if (res !== "FINISHED_WITH_RETURN") stray += value;
    if ((res !== "NOT_VOTED" && !NONE.has(res)) || i >= 5) return { ...r, txExecutionResultName: res, hash };
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
const st = Number((await read("get_stakes", [-1, 0, 1])).total);
const pid = Number((await read("get_accounting")).payout_count);
const text = async (url) => (await fetch(url, { cache: "no-store" })).text();
check(!(await text(KETTLES)).includes("K200"), "the regulator's kettle page does not list the K200 yet");

// Sources: only approved hosts, approved only by the owner.
check(JSON.stringify(await read("get_sources")).includes(HOST), `${HOST} is the approved source`);
await fails("only the owner approves sources", c1, "approve a source as a buyer", "set_source", ["seller.cristhedev.com", "Seller"]);
await fails("a page on an unapproved host is refused", c0, "open a pool on the seller's own site", "open_pool", [KETTLE, ["K200", "K300"], KETTLES.replace(HOST, "seller.cristhedev.com"), PREMIUM, PAYOUT, 5, 1], { value: 5n * PAYOUT });
await fails("at most 4 models", c0, "open a pool for 5 models", "open_pool", [KETTLE, ["K100", "K200", "K300", "K400", "K500"], KETTLES, PREMIUM, PAYOUT, 5, 1], { value: 5n * PAYOUT });
await fails("models must differ", c0, "open a pool for K200 twice", "open_pool", [KETTLE, ["K200", "k200"], KETTLES, PREMIUM, PAYOUT, 5, 1], { value: 5n * PAYOUT });
await fails("a product the page already recalls cannot be covered", c0, "open a pool for the recalled toaster", "open_pool", [TOASTER, ["T9"], RECALLS, PREMIUM, PAYOUT, 5, 24], { value: 5n * PAYOUT });

// Hair dryer: one hour, backed by two underwriters.
await ok(c0, "open the hair-dryer pool (1 hour, 3 units)", "open_pool", [DRYER, ["H5"], NOTICES, PREMIUM, PAYOUT, 3, 1], { value: 3n * PAYOUT });
await fails("backing must be payout x units", c2, "back with less than payout", "back", [pool, 1], { value: PAYOUT - 1n });
await ok(c2, "back the hair-dryer pool with 1 unit", "back", [pool, 1], { value: PAYOUT });
await fails("a backer cannot buy", c2, "buy as a backer", "buy", [pool, 0, 1], { value: PREMIUM });
await ok(c1, "buy 1 hair-dryer policy", "buy", [pool, 0, 1], { value: PREMIUM });
await fails("backing is fixed once a policy is sold", c2, "back after a sale", "back", [pool, 1], { value: PAYOUT });
let p = await settled("get_pool", [pool], (x) => Number(x.sold) === 1);
check(Number(p.capacity) === 4 && Number(p.backers) === 2, "4 units from 2 backers");

// Kettles: K200 and K300 in one pool.
await fails("the collateral must be payout x units", c0, "open the kettle pool short of collateral", "open_pool", [KETTLE, ["K200", "K300"], KETTLES, PREMIUM, PAYOUT, 5, 1], { value: 4n * PAYOUT });
await ok(c0, "open the kettle pool (K200, K300; 1 hour)", "open_pool", [KETTLE, ["K200", "K300"], KETTLES, PREMIUM, PAYOUT, 5, 1], { value: 5n * PAYOUT });
const K = Number((await settled("get_pools", [0, 1], (x) => Number(x.total) > pool + 1)).total) - 1;
check(K > pool && (await read("get_pool", [K])).models.map((m) => m.name).join() === "K200,K300", `kettle pool is #${K}`);
await fails("a model that does not exist is refused", c1, "buy model 2", "buy", [K, 2, 1], { value: PREMIUM });
await fails("the premium must be premium x count", c1, "buy 2 K200 policies paying for 1", "buy", [K, 0, 2], { value: PREMIUM });
await ok(c1, "buy 2 K200 policies", "buy", [K, 0, 2], { value: 2n * PREMIUM });
await ok(c2, "buy 1 K300 policy", "buy", [K, 1, 1], { value: PREMIUM });
await fails("nothing is claimable while the page says nothing", c2, "claim while on", "claim", [pol + 1], { payee: b1 });
console.log("waiting for the regulator's page to announce the K200 recall…");
while (!(await text(KETTLES)).includes("K200")) await new Promise((r) => setTimeout(r, 15000));
const late = await ok(c2, "buy K200 after the recall is listed (reads the page, premium sent back)", "buy", [K, 0, 1], { value: PREMIUM, payee: b2 });
p = await settled("get_pool", [K], (x) => Number(x.recalled) === 1);
const [k2, k3] = p.models;
check(k2.recalled && !k3.recalled && p.status === "ON" && Number(p.sold) === 3 && (await text(KETTLES)).replace(/<[^>]+>|\s+/g, "").toLowerCase().includes(k2.quote.replace(/\s+/g, "").toLowerCase()), `K200 recalled, K300 still covered, quoted: “${k2.quote}”`);
await fails("K200 sales close once recalled", c2, "buy K200 again", "buy", [K, 0, 1], { value: PREMIUM });
await ok(c2, "buy 1 more K300 policy", "buy", [K, 1, 1], { value: PREMIUM });
const r1 = await ok(c2, "claim the K200 policy for 2 (anyone sends it)", "claim", [pol + 1], { payee: b1 });
await fails("a policy is claimed once", c2, "claim it again", "claim", [pol + 1], { payee: b1 });
await fails("a K300 policy is not claimable", c1, "claim the K300 policy", "claim", [pol + 2], { payee: b2 });
await fails("release is refused before the cover ends", c1, "release the kettle pool early", "release", [st + 2], { payee: uw });

// After the hour.
p = await read("get_pool", [K]);
const left = Number(p.ends_at) - now() + 60;
if (left > 0) { console.log(`waiting ${Math.ceil(left / 60)} min for the cover to end…`); await new Promise((r) => setTimeout(r, left * 1000)); }
const relK = await ok(c1, "release the kettle pool (final reading)", "release", [st + 2], { payee: uw });
p = await settled("get_pool", [K], (x) => x.status === "CLOSED");
check(Number(p.recalled) === 1 && BigInt((await read("get_stake", [st + 2])).amount) === 4n * PREMIUM + 3n * PAYOUT, "CLOSED; the underwriter gets the premiums and the collateral no K200 policy claims");
console.log("waiting for the hair-dryer page to be taken down…");
while ((await fetch(NOTICES, { cache: "no-store" })).status !== 404) await new Promise((r) => setTimeout(r, 15000));
await fails("no release without a final reading", c1, "release while the page is unavailable", "release", [st + 1], { payee: b2 });
check((await read("get_pool", [pool])).status === "ON", "still ON, collateral held");
console.log("waiting for the hair-dryer page to come back…");
while ((await fetch(NOTICES, { cache: "no-store" })).status !== 200) await new Promise((r) => setTimeout(r, 15000));
const relB = await ok(c1, "release the backer's share", "release", [st + 1], { payee: b2 });
await fails("a share is released once", c1, "release it again", "release", [st + 1], { payee: b2 });
const relU = await ok(c1, "release the underwriter's share", "release", [st], { payee: uw });
const free = PREMIUM + 4n * PAYOUT, share = free / 4n;

const ps = [];
for (let i = 0; i < 5; i++) ps.push(await settled("get_payout", [pid + i], (x) => !!x?.kind));
const want = [["returned", PREMIUM, b2], ["claim", 2n * PAYOUT, b1], ["release", 4n * PREMIUM + 3n * PAYOUT, uw], ["release", share, b2], ["release", free - share, uw]];
want.forEach(([kind, amount, to], i) => check(ps[i].kind === kind && BigInt(ps[i].amount) === amount && low(ps[i].to) === low(to), `payout ${pid + i}: ${kind} ${amount} to ${to.slice(0, 8)}`));
for (const [i, t] of [late, r1, relK, relB, relU].entries()) await settle(pid + i, t, fromBlock);
check(BigInt((await read("get_accounting")).unaccounted) === stray, `balance matches what the contract expects to hold (+${stray} from unexecuted or reverted txs)`);
console.log("contract", address, "pools", pool, K);
