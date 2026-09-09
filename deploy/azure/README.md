# Azure development deployment

The user-selected target is `ca-cm-dev-uks` in `rg-cm-nonprod-uks`, subscription
`5e8bcb62-85d3-4ca9-bc9d-8694bbe65062`. Its public hostname is
`https://dev.cherrymoney.co.uk`. This is a testnet development deployment.

This image adds the extension to an immutable, already deployed Cherry Money
image in the private Azure Container Registry. The complete upstream app,
dependencies and existing assets remain in the base image. The same overlay
function is used by source assembly. The runtime manifest records the exact
base image digest and Stellar commit; it does not claim that the running image
was built from the source-assembly pin in `base.lock.json`.

Build only in the private registry. Neither the image nor its extracted base
files may be published as public GitHub artifacts. The public build context
contains only the independently authored extension.

```bash
STELLAR_SOURCE_SHA=$(git rev-parse HEAD)
CHERRY_MONEY_IMAGE=$(az containerapp show -g rg-cm-nonprod-uks -n ca-cm-dev-uks --query 'properties.template.containers[0].image' -o tsv)
az acr build --registry acrcmnpcm65062 \
  --image "cherry-stellar:dev-${STELLAR_SOURCE_SHA}" \
  --file deploy/azure/Dockerfile \
  --build-arg "CHERRY_MONEY_IMAGE=${CHERRY_MONEY_IMAGE}" \
  --build-arg "STELLAR_SOURCE_SHA=${STELLAR_SOURCE_SHA}" .
```

The runtime starts Apache through the base entrypoint and a Node verifier on
`127.0.0.1:3001`. The verifier runs as `www-data` without the application's
environment secrets. Either service exiting stops the container, allowing Azure
to restart it. Existing CPU, memory, ingress, identity and secret references
are retained. No additional public port or public verifier app is created.

Before promotion, capture the current image, revision and Stellar environment
settings for rollback. Resolve the newly built image to its ACR digest. Run
`php /opt/cherry-stellar/migrate.php` using a one-off execution template from
`caj-cm-dev-migration-uks`, retaining its database/identity/secret configuration
and setting `RUN_LARAVEL_MIGRATIONS=false`. The script checks the development
environment and purchase workflow and runs only the two extension migrations.
Do not run `migrate:fresh`, seed customer data or execute other pending base
migrations. A failed migration prevents application promotion.

Update only the `web` container image and these settings:

```dotenv
CHERRY_STELLAR_ENABLED=true
CHERRY_STELLAR_VERIFIER_URL=http://127.0.0.1:3001
```

Verify the new ready revision, `/health/ready`, existing login, `/stellar`
authentication, the private verifier and a company-scoped invoice flow. Restore
the captured image and Stellar settings if readiness fails. Keep additive
tables during rollback so payment evidence is retained.

This development overlay keeps the framework version already running in dev.
It does not remediate the Laravel 10 base advisories. The Laravel 12 fixture
suite validates the extension separately; the base upgrade and full application
regression tests remain work for the production integration.

The existing Cherry Money release pipelines build its own source tree. They do
not build this overlay, and a later ordinary Cherry Money deployment can replace
it. Use this documented overlay procedure again when intentionally restoring
Cherry Stellar to the selected development app.
