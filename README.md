# Multi Agent System for Finance

🛡️ Zenalyst: Deterministic AI Workforce Platform
Zenalyst is a high-performance, full-stack AI platform designed for large-scale financial data reconciliation and audit. Unlike traditional LLM wrappers, Zenalyst utilizes a Sovereign Intelligence architecture to eliminate hallucinations by executing code-based logic on real data.

🚀 Architectural Overview
The platform coordinates a multi-agent workforce to process complex datasets (tested up to 105,000+ rows) through a deterministic pipeline:

ZenForce (Orchestrator): Manages agent communication and handles the streaming lifecycle.

ZenRecon (Analyst): A 3-gate ML pipeline that performs EDA, generates Python cleaning logic, and creates a unique CompositeKey for every transaction.

ZenVault (Auditor): Runs integrity checks and verifies row-count consistency and deduplication results.

ZenView (Visualizer): Generates high-fidelity financial charts using Matplotlib and Seaborn without manual code entry.

ZenChat (Computational RAG): A two-phase RAG system that translates natural language questions into executable Pandas code to provide mathematically grounded answers.

🛠️ Tech Stack
Frontend: React, TypeScript, Tailwind CSS, Framer Motion (State-managed via Bolt).

Backend: FastAPI (Python 3.11), Uvicorn, Server-Sent Events (SSE).

AI Inference: Groq (Llama-3.3-70B) for low-latency reasoning.

Sandbox: Custom restricted safe_exec environment for secure code execution.

Containerization: Docker.

🐳 Quick Start with Docker
To ensure a consistent "Sovereign" environment across all machines, the backend is fully containerized.

1. Prerequisites
Docker Desktop installed and running.

A Groq API Key.

2. Environment Setup
Create a .env file in the backend/ directory:

Plaintext
GROQ_API_KEY=your_key_here
3. Build and Run
Bash
# Build the image
docker build -t zenalyst-backend:v3 .

# Run the container
docker run -p 8000:8000 --env-file .env zenalyst-backend:v3
🧪 Key Features Tested
100K+ Row Processing: Optimized "Lean Context" building to avoid context window overflow.

Zero Hallucination: Every computational answer is derived from safe_exec code results, not LLM guesses.

Live Audit Trail: Real-time streaming of agent thoughts to the UI for full transparency.

👨‍💻 Developer
Harsh Singh B.Tech Computer Science (Specialization in Machine Learning)
