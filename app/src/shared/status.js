/**
 * PASSPORT — Sovereign Identity System
 * shared/status.js
 *
 * Status transition rules and display helpers.
 * Import alongside models.js wherever status logic is needed.
 */

import { STATUS, STATUS_WEIGHT } from './models.js'

/**
 * Valid status transitions.
 * Key: current status. Value: statuses it can move TO.
 * Only node admins (APPROVED + ISSUER) can perform transitions.
 */
export const STATUS_TRANSITIONS = {
  [STATUS.UNKNOWN]:   [STATUS.INVITED, STATUS.TEMPORARY],
  [STATUS.INVITED]:   [STATUS.CANDIDATE, STATUS.APPROVED, STATUS.REVOKED],
  [STATUS.TEMPORARY]: [STATUS.INVITED, STATUS.CANDIDATE, STATUS.UNKNOWN],
  [STATUS.CANDIDATE]: [STATUS.APPROVED, STATUS.SUSPENDED, STATUS.REVOKED],
  [STATUS.APPROVED]:  [STATUS.SUSPENDED, STATUS.REVOKED],
  [STATUS.SUSPENDED]: [STATUS.APPROVED, STATUS.REVOKED],
  [STATUS.REVOKED]:   [],   // terminal — no transitions out
}

/**
 * Can a member transition from `from` to `to`?
 * @param {string} from - current STATUS
 * @param {string} to   - desired STATUS
 * @returns {boolean}
 */
export function isValidTransition(from, to) {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Get the weight of a status.
 * Used for referral weight calculation.
 * @param {string} status
 * @returns {number}
 */
export function getWeight(status) {
  return STATUS_WEIGHT[status] ?? 0
}

/**
 * Is this status considered active (can participate)?
 * @param {string} status
 * @returns {boolean}
 */
export function isActive(status) {
  return [STATUS.APPROVED, STATUS.CANDIDATE, STATUS.TEMPORARY].includes(status)
}

/**
 * Is this status considered blocked?
 * @param {string} status
 * @returns {boolean}
 */
export function isBlocked(status) {
  return [STATUS.SUSPENDED, STATUS.REVOKED].includes(status)
}

/**
 * Resolve a display name for a status, using node's custom names or defaults.
 * @param {string}       status
 * @param {DisplayNames} [displayNames]  - node's custom naming (optional)
 * @param {Object}       defaults        - DEFAULT_DISPLAY_NAMES
 * @returns {string}
 */
export function displayStatus(status, displayNames, defaults) {
  const map = {
    [STATUS.UNKNOWN]:   'unknown',
    [STATUS.INVITED]:   'invited',
    [STATUS.TEMPORARY]: 'temporary',
    [STATUS.CANDIDATE]: 'candidate',
    [STATUS.APPROVED]:  'approved',
    [STATUS.SUSPENDED]: 'suspended',
    [STATUS.REVOKED]:   'revoked',
  }
  const key = map[status]
  return displayNames?.[key] ?? defaults?.[key] ?? status
}
