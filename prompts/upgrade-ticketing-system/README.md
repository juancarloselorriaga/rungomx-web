# Multi Agent Upgrade Workflow Prompts

This folder contains a reusable workflow of prompts you can use with CLI AI agents
(Codex CLI, Claude Code, etc) to upgrade complex features safely and incrementally.

It is based on a real extraction pipeline upgrade where we:

- Audited an existing complex feature
- Designed a multi phase upgrade plan
- Broke the plan into tightly scoped tickets
- Audited and refined the tickets
- Implemented tickets in strict sequence with multiple agents
- Reviewed the implementations focusing only on the changed files

You can reuse these prompts for any feature or system that needs a structured,
multi agent upgrade.

## Files

1. `01_architect_analysis_agent.md`  
   Deep technical audit of the current implementation.

2. `02_upgrade_planner_agent.md`  
   Turn the analysis into a phased upgrade plan.

3. `03_ticket_generator_agent.md`  
   Turn the upgrade plan into concrete tickets written to disk.

4. `04_ticket_batch_auditor.md`  
   Review a batch of tickets for alignment with the plan and the codebase.

5. `05_final_pass_auditor.md`  
   Global pass that checks all tickets together for coherence and coverage.

6. `06_single_ticket_implementer.md`  
   Implement exactly one ticket, in isolation, using the local codebase.

7. `07_ticket_implementation_reviewer.md`  
   Review the implementation of a single ticket by inspecting the changed files.

## Typical Usage Flow

You usually run the agents in this order:

1. **Architect Analysis Agent**  
   Point it at the relevant folders and give it a short system overview.  
   It produces a detailed analysis of strengths, weaknesses, risks, and gaps.

2. **Upgrade Planner Agent**  
   Feed it the analysis from step 1.  
   It produces a multi phase, dependency ordered upgrade plan.

3. **Ticket Generator Agent**  
   Feed it the upgrade plan and the relevant folder structure.  
   It writes markdown ticket files to `./ticketing/<upgrade-plan-title>/`.

4. **Ticket Batch Auditor Agent**  
   Run this on batches of tickets (for example 1 to 5, then 6 to 10).  
   It corrects tickets so they actually match the code and the plan.

5. **Final Pass Auditor Agent**  
   Run this once after the batch audits.  
   It checks all tickets together to ensure they form a coherent execution plan.

6. **Single Ticket Implementer Agent**  
   Run one agent instance per ticket, passing the ticket number and filename.  
   Each agent only works on the files referenced by its ticket.

7. **Ticket Implementation Reviewer Agent**  
   After each implementation, run this agent, pointed at the diff and the ticket.  
   It reviews for correctness, scope, and alignment with the plan.

## Adapting To A New Project

For a new project:

- Replace any hard coded paths in your commands with your own paths.  
- Keep the logical steps the same:
  - Analyze
  - Plan
  - Generate tickets
  - Audit tickets
  - Final global audit
  - Implement tickets one by one
  - Review implementations

The prompts themselves stay mostly the same. The only parts you need to change
are:

- The folders where your code lives
- The file that holds the upgrade plan (by default `UPGRADE.md`)
- Any domain specific hints you want to add in your own usage

## Running From CLI (example)

- Step 1: Architect Analysis

  You run something like:

  ```bash
  codex chat \
    --prompt-file prompts/01_architect_analysis_agent.md \
    --context src/features/my-feature
  ```

- Step 2: Upgrade Planner

  Take the analysis text and pass it as input to:

  ```bash
  codex chat \
    --prompt-file prompts/02_upgrade_planner_agent.md
  ```

- Step 3: Ticket Generator

  Save the upgrade plan to `UPGRADE.md` under your feature folder, then:

  ```bash
  codex chat \
    --prompt-file prompts/03_ticket_generator_agent.md \
    --context src/features/my-feature
  ```

And so on for the other steps.

Use these as building blocks and tweak locally to fit your own workflow.
