/**
 * "Prepare the report page": fills in the page template kept in Drive next to the Sheet
 * (<short name>-report TEMPLATE.html) with the web app address and the programme's name, and
 * saves the result as <short name>-report.html for upload to the website (see web/README.md).
 */
import {
  pageName,
  pageTemplateName,
  reportName,
  setSetting,
  settings,
} from '../shared/settings.js';
import { parentFolder } from '../reports/proof-files.js';

/** Menu: asks for the web app address, then prepares the page. */
export function menuPreparePage(): void {
  const ui = SpreadsheetApp.getUi();
  const saved = String(settings().web_app_url || '').trim();
  const response = ui.prompt(
    'Prepare the report page',
    'Paste the web app address from the Deploy screen. It starts with https://script.google.com/ and ends with /exec.' +
      (saved
        ? '\n\nOr leave this empty to use the address already saved in Settings:\n' + saved
        : ''),
    ui.ButtonSet.OK_CANCEL,
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const url = String(response.getResponseText() || '').trim() || saved;
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
    ui.alert(
      'That does not look like the web app address. It should start with https://script.google.com/ and end with /exec. Copy it again from Deploy > Manage deployments.',
    );
    return;
  }
  const page = preparePage(url);
  ui.alert(
    'The report page is ready',
    page.name +
      ' is now in the same Drive folder as this Sheet, with your web app address already inside it.\n\n' +
      uploadSteps(page.name),
    ui.ButtonSet.OK,
  );
}

/** Says where to upload the page so that it sits at the report_page_url setting. */
export function uploadSteps(fileName: string): string {
  const url = String(settings().report_page_url || '').trim();
  const match = url.match(/^https?:\/\/([^/]+)\/(.*)$/);
  if (!match) return 'Upload it to your website so that it sits at ' + url + '.';
  const host = match[1] as string;
  const path = (match[2] as string).replace(/\?.*$/, '');
  if (!path || /\/$/.test(path)) {
    const folder = path.replace(/\/$/, '');
    return (
      'Upload it in File Manager: open ' +
      host +
      ' > public_html' +
      (folder ? ', create a folder called "' + folder + '" (once), open it,' : ',') +
      ' upload ' +
      fileName +
      ' and rename it to index.html. It then opens at ' +
      url +
      '.'
    );
  }
  return (
    'Upload it to ' +
    host +
    ' > public_html' +
    (path.indexOf('/') > 0 ? '/' + path.replace(/\/[^/]*$/, '') : '') +
    ' so that it sits at ' +
    url +
    '.'
  );
}

/**
 * Makes the uploadable page from the Drive template, replacing any earlier copy, and records
 * the web app address in Settings.
 */
export function preparePage(url: string): { name: string } {
  const folder = parentFolder();
  const config = settings();
  const templateName = pageTemplateName();
  const name = pageName();
  const templates = folder.getFilesByName(templateName);
  if (!templates.hasNext()) {
    throw new Error(
      'Could not find "' +
        templateName +
        '" in the same Drive folder as this Sheet. Its name must match the short_name in Settings.',
    );
  }
  let html = templates.next().getBlob().getDataAsString('UTF-8');
  const placeholder = "'PASTE_YOUR_WEB_APP_URL_HERE'";
  if (html.indexOf(placeholder) < 0) {
    throw new Error(
      'The page template has been changed: it no longer contains the place for the web app address.',
    );
  }
  const programme = String(config.programme_name || 'Mashauri Revenue Accelerator');
  const fill: Record<string, string> = {
    __PAGE_TITLE__: reportName() + ' · ' + programme,
    __PAGE_DESCRIPTION__:
      'The weekly report page for teams in the ' +
      programme +
      ". It only opens with a team's private link.",
    __PROGRAMME_NAME__: programme,
  };
  // A string pattern, as in the original: `$` sequences in the address are special.
  html = html.replace(placeholder, "'" + url + "'");
  Object.keys(fill).forEach((key) => {
    html = html.split(key).join(htmlEscape(fill[key] as string));
  });
  const earlier = folder.getFilesByName(name);
  while (earlier.hasNext()) earlier.next().setTrashed(true);
  folder.createFile(Utilities.newBlob(html, 'text/html', name));
  setSetting('web_app_url', url);
  return { name };
}

export function htmlEscape(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
