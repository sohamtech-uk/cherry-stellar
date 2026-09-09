<?php

// Development-only, additive extension migrations. Never run the base's pending migrations here.
chdir('/var/www/html');
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

if (!in_array($app->environment(), ['development', 'staging'], true)
    || parse_url(config('app.url'), PHP_URL_HOST) !== 'dev.cherrymoney.co.uk') {
    fwrite(STDERR, "Refusing migration outside the selected Cherry Money development environment.\n");
    exit(1);
}
foreach (['company', 'users', 'purchase_invoice', 'purchase_invoice_approval_events'] as $table) {
    if (!Illuminate\Support\Facades\Schema::hasTable($table)) {
        fwrite(STDERR, "Required Cherry Money purchase workflow is not installed.\n");
        exit(1);
    }
}
$status = $kernel->call('migrate', [
    '--path' => [
        'database/migrations/2026_09_09_100000_create_cherry_stellar_invoices.php',
        'database/migrations/2026_09_09_110000_link_stellar_purchase_invoice.php',
    ],
    '--force' => true,
    '--no-interaction' => true,
]);
echo $kernel->output();
if ($status !== 0 || !Illuminate\Support\Facades\Schema::hasColumn('cherry_stellar_invoices', 'purchase_invoice_id')) {
    fwrite(STDERR, "Stellar extension schema verification failed.\n");
    exit(1);
}
echo "STELLAR_DEVELOPMENT_SCHEMA_READY\n";
