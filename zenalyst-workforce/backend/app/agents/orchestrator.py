"""
ZenForce — agents/orchestrator.py
Manager-Worker-Auditor Orchestrator

Coordination flow:
    User uploads dirty CSV
        │
        ▼
    ZenForce   (this file)    ← Manager
        │  spawns / streams
        ▼
    ZenRecon   (analyst.py)   ← Worker   (Gate 0 → 1 → 2)
        │  returns clean df
        ▼
    ZenVault   (auditor.py)   ← Auditor  (integrity check + report)
        │
        ▼
    FastAPI streams all thought-signatures to Streamlit UI

Hand-off protocol
-----------------
1. ZenForce receives raw bytes (CSV upload) and writes them to a temp path.
2. ZenForce calls `run_zenrecon(df)` — a generator.  It proxies every
   string yield straight to the caller so the UI can display them live.
3. When ZenRecon yields a DataFrame instead of a string, ZenForce captures
   it as `clean_df` and stops proxying.
4. ZenForce calls `run_zenveault(clean_df, original_df)` — same pattern.
5. ZenForce yields a final JSON summary as the last event.
"""

from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path
from typing import AsyncGenerator, Generator

import pandas as pd
from groq import Groq

# Sibling agents
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from analyst import run_zenrecon  # noqa: E402

# ---------------------------------------------------------------------------
# Groq client (ZenForce uses the LLM only for its coordination commentary)
# ---------------------------------------------------------------------------
_client = Groq()
_MODEL  = "llama-3.3-70b-versatile"

_ORCHESTRATOR_SYSTEM = """
You are ZenForce, an AI Orchestrator for a financial data reconciliation system.
Your workers are:
  • ZenRecon  — cleans, normalizes, and deduplicates financial CSVs
  • ZenVault  — audits results and generates integrity reports

When asked for a coordination plan, respond concisely in 3 bullet points.
Do NOT perform any math or data analysis yourself.
"""


# ---------------------------------------------------------------------------
# Lightweight ZenVault stub (auditor.py wires in when complete)
# ---------------------------------------------------------------------------
def _run_zenveault_stub(
    clean_df: pd.DataFrame,
    original_df: pd.DataFrame,
) -> Generator[str, None, None]:
    """
    Minimal inline auditor so the orchestrator works without auditor.py.
    Replace this with `from auditor import run_zenveault` once auditor.py exists.
    """
    yield "🔐 ZenVault :: Beginning integrity audit…"

    original_rows   = len(original_df)
    cleaned_rows    = len(clean_df)
    duplicates_removed = original_rows - cleaned_rows
    null_check      = int(clean_df.isnull().sum().sum())
    has_composite   = "CompositeKey" in clean_df.columns

    audit = {
        "original_row_count"    : original_rows,
        "clean_row_count"       : cleaned_rows,
        "duplicates_removed"    : duplicates_removed,
        "residual_nulls"        : null_check,
        "composite_key_present" : has_composite,
        "integrity_status"      : "PASS" if (has_composite and null_check == 0) else "WARN",
    }

    yield (
        f"📋 ZenVault :: Audit Report\n"
        f"```json\n{json.dumps(audit, indent=2)}\n```"
    )

    if audit["integrity_status"] == "PASS":
        yield "✅ ZenVault :: Integrity check PASSED. Dataset is reconciliation-ready."
    else:
        yield (
            "⚠️  ZenVault :: Integrity check WARNING — "
            f"residual nulls={null_check}, composite_key={has_composite}. "
            "Manual review recommended."
        )

    yield audit  # type: ignore[misc]   # final structured yield


# ---------------------------------------------------------------------------
# Core orchestration generator
# ---------------------------------------------------------------------------
def run_zenforce(
    csv_bytes: bytes,
    filename: str = "upload.csv",
) -> Generator[str | dict, None, None]:
    """
    Main entry point called by FastAPI.
    Yields str (thought signatures) and, as the very last item, a dict summary.

    Usage in FastAPI (SSE):
        async for event in _asyncify(run_zenforce(csv_bytes)):
            yield f"data: {event}\\n\\n"
    """

    session_id = f"ZF-{int(time.time())}"
    yield f"🚀 ZenForce [{session_id}] :: Workforce activated. Processing `{filename}`…"

    # ── 1. Parse CSV ─────────────────────────────────────────────────────────
    yield "📂 ZenForce :: Reading CSV into memory…"
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            tmp.write(csv_bytes)
            tmp_path = tmp.name

        original_df = pd.read_csv(tmp_path, low_memory=False)
        Path(tmp_path).unlink(missing_ok=True)
    except Exception as exc:
        yield f"❌ ZenForce :: CSV parsing failed — {exc}"
        return

    yield (
        f"✅ ZenForce :: CSV loaded. "
        f"Shape={original_df.shape}, Columns={original_df.columns.tolist()}"
    )

    # ── 2. Ask LLM for a coordination plan (optional commentary) ─────────────
    yield "🧠 ZenForce :: Drafting coordination plan with LLM…"
    try:
        plan_resp = _client.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": _ORCHESTRATOR_SYSTEM},
                {
                    "role": "user",
                    "content": (
                        f"Dataset `{filename}` has columns: {original_df.columns.tolist()} "
                        f"and {len(original_df)} rows. "
                        "Give me a 3-bullet coordination plan for ZenRecon → ZenVault."
                    ),
                },
            ],
            temperature=0.2,
            max_tokens=300,
        )
        plan_text = plan_resp.choices[0].message.content.strip()
        yield f"📋 ZenForce :: Coordination Plan:\n{plan_text}"
    except Exception as exc:
        yield f"⚠️  ZenForce :: LLM plan skipped ({exc}). Proceeding with default workflow."

    # ── 3. Hand-off → ZenRecon ───────────────────────────────────────────────
    yield "➡️  ZenForce :: Handing off to ZenRecon…"

    clean_df: pd.DataFrame | None = None

    for event in run_zenrecon(original_df.copy()):
        if isinstance(event, pd.DataFrame):
            clean_df = event          # capture the worker's output
        else:
            yield event               # proxy every thought to the UI

    if clean_df is None:
        yield "❌ ZenForce :: ZenRecon did not return a clean DataFrame. Aborting."
        return

    yield f"✅ ZenForce :: ZenRecon complete. Received clean dataset ({len(clean_df)} rows)."

    # ── 4. Hand-off → ZenVault ───────────────────────────────────────────────
    yield "➡️  ZenForce :: Handing off to ZenVault…"

    audit_result: dict | None = None

    # Swap stub for real auditor once auditor.py is ready:
    # from auditor import run_zenveault
    # for event in run_zenveault(clean_df, original_df):
    for event in _run_zenveault_stub(clean_df, original_df):
        if isinstance(event, dict):
            audit_result = event
        else:
            yield event

    # ── 5. Final summary ─────────────────────────────────────────────────────
    summary = {
        "session_id"        : session_id,
        "filename"          : filename,
        "original_rows"     : len(original_df),
        "clean_rows"        : len(clean_df),
        "duplicates_removed": len(original_df) - len(clean_df),
        "audit"             : audit_result,
        "clean_df_json"     : clean_df.to_json(orient="records", date_format="iso"),
    }

    yield f"🏆 ZenForce [{session_id}] :: Reconciliation complete."
    yield summary   # ← FastAPI serialises this as the terminal SSE event