// Baseline behaviour of setup and the menu, run against both legacy/Code.gs and the bundle.
import { describe, expect, it } from 'vitest';
import type { Menu } from '../support/fake-google.js';
import { legacySource, publicFunctions } from '../support/legacy-source.js';
import { runBoth } from '../support/runtime.js';

function handlers(menu: Menu): string[] {
  return menu.items.flatMap((item) =>
    item.submenu ? handlers(item.submenu) : item.handler ? [item.handler] : [],
  );
}

describe('setup and the menu', () => {
  it('creates every tab with its defaults, and onOpen adds the full menu', async () => {
    const { legacy, bundle } = await runBoth((app) => {
      app.call('setup');
      app.call('onOpen');
      return app.snapshot();
    });

    expect(bundle).toEqual(legacy);

    const tab = (name: string) => legacy.sheets.find((sheet) => sheet.name === name)?.values ?? [];
    expect(legacy.sheets.map((sheet) => sheet.name)).toEqual([
      'Start here',
      'Settings',
      'Teams',
      'Weeks',
      'Reports',
      'Pipeline',
      'Corrections',
      'Feedback rules',
      'Report log',
    ]);
    expect(tab('Settings')).toHaveLength(18);
    expect(tab('Weeks')).toHaveLength(11);
    expect(tab('Feedback rules')).toHaveLength(21);
    expect(tab('Reports')[0]).toHaveLength(33);
    expect(legacy.scriptProperties).toEqual({ SHEET_ID: 'spreadsheet-1' });
    expect(legacy.timeZone).toBe('Africa/Johannesburg');
    expect(legacy.toasts).toEqual([
      'The sheet is ready. Next: add your teams in the Teams tab, or try "Add demo data".',
    ]);

    const menu = legacy.menus[0];
    expect(menu?.title).toBe('Revenue Accelerator');
    const menuHandlers = handlers(menu ?? { title: '', items: [] });
    expect(menuHandlers).toHaveLength(15);
    for (const name of menuHandlers) expect(publicFunctions(legacySource)).toContain(name);
  });

  it('repairs a sheet without overwriting values typed into Settings', async () => {
    const { legacy, bundle } = await runBoth((app) => {
      app.call('setup');
      app.setting('programme_name', 'Test Accelerator');
      app.setting('max_feedback_items', 4);
      app.call('setup');
      return app.snapshot();
    });

    expect(bundle).toEqual(legacy);
    const settings = legacy.sheets.find((sheet) => sheet.name === 'Settings')?.values ?? [];
    expect(settings).toHaveLength(18);
    expect(settings).toContainEqual(expect.arrayContaining(['programme_name', 'Test Accelerator']));
    expect(settings).toContainEqual(expect.arrayContaining(['max_feedback_items', 4]));
  });
});
