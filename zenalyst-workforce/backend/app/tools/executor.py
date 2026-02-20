"""
ZenVault Executor — tools/executor.py
Safe exec() wrapper that captures stdout/stderr for streaming to the UI.
Agents NEVER perform math. They write code. This module runs it.

v2 additions:
  - matplotlib (plt) and seaborn (sns) pre-injected into the namespace
  - safe_exec_viz() variant — headless Agg backend, injects plt/sns/SAVE_PATH
  - ALLOWED_MODULES extended to include matplotlib & seaborn roots
"""

import io
import os
import sys
import traceback
import pandas as pd
import numpy as np
from contextlib import redirect_stdout, redirect_stderr
from typing import Any, Dict, Set, Tuple

# ── Pre-import viz libs with the non-interactive Agg backend ─────────────────
# Must set backend BEFORE importing pyplot to avoid display errors on servers.
import matplotlib
matplotlib.use("Agg")                   # headless — no GUI window needed
import matplotlib.pyplot as plt         # noqa: E402
import seaborn as sns                   # noqa: E402

# Apply a professional dark financial theme once at module load
sns.set_theme(style="darkgrid", palette="muted")
plt.rcParams.update({
    "figure.facecolor": "#0e1117",
    "axes.facecolor":   "#1a1f2e",
    "axes.edgecolor":   "#3a3f5c",
    "text.color":       "#e0e0e0",
    "axes.labelcolor":  "#e0e0e0",
    "xtick.color":      "#a0a0b0",
    "ytick.color":      "#a0a0b0",
    "grid.color":       "#2a2f4a",
    "font.family":      "DejaVu Sans",
})

# Ensure the reports directory exists at module load
_REPORTS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "reports")
)
os.makedirs(_REPORTS_DIR, exist_ok=True)

# ── Shared import allowlist ───────────────────────────────────────────────────
_BASE_ALLOWED: Set[str] = {
    "pandas", "pd", "numpy", "np",
    "re", "unicodedata", "io", "math",
    "datetime", "collections", "itertools", "functools", "string",
}
_VIZ_ALLOWED: Set[str] = _BASE_ALLOWED | {"matplotlib", "seaborn"}


def _make_safe_import(allowed: Set[str]):
    def _safe_import(name, *args, **kwargs):
        root = name.split(".")[0]
        if root not in allowed:
            raise ImportError(
                f"ZenSandbox: import of '{name}' is not permitted. "
                f"Allowed: {sorted(allowed)}"
            )
        return __import__(name, *args, **kwargs)
    return _safe_import


