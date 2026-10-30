"""Checks every stored answer in a bank file by running the code in CPython.
usage: python -I verify.py <bank.json> [<bank.json> ...]"""
import io, json, sys, contextlib, traceback

def run(code, stdin=""):
    out = io.StringIO()
    sys.stdin = io.StringIO(stdin)
    try:
        with contextlib.redirect_stdout(out):
            exec(code, {})
        err = None
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
    return out.getvalue().rstrip("\n"), err

def same(a, b): return a.rstrip("\n") == b.rstrip("\n")

def check(q):
    p, t, code = q["payload"], q["type"], q["code"]
    bad = []
    if None in q["kps"]: bad.append("unknown kp key")
    def expect(src, target, what, stdin=""):
        o, e = run(src, stdin)
        if e or not same(o, target): bad.append(f"{what}: got {o!r} {e or ''} want {target!r}")
    if t == "predict": expect(code, p["expected"], "code")
    if t == "explain" and "printed" in p: expect(code, p["printed"], "printed")
    if t == "happens":
        o, e = run(code)
        if p.get("real") and e != p["real"]: bad.append(f"error {e!r} != {p['real']!r}")
    if t == "same":
        for c, o in zip((p["codeA"], p["codeB"]), p["outputs"]): expect(c, o, "same")
        if (p["outputs"][0] == p["outputs"][1]) != (p["answer"] == "Same"): bad.append("same answer")
    if t in ("mystery", "fix", "write", "parsons", "faded", "grow") and "sample" in p:
        target = p["tiers"][-1]["expected"] if t == "grow" else p["target"]
        expect(p["sample"], target, "sample")
        for r in p.get("require", []):
            if r not in p["sample"]: bad.append(f"sample lacks {r!r}")
        for r in p.get("forbid", []):
            if r in p["sample"]: bad.append(f"sample has forbidden {r!r}")
    if t == "fill": expect(code.replace("____", p["sample"]), p["target"], "fill")
    if t == "parsons" and sorted(p["sample"].split("\n")) != sorted(p["items"]): bad.append("parsons sample != items")
    if t == "diverge":
        for s in p["samples"]: expect(s, p["target"], "diverge")
    if t == "path2": expect(code, p["output"], "path2")
    if t == "path":
        label = {b["id"]: b["label"] for b in p["branches"]}
        for c in p["cases"]:
            want = eval(label[c["answer"]][6:-1])
            expect(code, want, f"path input {c['input']}", c["input"] + "\n")
    if t == "cover":
        outs = [run(code, v + "\n")[0] for v in p["sample"]]
        if sorted(outs) != sorted(b["output"] for b in p["branches"]): bad.append(f"cover sample hits {outs}")
    if t == "sort":
        vals = {k: eval(k) for k in p["pieces"]}
        for k, v in vals.items():
            if str(v) != p["results"][k]: bad.append(f"sort {k} = {v}")
        if sorted(p["pieces"], key=vals.get) != p["answer"]: bad.append("sort order")
    if t == "guess":
        pr = p["probe"]
        f = lambda src, x: run(f"{pr['var']} = {x}\n" + src)[0]
        xs = range(pr["min"], pr["max"] + 1)
        hidden = [f(pr["hidden_code"], x) for x in xs]
        for o in p["options"]:
            got = [f(o["text"], x) for x in xs]
            if o.get("correct") and got != hidden: bad.append("correct option differs")
            if not o.get("correct") and got == hidden: bad.append(f"distractor {o['text']} identical to hidden")
    return bad

total = fails = 0
for path in sys.argv[1:]:
    for q in json.load(open(path, encoding="utf8"))["questions"]:
        total += 1
        try: b = check(q)
        except Exception: b = [traceback.format_exc(limit=1)]
        if b:
            fails += 1
            print(q["id"], b)
print(f"checked {total}, failed {fails}")
