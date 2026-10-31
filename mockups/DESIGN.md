# AssetDB design language (Stage 1, revision 4: the baseline)

Status: **this is the baseline for Stage 2** (once approved). `tokens.css` and `app.css` are the reference implementation; `app.js` is the interactive mockup. No production file is touched.

View: open `mockups/index.html`. The **Mockup controls** panel (bottom left) switches scenario (normal, first run, loading), forces the next save to fail at config / saved search / KV sync, toggles light and dark, and counts clicks. URL parameters: `?theme=dark`, `?scenario=first|loading`, `?tab=sources|fields|pipeline|settings`, `?mk=0`. `before.html` is the current flow. Screenshots (light and dark, 1440x900) are in `screens/`.

## Decisions applied in this revision

| Request | What changed |
|---|---|
| Only the reference design | Designs A, B, C and the skin switch are gone. One layout: section nav with next run and Run now at the right, a status strip, page title with description and primary action, a rounded read-only table, an editor card beside it |
| Dark theme from Splunk's palette | Dark surfaces and foregrounds are Splunk Enterprise dark (`@splunk/themes` 1.13.0): page #171d21, section #1e2427, text #e1e6eb, muted #818d99, control border #75797a, status colours from Splunk. The teal accent is kept |
| Remove the navigation bar | Removed (Splunk provides it). The brand, Search and Configure links are gone. The page starts with the section nav (Sources, Fields, Pipeline, Settings) |
| System fonts | System UI stack and system monospace only. Nothing is bundled or fetched |
| Rows get Duplicate and Remove | Each row has three **icon** buttons: Edit (pencil), Duplicate, Remove, all the same style, each with a name and a hover title. The editor footer is just Save and Cancel |
| Row layout (revision 5) | **Sources:** Source with the lookup name as subtext, Role, Scope, Max age, Rows, an **Enabled switch**, and three icon actions. **Fields:** the key icon sits beside the name, then Description, an **Enabled switch** and three icon actions. A warning icon beside a name flags problems and explains them in a tooltip: a source whose lookup no longer exists, a source that returned no rows, a field (key or not) that no enabled source supplies. The status strip and table footers count items needing attention. Toasts show one at a time at the bottom left, clear of the row actions |
| Compact tables | **Fields:** Field, Key, Description (Case, Merge and Cleaning removed). **Sources:** Source, Lookup (its own column, app name removed), Role, Scope, Max age, Rows, State (Row filter removed). One line per row |
| Cleaner edit shelf | Help text moved into tooltips (an "i" button beside each label). The section pills and subtitle are gone. Rarely used options moved into a collapsed **Advanced** section. Switches are one compact row each |
| Consistent buttons | One button system, see below |

Also kept from earlier: draft-and-save (nothing is written until Save, discard dialog on every exit), read-only tables, one table with keys first, no filter badges.

## Input components: what each setting uses and why

| Setting | Control | Reason |
|---|---|---|
| Key field, Case sensitive, Use global ignore list, Keep original case, Flag conflicts, Enabled, Record changes | **Switch** | A yes/no state of a feature, one row each, label on the left |
| Role (2 choices), Value type (2 choices) | **Segmented control** | Two or three mutually exclusive options that should all be visible. Real radio group underneath |
| Merge method (7), Normalizer (7), Validation (5), Timestamp column (many) | **Select** | Many options, one choice |
| Name, Description, Row filter, Scope | **Text input** (mono for names and filters) | Free text |
| Max values, Max keys, Max rows per key, Runs to keep, change log rows | **Number input** | Whole numbers with a range and an error message |
| Max row age | **Number with unit** in one bordered control | Value and unit belong together |
| Minimum size versus last run | **Number with a % suffix** | Same shared component |
| Ignore values, Key blocklist, Global ignore list | **Chip list** | Open-ended list of short values, with `re:` and `cidr:` tags and inline validation |
| Only accept values from | **Chip list limited to existing sources** (suggestions, rejects unknown names) | Was a free-text comma list, which allowed typos |
| Lookup | **Combobox** with search | Long list with app names |
| Column mapping | Select (lookup column) → text input with suggestions (asset field) | A new field name is allowed |
| Overwrite with an empty result | Static text "Never" | It cannot be changed, so it is not an input |

One look for all of them: 36px height, 8px radius, 1px control border, same focus ring, label above with an optional "(optional)" and an "i" tooltip, error below with an icon.

## Buttons

