// Baseline behaviour of the report page's API (doGet and doPost), run against both
// legacy/Code.gs and the bundle. The HTTP contract here is what web/report-template.html uses.
import { describe, expect, it } from 'vitest';
import {
  BEFORE_START,
  WEEK1_OPEN,
  WEEK1_TUESDAY,
  WEEK2_OPEN,
  codeOf,
  startProgramme,
  submission,
} from '../support/programme.js';
import { runBoth } from '../support/runtime.js';

const proof = {
  name: 'receipt.png',
  type: 'image/png',
  data: Buffer.from('fake image').toString('base64'),
};

const feedback = (...ids: string[]) => ({
  thisReport: { feedback: ids.map((id) => expect.objectContaining({ id })) },
});

describe('report page API', () => {
  it('serves team pages, and accepts, rejects and corrects reports', async () => {
    const { legacy, bundle } = await runBoth((app) => {
      startProgramme(app);
      const alpha = codeOf(app, 'Alpha');
      const beta = codeOf(app, 'Beta');
      const gamma = codeOf(app, 'Gamma');
      const delta = codeOf(app, 'Delta');
      const r: Record<string, unknown> = {};

      app.now = BEFORE_START;
      r.beforeStart = app.get(alpha);

      app.now = WEEK1_OPEN;
      r.open = app.get(alpha);
      r.submit = app.post(submission(alpha, {}, { files: [proof] }));
      r.duplicate = app.post(submission(alpha));
      r.submitted = app.get(alpha);
      r.unbalanced = app.post(submission(beta, { submitted_by: 'Cleo Three', no: '5' }));
      r.notAFounder = app.post(submission(beta, { submitted_by: 'Somebody Else' }));
      r.nothingSaid = app.post(
        submission(beta, { submitted_by: 'Cleo Three', customers_said: ' ' }),
      );
      r.noMentorAnswer = app.post(
        submission(beta, { submitted_by: 'Cleo Three', mentor_call: '' }),
      );
      r.badCode = app.post(submission('not-a-real-code'));
      r.badCodeView = app.get('not-a-real-code');
      r.unknownAction = app.post({ action: 'delete', t: alpha });
      r.unknownGet = app.request('doGet', { parameter: {} });
      r.malformed = app.request('doPost', { postData: { contents: '{' } });
      r.organisation = app.post(
        submission(
          gamma,
          {
            submitted_by: 'Dev Four',
            revenue: '0',
            new_customers: '',
            asked: '3',
            yes: '1',
            no: '1',
            not_yet: '1',
            goal_asks: '5',
            goal_revenue: '0',
          },
          {
            pipeline: [
              { organisation: 'Hospital A', stage: '1', note: 'First meeting' },
              { organisation: 'School B', stage: '2', note: '' },
            ],
          },
        ),
      );
      app.table('Teams').update({ 'Team name': 'Delta' }, { Status: 'Stopped' });
      r.stopped = app.post(submission(delta, { submitted_by: 'Finn Six' }));
      r.stoppedView = app.get(delta);

      app.now = WEEK1_TUESDAY;
      r.late = app.post(
        submission(beta, {
          submitted_by: 'Cleo Three',
          revenue: '0',
          new_customers: '0',
          asked: '0',
          yes: '0',
          no: '0',
          not_yet: '0',
        }),
      );
      r.correction = app.post({
        action: 'correct',
        t: alpha,
        week: 1,
        submitted_by: 'Ana One',
        note: 'Money was R350, not R300.',
      });
      r.correctionNoReport = app.post({
        action: 'correct',
        t: alpha,
        week: 5,
        note: 'Wrong week.',
      });
      r.correctionEmpty = app.post({ action: 'correct', t: alpha, week: 1, note: '' });

      app.now = WEEK2_OPEN;
      r.alphaWeek2Before = app.get(alpha);
      r.alphaWeek2 = app.post(
        submission(alpha, {
          revenue: '0',
          new_customers: '0',
          asked: '4',
          yes: '0',
          no: '3',
          not_yet: '1',
          mentor_call: 'No',
        }),
      );
      r.gammaWeek2 = app.post(
        submission(
          gamma,
          {
            submitted_by: 'Eva Five',
            revenue: '0',
            new_customers: '',
            asked: '4',
            yes: '2',
            no: '1',
            not_yet: '1',
            goal_asks: '5',
            goal_revenue: '0',
          },
          {
            pipeline: [
              { organisation: 'Hospital A', stage: '3', note: 'Proposal sent' },
              { organisation: 'School B', stage: '2', note: '' },
              { organisation: 'Clinic C', stage: '1', note: '' },
            ],
          },
        ),
      );
      r.alphaWeek2View = app.get(alpha);
      r.gammaWeek2View = app.get(gamma);

      return { responses: r, snapshot: app.snapshot() };
    });

    expect(bundle).toEqual(legacy);

    const r = legacy.responses;
    expect(r.beforeStart).toMatchObject({
      ok: true,
      status: 'not_started',
      week: null,
      firstWeek: { opens: 'Sunday 6 December' },
    });
    expect(r.open).toMatchObject({
      ok: true,
      status: 'open',
      week: { n: 1, due: 'Monday 7 December' },
      currency: 'R',
      shortName: 'URA',
    });
    expect(r.submit).toEqual({ ok: true });
    expect(r.duplicate).toMatchObject({ ok: false, error: 'duplicate' });
    expect(r.submitted).toMatchObject({ status: 'submitted', ...feedback('first_money') });
    expect(r.unbalanced).toMatchObject({
      ok: false,
      error: 'invalid',
      message: expect.stringContaining('must add up'),
    });
    expect(r.notAFounder).toMatchObject({
      ok: false,
      error: 'invalid',
      message: 'Please choose your name from the list.',
    });
    expect(r.nothingSaid).toMatchObject({
      ok: false,
      error: 'invalid',
      message: expect.stringContaining('question 3'),
    });
    expect(r.noMentorAnswer).toMatchObject({
      ok: false,
      error: 'invalid',
      message: expect.stringContaining('question 6'),
    });
    expect(r.badCode).toMatchObject({ ok: false, error: 'link' });
    expect(r.badCodeView).toMatchObject({ ok: false, error: 'link' });
    expect(r.unknownAction).toMatchObject({ ok: false, error: 'unknown' });
    expect(r.unknownGet).toMatchObject({ ok: false, error: 'unknown' });
    expect(r.malformed).toMatchObject({ ok: false, error: 'server' });
    expect(r.organisation).toEqual({ ok: true });
    expect(r.stopped).toMatchObject({ ok: false, error: 'stopped' });
    expect(r.stoppedView).toMatchObject({ ok: true, status: 'stopped' });
    expect(r.late).toEqual({ ok: true });
    expect(r.correction).toEqual({ ok: true });
    expect(r.correctionNoReport).toMatchObject({ ok: false, error: 'invalid' });
    expect(r.correctionEmpty).toMatchObject({ ok: false, error: 'invalid' });
    expect(r.alphaWeek2Before).toMatchObject({
      status: 'open',
      prev: { week: 1, goal_asks: 10, goal_revenue: 500 },
    });
    expect(r.alphaWeek2View).toMatchObject(feedback('asks_change', 'money_goal'));
    expect(r.alphaWeek2View).toMatchObject({
      history: [{ week: 2 }, { week: 1, corrections: ['Money was R350, not R300.'] }],
      scoreboard: { phase: 'Activity' },
    });
    expect(r.gammaWeek2View).toMatchObject({
      ...feedback('asks_change', 'org_moves'),
      pipeline: [
        { organisation: 'Hospital A', stage: 3 },
        { organisation: 'School B', stage: 2 },
        { organisation: 'Clinic C', stage: 1 },
      ],
    });

    const tab = (name: string) => legacy.snapshot.sheets.find((s) => s.name === name)?.values ?? [];
    expect(tab('Reports')).toHaveLength(6);
    expect(tab('Pipeline')).toHaveLength(6);
    expect(tab('Corrections')).toHaveLength(2);
    expect(legacy.snapshot.files).toEqual([
      expect.objectContaining({
        path: 'My Drive/Programme/URA proof of payment/Alpha/Week 1 - receipt.png',
        contentType: 'image/png',
        text: 'fake image',
      }),
    ]);
  });
});
