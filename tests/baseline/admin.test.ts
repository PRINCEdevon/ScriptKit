// Baseline behaviour of demo data and the admin menu, run against both legacy/Code.gs and the
// bundle. Demo data records sixteen reports through the real report pipeline, so it also
// exercises feedback rules, cohort comparisons and the scoreboard.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEEK1_OPEN, startProgramme } from '../support/programme.js';
import { runBoth } from '../support/runtime.js';

const template = readFileSync(new URL('../../web/report-template.html', import.meta.url), 'utf8');
const WEB_APP = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';

describe('demo data', () => {
  it('adds demo teams and reports, shows their pages, and removes them again', async () => {
    const { legacy, bundle } = await runBoth((app) => {
      app.call('setup');
      app.call('menuAddDemo');
      const code = (id: string) =>
        String(
          app
            .table('Teams')
            .records()
            .find((r) => r['Team ID'] === id)?.['Private code'],
        );
      const added = app.snapshot();
      const views = { direct: app.get(code('DEMO1')), organisation: app.get(code('DEMO6')) };
      app.call('menuRemoveDemo');
      return { added, views, removed: app.snapshot() };
    });

    expect(bundle).toEqual(legacy);

    const tab = (snapshot: typeof legacy.added, name: string) =>
      snapshot.sheets.find((s) => s.name === name)?.values ?? [];
    const reports = tab(legacy.added, 'Reports');
    expect(reports).toHaveLength(17);
    expect(reports[1]).toEqual(
      expect.arrayContaining([
        'Demo Direct team',
        expect.stringMatching(/^Your first money from a customer: R200\./),
      ]),
    );
    expect(tab(legacy.added, 'Settings')).toContainEqual(
      expect.arrayContaining(['pretend_today', '2026-12-20']),
    );

    expect(legacy.views.direct).toMatchObject({
      ok: true,
      status: 'open',
      week: { n: 3 },
      totals: { revenue: 700, customers: 4, reportsSent: 2 },
      history: [{ week: 2 }, { week: 1, reply: expect.stringContaining('A real start') }],
    });
    expect(legacy.views.organisation).toMatchObject({
      status: 'submitted',
      pipeline: [
        { organisation: 'School A', stage: 4 },
        { organisation: 'School B', stage: 3 },
        { organisation: 'School C', stage: 2 },
      ],
    });
    const scoreboard = legacy.views.direct.scoreboard as {
      direct: { team: string }[];
      organisation: unknown[];
    };
    expect(scoreboard.direct.map((row) => row.team)).toEqual([
      'Demo team: hair products',
      'Demo team: tutoring',
      'Demo Direct team',
      'Demo team: laundry service',
    ]);
    expect(scoreboard.organisation).toHaveLength(3);

    expect(tab(legacy.removed, 'Teams')).toHaveLength(1);
    expect(tab(legacy.removed, 'Reports')).toHaveLength(1);
    expect(tab(legacy.removed, 'Settings')).toContainEqual(
      expect.arrayContaining(['pretend_today', '']),
    );
  });
});

describe('admin menu', () => {
  it('prepares the report page from the Drive template', async () => {
    const { legacy, bundle } = await runBoth((app) => {
      app.call('setup');
      app.addFile('ura-report TEMPLATE.html', template);
      app.google.ui.responses.push('https://example.com/not-a-web-app');
      app.call('menuPreparePage');
      app.google.ui.responses.push(WEB_APP);
      app.call('menuPreparePage');
      app.call('menuPreparePage'); // empty answer: reuses the saved address
      return { snapshot: app.snapshot(), check: app.call('checkSetup') };
    });

    expect(bundle).toEqual(legacy);

    const pages = legacy.snapshot.files.filter((f) => f.path.endsWith('/ura-report.html'));
    expect(pages.map((p) => p.trashed)).toEqual([true, false]);
    const page = pages[1]?.text ?? '';
    expect(page).toContain(`var WEB_APP_URL = '${WEB_APP}';`);
    expect(page).toContain('<title>URA report · USSAVI Revenue Accelerator</title>');
    expect(page).not.toMatch(/__PAGE_TITLE__|__PAGE_DESCRIPTION__|__PROGRAMME_NAME__|PASTE_YOUR/);
    expect(legacy.snapshot.dialogs.filter((d) => d.type === 'alert').map((d) => d.title)).toEqual([
      '',
      'The report page is ready',
      'The report page is ready',
    ]);
    expect(legacy.snapshot.sheets.find((s) => s.name === 'Settings')?.values).toContainEqual(
      expect.arrayContaining(['web_app_url', WEB_APP]),
    );
    expect(legacy.check).toMatch(/^Everything is in place\./);
    expect(legacy.check).toContain('page template "ura-report TEMPLATE.html" found');
  });

  it('filters, refreshes and updates links from the menu', async () => {
    const { legacy, bundle } = await runBoth((app) => {
      startProgramme(app);
      app.call('menuRemindersNow');
      app.now = WEEK1_OPEN;
      app.call('menuShowThisWeek');
      const filtered = app.snapshot();
      app.call('menuShowAll');
      app.call('menuRefreshLog');
      app.setting('report_page_url', 'https://reports.example.com/page.html');
      app.call('menuCreateLinks');
      return { filtered, after: app.snapshot() };
    });

    expect(bundle).toEqual(legacy);

    const reports = (s: typeof legacy.after) => s.sheets.find((sheet) => sheet.name === 'Reports');
    expect(legacy.filtered.activeSheet).toBe('Reports');
    expect(reports(legacy.filtered)?.filter).toEqual({ 1: { whenNumberEqualTo: 1 } });
    expect(reports(legacy.after)?.filter).toBeNull();
    expect(legacy.after.activeSheet).toBe('Report log');
    expect(legacy.after.dialogs[0]?.message).toBe(
      'No week is open yet (today counts as 2026-11-20).',
    );
    expect(legacy.after.toasts.at(-1)).toBe('4 existing links updated to the address in Settings.');
    const teams = legacy.after.sheets.find((s) => s.name === 'Teams')?.values ?? [];
    expect(
      teams
        .slice(1)
        .every((row) => String(row[9]).startsWith('https://reports.example.com/page.html?t=')),
    ).toBe(true);
  });
});
