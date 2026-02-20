"""
demo.py — Streamlit Frontend  (v2)
Panels: Reconcile | Visualize | ZenChat
"""

import json
import io
import requests
import pandas as pd
import streamlit as st

BACKEND = "http://localhost:8000"

st.set_page_config(
    page_title="Zenalyst Deterministic Workforce",
    page_icon="⚡",
    layout="wide",
)

# ── Sidebar ───────────────────────────────────────────────────────────────────
st.sidebar.image(
    "https://placehold.co/220x60/0e1117/7c3aed?text=⚡+Zenalyst",
    use_column_width=True,
)
st.sidebar.title("Navigation")
page = st.sidebar.radio(
    "Go to",
    ["🔄 Reconcile", "🎨 Visualize", "💬 ZenChat"],
    label_visibility="collapsed",
)


# ─────────────────────────────────────────────────────────────────────────────
# Page 1 — Reconcile
# ─────────────────────────────────────────────────────────────────────────────
if page == "🔄 Reconcile":
    st.title("⚡ ZenForce — Data Reconciliation Pipeline")
    st.caption("ZenForce → ZenRecon (Gate 0 / 1 / 2) → ZenVault · Upload a dirty CSV to begin.")

    uploaded = st.file_uploader("Upload dirty financial CSV", type=["csv"])

    if uploaded and st.button("🚀 Run Reconciliation", type="primary"):
        col_l, col_r = st.columns([3, 2])

        with col_l:
            st.subheader("🧠 Live Thought Signatures")
            thought_box = st.empty()
            thoughts: list[str] = []

        with col_r:
            st.subheader("📊 Session Results")
            metrics_box = st.empty()

        summary_data = None

        with requests.post(
            f"{BACKEND}/reconcile",
            files={"file": (uploaded.name, uploaded.getvalue(), "text/csv")},
            stream=True,
            timeout=180,
        ) as resp:
            for raw in resp.iter_lines():
                if not raw:
                    continue
                line = raw.decode("utf-8")
                if not line.startswith("data:"):
                    continue
                payload_str = line[5:].strip()
                if payload_str == "[DONE]":
                    break
                try:
                    payload = json.loads(payload_str)
                except Exception:
                    continue

                if payload["type"] == "thought":
                    thoughts.append(payload["data"])
                    thought_box.markdown("\n\n---\n\n".join(thoughts[-12:]))
                elif payload["type"] == "summary":
                    summary_data = payload["data"]

        if summary_data:
            audit = summary_data.get("audit") or {}
            with col_r:
                metrics_box.empty()
                st.metric("Original Rows",      summary_data.get("original_rows", "—"))
                st.metric("Clean Rows",         summary_data.get("clean_rows", "—"))
                st.metric("Duplicates Removed", summary_data.get("duplicates_removed", "—"))
                status = audit.get("integrity_status", "—")
                (st.success if status == "PASS" else st.warning)(f"ZenVault: {status}")

            st.success("✅ Reconciliation complete! Go to **Visualize** or **ZenChat**.")


# ─────────────────────────────────────────────────────────────────────────────
# Page 2 — Visualize
# ─────────────────────────────────────────────────────────────────────────────
elif page == "🎨 Visualize":
    st.title("🎨 ZenView — Deterministic Visualization Agent")
    st.caption("ZenView writes matplotlib/seaborn code. The sandbox executes it. No guessing.")

    if st.button("🎨 Generate Chart", type="primary"):
        col_l, col_r = st.columns([2, 3])

        with col_l:
            st.subheader("🧠 Agent Thoughts")
            thought_box = st.empty()
            thoughts: list[str] = []

        with col_r:
            st.subheader("📈 Generated Chart")
            chart_box = st.empty()

        plot_path = None

        with requests.post(f"{BACKEND}/visualize", stream=True, timeout=120) as resp:
            for raw in resp.iter_lines():
                if not raw:
                    continue
                line = raw.decode("utf-8")
                if not line.startswith("data:"):
                    continue
                payload_str = line[5:].strip()
                if payload_str == "[DONE]":
                    break
                try:
                    payload = json.loads(payload_str)
                except Exception:
                    continue

                if payload["type"] == "thought":
                    thoughts.append(payload["data"])
                    thought_box.markdown("\n\n---\n\n".join(thoughts[-8:]))
                elif payload["type"] == "viz_result":
                    result = payload["data"]
                    if result.get("success") and result.get("plot_path"):
                        plot_path = result["plot_path"]

        if plot_path:
            img_resp = requests.get(f"{BACKEND}/plot", timeout=10)
            if img_resp.status_code == 200:
                with col_r:
                    chart_box.image(img_resp.content, caption="ZenView Output", use_column_width=True)
                    st.download_button(
                        "⬇️ Download Chart",
                        data=img_resp.content,
                        file_name="zenview_chart.png",
                        mime="image/png",
                    )
            else:
                st.error("Chart generated but could not be fetched from backend.")
        else:
            st.error("ZenView could not generate a chart. Check the thought log above.")


# ─────────────────────────────────────────────────────────────────────────────
# Page 3 — ZenChat
# ─────────────────────────────────────────────────────────────────────────────
elif page == "💬 ZenChat":
    st.title("💬 ZenChat — Session-Aware Financial RAG")
    st.caption(
        "Ask anything about your reconciled dataset. "
        "Answers are grounded in real data — no hallucinations."
    )

    # Conversation history in session state
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []

    # Render conversation
    for msg in st.session_state.chat_history:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    # Suggested starter questions
    if not st.session_state.chat_history:
        st.info(
            "💡 **Try asking:**\n"
            "- What was the total spend after deduplication?\n"
            "- Which vendor had the most transactions?\n"
            "- How many duplicate entries were removed?\n"
            "- What is the average transaction amount?"
        )

    if question := st.chat_input("Ask about your data…"):
        # Show user message
        st.session_state.chat_history.append({"role": "user", "content": question})
        with st.chat_message("user"):
            st.markdown(question)

        with st.chat_message("assistant"):
            with st.spinner("ZenChat is thinking…"):
                try:
                    resp = requests.post(
                        f"{BACKEND}/ask",
                        json={"question": question},
                        timeout=60,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    answer = data.get("answer", "No answer returned.")
                    grounded = data.get("grounded", False)

                    st.markdown(answer)
                    if grounded:
                        session = data.get("session", {})
                        st.caption(
                            f"📎 Grounded in: `{session.get('filename','—')}` · "
                            f"{session.get('clean_rows','—')} clean rows"
                        )
                    else:
                        st.warning("⚠️ No session data — reconcile a CSV first.")

                except requests.exceptions.RequestException as exc:
                    answer = f"❌ Backend error: {exc}"
                    st.error(answer)

        st.session_state.chat_history.append({"role": "assistant", "content": answer})

    # Clear chat button
    if st.session_state.chat_history:
        if st.button("🗑️ Clear chat"):
            st.session_state.chat_history = []
            st.rerun()