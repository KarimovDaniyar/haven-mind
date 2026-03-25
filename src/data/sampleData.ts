import { Note, TimerSession, CanvasMainPage } from '../store/appStore';
import { getDefaultWorkspaceCanvasFields } from './defaultWorkspaceCanvas';

/** Demo markdown for the canvas A4 main note — covers every supported construct. */
export const DEFAULT_CANVAS_MAIN_PAGE_CONTENT = `# Your desk, one sheet at a time

This **main note** is the center of the workspace: a plain *sheet* you can extend downward as ideas grow. Treat it as the place where scattered thoughts become something you can act on.

## Why a single surface helps

> Attention is finite. When every idea has its own tab, you pay a navigation tax. One long sheet keeps context in view and nudges you toward *sequential* thinking.

### A third-level heading

Use \`focus blocks\` as anchors: name the block, start a timer, and write only inside that window. Inline code like \`pomodoro\` is easy to spot when you scan.

---

## Markdown you can use here

| Element | Purpose | Tip |
|---------|---------|-----|
| Headings | Structure | Keep hierarchy shallow |
| **Bold** / *italic* | Emphasis | Sparingly |
| Lists | Steps & options | Break up dense prose |
| Tables | Compare ideas | Align columns with pipes |
| \`code\` | Terms & commands | Monospace in the flow |
| [[wiki-links]] | Jump to notes | Match note titles |

### Numbered habits that stick

1. Capture first — polish later  
2. Link related notes so the graph stays honest  
3. Review the sheet weekly and archive what aged out  

### Bullets for quick capture

- Close unrelated apps before a deep-work block  
- Keep the main note open; it reminds you what matters *right now*  
- When stuck, write one honest sentence — momentum follows  

Related reading in your library: [[Deep work principles]], [[Flow state]], and [[Time blocking]] for shaping the week.

---

*End of demo — click anywhere on the sheet to edit, then click the canvas to save and render.*

Use \`/pagebreak\` on its own line (or the \`/\` menu → Page break) for a hard page break. Dashed lines mark soft A4 boundaries; use **PDF** on the action toolbar above this sheet to print.`;

export function createDefaultCanvasMainPages(): CanvasMainPage[] {
  return [{ id: 'main-p-1', content: DEFAULT_CANVAS_MAIN_PAGE_CONTENT }];
}

const now = Date.now();
const day = 86400000;