def _base_builtins(allowed: Set[str] | None = None) -> dict:
    return {
        "__import__": _make_safe_import(allowed or _BASE_ALLOWED),
        "print": print, "len": len, "range": range,
        "enumerate": enumerate, "zip": zip, "map": map, "filter": filter,
        "list": list, "dict": dict, "set": set, "tuple": tuple,
        "str": str, "int": int, "float": float, "bool": bool,
        "round": round, "abs": abs, "min": min, "max": max, "sum": sum,
        "sorted": sorted, "isinstance": isinstance, "type": type,
        "hasattr": hasattr, "getattr": getattr, "repr": repr,
        "ValueError": ValueError, "KeyError": KeyError,
        "TypeError": TypeError, "AttributeError": AttributeError,
        "Exception": Exception,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Core safe_exec  (data pipeline — pandas / numpy only)
# ─────────────────────────────────────────────────────────────────────────────
def safe_exec(
    code: str,
    df: pd.DataFrame | None = None,
    extra_globals: dict | None = None,
) -> Tuple[bool, str, Any]:
    """
    Execute agent-generated Pandas code in a sandboxed namespace.

    Returns (success, stdout+stderr output, _result or df)
    """
    namespace: Dict[str, Any] = {
        "__builtins__": _base_builtins(_BASE_ALLOWED),
        "pd": pd,
        "np": np,
    }
    if df is not None:
        namespace["df"] = df.copy()
    if extra_globals:
        namespace.update(extra_globals)

    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    success = False
    result: Any = None

    try:
        with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
            exec(compile(code, "<agent_code>", "exec"), namespace)  # noqa: S102
        success = True
        result = namespace.get("_result", namespace.get("df"))
    except Exception:
        stderr_buf.write(traceback.format_exc())

    out = stdout_buf.getvalue()
    err = stderr_buf.getvalue()
    combined = out + ("\n[STDERR]\n" + err if err else "")
    return success, combined.strip(), result


# ─────────────────────────────────────────────────────────────────────────────
# safe_exec_viz  (visualization — injects plt, sns, SAVE_PATH)
# ─────────────────────────────────────────────────────────────────────────────
def safe_exec_viz(
    code: str,
    df: pd.DataFrame,
    output_path: str | None = None,
) -> Tuple[bool, str, str | None]:
    """
    Visualization variant of safe_exec.

    Pre-injects:
      plt        — matplotlib.pyplot (Agg backend, dark theme)
      sns        — seaborn
      SAVE_PATH  — absolute path where the agent MUST save its figure
      REPORTS_DIR — the reports folder

    The LLM code must NOT contain any import statements — plt/sns are ready.
    After execution, plt.close('all') is always called to free memory.

    Returns (success, output_str, plot_path_or_None)
    """
    save_path = output_path or os.path.join(_REPORTS_DIR, "analysis_plot.png")

    namespace: Dict[str, Any] = {
        "__builtins__": _base_builtins(_VIZ_ALLOWED),
        "pd":          pd,
        "np":          np,
        "df":          df.copy(),
        "plt":         plt,          # ← pre-injected, no import needed
        "sns":         sns,          # ← pre-injected, no import needed
        "SAVE_PATH":   save_path,    # ← LLM uses this variable directly
        "REPORTS_DIR": _REPORTS_DIR,
    }

    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    success = False

    try:
        with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
            exec(compile(code, "<viz_agent_code>", "exec"), namespace)  # noqa: S102
        success = True
        stdout_buf.write(f"\n[ZenView] Plot saved → {save_path}")
    except Exception:
        stderr_buf.write(traceback.format_exc())
    finally:
        plt.close("all")  # always free figure memory

    out = stdout_buf.getvalue()
    err = stderr_buf.getvalue()
    combined = out + ("\n[STDERR]\n" + err if err else "")
    plot_path = save_path if (success and os.path.exists(save_path)) else None
    return success, combined.strip(), plot_path


# ─────────────────────────────────────────────────────────────────────────────
# Gate 0 — 7-step EDA (hardcoded, deterministic — never LLM-generated)
# ─────────────────────────────────────────────────────────────────────────────
def run_eda(df: pd.DataFrame) -> Tuple[bool, str, dict]:
    """Gate 0 — 7 mandatory EDA steps streamed back to the orchestrator."""
    eda_code = """
import io

report = {}

# 1. Shape
report['shape'] = df.shape
print(f"[EDA] Shape: {df.shape}")

# 2. Head
head_str = df.head(5).to_string()
report['head'] = head_str
print(f"[EDA] Head:\\n{head_str}\\n")

# 3. Info
buf = io.StringIO()
df.info(buf=buf)
info_str = buf.getvalue()
report['info'] = info_str
print(f"[EDA] Info:\\n{info_str}")

# 4. Null counts
null_counts = df.isnull().sum().to_dict()
report['nulls'] = null_counts
print(f"[EDA] Null Counts: {null_counts}")

# 5. Describe
desc_str = df.describe(include='all').to_string()
report['describe'] = desc_str
print(f"[EDA] Describe:\\n{desc_str}\\n")

# 6. Duplicated rows (naive, pre-composite-key)
dup_count = int(df.duplicated().sum())
report['duplicated'] = dup_count
print(f"[EDA] Naive Duplicate Rows: {dup_count}")

# 7. Correlation (numeric columns only)
numeric_df = df.select_dtypes(include='number')
if not numeric_df.empty:
    corr_str = numeric_df.corr().to_string()
    report['corr'] = corr_str
    print(f"[EDA] Correlation:\\n{corr_str}")
else:
    report['corr'] = "No numeric columns"
    print("[EDA] Correlation: No numeric columns")

_result = report
"""
    success, output, result = safe_exec(eda_code, df=df)
    return success, output, result  # type: ignore[return-value]