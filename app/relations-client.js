/* Shared relations contract bridge for the classic Passport scripts. */
import * as contract from './relations-contract.js?v=2'
import * as feedback from './feedback-contract.js?v=2'

window.SPIDRelations = Object.freeze({ contract, feedback })
