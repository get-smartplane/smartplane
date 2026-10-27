import { Layer } from "effect"
import { AccessPolicy } from "../access/access-policy"
import { GrantsRepo } from "../access/grants-repo"
import { ResourceVisibility } from "../resources/resource-visibility"

/** Real resource visibility (and the gateway's `AccessPolicy`) over the test database; needs `ResourcesRepo` and SQL. */
export const databaseVisibility = ResourceVisibility.layer.pipe(Layer.provideMerge(AccessPolicy.layer), Layer.provide(GrantsRepo.layer))
