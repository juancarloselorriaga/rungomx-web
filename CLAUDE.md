## Design Context

### Users
**Event organizers** — primarily experienced or repeat organizers who are time-pressured and stressed. They're not exploring; they have a job to finish. The AI wizard is a tool they reach for when they need to get something done fast, not a feature they play with. They know their event; they need the platform to keep up with them.

**Emotional goals:** Confidence, speed, relief. Not delight, not wonder — just "this works, I got it done."

### Brand Personality
**Bold. Modern. Community-driven.**

RungoMX is the platform for the Mexican running community. It has energy and identity — purposeful, forward-moving, athletic. Takes organizing seriously without being corporate. Voice: Direct, respectful, peer-to-peer.

### Aesthetic Direction
- **Visual tone:** Elevated above the dashboard — flagship feature, slightly premium
- **Color system:** oklch-based, warm orange-red primary, brand blue/green accents, gold for Pro tier only
- **Typography:** Geist Sans — lean on weight variation and size contrast for hierarchy
- **Theme:** Light mode primary

**Anti-references (must NOT look like):**
- Generic ChatGPT / raw LLM chat UI
- Clippy-style over-eager assistant cheerfulness
- Dark AI aesthetic (cyan-on-dark, glowing borders, purple-blue gradients)
- Corporate SaaS wizard (sterile step-through progress bars)

### Design Principles
1. **Speed over ceremony.** Every interaction should feel fast. Organizer's time is the most valuable resource.
2. **Confidence through clarity.** Proposals must be scannable at a glance — what changed, why, what the impact is.
3. **Elevated, not alien.** Same design tokens as the dashboard, applied with more intention — tighter spacing, stronger hierarchy.
4. **Community, not corporate.** Peer-to-peer tone. Energy without being loud. Designed by someone who runs.
5. **Control belongs to the organizer.** AI assists; it never takes over. Apply/dismiss controls always visible and obvious.

---

## Package Management

`pnpm`

## Documentation

Always use context7 when I need code generation, setup or configuration steps, or
library/API documentation. This means you should automatically use the Context7 MCP
tools to resolve library id and get library docs without me having to explicitly ask.

## NextJS

**When starting work on a Next.js project, ALWAYS call the `init` tool from
next-devtools-mcp FIRST to set up proper context and establish documentation
requirements. Do this automatically without being asked.**
