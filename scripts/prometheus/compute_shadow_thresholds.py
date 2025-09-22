#!/usr/bin/env python3
import json, sys, os, csv, statistics
indir = sys.argv[1] if len(sys.argv) > 1 else "."
outpath = None
if "--out" in sys.argv:
    outpath = sys.argv[sys.argv.index("--out")+1]
def read_series_values(path):
    """query_range の結果 (result[].values) から時系列の数値リストを返す。シリーズごとに辞書で返却。"""
    if not os.path.exists(path): return {}
    with open(path) as f:
        j = json.load(f)
    series = {}
    for r in j.get("data", {}).get("result", []):
        metric = r.get("metric", {})
        key = (metric.get("env","unknown"), metric.get("field","dkcal"))  # dkcal系はfield無し→'dkcal'に寄せる
        vals=[]
        for ts, v in r.get("values", []):
            try:
                vals.append(float(v))
            except (TypeError, ValueError):
                pass
        if vals:
            series.setdefault(key, []).extend(vals)
    return series
def iqr_threshold(vals):
    if not vals or len(vals) < 4:
        return None
    vals = sorted(vals)
    q1 = statistics.quantiles(vals, n=4)[0]
    q3 = statistics.quantiles(vals, n=4)[2]
    med = statistics.median(vals); iqr = q3 - q1
    return med + 1.5*iqr, med, q1, q3
targets = [
    ("dkcal_p95","abs_kcal.json"),
    ("macros_p95","abs_macros.json"),
    ("rel_p95","rel.json"),
]
rows=[["metric","env","field","count","threshold_suggestion(median+1.5*IQR)","median","q1","q3","note"]]
for metric_name,file in targets:
    series_map = read_series_values(os.path.join(indir, file))
    if not series_map:
        rows.append([metric_name,"","","","","","","","no data"])
        continue
    for (env, field), vals in sorted(series_map.items()):
        thr = iqr_threshold(vals)
        if not thr:
            rows.append([metric_name, env, field, str(len(vals)), "", "", "", "", "no data"])
            continue
        t, med, q1, q3 = thr
        rows.append([metric_name, env, field, str(len(vals)), f"{t:.6g}", f"{med:.6g}", f"{q1:.6g}", f"{q3:.6g}", "demo only"])
if not outpath:
    outpath = os.path.join(indir, "baseline_summary_demo.csv")
os.makedirs(os.path.dirname(outpath), exist_ok=True)
with open(outpath,"w",newline="") as f: csv.writer(f).writerows(rows)
print(f"[compute] wrote {outpath}")