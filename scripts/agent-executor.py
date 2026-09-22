#!/usr/bin/env python3
"""algal --executor-cmd adapter: serves agent/classifier/gate cells through a
local coding-agent CLI (claude -p by default; AGENT_CMD env overrides).

Protocol (src/effects.ts commandExecutor): the EffectRequest arrives on stdin
as JSON {cellId, kind, prompt, context, output, questions?}; the bound output
value goes to stdout — a bare JSON value matching output.kind:
  text   -> "..."        json -> {...} | [...]        choice -> "label"
  decide -> {"answers": {qname: {noul: x} | {choice: "...", confidence: x}}}
"""
import json, os, re, subprocess, sys

AGENT_CMD = os.environ.get("AGENT_CMD", "claude -p --model claude-haiku-4-5")

def build_prompt(req):
    kind = req["kind"]
    out = req.get("output", {})
    head = (
        "You are one cell inside an ALGAL organism — a bounded, replayable "
        "workflow. Answer ONLY with the output value, no prose, no markdown "
        "fences, no explanation.\n\n"
        f"Cell: {req['cellId']}  (kind={kind})\n"
        f"Task: {req.get('prompt','')}\n"
        f"Context (JSON): {json.dumps(req.get('context', {}))}\n"
    )
    if kind == "decide":
        qs = req.get("questions", {})
        spec = {q: v for q, v in qs.items()}
        return head + (
            f"\nAnswer each declared question. Return ONLY a JSON object "
            f"{{\"answers\": {{...}}}} where each key is a question name and "
            f"the value matches its type: noul -> {{\"noul\": <0..1>}}; "
            f"choice -> {{\"choice\": <one of labels>, \"confidence\": <0..1>}}.\n"
            f"Questions: {json.dumps(spec)}"
        )
    if out.get("kind") == "json":
        return head + f"\nReturn ONLY a JSON value matching schema: {json.dumps(out.get('schema', {}))}"
    if out.get("kind") == "choice":
        return head + f"\nReturn ONLY one of these labels verbatim: {json.dumps(out.get('labels', []))}"
    return head + "\nReturn ONLY a plain text value."

def extract(text, kind):
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.S).strip()
    if kind == "decide" or kind == "json":
        # first balanced JSON value in the text
        for i, ch in enumerate(t):
            if ch in "{[":
                try:
                    v, _ = json.JSONDecoder().raw_decode(t[i:])
                    return v
                except json.JSONDecodeError:
                    continue
        raise SystemExit(f"executor: no JSON in model output: {t[:200]}")
    if kind == "choice":
        return t.split()[0].strip('"`.,') if t else ""
    return t

def main():
    req = json.load(sys.stdin)
    out_kind = "json" if req["kind"] == "decide" else req.get("output", {}).get("kind", "text")
    p = subprocess.run(
        AGENT_CMD.split() + [build_prompt(req)],
        capture_output=True, text=True, timeout=300,
    )
    if p.returncode != 0:
        print(p.stderr[:400], file=sys.stderr)
        raise SystemExit(f"executor: agent exited {p.returncode}")
    val = extract(p.stdout, req["kind"] if req["kind"] == "decide" else out_kind)
    print(json.dumps(val))

if __name__ == "__main__":
    main()