| Kind | Look | Used for |
|---|---|---|
| Primary | Filled teal, white text | The main action of a region: Add field, Add source, Save, Add (in the editor), Add N fields |
| Secondary | White, outlined, dark text | Everything else: Run now, Add CIM preset, Cancel, Run preview, Expand all, Discard changes, Add mapping |
| Destructive | Filled red, white text | The confirm button of a remove or discard dialog only |
| Icon | Borderless, grey, 30px | Edit, Duplicate, Remove, Close, Dismiss, remove mapping. Remove turns red on hover. Every icon button has an accessible name that includes the object |
| Link | Teal text | Run history |

Sizes: 36px standard, 30px small (in rows, banners and the editor). Exactly one primary per region. Disabled is 50% opacity.

## Tokens

Light (neutral greys, teal accent): page and surface #ffffff, hairlines #e4e7ec, table header #f9fafb, text #101828, secondary #475467, accent #0b6e6e, control border #8c95a3, selected row #f0f6f6, status colours #067647 / #b54708 / #b42318.

Dark (Splunk): see the table in the first section. Accent link #5fd0d0, primary fill #0b6e6e with white text, selected row #12333a (derived), status text #a4e9ae / #f8be34 / #f1b9b3 on #0b4613 / #3d3208 / #562a25 (Splunk's weak-background colours).

Measured contrast (WCAG): light text 17.8:1, secondary 7.7, accent 6.05, white on accent 6.05, status 5.2 to 6.05, control border 3.0; dark text on section about 12.5, secondary about 10, muted 4.6, link 9.65, primary text 6.05, control border 3.6. Light control borders were darkened from the reference's #d0d5dd (about 1.5:1) to meet 3:1.

Scales: type 12, 13, 14, 16, 22, 24 (page title 22). Spacing 4, 8, 12, 16, 24, 32, 48. Radii 8px controls, 12px panels. Motion 90, 160 and 240ms with ease-out for entering and in-out for leaving, all collapsed under `prefers-reduced-motion`. Used for: editor enter and exit, the save check mark, the saving spinner, banners, a row flashing after save, changed SPL lines flashing, chips, skeleton shimmer, the run bar.

## Components

**Table (read-only).** Real `<table>` with headers and a hidden caption, one line per row. Keys first, then by name. Key shows a key icon and the word "Key". No inputs. Row actions are three icon buttons (Edit, Duplicate, Remove); clicking elsewhere in a row also opens the editor. With the editor open, the Sources table hides Scope and Max age so the actions never clip.

**Editor card.** Docked beside the table (a full-height sheet under 1100px). Sections Identity, Merge, Clean-up for fields; Source, Rows, Field mapping for sources; a collapsed Advanced. Footer: Save (disabled until something changes) and Cancel. `Ctrl/Cmd+S` saves. A failed config write keeps the card open with the draft.

**Tooltip.** An "i" button (16px) beside the label, `aria-describedby` to the text. Shows on hover and keyboard focus, hides on blur and Esc (Esc hides the tooltip first, not the editor). The text is positioned with `position: fixed`, so it is never clipped by the scrolling editor, and it flips below when there is no room above. No help text is shown inline; only validation errors are.

**Status strip.** Always visible under the section nav: All changes saved, Saving…, Unsaved changes, Not fully saved, tinted to match, plus last run, asset count and change, and the merge search state. A failure adds a banner that names the step that failed with one retry for just that step.

**Modals.** Remove (field or source), add CIM preset, discard unsaved changes. `alertdialog`, Tab trapped, Esc cancels, focus on the safe button and returns to the opener.

**Settings.** Titled groups with label-left, control-right rows. A Save bar with Discard and Save settings.

## Accessibility baseline

Tabs with roving tabindex and arrow keys; 2px focus ring; the editor takes focus on open and returns it on close; shortcuts `/` filter, `n` add, `Esc`, `Ctrl/Cmd+S`. Checked in a browser with Playwright: no inputs in tables, three actions per row, editor focus and dirty state, tooltip shows on hover, chip validation, Esc opens the discard dialog with focus on Keep editing, save writes only on Save, duplicate opens a prefilled add form, remove asks first, a failed save keeps the editor and Try again completes it, and no console errors. Not verified: screen readers, an automated axe run.

## Not built or not verified

SPL shown is illustrative, not from `generator.js`. The live "effect on the merge search" panel from the earlier Design B was dropped with that design and could come back as an optional editor section. How Splunk Web tells the page whether it is in light or dark mode is not verified; the mockup follows the OS with a manual override. The icon concept in `icons/` still uses the converging-lines mark you asked to remove from Sources.
