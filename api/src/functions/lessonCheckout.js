import { app } from '@azure/functions';
import { z } from 'zod';
import { newCorrelationId } from '../lib/auth.js';
import { contactFailureResponse } from '../lib/httpErrors.js';
import {
  LessonCheckoutValidationError,
  createLessonCheckoutSession,
} from '../lib/lessonCheckout.js';
import { LESSON_PAY_RATE_IDS } from '../lib/lessonPayConfig.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

const checkoutSchema = z.object({
  rateId: z.enum(LESSON_PAY_RATE_IDS),
  email: z.string().trim().max(320).optional().default(''),
  turnstileToken: z.string().trim().min(1),
});

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

/**
 * @param {unknown} err
 * @param {string} correlationId
 */
function checkoutFailure(err, correlationId) {
  const name = err instanceof Error ? err.name : '';
  if (name === 'LessonCheckoutValidationError' || name === 'ZodError') {
    return {
      status: 400,
      jsonBody: {
        error: 'Please check the lesson payment fields and try again.',
        correlationId,
      },
      errorKind: 'validation',
    };
  }
  if (name === 'LessonCheckoutDisabledError') {
    return {
      status: 503,
      jsonBody: {
        error: 'Lesson checkout is not available right now. Please try again later.',
        correlationId,
      },
      errorKind: 'disabled',
    };
  }
  const contact = contactFailureResponse(err, correlationId);
  return {
    status: contact.status,
    jsonBody: contact.jsonBody,
    errorKind: contact.errorKind,
  };
}

app.http('lessonCheckout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'lessonCheckout',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();

    let body;
    try {
      body = await request.json();
    } catch {
      return {
        status: 400,
        headers: jsonHeaders(),
        jsonBody: {
          error: 'Please check the lesson payment fields and try again.',
          correlationId,
        },
      };
    }

    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      const err = new LessonCheckoutValidationError('Invalid checkout payload');
      const failure = checkoutFailure(err, correlationId);
      trackEvent('LessonCheckoutFailed', {
        correlationId,
        errorKind: failure.errorKind,
      });
      await flush();
      return { status: failure.status, headers: jsonHeaders(), jsonBody: failure.jsonBody };
    }

    const remoteIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-azure-clientip') ||
      undefined;

    try {
      await verifyTurnstile(parsed.data.turnstileToken, remoteIp);

      const session = await createLessonCheckoutSession({
        rateId: parsed.data.rateId,
        email: parsed.data.email,
      });

      trackEvent('LessonCheckoutCreated', {
        correlationId,
        rateId: parsed.data.rateId,
      });
      await flush();

      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: {
          url: session.url,
          correlationId,
        },
      };
    } catch (err) {
      const failure = checkoutFailure(err, correlationId);
      if (failure.status >= 500) {
        context.warn('Lesson checkout failed', {
          correlationId,
          errorKind: failure.errorKind,
        });
        trackException(err, {
          correlationId,
          errorKind: failure.errorKind,
        });
      }
      trackEvent('LessonCheckoutFailed', {
        correlationId,
        errorKind: failure.errorKind,
        rateId: parsed.data.rateId,
      });
      await flush();
      return { status: failure.status, headers: jsonHeaders(), jsonBody: failure.jsonBody };
    }
  },
});
