# QA Projects — project management

A responsive project workspace inspired by Monday.com, Jira, and Asana. Gantt is the default view.

## Docker setup

### Prerequisites

- Git.
- Docker Desktop on macOS or Windows, or Docker Engine with the Compose plugin on Linux.
- A running Docker daemon and an available host port (default: `3001`).

Node.js and npm are included in the container; no host Node.js installation is needed to run the app with Docker.

### Clone and start

```sh
git clone https://github.com/roychow352DR/project_management_tool.git
cd project_management_tool
docker compose up --build -d
```

Open **[QA Projects](http://localhost:3001/)**. The first launch uses sample projects from `seed.json`.

The `orbit` service runs Node.js 22 as a non-root user. Compose maps host port `3001` to container port `3000`, persists workspace data in a named volume, and restarts the container unless it was explicitly stopped.

### Status and logs

```sh
docker compose ps
docker compose logs --tail=100 orbit
```

The health check runs every 30 seconds, so a newly started container can briefly show `health: starting`. A successful startup becomes `healthy`.

### Change the host port

Create a `.env` file beside `compose.yaml` with the required port:

```dotenv
ORBIT_PORT=8080
```

Then run `docker compose up -d` and open `http://localhost:8080/`. The container still listens on port `3000`. Local `.env` files are excluded from Git.

### Stop, restart, and update

Temporarily stop and restart the existing container:

```sh
docker compose stop
docker compose start
```

After pulling a code update, rebuild and recreate the service:

```sh
git pull --ff-only
docker compose up --build -d
```

To remove the container and network while retaining saved data:

```sh
docker compose down
```

### Persistent data

Workspace data is stored at `/app/data/workspace.json` in the `orbit-data` named volume. Compose prefixes the volume name with its project name; keep the same checkout directory or Compose project name when updating an existing installation so it reuses the same data volume.

Rebuilding the image and running `docker compose down` retain the data volume. **`docker compose down -v` deletes the saved workspace.** Runtime data and local backups are excluded from this repository; cloning it starts a fresh sample workspace.

### Troubleshooting

- **Docker connection error:** start Docker Desktop or the Docker daemon, then retry.
- **Port already allocated:** select another `ORBIT_PORT` in `.env` and run `docker compose up -d`.
- **Unhealthy container:** inspect `docker compose logs --tail=100 orbit` for startup or data-volume errors.
- **Changes missing after an update:** rebuild with `docker compose up --build -d`, then refresh the browser.

## Local development

For development without Docker, install Node.js 22 or newer, then run:

```sh
npm start
```

Open [localhost:3000](http://localhost:3000/). No npm dependencies are required. Local data is stored in `data/workspace.json`, independently of the Docker volume. Override `PORT` or `DATA_DIR` if needed.

## Features

- Create projects and create, edit, and delete tasks. Delete projects with all associated tasks; restore deleted items from Trash.
- Overview, List, Board, Backlog, and Gantt views use the same persistent data.
- Search and filter tasks by status. Overview and QA Tasks show active sidebar highlights.
- White light mode and a navy dark mode, with a remembered browser preference and navy theme accents.
- Workspace settings for adding, renaming, and removing QA Owners, statuses, priorities, and groups.
- Custom text, number, date, dropdown, and checkbox fields, available in task details, list columns, and CSV exports.
- QA Owners, priorities, descriptions, date ranges, and finish-to-start dependencies.
- Gantt bars generated from dates, with status colors, dependency connectors, milestones, zoom, today marker, and collapsible groups. Daily, Monthly, and Quarterly displays use calendar boundaries.
- Drag Gantt bars to reschedule; downstream tasks shift to respect dependencies.
- Drag Kanban cards between workflow states.
- Export Gantt charts as PNG images, SVG images, or PDF documents. PDFs use chart-sized pages with automatic row/date pagination and repeated labels. CSV exports follow the selected List fields.
- Save List column visibility and order per project, including built-in and custom fields.
- 12px interface text and consistent QA terminology.
- Atomic file persistence, non-root Docker container, and health check.

## Research and product choices

Three leading, relevant benchmarks were selected, rather than asserting a universal market-share ranking:

- **Monday.com**: visual boards and date-driven Gantt views. Adopted clear phase colors, schedule bars, and dependency visualization. [Official Gantt documentation](https://support.monday.com/hc/en-us/articles/360015643840-The-Gantt-Chart-View-and-Widget).
- **Jira**: explicit workflow states and connected planning views. Adopted a Kanban workflow, task identifiers, priorities, and timeline coordination. [Official features](https://www.atlassian.com/software/jira/features).
- **Asana**: task ownership, flexible views, and progress visibility. Adopted QA Owners, task details, project summaries, and shared data across views. [Official features](https://asana.com/features).

## Scope

This is a working single-workspace MVP for local or trusted-network use. It has no authentication, authorization, invitations, or real-time synchronization. The displayed team members are sample QA Owners. Concurrent browsers use last-write-wins workspace updates. Add authentication and a transactional database before using it as a public multi-user service. Dependencies support one finish-to-start predecessor per task in the editor; dates use UTC calendar days.

## Customize your workspace

Open **Field settings** in the project header or **Workspace settings** in the sidebar. Settings apply to all projects. Rename options in place; existing tasks keep their assignments. Removing an option moves its tasks (including tasks in Trash) to the first remaining option. Status categories control completion counts independently of the displayed status name.

Under **Custom fields**, add a name and field type, then configure dropdown choices if applicable. Save settings before entering field values on tasks. Existing field types are fixed to protect stored values. Removing a field removes its stored values; removing a custom dropdown choice clears values using that choice.

Use **Delete project** in the project header, or **Delete task** in task details (also available directly in the list). A confirmation shows what will be moved to Trash. Use the sidebar **Trash** to restore items. If an individual task's parent project was deleted separately, restore the project first.

## Tests

```sh
npm test
```

The tests cover legacy-data migration, dropdown renames/removal, custom values, input validation, and deletion/restoration of projects and linked tasks.

## QA planning controls

- **Field settings → Statuses**: choose a color for each status. Colors appear in List status badges, Board cards/columns, Gantt bars, milestones, and chart exports.
- **List → Columns**: select visible fields and move them up/down to set column order. **Apply** saves the layout for the current project. Task name and Actions remain visible; hidden fields retain their data.
- **Gantt display**: select Daily, Monthly, or Quarterly, with default horizons of 180 days, 24 months, or 12 quarters. Select a shorter or longer horizon, scroll horizontally, use the date slider, or move with the earlier/later arrows. Arrows extend the timeline when its edge is reached. Monthly and Quarterly periods align with calendar boundaries; Monthly uses quarter/month headers. Zoom changes the scale; dragging bars moves tasks by whole days. The TODAY marker uses 11px text.
- **Gantt → Export**: opens a preview for PDF, PNG, or SVG, with adjustable start/end dates, preview zoom, and page navigation. The complete selected date range—including empty planning periods—is retained. Current search/status filters apply; collapsed groups are expanded in the export. PDF defaults to the Full range layout on each page with task rows continued as needed; Detailed pages split the timeline for larger labels. The preview and download use the same chart rendering. PDF pages contain high-resolution chart images; SVG retains vector text. Very large images are directed to PDF; PDF exports are limited to 200 pages.

- **Export appearance**: charts include an outer border, subtle calendar grid lines, start–end dates beside timeline bars, and an 11px TODAY marker when today falls within the selected date range. Task owner details and the branding footer are excluded. PDF page numbers remain available for multi-page charts.
- **QA Owner**: new tasks default to Unassigned (an empty stored value). Existing owners can be cleared. Unassigned tasks remain unassigned through settings updates; removing an owner clears that assignment on active and deleted tasks.
- **Priorities**: Low uses green, Medium amber, and High red. Colors appear in List badges, Board cards, and the task details selector. Customize priority names and colors in Field settings → Priorities.

Validation includes calendar/leap-year geometry, Today-marker positioning, date-range placement at chart edges, status-color persistence, List layout persistence, PDF structure and pagination, plus browser checks and visual inspection of exported files.

## List filters

Use **List → Filters** to combine standard and custom field conditions. The field picker follows Field settings, including fields hidden from the List. Choose **All conditions** or **Any condition**; dropdowns use configured options, numbers and dates support inclusive ranges, text supports matching, and checkboxes support Yes/No. **Is empty** handles unassigned or missing values separately from zero and No.

Active filters appear above the List, can be removed individually, and also apply to List CSV exports. **Clear filters** resets field conditions, status, and task search. Conditions remain associated with each project while switching views in the current page session. Renamed fields/options retain their filters; deleted fields/options remove stale conditions. Backlog supports the same columns and filters, with separate filter conditions for active and backlog tasks.

## Backlog and optional dates

Open **Backlog** in the sidebar or project tabs to create and manage tasks awaiting planning. Use **Move to backlog** from a List row or Board card; use **Move to active** in Backlog when ready. The task editor also includes a **Planning** selector. Moving tasks retains their status, ownership, custom fields, dates, and dependency links. Backlog tasks are excluded from active views, Gantt charts, previews, and chart exports.

**Start date** and **End date** are independently optional and default to empty on new tasks. Active tasks with missing dates remain in List and Board. Only active tasks with both dates appear on Gantt; its **Unscheduled → View tasks** control finds tasks needing dates. If both dates are entered, the end must be on or after the start.

Dependencies reschedule only fully dated active tasks with fully dated active predecessors. Backlog and undated tasks retain their entered dates. Returning a fully dated task to active planning applies its dependency constraints.

## Task details

### Subtasks

Open a task and select **Add subtask** in its **Subtasks** section, or use **＋ Subtask** in List, Backlog, or Board. Each task can have any number of subtasks; subtasks can also have their own subtasks. Each retains its own status, priority, QA Owner, description, custom fields, dependencies, and optional dates. Dates and progress are independent of the parent. New subtasks inherit the parent's group, priority, and planning state; ownership and dates start empty.

Task details list direct subtasks. Adding or opening one saves the current task first. Creating a subtask closes the dialog and returns to the current project view. Use **Parent task** to reassign a task or select **None** to make it a top-level task. Circular relationships and parents from another project are rejected. List shows parent context and subtask counts; **Parent task** is also available in Columns and Filters.

**Gantt → Show subtasks** controls subtask visibility for the current project and is saved across reloads. Subtasks are hidden by default. When enabled, scheduled active subtasks appear with indentation, including when a parent has no dates. Preview and PDF, PNG, and SVG exports follow the same setting. Backlog and undated tasks remain excluded. Hiding a subtask does not change its dates or scheduling dependencies.

Moving a parent to Backlog or active planning moves its descendants with it. A subtask can be backlogged separately; its parent must be active before it can return to active planning. Deleting a parent moves the entire subtree to one Trash entry, with restoration preserving relationships. Restore a separately deleted parent before restoring its child.

There is no configured task or subtask count limit. Browser resources and existing export size/page limits still apply. Workspace saves have a 50 MiB transport limit, adjustable with the container environment variable `MAX_WORKSPACE_BYTES` (bytes).

### Descriptions and identifiers

Descriptions automatically recognize HTTP, HTTPS, and `www.` links. Links open in a new tab from task details or the Description List column. Use **Edit** to update a description and **Preview** to read it; detected links are also available while editing. **Save changes** saves the task. Clicking outside the task dialog dismisses it without saving pending edits.

Task numbers display the QA prefix followed by a sequential number: **QA-1, QA-2, QA-3, …**. Tasks and subtasks share one sequence across the workspace. The display prefix preserves existing numbers and relationships. Existing tasks are numbered in their saved order, followed by tasks in Trash; parent relationships, dependencies, and recovery links are updated together. New tasks continue the saved sequence, including after deletion or restart. The numeric migration keeps a copy of the previous workspace in `workspace.before-numeric-ids.json` inside the Docker data volume.

## Gantt reference styling

The interactive chart and exports use a white background by default. The **Dark mode** switch in the header applies navy (`#171b34`) across the app, including the Gantt chart, lists, boards, and dialogs. The preference is stored per browser and applied before styles load. Export preview starts with the active appearance and includes an independent **Appearance** selector for Light or Dark PDF, PNG, and SVG output.

Both modes retain fine calendar grid lines, 18px rounded bars, 36px rows, 24px vertical body padding, and a centered status legend. The current period is highlighted with the navy theme accent. Body text is 12px and the TODAY label is 11px. Figtree is bundled locally and embedded in SVG exports, so chart typography does not depend on remote font requests. The source PDF is image-based; Figtree approximates its visual appearance.

PDF pages follow the chart dimensions with padding built into the chart, avoiding blank paper below short schedules. Existing status colors, task data, date ranges, dependencies, and export controls are retained. Font source and license: [Figtree](https://github.com/erikdkennedy/figtree), `public/fonts/OFL-Figtree.txt`.
