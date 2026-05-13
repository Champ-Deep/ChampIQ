# ChampIQ Manifest Vocabulary Reference

All vendor extensions follow the `x-champiq` and `x-champiq-field` conventions.

## Top-Level `x-champiq` Object

| Key | Type | Description |
|-----|------|-------------|
| `tool_id` | string | Unique tool identifier (snake_case) |
| `version` | string | Semver |
| `category` | string | `research`, `outreach`, or `qualification` |
| `status` | string | `active`, `inactive`, or `beta` |
| `canvas.node.label` | string | Display name in sidebar and node header |
| `canvas.node.icon` | string | Lucide icon name (PascalCase) |
| `canvas.node.color` | string | Hex color for node header and sidebar tile |
| `canvas.node.accepts_input_from` | string[] | List of `tool_id` values allowed as source nodes |
| `transport.rest.action.endpoint` | string | Backend endpoint for the primary action |
| `transport.rest.action.button_label` | string | Text shown on the action button |
| `transport.rest.action.async` | boolean | Whether the action returns a job_id for polling |
| `transport.rest.health` | string | Health check endpoint |
| `transport.rest.populate` | object | Map of field key to populate endpoint URL |
| `transport.cli.binary` | string | CLI binary name |
| `transport.cli.command` | string | Subcommand |
| `transport.cli.args` | string[] | Arg list. `{payload}` is replaced with JSON payload. |

## Per-Field `x-champiq-field` Extension

| Key | Values | Description |
|-----|--------|-------------|
| `widget` | `select`, `text`, `number`, `textarea` | Override RJSF widget |
| `populate_from` | string | Key from `transport.rest.populate` to fill select options |
