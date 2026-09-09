# Build only in the private Azure registry: CHERRY_MONEY_IMAGE contains private code.
ARG CHERRY_MONEY_IMAGE
FROM ${CHERRY_MONEY_IMAGE} AS cherry_money

FROM node:22-bookworm-slim AS extension
WORKDIR /extension
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev
COPY scripts/apply-extension.mjs scripts/apply-extension.mjs
COPY deploy/azure/apply.mjs deploy/azure/apply.mjs
COPY base.lock.json ./
COPY public/ public/
COPY extensions/cherrymoney/src/ extensions/cherrymoney/src/
COPY extensions/cherrymoney/migrations/ extensions/cherrymoney/migrations/
COPY extensions/cherrymoney/config.php extensions/cherrymoney/adapter.js extensions/cherrymoney/
COPY --from=cherry_money /var/www/html/bootstrap/app.php /overlay/bootstrap/app.php
COPY --from=cherry_money /var/www/html/resources/views/layout/menu.blade.php /overlay/resources/views/layout/menu.blade.php
ARG CHERRY_MONEY_IMAGE
ARG STELLAR_SOURCE_SHA
RUN node deploy/azure/apply.mjs

FROM cherry_money AS runtime
ARG CHERRY_MONEY_IMAGE
ARG STELLAR_SOURCE_SHA
LABEL org.opencontainers.image.source="https://github.com/sohamtech-uk/cherry-stellar" \
      org.opencontainers.image.revision="${STELLAR_SOURCE_SHA}" \
      org.opencontainers.image.base.name="${CHERRY_MONEY_IMAGE}"
COPY --from=extension /usr/local/bin/node /usr/local/bin/node
COPY --from=extension --chown=www-data:www-data /overlay/ /var/www/html/
COPY --from=extension /extension/node_modules/ /opt/cherry-stellar/node_modules/
COPY package.json domain.mjs hosted.mjs /opt/cherry-stellar/
COPY scripts/verifier.mjs /opt/cherry-stellar/scripts/verifier.mjs
COPY deploy/azure/start.sh /usr/local/bin/cherry-stellar-start
COPY deploy/azure/migrate.php /opt/cherry-stellar/migrate.php
WORKDIR /var/www/html
RUN chmod 755 /usr/local/bin/cherry-stellar-start \
    && chmod -R a+rX /opt/cherry-stellar \
    && command -v runuser \
    && command -v cherrybank-entrypoint \
    && runuser -u www-data -- node --check /opt/cherry-stellar/scripts/verifier.mjs \
    && php -l /opt/cherry-stellar/migrate.php \
    && php -r 'require "vendor/autoload.php"; if (!class_exists("App\\CherryStellar\\StellarController")) exit(1);' \
    && APP_ENV=testing CACHE_DRIVER=array LOG_CHANNEL=stderr php artisan route:list --path=stellar --json
ENTRYPOINT ["cherry-stellar-start"]
CMD ["apache2-foreground"]
