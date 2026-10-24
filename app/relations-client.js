/* Shared relations contract bridge for the classic Passport scripts. */
import * as contract from './relations-contract.js'
import * as feedback from './feedback-contract.js'

window.SPIDRelations = Object.freeze({ contract, feedback })
