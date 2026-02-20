"""
ZenRecon — agents/analyst.py
Deterministic Data Analyst Agent

Pipeline (ML Lifecycle):
    Gate 0  →  EDA  (shape, head, info, isnull, describe, duplicated, corr)
    Gate 1  →  LLM writes cleaning code → safe_exec() runs it → CompositeKey created
    Gate 2  →  drop_duplicates(subset=['CompositeKey'])

The LLM never does math. It writes code. The executor runs the code.
Every "thought" is yielded so the Streamlit UI can stream it live.
"""

from __future__ import annotations

import json
import re
from typing import Generator

import pandas as pd
from groq import Groq

# Local safe executor
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
from app.tools.executor import safe_exec, run_eda  # noqa: E402

# ---------------------------------------------------------------------------
# Groq client – key must be set via GROQ_API_KEY env var
# ---------------------------------------------------------------------------
_client = Groq()
_MODEL = "llama-3.3-70b-versatile"

# ---------------------------------------------------------------------------
# System prompt that enforces determinism
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = """
You are ZenRecon, a deterministic financial data cleaning agent.
Your ONLY job is to write Python / Pandas code that transforms a DataFrame called `df`.

STRICT RULES:
1. NEVER compute arithmetic yourself. Write Pandas/Python code that does it.
2. ALWAYS produce a `CompositeKey` column by the end of Gate 1.
   The CompositeKey must be a string concatenation of:
       Date_normalized (YYYY-MM-DD string)  +  "|"  +
       Amount_normalized (2-decimal-place string)  +  "|"  +
       Vendor_Slug (lowercase, stripped, spaces→underscore)
3. Return ONLY executable Python code inside a single ```python ... ``` block.
4. Do NOT include explanations outside the code block.
5. Store the final DataFrame back into the variable named `df`.
6. Never import anything other than pandas (already imported as `pd`) and
   re / unicodedata (safe stdlib modules).
"""

# ---------------------------------------------------------------------------
# Helper — extract first ```python block from LLM response
# ---------------------------------------------------------------------------
def _extract_code(llm_response: str) -> str:
    """Pull the first python fenced code block from the LLM output."""
    pattern = r"```python\s*(.*?)```"
    match = re.search(pattern, llm_response, re.DOTALL)
    if not match:
        raise ValueError(
            f"ZenRecon: LLM did not return a ```python block.\n"
            f"Raw response:\n{llm_response[:500]}"
        )
    return match.group(1).strip()


# ---------------------------------------------------------------------------
# Gate 1 prompt builder
# ---------------------------------------------------------------------------
def _build_gate1_prompt(eda_report: dict, columns: list[str]) -> str:
    return f"""
The DataFrame `df` has columns: {columns}

EDA Report (Gate 0 findings):
- Shape        : {eda_report.get('shape')}
- Null Counts  : {eda_report.get('nulls')}
- Dtypes / Info:
{eda_report.get('info', 'N/A')[:800]}
- Sample (head):
{eda_report.get('head', 'N/A')[:600]}

Your task (Gate 1 — Transformation):
Write Python / Pandas code that:
1. Drops rows where both the date AND amount columns are null.
2. Fills remaining nulls in the vendor/description column with "UNKNOWN".
3. Normalises the date column to datetime then formats as YYYY-MM-DD string → `Date_norm`.
4. Normalises the amount column to float, rounds to 2 decimal places,
   formats as a string with 2 decimal places → `Amount_norm`.
5. Creates `Vendor_Slug`: lowercase the vendor/description column,
   strip whitespace, replace spaces with underscores, remove non-alphanumeric chars
   (keep underscores).
6. Creates `CompositeKey` = Date_norm + "|" + Amount_norm + "|" + Vendor_Slug.
7. Stores the final result back in `df`.

Infer which columns map to Date, Amount, and Vendor from the column names and EDA.
Return ONLY the ```python code block.
"""


