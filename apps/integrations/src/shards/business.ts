import { pieceLoaders } from "@pc/integrations/generated/pieces/business"
import { integrationsWorker } from "../worker"

/** smartplane-integrations-business: Microsoft 365, ERP and CRM pieces (wrangler.business.jsonc). */
export default integrationsWorker("business", pieceLoaders)
