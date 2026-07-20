# Ask User Questions

`ask_user_question` is a reusable agent tool for collecting missing user input.
It lets an agent ask one or more questions, and it gives the user a focused
composer interaction for answering them.

This feature specifies the tool payload, the answer payload, and the composer UI.
It does not specify when the primary thread agent should ask a question, how it
resolves scope/output, or how tables are created.

For confirmation before creating or editing application resources, a question may
carry a structured proposal. The stable contract is the approval flow: accepting
the proposal lets the backend issue a one-use approval token for the matching
write tool. The exact Dataset or Template patch shape is intentionally owned by
that resource's write path and is not fixed here yet.

## User Experience

When an agent calls `ask_user_question`, the normal composer changes into
ask-user-question mode.

The composer never shows all questions at once. If the tool contains several
questions, the user answers them sequentially in the order supplied by the agent.

The composer returns to normal free-input mode when the final queued question is
answered or skipped. If the user skips every question, the composer still returns
to normal.

## Tool Payload

`ask_user_question` accepts one or more questions.

```json
{
  "questions": [
    {
      "id": "dataset_scope",
      "question": "Which Dataset should I use?",
      "choices": [
        { "id": "dataset-cordph-term-nicu", "label": "Term babies admitted to NICU" },
        { "id": "whole_db", "label": "Whole hospital database" },
        { "id": "another_dataset", "label": "Another saved Dataset" }
      ],
      "allow_other": true,
      "required": true
    },
    {
      "id": "confirm_dataset_change",
      "question": "Apply this Dataset change?",
      "choices": [
        { "id": "accept", "label": "Apply change" },
        { "id": "reject", "label": "Do not apply" }
      ],
      "required": true,
      "proposal": {
        "type": "resource_change",
        "resource_type": "dataset",
        "operation": "update",
        "resource_id": "dataset-cordph-term-nicu",
        "summary": "Add gestational age >= 37 weeks to the Dataset filters.",
        "patch": {
          "_placeholder": "resource-specific payload, not a contract field"
        }
      }
    }
  ]
}
```

Each question has:

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable machine-readable id for this question. |
| `question` | yes | Exact user-facing question text. |
| `choices` | no | Ordered suggested answers. |
| `choices[].id` | yes, when `choices` is present | Stable machine-readable choice id. |
| `choices[].label` | yes, when `choices` is present | User-facing choice label. |
| `allow_other` | no | Whether to show an `Other` option. Defaults to `false`. |
| `required` | no | Whether the agent considers the answer important. Defaults to `false`. |
| `proposal` | no | Structured proposal envelope for confirming a Dataset or Template change. |

The tool may pass several questions in one call, but the UI presents exactly one
question at a time.

## Structured Proposals

Use `proposal` only when the agent wants to create or edit an application
resource. In v1 that means a **Dataset** or a **Template**. Clinical/source
database records are never changed.

The `patch` is deliberately opaque in this contract. `resource_type` tells the UI
and backend which resource-specific renderer and write tool own the payload, but
this spec does not lock the Dataset or Template patch grammar. That grammar can
change while the editors and write paths settle.

```json
{
  "type": "resource_change",
  "resource_type": "dataset",
  "operation": "create",
  "resource_id": null,
  "summary": "Create a Dataset for term NICU births.",
  "patch": {
    "_placeholder": "resource-specific payload, not a contract field"
  }
}
```

Proposal fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `type` | yes | Always `resource_change`. |
| `resource_type` | yes | `dataset` or `template`. |
| `operation` | yes | `create` or `update`. |
| `resource_id` | yes | Existing resource id for updates; `null` for creates. |
| `summary` | yes | Human-readable one-line summary. |
| `patch` | yes | Opaque resource-specific proposal payload. The matching Dataset or Template write tool owns validation and apply semantics. |

Confirmation questions carrying a proposal must use explicit `accept` / `reject`
choice ids and must not enable `allow_other`.

## Approval Token Gate

Dataset and Template write tools must require an `approval_token` for any create
or edit initiated by the agent.

When the backend receives an `ask_user_question` proposal, it records the exact
proposal and computes an approval identity from the resource type, operation,
resource id, and patch. If the user accepts, the backend issues a short-lived,
single-use approval token bound to that identity. The token is generated by the
backend, not by the agent.

The browser answers `accept` or `reject`; it does not create or submit the token.
The token is minted only after acceptance, and the backend carries it into the
follow-up agent turn that continues from the user's answers — the agent then
submits it with the proposed change to the backend write path, which re-verifies
grant + token server-side before writing (never a raw filesystem write; ADR
0006). The thread transcript may record that the proposal was accepted or
rejected, but it must not be the source of truth for token validity.

A write tool accepts a token only when it matches the same resource type,
operation, resource id, and patch being written. A token cannot be reused for a
different Dataset, Template, operation, or modified patch. A successful write
consumes the token.

If the agent calls a Dataset or Template write tool without a valid token, the
tool must reject the write and return an actionable error telling the agent to
use `ask_user_question` with a proposal and wait for user approval.

## Answer Payload

The user's completed response returns one result per queued question, in the same
order as the request.

