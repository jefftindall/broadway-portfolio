/**
 * CIAM user flow desired state (ACCOUNT-P1-008 / P1-009).
 */
import { stableJson } from './contact-ciam-manifest.mjs';

/** Social IdPs only — no EmailPassword / Email OTP (P1-009). */
export const DEFAULT_CONTACT_FLOW_IDPS = ['Google-OAUTH', 'Apple-OAUTH', 'Microsoft-OAuth'];

const EMAIL_VALIDATION_REGEX =
  "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)*$";
const DISPLAY_NAME_VALIDATION_REGEX = '^[a-zA-Z_][0-9a-zA-Z_ ]*[0-9a-zA-Z_]+$';

/**
 * @param {unknown} spec
 */
export function normalizeFlowSpec(spec) {
  const raw = spec && typeof spec === 'object' ? /** @type {Record<string, unknown>} */ (spec) : {};
  const idps = Array.isArray(raw.identityProviders)
    ? raw.identityProviders.map((value) => String(value).trim()).filter(Boolean)
    : DEFAULT_CONTACT_FLOW_IDPS;
  const interactive =
    raw.onInteractiveAuthFlowStart && typeof raw.onInteractiveAuthFlowStart === 'object'
      ? /** @type {Record<string, unknown>} */ (raw.onInteractiveAuthFlowStart)
      : {};
  const attrRoot =
    raw.onAttributeCollection && typeof raw.onAttributeCollection === 'object'
      ? /** @type {Record<string, unknown>} */ (raw.onAttributeCollection)
      : {};
  const email =
    attrRoot.email && typeof attrRoot.email === 'object'
      ? /** @type {Record<string, unknown>} */ (attrRoot.email)
      : {};
  const displayName =
    attrRoot.displayName && typeof attrRoot.displayName === 'object'
      ? /** @type {Record<string, unknown>} */ (attrRoot.displayName)
      : {};

  return {
    onInteractiveAuthFlowStart: {
      isSignUpAllowed: interactive.isSignUpAllowed !== false,
    },
    identityProviders: [...new Set(idps)].sort(),
    onAttributeCollection: {
      email: {
        hidden: email.hidden !== false,
        editable: email.editable === true,
        required: email.required !== false,
      },
      displayName: {
        hidden: displayName.hidden !== false,
        editable: displayName.editable === true,
        required: displayName.required === true,
      },
    },
  };
}

/**
 * @param {ReturnType<typeof normalizeFlowSpec>['onAttributeCollection']} normalizedAttr
 */
function buildOnAttributeCollection(normalizedAttr) {
  return {
    '@odata.type': '#microsoft.graph.onAttributeCollectionExternalUsersSelfServiceSignUp',
    attributes: [
      {
        id: 'email',
        displayName: 'Email Address',
        description: 'Email address of the user',
        userFlowAttributeType: 'builtIn',
        dataType: 'string',
      },
      {
        id: 'displayName',
        displayName: 'Display Name',
        description: 'Display Name of the User.',
        userFlowAttributeType: 'builtIn',
        dataType: 'string',
      },
    ],
    attributeCollectionPage: {
      views: [
        {
          inputs: [
            {
              attribute: 'email',
              label: 'Email Address',
              inputType: 'Text',
              hidden: normalizedAttr.email.hidden,
              editable: normalizedAttr.email.editable,
              writeToDirectory: true,
              required: normalizedAttr.email.required,
              validationRegEx: EMAIL_VALIDATION_REGEX,
              options: [],
            },
            {
              attribute: 'displayName',
              label: 'Display Name',
              inputType: 'Text',
              hidden: normalizedAttr.displayName.hidden,
              editable: normalizedAttr.displayName.editable,
              writeToDirectory: true,
              required: normalizedAttr.displayName.required,
              validationRegEx: DISPLAY_NAME_VALIDATION_REGEX,
              options: [],
            },
          ],
        },
      ],
    },
  };
}

/**
 * @param {string} displayName
 * @param {string} applicationClientId
 * @param {unknown} spec
 * @returns {Record<string, unknown>}
 */
