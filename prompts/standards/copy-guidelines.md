# Copy Guidelines

This document defines the writing standards for user-facing text across the product.

The goal is to ensure a consistent voice that feels natural for runners and Race Directors, while remaining clear, trustworthy, and easy to maintain across English and Spanish.

---

# Core Principles

Write like a knowledgeable peer from the running industry, not like a generic SaaS product.

Prioritize clarity over cleverness.

Avoid robotic phrasing, internal terminology, or AI-sounding language.

Use simple sentence structures.

Prefer short sentences.

Every sentence should help the user take action or feel confident.

---

# Audience

Primary user:
Race Director

Secondary user:
Runner / participant

Race Directors are organizing real-world events and need to feel confident publishing them.

Runners are deciding whether to participate and need clear, motivating information.

---

# Terminology

## Canonical terms

| Concept | English | Spanish |
|---|---|---|
| Primary user | Race Director | director de carrera |
| Legal entity | Organization | organización |
| Person registering | Runner / participant | corredor / participante |
| Public-facing page | Event page | página del evento |
| Runner-facing text | Race page copy | texto de la página del evento |
| Setup flow | Event setup | configuración del evento |
| AI tool | Setup assistant | asistente de configuración |
| AI output | Proposal | propuesta |
| Pricing tier | Pricing tier | nivel de precio |
| Waiver | Waiver | deslinde de responsabilidad |
| Add-on | Add-on | complemento |
| Publish blockers | Publish blockers | bloqueos para publicar |

---

## Protected terminology

Always use:

Race Director
director de carrera

Do NOT use:

organizer
organizador

except in internal code or database field names.

---

## Event vs Race usage

Use:

Event → configuration and platform context
Race → runner-facing context

Examples:

Event settings
Event details
Event page
Event content

Race description
Race page copy

Avoid:

Race settings
Race configuration

---

# Tone

## English tone

Write as if an experienced race director or running event professional wrote the product.

Clear
Confident
Helpful
Practical
Human

Avoid:

corporate tone
marketing hype
technical jargon
AI meta language

Good:

Add a distance
Publish when you're ready
Everything looks good

Avoid:

Leverage
Robust
Seamless
Ensure that
Authoritative
Grounded
Scaffold

---

## Spanish tone

Write originally in Spanish, not translated word-for-word.

Use neutral LATAM Spanish.

Prefer terminology familiar to Mexican race directors but understandable across LATAM.

Use "tú" consistently.

Prefer:

carrera
corredores
configuración
publicar

Use:

deslinde de responsabilidad

Avoid:

autoritativo
payload
organizador
scaffold
wizard (untranslated)

Avoid overly literal translations.

---

# AI Assistant Tone

The assistant should feel:

calm
capable
practical
honest

Avoid sounding like ChatGPT.

Avoid phrases such as:

Based on...
According to...
It appears that...
Grounded proposal
Participant-facing copy
Authoritative result

Prefer:

Here's a draft...
This version keeps things clear...
I kept the logistics simple...
You can adjust this later...

Avoid repeating patterns in every response.

---

# UX Writing Principles

Prefer direct actions:

Add a distance
Upload image
Publish event
Save changes

Avoid polite filler:

Please ensure that...
Kindly provide...
You may want to consider...

---

# Error Messages

Errors should feel like guidance, not system failure.

Good:

Couldn't save changes. Try again.
Add at least one distance before publishing.
Location needs confirmation.

Avoid:

Unexpected error occurred.
Payload invalid.
Operation failed due to configuration mismatch.

---

# Confirmation Messages

Keep short.

Saved.
Changes applied.
Image updated.
Distance saved.

Avoid:

Your changes have been successfully saved.
The operation completed successfully.

---

# Empty States

Encourage action.

Good:

No distances yet. Add one to enable registration.

Avoid:

No data available.

---

# Assistant Language Patterns

Preferred verbs:

draft
review
apply
update
confirm
add
publish
edit

Avoid:

generate
orchestrate
structure payload
scaffold

---

# Spanish-specific guidance

Preferred wording:

carrera
configurar
publicar
inscripciones
deslinde de responsabilidad
precio de preventa
precio regular
precio de cierre

Avoid:

evento deportivo (too formal)
configuración AI
payload
wizard
organizador

---

# Consistency Rules

Step names must match across:

wizard registry
wizard shell
assistant references
navigation labels

Example:

Event basics
Distances
Pricing
Policies
Event content
Review & publish

---

# When adding new copy

Check:

Is the sentence short?
Would a race director say this?
Does this sound natural in Spanish?
Is this free of internal terminology?
Is this free of AI-sounding phrasing?

If unsure, choose simpler wording.

---

# Goal

The product should feel like it was built by people who understand races and runners.

Clear enough to publish confidently.
Natural enough to feel trustworthy.
Consistent across English and Spanish.
Not recognizable as AI-generated text.