```json
{
  "answers": [
    {
      "question_id": "dataset_scope",
      "status": "answered",
      "choice_id": "whole_db",
      "text": null
    },
    {
      "question_id": "answer_format",
      "status": "skipped",
      "choice_id": null,
      "text": null
    },
    {
      "question_id": "custom_constraint",
      "status": "answered",
      "choice_id": "other",
      "text": "Use the latest complete quarter only."
    }
  ]
}
```

Each answer has:

| Field | Required | Meaning |
| --- | --- | --- |
| `question_id` | yes | The matching question id. |
| `status` | yes | `answered` or `skipped`. |
| `choice_id` | no | Selected choice id, or `other` for a custom answer. |
| `text` | no | Free text when `Other` is selected. |

Skipped answers have `status: "skipped"`, `choice_id: null`, and `text: null`.

For a confirmation question carrying a `proposal`, `choice_id: "accept"` is the
user's authorization for the backend to issue an approval token for that exact
proposal. Any other answer, including `reject` or `skipped`, issues no token and
leaves the Dataset or Template unchanged.

## Composer Modes

The composer has two modes:

- normal free-input mode;
- ask-user-question mode.

Both modes use the exact same composer shell: same width, placement, colors,
border, corner radius, shadow, and spacing system. Only the inner content changes.

Ask-user-question mode does not create a second card above the composer.

## Question Layout

Ask-user-question mode shows:

- progress text, such as `Question 2 of 3`;
- the current question;
- suggested answer rows, if `choices` are present;
- an `Other` row when `allow_other` is true;
- navigation actions.

There is no separate title or subtitle. The current question is the main text.

All answer rows use one neutral option style. `Other` is just the label `Other`,
with the same shape, font, spacing, border, and background as suggested answers.
It uses lighter text to signal that selecting it opens custom free text.

When the user selects `Other`, that row becomes a free-text input in the same row
style.

## Controls

- `Back` appears only when there is a previous question.
- `Back` returns to the previous question without submitting the current one.
- `Skip` advances without recording an answer for the current question.
- Selecting a suggested answer submits it immediately and advances to the next
  question (or finishes the flow, on the final question). There is no separate
  Next/Submit click for a plain suggested answer.
- Selecting `Other` opens the free-text row instead of advancing, since the user
  has not finished typing yet. A primary action appears to confirm the typed
  text: it says `Next` when another question follows, `Submit` on the final
  question.
- A question carrying a `proposal` (see Structured Proposals) keeps the same
  explicit confirm step after `accept`/`reject` is selected, since it authorizes
  a Dataset or Template write. The primary action appears and says `Next` or
  `Submit` the same way as for `Other`.
- After the final question is answered or skipped, the composer returns to normal.

## Composer HTML Sketch

This sketch captures the intended states and labels. It is not a requirement to
use these exact class names.

```html
<!-- Normal mode: the standard composer shell. -->
<form class="composer composer--normal">
  <button type="button" class="composer__attach">+</button>
  <textarea class="composer__input" placeholder="Ask anything"></textarea>
  <button type="submit" class="composer__send">Send</button>
</form>

<!-- Question mode: the same composer shell, different inner content. -->
<form class="composer composer--question">
  <div class="question-progress">Question 2 of 3</div>
  <div class="question-text">Which Dataset should I use?</div>

  <div class="question-options">
    <button type="button" class="question-option">
      Term babies admitted to NICU
    </button>
    <button type="button" class="question-option">
      Whole hospital database
    </button>
    <button type="button" class="question-option">
      Another saved Dataset
    </button>
    <button type="button" class="question-option question-option--other">
      Other
    </button>
  </div>

  <div class="question-actions">
    <button type="button" class="question-action">Back</button>
    <button type="button" class="question-action">Skip</button>
    <!-- Primary action only renders while confirming Other free text, or a
         proposal's accept/reject choice. A plain suggested answer has no
         primary action: clicking the option itself submits and advances. -->
    <button type="submit" class="question-action question-action--primary">
      Next
    </button>
  </div>
</form>

<!-- Final or single question: primary label changes from Next to Submit. -->
<button type="submit" class="question-action question-action--primary">
  Submit
</button>
```

## Acceptance Criteria

- A tool call with one question shows one composer question.
- A tool call with multiple questions shows one question at a time.
- Selecting a plain suggested answer (no `proposal`) submits it and advances
  immediately, with no separate Next/Submit click.
- Selecting `Other`, or a `proposal` question's `accept`/`reject` choice, shows a
  primary action instead of advancing immediately: `Next` when another question
  follows, `Submit` on the final question.
- `Back` is hidden on the first question and visible after the first question.
- `Skip` advances without an answer.
- Skipping every question returns the composer to normal mode.
- `Other` appears only when `allow_other` is true.
- `Other` matches the visual style of suggested answer rows.
- Selecting `Other` allows free-text entry.
- Normal mode and ask-user-question mode use the same composer shell styling.
- A confirmation question may carry a structured proposal for a Dataset or
  Template change.
- The thread schema does not pin the Dataset or Template patch grammar.
- The UI chooses the proposal renderer from `resource_type`; at minimum the
  composer shows the proposal's `summary` above the accept/reject choices (the
  opaque `patch` is never rendered raw).
- Accepting a proposal issues a backend-generated approval token bound to that
  exact proposal.
- Dataset and Template write tools reject agent writes that lack a valid approval
  token.
- Rejecting or skipping a proposal issues no token and applies no Dataset or
  Template change.