export function buildUserFlowRequestBody(displayName, applicationClientId, spec) {
  const normalized = normalizeFlowSpec(spec);
  return {
    '@odata.type': '#microsoft.graph.externalUsersSelfServiceSignUpEventsFlow',
    displayName: displayName.trim(),
    conditions: {
      applications: {
        includeApplications: [{ appId: applicationClientId.trim() }],
      },
    },
    onInteractiveAuthFlowStart: {
      '@odata.type': '#microsoft.graph.onInteractiveAuthFlowStartExternalUsersSelfServiceSignUp',
      isSignUpAllowed: normalized.onInteractiveAuthFlowStart.isSignUpAllowed,
    },
    onAuthenticationMethodLoadStart: {
      '@odata.type': '#microsoft.graph.onAuthenticationMethodLoadStartExternalUsersSelfServiceSignUp',
      identityProviders: normalized.identityProviders.map((id) => ({ id })),
    },
    onAttributeCollection: buildOnAttributeCollection(normalized.onAttributeCollection),
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} input
 */
function attributeInputState(input) {
  if (!input || typeof input !== 'object') return null;
  return {
    hidden: /** @type {Record<string, unknown>} */ (input).hidden === true,
    editable: /** @type {Record<string, unknown>} */ (input).editable === true,
    required: /** @type {Record<string, unknown>} */ (input).required === true,
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} remoteFlow
 * @returns {string}
 */
export function userFlowRemoteFingerprint(remoteFlow) {
  if (!remoteFlow) return stableJson({});

  const idps = (
    /** @type {Array<{ id?: string }>} */ (
      /** @type {Record<string, unknown>} */ (remoteFlow.onAuthenticationMethodLoadStart ?? {})
        .identityProviders
    ) ?? []
  )
    .map((provider) => String(provider.id ?? '').trim())
    .filter(Boolean)
    .sort();

  const apps = (
    /** @type {Array<{ appId?: string }>} */ (
      /** @type {Record<string, unknown>} */ (
        /** @type {Record<string, unknown>} */ (remoteFlow.conditions ?? {}).applications ?? {}
      ).includeApplications
    ) ?? []
  )
    .map((app) => String(app.appId ?? '').trim())
    .filter(Boolean)
    .sort();

  const views = /** @type {Array<{ inputs?: Record<string, unknown>[] }>} */ (
    /** @type {Record<string, unknown>} */ (
      /** @type {Record<string, unknown>} */ (remoteFlow.onAttributeCollection ?? {})
        .attributeCollectionPage ?? {}
    ).views
  );
  const inputs = views?.[0]?.inputs ?? [];
  /** @type {Record<string, Record<string, unknown>>} */
  const byAttribute = {};
  for (const input of inputs) {
    if (input?.attribute) byAttribute[String(input.attribute)] = input;
  }

  return stableJson({
    displayName: String(remoteFlow.displayName ?? '').trim(),
    isSignUpAllowed:
      /** @type {Record<string, unknown>} */ (remoteFlow.onInteractiveAuthFlowStart ?? {}).isSignUpAllowed !==
      false,
    identityProviders: idps,
    applicationIds: apps,
    email: attributeInputState(byAttribute.email),
    displayNameAttr: attributeInputState(byAttribute.displayName),
  });
}

/**
 * @param {string} displayName
 * @param {string} applicationClientId
 * @param {unknown} spec
 * @returns {string}
 */
export function userFlowDesiredFingerprint(displayName, applicationClientId, spec) {
  const normalized = normalizeFlowSpec(spec);
  return stableJson({
    displayName: displayName.trim(),
    isSignUpAllowed: normalized.onInteractiveAuthFlowStart.isSignUpAllowed,
    identityProviders: normalized.identityProviders,
    applicationIds: [applicationClientId.trim()].sort(),
    email: normalized.onAttributeCollection.email,
    displayNameAttr: normalized.onAttributeCollection.displayName,
  });
}
