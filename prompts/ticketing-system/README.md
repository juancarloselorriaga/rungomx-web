# Multi-Agent Engineering Workflow (Codex/Claude/Codex CLI)

This repository contains a reusable workflow of AI-agent prompts for executing
large-scale engineering upgrades, refactors, or migrations using
file-system-aware AI agents (Codex CLI, Claude Code, etc.).

This workflow lets you:

1. Analyze a system deeply
2. Produce a structured multi-phase upgrade plan
3. Generate a coherent set of implementation tickets
4. Audit and refine those tickets
5. Implement each ticket safely using isolated agents
6. Review each implementation for correctness
7. Guarantee cross-ticket consistency and Upgrade Plan alignment

---

## 🧠 How the Workflow Works

You follow the steps below, using the corresponding prompts in the `prompts/` folder.

### **STEP 1 — Architect Analysis**
Use `01_architect_analysis_agent.md`  
Give the agent the context + relevant folders.  
It returns the full technical assessment.

### **STEP 2 — Upgrade Planner**
Use `02_upgrade_planner_agent.md`  
Input: The architecture analysis from Step 1.  
Output: A multi-phase upgrade plan with critical fixes, refactors, and sequencing.

### **STEP 3 — Ticket Generator**
Use `03_ticket_generator_agent.md`  
Input: The upgrade plan from Step 2.  
Output: A set of structured tickets (Markdown files) with titles, DoD, modules, tests, etc.

### **STEP 4 — Ticket Batch Auditor**
Use `04_ticket_batch_auditor.md`  
Input: N tickets at a time (e.g., 1–5).  
Output: Corrections to ensure each ticket aligns with:
- the Upgrade Plan  
- the codebase  
- cross-ticket consistency  

### **STEP 5 — Final Pass Auditor**
Use `05_final_pass_auditor.md`  
Input: All tickets 1–N  
Output: A global validation checking:
- Overlaps  
- Gaps  
- Incorrect file paths  
- Missing coverage  
- Cross-ticket contradictions  
- Upgrade Plan completeness  

### **STEP 6 — Single Ticket Implementer**
Use `06_single_ticket_implementer.md`  
Give it the ticket number and filename ONCE in the prompt.  
This agent implements ONLY that ticket in isolation:
- Minimal changes  
- No refactors  
- No cross-ticket violations  
- Produces unified diffs  
- Adds tests ONLY for the ticket  

### **STEP 7 — Ticket Implementation Reviewer**
Use `07_ticket_implementation_reviewer.md`  
Review only the changed files.  
This prevents scope creep, side effects, or architectural drift.

---

## 🧩 Generic Usage for ANY Project

If you have a new problem, follow this same flow:

1. Feed architecture + context to Step 1  
2. Feed analysis to Step 2 to build a plan  
3. Use Step 3 to generate tickets  
4. Validate with Steps 4/5  
5. Implement ticket-by-ticket with Step 6  
6. Review each implementation with Step 7  

This produces:
- Coherent planning
- Zero overlap between tasks
- Safe multi-agent parallel implementation
- Deterministic outcomes
- Accurate upgrades tied to the real codebase

---

## 👍 Recommended Folder Layout

src/
features/
your-feature/
tickets/
01-*.md
...
plan/
UPGRADE.md
prompts/


---

## 🔄 Running With Codex CLI

Example:

codex chat -p prompts/01_architect_analysis_agent.md


Or passing variables:

codex chat -p prompts/06_single_ticket_implementer.md
--var ticket_number=04
--var ticket_filename=04-handwriting-detection.md


---

## 🧩 Tip: Use a Dispatcher Script

You can automate execution:

- Batch 1 tickets → batch auditor  
- Batch 2 tickets → batch auditor  
- All tickets → final auditor  
- For each ticket → implementer → reviewer  

---

## 🏁 That’s it.
This workflow is tested and proven.  
Drop these prompts in your repo and you have a reusable, industrial-grade AI-driven engineering system.