export const sampleNotes: Note[] = [
  {
    id: 'note-1',
    title: 'Deep work principles',
    type: 'text',
    content: `# The foundations of deep work

Deep work is the ability to focus without distraction on a cognitively demanding task. It's a skill that allows you to quickly master complicated information and produce better results in less time.

## Core concepts

> "Who you are, what you think, feel, and do, what you love — is the sum of what you focus on." — Cal Newport

The key principles are:

- **Work deeply** — build rituals and routines that minimize the need for willpower
- Embrace boredom — don't use distraction as a default
- Quit social media — apply the craftsman approach to tool selection
- Drain the shallows — schedule every minute of your day

## Related ideas

Understanding [[Flow state]] is essential for achieving deep work. The mental state described by Csikszentmihalyi maps directly to the deep work experience.

Pair this with [[Time blocking]] to structure your days for maximum depth.

## The four rules

1. Work deeply
2. Embrace boredom  
3. Quit social media
4. Drain the shallows

Each rule builds upon the last, creating a framework for sustained concentration.`,
    createdAt: now - 7 * day,
    updatedAt: now - 2 * day,
  },
  {
    id: 'note-2',
    title: 'Flow state',
    type: 'text',
    content: `# Flow state

Flow is the mental state of being completely immersed in an activity. Time distorts, self-consciousness fades, and performance peaks.

## Conditions for flow

- Clear goals at each step
- Immediate feedback
- Balance between challenge and skill

## Connection to deep work

This concept is central to [[Deep work principles]]. When you achieve flow during deep work sessions, the quality of output increases dramatically.

*The optimal challenge-to-skill ratio is roughly 4% above your current ability level.*`,
    createdAt: now - 5 * day,
    updatedAt: now - 3 * day,
  },
  {
    id: 'note-3',
    title: 'Time blocking',
    type: 'text',
    content: `# Time blocking

A method for structuring your day into blocks of focused time.

## Daily template

- **06:00 – 07:00** — Morning routine
- **07:00 – 09:30** — Deep work block 1
- **09:30 – 10:00** — Break
- **10:00 – 12:00** — Deep work block 2
- **12:00 – 13:00** — Lunch
- **13:00 – 14:30** — Shallow work
- **14:30 – 16:30** — Deep work block 3
- **16:30 – 17:00** — Shutdown ritual

## Rules

1. Every minute must be accounted for
2. Batching similar tasks reduces context-switching
3. Use overflow blocks for tasks that run long

See [[Weekly review]] for how to evaluate and adjust your blocks.`,
    createdAt: now - 4 * day,
    updatedAt: now - 1 * day,
  },
  {
    id: 'note-4',
    title: 'Weekly review',
    type: 'text',
    content: `# Weekly review

A structured process to reflect on the past week and plan the next one.

## Part 1: Reflection

Review your time blocks and note:
- Which deep work sessions were most productive?
- Where did you lose focus?
- What unexpected tasks consumed time?

## Part 2: Metrics

Track these numbers weekly:
- Total deep work hours
- Longest unbroken focus session
- Number of completed focus timer sessions
- Notes written and updated

## Part 3: Planning

- Set 3 primary objectives for the week
- Pre-block your deep work sessions
- Identify potential distractions and plan countermeasures

## The shutdown ritual

At the end of each work day:
1. Review task list
2. Transfer incomplete items
3. Scan calendar for tomorrow
4. Say "Shutdown complete" — this verbal cue signals your brain to release work thoughts`,
    createdAt: now - 3 * day,
    updatedAt: now - 12 * 3600000,
  },
  {
    id: 'note-5',
    title: 'Project thinking',
    type: 'canvas',
    content: '',
    createdAt: now - 6 * day,
    updatedAt: now - 1 * day,
    ...getDefaultWorkspaceCanvasFields(),
    canvasMainPages: createDefaultCanvasMainPages(),
  },
];

// Generate focus data for the heatmap
export function generateFocusData(): Record<string, number> {
  const data: Record<string, number> = {};
  const today = new Date();
  
  // 18 days of data over past 4 weeks
  const activeDays = [
    { offset: 0, minutes: 47 },   // today
    { offset: 1, minutes: 62 },
    { offset: 2, minutes: 35 },
    { offset: 3, minutes: 91 },
    { offset: 4, minutes: 28 },
    { offset: 5, minutes: 55 },
    // gap
    { offset: 8, minutes: 45 },
    { offset: 9, minutes: 72 },
    { offset: 10, minutes: 15 },
    // gap
    { offset: 13, minutes: 95 },
    { offset: 14, minutes: 60 },
    { offset: 15, minutes: 42 },
    { offset: 16, minutes: 30 },
    // gap
    { offset: 19, minutes: 88 },
    { offset: 20, minutes: 22 },
    { offset: 22, minutes: 50 },
    { offset: 24, minutes: 75 },
    { offset: 26, minutes: 38 },
  ];

  activeDays.forEach(({ offset, minutes }) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const key = d.toISOString().split('T')[0];
    data[key] = minutes;
  });

  return data;
}

export function generateTimerSessions(): { date: string; minutes: number; completedAt: number }[] {
  const today = new Date().toISOString().split('T')[0];
  return [
    { date: today, minutes: 25, completedAt: Date.now() - 3600000 },
    { date: today, minutes: 22, completedAt: Date.now() - 7200000 },
  ];
}
