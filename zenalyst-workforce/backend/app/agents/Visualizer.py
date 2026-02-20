"""
ZenView — agents/visualizer.py
Deterministic Visualization Agent

Workflow:
  1. Inspect the clean DataFrame (columns, dtypes, numeric ranges)
  2. Ask LLM to write matplotlib/seaborn code suited to the data
  3. Execute the code via safe_exec_viz() — plt & sns pre-injected,
     NO import statements in generated code
  4. Yield thought signatures + final plot path

Priority charts (per Zenalyst design brief):
  - Wealth Distribution Pie Chart  (if category + amount columns exist)
  - Expected Returns vs Avenue Bar Chart  (if return/amount per category)
  - Spend / Transaction Timeline  (if date column present)
  - Correlation Heatmap  (if 3+ numeric columns)
"""

from __future__ import annotations

import json
import os
import re
from typing import Generator

import pandas as pd
from groq import Groq

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
from app.tools.executor import safe_exec_viz  # noqa: E402

_client = Groq()
_MODEL  = "llama-3.3-70b-versatile"

_SYSTEM_PROMPT = """
You are ZenView, a deterministic financial visualization agent.
Your ONLY job is to write Python visualization code using `plt` and `sns`.

STRICT RULES — violating any of these will crash the system:
1. NEVER write any `import` statement. `plt`, `sns`, `pd`, `np`, and `df` are
   already available in your execution namespace.
2. ALWAYS save the final figure with: `plt.savefig(SAVE_PATH, bbox_inches='tight', dpi=150)`
3. NEVER call `plt.show()`. It will hang the server.
4. Use ONLY the column names provided. Do NOT invent column names.
5. Return ONLY a single ```python ... ``` code block — nothing else.
6. Figure size must be set with `plt.figure(figsize=(12, 6))` or equivalent.
7. All text, titles, and labels must be explicit strings — no f-string math.
8. Prioritize in this order:
   a. Pie chart of total Amount/Value by Category/Avenue/Vendor
   b. Bar chart of Amount by Category sorted descending
   c. Line chart of Amount over Date if date column is present
   d. Heatmap if 3+ numeric columns
"""


def _build_prompt(df: pd.DataFrame) -> str:
    """Build a fully grounded prompt from actual DataFrame metadata."""
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    cat_cols     = df.select_dtypes(include=["object", "category"]).columns.tolist()
    date_cols    = [c for c in df.columns if "date" in c.lower() or "time" in c.lower()]

    # Safe numeric summary — LLM sees real ranges, not guesses
    num_summary = {}
    for col in numeric_cols[:4]:
        num_summary[col] = {
            "min":  round(float(df[col].min()), 2),
            "max":  round(float(df[col].max()), 2),
            "sum":  round(float(df[col].sum()), 2),
            "mean": round(float(df[col].mean()), 2),
        }

    # Categorical value counts (top 8)
    cat_summary = {}
    for col in cat_cols[:3]:
        cat_summary[col] = df[col].value_counts().head(8).to_dict()

    return f"""
The DataFrame `df` is now clean and available.

Columns     : {df.columns.tolist()}
Numeric cols: {numeric_cols}
Categorical : {cat_cols}
Date cols   : {date_cols}
Row count   : {len(df)}

Numeric summary (real values — use these, never hardcode numbers):
{json.dumps(num_summary, indent=2)}

Category value counts (real values):
{json.dumps(cat_summary, indent=2, default=str)}

SAVE_PATH is already defined as an absolute path — use it directly.

Your task:
Write professional matplotlib/seaborn visualization code following the priority
order in your system prompt. Create the BEST chart that tells a financial story.
For pie/bar charts use the aggregated group sums from df.groupby().
The chart must have a clear title, axis labels, and a legend if applicable.
Return ONLY the ```python block.
"""


def _extract_code(response: str) -> str:
    match = re.search(r"```python\s*(.*?)```", response, re.DOTALL)
    if not match:
        raise ValueError(
            f"ZenView: LLM did not return a ```python block.\n"
            f"Raw (first 400 chars):\n{response[:400]}"
        )
    return match.group(1).strip()


def _sanitize_code(code: str) -> str:
    """
    Strip any import statements the LLM might have snuck in.
    safe_exec_viz already pre-injects plt/sns, so imports would error anyway,
    but we strip them proactively for a clean execution.
    """
    lines = []
    for line in code.splitlines():
        stripped = line.strip()
        if stripped.startswith("import ") or stripped.startswith("from "):
            lines.append(f"# [ZenSandbox stripped] {line}")
        else:
            lines.append(line)
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
def run_zenview(
    df: pd.DataFrame,
    output_path: str | None = None,
) -> Generator[str | dict, None, None]:
    """
    Main entry point — yields thought signatures then a result dict.

    Final yield: dict with keys: success, plot_path, error
    """

    yield "🎨 ZenView :: Visualization agent activated."
    yield f"🔎 ZenView :: Analysing DataFrame — {len(df)} rows, {len(df.columns)} columns."

    # Guard: need at least one numeric column to plot
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    if not numeric_cols:
        yield "⚠️  ZenView :: No numeric columns found — cannot generate chart."
        yield {"success": False, "plot_path": None, "error": "No numeric columns"}
        return

    yield "🧠 ZenView :: Requesting visualization code from LLM (temperature=0)…"

    prompt = _build_prompt(df)

    try:
        chat = _client.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.0,
            max_tokens=1200,
        )
        llm_response = chat.choices[0].message.content
    except Exception as exc:
        yield f"❌ ZenView :: Groq call failed — {exc}"
        yield {"success": False, "plot_path": None, "error": str(exc)}
        return

    yield f"📝 ZenView :: LLM returned code:\n```python\n{llm_response[:1000]}\n```"

    try:
        raw_code = _extract_code(llm_response)
    except ValueError as exc:
        yield str(exc)
        yield {"success": False, "plot_path": None, "error": str(exc)}
        return

    clean_code = _sanitize_code(raw_code)
    yield "🔧 ZenView :: Executing visualization code (sandbox — no imports allowed)…"

    success, exec_output, plot_path = safe_exec_viz(clean_code, df=df, output_path=output_path)

    if exec_output:
        yield f"📋 ZenView :: Execution log:\n```\n{exec_output}\n```"

    if success and plot_path:
        yield f"✅ ZenView :: Chart saved → `{plot_path}`"
        yield {"success": True, "plot_path": plot_path, "error": None}
    else:
        yield "❌ ZenView :: Visualization failed. Check execution log above."
        yield {"success": False, "plot_path": None, "error": exec_output}