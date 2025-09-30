**AEARS File Format (.aears)**

AEARS (Advanced Easy Approach to Requirements Syntax) is a formal requirements language that bridges natural language requirements with automated UML diagram generation. It solves the problem of ambiguous, unstructured requirements by providing a controlled natural language syntax that can be automatically parsed to extract actors, use cases, and relationships for UML use case diagrams.

The format can be used in .aears files or as code fence format type in Markdown files:

```aears
The system shall authenticate users
When login attempted the system shall validate credentials
IF invalid credentials THEN the system shall reject access
WHILE session active the system shall maintain state
WHERE security enabled the system shall encrypt data
```

**UB - Ubiquitous Requirements**
The <entity> shall <functionality>
The <entity> shall <functionality> the <entity> for <functionality>

**EV - Event-driven Requirements**
When <preconditions> the <entity> shall <functionality>
When <preconditions> the <entity> shall perform <functionality>
When <entity> <functionality> the <entity> shall <functionality>

**UW - Unwanted Behavior Requirements**
The <entity> shall not <functionality>
IF <preconditions> THEN the <entity> shall <functionality>
IF <preconditions> THEN the <functionality> of <functionality> shall <functionality>
IF <preconditions> THEN the <functionality> of <functionality> shall <functionality> to <functionality>
IF <preconditions> THEN the <functionality> of <functionality> shall <functionality> to <functionality> and <functionality>

**ST - State-driven Requirements**
WHILE <in a specific state> the <entity> shall <functionality>
WHILE <in a specific state> the <functionality> shall <functionality>

**OP - Optional/Conditional Requirements**
WHERE <feature is included> the <entity> shall <functionality>
WHERE <preconditions> the <functionality> shall <functionality>
WHERE <preconditions> the <functionality> of <functionality> shall <functionality> to <functionality>

**HY - Hybrid Requirements**
<While-in-a-specific-state> if necessary the <functionality> shall <functionality>
<While-in-a-specific-state> if necessary the <entity> shall perform <functionality>
<While-in-a-specific-state> if <preconditions> the <functionality> shall <functionality>

**Syntax Rules**
Keywords are case-insensitive (THE/the, SHALL/shall, WHEN/when, IF/if, THEN/then, WHILE/while, WHERE/where)
<entity> represents actors or system components (nouns)
<functionality> represents actions or behaviors (verbs/verb phrases)
<preconditions> represents conditions or triggers
<in a specific state> represents system states
<feature is included> represents optional features or conditions
One requirement per line
File extension must be .aears
Empty lines and whitespace are ignored
No comments or metadata allowed in pure requirements format

**Parsing Behavior**
<entity> elements become actors in UML diagrams
<functionality> elements become use cases in UML diagrams
Multiple <functionality> in one requirement create use case relationships
"shall <functionality>" creates includes relationship
"of <functionality>" creates extends or includes relationship (designer choice)
"to <functionality>" creates dependency relationship
"and <functionality>" creates additional relationship

**Requirement Type Mapping**
UB: Basic system functionality, direct actor-to-use case mapping
EV: Event-triggered functionality, conditional execution
UW: Negative requirements, error handling, security constraints
ST: State-dependent functionality, continuous behavior
OP: Feature-dependent functionality, configuration-based behavior
HY: Complex conditional functionality, state + event combination

**Validation Requirements**
Each line must match exactly one requirement type pattern
<entity> must be present in UB, EV, ST, OP patterns
<functionality> must be present in all patterns
Keywords must appear in correct sequence for each type
Malformed syntax generates parse errors with line numbers
Missing required elements generate validation errors
