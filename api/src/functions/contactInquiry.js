import { app } from '@azure/functions';
import { z } from 'zod';
import { newCorrelationId } from '../lib/auth.js';
import { contactFailureResponse } from '../lib/httpErrors.js';
import { sendInquiryEmail, sendInquirySms } from '../lib/acsNotify.js';
import { tryContactsStoreFromEnv } from '../lib/contacts.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

const inquirySchema = z
  .object({
    type: z.enum(['casting', 'lesson']),
    name: z.string().trim().min(1).max(200),
    // Public forms default to email; phone preference remains accepted for older clients.
    preferredContact: z.enum(['email', 'phone']).default('email'),
    email: z.string().trim().max(320).optional().default(''),
    phone: z.string().trim().max(40).optional().default(''),
    organization: z.string().trim().max(200).optional().default(''),
    format: z.enum(['nyc', 'zoom']).optional(),
    message: z.string().trim().min(1).max(5000),
    turnstileToken: z.string().trim().min(1),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'lesson' && !data.format) {
      ctx.addIssue({
        code: 'custom',
        path: ['format'],
        message: 'format is required for lesson inquiries',
      });
    }

    if (data.preferredContact === 'email') {
      const emailResult = z.string().email().safeParse(data.email);
      if (!emailResult.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['email'],
          message: 'email is required when preferred contact is email',
        });
      }
    } else if (!data.phone || data.phone.length < 7) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'phone is required when preferred contact is phone',
      });
    }

    // If a non-preferred email is provided, it must still be valid.
    if (data.preferredContact === 'phone' && data.email) {
      const emailResult = z.string().email().safeParse(data.email);
      if (!emailResult.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['email'],
          message: 'email must be valid when provided',
        });
      }
    }
  });

app.http('contactInquiry', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'contactInquiry',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();

    let body;
    try {
      body = await request.json();
    } catch {
      return {
        status: 400,
        jsonBody: {
          error: 'Please check the form fields and try again.',
          correlationId,
        },
      };
    }

    const parsed = inquirySchema.safeParse(body);
    if (!parsed.success) {
      const err = new Error('Invalid inquiry payload');
      err.name = 'ContactValidationError';
      const failure = contactFailureResponse(err, correlationId);
      trackEvent('ContactInquiryFailed', {
        correlationId,
        errorKind: failure.errorKind,
        type: String(body?.type || ''),
      });
      await flush();
      return { status: failure.status, jsonBody: failure.jsonBody };
    }

    const inquiry = parsed.data;
    const remoteIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-azure-clientip') ||
      undefined;

    try {
      await verifyTurnstile(inquiry.turnstileToken, remoteIp);

      await sendInquiryEmail({
        type: inquiry.type,
        name: inquiry.name,
        preferredContact: inquiry.preferredContact,
        email: inquiry.email || undefined,
        phone: inquiry.phone || undefined,
        organization: inquiry.organization || undefined,
        format: inquiry.format,
        message: inquiry.message,
        correlationId,
      });

      let smsSent = false;
      try {
        smsSent = await sendInquirySms({
          type: inquiry.type,
          name: inquiry.name,
        });
      } catch (smsErr) {
        // Email already delivered — log SMS failure but still succeed for the visitor.
        context.warn('Contact inquiry SMS failed after email', {
          correlationId,
          message: smsErr instanceof Error ? smsErr.message : String(smsErr),
        });
        trackException(smsErr, {
          operation: 'contactInquirySms',
          correlationId,
          type: inquiry.type,
        });
      }

      let crmIngested = false;
      try {
        const store = tryContactsStoreFromEnv();
        if (store) {
          await store.upsertFromInquiry({
            type: inquiry.type,
            name: inquiry.name,
            email: inquiry.email || undefined,
            phone: inquiry.phone || undefined,
            organization: inquiry.organization || undefined,
            format: inquiry.format,
            message: inquiry.message,
          });
          crmIngested = true;
        }
      } catch (crmErr) {
        context.warn('Contact inquiry CRM ingest failed after notify', {
          correlationId,
          type: inquiry.type,
          errorKind: crmErr instanceof Error ? crmErr.name : 'error',
        });
        trackException(crmErr, {
          operation: 'contactInquiryCrm',
          correlationId,
          type: inquiry.type,
        });
      }

      trackEvent('ContactInquiryReceived', {
        correlationId,
        type: inquiry.type,
        preferredContact: inquiry.preferredContact,
        smsSent: String(smsSent),
        crmIngested: String(crmIngested),
      });
      await flush();

      return {
        status: 200,
        jsonBody: {
          ok: true,
          correlationId,
        },
      };
    } catch (err) {
      const failure = contactFailureResponse(err, correlationId);
      context.error('Contact inquiry failed', {
        correlationId,
        errorKind: failure.errorKind,
        type: inquiry.type,
        message: err instanceof Error ? err.message : String(err),
      });
      trackEvent('ContactInquiryFailed', {
        correlationId,
        errorKind: failure.errorKind,
        type: inquiry.type,
      });
      trackException(err, {
        operation: 'contactInquiry',
        correlationId,
        errorKind: failure.errorKind,
        type: inquiry.type,
      });
      await flush();
      return { status: failure.status, jsonBody: failure.jsonBody };
    }
  },
});
