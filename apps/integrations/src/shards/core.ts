import { pieceLoaders } from "@pc/integrations/generated/pieces/core"
import { integrationsWorker } from "../worker"

/** smartplane-integrations: developer and collaboration pieces (wrangler.jsonc). */
export default integrationsWorker("core", pieceLoaders)
