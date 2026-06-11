// SpeakWise tutorial scene definitions — shared by narrate.mjs (TTS) and
// tutorial.mjs (recorder), so narration and on-screen action stay in sync.
//
// Each scene: { id, narration, run(page, h) }
// h = helpers: { moveClick, type, settle, wheel } (see tutorial.mjs)
// A scene's on-screen action should comfortably fit its narration length;
// the runner holds the frame until the narration finishes.

const STUDENT = {
  email: process.env.STUDENT_EMAIL || 'demo.student@speakwise-test.com',
  password: process.env.STUDENT_PASSWORD || 'Demo-Student-2026!',
  accessCode: process.env.STUDENT_ACCESS_CODE || 'DEMO'
};
const INSTRUCTOR = {
  email: process.env.INSTRUCTOR_EMAIL || 'demo.instructor@speakwise-test.com',
  password: process.env.INSTRUCTOR_PASSWORD || 'Demo-Instructor-2026!'
};
const COURSE_PASSCODE = process.env.COURSE_PASSCODE || 'JOIN2026';

export const FLOWS = {
  student: [
    {
      id: '01-landing',
      narration:
        'Welcome to SpeakWise — an AI oral assessment platform built for real coursework. ' +
        'Instead of a written quiz, you have a structured spoken interview with an AI examiner, ' +
        'and your instructor reviews the evidence behind every score.',
      run: async (page, h) => {
        await h.settle(1200);
        await h.wheel(page, 300, 4);
        await h.wheel(page, -300, 4);
      }
    },
    {
      id: '02-enter-student',
      narration:
        'From the landing page, choose the Student Workspace to begin.',
      run: async (page, h) => {
        await h.moveClick(page, page.getByRole('button', { name: /student workspace|^student$/i }).first());
        await h.settle(1000);
      }
    },
    {
      id: '03-sign-in',
      narration:
        'Sign in with your account. If you are new, you can create an account in a few seconds — ' +
        'your name and institution travel with you, so you never have to re-enter them later.',
      run: async (page, h) => {
        await h.type(page, page.locator('input[type="email"]').first(), STUDENT.email);
        await h.type(page, page.locator('input[type="password"]').first(), STUDENT.password);
        await h.moveClick(page, page.getByRole('button', { name: /^sign in$/i }).first());
        await page.waitForLoadState('networkidle').catch(() => {});
        await h.settle(1500);
      }
    },
    {
      id: '04-institution',
      narration:
        'Your institution gives you an access code. Enter it once, and you will only ever see ' +
        'the courses that belong to your school — everything in SpeakWise is scoped to your institution.',
      run: async (page, h) => {
        const code = page.getByPlaceholder(/access code/i).first();
        if (await code.count()) {
          await h.type(page, code, STUDENT.accessCode);
          const cont = page.getByRole('button', { name: /^continue to courses$/i }).first();
          if (await cont.count()) await h.moveClick(page, cont);
          await page.waitForLoadState('networkidle').catch(() => {});
        }
        await h.settle(1500);
      }
    },
    {
      id: '05-courses',
      narration:
        'This is your course list. Each card is an oral exam your instructor has published. ' +
        'Pick the course you are scheduled to take.',
      run: async (page, h) => {
        await h.settle(800);
        // Recovery: if the access step is still showing, push through it.
        const cont = page.getByRole('button', { name: /^continue to courses$/i }).first();
        if (await cont.count()) {
          await h.moveClick(page, cont);
          await page.waitForLoadState('networkidle').catch(() => {});
          await h.settle(1200);
        }
        const join = page.getByRole('button', { name: /^join .*(cell biology|demo oral exam)/i }).first();
        const anyJoin = page.getByRole('button', { name: /^join /i }).first();
        if (await join.count()) await h.moveClick(page, join);
        else if (await anyJoin.count()) await h.moveClick(page, anyJoin);
        await h.settle(1500);
      }
    },
    {
      id: '06-pre-interview',
      narration:
        'Before the interview starts, SpeakWise keeps things calm. Your name is already filled in. ' +
        'Run the microphone check, speak a sentence, and confirm the level indicator responds.',
      run: async (page, h) => {
        const mic = page.getByRole('button', { name: /^test mic$/i }).first();
        if (await mic.count()) await h.moveClick(page, mic);
        await h.settle(3000);
        const stop = page.getByRole('button', { name: /^stop$/i }).first();
        if (await stop.count()) await h.moveClick(page, stop);
      }
    },
    {
      id: '07-start-interview',
      narration:
        'Enter the passcode your instructor shared, and start when you are ready. ' +
        'The AI examiner speaks first, asks one question at a time, and waits for you — ' +
        'a quiet pause is fine; it will gently prompt you if you need a moment.',
      run: async (page, h) => {
        const pass = page.getByPlaceholder(/^entry code$/i).first();
        if (await pass.count()) await h.type(page, pass, COURSE_PASSCODE);
        const start = page.getByRole('button', { name: /start interview|enter classroom/i }).first();
        if (await start.count()) await h.moveClick(page, start);
        await page.waitForLoadState('networkidle').catch(() => {});
        await h.settle(4000);
      }
    },
    {
      id: '08-wrap-up',
      narration:
        'When the interview ends, you immediately see your score, rubric-based feedback, ' +
        'the full transcript, and a concept map of your reasoning. If a result is flagged for ' +
        'instructor review, you will see a provisional notice — a human always has the final word. ' +
        'Good luck, and speak with confidence.',
      run: async (page, h) => {
        await h.settle(2000);
        await h.wheel(page, 250, 3);
      }
    }
  ],

  instructor: [
    {
      id: '01-landing',
      narration:
        'SpeakWise gives instructors a complete oral-assessment workflow: course creation, ' +
        'AI-led interviews, transcript evidence, and cohort analytics — all scoped to your institution. ' +
        'Let us walk through it from the instructor side.',
      run: async (page, h) => {
        await h.settle(1500);
        await h.wheel(page, 250, 3);
        await h.wheel(page, -250, 3);
      }
    },
    {
      id: '02-sign-in',
      narration:
        'Choose the Instructor Workspace and sign in. Instructor access is granted server-side ' +
        'by your institution — roles are never self-claimed.',
      run: async (page, h) => {
        await h.moveClick(page, page.getByRole('button', { name: /instructor workspace|^instructor$/i }).first());
        await h.settle(900);
        await h.type(page, page.locator('input[type="email"]').first(), INSTRUCTOR.email);
        await h.type(page, page.locator('input[type="password"]').first(), INSTRUCTOR.password);
        await h.moveClick(page, page.getByRole('button', { name: /^sign in$/i }).first());
        await page.waitForLoadState('networkidle').catch(() => {});
        await h.settle(2000);
      }
    },
    {
      id: '03-dashboard',
      narration:
        'This is your dashboard. At the top, a guidance panel shows what needs your attention — ' +
        'including a live count of submissions flagged for human review. Below it sit your courses, ' +
        'templates, and class analytics.',
      run: async (page, h) => {
        await h.settle(1200);
        await h.wheel(page, 500, 5);
        await h.settle(800);
        await h.wheel(page, -500, 5);
      }
    },
    {
      id: '04-create-course',
      narration:
        'Creating a course takes one form. Name it, set a student passcode and your instructor PIN, ' +
        'and write the examiner brief — or import questions straight from a P D F or Word syllabus. ' +
        'The brief tells the AI examiner what to probe and how deep to go.',
      run: async (page, h) => {
        await h.wheel(page, 700, 6);
        const name = page.getByPlaceholder(/course name/i).first();
        if (await name.count()) {
          await h.type(page, name, 'Cell Biology — Oral Exam 1');
          const instr = page.getByPlaceholder(/your name/i).first();
          if (await instr.count()) await h.type(page, instr, 'Dr. Demo Instructor');
          const pin = page.getByPlaceholder(/instructor pin/i).first();
          if (await pin.count()) await h.type(page, pin, '1234');
          const pass = page.getByPlaceholder(/student passcode/i).first();
          if (await pass.count()) await h.type(page, pass, COURSE_PASSCODE);
          const prompt = page.getByPlaceholder(/system instruction|system prompt/i).first();
          if (await prompt.count()) {
            await h.type(page, prompt,
              'You are an oral examiner for introductory cell biology. Ask the student to explain mitochondrial structure and function, then probe their causal reasoning about cellular respiration.');
          }
        }
        await h.settle(1000);
      }
    },
    {
      id: '05-publish',
      narration:
        'Create the course, and it is instantly live for every student in your institution. ' +
        'You can save any course as a template and redeploy it next term in two clicks.',
      run: async (page, h) => {
        const create = page.getByRole('button', { name: /^create course$/i }).first();
        if (await create.count()) await h.moveClick(page, create);
        await page.waitForLoadState('networkidle').catch(() => {});
        await h.settle(2000);
      }
    },
    {
      id: '06-analytics',
      narration:
        'Class Analytics summarises the cohort: mean, median, and spread, score distributions, ' +
        'and — most importantly — a triage list of submissions flagged for review, with the reasons ' +
        'spelled out. You can export everything as C S V or J SON, stamped with the analysis version ' +
        'for reproducibility.',
      run: async (page, h) => {
        await h.wheel(page, -2200, 8);
        const toggle = page.getByRole('button', { name: /class analytics/i }).first();
        if (await toggle.count()) {
          const expanded = await toggle.getAttribute('aria-expanded').catch(() => null);
          if (expanded === 'false') await h.moveClick(page, toggle);
          else await toggle.scrollIntoViewIfNeeded().catch(() => {});
        }
        await h.settle(1500);
        await h.wheel(page, 500, 5);
      }
    },
    {
      id: '07-submission',
      narration:
        'Open any submission to see the evidence: the full transcript, a rubric radar across four ' +
        'dimensions, reasoning analytics, and response timing. You can annotate specific moments — ' +
        'strengths, concerns, follow-ups — and validate or override the AI score. Your decision is final.',
      run: async (page, h) => {
        const row = page.locator('table tbody tr, [data-submission-card]').first();
        if (await row.count()) {
          await h.moveClick(page, row);
          await h.settle(1500);
          const modal = page.locator('[role="dialog"]').first();
          if (await modal.count()) {
            await modal.evaluate((el) => { el.scrollTop = 500; }).catch(() => {});
            await h.settle(1200);
            await modal.evaluate((el) => { el.scrollTop = 1000; }).catch(() => {});
          }
        }
        await h.settle(1500);
      }
    },
    {
      id: '08-concept-map',
      narration:
        'The concept map turns the spoken interview into a radial argument graph — claims in the centre, ' +
        'evidence and counterpoints around them, coloured by their Toulmin role. Gold rings mark the ' +
        'concepts that actually drove the score, and you can replay the interview turn by turn.',
      run: async (page, h) => {
        // Bring the concept-map controls into view, then exercise them.
        const toulmin = page.getByRole('button', { name: /color:\s*(concept|toulmin)/i }).first();
        if (await toulmin.count()) {
          await toulmin.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});
          await h.settle(1500);
          await h.moveClick(page, toulmin);
          await h.settle(1500);
          const play = page.getByRole('button', { name: /^play$/i }).first();
          if (await play.count()) await h.moveClick(page, play);
        } else {
          const modal = page.locator('[role="dialog"]').first();
          if (await modal.count()) {
            await modal.evaluate((el) => { el.scrollTop = 1400; }).catch(() => {});
          }
        }
        await h.settle(2500);
      }
    },
    {
      id: '09-wrap-up',
      narration:
        'That is the full loop: publish a course, students interview with the AI examiner, and you review ' +
        'evidence — not just numbers — before any grade stands. SpeakWise keeps assessment explainable, ' +
        'auditable, and yours.',
      run: async (page, h) => {
        const close = page.getByRole('button', { name: /close/i }).first();
        if (await close.count()) await h.moveClick(page, close);
        await h.settle(1500);
        await h.wheel(page, -1500, 6);
      }
    }
  ]
};
