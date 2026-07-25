import { enforceCustomerAge } from "../_shared/age-gate-middleware.js";
export async function onRequest(context) { return enforceCustomerAge(context); }
