// Asserts which RecallCover app controls appear per role, pool state and time, and that GEN amounts are exact
// (run: node app/check-actions.mjs app/index.html).
import { readFileSync } from "node:fs";
const html = readFileSync(process.argv[2], "utf8");
const js = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const body = js.slice(js.indexOf("function actions"), js.indexOf("async function show"));
// gen / toWei come straight from gl.js (which imports the browser bundle, so it is not loaded whole).
const gl = readFileSync(new URL("./gl.js", import.meta.url), "utf8");
const pick = (name) => gl.slice(gl.indexOf(`export const ${name} =`), gl.indexOf("\n};\n", gl.indexOf(`export const ${name} =`)) + 3).replace("export ", "");
const { gen, toWei } = new Function(`${pick("gen")}\n${pick("toWei")}\nreturn { gen, toWei };`)();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const line = (name) => js.match(new RegExp(`const ${name} = .*;`))[0];
const make = new Function("esc", "gen", "B", "short", "EXPLORER", "ctx", `let me = ctx.me; const when = (t) => String(t); ${line("addr")} ${line("plural")} ${line("share")} ${body}; return { actions, reading };`);
const U = "0xUnderwriter", BK = "0xBacker", NOW = 1000, PREM = 2n * 10n ** 14n, PAY = 10n ** 15n;
const M = (name, o = {}) => ({ name, sold: 0, claimed: 0, recalled: false, quote: "", ...o });
const pool = { id: 0, underwriter: U, product: "Kettles", status: "ON", ends_at: NOW + 100, premium: PREM, payout: PAY, capacity: 5, sold: 3, claimed: 0, recalled: 0, backers: 2, released: 0, paid: 0n, free: 3n * PREM + 3n * PAY,
  models: [M("K200", { sold: 3 }), M("K300")] };
const pol = (id, o = {}) => ({ id, holder: "0xHolder", count: 2, model: 0, status: "HELD", ...o });
const stk = [{ id: 0, backer: U, units: 4, released: false }, { id: 1, backer: BK, units: 1, released: false }];
const rec = { recalled: 1, models: [M("K200", { sold: 3, recalled: true, quote: "K200 recalled" }), M("K300")] };
const fns = (me) => make(esc, gen, BigInt, (a) => a, "x", { me });
const run = (me, p = {}, policies = [pol(0), pol(1, { count: 1 })], recov = 0, now = NOW, stakes = stk) => fns(me).actions({ ...pool, ...p }, policies, stakes, recov, now);
const count = (s, x) => s.split(x).length - 1;
const check = (name, ok) => { console.log(ok ? "ok  " : "FAIL", name); if (!ok) process.exitCode = 1; };

check("no wallet: prompt only", run(null).includes("Connect a wallet") && !run(null).includes("form"));
check("buyers buy before the end, capped by policies left, per model", run("0xB").includes('data-form="buy"') && run("0xB").includes('max="2"') && run("0xB").includes("2 left") && count(run("0xB"), "<option") === 2);
check("no buying: any backer (any case), sold out, ended", !run("0xunderwriter").includes('data-form="buy"') && !run("0xbacker").includes('data-form="buy"') && !run("0xB", { sold: 5 }).includes('data-form="buy"') && !run("0xB", {}, [], 0, NOW + 100).includes('data-form="buy"'));
check("a recalled model is not offered", count(run("0xB", rec), "<option") === 1 && run("0xB", rec).includes(">K300<") && !run("0xB", rec).includes(">K200<"));
check("backing only before the first sale and any recall", !run("0xB").includes('data-form="back"') && run("0xB", { sold: 0, models: [M("K200"), M("K300")] }).includes('data-form="back"') && !run("0xB", { sold: 0, recalled: 1 }).includes('data-form="back"') && !run("0xB", { sold: 0 }, [], 0, NOW + 100).includes('data-form="back"'));
check("anyone reads the page while covering, not after the end", run("0xB").includes('data-form="check"') && !run("0xB", {}, [], 0, NOW + 100).includes('data-form="check"'));
check("release: one per unreleased stake, only after the end (or all recalled)", !run("0xB").includes('data-form="release"') && count(run("0xB", {}, [], 0, NOW + 100), 'data-form="release"') === 2
  && count(run("0xB", { recalled: 2, models: [M("K200", { recalled: true }), M("K300", { recalled: true })] }), 'data-form="release"') === 2
  && count(run("0xB", {}, [], 0, NOW + 100, [stk[0], { ...stk[1], released: true }]), 'data-form="release"') === 1);
check("closed: pro-rata share, the last one the remainder", run("0xB", { status: "CLOSED" }, [], 0, NOW + 100).includes(`gets ${gen((3n * PREM + 3n * PAY) * 4n / 5n)} GEN`)
  && run("0xB", { status: "CLOSED", released: 1, paid: 7n }, [], 0, NOW + 100, [stk[0], { ...stk[1], released: true }]).includes(`gets ${gen(3n * PREM + 3n * PAY - 7n)} GEN`));
check("nothing to claim while no model is recalled", !run("0xB").includes('data-form="claim"'));
check("recalled model: one claim per held policy on it, exact amount", count(run("0xB", rec), 'data-form="claim"') === 2 && run("0xB", rec).includes("Pay 0.002 GEN") && run("0xB", rec).includes("Pay 0.001 GEN"));
check("policies on a covered model take no claim", count(run("0xB", rec, [pol(0), pol(1, { model: 1 })]), 'data-form="claim"') === 1);
check("claimed policies take no button", count(run("0xB", rec, [pol(0, { status: "CLAIMED" }), pol(1)]), 'data-form="claim"') === 1);
check("recover only with a failed transfer", run("0xB", {}, [], 5n).includes('data-form="recover"') && !run("0xB", {}, [], 0n).includes("recover"));
check("holder addresses and model names are escaped", !run("0xB", rec, [pol(0, { holder: "<img src=x>" })]).includes("<img") && !run("0xB", { models: [M("<b>x"), M("K300")] }).includes("<b>x"));
const r = fns("0xB").reading;
check("reading: quote shown and escaped", r({ answer: "recalled", model: "K200", quote: "<b>off</b>", by: "0xB", at: 1 }).includes("&lt;b&gt;off") && !r({ answer: "none", quote: "", by: "0xB", at: 1 }).includes("“"));

// Money: exact in both directions, no floating point.
check("exact amounts", gen(10n ** 14n) === "0.0001" && gen(1) === "0.000000000000000001" && gen(0) === "0");
check("amounts past 2^53 stay exact", gen(9007199254740993n) === "0.009007199254740993" && toWei("0.009007199254740993") === 9007199254740993n);
