"""
FastAPI entry point — app/main.py  (v3)

Changes vs v2:
  - /ask now has a TWO-PHASE pipeline:
      Phase 1: ZenCode — LLM writes pandas code → safe_exec() runs it
      Phase 2: ZenChat — LLM answers using computed result as grounded context
  - _build_zenwatch_context() is leaner (avoids context overflow on large DFs)
  - Computational questions (duplicates, counts, sums, averages) now work correctly
  - Tighter error handling with specific failure messages instead of generic "Question failed"
"""

from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()

import asyncio
import json
import os
import re
import textwrap
from concurrent.futures import ThreadPoolExecutor
from typing import AsyncGenerator

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

import pandas as pd
from groq import Groq

from app.agents.orchestrator import run_zenforce
from app.agents.Visualizer   import run_zenview
from app.tools.executor      import safe_exec          # ← reused for /ask

app = FastAPI(title="Zenalyst Deterministic Workforce", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_executor = ThreadPoolExecutor(max_workers=4)
_groq     = Groq()
_MODEL    = "llama-3.3-70b-versatile"

# ── In-memory session store ───────────────────────────────────────────────────
_SESSION: dict = {
    "clean_df":      None,
    "audit_trail":   [],
    "audit_summary": {},
    "original_rows": 0,
    "filename":      "",
}


# ─────────────────────────────────────────────────────────────────────────────
# /reconcile  — unchanged from v2
# ─────────────────────────────────────────────────────────────────────────────
async def _stream_reconcile(csv_bytes: bytes, filename: str):
    def _run():
        return list(run_zenforce(csv_bytes, filename))

    events = await asyncio.get_event_loop().run_in_executor(_executor, _run)

    thoughts: list[str] = []
    for event in events:
        if isinstance(event, dict):
            _SESSION["audit_summary"]  = event.get("audit", {})
            _SESSION["original_rows"]  = event.get("original_rows", 0)
            _SESSION["filename"]       = filename
            _SESSION["audit_trail"]    = thoughts[:]

            if "clean_df_json" in event:
                _SESSION["clean_df"] = pd.read_json(
                    event["clean_df_json"], orient="records"
                )
                event.pop("clean_df_json")

            payload = json.dumps({"type": "summary", "data": event})
        else:
            thoughts.append(str(event))
            payload = json.dumps({"type": "thought", "data": str(event)})

        yield f"data: {payload}\n\n"

    yield "data: [DONE]\n\n"


@app.post("/reconcile")
async def reconcile(file: UploadFile = File(...)):
    csv_bytes = await file.read()
    return StreamingResponse(
        _stream_reconcile(csv_bytes, file.filename or "upload.csv"),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# /visualize  — unchanged from v2
# ─────────────────────────────────────────────────────────────────────────────
async def _stream_visualize():
    df = _SESSION.get("clean_df")
    if df is None:
        yield "data: " + json.dumps({
            "type": "error",
            "data": "No session data. Run /reconcile first."
        }) + "\n\n"
        return

    def _run():
        return list(run_zenview(df))

    events = await asyncio.get_event_loop().run_in_executor(_executor, _run)

    for event in events:
        if isinstance(event, dict):
            payload = json.dumps({"type": "viz_result", "data": event})
        else:
            payload = json.dumps({"type": "thought", "data": str(event)})
        yield f"data: {payload}\n\n"

    yield "data: [DONE]\n\n"


@app.post("/visualize")
async def visualize():
    return StreamingResponse(
        _stream_visualize(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/plot")
async def get_plot():
    reports_dir = os.path.join(os.path.dirname(__file__), "reports")
    plot_path   = os.path.join(reports_dir, "analysis_plot.png")
    if not os.path.exists(plot_path):
        raise HTTPException(status_code=404, detail="No plot generated yet.")
    return FileResponse(plot_path, media_type="image/png")


# ─────────────────────────────────────────────────────────────────────────────
# /ask  — v3: Two-Phase ZenChat with pandas execution layer
# ─────────────────────────────────────────────────────────────────────────────

class AskRequest(BaseModel):
    question: str


# ── Lean context builder (safe for large DataFrames) ─────────────────────────
def _build_lean_context(df: pd.DataFrame) -> str:
    """
    Build a compact, token-safe context string.
    NEVER sends raw row data for large DataFrames — only schema + stats.
    For small DataFrames (≤200 rows) includes a full markdown preview.
    """
    parts: list[str] = []

    # 1. Schema — always included, tiny
    schema_lines = [f"  - {col}: {dtype}" for col, dtype in df.dtypes.items()]
    parts.append(
        f"## Dataset Schema\n"
        f"Filename: {_SESSION.get('filename', 'unknown')}\n"
        f"Total rows: {len(df):,} | Total columns: {len(df.columns)}\n"
        f"Original rows before cleaning: {_SESSION.get('original_rows', 'unknown')}\n"
        f"Columns:\n" + "\n".join(schema_lines)
    )

    # 2. Numeric stats — always included
    numeric_df = df.select_dtypes(include="number")
    if not numeric_df.empty:
        parts.append(f"## Numeric Statistics\n{numeric_df.describe().to_markdown()}")

    # 3. Categorical stats — top values for object columns
    cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
    if cat_cols:
        cat_summary = []
        for col in cat_cols[:5]:   # cap at 5 columns to save tokens
            top = df[col].value_counts().head(3).to_dict()
            cat_summary.append(f"  - {col}: {top}")
        parts.append("## Top Categorical Values (sample)\n" + "\n".join(cat_summary))

    # 4. Row preview — only for small DataFrames
    if len(df) <= 200:
        parts.append(f"## Full Dataset\n{df.to_markdown(index=False)}")
    else:
        parts.append(f"## Row Preview (first 5 rows)\n{df.head(5).to_markdown(index=False)}")

    # 5. Audit summary — key metrics only
    summary = _SESSION.get("audit_summary", {})
    if summary:
        parts.append(f"## Audit Summary\n```json\n{json.dumps(summary, indent=2)}\n```")

    return "\n\n---\n\n".join(parts)


# ── Phase 1: LLM writes pandas code to answer the question ───────────────────
_CODE_GEN_SYSTEM = """\
You are ZenCode, a precise Python/pandas code generator.
Given a DataFrame `df` and a question, write ONLY executable Python code.

RULES:
- The DataFrame is already loaded as `df`. Do NOT load or read any files.
- Store your final answer in a variable named `_result`.
- `_result` must be a simple type: str, int, float, list, or dict.
- For counts/aggregations: compute them directly (e.g. df.duplicated().sum()).
- For filtering: return a summary dict, not the full DataFrame.
- Do NOT use print(). Do NOT import anything. Do NOT use matplotlib.
- Do NOT explain the code. Output ONLY the raw Python code block, no markdown.
- If the question cannot be answered with pandas, set _result = "NOT_COMPUTABLE".

Example output for "how many duplicate rows?":
_result = int(df.duplicated().sum())
"""


def _extract_code(llm_output: str) -> str:
    """Strip markdown fences from LLM code output if present."""
    # Remove ```python ... ``` or ``` ... ``` wrappers
    fenced = re.search(r"```(?:python)?\s*([\s\S]*?)\s*```", llm_output)
    if fenced:
        return fenced.group(1).strip()
    return llm_output.strip()


def _phase1_generate_and_execute(question: str, df: pd.DataFrame) -> tuple[bool, str]:
    """
    Ask the LLM to write pandas code, execute it via safe_exec(),
    and return (computed_successfully, result_as_string).
    """
    schema_hint = (
        f"DataFrame `df` has {len(df):,} rows and {len(df.columns)} columns.\n"
        f"Columns: {', '.join(df.columns.tolist())}\n"
        f"Dtypes:\n" + "\n".join(f"  {c}: {t}" for c, t in df.dtypes.items())
    )

    try:
        code_response = _groq.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": _CODE_GEN_SYSTEM},
                {
                    "role": "user",
                    "content": (
                        f"DataFrame info:\n{schema_hint}\n\n"
                        f"Question: {question}\n\n"
                        f"Write the pandas code now:"
                    ),
                },
            ],
            temperature=0.0,      # fully deterministic for code
            max_tokens=400,
        )
        raw_code = code_response.choices[0].message.content.strip()
        code = _extract_code(raw_code)
    except Exception as e:
        return False, f"Code generation failed: {e}"

    # Don't bother executing if LLM says it's not computable
    if "_result = \"NOT_COMPUTABLE\"" in code or "_result = 'NOT_COMPUTABLE'" in code:
        return False, "NOT_COMPUTABLE"

    # Execute via the existing safe sandbox
    success, output, result = safe_exec(code, df=df)

    if not success:
        return False, f"Execution error:\n{output}"

    if result is None:
        return False, "Code ran but _result was not set."

    # Serialize result to a clean string
    if isinstance(result, pd.DataFrame):
        result_str = result.head(20).to_markdown(index=False)
    elif isinstance(result, pd.Series):
        result_str = result.to_string()
    elif isinstance(result, dict):
        result_str = json.dumps(result, indent=2, default=str)
    elif isinstance(result, (list, tuple)):
        result_str = json.dumps(result, default=str)
    else:
        result_str = str(result)

    return True, result_str


# ── Phase 2: LLM answers using the computed result as grounded context ────────
_ANSWER_SYSTEM = """\
You are ZenChat, a professional financial data analyst.
You have been given:
  1. COMPUTED RESULT — the exact output of running pandas code on the real dataset.
  2. DATASET CONTEXT — schema, statistics, and audit summary.

Answer the user's question using ONLY the provided computed result and context.
- Be concise and direct. Lead with the number/fact.
- Do NOT say "based on the code" or reference implementation details.
- Format numbers with commas for readability.
- If the computed result is an error, acknowledge it and answer from context instead.
- Never fabricate numbers.
"""


def _phase2_answer(
    question: str,
    computed_result: str,
    lean_context: str,
    computation_succeeded: bool,
) -> str:
    """Use the computed result + lean context to generate the final answer."""

    if computation_succeeded:
        user_content = (
            f"COMPUTED RESULT (exact pandas output on the real data):\n"
            f"```\n{computed_result}\n```\n\n"
            f"---\n\n"
            f"DATASET CONTEXT:\n{lean_context}\n\n"
            f"---\n\n"
            f"USER QUESTION: {question}"
        )
    else:
        # Fall back to context-only if computation failed/not applicable
        user_content = (
            f"Note: Direct computation was not applicable for this question "
            f"({computed_result}).\n\n"
            f"DATASET CONTEXT:\n{lean_context}\n\n"
            f"---\n\n"
            f"USER QUESTION: {question}"
        )

    response = _groq.chat.completions.create(
        model=_MODEL,
        messages=[
            {"role": "system",  "content": _ANSWER_SYSTEM},
            {"role": "user",    "content": user_content},
        ],
        temperature=0.1,
        max_tokens=600,
    )
    return response.choices[0].message.content.strip()


# ── /ask endpoint ─────────────────────────────────────────────────────────────
@app.post("/ask")
async def ask(req: AskRequest):
    """
    ZenChat v3 — Two-phase DataFrame-Augmented Generation.

    Phase 1 (ZenCode):  LLM writes pandas → safe_exec() computes exact answer
    Phase 2 (ZenChat):  LLM narrates the computed result in natural language

    This handles BOTH conversational questions (context-only) AND
    computational questions (duplicates, sums, counts, filters, etc.)
    """
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    df: pd.DataFrame | None = _SESSION.get("clean_df")

    if df is None:
        return {
            "answer":   "No session data found. Please upload and reconcile a CSV file first.",
            "grounded": False,
            "computed": False,
        }

    try:
        # ── Phase 1: Compute ──────────────────────────────────────────────────
        computed_ok, computed_result = await asyncio.get_event_loop().run_in_executor(
            _executor,
            _phase1_generate_and_execute,
            req.question,
            df,
        )

        # ── Build lean context (always, as Phase 2 fallback) ─────────────────
        lean_context = _build_lean_context(df)

        # ── Phase 2: Answer ───────────────────────────────────────────────────
        answer = await asyncio.get_event_loop().run_in_executor(
            _executor,
            _phase2_answer,
            req.question,
            computed_result,
            lean_context,
            computed_ok,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"ZenChat error: {type(exc).__name__}: {exc}"
        )

    return {
        "answer":   answer,
        "grounded": True,
        "computed": computed_ok,
        "computed_raw": computed_result if computed_ok else None,
        "session": {
            "filename":      _SESSION.get("filename"),
            "original_rows": _SESSION.get("original_rows"),
            "clean_rows":    len(df),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# /health
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    df = _SESSION.get("clean_df")
    return {
        "status":      "ZenForce online",
        "version":     "3.0.0",
        "has_session": df is not None,
        "filename":    _SESSION.get("filename", "—"),
        "clean_rows":  len(df) if df is not None else 0,
    }