# ---------------------------------------------------------------------------
# Main agent entry point — yields thought signatures (strings)
# ---------------------------------------------------------------------------
def run_zenrecon(
    df: pd.DataFrame,
) -> Generator[str | pd.DataFrame, None, None]:
    """
    Stateful generator that processes `df` through Gate 0 → 1 → 2.

    Yields:
        str          — thought signatures (displayed in UI)
        pd.DataFrame — final clean DataFrame (last yield)
    """

    # ── Gate 0 ──────────────────────────────────────────────────────────────
    yield "⚙️  ZenRecon :: Gate 0 — Initiating EDA audit…"

    success, eda_output, eda_report = run_eda(df)

    if not success:
        yield f"❌ ZenRecon :: Gate 0 FAILED\n{eda_output}"
        return

    yield f"📊 ZenRecon :: Gate 0 — EDA Complete\n```\n{eda_output}\n```"

    # ── Gate 1 ──────────────────────────────────────────────────────────────
    yield "🧠 ZenRecon :: Gate 1 — Requesting cleaning code from LLM…"

    gate1_prompt = _build_gate1_prompt(eda_report, df.columns.tolist())

    try:
        chat = _client.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user",   "content": gate1_prompt},
            ],
            temperature=0.0,  # deterministic
            max_tokens=1500,
        )
        llm_response = chat.choices[0].message.content
    except Exception as exc:
        yield f"❌ ZenRecon :: Groq call failed — {exc}"
        return

    yield f"📝 ZenRecon :: Gate 1 — LLM returned code:\n```python\n{llm_response[:1200]}\n```"

    try:
        cleaning_code = _extract_code(llm_response)
    except ValueError as exc:
        yield str(exc)
        return

    yield "🔧 ZenRecon :: Gate 1 — Executing cleaning code…"

    success, exec_output, cleaned_df = safe_exec(cleaning_code, df=df)

    if not success:
        yield f"❌ ZenRecon :: Gate 1 execution failed:\n```\n{exec_output}\n```"
        return

    if not isinstance(cleaned_df, pd.DataFrame):
        yield "❌ ZenRecon :: Gate 1 — Executor did not return a DataFrame. Aborting."
        return

    if "CompositeKey" not in cleaned_df.columns:
        yield (
            "❌ ZenRecon :: Gate 1 — `CompositeKey` column missing from output. "
            "The LLM code did not follow the contract. Aborting."
        )
        return

    yield (
        f"✅ ZenRecon :: Gate 1 — Cleaning complete.\n"
        f"   Rows after clean : {len(cleaned_df)}\n"
        f"   Columns          : {cleaned_df.columns.tolist()}\n"
        f"   Sample CompositeKeys:\n{cleaned_df['CompositeKey'].head(3).to_string()}"
    )
    if exec_output:
        yield f"📋 ZenRecon :: Gate 1 stdout:\n```\n{exec_output}\n```"

    # ── Gate 2 ──────────────────────────────────────────────────────────────
    yield "🔍 ZenRecon :: Gate 2 — Running CompositeKey deduplication…"

    dedup_code = """
before = len(df)
df = df.drop_duplicates(subset=['CompositeKey'])
after  = len(df)
removed = before - after
print(f"[Gate 2] Rows before dedup : {before}")
print(f"[Gate 2] Rows after  dedup : {after}")
print(f"[Gate 2] Duplicates removed: {removed}")
_result = df
"""

    success, dedup_output, final_df = safe_exec(dedup_code, df=cleaned_df)

    if not success:
        yield f"❌ ZenRecon :: Gate 2 FAILED:\n```\n{dedup_output}\n```"
        return

    yield (
        f"✅ ZenRecon :: Gate 2 — Deduplication complete.\n"
        f"```\n{dedup_output}\n```"
    )

    yield f"🏁 ZenRecon :: Pipeline finished. Final row count: {len(final_df)}"

    # Last yield — the clean DataFrame consumed by ZenForce / ZenVault
    yield final_df